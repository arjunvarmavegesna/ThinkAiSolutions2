/**
 * Ingest one inbound message (already verified + normalized by the BSP webhook layer).
 *
 * Effects (all tenant-scoped):
 *   1. Upsert the contact by phone (so the inbox has a name + opt-in record).
 *   2. Upsert the conversation — this REFRESHES the 24h service window (only an inbound
 *      message from the contact may open/extend it) and bumps the unread counter.
 *   3. Write the inbound message doc (direction 'in', free 'service' category, costPaise 0,
 *      status 'delivered' — inbound is delivered to us by definition).
 *
 * Idempotency: the message doc id is the BSP wamid, so a redelivered webhook re-writes the
 * same doc rather than duplicating it. We still upsert the conversation/contact each time;
 * those operations are themselves idempotent merges (the window refresh is harmless to
 * repeat, though the unread counter may over-count on duplicate delivery — acceptable for
 * Phase 1 and far safer than dropping a genuinely new message).
 */

import { toE164 } from '@thinkai/shared';
import type { NormalizedInboundMessage } from '../bsp/types';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import {
  conversationIdForPhone,
  upsertConversationForInbound,
} from '../conversations/window';

/** Create or update the contact record for an inbound sender. */
async function upsertContact(
  tenantId: string,
  args: { phone: string; name?: string; ts: number },
): Promise<void> {
  const { phone, name, ts } = args;
  // Deterministic contact id from phone keeps one record per contact.
  const contactId = conversationIdForPhone(phone);

  await prisma.contact.upsert({
    where: { tenantId_id: { tenantId, id: contactId } },
    create: {
      tenantId,
      id: contactId,
      phone,
      ...(name ? { name } : {}),
      optInStatus: 'unknown',
      createdAt: msBig(ts),
      updatedAt: msBig(ts),
    },
    // Existing contact: refresh updatedAt and fill in the name if newly available.
    update: {
      phone,
      updatedAt: msBig(ts),
      ...(name ? { name } : {}),
    },
  });
}

export async function ingestInbound(
  tenantId: string,
  wabaDocId: string,
  msg: NormalizedInboundMessage,
): Promise<void> {
  const { fromPhone, contactName, bspMessageId, type, body, ts } = msg;
  // Meta delivers `from` as bare digits (no '+'). Store E.164 so the contact/conversation match
  // the format the Contacts UI uses and segment sends resolve to a valid recipient.
  const phone = toE164(fromPhone);

  // 1. Contact record (best-effort identity for the inbox).
  await upsertContact(tenantId, { phone, name: contactName, ts });

  // 2. Conversation: refresh the 24h window + bump unread. Returns the deterministic id.
  const conversationId = await upsertConversationForInbound(tenantId, {
    contactPhone: phone,
    contactName,
    ts,
    preview: body,
  });

  // 3. Inbound message row, keyed by the BSP wamid for natural webhook idempotency.
  // upsert so a redelivered webhook updates rather than errors / duplicates.
  const base = {
    conversationId,
    contactPhone: phone,
    direction: 'in',
    channel: 'whatsapp',
    type,
    ...(body !== undefined ? { body } : {}),
    status: 'delivered',
    category: 'service',
    costPaise: 0,
    bspMessageId,
    ts: msBig(ts),
  };
  await prisma.message.upsert({
    where: { tenantId_id: { tenantId, id: bspMessageId } },
    create: { tenantId, id: bspMessageId, ...base },
    update: base,
  });
}
