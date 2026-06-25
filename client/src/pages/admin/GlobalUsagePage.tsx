/**
 * Admin Overview — usage, revenue, cost, and margin across every tenant.
 * Data: GET /api/admin/usage (money is integer paise; margin = revenue − Meta cost).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, MessageSquare, TrendingUp, Wallet } from 'lucide-react';
import type { UsageResponse } from '@thinkai/shared';
import { getUsage } from '../../api/adminApi';
import { ApiError } from '../../lib/apiClient';
import { PageHeader } from '@/components/patterns/page-header';
import { StatCard } from '@/components/patterns/stat-card';
import { EmptyState } from '@/components/patterns/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCount, formatPaise } from '@/lib/utils';

export function GlobalUsagePage(): JSX.Element {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getUsage();
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load usage.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const marginPct = useMemo(() => {
    if (!data || data.totals.revenuePaise <= 0) return null;
    return (data.totals.marginPaise / data.totals.revenuePaise) * 100;
  }, [data]);

  const topByRevenue = useMemo(() => {
    if (!data) return [];
    return [...data.rows]
      .sort((a, b) => b.revenuePaise - a.revenuePaise)
      .slice(0, 8)
      .map((r) => ({ name: r.name, revenue: r.revenuePaise / 100, margin: r.marginPaise }));
  }, [data]);

  return (
    <div className="space-y-6">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All tenants
      </Link>

      <PageHeader
        title="Usage & revenue"
        description="Billable volume, revenue, Meta cost, and margin across every tenant."
      />

      {error && !loading && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-emphasis">{error}</Card>
      )}

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-lg" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Messages" value={data.totals.messageCount} format={formatCount} icon={<MessageSquare />} />
          <StatCard label="Revenue" value={formatPaise(data.totals.revenuePaise)} icon={<Wallet />} />
          <StatCard label="Meta cost" value={formatPaise(data.totals.costPaise)} />
          <StatCard
            label="Margin"
            value={formatPaise(data.totals.marginPaise)}
            delta={marginPct === null ? undefined : Math.round(marginPct * 10) / 10}
            deltaSuffix="%"
            icon={<TrendingUp />}
          />
        </div>
      ) : null}

      {/* Revenue by tenant */}
      {!loading && data && data.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top tenants by revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topByRevenue} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12, fill: '#475467' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(210 40% 96%)' }}
                    formatter={(v: number) => [formatPaise(Math.round(v * 100)), 'Revenue']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #E5E9F0', fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={26}>
                    {topByRevenue.map((row) => (
                      <Cell key={row.name} fill={row.margin >= 0 ? '#16B364' : '#F04438'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-tenant table */}
      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : data && data.rows.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="No usage recorded yet"
          description="Once tenants start sending billable messages, revenue and margin will appear here."
        />
      ) : data ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 text-right font-medium">Messages</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                  <th className="px-4 py-3 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.tenantId} className="border-b border-border/70 transition-colors last:border-0 hover:bg-secondary/60">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/tenants/${encodeURIComponent(row.tenantId)}`}
                        className="font-medium text-foreground hover:text-primary-emphasis"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatCount(row.messageCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatPaise(row.revenuePaise)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatPaise(row.costPaise)}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium tabular-nums ${
                        row.marginPaise >= 0 ? 'text-success-emphasis' : 'text-destructive-emphasis'
                      }`}
                    >
                      {formatPaise(row.marginPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
