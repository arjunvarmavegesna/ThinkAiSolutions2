/**
 * Loads the tenant's approved templates for the send-template modal. Templates
 * change rarely, so this fetches once on demand (and exposes a manual refresh)
 * rather than polling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TemplateDTO } from '@thinkai/shared';
import { ApiError } from '../../../lib/apiClient';
import { fetchApprovedTemplates } from '../inboxApi';

export interface UseApprovedTemplatesResult {
  templates: TemplateDTO[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useApprovedTemplates(enabled = true): UseApprovedTemplatesResult {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApprovedTemplates();
      if (!mountedRef.current) return;
      setTemplates(res.templates);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof ApiError ? err.message : 'Failed to load templates';
      setError(message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) void load();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, load]);

  return { templates, loading, error, refresh: load };
}
