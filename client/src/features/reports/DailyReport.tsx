/**
 * Overview (2.3): the modern analytics dashboard — KPI cards, message-trend and delivery
 * charts, a spend strip, and a per-day table over a selected range. Reads GET /api/reports/daily
 * (derived from stored `messages`; no Meta calls). Range presets + CSV export.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle2, Download, Send, TrendingUp, XCircle } from 'lucide-react';

import { paiseToRupees } from '@thinkai/shared';
import type { DailyReportRow } from '@thinkai/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/patterns/stat-card';
import { formatCount } from '@/lib/utils';
import { ApiError } from '../../lib/apiClient';
import { getDailyReport } from './api';
import { downloadCsv } from './csv';

const DAY = 24 * 60 * 60 * 1000;
const toDateInput = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const startOfDayMs = (d: string): number => new Date(`${d}T00:00:00`).getTime();
const endOfDayMs = (d: string): number => new Date(`${d}T23:59:59.999`).getTime();

const EMPTY_TOTALS = { submitted: 0, sent: 0, delivered: 0, failed: 0, received: 0, costPaise: 0 };

/** Shared chart tooltip styling (Stripe-style soft card). */
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #E5E9F0',
  boxShadow: '0 12px 32px -8px rgba(11,18,32,0.12)',
  fontSize: 12,
} as const;

const inputCls =
  'h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export function DailyReport(): JSX.Element {
  const [fromDate, setFromDate] = useState(toDateInput(Date.now() - 30 * DAY));
  const [toDate, setToDate] = useState(toDateInput(Date.now()));

  const [rows, setRows] = useState<DailyReportRow[]>([]);
  const [totals, setTotals] = useState<Omit<DailyReportRow, 'date'>>(EMPTY_TOTALS);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDailyReport({ from: startOfDayMs(from), to: endOfDayMs(to) });
      setRows(res.rows);
      setTotals(res.totals);
      setTruncated(res.truncated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(fromDate, toDate);
    // Mount-only initial load; thereafter the user re-runs via Apply / presets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onApply(e: FormEvent): void {
    e.preventDefault();
    void load(fromDate, toDate);
  }

  /** Jump to a trailing-N-days window and reload immediately. */
  function applyPreset(days: number): void {
    const from = toDateInput(Date.now() - (days - 1) * DAY);
    const to = toDateInput(Date.now());
    setFromDate(from);
    setToDate(to);
    void load(from, to);
  }

  function onExport(): void {
    downloadCsv(
      `analytics-overview_${fromDate}_to_${toDate}.csv`,
      ['Date', 'Submitted', 'Sent', 'Delivered', 'Failed', 'Received', 'Spend (₹)'],
      rows.map((r) => [
        r.date,
        r.submitted,
        r.sent,
        r.delivered,
        r.failed,
        r.received,
        paiseToRupees(r.costPaise).toFixed(2),
      ]),
    );
  }

  const deliveryRate = totals.sent > 0 ? (totals.delivered / totals.sent) * 100 : null;
  const failRate = totals.sent > 0 ? (totals.failed / totals.sent) * 100 : null;
  const presetDays = useMemo(() => {
    const span = Math.round((endOfDayMs(toDate) - startOfDayMs(fromDate)) / DAY) + 1;
    return span;
  }, [fromDate, toDate]);

  // Chart x-axis is friendlier as MM-DD.
  const chartData = rows.map((r) => ({ ...r, label: r.date.slice(5) }));
  const hasData = rows.length > 0;

  return (
    <div className="space-y-6">
      {/* Compact toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-xs">
          {[
            { label: '7D', days: 7 },
            { label: '30D', days: 30 },
            { label: '90D', days: 90 },
          ].map((p) => {
            const active = presetDays === p.days;
            return (
              <button
                key={p.days}
                type="button"
                onClick={() => applyPreset(p.days)}
                className={
                  active
                    ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                    : 'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={onApply} className="flex flex-wrap items-center gap-2">
          <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          <span className="text-sm text-muted-foreground">→</span>
          <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          <Button type="submit" size="sm" variant="outline" disabled={loading}>
            {loading ? 'Loading…' : 'Apply'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onExport} disabled={!hasData}>
            <Download />
            Export
          </Button>
        </form>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-emphasis">{error}</Card>
      )}
      {truncated && (
        <Card className="border-warning/30 bg-warning/10 p-3 text-sm text-warning-emphasis">
          Range too large — results were capped. Narrow the dates for full accuracy.
        </Card>
      )}

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Messages sent" value={totals.sent} format={formatCount} icon={<Send />} hint="In selected range" />
          <StatCard
            label="Delivered"
            value={totals.delivered}
            format={formatCount}
            icon={<CheckCircle2 />}
            hint={deliveryRate === null ? 'No sends yet' : `${deliveryRate.toFixed(1)}% of sent`}
          />
          <StatCard
            label="Failed"
            value={totals.failed}
            format={formatCount}
            icon={<XCircle />}
            hint={failRate === null ? '—' : `${failRate.toFixed(1)}% of sent`}
          />
          <StatCard
            label="Delivery rate"
            value={deliveryRate === null ? '—' : `${deliveryRate.toFixed(1)}%`}
            icon={<TrendingUp />}
            hint="Delivered ÷ sent"
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Message trends</CardTitle>
            <span className="text-xs text-muted-foreground">
              Spend ₹{paiseToRupees(totals.costPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-md" />
            ) : !hasData ? (
              <ChartEmpty />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#64748B" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#64748B" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gDelivered" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16B364" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#16B364" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#98A2B3' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#98A2B3' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="sent" name="Sent" stroke="#64748B" strokeWidth={2} fill="url(#gSent)" />
                    <Area
                      type="monotone"
                      dataKey="delivered"
                      name="Delivered"
                      stroke="#16B364"
                      strokeWidth={2.5}
                      fill="url(#gDelivered)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivered vs failed</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-md" />
            ) : !hasData ? (
              <ChartEmpty />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#98A2B3' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#98A2B3' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                    <Bar dataKey="delivered" name="Delivered" stackId="a" fill="#16B364" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="failed" name="Failed" stackId="a" fill="#F04438" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-day table (newest first) */}
      <Card>
        <CardHeader>
          <CardTitle>Daily breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 text-right font-medium">Submitted</th>
                  <th className="px-5 py-3 text-right font-medium">Sent</th>
                  <th className="px-5 py-3 text-right font-medium">Delivered</th>
                  <th className="px-5 py-3 text-right font-medium">Failed</th>
                  <th className="px-5 py-3 text-right font-medium">Received</th>
                  <th className="px-5 py-3 text-right font-medium">Spend (₹)</th>
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
                  : [...rows].reverse().map((r) => (
                      <tr key={r.date} className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50">
                        <td className="whitespace-nowrap px-5 py-3 font-medium text-foreground">{r.date}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{r.submitted}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{r.sent}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-success-emphasis">{r.delivered}</td>
                        <td className={`px-5 py-3 text-right tabular-nums ${r.failed > 0 ? 'text-destructive-emphasis' : 'text-muted-foreground'}`}>
                          {r.failed}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{r.received}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground">{paiseToRupees(r.costPaise).toFixed(2)}</td>
                      </tr>
                    ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      No activity in this range.
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

function ChartEmpty(): JSX.Element {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <TrendingUp className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">No data yet</p>
      <p className="max-w-[14rem] text-xs text-muted-foreground">
        Send messages or run a campaign — trends appear here once there's activity.
      </p>
    </div>
  );
}
