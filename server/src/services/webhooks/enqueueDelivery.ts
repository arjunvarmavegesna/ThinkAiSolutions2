/**
 * Durably enqueue a prepared event for client-webhook delivery — the ONLY thing the Meta webhook
 * hot path does for forwarding. It is a single fast Firestore write; the slow HTTP POST happens
 * later in the delivery worker, so a tenant's callback URL can never delay our 200 to Meta.
 *
 * Best-effort by contract: every failure (including the ALREADY_EXISTS we expect on a Meta
 * redelivery, thanks to the deterministic doc id) is swallowed and logged, so a forwarding hiccup
 * never affects how we store Meta's event or the 200 we return.
 *
 * A per-request config cache avoids re-reading webhookConfig/{tenantId} for every event in a
 * batched callback. Tenants without webhooks configured incur one cached read and NO write.
 */

import type { WebhookConfig } from '@thinkai/shared';
import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';
import { WEBHOOK_MAX_ATTEMPTS } from './constants';
import type { PreparedDelivery } from './eventPayload';
import { kickDelivery } from './webhookDeliveryWorker';
import { getWebhookConfig } from './webhookConfigService';

/**
 * Per-request memo of webhookConfig lookups (resolves to null = confirmed "no config").
 * The IN-FLIGHT promise is cached (not just the resolved value) so concurrent callers within one
 * Meta batch — the inbound forward, the typing-indicator gate, status forwards — share a SINGLE
 * config read instead of racing into duplicate reads.
 */
export type WebhookConfigCache = Map<string, Promise<WebhookConfig | null>>;

/** Read a tenant's webhook config once per request, memoizing the in-flight promise. */
export function loadConfigCached(
  cache: WebhookConfigCache,
  tenantId: string,
): Promise<WebhookConfig | null> {
  const cached = cache.get(tenantId);
  if (cached) return cached;
  // Cache the promise immediately so a concurrent caller reuses it; a failed read resolves to
  // null (same "treat as no config" semantics as before) rather than rejecting.
  const pending = getWebhookConfig(tenantId).catch((err) => {
    logger.warn({ tenantId, err: (err as Error)?.message }, 'webhook enqueue: config read failed');
    return null;
  });
  cache.set(tenantId, pending);
  return pending;
}

/**
 * Enqueue one prepared delivery if the tenant is configured + enabled + subscribed to the event
 * type. Never throws.
 */
export async function enqueueWebhookDelivery(
  tenantId: string,
  prepared: PreparedDelivery,
  cache: WebhookConfigCache,
): Promise<void> {
  try {
    const cfg = await loadConfigCached(cache, tenantId);
    if (!cfg || !cfg.enabled) return;
    if (!cfg.eventTypes.includes(prepared.eventType)) return;

    const now = msBig(Date.now());

    // create (not upsert) so a Meta redelivery — same deterministic id — fails with a unique
    // violation and is skipped here, guaranteeing we forward each event at most once.
    await prisma.webhookDelivery.create({
      data: {
        tenantId,
        id: prepared.deliveryId,
        eventType: prepared.eventType,
        eventId: prepared.eventId,
        payload: prepared.envelope as unknown as Prisma.InputJsonValue,
        callbackUrl: cfg.callbackUrl,
        status: 'queued',
        attempts: 0,
        maxAttempts: WEBHOOK_MAX_ATTEMPTS,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Deliver right now instead of waiting up to one poll interval; the poller stays the retry
    // safety net. Fire-and-forget (never awaited) so the Meta hot path still returns 200 fast.
    void kickDelivery(tenantId, prepared.deliveryId);
  } catch (err) {
    // P2002 (unique violation) is the expected, benign redelivery case; anything else is logged
    // but still swallowed — forwarding must never disturb Meta event processing.
    const isDuplicate =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
    if (isDuplicate) {
      logger.debug({ tenantId, deliveryId: prepared.deliveryId }, 'webhook enqueue: duplicate, skipped');
    } else {
      logger.warn(
        { tenantId, deliveryId: prepared.deliveryId, err: (err as Error)?.message },
        'webhook enqueue: failed (swallowed)',
      );
    }
  }
}
