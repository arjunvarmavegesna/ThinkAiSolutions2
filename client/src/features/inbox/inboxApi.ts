/**
 * Thin typed wrappers over the Express inbox API. Every call goes through the
 * shared apiClient (which attaches the Firebase ID token and throws ApiError on
 * non-2xx). The client NEVER reads Firestore directly — these are the only ways
 * the inbox feature touches data.
 *
 * Routes (all under /api):
 *   GET  /inbox/conversations
 *   GET  /inbox/conversations/:id/messages
 *   POST /inbox/conversations/:id/messages   (SendTextRequest)
 *   POST /inbox/send-template                 (SendTemplateRequest)
 *   GET  /inbox/templates
 */
import type {
  ListConversationsResponse,
  ListMessagesResponse,
  ListTemplatesResponse,
  SendMessageResponse,
  SendTemplateRequest,
  SendTextRequest,
} from '@thinkai/shared';
import { apiClient } from '../../lib/apiClient';

/** Append an optional cursor query param to a path. */
function withCursor(path: string, cursor?: string): string {
  if (!cursor) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}cursor=${encodeURIComponent(cursor)}`;
}

/** Fetch the most recent conversations (server orders lastMessageAt desc). */
export function fetchConversations(cursor?: string): Promise<ListConversationsResponse> {
  return apiClient.get<ListConversationsResponse>(withCursor('/inbox/conversations', cursor));
}

/** Fetch a conversation's messages (server orders ts asc). */
export function fetchMessages(
  conversationId: string,
  cursor?: string,
): Promise<ListMessagesResponse> {
  const base = `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`;
  return apiClient.get<ListMessagesResponse>(withCursor(base, cursor));
}

/** Send a free-text reply inside an open service window. */
export function sendTextReply(
  conversationId: string,
  body: string,
): Promise<SendMessageResponse> {
  const payload: SendTextRequest = { body };
  return apiClient.post<SendMessageResponse>(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    payload,
  );
}

/** Send an approved template (creates/opens a conversation). */
export function sendTemplate(req: SendTemplateRequest): Promise<SendMessageResponse> {
  return apiClient.post<SendMessageResponse>('/inbox/send-template', req);
}

/** List approved templates available for sending. */
export function fetchApprovedTemplates(): Promise<ListTemplatesResponse> {
  return apiClient.get<ListTemplatesResponse>('/inbox/templates');
}
