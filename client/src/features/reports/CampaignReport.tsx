/**
 * Campaigns (2.2): per-campaign delivery funnel (sent/delivered/read/failed) from the campaign
 * counters, which status webhooks keep live. Per-recipient drill-down + CSV export live in the
 * campaign detail view (CampaignDetailModal → GET /api/campaigns/:id/report).
 */
import { useCallback, useEffect, useState } from 'react';

import { Download, RefreshCw } from 'lucide-react';
import type { CampaignDTO } from '@thinkai/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ApiError } from '../../lib/apiClient';
import { listCampaigns } from '../campaigns/api';
import { downloadCsv } from './csv';

const fmtTs = (ms: number): string => new Date(ms).toLocaleString('en-IN');
const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 100) : 0);

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  queued: 'info',
  sending: 'warning',
  completed: 'success',
  failed: 'danger',
};

export function CampaignReport(): JSX.Element {
  const [rows, setRows] = useState<CampaignDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCampaigns();
      setRows(res.campaigns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onExport(): void {
    downloadCsv(
      `campaign-report_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Created', 'Title', 'Template', 'Status', 'Recipients', 'Submitted', 'Sent', 'Delivered', 'Read', 'Failed', 'Delivered %'],
      rows.map((c) => [
        fmtTs(c.createdAt),
        c.title,
        c.templateName,
        c.status,
        c.totalRecipients,
        c.submitted,
        c.sent,
        c.delivered,
        c.read ?? 0,
        c.failed,
        pct(c.delivered, c.submitted || c.totalRecipients),
      ]),
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Campaign tracking</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Open a campaign from the Campaigns page for per-recipient progress + CSV export.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn(loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={onExport} disabled={rows.length === 0}>
            <Download />
            Export
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error && (
          <p className="mx-5 mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-emphasis">
            {error}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Recipients</th>
                <th className="px-5 py-3 text-right font-medium">Sent</th>
                <th className="px-5 py-3 text-right font-medium">Failed</th>
                <th className="px-5 py-3 font-medium">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3" colSpan={7}>
                        <Skeleton className="h-5 w-full rounded" />
                      </td>
                    </tr>
                  ))
                : rows.map((c) => {
                    const deliveredPct = pct(c.delivered, c.submitted || c.totalRecipients);
                    return (
                      <tr key={c.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50">
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{fmtTs(c.createdAt)}</td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-foreground">{c.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.templateName}</p>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={STATUS_VARIANT[c.status] ?? 'default'} className="capitalize">
                            {c.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{c.totalRecipients}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground">{c.sent}</td>
                        <td className={`px-5 py-3 text-right tabular-nums ${c.failed > 0 ? 'text-destructive-emphasis' : 'text-muted-foreground'}`}>
                          {c.failed}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${deliveredPct}%` }} />
                            </div>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{deliveredPct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No campaigns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
