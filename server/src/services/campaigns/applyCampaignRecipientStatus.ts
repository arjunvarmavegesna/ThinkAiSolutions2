/**
 * Fan a delivery-status update back to its campaign (feature 2.2).
 *
 * Called from applyStatusUpdate when the matched outbound message carries a campaignId +
 * campaignRecipientId. In ONE transaction it advances the recipient row monotonically and bumps
 * the campaign's delivered/read/failed counters by the crossing delta — so redelivered webhooks
 * are idempotent (the re-read recipient status won't re-cross a threshold).
 *
 *   pending(0) -> sent(1) -> delivered(2) -> read(3)   ('failed' is terminal-ish)
 *
 * delivered counts a recipient once on first reaching delivered-or-beyond; read counts once on
 * reaching read; a read that skips a delivered webhook still counts delivered. A post-send
 * 'failed' applies only if the recipient hadn't already reached delivered/read.
 */

import type { CampaignRecipient, CampaignRecipientStatus, MessageStatus } from '@thinkai/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';

const RANK: Record<CampaignRecipientStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 99,
};

/** Map a message delivery status to a recipient status (queued has no recipient meaning). */
function toRecipientStatus(status: MessageStatus): CampaignRecipientStatus | null {
  switch (status) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return null; // 'queued' — nothing to fan back.
  }
}

export async function applyCampaignRecipientStatus(
  tenantId: string,
  campaignId: string,
  recipientId: string,
  status: MessageStatus,
  error?: CampaignRecipient['error'],
): Promise<void> {
  const target = toRecipientStatus(status);
  if (!target) return;

  await prisma.$transaction(async (tx) => {
    // Lock the recipient row so the read-decide-write (incl. counter crossing) is atomic and a
    // redelivered webhook can't double-count under concurrency.
    const locked = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM campaign_recipients
      WHERE "tenantId" = ${tenantId} AND "campaignId" = ${campaignId} AND id = ${recipientId}
      FOR UPDATE`;
    if (locked.length === 0) return;
    const cur = locked[0].status as CampaignRecipientStatus;

    // Decide whether this is a valid forward transition.
    if (cur === 'failed') return; // terminal
    if (target === 'failed') {
      if (cur === 'delivered' || cur === 'read') return; // already delivered; ignore late failure
    } else if (RANK[target] <= RANK[cur]) {
      return; // out-of-order or redundant
    }

    // Counter deltas for the thresholds this transition crosses.
    const inc: Prisma.CampaignUpdateInput = {};
    if ((target === 'delivered' || target === 'read') && RANK[cur] < RANK.delivered) {
      inc.delivered = { increment: 1 };
    }
    if (target === 'read' && RANK[cur] < RANK.read) inc.read = { increment: 1 };
    if (target === 'failed') inc.failed = { increment: 1 };

    await tx.campaignRecipient.update({
      where: { tenantId_campaignId_id: { tenantId, campaignId, id: recipientId } },
      data: {
        status: target,
        updatedAt: msBig(Date.now()),
        ...(target === 'failed' && error ? { error: error as Prisma.InputJsonValue } : {}),
      },
    });
    if (Object.keys(inc).length > 0) {
      await tx.campaign.update({
        where: { tenantId_id: { tenantId, id: campaignId } },
        data: inc,
      });
    }
  });

  logger.debug({ tenantId, campaignId, recipientId, status: target }, 'campaign recipient status applied');
}
