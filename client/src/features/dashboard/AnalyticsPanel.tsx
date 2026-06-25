/**
 * Dashboard analytics — a Stripe-flavoured trends panel. A time-range selector (7 / 30 / 90 days)
 * drives a single read from the existing Daily Report endpoint; the result feeds a delivered-vs-failed
 * area chart with hover insights, a delivery-rate line, and a compact totals header. Theme-aware
 * (colours come from CSS variables so dark mode just works). No new APIs or business logic — this
 * only reads what the Reports page already reads.
 */
import * as React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BadgeCheck, Send } from 'lucide-react';
import type { DailyReportRow } from '@thinkai/shared';

import { getDailyReport } from '../reports/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCount } from '@/lib/utils';

const DAY = 24 * 60 * 60 * 1000;

const RANGES = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

interface Point {
  date: string;
  label: string;
  sent: number;
  delivered: number;
  failed: number;
  rate: number | null;
}

/** "2024-06-21" -> "21 Jun" for compact axis + tooltip labels. */
function shortLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function toPoints(rows: DailyReportRow[]): Point[] {
  return rows.map((r) => ({
    date: r.date,
    label: shortLabel(r.date),
    sent: r.sent,
    delivered: r.delivered,
    failed: r.failed,
    rate: r.sent > 0 ? Math.round((r.delivered / r.sent) * 1000) / 10 : null,
  }));
}

export function AnalyticsPanel(): JSX.Element {
  const [range, setRange] = React.useState<RangeKey>('30d');
  const [points, setPoints] = React.useState<Point[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const days = RANGES.find((r) => r.key === range)?.days ?? 30;
    getDailyReport({ from: Date.now() - days * DAY, to: Date.now() })
      .then((res) => {
        if (!active) return;
        setPoints(toPoints(res.rows));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Could not load analytics.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range]);

  const totals = React.useMemo(
    () =>
      points.reduce(
        (a, p) => ({ sent: a.sent + p.sent, delivered: a.delivered + p.delivered, failed: a.failed + p.failed }),
        { sent: 0, delivered: 0, failed: 0 },
      ),
    [points],
  );
  const deliveryRate = totals.sent > 0 ? (totals.delivered / totals.sent) * 100 : null;
  const hasData = points.some((p) => p.sent > 0 || p.failed > 0);

  return (
    <Card>
      <CardHeader className="gap-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Analytics</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">Delivery and failure trends over time.</p>
        </div>
        <div
          className="inline-flex rounded-md border border-border p-0.5"
          role="tablist"
          aria-label="Analytics time range"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded-sm px-3 py-1.5 text-xs font-medium transition-colors',
                range === r.key
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {/* Range summary */}
        <div className="mb-5 grid grid-cols-3 gap-4">
          <SummaryStat icon={Send} label="Sent" value={loading ? null : formatCount(totals.sent)} />
          <SummaryStat
            icon={BadgeCheck}
            label="Delivery rate"
            value={loading ? null : deliveryRate === null ? '—' : `${deliveryRate.toFixed(1)}%`}
            tone={deliveryRate !== null && deliveryRate < 95 ? 'warning' : 'success'}
          />
          <SummaryStat
            icon={AlertTriangle}
            label="Failed"
            value={loading ? null : formatCount(totals.failed)}
            tone={totals.failed > 0 ? 'danger' : undefined}
          />
        </div>

        {loading ? (
          <Skeleton className="h-64 w-full rounded-md" />
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <AlertTriangle className="size-5 text-warning-emphasis" />
            <p className="text-sm font-medium text-foreground">Couldn’t load analytics</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : !hasData ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <Send className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No messages in this range</p>
            <p className="text-xs text-muted-foreground">Send a campaign to start seeing delivery trends here.</p>
          </div>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-delivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="grad-failed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={44}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="delivered"
                    name="Delivered"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    fill="url(#grad-delivered)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    name="Failed"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    fill="url(#grad-failed)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sent"
                    name="Sent"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
              <LegendKey color="hsl(var(--success))" label="Delivered" />
              <LegendKey color="hsl(var(--destructive))" label="Failed" />
              <LegendKey color="hsl(var(--muted-foreground))" label="Sent" dashed />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Send;
  label: string;
  value: string | null;
  tone?: 'success' | 'warning' | 'danger';
}): JSX.Element {
  const toneText =
    tone === 'danger'
      ? 'text-destructive-emphasis'
      : tone === 'warning'
        ? 'text-warning-emphasis'
        : tone === 'success'
          ? 'text-success-emphasis'
          : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      {value === null ? (
        <Skeleton className="mt-2 h-6 w-16 rounded" />
      ) : (
        <p className={cn('mt-1 text-xl font-semibold tabular-nums', toneText)}>{value}</p>
      )}
    </div>
  );
}

function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-4 rounded-full"
        style={dashed ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` } : { backgroundColor: color }}
      />
      {label}
    </span>
  );
}

interface TooltipPayloadItem {
  name?: string;
  dataKey?: string | number;
  value?: number;
  payload?: Point;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      <dl className="space-y-1">
        <Row swatch="hsl(var(--muted-foreground))" term="Sent" value={point ? formatCount(point.sent) : '—'} />
        <Row swatch="hsl(var(--success))" term="Delivered" value={point ? formatCount(point.delivered) : '—'} />
        <Row swatch="hsl(var(--destructive))" term="Failed" value={point ? formatCount(point.failed) : '—'} />
        {point && point.rate !== null && (
          <div className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground">
            {point.rate.toFixed(1)}% delivered
          </div>
        )}
      </dl>
    </div>
  );
}

function Row({ swatch, term, value }: { swatch: string; term: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ backgroundColor: swatch }} />
        {term}
      </dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export default AnalyticsPanel;
