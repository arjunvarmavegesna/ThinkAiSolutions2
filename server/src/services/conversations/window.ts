/**
 * Conversation + 24h service-window helpers.
 *
 * The WhatsApp "service window" is a 24h window, opened/refreshed every time the
 * contact sends US an inbound message. While it is open we may send free-text
 * ("service") replies for free; once it closes we may only send approved templates.
 *
 * Conversation doc id is DETERMINISTIC from the contact phone (one conversation per
 * contact in Phase 1) so inbound and outbound paths converge on the same document
 * without a lookup query. All timestamps are epoch milliseconds.
 */

import { SERVICE_WINDOW_MS } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';

/**
 * Deterministic conversation id derived from a phone number.
 * Sanitizes to a stable token so it is a safe Firestore doc id and so that the same
 * contact always maps to the same conversation regardless of E.164 formatting noise.
 */
export function conversationIdForPhone(phone: string): string {
  // Strip everything that is not a digit (drops '+', spaces, dashes, parens).
  const digits = phone.replace(/[^0-9]/g, '');
  // Guard against an all-non-digit input so we never produce an empty doc id.
  return digits.length > 0 ? `c_${digits}` : `c_${phone.replace(/[^a-zA-Z0-9]/g, '') || 'unknown'}`;
}

/** Epoch ms at which a window opened at `fromTs` will close. */
export function computeWindowExpiry(fromTs: number): number {
  return fromTs + SERVICE_WINDOW_MS;
}

/** True while `windowExpiresAt` is still in the future relative to `now`. */
export function isWindowOpen(windowExpiresAt: number, now: number = Date.now()): boolean {
  return windowExpiresAt > now;
}

/** Short, safe preview string stored on the conversation for inbox lists. */
function clampPreview(preview?: string): string | undefined {
  if (preview === undefined) return undefined;
  const trimmed = preview.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

/**
 * Upsert a conversation on INBOUND message: refresh the 24h window, bump
 * lastMessageAt/preview, and increment the unread counter. Creates the doc if missing.
 * Returns the conversation id.
 */
export async function upsertConversationForInbound(
  tenantId: string,
  args: { contactPhone: string; contactName?: string; ts: number; preview?: string },
): Promise<string> {
  const { contactPhone, contactName, ts, preview } = args;
  const conversationId = conversationIdForPhone(contactPhone);
  const windowExpiresAt = computeWindowExpiry(ts);
  const cleanPreview = clampPreview(preview);

  // INSERT … ON CONFLICT DO UPDATE (Prisma upsert) is the race-safe primitive that mirrors the
  // Firestore runTransaction: create-or-extend atomically on the deterministic PK, with the
  // unread counter incremented at the SQL level. An inbound message always (re)opens the window.
  await prisma.conversation.upsert({
    where: { tenantId_id: { tenantId, id: conversationId } },
    create: {
      tenantId,
      id: conversationId,
      contactPhone,
      contactName: contactName ?? null,
      lastMessageAt: msBig(ts),
      lastMessagePreview: cleanPreview ?? null,
      windowExpiresAt: msBig(windowExpiresAt),
      unreadCount: 1,
      createdAt: msBig(ts),
    },
    update: {
      contactPhone,
      windowExpiresAt: msBig(windowExpiresAt),
      lastMessageAt: msBig(ts),
      unreadCount: { increment: 1 },
      ...(contactName ? { contactName } : {}),
      ...(cleanPreview ? { lastMessagePreview: cleanPreview } : {}),
    },
  });

  return conversationId;
}

/**
 * Touch a conversation on OUTBOUND message: create it if missing, update
 * lastMessageAt + preview. Crucially does NOT extend the service window — only an
 * inbound message from the contact can (re)open the window.
 * Returns the conversation id.
 */
export async function touchConversationForOutbound(
  tenantId: string,
  args: { contactPhone: string; ts: number; preview?: string },
): Promise<string> {
  const { contactPhone, ts, preview } = args;
  const conversationId = conversationIdForPhone(contactPhone);
  const cleanPreview = clampPreview(preview);

  // Create-if-missing, else update lastMessageAt/preview. Crucially the update clause omits
  // windowExpiresAt — only an inbound message can (re)open the window. On create the window is
  // left CLOSED (0) since the contact hasn't replied.
  await prisma.conversation.upsert({
    where: { tenantId_id: { tenantId, id: conversationId } },
    create: {
      tenantId,
      id: conversationId,
      contactPhone,
      lastMessageAt: msBig(ts),
      lastMessagePreview: cleanPreview ?? null,
      windowExpiresAt: msBig(0),
      unreadCount: 0,
      createdAt: msBig(ts),
    },
    update: {
      contactPhone,
      lastMessageAt: msBig(ts),
      ...(cleanPreview ? { lastMessagePreview: cleanPreview } : {}),
    },
  });

  return conversationId;
}

/** Reset the unread counter to 0 when an agent opens/reads the conversation. */
export async function markConversationRead(
  tenantId: string,
  conversationId: string,
): Promise<void> {
  // updateMany is a no-op if the conversation does not exist (vs. update which would throw).
  await prisma.conversation.updateMany({
    where: { tenantId, id: conversationId },
    data: { unreadCount: 0 },
  });
}
