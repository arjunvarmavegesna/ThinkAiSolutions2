/**
 * Polls the open thread's messages every ~3s, pausing while the tab is hidden.
 * Re-initializes whenever the selected conversationId changes. Returns messages
 * (ordered ts asc, as the server returns them) plus loading/error + refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageDTO } from '@thinkai/shared';
import { ApiError } from '../../../lib/apiClient';
import { fetchMessages } from '../inboxApi';
import { MESSAGES_POLL_MS } from '../types';

export interface UseMessagesResult {
  messages: MessageDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMessages(conversationId: string | null): UseMessagesResult {
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  // Guards against a stale poll (for a previous conversation) overwriting state.
  const activeIdRef = useRef<string | null>(conversationId);

  const load = useCallback(async () => {
    const targetId = conversationId;
    if (!targetId) return;
    try {
      const res = await fetchMessages(targetId);
      // Drop the result if the user switched conversations mid-flight.
      if (!mountedRef.current || activeIdRef.current !== targetId) return;
      setMessages(res.items);
      setError(null);
    } catch (err) {
      if (!mountedRef.current || activeIdRef.current !== targetId) return;
      const message = err instanceof ApiError ? err.message : 'Failed to load messages';
      setError(message);
    } finally {
      if (mountedRef.current && activeIdRef.current === targetId) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    mountedRef.current = true;
    activeIdRef.current = conversationId;

    // Reset to a clean slate when switching threads.
    setMessages([]);
    setError(null);

    if (!conversationId) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoading(true);
    void load();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, MESSAGES_POLL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, [conversationId, load]);

  return { messages, loading, error, refresh: load };
}
