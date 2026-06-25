/**
 * Encapsulates the two send actions (free-text reply + template send) with a
 * shared in-flight/error state. Callers pass an onSent callback so the page can
 * refresh the thread / conversation list immediately after a successful send.
 */
import { useCallback, useState } from 'react';
import type { SendMessageResponse, SendTemplateRequest } from '@thinkai/shared';
import { ApiError } from '../../../lib/apiClient';
import { sendTemplate, sendTextReply } from '../inboxApi';

export interface UseSendMessageResult {
  pending: boolean;
  error: string | null;
  clearError: () => void;
  /** Free-text reply inside an open window. Returns null on failure (error set). */
  sendText: (conversationId: string, body: string) => Promise<SendMessageResponse | null>;
  /** Approved-template send. Returns null on failure (error set). */
  sendTemplateMessage: (req: SendTemplateRequest) => Promise<SendMessageResponse | null>;
}

export function useSendMessage(): UseSendMessageResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<SendMessageResponse>): Promise<SendMessageResponse | null> => {
      setPending(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Failed to send message';
        setError(message);
        return null;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const sendText = useCallback(
    (conversationId: string, body: string) =>
      run(() => sendTextReply(conversationId, body)),
    [run],
  );

  const sendTemplateMessage = useCallback(
    (req: SendTemplateRequest) => run(() => sendTemplate(req)),
    [run],
  );

  const clearError = useCallback(() => setError(null), []);

  return { pending, error, clearError, sendText, sendTemplateMessage };
}
