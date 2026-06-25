/**
 * Inbox read service — the read side of the team inbox.
 *
 * Powers two API endpoints (the client NEVER reads Firestore directly):
 *   GET /api/inbox/conversations               -> listConversations
 *   GET /api/inbox/conversations/:id/messages  -> listMessages
 *
 * Pagination is simple, stateless, cursor-based. A cursor is an opaque string we
 * hand back as `nextCursor`; the client echoes it on the next call. Internally the
 * cursor is just the document id of the last item returned. We resolve it back to a
 * DocumentSnapshot and feed Firestore `startAfter(snap)`, which paginates correctly
 * even when many rows share the same orderBy value (Firestore breaks ties by the
 * document's key). This avoids the off-by-one / duplicate-row pitfalls of value-only
 * cursors. All money is integer paise; all timestamps are epoch milliseconds.
 */

import type {
  ConversationDTO,
  ListConversationsResponse,
  ListMessagesResponse,
  MessageDTO,
} from '@thinkai/shared';

import { prisma } from '../../config/db';
import { toConversation, toMessage } from '../../db/mappers';
import { isWindowOpen } from '../conversations/window';

/** Default page size when the caller does not specify one. */
const DEFAULT_LIMIT = 30;
/** Hard ceiling so a client cannot request an unbounded page. */
const MAX_LIMIT = 100;

/** Clamp a caller-supplied limit into the allowed [1, MAX_LIMIT] range. */
function normalizeLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  const floored = Math.floor(limit);
  if (floored < 1) return DEFAULT_LIMIT;
  return Math.min(floored, MAX_LIMIT);
}

/**
 * List a tenant's conversations for the inbox, newest activity first.
 *
 * Ordered by `lastMessageAt` desc. Each row is decorated with a runtime `windowOpen`
 * flag (derived from `windowExpiresAt` vs now) so the client can enable/disable the
 * free-text reply composer without re-deriving the window math.
 */
export async function listConversations(
  tenantId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<ListConversationsResponse> {
  const limit = normalizeLimit(opts.limit);

  // Keyset pagination: the opaque cursor is the last conversation id. orderBy includes id as a
  // tie-breaker so the (non-unique) lastMessageAt ordering is stable across pages.
  const rows = await prisma.conversation.findMany({
    where: { tenantId },
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // one extra to detect a further page
    ...(opts.cursor
      ? { cursor: { tenantId_id: { tenantId, id: opts.cursor } }, skip: 1 }
      : {}),
  });

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  const now = Date.now();
  const items: ConversationDTO[] = page.map((row) => {
    const conv = toConversation(row);
    return { ...conv, windowOpen: isWindowOpen(conv.windowExpiresAt, now) };
  });

  const nextCursor = hasMore ? page[page.length - 1].id : undefined;
  return nextCursor ? { items, nextCursor } : { items };
}

/** Read a single message by our message id; null if not found. Used by the public API. */
export async function getMessage(
  tenantId: string,
  messageId: string,
): Promise<MessageDTO | null> {
  const row = await prisma.message.findUnique({
    where: { tenantId_id: { tenantId, id: messageId } },
  });
  if (!row) return null;
  return toMessage(row);
}

/**
 * List the message history of a single conversation, returned oldest→newest (chat order).
 *
 * A thread must OPEN on its most recent messages — like every chat app — so we read
 * newest-first from the DB and reverse the page for display. Reading oldest-first instead
 * (the previous behaviour) stranded the latest messages on a later page the client never
 * fetched, so any conversation with more than `limit` messages looked empty/stale even
 * though the messages existed. Scoped to the conversation via a `conversationId ==` filter.
 *
 * The opaque cursor is the OLDEST id on the page, so a follow-up call pages further BACK
 * into history (older messages), which is the only direction worth paginating in a chat.
 */
export async function listMessages(
  tenantId: string,
  conversationId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<ListMessagesResponse> {
  const limit = normalizeLimit(opts.limit);

  // Newest-first read so the first (cursor-less) page is the tail of the thread; id tie-breaks
  // the (non-unique) ts ordering for stable paging.
  const rows = await prisma.message.findMany({
    where: { tenantId, conversationId },
    orderBy: [{ ts: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(opts.cursor
      ? { cursor: { tenantId_id: { tenantId, id: opts.cursor } }, skip: 1 }
      : {}),
  });

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  // Cursor (for fetching OLDER history next) is the oldest row on the page — captured BEFORE
  // we reverse, while `page` is still newest→oldest.
  const nextCursor = hasMore ? page[page.length - 1].id : undefined;

  // Reverse to oldest→newest so the client renders top→bottom and appends new arrivals at the end.
  const items: MessageDTO[] = page.map(toMessage).reverse();

  return nextCursor ? { items, nextCursor } : { items };
}
