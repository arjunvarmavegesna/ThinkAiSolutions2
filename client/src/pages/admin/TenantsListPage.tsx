/**
 * Tenant Control Center (Direct Admin).
 *
 * Replaces the old read-only "reseller" table with a searchable, filterable
 * operations surface: derived health signals, KPI summary, bulk selection, and a
 * working CSV export. Data still comes solely from GET /api/admin/tenants — we
 * never invent metrics we don't have (status is active|suspended), so usage/MRR
 * columns are intentionally omitted until the API exposes them.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
  Building2,
  Download,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { TenantDTO } from '@thinkai/shared';
import { listTenants } from '../../api/adminApi';
import { ApiError } from '../../lib/apiClient';
import { PageHeader } from '@/components/patterns/page-header';
import { StatCard } from '@/components/patterns/stat-card';
import { HealthDot, type HealthStatus } from '@/components/patterns/health-dot';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type HealthBucket = HealthStatus;

/** Derive an operator-facing health signal from the data we actually have. */
function tenantHealth(t: TenantDTO): { status: HealthBucket; label: string } {
  if (t.status === 'suspended') return { status: 'attention', label: 'Suspended' };
  if (!t.billing?.gstin || !t.plan) return { status: 'pending', label: 'Setup pending' };
  return { status: 'healthy', label: 'Healthy' };
}

function planLabel(plan: string | undefined): string {
  if (!plan) return '—';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function formatDate(ms: number | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TenantsListPage(): JSX.Element {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | HealthBucket>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listTenants();
        if (!cancelled) setTenants(res.tenants);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load tenants.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const plans = useMemo(
    () => Array.from(new Set(tenants.map((t) => t.plan).filter(Boolean))) as string[],
    [tenants],
  );

  const kpis = useMemo(() => {
    let active = 0;
    let suspended = 0;
    let pending = 0;
    for (const t of tenants) {
      if (t.status === 'suspended') suspended += 1;
      else active += 1;
      if (tenantHealth(t).status === 'pending') pending += 1;
    }
    return { total: tenants.length, active, suspended, pending };
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (planFilter !== 'all' && t.plan !== planFilter) return false;
      if (healthFilter !== 'all' && tenantHealth(t).status !== healthFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.plan ?? '').toLowerCase().includes(q) ||
        (t.billing?.gstin ?? '').toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    });
  }, [tenants, query, statusFilter, planFilter, healthFilter]);

  const hasFilters = query !== '' || statusFilter !== 'all' || healthFilter !== 'all' || planFilter !== 'all';

  function clearFilters(): void {
    setQuery('');
    setStatusFilter('all');
    setHealthFilter('all');
    setPlanFilter('all');
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));

  function toggleAll(): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((t) => next.delete(t.id));
      else filtered.forEach((t) => next.add(t.id));
      return next;
    });
  }

  function toggleOne(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exportSelected(): void {
    const rows = tenants
      .filter((t) => selected.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        plan: t.plan ?? '',
        status: t.status,
        health: tenantHealth(t).label,
        gstin: t.billing?.gstin ?? '',
        created: formatDate(t.createdAt),
      }));
    const csv = Papa.unparse(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants"
        description="Every business onboarded to your WhatsApp platform — health, plan, and onboarding at a glance."
        actions={
          <Button asChild>
            <Link to="/admin/tenants/new">
              <Plus />
              Onboard tenant
            </Link>
          </Button>
        }
      />

      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total tenants" value={kpis.total} />
        <StatCard label="Active" value={kpis.active} />
        <StatCard label="Setup pending" value={kpis.pending} hint="Missing plan or GSTIN" />
        <StatCard label="Suspended" value={kpis.suspended} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, GSTIN, plan…"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu
            label="Status"
            value={statusFilter === 'all' ? null : statusFilter}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
            ]}
            onSelect={(v) => setStatusFilter((v as 'active' | 'suspended') ?? 'all')}
          />
          <FilterMenu
            label="Health"
            value={healthFilter === 'all' ? null : healthFilter}
            options={[
              { value: 'healthy', label: 'Healthy' },
              { value: 'pending', label: 'Setup pending' },
              { value: 'attention', label: 'Attention required' },
            ]}
            onSelect={(v) => setHealthFilter((v as HealthBucket) ?? 'all')}
          />
          {plans.length > 0 && (
            <FilterMenu
              label="Plan"
              value={planFilter === 'all' ? null : planFilter}
              options={plans.map((p) => ({ value: p, label: planLabel(p) }))}
              onSelect={(v) => setPlanFilter(v ?? 'all')}
            />
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X />
              Clear
            </Button>
          )}
          <span className="ml-auto text-sm text-muted-foreground sm:ml-1">
            {filtered.length} of {tenants.length}
          </span>
        </div>
      </div>

      {error && !loading && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-emphasis">{error}</Card>
      )}

      {loading ? (
        <TableSkeleton />
      ) : tenants.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="No tenants yet"
          description="Onboard your first business to start sending on the WhatsApp Cloud API under your brand."
          action={
            <Button asChild>
              <Link to="/admin/tenants/new">
                <Plus />
                Onboard your first tenant
              </Link>
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SlidersHorizontal />}
          title="No tenants match these filters"
          description="Try a different search or clear the active filters."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 border-b border-border bg-accent/60 px-4 py-2.5 text-sm">
              <span className="font-medium text-foreground">{selected.size} selected</span>
              <Button variant="outline" size="sm" onClick={exportSelected}>
                <Download />
                Export CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      className="size-4 cursor-pointer rounded border-border accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Health</th>
                  <th className="px-4 py-3 font-medium">GSTIN</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const health = tenantHealth(t);
                  const isSelected = selected.has(t.id);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/admin/tenants/${encodeURIComponent(t.id)}`)}
                      className={cn(
                        'cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-secondary/60',
                        isSelected && 'bg-accent/40',
                      )}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${t.name}`}
                          checked={isSelected}
                          onChange={() => toggleOne(t.id)}
                          className="size-4 cursor-pointer rounded border-border accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{t.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{t.id}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{planLabel(t.plan)}</td>
                      <td className="px-4 py-3">
                        <HealthDot status={health.status} showLabel label={health.label} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {t.billing?.gstin || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-primary-emphasis">Manage →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Compact filter dropdown with a single active value. */
function FilterMenu({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onSelect: (value: string | null) => void;
}): JSX.Element {
  const active = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn(value && 'border-primary/40 text-foreground')}>
          {label}
          {active && <span className="text-primary-emphasis">· {active.label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Filter by {label.toLowerCase()}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={value === o.value}
            onCheckedChange={(checked) => onSelect(checked ? o.value : null)}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableSkeleton(): JSX.Element {
  return (
    <Card className="overflow-hidden p-0">
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="size-4 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
    </Card>
  );
}
