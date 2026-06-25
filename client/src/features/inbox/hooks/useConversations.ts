/**
 * Polls the conversation list every ~5s, pausing while the tab is hidden
 * (document.hidden) to avoid wasted requests. Returns the current rows plus a
 * manual refresh and loading/error state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationDTO } from '@thinkai/shared';
import { ApiError } from '../../../lib/apiClient';
import { fetchConversations } from '../inboxApi';
import { CONVERSATIONS_POLL_MS } from '../types';

export interface UseConversationsResult {
  conversations: ConversationDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track mount status so an in-flight poll resolving after unmount is a no-op.
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetchConversations();
      if (!mountedRef.current) return;
      setConversations(res.items);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof ApiError ? err.message : 'Failed to load conversations';
      setError(message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Immediate first load, then interval polling that skips hidden tabs.
    void load();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, CONVERSATIONS_POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  return { conversations, loading, error, refresh: load };
}
