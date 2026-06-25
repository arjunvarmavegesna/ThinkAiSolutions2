/**
 * Drain one campaign's pending recipients through the per-message debit/send pipeline.
 *
 * Called by the campaignWorker AFTER it has claimed the campaign (queued -> sending). Each
 * recipient goes through sendTemplateMessage (the exact single-send path: debit-before-send,
 * refund-on-failure), so billing is identical to a one-off send. Per-recipient outcomes are
 * written to the recipients subcollection (the source of truth for the tracking report, 2.2).
 *
 * Resumability: we process only recipients still 'pending', so a re-run after a crash skips
 * ones already attempted. The narrow window (sent but not yet marked) is accepted for Phase 1.
 * If the wallet runs dry mid-campaign we stop early and mark the remainder 'failed' rather than
 * hammering the wallet with thousands of doomed debits.
 */

import { resolveRecipientVariables } from '@thinkai/shared';
import type { CampaignRecipient } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { sendTemplateMessage } from '../messages/sendTemplate';

interface RecipientRow {
  id: string;
  phone: string;
  /** Contact name snapshotted at creation; used to resolve {{contact.name}} (see resolveSegment). */
  name?: string;
  status: CampaignRecipient['status'];
}

/** Patch one recipient row by its composite key. */
function setRecipient(
  tenantId: string,
  campaignId: string,
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return prisma.campaignRecipient.update({
    where: { tenantId_campaignId_id: { tenantId, campaignId, id } },
    data,
  });
}

export async function processCampaign(tenantId: string, campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { tenantId_id: { tenantId, id: campaignId } },
  });
  if (!campaign) return;

  const recipientRows = await prisma.campaignRecipient.findMany({
    where: { tenantId, campaignId },
  });
  const rows: RecipientRow[] = recipientRows.map((r) => ({
    id: r.id,
    phone: r.phone,
    name: r.name ?? undefined,
    status: r.status as CampaignRecipient['status'],
  }));

  // RAW variables (merge tags unresolved) — resolved PER RECIPIENT inside the loop below.
  const rawVariables = campaign.variables ?? [];
  let walletDry = false;

  for (const row of rows) {
    if (row.status !== 'pending') continue;
    const now = Date.now();

    if (walletDry) {
      // Short-circuit: the wallet is empty; fail the remainder without more debit attempts.
      await setRecipient(tenantId, campaignId, row.id, {
        status: 'failed',
        error: { code: 'insufficient_funds', detail: 'Wallet balance exhausted' },
        updatedAt: msBig(now),
      });
      row.status = 'failed';
      continue;
    }

    // Resolve merge tags for THIS recipient. This runs BEFORE sendTemplateMessage — i.e. before any
    // message doc is created and before any wallet debit — so an unresolvable tag never costs money.
    const { variables, unresolved } = resolveRecipientVariables(rawVariables, {
      name: row.name,
      phone: row.phone,
    });
    if (unresolved) {
      // A tag we can't resolve (e.g. an unknown {{contact.email}}) would otherwise deliver raw
      // "{{...}}" to the customer. Skip this recipient, mark it failed, and continue the campaign.
      await setRecipient(tenantId, campaignId, row.id, {
        status: 'failed',
        error: { code: 'unresolved_merge_tag', detail: 'unresolved merge tag' },
        updatedAt: msBig(now),
      });
      row.status = 'failed';
      logger.warn(
        { tenantId, campaignId, phone: row.phone },
        'campaign: recipient skipped (unresolved merge tag)',
      );
      continue;
    }

    try {
      const res = await sendTemplateMessage(tenantId, {
        toPhone: row.phone,
        templateName: campaign.templateName,
        languageCode: campaign.languageCode,
        variables,
        campaignId,
        campaignRecipientId: row.id,
      });
      await setRecipient(tenantId, campaignId, row.id, {
        status: 'sent',
        messageId: res.messageId,
        updatedAt: msBig(now),
      });
      row.status = 'sent';
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'send_failed';
      if (code === 'insufficient_funds') walletDry = true;
      await setRecipient(tenantId, campaignId, row.id, {
        status: 'failed',
        error: { code, detail: err instanceof Error ? err.message : 'Send failed' },
        updatedAt: msBig(now),
      });
      row.status = 'failed';
      logger.warn({ tenantId, campaignId, phone: row.phone, code }, 'campaign: recipient failed');
    }
  }

  // Recompute counters from the (now-updated) recipient set so a resumed run stays accurate.
  const sent = rows.filter((r) => r.status === 'sent').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const status = sent === 0 ? 'failed' : 'completed';

  await prisma.campaign.update({
    where: { tenantId_id: { tenantId, id: campaignId } },
    data: { submitted: rows.length, sent, failed, status, completedAt: msBig(Date.now()) },
  });

  logger.info({ tenantId, campaignId, sent, failed, total: rows.length }, 'campaign: drained');
}
