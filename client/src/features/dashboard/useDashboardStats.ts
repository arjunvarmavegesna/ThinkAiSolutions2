import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/apiClient';

export interface Counts {
  submitted: number;
  sent: number;
  delivered: number;
  failed: number;
}
export interface DashboardStats {
  today: Counts;
  last30: Counts;
  daily: Array<{ date: string } & Counts>;
}

/** Fetch the tenant's message stats for the home dashboard. */
export function useDashboardStats(): {
  data: DashboardStats | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Cache-buster bypasses any stale Hosting-CDN entry for this URL.
    apiClient
      .get<DashboardStats>(`/dashboard/stats?t=${Date.now()}`)
      .then((d) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Failed to load stats');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}
