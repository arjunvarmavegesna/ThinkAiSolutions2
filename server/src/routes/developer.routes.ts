/**
 * Developer Hub routes (mounted at /api/developer). Tenant-admin only — this configures how a
 * tenant's own integrations receive our platform events.
 *
 *   GET  /webhook              -> GetWebhookConfigResponse   (current config; never the secret)
 *   PUT  /webhook              -> UpdateWebhookConfigResponse (set URL + event types + enabled)
 *   POST /webhook/secret       -> RotateWebhookSecretResponse (generate/rotate; secret shown ONCE)
 *   GET  /webhook/deliveries   -> ListWebhookDeliveriesResponse (recent delivery log, paginated)
 *
 * Tenant resolution: requireRole('tenant_admin') then requireTenant puts the caller's own tenant
 * on res.locals.tenantId. Tenants never pass a tenantId in the body.
 */

import { Router } from 'express';

import type {
  CreateApiKeyResponse,
  GetWebhookConfigResponse,
  ListApiKeysResponse,
  ListWebhookDeliveriesResponse,
  RotateWebhookSecretResponse,
  UpdateWebhookConfigResponse,
  WebhookDeliveryStatus,
  WebhookDeliveryDTO,
  WebhookEventEnvelope,
  WebhookEventType,
} from '@thinkai/shared';
import type { WebhookDelivery as PWebhookDelivery } from '@prisma/client';

import { prisma } from '../config/db';
import { msNum } from '../db/serde';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireRole, requireTenant } from '../middleware/guards';
import { parseOrThrow } from '../validation/adminSchemas';
import { updateWebhookConfigSchema } from '../validation/developerSchemas';
import { createApiKeySchema } from '../validation/apiKeySchemas';
import {
  getWebhookConfig,
  rotateSigningSecret,
  toPublicConfig,
  upsertWebhookConfig,
} from '../services/webhooks/webhookConfigService';
import { generateApiKey, listApiKeys, revokeApiKey } from '../services/apiKeys/apiKeyService';

export const developerRouter = Router();

/** Default + max page sizes for the delivery log. */
const DEFAULT_LOG_LIMIT = 30;
const MAX_LOG_LIMIT = 100;

function normalizeLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LOG_LIMIT;
  const floored = Math.floor(n);
  if (floored < 1) return DEFAULT_LOG_LIMIT;
  return Math.min(floored, MAX_LOG_LIMIT);
}

/** Convert a Prisma webhook_deliveries row into the client-facing DTO (number timestamps). */
function toDeliveryDTO(row: PWebhookDelivery): WebhookDeliveryDTO {
  return {
    id: row.id,
    eventType: row.eventType as WebhookEventType,
    eventId: row.eventId,
    payload: row.payload as unknown as WebhookEventEnvelope,
    callbackUrl: row.callbackUrl,
    status: row.status as WebhookDeliveryStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    ...(row.lastStatusCode !== null ? { lastStatusCode: row.lastStatusCode } : {}),
    ...(row.lastError !== null ? { lastError: row.lastError } : {}),
    nextAttemptAt: msNum(row.nextAttemptAt) as number,
    createdAt: msNum(row.createdAt) as number,
    updatedAt: msNum(row.updatedAt) as number,
    ...(row.deliveredAt !== null ? { deliveredAt: msNum(row.deliveredAt) as number } : {}),
  };
}

// Developer Hub is tenant-admin only (sensitive config); agents are excluded.
developerRouter.use(verifyAuth, requireRole('tenant_admin'), requireTenant);

/** GET /webhook — the tenant's current webhook config (without the signing secret). */
developerRouter.get(
  '/webhook',
  asyncHandler(async (_req, res) => {
    const tenantId = res.locals.tenantId as string;
    const cfg = await getWebhookConfig(tenantId);
    const body: GetWebhookConfigResponse = { config: cfg ? toPublicConfig(cfg) : null };
    res.json(body);
  }),
);

/** PUT /webhook — set the callback URL, subscribed event types, and enabled flag. */
developerRouter.put(
  '/webhook',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(updateWebhookConfigSchema, req.body);
    const cfg = await upsertWebhookConfig(tenantId, input);
    const body: UpdateWebhookConfigResponse = { config: toPublicConfig(cfg) };
    res.json(body);
  }),
);

/** POST /webhook/secret — generate or rotate the HMAC signing secret. Returned exactly once. */
developerRouter.post(
  '/webhook/secret',
  asyncHandler(async (_req, res) => {
    const tenantId = res.locals.tenantId as string;
    const { signingSecret, secretLast4 } = await rotateSigningSecret(tenantId);
    const body: RotateWebhookSecretResponse = { signingSecret, secretLast4 };
    res.json(body);
  }),
);

/**
 * GET /webhook/deliveries — recent delivery attempts, newest first. Cursor is the last doc id.
 * This is the client-facing debugging log (event, URL, status code, success/fail, timestamps).
 */
developerRouter.get(
  '/webhook/deliveries',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const limit = normalizeLimit(req.query.limit);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const rows = await prisma.webhookDelivery.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { tenantId_id: { tenantId, id: cursor } }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    const items: WebhookDeliveryDTO[] = page.map(toDeliveryDTO);
    const nextCursor = hasMore ? page[page.length - 1].id : undefined;
    const body: ListWebhookDeliveriesResponse = nextCursor ? { items, nextCursor } : { items };
    res.json(body);
  }),
);

// ---- API keys (client-facing /api/v1 credentials) ----

/** GET /api-keys — the tenant's keys (masked, never the secret), newest first. */
developerRouter.get(
  '/api-keys',
  asyncHandler(async (_req, res) => {
    const tenantId = res.locals.tenantId as string;
    const body: ListApiKeysResponse = { keys: await listApiKeys(tenantId) };
    res.json(body);
  }),
);

/** POST /api-keys — create a key; the full secret is returned ONCE in the response. */
developerRouter.post(
  '/api-keys',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const uid = req.auth?.uid;
    if (!uid) throw AppError.unauthorized();
    const input = parseOrThrow(createApiKeySchema, req.body);
    const body: CreateApiKeyResponse = await generateApiKey(tenantId, {
      name: input.name,
      scopes: input.scopes,
      createdBy: uid,
    });
    res.status(201).json(body);
  }),
);

/** DELETE /api-keys/:id — revoke a key (idempotent). */
developerRouter.delete(
  '/api-keys/:id',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    await revokeApiKey(tenantId, req.params.id);
    res.status(204).end();
  }),
);
