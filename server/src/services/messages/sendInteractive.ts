/**
 * Send an interactive ("service") reply — a WhatsApp list / reply-buttons / cta_url — inside an
 * existing conversation. Mirrors sendText: same Phase-1 rules (only valid while the 24h service
 * window is OPEN; 'service' messages are FREE, costPaise = 0, so there is no debit/refund dance).
 *
 * The caller (public API) passes the full WhatsApp `interactive` object; we only check the window,
 * persist the message, and hand it to the provider. The window check is enforced server-side.
 */

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveTenantBspContext } from '../bsp';
import { assertActive } from '../subscription/subscriptionService';
import { isWindowOpen, touchConversationForOutbound } from '../conversations/window';

/** Best-effort human-readable preview of an interactive payload for the message/conversation list. */
function interactivePreview(interactive: Record<string, unknown>): string {
  const body = interactive.body as { text?: unknown } | undefined;
  if (body && typeof body.text === 'string' && body.text.trim()) return body.text;
  return '[interactive message]';
}

export async function sendInteractiveMessage(
  tenantId: string,
  conversationId: string,
  params: { interactive: Record<string, unknown> },
): Promise<SendMessageResponse> {
  const { interactive } = params;

  const conversation = await prisma.conversation.findUnique({
    where: { tenantId_id: { tenantId, id: conversationId } },
  });
  if (!conversation) {
    throw AppError.notFound('Conversation not found');
  }

  // Enforce the 24h service window server-side. Closed window -> must use a template.
  if (!isWindowOpen(Number(conversation.windowExpiresAt))) {
    throw AppError.conflict('Service window closed', 'window_closed');
  }

  // Subscription gate — a lapsed tenant cannot send anything (throws 402 'subscription_inactive').
  await assertActive(tenantId);

  const toPhone = conversation.contactPhone;

  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);
  if (!provider.sendInteractive) {
    throw AppError.badRequest(
      'Interactive messages are not supported by this provider',
      'interactive_unsupported',
    );
  }

  const now = Date.now();
  const messageId = randomUUID();
  const preview = interactivePreview(interactive);

  await prisma.message.create({
    data: {
      tenantId,
      id: messageId,
      conversationId,
      contactPhone: toPhone,
      direction: 'out',
      channel: 'whatsapp',
      type: 'interactive',
      body: preview,
      status: 'queued',
      category: 'service',
      costPaise: 0,
      ts: msBig(now),
    },
  });

  try {
    const result = await provider.sendInteractive(ctx, { toPhone, interactive });

    await prisma.message.update({
      where: { tenantId_id: { tenantId, id: messageId } },
      data: { status: 'sent', bspMessageId: result.bspMessageId },
    });

    // Update the conversation list preview. Does NOT extend the window (outbound never does).
    await touchConversationForOutbound(tenantId, { contactPhone: toPhone, ts: now, preview });

    return { messageId, conversationId, status: 'sent' };
  } catch (err) {
    // No wallet debit occurred for a free service message, so there is nothing to refund.
    logger.error(
      { tenantId, messageId, conversationId, err },
      'sendInteractiveMessage: BSP send failed',
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
