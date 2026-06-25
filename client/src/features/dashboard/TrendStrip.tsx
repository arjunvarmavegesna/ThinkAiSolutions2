/**
 * Compact 30-day message trend for the Home dashboard — a slim, calm sparkline-style strip, not a
 * full analytics surface. Three series (sent / delivered / failed) over the daily report the home
 * page already loads; deep analytics (range selector, drill-down) lives on the Reports page, one
 * click away via the header link. Themed with CSS variables so dark mode works. Lazy-loaded by the
 * dashboard so recharts stays out of the initial bundle. Presentation-only — no data fetching.
 */
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { Counts } from './useDashboardStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount } from '@/lib/utils';

type DailyPoint = { date: string } & Counts;

export function TrendStrip({ daily, todaySent }: { daily: DailyPoint[]; todaySent: number }): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle>30-day trend</CardTitle>
          <Legend />
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">Today: {formatCount(todaySent)} sent</span>
          <Link
            to="/reports"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-emphasis hover:underline"
          >
            Full analytics
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
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
                width={36}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--popover))',
                  boxShadow: '0 12px 32px -8px rgba(11,18,32,0.12)',
                  fontSize: 12,
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}
                cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              />
              <Line type="monotone" dataKey="sent" name="Sent" stroke="hsl(var(--muted-foreground))" strokeWidth={1.75} dot={false} />
              <Line type="monotone" dataKey="delivered" name="Delivered" stroke="hsl(var(--success))" strokeWidth={2.25} dot={false} />
              <Line type="monotone" dataKey="failed" name="Failed" stroke="hsl(var(--destructive))" strokeWidth={1.75} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Legend(): JSX.Element {
  return (
    <div className="hidden items-center gap-3 text-[11px] text-muted-foreground md:flex">
      <Key color="hsl(var(--muted-foreground))" label="Sent" />
      <Key color="hsl(var(--success))" label="Delivered" />
      <Key color="hsl(var(--destructive))" label="Failed" />
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export default TrendStrip;
