/**
 * Send an approved template message to a contact (single send).
 *
 * Billing model (post-pivot): there is NO per-message debit. Sending is gated by the tenant's
 * flat ₹2,500/month subscription — `assertActive` throws 402 'subscription_inactive' when the plan
 * has lapsed, so we never call the BSP. Every message is recorded with costPaise = 0; the billable
 * `category` is still stored on the row for analytics/reporting only.
 *
 * Order:
 *   1. Load the template and assert it is 'approved' (never send a draft/pending/rejected one —
 *      Meta would reject it).
 *   2. assertActive(tenantId) — gate on an active subscription before anything else.
 *   3. Resolve the BSP context (which connected WABA + token) and the provider (metaCloud).
 *   4. Persist the outbound message doc (status 'queued', costPaise 0).
 *   5. Call the provider. On success -> 'sent' + store wamid; on failure -> 'failed'.
 */

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse, Template } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { toTemplate } from '../../db/mappers';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveTenantBspContext } from '../bsp';
import { assertActive } from '../subscription/subscriptionService';
import { conversationIdForPhone, touchConversationForOutbound } from '../conversations/window';
import { categoryForTemplate } from './category';

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

  // 1. Validate the template is real and approved before doing anything.
  const template = await loadApprovedTemplate(tenantId, templateName);

  // 2. Subscription gate — no active plan means no send (and no BSP call). Throws 402.
  await assertActive(tenantId);

  // 3. Resolve which WABA + token to send through (token stays in-memory only) and the
  //    provider that serves it (metaCloud).
  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  // 4. Persist the message row. `category` is kept for reporting; `costPaise` is always 0 now.
  const category = categoryForTemplate(template);
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
      costPaise: 0,
      ts: msBig(now),
      ...(campaignId ? { campaignId } : {}),
      ...(campaignRecipientId ? { campaignRecipientId } : {}),
    },
  });

  // 5. Hand off to the BSP.
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
    logger.error(
      { tenantId, messageId, templateName, err },
      'sendTemplateMessage: BSP send failed',
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

    throw err;
  }
}
