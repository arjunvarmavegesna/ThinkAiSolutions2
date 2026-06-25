/**
 * Send an approved template message to a contact (single send, Phase 1).
 *
 * Orchestration order is deliberate and the comments call out the non-obvious billing /
 * failure-compensation steps:
 *
 *   1. Load the template doc by name and assert it is 'approved' (we must never send a
 *      draft/pending/rejected template — Meta would reject it and we'd still be billed).
 *   2. Classify the billable category and resolve the tenant's per-category pricing.
 *   3. Resolve the BSP context (which connected WABA + apikey to use).
 *   4. Persist the outbound message doc FIRST (status 'queued') so we have a stable
 *      messageId to use as the idempotency key for the wallet debit.
 *   5. DEBIT BEFORE SEND: atomically debit the wallet. If the balance is insufficient
 *      this throws 402 and we never call the BSP. The debit is idempotent on messageId.
 *   6. Call the provider. On success -> mark 'sent' + store bspMessageId.
 *      On failure -> mark 'failed' + COMPENSATE by refunding the debit (idempotent), so a
 *      failed send never costs the tenant money.
 *
 * We bill the message because Meta charges for the template conversation regardless of
 * delivery; we only refund when the *send itself* failed (the BSP never accepted it).
 */

import { randomUUID } from 'node:crypto';

import type { Pricing, SendMessageResponse, Template } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { toPricing, toTemplate } from '../../db/mappers';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import {
  getBspProvider,
  resolveTenantBspContext,
} from '../bsp';
import { computeCharge } from '../wallet/billing';
import { debitForMessage, refundDebit } from '../wallet/walletService';
import {
  conversationIdForPhone,
  touchConversationForOutbound,
} from '../conversations/window';
import { categoryForTemplate } from './category';

/** Load the tenant's per-category charge rates; required for any billable send. */
async function loadPricing(tenantId: string): Promise<Pricing> {
  const row = await prisma.pricing.findUnique({ where: { tenantId } });
  if (!row) {
    throw AppError.badRequest('No pricing configured for this tenant', 'no_pricing');
  }
  return toPricing(row);
}

/** Load an approved template by its name (template id == template name). */
async function loadApprovedTemplate(tenantId: string, templateName: string): Promise<Template> {
  const row = await prisma.template.findUnique({
    where: { tenantId_id: { tenantId, id: templateName } },
  });
  if (!row) {
    throw AppError.notFound(`Template '${templateName}' not found`);
  }
  const template = toTemplate(row);
  if (template.status !== 'approved') {
    throw AppError.badRequest(
      `Template '${templateName}' is not approved (status: ${template.status})`,
      'template_not_approved',
    );
  }
  return template;
}

export async function sendTemplateMessage(
  tenantId: string,
  params: {
    toPhone: string;
    templateName: string;
    languageCode: string;
    variables: string[];
    /** When sent as part of a campaign, link the message so status webhooks fan back (2.2). */
    campaignId?: string;
    campaignRecipientId?: string;
  },
): Promise<SendMessageResponse> {
  const { toPhone, templateName, languageCode, variables, campaignId, campaignRecipientId } = params;

  // 1. Validate the template is real and approved before doing anything billable.
  const template = await loadApprovedTemplate(tenantId, templateName);

  // 2. Classify category + resolve what we charge this tenant for it.
  const category = categoryForTemplate(template);
  const pricing = await loadPricing(tenantId);
  const chargePaise = computeCharge(category, pricing);

  // 3. Resolve which WABA + token to send through (token stays in-memory only) and the
  //    provider that serves it (metaCloud).
  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  // 4. Persist the message row first so we have a stable id for the debit idempotency key.
  const now = Date.now();
  const conversationId = conversationIdForPhone(toPhone);
  const messageId = randomUUID();

  await prisma.message.create({
    data: {
      tenantId,
      id: messageId,
      conversationId,
      contactPhone: toPhone,
      direction: 'out',
      channel: 'whatsapp',
      type: 'template',
      templateName,
      status: 'queued',
      category,
      costPaise: chargePaise,
      ts: msBig(now),
      ...(campaignId ? { campaignId } : {}),
      ...(campaignRecipientId ? { campaignRecipientId } : {}),
    },
  });

  // 5. DEBIT BEFORE SEND. Throws 402 insufficient_funds if the wallet can't cover it,
  //    in which case we mark the queued message failed and do NOT call the BSP.
  try {
    await debitForMessage(tenantId, { messageId, category, chargePaise });
  } catch (err) {
    await prisma.message.update({
      where: { tenantId_id: { tenantId, id: messageId } },
      data: {
        status: 'failed',
        error: {
          code: err instanceof AppError ? err.code : 'debit_failed',
          detail: err instanceof Error ? err.message : 'Wallet debit failed',
        },
      },
    });
    throw err;
  }

  // 6. Hand off to the BSP. On any provider failure we COMPENSATE the debit.
  try {
    const result = await provider.sendTemplate(ctx, {
      toPhone,
      templateName,
      languageCode,
      variables,
    });

    await prisma.message.update({
      where: { tenantId_id: { tenantId, id: messageId } },
      data: { status: 'sent', bspMessageId: result.bspMessageId },
    });

    // Reflect the outbound message in the conversation list. Does NOT open the window —
    // only an inbound reply from the contact can do that.
    await touchConversationForOutbound(tenantId, {
      contactPhone: toPhone,
      ts: now,
      preview: `Template: ${templateName}`,
    });

    return { messageId, conversationId, status: 'sent' };
  } catch (err) {
    // Compensating action: the BSP never accepted the send, so the tenant must not pay.
    logger.error(
      { tenantId, messageId, templateName, err },
      'sendTemplateMessage: BSP send failed, refunding debit',
    );

    await prisma.message.update({
      where: { tenantId_id: { tenantId, id: messageId } },
      data: {
        status: 'failed',
        error: {
          code: 'bsp_send_failed',
          detail: err instanceof Error ? err.message : 'BSP send failed',
        },
      },
    });

    // refundDebit is idempotent and a no-op if nothing was actually debited (free message).
    await refundDebit(tenantId, { messageId });

    throw err;
  }
}
