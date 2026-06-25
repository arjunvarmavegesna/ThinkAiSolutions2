/**
 * Quality (3.1): each WhatsApp number's quality rating (green/yellow/red), messaging limit tier,
 * and a recent history trend. Reads GET /api/quality (fed by the phone_number_quality_update
 * webhook); "Refresh from Meta" pulls the live rating on demand.
 */
import { useCallback, useEffect, useState } from 'react';

import { Phone, RefreshCw } from 'lucide-react';
import type { MessagingTier, QualityRating, QualityWabaDTO } from '@thinkai/shared';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/patterns/empty-state';
import { cn } from '@/lib/utils';
import { ApiError } from '../../lib/apiClient';
import { getQuality } from './api';

const RATING_TONE: Record<QualityRating, string> = {
  green: 'border-success/20 bg-success/10 text-success-emphasis',
  yellow: 'border-warning/20 bg-warning/10 text-warning-emphasis',
  red: 'border-destructive/20 bg-destructive/10 text-destructive-emphasis',
  unknown: 'border-border bg-secondary/60 text-muted-foreground',
};

const RATING_DOT: Record<QualityRating, string> = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-destructive',
  unknown: 'bg-muted-foreground/50',
};

const TIER_LABEL: Record<MessagingTier, string> = {
  tier_50: '50 / 24h',
  tier_250: '250 / 24h',
  tier_1k: '1K / 24h',
  tier_10k: '10K / 24h',
  tier_100k: '100K / 24h',
  tier_unlimited: 'Unlimited',
  unknown: '—',
};

const fmtTs = (ms?: number): string => (ms ? new Date(ms).toLocaleString('en-IN') : '—');

export function QualityReport(): JSX.Element {
  const [wabas, setWabas] = useState<QualityWabaDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await getQuality(refresh);
      setWabas(res.wabas);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load quality.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Live sender quality + messaging tier per connected number.</p>
        <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing || loading}>
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing…' : 'Refresh from Meta'}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-emphasis">{error}</Card>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : wabas.length === 0 ? (
        <EmptyState
          icon={<Phone />}
          title="No connected WhatsApp number"
          description="Connect a number via Embedded Signup — its quality rating and messaging tier will appear here."
        />
      ) : (
        <div className="space-y-4">
          {wabas.map((w) => (
            <Card key={w.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Phone className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{w.displayName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{w.phoneNumber}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium capitalize',
                        RATING_TONE[w.qualityRating],
                      )}
                    >
                      <span className={cn('size-2 rounded-full', RATING_DOT[w.qualityRating])} />
                      {w.qualityRating}
                    </span>
                    <span className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                      Tier: {TIER_LABEL[w.messagingTier]}
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-[11px] text-muted-foreground">Updated: {fmtTs(w.qualityUpdatedAt)}</p>

                {w.history.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-secondary/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 font-medium">When</th>
                          <th className="px-3 py-2 font-medium">Rating</th>
                          <th className="px-3 py-2 font-medium">Tier</th>
                          <th className="px-3 py-2 font-medium">Event</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {w.history.map((h, i) => (
                          <tr key={i} className="border-b border-border/60 text-muted-foreground last:border-0">
                            <td className="whitespace-nowrap px-3 py-2 text-foreground">{fmtTs(h.ts)}</td>
                            <td className="px-3 py-2 capitalize">{h.rating ?? '—'}</td>
                            <td className="px-3 py-2">{h.tier ? TIER_LABEL[h.tier] : '—'}</td>
                            <td className="px-3 py-2">{h.event ?? '—'}</td>
                            <td className="px-3 py-2 capitalize">{h.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
