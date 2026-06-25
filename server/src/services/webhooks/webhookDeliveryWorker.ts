/**
 * Client-webhook delivery worker — a Firestore-backed queue poller (same locked design as the
 * campaign worker: no new infra). The `webhookDeliveries` collection-group IS the queue: a doc
 * sits in 'queued' until its `nextAttemptAt` is due, then this in-process poller claims it
 * (transactionally, queued -> delivering) and POSTs the signed payload to the tenant's URL.
 *
 * On a 2xx the delivery is 'delivered'; otherwise it is re-queued with exponential backoff until
 * WEBHOOK_MAX_ATTEMPTS is spent, then 'failed'. Every attempt is recorded on the same doc, which
 * doubles as the client-visible delivery log.
 *
 * Caveats (Phase 1, mirrors the campaign worker): runs in-process (keep min-instances >= 1 on
 * Cloud Run for timely retries); a delivery left 'delivering' by a crash is not auto-resumed.
 */

import { prisma } from '../../config/db';
import { config } from '../../config/env';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';

import {
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_CLAIM_BATCH,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_WORKER_INTERVAL_MS,
} from './constants';
import { postWebhook } from './deliverWebhook';
import { signWebhookBody } from './signDelivery';
import { getSigningSecret } from './webhookConfigService';

let timer: NodeJS.Timeout | undefined;
let ticking = false;

/**
 * Atomically claim up to WEBHOOK_CLAIM_BATCH due deliveries (queued -> delivering) and return their
 * ids. FOR UPDATE SKIP LOCKED means concurrent workers never claim the same row (replaces the
 * Firestore collectionGroup poll + per-doc CAS transaction).
 */
async function claimDue(now: number): Promise<{ tenantId: string; id: string }[]> {
  return prisma.$queryRaw<{ tenantId: string; id: string }[]>`
    UPDATE webhook_deliveries SET status = 'delivering', "updatedAt" = ${msBig(now)}
    WHERE ("tenantId", id) IN (
      SELECT "tenantId", id FROM webhook_deliveries
      WHERE status = 'queued' AND "nextAttemptAt" <= ${msBig(now)}
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${WEBHOOK_CLAIM_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "tenantId", id`;
}

/** Deliver one claimed delivery and record the outcome (delivered | requeued | failed). */
async function processDelivery(tenantId: string, id: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { tenantId_id: { tenantId, id } },
  });
  if (!delivery) return;

  const maxAttempts = delivery.maxAttempts || WEBHOOK_MAX_ATTEMPTS;
  const attempts = delivery.attempts + 1;
  const now = Date.now();

  // We never deliver unsigned. A missing secret is a permanent failure the client can see + fix.
  const secret = await getSigningSecret(tenantId);
  if (!secret) {
    await prisma.webhookDelivery.update({
      where: { tenantId_id: { tenantId, id } },
      data: { status: 'failed', attempts, lastError: 'no signing secret configured', updatedAt: msBig(now) },
    });
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const signature = signWebhookBody(secret, body);
  const result = await postWebhook({
    url: delivery.callbackUrl,
    body,
    signature,
    timeoutMs: config.webhook.deliveryTimeoutMs,
  });

  if (result.ok) {
    await prisma.webhookDelivery.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        status: 'delivered',
        attempts,
        deliveredAt: msBig(now),
        updatedAt: msBig(now),
        ...(result.statusCode !== undefined ? { lastStatusCode: result.statusCode } : {}),
      },
    });
    return;
  }

  const update: Record<string, unknown> = {
    attempts,
    updatedAt: msBig(now),
    ...(result.statusCode !== undefined ? { lastStatusCode: result.statusCode } : {}),
    ...(result.error !== undefined ? { lastError: result.error } : {}),
  };
  if (attempts >= maxAttempts) {
    update.status = 'failed';
  } else {
    // Re-queue with backoff indexed by the just-failed attempt (clamped to the last bucket).
    const backoff = WEBHOOK_BACKOFF_MS[Math.min(attempts - 1, WEBHOOK_BACKOFF_MS.length - 1)];
    update.status = 'queued';
    update.nextAttemptAt = msBig(now + backoff);
  }
  await prisma.webhookDelivery.update({ where: { tenantId_id: { tenantId, id } }, data: update });
}

/**
 * Deliver ONE just-enqueued delivery immediately, without waiting for the next poll tick. Claims
 * the row exactly as the poller does (queued -> delivering, only if still due) so a concurrent
 * tick can never double-deliver it: whichever of the two locks the row first wins, the other sees
 * status != 'queued' and no-ops. Fire-and-forget from the enqueue hot path; never throws, so a
 * forwarding hiccup never disturbs the 200 we return to Meta. The poller remains the retry net.
 */
export async function kickDelivery(tenantId: string, id: string): Promise<void> {
  let claimed: { id: string }[];
  try {
    const now = Date.now();
    claimed = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE webhook_deliveries SET status = 'delivering', "updatedAt" = ${msBig(now)}
      WHERE "tenantId" = ${tenantId} AND id = ${id}
        AND status = 'queued' AND "nextAttemptAt" <= ${msBig(now)}
      RETURNING id`;
  } catch (err) {
    // Claim failed (transient DB error): leave the row 'queued' for the poller to retry.
    logger.warn({ err, deliveryId: id }, 'webhookDeliveryWorker: kick claim failed (poller will retry)');
    return;
  }
  if (claimed.length === 0) return; // poller already claimed it, or not yet due

  try {
    await processDelivery(tenantId, id);
  } catch (err) {
    // Mirror tick(): don't leave a claimed row stuck 'delivering' — re-queue for a later retry.
    logger.error({ err, deliveryId: id }, 'webhookDeliveryWorker: kicked delivery crashed');
    await prisma.webhookDelivery
      .update({
        where: { tenantId_id: { tenantId, id } },
        data: { status: 'queued', nextAttemptAt: msBig(Date.now() + WEBHOOK_BACKOFF_MS[0]) },
      })
      .catch(() => undefined);
  }
}

/** One poll cycle: claim due deliveries, deliver each. Never throws. */
async function tick(): Promise<void> {
  if (ticking) return; // don't overlap a slow batch with the next interval.
  ticking = true;
  try {
    const claimed = await claimDue(Date.now());

    for (const { tenantId, id } of claimed) {
      try {
        await processDelivery(tenantId, id);
      } catch (err) {
        // Unexpected failure: don't leave it stuck 'delivering' — re-queue for a later retry.
        logger.error({ err, deliveryId: id }, 'webhookDeliveryWorker: delivery crashed');
        await prisma.webhookDelivery
          .update({
            where: { tenantId_id: { tenantId, id } },
            data: { status: 'queued', nextAttemptAt: msBig(Date.now() + WEBHOOK_BACKOFF_MS[0]) },
          })
          .catch(() => undefined);
      }
    }
  } catch (err) {
    // A transient DB error must not kill the loop.
    logger.error({ err }, 'webhookDeliveryWorker: tick failed');
  } finally {
    ticking = false;
  }
}

/** Start the polling worker. Returns a stop function (used on graceful shutdown / tests). */
export function startWebhookDeliveryWorker(intervalMs = WEBHOOK_WORKER_INTERVAL_MS): () => void {
  if (timer) return stopWebhookDeliveryWorker;
  logger.info({ intervalMs }, 'webhookDeliveryWorker: started');
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  return stopWebhookDeliveryWorker;
}

export function stopWebhookDeliveryWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
    logger.info('webhookDeliveryWorker: stopped');
  }
}
