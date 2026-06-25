/**
 * Tenant Home — a compact WhatsApp Business "command center". A single-line identity strip
 * (workspace · number · connection · quality · tier) instead of a heavy hero, a light inline
 * attention queue for what needs action, four compact KPIs with period-over-period trends, a slim
 * 30-day trend (deep analytics lives one click away on Reports), and recent campaigns + activity.
 * Young workspaces get an onboarding checklist instead of the strip.
 *
 * All data comes from existing read endpoints (useDashboardStats + useCommandCenter) — no new
 * APIs, schema, or business logic.
 */
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  FileText,
  Info,
  Megaphone,
  Send,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CampaignDTO, MessagingTier, QualityRating, ReportMessageRow } from '@thinkai/shared';

import { useAuth } from '../auth/useAuth';
import { useDashboardStats, type Counts } from '../features/dashboard/useDashboardStats';
import { useCommandCenter, type CommandCenterData } from '../features/dashboard/useCommandCenter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CountUp } from '@/components/ui/count-up';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatCount } from '@/lib/utils';

const TrendStrip = lazy(() => import('../features/dashboard/TrendStrip'));

const EMPTY: Counts = { submitted: 0, sent: 0, delivered: 0, failed: 0 };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  { label: 'New campaign', to: '/campaigns', icon: Megaphone, primary: true },
  { label: 'Inbox', to: '/inbox', icon: Send },
  { label: 'Contacts', to: '/contacts', icon: Upload },
];

const TIER_LABEL: Record<MessagingTier, string> = {
  tier_50: '50 / 24h',
  tier_250: '250 / 24h',
  tier_1k: '1K / 24h',
  tier_10k: '10K / 24h',
  tier_100k: '100K / 24h',
  tier_unlimited: 'Unlimited',
  unknown: 'Not rated',
};

const QUALITY: Record<QualityRating, { label: string; dot: string }> = {
  green: { label: 'High quality', dot: 'bg-success' },
  yellow: { label: 'Medium quality', dot: 'bg-warning' },
  red: { label: 'Low quality', dot: 'bg-destructive' },
  unknown: { label: 'Quality not rated', dot: 'bg-muted-foreground/50' },
};

export function Dashboard(): JSX.Element {
  const { user } = useAuth();
  const { data: stats, loading: statsLoading } = useDashboardStats();
  const { data: cc, loading: ccLoading } = useCommandCenter();

  const today = stats?.today ?? EMPTY;
  const last30 = stats?.last30 ?? EMPTY;
  const daily = stats?.daily ?? [];

  const deliveryRate = last30.sent > 0 ? (last30.delivered / last30.sent) * 100 : null;
  const firstName = (user?.displayName || user?.email || 'there').split(/[ @]/)[0];

  const trends = useMemo(() => computeTrends(daily), [daily]);
  const steps = buildSteps(cc, last30);
  const stepsDone = steps.filter((s) => s.done).length;
  const onboarding = !ccLoading && stepsDone < steps.length;
  const hasVolume = last30.sent > 0;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="animate-fade-in space-y-5">
        {/* Header: identity strip (set up) or setup banner + checklist (onboarding) */}
        {ccLoading ? (
          <Skeleton className="h-9 w-full max-w-xl rounded-md" />
        ) : onboarding ? (
          <>
            <SetupBanner firstName={firstName} connected={cc.connected} />
            <OnboardingChecklist steps={steps} stepsDone={stepsDone} />
          </>
        ) : (
          <IdentityStrip cc={cc} />
        )}

        {/* Attention — light inline lines, only when something needs action */}
        <AttentionQueue
          today={today}
          last30={last30}
          deliveryRate={deliveryRate}
          pendingTemplates={Math.max(0, cc.templatesTotal - cc.templatesApproved)}
          loading={statsLoading || ccLoading}
        />

        {/* KPIs — compact, with trend + tooltip + click-through */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <KpiCard
            to="/reports"
            label="Messages sent"
            tooltip="Template and session messages sent in the last 30 days."
            loading={statsLoading}
            value={last30.sent}
            format={formatCount}
            hint="Last 30 days"
            trend={trends.sent}
          />
          <KpiCard
            to="/reports"
            label="Delivery rate"
            tooltip="Delivered ÷ sent over the last 30 days. 95% and above is healthy."
            loading={statsLoading}
            value={deliveryRate}
            format={(n) => `${n.toFixed(1)}%`}
            emptyLabel="—"
            hint={deliveryRate === null ? 'No sends yet' : deliveryRate >= 95 ? 'Excellent' : 'Below 95% target'}
            hintTone={deliveryRate !== null && deliveryRate < 95 ? 'warning' : undefined}
            trend={trends.delivery}
          />
          <KpiCard
            to="/reports"
            label="Failed (30d)"
            tooltip="Messages that failed to deliver in the last 30 days. Lower is better."
            loading={statsLoading}
            value={last30.failed}
            format={formatCount}
            hint={last30.failed > 0 ? 'Review delivery issues' : 'No failures'}
            hintTone={last30.failed > 0 ? 'danger' : undefined}
            tone={last30.failed > 0 ? 'danger' : undefined}
            trend={trends.failed}
          />
          <KpiCard
            to="/contacts"
            label="Contacts"
            tooltip="People in your audience available for campaigns and conversations."
            loading={ccLoading}
            value={cc.contactsTotal}
            format={formatCount}
            emptyLabel={cc.contactsTotal === 0 ? 'None yet' : '—'}
            hint={(cc.contactsTotal ?? 0) > 0 ? 'Your audience' : 'Import a CSV'}
          />
        </div>

        {/* Slim 30-day trend — only once there's volume; deep analytics is on Reports */}
        {hasVolume && (
          <Suspense fallback={<Skeleton className="h-48 w-full rounded-lg" />}>
            <TrendStrip daily={daily} todaySent={today.sent} />
          </Suspense>
        )}

        {/* Recent campaigns + activity */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent campaigns</CardTitle>
              <Link to="/campaigns" className="inline-flex items-center gap-1 text-xs font-medium text-primary-emphasis hover:underline">
                View all
                <ArrowRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {ccLoading ? (
                <FeedSkeleton rows={3} />
              ) : cc.campaigns.length === 0 ? (
                <FeedEmpty
                  icon={Megaphone}
                  title="No campaigns yet"
                  description="Broadcast an approved template to your audience."
                  cta="Create a campaign"
                  to="/campaigns"
                />
              ) : (
                <ul>
                  {cc.campaigns.slice(0, 5).map((c, i) => (
                    <li key={c.id} className={cn(i > 0 && 'border-t border-border')}>
                      <CampaignRow c={c} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent activity</CardTitle>
              <Link to="/reports" className="inline-flex items-center gap-1 text-xs font-medium text-primary-emphasis hover:underline">
                View log
                <ArrowRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {ccLoading ? (
                <FeedSkeleton rows={5} />
              ) : cc.recentMessages.length === 0 ? (
                <FeedEmpty
                  icon={Send}
                  title="No activity yet"
                  description="Messages you send and receive will show up here."
                  cta="Open inbox"
                  to="/inbox"
                />
              ) : (
                <ul>
                  {cc.recentMessages.slice(0, 6).map((m, i) => (
                    <li key={m.id} className={cn(i > 0 && 'border-t border-border')}>
                      <ActivityRow m={m} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ----------------------------- header ----------------------------- */

/** One quiet line: workspace · number · connection · quality · tier, then quick actions. */
function IdentityStrip({ cc }: { cc: CommandCenterData }): JSX.Element {
  const name = cc.number?.displayName?.trim() || 'Your workspace';
  const quality = cc.number ? QUALITY[cc.number.qualityRating] : null;
  const connected = cc.connected;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
        <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{name}</h1>
        {cc.number?.phoneNumber && (
          <>
            <Dot />
            <span className="font-mono text-[13px] text-muted-foreground">{cc.number.phoneNumber}</span>
          </>
        )}
        <Dot />
        <span className="inline-flex items-center gap-1.5">
          <span className={cn('size-1.5 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/50')} />
          <span className={cn('font-medium', connected ? 'text-success-emphasis' : 'text-muted-foreground')}>
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </span>
        {quality && cc.number?.qualityRating !== 'unknown' && (
          <>
            <Dot />
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', quality.dot)} />
              {quality.label}
            </span>
          </>
        )}
        {cc.number && cc.number.messagingTier !== 'unknown' && (
          <>
            <Dot />
            <span className="text-muted-foreground">{TIER_LABEL[cc.number.messagingTier]}</span>
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {QUICK_ACTIONS.map((a) => (
          <Button key={a.to} asChild variant={a.primary ? 'default' : 'outline'} size="sm">
            <Link to={a.to}>
              <a.icon />
              {a.label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}

function Dot(): JSX.Element {
  return <span className="text-muted-foreground/40" aria-hidden>·</span>;
}

function SetupBanner({ firstName, connected }: { firstName: string; connected: boolean }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{greeting()}, {firstName}</h1>
      <p className="text-sm text-muted-foreground">
        {connected
          ? 'Finish setting up to start sending on WhatsApp.'
          : "Let's get your WhatsApp Business account live."}
      </p>
    </div>
  );
}

/* ----------------------------- onboarding ----------------------------- */

function OnboardingChecklist({ steps, stepsDone }: { steps: Step[]; stepsDone: number }): JSX.Element {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border bg-secondary/30">
        <CardTitle>Getting started</CardTitle>
        <div className="text-right">
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {stepsDone}/{steps.length}
          </p>
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(stepsDone / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ol>
          {steps.map((s, i) => (
            <li key={s.title}>
              <Link
                to={s.to}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50',
                  i > 0 && 'border-t border-border',
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-success" />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground/40" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-medium', s.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                    {s.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">{s.description}</span>
                </span>
                {!s.done && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-emphasis">
                    {s.cta}
                    <ArrowRight className="size-3.5" />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- attention queue ----------------------------- */

const DISMISS_KEY = 'dashboard.dismissedAlerts';

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Light inline attention queue. Each item carries a `signature` derived from its current magnitude,
 * so a dismissed alert stays collapsed only until the underlying number materially changes — then it
 * resurfaces. Resolved conditions simply stop being produced. (No "Retry" — re-sending belongs on
 * the Campaigns/Inbox flows, so we link there rather than invent a send here.)
 */
function AttentionQueue({
  today,
  last30,
  deliveryRate,
  pendingTemplates,
  loading,
}: {
  today: Counts;
  last30: Counts;
  deliveryRate: number | null;
  pendingTemplates: number;
  loading: boolean;
}): JSX.Element | null {
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);

  const items = useMemo(
    () => buildAttention(today, last30, deliveryRate, pendingTemplates),
    [today, last30, deliveryRate, pendingTemplates],
  );

  const dismiss = useCallback((signature: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(signature);
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable — dismissal is best-effort */
      }
      return next;
    });
  }, []);

  if (loading) return null;
  const visible = items.filter((i) => !dismissed.has(i.signature));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visible.map((item) => (
        <div
          key={item.signature}
          className={cn(
            'flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm',
            item.tone === 'danger'
              ? 'border-destructive/20 bg-destructive/5'
              : 'border-warning/20 bg-warning/5',
          )}
        >
          <AlertTriangle
            className={cn('size-4 shrink-0', item.tone === 'danger' ? 'text-destructive-emphasis' : 'text-warning-emphasis')}
          />
          <span className="min-w-0 flex-1 truncate text-foreground">
            <span className="font-medium">{item.title}</span>
            <span className="hidden text-muted-foreground sm:inline"> — {item.description}</span>
          </span>
          <Link
            to={item.to}
            className="shrink-0 text-xs font-medium text-primary-emphasis hover:underline"
          >
            {item.reviewLabel}
          </Link>
          <button
            type="button"
            onClick={() => dismiss(item.signature)}
            aria-label={`Dismiss: ${item.title}`}
            className="shrink-0 rounded p-1 text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- KPIs ----------------------------- */

interface Trend {
  /** Signed change. Percent for counts, percentage-points for rates. */
  delta: number;
  suffix: string;
  goodWhenUp: boolean;
  label: string;
}

function KpiCard({
  to,
  label,
  tooltip,
  loading,
  value,
  format,
  emptyLabel = '—',
  hint,
  hintTone,
  tone,
  trend,
}: {
  to: string;
  label: string;
  tooltip: string;
  loading?: boolean;
  value: number | null;
  format: (n: number) => string;
  emptyLabel?: string;
  hint: string;
  hintTone?: 'warning' | 'danger';
  tone?: 'danger';
  trend?: Trend | null;
}): JSX.Element {
  return (
    <Card className="group relative h-full p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link to={to} className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={label} />
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.preventDefault()}
              aria-label={`About ${label}`}
              className="relative z-10 rounded p-0.5 text-muted-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[15rem] normal-case">{tooltip}</TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-2.5 flex items-end gap-2">
        {loading ? (
          <Skeleton className="h-8 w-20 rounded" />
        ) : value === null ? (
          <span className="text-[26px] font-semibold leading-none tracking-tight text-foreground">{emptyLabel}</span>
        ) : (
          <span
            className={cn(
              'text-[26px] font-semibold leading-none tracking-tight text-foreground',
              tone === 'danger' && value > 0 && 'text-destructive-emphasis',
            )}
          >
            <CountUp value={value} format={format} />
          </span>
        )}
        {!loading && trend && <TrendPill trend={trend} />}
      </div>

      <p
        className={cn(
          'mt-1.5 flex items-center gap-1 text-xs',
          hintTone === 'danger'
            ? 'text-destructive-emphasis'
            : hintTone === 'warning'
              ? 'text-warning-emphasis'
              : 'text-muted-foreground',
        )}
      >
        {hint}
        <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
    </Card>
  );
}

function TrendPill({ trend }: { trend: Trend }): JSX.Element {
  const up = trend.delta > 0;
  const flat = trend.delta === 0;
  const good = flat ? true : up === trend.goodWhenUp;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'relative z-10 mb-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium',
            flat
              ? 'bg-muted text-muted-foreground'
              : good
                ? 'bg-success/10 text-success-emphasis'
                : 'bg-destructive/10 text-destructive-emphasis',
          )}
        >
          {!flat && <Icon className="size-3" />}
          {up ? '+' : ''}
          {trend.delta}
          {trend.suffix}
        </span>
      </TooltipTrigger>
      <TooltipContent className="normal-case">{trend.label}</TooltipContent>
    </Tooltip>
  );
}

/* ----------------------------- campaign rows ----------------------------- */

const CAMPAIGN_VARIANT: Record<string, BadgeProps['variant']> = {
  queued: 'default',
  scheduled: 'info',
  sending: 'warning',
  completed: 'success',
  failed: 'danger',
};

function CampaignRow({ c }: { c: CampaignDTO }): JSX.Element {
  const bucket =
    c.status === 'queued' && c.scheduledAt && c.scheduledAt > Date.now() ? 'scheduled' : c.status;
  const total = c.totalRecipients || 0;
  const done = c.sent + c.failed;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : bucket === 'completed' ? 100 : 0;

  return (
    <Link to={`/campaigns?id=${encodeURIComponent(c.id)}`} className="block px-4 py-3 transition-colors hover:bg-secondary/50">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.title}</p>
        <Badge variant={CAMPAIGN_VARIANT[bucket] ?? 'default'} className="shrink-0 capitalize">
          {bucket}
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', bucket === 'failed' ? 'bg-destructive' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {formatCount(c.sent)}/{formatCount(total)}
        </span>
      </div>
    </Link>
  );
}

/* ----------------------------- activity rows ----------------------------- */

const ACTIVITY_VARIANT: Record<string, BadgeProps['variant']> = {
  queued: 'default',
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
};

/** Pick an icon + tint reflecting what the message actually is (failure > template > direction). */
function activityVisual(m: ReportMessageRow): { Icon: LucideIcon; cls: string } {
  if (m.status === 'failed') return { Icon: AlertTriangle, cls: 'bg-destructive/10 text-destructive-emphasis' };
  if (m.type === 'template') return { Icon: FileText, cls: 'bg-info/10 text-info-emphasis' };
  if (m.direction === 'in') return { Icon: ArrowDownLeft, cls: 'bg-success/10 text-success-emphasis' };
  return { Icon: ArrowUpRight, cls: 'bg-primary/10 text-primary-emphasis' };
}

function ActivityRow({ m }: { m: ReportMessageRow }): JSX.Element {
  const { Icon, cls } = activityVisual(m);
  return (
    <Link
      to="/inbox"
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/50"
      title={`${m.direction === 'in' ? 'Inbound' : 'Outbound'} · ${m.type}`}
    >
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', cls)}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{m.templateName ?? labelForType(m)}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{m.contactPhone}</p>
      </div>
      <Badge variant={ACTIVITY_VARIANT[m.status] ?? 'default'} className="shrink-0 capitalize">
        {m.status}
      </Badge>
      <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{compactAgo(m.ts)}</span>
    </Link>
  );
}

function labelForType(m: ReportMessageRow): string {
  if (m.type === 'text') return m.direction === 'in' ? 'Incoming message' : 'Text message';
  return m.type.charAt(0).toUpperCase() + m.type.slice(1);
}

/* ----------------------------- shared bits ----------------------------- */

function FeedSkeleton({ rows }: { rows: number }): JSX.Element {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}

function FeedEmpty({
  icon: Icon,
  title,
  description,
  cta,
  to,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
  to: string;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">{description}</p>
      <Button asChild size="sm" variant="outline" className="mt-4">
        <Link to={to}>
          {cta}
          <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}

/** Compact "time ago": Just now / 5m / 2h / 3d, then an absolute short date past a week. */
function compactAgo(ts?: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 45_000) return 'Just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/* ----------------------------- derived ----------------------------- */

interface Step {
  title: string;
  description: string;
  cta: string;
  to: string;
  done: boolean;
}

/** The onboarding checklist — each step's `done` is derived from real workspace state. */
function buildSteps(cc: CommandCenterData, last30: Counts): Step[] {
  return [
    {
      title: 'Connect your WhatsApp number',
      description: 'Link a number through Meta Embedded Signup to start sending.',
      cta: 'Connect',
      to: '/connect',
      done: cc.connected,
    },
    {
      title: 'Add your contacts',
      description: 'Import a CSV or add contacts to build your audience.',
      cta: 'Import',
      to: '/contacts',
      done: (cc.contactsTotal ?? 0) > 0,
    },
    {
      title: 'Get a template approved',
      description: 'Templates are required to open new conversations.',
      cta: 'Create',
      to: '/templates',
      done: cc.templatesApproved > 0,
    },
    {
      title: 'Send your first message',
      description: 'Launch a campaign or reply from the inbox.',
      cta: 'Send',
      to: '/campaigns',
      done: last30.sent > 0 || cc.campaigns.length > 0,
    },
  ];
}

interface AttentionItem {
  signature: string;
  title: string;
  description: string;
  to: string;
  reviewLabel: string;
  tone: 'warning' | 'danger';
}

/** Derive the attention queue strictly from real numbers — no invented events. */
function buildAttention(
  today: Counts,
  last30: Counts,
  deliveryRate: number | null,
  pendingTemplates: number,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (last30.failed > 0) {
    items.push({
      signature: `failed:${last30.failed}`,
      title: `${formatCount(last30.failed)} failed deliveries`,
      description: 'review failures from the last 30 days',
      to: '/reports',
      reviewLabel: 'Review',
      tone: 'danger',
    });
  }
  if (deliveryRate !== null && deliveryRate < 95) {
    items.push({
      signature: `delivery:${Math.round(deliveryRate)}`,
      title: `Delivery rate at ${deliveryRate.toFixed(1)}%`,
      description: 'below the 95% healthy threshold',
      to: '/reports',
      reviewLabel: 'Review',
      tone: 'warning',
    });
  }
  if (pendingTemplates > 0) {
    items.push({
      signature: `pending-tpl:${pendingTemplates}`,
      title: `${pendingTemplates} template${pendingTemplates === 1 ? '' : 's'} awaiting approval`,
      description: 'check their status with Meta',
      to: '/templates',
      reviewLabel: 'View',
      tone: 'warning',
    });
  }
  if (last30.sent > 0 && today.sent === 0) {
    items.push({
      signature: `idle:${new Date().toISOString().slice(0, 10)}`,
      title: 'Nothing sent today',
      description: 'launch a campaign to keep momentum',
      to: '/campaigns',
      reviewLabel: 'Send',
      tone: 'warning',
    });
  }
  return items;
}

/**
 * Split the daily series into a recent half vs the prior half and derive a period-over-period
 * trend for each KPI. Trends are only produced when the prior half has a meaningful baseline, so
 * we never show a misleading "+100%" off a zero base.
 */
function computeTrends(daily: Array<{ date: string } & Counts>): {
  sent: Trend | null;
  delivery: Trend | null;
  failed: Trend | null;
} {
  if (daily.length < 4) return { sent: null, delivery: null, failed: null };
  const mid = Math.floor(daily.length / 2);
  const prior = sum(daily.slice(0, mid));
  const recent = sum(daily.slice(mid));
  const span = daily.length - mid;

  const pct = (cur: number, base: number): number => Math.round(((cur - base) / base) * 100);

  const sentTrend: Trend | null =
    prior.sent > 0
      ? { delta: pct(recent.sent, prior.sent), suffix: '%', goodWhenUp: true, label: `vs previous ${span} days` }
      : null;

  const priorRate = prior.sent > 0 ? (prior.delivered / prior.sent) * 100 : null;
  const recentRate = recent.sent > 0 ? (recent.delivered / recent.sent) * 100 : null;
  const deliveryTrend: Trend | null =
    priorRate !== null && recentRate !== null
      ? {
          delta: Math.round((recentRate - priorRate) * 10) / 10,
          suffix: ' pts',
          goodWhenUp: true,
          label: `vs previous ${span} days`,
        }
      : null;

  const failedTrend: Trend | null =
    prior.failed > 0
      ? { delta: pct(recent.failed, prior.failed), suffix: '%', goodWhenUp: false, label: `vs previous ${span} days` }
      : null;

  return { sent: sentTrend, delivery: deliveryTrend, failed: failedTrend };
}

function sum(rows: Array<Counts>): Counts {
  return rows.reduce(
    (a, r) => ({
      submitted: a.submitted + r.submitted,
      sent: a.sent + r.sent,
      delivered: a.delivered + r.delivered,
      failed: a.failed + r.failed,
    }),
    { ...EMPTY },
  );
}
