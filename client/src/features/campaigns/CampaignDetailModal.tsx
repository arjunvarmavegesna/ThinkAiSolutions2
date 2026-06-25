/**
 * Campaign detail (1.2) — funnel counters + a page of per-recipient progress rows, read from
 * GET /api/campaigns/:id. While the campaign is still queued/sending it polls so the worker's
 * progress shows live. (The richer Campaign Tracking Report is feature 2.2.)
 */
import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { CampaignDetailResponse, CampaignRecipientStatus } from '@thinkai/shared';
import { ApiError } from '../../lib/apiClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { downloadCsv } from '../reports/csv';
import { getCampaign, getCampaignReport } from './api';

const RECIPIENT_VARIANT: Record<CampaignRecipientStatus, BadgeProps['variant']> = {
  pending: 'outline',
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
};

function fmt(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CampaignDetailModal({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}): JSX.Element {
  const [data, setData] = useState<CampaignDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getCampaign(campaignId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load campaign.');
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while the campaign is still in flight.
  const active = data?.campaign.status === 'queued' || data?.campaign.status === 'sending';
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [active, load]);

  const c = data?.campaign;

  // Export ALL recipient rows by paging through the report endpoint.
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const rows: Array<Array<string | number>> = [];
      let cursor: string | undefined;
      do {
        const page = await getCampaignReport(campaignId, cursor);
        for (const r of page.rows) {
          rows.push([r.phone, r.status, r.error?.detail ?? '', new Date(r.updatedAt).toISOString()]);
        }
        cursor = page.nextCursor;
      } while (cursor);
      downloadCsv(`campaign_${campaignId}_recipients.csv`, ['Phone', 'Status', 'Error', 'Updated'], rows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }, [campaignId]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0" hideClose>
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-5 py-4">
          <DialogTitle className="truncate">{c ? c.title : 'Campaign'}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting || !c}>
              <Download />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive-emphasis">
              {error}
            </p>
          )}

          {c && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <Stat label="Recipients" value={c.totalRecipients} />
                <Stat label="Sent" value={c.sent} tone="text-info-emphasis" />
                <Stat label="Delivered" value={c.delivered} tone="text-success-emphasis" />
                <Stat label="Read" value={c.read ?? 0} tone="text-success-emphasis" />
                <Stat label="Failed" value={c.failed} tone="text-destructive-emphasis" />
                <Stat label="Status" valueText={c.status} />
              </div>

              <p className="text-xs text-muted-foreground">
                Template: <span className="font-medium text-foreground">{c.templateName}</span> · Scheduled:{' '}
                {fmt(c.scheduledAt)}
                {data && ` · showing ${data.recipients.length} of ${data.recipientCount} recipients`}
              </p>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5">Phone</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Error</th>
                      <th className="px-3 py-2.5">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.recipients.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50">
                        <td className="px-3 py-2.5 font-mono text-xs">{r.phone}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant={RECIPIENT_VARIANT[r.status] ?? 'outline'} className="capitalize">
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-destructive-emphasis">{r.error?.detail ?? ''}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{fmt(r.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data && data.recipients.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No recipients.</p>
                )}
              </div>
            </>
          )}

          {!c && !error && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  valueText,
  tone,
}: {
  label: string;
  value?: number;
  valueText?: string;
  tone?: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold capitalize tabular-nums', tone ?? 'text-foreground')}>
        {valueText ?? value ?? 0}
      </p>
    </div>
  );
}
