/**
 * Messages (2.4): a filtered, exportable log of the tenant's messages, plus at-a-glance
 * category mix and top-template breakdowns derived client-side from the loaded rows (pure
 * presentation — no extra API calls). Reads GET /api/reports/messages. Filters apply on
 * "Apply"; "Export CSV" downloads the currently-loaded rows.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { Download } from 'lucide-react';

import {
  MESSAGE_CATEGORIES,
  MESSAGE_DIRECTIONS,
  MESSAGE_STATUSES,
  paiseToRupees,
} from '@thinkai/shared';
import type { ReportMessageRow } from '@thinkai/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCount } from '@/lib/utils';
import { ApiError } from '../../lib/apiClient';
import { getMessageReport } from './api';
import { downloadCsv } from './csv';

const DAY = 24 * 60 * 60 * 1000;
const toDateInput = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const startOfDayMs = (d: string): number => new Date(`${d}T00:00:00`).getTime();
const endOfDayMs = (d: string): number => new Date(`${d}T23:59:59.999`).getTime();
const fmtTs = (ms: number): string => new Date(ms).toLocaleString('en-IN');

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  queued: 'default',
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
};

const inputCls =
  'h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export function MessageReport(): JSX.Element {
  const [fromDate, setFromDate] = useState(toDateInput(Date.now() - 30 * DAY));
  const [toDate, setToDate] = useState(toDateInput(Date.now()));
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');

  const [rows, setRows] = useState<ReportMessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMessageReport({
        from: startOfDayMs(fromDate),
        to: endOfDayMs(toDate),
        direction: direction || undefined,
        status: status || undefined,
        category: category || undefined,
        q: q.trim() || undefined,
        limit: 1000,
      });
      setRows(res.rows);
      setTotal(res.total);
      setTruncated(res.truncated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the report.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, direction, status, category, q]);

  // Load once on mount; thereafter the user re-runs via Apply.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onApply(e: FormEvent): void {
    e.preventDefault();
    void load();
  }

  function onExport(): void {
    downloadCsv(
      `message-report_${fromDate}_to_${toDate}.csv`,
      ['Time', 'Direction', 'Channel', 'Contact', 'Type', 'Template', 'Status', 'Category', 'Cost (₹)'],
      rows.map((r) => [
        fmtTs(r.ts),
        r.direction,
        r.channel,
        r.contactPhone,
        r.type,
        r.templateName ?? '',
        r.status,
        r.category,
        paiseToRupees(r.costPaise).toFixed(2),
      ]),
    );
  }

  // Derived breakdowns over the loaded rows (presentation only).
  const categoryMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [rows]);

  const topTemplates = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.templateName) m.set(r.templateName, (m.get(r.templateName) ?? 0) + 1);
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [rows]);

  const maxCat = Math.max(1, ...categoryMix.map((c) => c.count));
  const maxTpl = Math.max(1, ...topTemplates.map((t) => t.count));

  return (
    <div className="space-y-6">
      {/* Filter toolbar */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={onApply} className="flex flex-wrap items-end gap-3">
            <Field label="From">
              <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="To">
              <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Direction">
              <select value={direction} onChange={(e) => setDirection(e.target.value)} className={inputCls}>
                <option value="">All</option>
                {MESSAGE_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>{d === 'out' ? 'Outbound' : 'Inbound'}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option value="">All</option>
                {MESSAGE_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                <option value="">All</option>
                {MESSAGE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </Field>
            <Field label="Search">
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="phone or template" className={inputCls} />
            </Field>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onExport} disabled={rows.length === 0}>
              <Download />
              Export
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-emphasis">{error}</Card>
      )}

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard title="Category mix" empty={categoryMix.length === 0} loading={loading}>
          {categoryMix.map((c) => (
            <BarRow key={c.name} label={c.name} value={c.count} pct={(c.count / maxCat) * 100} capitalize />
          ))}
        </BreakdownCard>
        <BreakdownCard title="Top templates" empty={topTemplates.length === 0} loading={loading}>
          {topTemplates.map((t) => (
            <BarRow key={t.name} label={t.name} value={t.count} pct={(t.count / maxTpl) * 100} mono />
          ))}
        </BreakdownCard>
      </div>

      {/* Message log */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Message log</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Showing {formatCount(rows.length)} of {formatCount(total)}
            </span>
            {truncated && <Badge variant="warning">capped — narrow dates</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">Dir</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Template</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 text-right font-medium">Cost (₹)</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-5 py-3" colSpan={8}>
                          <Skeleton className="h-5 w-full rounded" />
                        </td>
                      </tr>
                    ))
                  : rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50">
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{fmtTs(r.ts)}</td>
                        <td className="px-5 py-3">
                          <span
                            className={cn(
                              'inline-flex size-5 items-center justify-center rounded-full text-xs',
                              r.direction === 'out' ? 'bg-info/10 text-info-emphasis' : 'bg-success/10 text-success-emphasis',
                            )}
                            title={r.direction === 'out' ? 'Outbound' : 'Inbound'}
                          >
                            {r.direction === 'out' ? '↑' : '↓'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-foreground">{r.contactPhone}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.type}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.templateName ?? '—'}</td>
                        <td className="px-5 py-3">
                          <Badge variant={STATUS_VARIANT[r.status] ?? 'default'} className="capitalize">
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 capitalize text-muted-foreground">{r.category}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground">{paiseToRupees(r.costPaise).toFixed(2)}</td>
                      </tr>
                    ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      No messages in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function BreakdownCard({
  title,
  empty,
  loading,
  children,
}: {
  title: string;
  empty: boolean;
  loading: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-6 w-full rounded" />
            <Skeleton className="h-6 w-full rounded" />
            <Skeleton className="h-6 w-2/3 rounded" />
          </>
        ) : empty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No data in this range.</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function BarRow({
  label,
  value,
  pct,
  mono,
  capitalize,
}: {
  label: string;
  value: number;
  pct: number;
  mono?: boolean;
  capitalize?: boolean;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className={cn('truncate text-foreground', mono && 'font-mono text-xs', capitalize && 'capitalize')} title={label}>
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}
