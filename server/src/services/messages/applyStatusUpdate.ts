/**
 * Apply a delivery-status update (sent/delivered/read/failed) reported by the BSP for an
 * outbound message we previously sent.
 *
 * We locate the message by its bspMessageId (the Meta wamid we stored at send time) and
 * advance its status MONOTONICALLY: status only ever moves forward along
 *   queued -> sent -> delivered -> read
 * with 'failed' as a terminal state. This guards against out-of-order webhook delivery
 * (e.g. a late 'sent' arriving after 'delivered') silently regressing the UI.
 *
 * No-op (logged) when no message matches — status callbacks can arrive for messages we
 * don't track (or before our send write lands); dropping them is safe.
 */

import type { Message, MessageStatus } from '@thinkai/shared';
import type { NormalizedStatusUpdate } from '../bsp/types';

import { prisma } from '../../config/db';
import { logger } from '../../lib/logger';
import { applyCampaignRecipientStatus } from '../campaigns/applyCampaignRecipientStatus';

/**
 * Monotonic rank for the normal progression. 'failed' is handled separately as a terminal
 * state, so it is intentionally absent from this ordering map.
 */
const STATUS_RANK: Record<Exclude<MessageStatus, 'failed'>, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/**
 * Decide whether `next` should overwrite `current`.
 * - 'failed' is terminal: once failed, never change; but a non-failed message CAN move to
 *   failed (a real delivery failure reported by the BSP).
 * - Otherwise only advance forward in the progression ranking.
 */
function shouldApply(current: MessageStatus, next: MessageStatus): boolean {
  if (current === 'failed') return false; // terminal
  if (next === 'failed') return true; // real failure overrides any in-flight state
  return STATUS_RANK[next] > STATUS_RANK[current];
}

export async function applyStatusUpdate(
  tenantId: string,
  upd: NormalizedStatusUpdate,
): Promise<void> {
  const { bspMessageId, status, error, category } = upd;

  if (!bspMessageId) {
    logger.warn({ tenantId }, 'applyStatusUpdate: missing bspMessageId, skipping');
    return;
  }

  // Find the outbound message we sent, by its stored Meta wamid.
  const message = await prisma.message.findFirst({
    where: { tenantId, bspMessageId },
  });

  if (!message) {
    logger.info(
      { tenantId, bspMessageId, status },
      'applyStatusUpdate: no matching message, ignoring',
    );
    return;
  }

  const current = message.status as MessageStatus;

  if (!shouldApply(current, status)) {
    // Out-of-order or redundant update — keep the more-advanced status we already have.
    return;
  }

  const update: Record<string, unknown> = { status };

  // The BSP may report the authoritative billable category on the status callback
  // (e.g. Meta's pricing.category); record it if present so usage/margin reporting is exact.
  if (category) {
    update.category = category;
  }

  // On failure, capture the error detail for the inbox / debugging.
  if (status === 'failed' && error) {
    update.error = {
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.title !== undefined ? { title: error.title } : {}),
      ...(error.detail !== undefined ? { detail: error.detail } : {}),
    };
  }

  await prisma.message.update({
    where: { tenantId_id: { tenantId, id: message.id } },
    data: update,
  });

  // Fan the outcome back to the campaign if this message was part of one (2.2). Best-effort:
  // a failure here must not affect the message update or the webhook 200.
  if (message.campaignId && message.campaignRecipientId) {
    try {
      await applyCampaignRecipientStatus(
        tenantId,
        message.campaignId,
        message.campaignRecipientId,
        status,
        status === 'failed' ? (update.error as Message['error']) : undefined,
      );
    } catch (err) {
      logger.warn(
        { tenantId, campaignId: message.campaignId, err: (err as Error)?.message },
        'applyStatusUpdate: campaign fan-back failed (swallowed)',
      );
    }
  }
}
