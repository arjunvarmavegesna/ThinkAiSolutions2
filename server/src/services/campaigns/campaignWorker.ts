/**
 * Campaign job runner — a Firestore-backed queue worker (the locked design: NO new infra,
 * not Cloud Tasks). The `campaigns` collection IS the queue: a campaign sits in status
 * 'queued' until its `scheduledAt` is due, then this in-process poller claims it
 * (transactionally, queued -> sending) and drains it via processCampaign.
 *
 * Claiming is a compare-and-set transaction, so even if more than one instance runs the worker
 * only one will ever process a given campaign. Each tick is guarded against overlap.
 *
 * Caveats (Phase 1): runs in-process, so on Cloud Run the instance must stay warm
 * (min-instances >= 1) for scheduled sends to fire on time. A campaign left in 'sending' by a
 * crash is NOT auto-resumed (avoids cross-instance double-send) — it can be re-queued manually.
 */

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';
import { processCampaign } from './processCampaign';

/** How many due campaigns to claim per tick. Each is drained fully before the next. */
const CLAIM_BATCH = 3;

let timer: NodeJS.Timeout | undefined;
let ticking = false;

/**
 * Atomically claim up to CLAIM_BATCH due campaigns (queued -> sending) and return their ids.
 * `FOR UPDATE SKIP LOCKED` over the subquery means concurrent workers/instances never claim the
 * same campaign (replaces the Firestore collectionGroup poll + per-doc CAS transaction).
 */
async function claimDue(now: number): Promise<{ tenantId: string; id: string }[]> {
  return prisma.$queryRaw<{ tenantId: string; id: string }[]>`
    UPDATE campaigns SET status = 'sending', "startedAt" = ${msBig(now)}
    WHERE ("tenantId", id) IN (
      SELECT "tenantId", id FROM campaigns
      WHERE status = 'queued' AND "scheduledAt" <= ${msBig(now)}
      ORDER BY "scheduledAt" ASC
      LIMIT ${CLAIM_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "tenantId", id`;
}

/** One poll cycle: claim due campaigns, drain each. Never throws. */
async function tick(): Promise<void> {
  if (ticking) return; // don't overlap a slow drain with the next interval.
  ticking = true;
  try {
    const claimed = await claimDue(Date.now());

    for (const { tenantId, id } of claimed) {
      try {
        await processCampaign(tenantId, id);
      } catch (err) {
        // Unexpected failure mid-drain: mark failed so it isn't stuck in 'sending' forever.
        logger.error({ err, tenantId, campaignId: id }, 'campaignWorker: drain failed');
        await prisma.campaign
          .update({
            where: { tenantId_id: { tenantId, id } },
            data: { status: 'failed', completedAt: msBig(Date.now()) },
          })
          .catch(() => undefined);
      }
    }
  } catch (err) {
    // A transient DB error must not kill the loop.
    logger.error({ err }, 'campaignWorker: tick failed');
  } finally {
    ticking = false;
  }
}

/** Start the polling worker. Returns a stop function (used on graceful shutdown / tests). */
export function startCampaignWorker(intervalMs = 5000): () => void {
  if (timer) return stopCampaignWorker;
  logger.info({ intervalMs }, 'campaignWorker: started');
  timer = setInterval(() => void tick(), intervalMs);
  // Don't let the worker timer keep the process alive on its own.
  timer.unref?.();
  return stopCampaignWorker;
}

export function stopCampaignWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
    logger.info('campaignWorker: stopped');
  }
}
