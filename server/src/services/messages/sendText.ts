/**
 * Send a free-text ("service") reply inside an existing conversation.
 *
 * Phase 1 rule: free-text is only allowed while the 24h service window is OPEN (the
 * contact has messaged us within the last 24h). 'service' messages are FREE — no wallet
 * debit, costPaise = 0 — so there is no debit/refund dance here.
 *
 * The window check is enforced server-side (the client also disables the composer, but we
 * never trust the client). If the window is closed we return 409 'window_closed' so the
 * caller knows to use an approved template instead.
 */

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveTenantBspContext } from '../bsp';
import {
  isWindowOpen,
  touchConversationForOutbound,
} from '../conversations/window';

export async function sendTextMessage(
  tenantId: string,
  conversationId: string,
  params: { body: string },
): Promise<SendMessageResponse> {
  const { body } = params;

  // Load the conversation to get the contact phone and check the window.
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

  const toPhone = conversation.contactPhone;

  // Resolve which WABA + apikey to send through, and the provider that serves it.
  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  // Persist the outbound message row (free 'service' message, no billing).
  const now = Date.now();
  const messageId = randomUUID();

  await prisma.message.create({
    data: {
      tenantId,
      id: messageId,
      conversationId,
      contactPhone: toPhone,
      direction: 'out',
      channel: 'whatsapp',
      type: 'text',
      body,
      status: 'queued',
      category: 'service',
      costPaise: 0,
      ts: msBig(now),
    },
  });

  try {
    const result = await provider.sendText(ctx, { toPhone, body });

    await prisma.message.update({
      where: { tenantId_id: { tenantId, id: messageId } },
      data: { status: 'sent', bspMessageId: result.bspMessageId },
    });

    // Update the conversation list preview. Does NOT extend the window (outbound never does).
    await touchConversationForOutbound(tenantId, {
      contactPhone: toPhone,
      ts: now,
      preview: body,
    });

    return { messageId, conversationId, status: 'sent' };
  } catch (err) {
    // No wallet debit occurred for a free service message, so there is nothing to refund —
    // we only record the failure on the message row.
    logger.error(
      { tenantId, messageId, conversationId, err },
      'sendTextMessage: BSP send failed',
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
