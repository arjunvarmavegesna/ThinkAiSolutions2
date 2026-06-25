/**
 * Meta WhatsApp Cloud API inbound + status webhook router (the ACTIVE webhook path).
 *
 * Mounted with rawBodyParser at '/api/webhooks/meta' BEFORE express.json(), so on POST
 * `req.body` is the exact raw Buffer Meta delivered — required to verify the signature.
 *
 * GET  '/' — Meta verification handshake. When hub.mode==='subscribe' and hub.verify_token
 *            matches META_WEBHOOK_VERIFY_TOKEN, echo hub.challenge back verbatim (200);
 *            otherwise 403. (Query-param based; no body involved.)
 *
 * POST '/' — for every callback:
 *   1. AUTHENTICITY — recompute X-Hub-Signature-256 = 'sha256='+HMAC-SHA256(rawBody, APP_SECRET)
 *      and constant-time compare BEFORE parsing. On mismatch reply 401 and persist nothing.
 *      (This lives HERE, not in BspProvider.verifyWebhook, which is echoed-header-shaped for
 *      Pinnacle and does not fit Meta's signed-payload + GET-challenge model.)
 *   2. PARSE — getBspProvider('metaCloud').parseWebhook normalizes the (batched) Meta envelope.
 *   3. ROUTE — each item carries the Meta phone_number_id; reverse-look up the owning
 *      tenant + WABA (collectionGroup query) and dispatch inbound -> ingestInbound,
 *      status -> applyStatusUpdate.
 *   4. ACK FAST — return 200 for any verified+parsed payload. Per-item persistence errors are
 *      logged and SWALLOWED: a non-200 would make Meta retry the whole batch into a loop.
 *
 * Idempotency: downstream writes are keyed by the Meta wamid (ingestInbound) or matched by
 * bspMessageId with monotonic status advance (applyStatusUpdate), so redelivery is safe.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { Router } from 'express';
import type { Request, Response } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import { logger } from '../../lib/logger';
import { config } from '../../config/env';
import {
  getBspProvider,
  resolveBspContextByWaba,
  resolveWabaByPhoneNumberId,
  resolveWabaByWabaId,
} from '../../services/bsp';
import { ingestInbound } from '../../services/messages/ingestInbound';
import { applyStatusUpdate } from '../../services/messages/applyStatusUpdate';
import { applyTemplateStatusUpdate } from '../../services/templates/applyTemplateStatusUpdate';
import { applyQualityUpdate } from '../../services/quality/applyQualityUpdate';
import {
  prepareIncomingMessage,
  prepareMessageStatus,
  prepareTemplateStatus,
} from '../../services/webhooks/eventPayload';
import { enqueueWebhookDelivery, loadConfigCached } from '../../services/webhooks/enqueueDelivery';
import type { WebhookConfigCache } from '../../services/webhooks/enqueueDelivery';
import type {
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
  NormalizedTemplateStatusUpdate,
} from '../../services/bsp/types';

export const metaWebhookRouter = Router();

/** Read a query param as a single string (Express query values may be arrays/objects). */
function queryString(req: Request, key: string): string | undefined {
  const v = req.query[key];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

/**
 * Verify Meta's X-Hub-Signature-256 over the RAW body.
 * Header form: 'sha256=<hex>' where hex = HMAC-SHA256(rawBody, META_APP_SECRET). Compared in
 * constant time. Fail-closed if the App Secret or header is missing/misformed.
 */
function verifyMetaSignature(rawBody: Buffer, headerValue: string | undefined): boolean {
  const secret = config.meta.appSecret;
  if (!secret) {
    logger.error('Meta App Secret is not configured; rejecting webhook callback');
    return false;
  }
  if (!headerValue || !headerValue.startsWith('sha256=')) return false;

  const provided = headerValue.slice('sha256='.length);
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * GET handshake. Meta calls this once when you set/verify the callback URL; we echo the
 * challenge only when the verify token matches ours.
 */
metaWebhookRouter.get('/', (req: Request, res: Response): void => {
  const mode = queryString(req, 'hub.mode');
  const token = queryString(req, 'hub.verify_token');
  const challenge = queryString(req, 'hub.challenge');

  if (mode === 'subscribe' && token && token === config.meta.webhookVerifyToken) {
    logger.info('Meta webhook: verification handshake succeeded');
    res.status(200).type('text/plain').send(challenge ?? '');
    return;
  }
  logger.warn('Meta webhook: verification handshake failed (bad mode/token)');
  res.sendStatus(403);
});

/**
 * Per-request cache of phone_number_id -> tenant/WABA lookups (a batched callback often
 * repeats the same phone_number_id). `null` records a confirmed "no WABA matches".
 */
type WabaLink = { tenantId: string; wabaDocId: string } | null;

async function resolveCached(
  cache: Map<string, WabaLink>,
  phoneNumberId: string | undefined,
): Promise<WabaLink> {
  const key = phoneNumberId ?? '';
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }
  const link = await resolveWabaByPhoneNumberId(phoneNumberId);
  cache.set(key, link);
  return link;
}

/**
 * Best-effort read-receipt + typing indicator for an inbound message. Fired (never awaited) from
 * the inbound hot path so the sender sees ✓✓-read and "typing…" within milliseconds while the
 * tenant's bot composes its reply — making the unavoidable ~Meta round-trip feel responsive.
 *
 * Disadvantage guards:
 *  - Gated on the tenant having a webhook ENABLED, so we never show a misleading "typing…" for a
 *    number with no bot wired to answer (and reuse the per-request config cache → no extra DB read).
 *  - Resolves the message's OWN WABA, so multi-WABA tenants type from the correct number.
 *  - Skips when bspMessageId is absent or the provider lacks the capability.
 *  - Swallows every error at debug level: a deregistered number / invalid token can never disturb
 *    ingestion, the client forward, the 200 to Meta, or spam the logs.
 */
async function signalTyping(
  tenantId: string,
  wabaDocId: string,
  cfgCache: WebhookConfigCache,
  msg: NormalizedInboundMessage,
): Promise<void> {
  try {
    if (!msg.bspMessageId) return;
    const cfg = await loadConfigCached(cfgCache, tenantId);
    if (!cfg || !cfg.enabled) return; // no bot will reply -> don't fake a typing bubble
    const { ctx, provider: providerName } = await resolveBspContextByWaba(tenantId, wabaDocId);
    const provider = getBspProvider(providerName);
    if (!provider.markReadAndType) return; // provider doesn't support it (non-metaCloud)
    await provider.markReadAndType(ctx, { messageId: msg.bspMessageId });
  } catch (err) {
    logger.debug(
      { err: (err as Error)?.message, tenantId },
      'inbound typing indicator skipped (best-effort)',
    );
  }
}

/** Persist one inbound message; errors propagate to the caller's allSettled (never abort the batch). */
async function handleInbound(
  cache: Map<string, WabaLink>,
  cfgCache: WebhookConfigCache,
  msg: NormalizedInboundMessage,
): Promise<void> {
  const link = await resolveCached(cache, msg.phoneNumberId);
  if (!link) return; // unknown phone_number_id (already logged by the resolver).
  // ADDITIVE perceived-latency: as soon as we know a bot will reply, show read + "typing…".
  // Fire-and-forget (never awaited) so it runs concurrently with — and never delays — ingest,
  // the client forward, or our 200 to Meta. All failures are swallowed inside signalTyping.
  void signalTyping(link.tenantId, link.wabaDocId, cfgCache, msg);
  await ingestInbound(link.tenantId, link.wabaDocId, msg);
  // ADDITIVE: durably enqueue a client-webhook forward (best-effort; never throws/blocks the 200).
  await enqueueWebhookDelivery(link.tenantId, prepareIncomingMessage(msg), cfgCache);
}

/** Persist one status update; same swallow-on-error contract as handleInbound. */
async function handleStatus(
  cache: Map<string, WabaLink>,
  cfgCache: WebhookConfigCache,
  upd: NormalizedStatusUpdate,
): Promise<void> {
  const link = await resolveCached(cache, upd.phoneNumberId);
  if (!link) return;
  await applyStatusUpdate(link.tenantId, upd);
  // ADDITIVE: forward the status event to the tenant's webhook (best-effort).
  await enqueueWebhookDelivery(link.tenantId, prepareMessageStatus(upd), cfgCache);
}

/**
 * Apply a template-status update (UNCHANGED behavior), then ADDITIVELY forward it. The template
 * event routes by WABA id, so we reverse-map it to a tenant for the forward; the apply step keeps
 * its own internal resolution.
 */
async function handleTemplateStatus(
  cfgCache: WebhookConfigCache,
  upd: NormalizedTemplateStatusUpdate,
): Promise<void> {
  await applyTemplateStatusUpdate(upd);
  const link = await resolveWabaByWabaId(upd.wabaId);
  if (!link) return;
  await enqueueWebhookDelivery(link.tenantId, prepareTemplateStatus(upd), cfgCache);
}

metaWebhookRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : '', 'utf8');

    // 1. AUTHENTICITY — reject before trusting anything in the payload.
    if (!verifyMetaSignature(rawBody, req.header('x-hub-signature-256'))) {
      logger.warn('Meta webhook: signature verification failed, rejecting');
      res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid webhook signature' } });
      return;
    }

    // 2. PARSE — explicit provider (do NOT rely on the global default).
    const { inbound, statuses, templateStatuses, qualityUpdates } =
      getBspProvider('metaCloud').parseWebhook(rawBody);

    // 3. + 4. ROUTE + ACK FAST. Items processed independently; one failure never aborts the
    // batch nor changes the 200 (a non-200 makes Meta retry the whole batch into a loop).
    // Template-status + quality events route by WABA id / phone_number_id, so they bypass the cache.
    // cfgCache memoizes each tenant's webhookConfig so client-forward enqueues add at most one read
    // per tenant per batch (and NO write for tenants without webhooks configured).
    const cache = new Map<string, WabaLink>();
    const cfgCache: WebhookConfigCache = new Map();
    const results = await Promise.allSettled([
      ...inbound.map((msg) => handleInbound(cache, cfgCache, msg)),
      ...statuses.map((upd) => handleStatus(cache, cfgCache, upd)),
      ...templateStatuses.map((upd) => handleTemplateStatus(cfgCache, upd)),
      ...qualityUpdates.map((upd) => applyQualityUpdate(upd)),
    ]);

    const failures = results.filter((r) => r.status === 'rejected');
    for (const f of failures) {
      if (f.status === 'rejected') {
        logger.error(
          { err: f.reason },
          'Meta webhook: failed to persist an item (swallowed to avoid retry loop)',
        );
      }
    }

    logger.info(
      {
        inbound: inbound.length,
        statuses: statuses.length,
        templateStatuses: templateStatuses.length,
        qualityUpdates: qualityUpdates.length,
        failed: failures.length,
      },
      'Meta webhook processed',
    );

    res.status(200).json({ received: true });
  }),
);
