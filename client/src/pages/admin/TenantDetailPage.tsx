/**
 * Tenant Workspace (Direct Admin) — a tabbed operations surface that replaces the
 * old long settings form. Identity + actions live in a sticky header; the work is
 * split across Overview / WhatsApp / Templates / Billing tabs.
 *
 * All data + handlers are preserved from the previous page (identity from
 * GET /api/admin/tenants filtered to :tenantId; no direct Firestore access).
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  LayoutGrid,
  Phone,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import type { ConnectWabaRequest, TenantDTO } from '@thinkai/shared';
import { connectWaba, exchangeEmbeddedSignupCode, listTenants, syncTemplates } from '../../api/adminApi';
import { ApiError } from '../../lib/apiClient';
import { WabaConnectForm } from '../../components/admin/WabaConnectForm';
import { EmbeddedSignupButton } from '../../components/admin/EmbeddedSignupButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HealthDot, type HealthStatus } from '@/components/patterns/health-dot';
import { cn } from '@/lib/utils';

function tenantHealth(t: TenantDTO): { status: HealthStatus; label: string } {
  if (t.status === 'suspended') return { status: 'attention', label: 'Suspended' };
  if (!t.billing?.gstin || !t.plan) return { status: 'pending', label: 'Setup pending' };
  return { status: 'healthy', label: 'Healthy' };
}

export function TenantDetailPage(): JSX.Element {
  const { tenantId = '' } = useParams<{ tenantId: string }>();

  const [tenant, setTenant] = useState<TenantDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTenant = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listTenants();
      const found = res.tenants.find((t) => t.id === tenantId) ?? null;
      setTenant(found);
      if (!found) setLoadError('Tenant not found.');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load tenant.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  // ---- WABA connect ----
  const [wabaSubmitting, setWabaSubmitting] = useState(false);
  const [wabaError, setWabaError] = useState<string | null>(null);
  const [wabaSuccess, setWabaSuccess] = useState<string | null>(null);

  async function handleConnectWaba(waba: Omit<ConnectWabaRequest, 'tenantId'>): Promise<void> {
    setWabaError(null);
    setWabaSuccess(null);
    setWabaSubmitting(true);
    try {
      await connectWaba({ tenantId, ...waba });
      setWabaSuccess(
        'WABA connected. Sends use the global Meta token; inbound + status webhooks arrive at the Meta App level (no per-number registration).',
      );
    } catch (err) {
      setWabaError(err instanceof ApiError ? err.message : 'Failed to connect the WhatsApp number.');
    } finally {
      setWabaSubmitting(false);
    }
  }

  // ---- Template sync ----
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function handleSyncTemplates(): Promise<void> {
    setSyncResult(null);
    setSyncing(true);
    try {
      const res = await syncTemplates(tenantId);
      setSyncResult(`Synced ${res.synced} template(s) from Meta.`);
    } catch (err) {
      setSyncResult(err instanceof ApiError ? `Sync failed: ${err.message}` : 'Template sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError || !tenant) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-emphasis">
          {loadError ?? 'Tenant not found.'}
        </Card>
      </div>
    );
  }

  const health = tenantHealth(tenant);

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Sticky workspace header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{tenant.name}</h1>
            <Badge variant={health.status === 'healthy' ? 'success' : health.status === 'attention' ? 'danger' : 'warning'}>
              <HealthDot status={health.status} />
              {health.label}
            </Badge>
            {tenant.plan && <Badge variant="outline">{tenant.plan}</Badge>}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{tenant.id}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline">
            <Link to={`/admin/pricing/${encodeURIComponent(tenantId)}`}>Edit pricing</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutGrid />
            Overview
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <Phone />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="templates">
            <FileText />
            Templates
          </TabsTrigger>
          <TabsTrigger value="billing">
            <Receipt />
            Billing
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Detail label="Tenant ID" value={tenant.id} mono />
                <Detail label="Plan" value={tenant.plan} />
                <Detail label="Status" value={tenant.status} />
                <Detail label="Created" value={tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString('en-IN') : undefined} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <HealthDot status={health.status} showLabel label={health.label} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {health.status === 'healthy'
                    ? 'This tenant is fully configured and active.'
                    : health.status === 'pending'
                      ? 'Complete billing (GSTIN) and plan to finish onboarding.'
                      : 'This tenant is suspended — sends are blocked until reactivated.'}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* WhatsApp */}
        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp number</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect this tenant's number via Meta Embedded Signup. The client authorizes in the popup — we never
                handle a per-client Meta key.
              </p>
              <EmbeddedSignupButton
                onConnected={loadTenant}
                exchange={(c) => exchangeEmbeddedSignupCode({ tenantId, ...c })}
              />

              <details className="group rounded-md border border-border p-4">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  Manual connect (metaCloud test number / legacy)
                </summary>
                <div className="mt-4">
                  <WabaConnectForm
                    onSubmit={handleConnectWaba}
                    submitting={wabaSubmitting}
                    submitLabel="Connect WABA"
                    error={wabaError}
                  />
                  {wabaSuccess && <Alert tone="success">{wabaSuccess}</Alert>}
                </div>
              </details>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pull the latest approved templates from Meta so this tenant can send them.
              </p>
              <Button onClick={handleSyncTemplates} disabled={syncing}>
                <RefreshCw className={cn(syncing && 'animate-spin')} />
                {syncing ? 'Syncing…' : 'Sync templates from Meta'}
              </Button>
              {syncResult && (
                <Alert tone={syncResult.startsWith('Sync failed') ? 'danger' : 'success'}>{syncResult}</Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Billing details</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link to={`/admin/pricing/${encodeURIComponent(tenantId)}`}>Edit pricing</Link>
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Legal name" value={tenant.billing?.legalName} />
              <Detail label="GSTIN" value={tenant.billing?.gstin} mono />
              <Detail label="State code" value={tenant.billing?.stateCode} />
              <Detail label="Address" value={tenant.billing?.address} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink(): JSX.Element {
  return (
    <Link
      to="/admin"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      All tenants
    </Link>
  );
}

function Alert({ tone, children }: { tone: 'success' | 'danger'; children: ReactNode }): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-sm',
        tone === 'success'
          ? 'border-success/25 bg-success/10 text-success-emphasis'
          : 'border-destructive/25 bg-destructive/10 text-destructive-emphasis',
      )}
    >
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value?: string; mono?: boolean }): JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-sm text-foreground', mono && 'font-mono')}>{value || '—'}</dd>
    </div>
  );
}
