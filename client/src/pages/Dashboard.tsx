/**
 * Tenant Home — a WhatsApp Business "command center" (Stripe / Vercel / Resend flavoured):
 * answers "is my account set up, what's its health, what happened, and what next" before any
 * charts. Onboarding checklist for young workspaces, a WhatsApp status strip (number / tier /
 * quality / templates / contacts), context-rich KPIs, recent campaigns + activity, and a
 * compact trend that only appears once there's real volume.
 *
 * All data comes from existing read endpoints (useDashboardStats + useCommandCenter) — no new
 * APIs, schema, or business logic.
 */
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Circle,
  FileText,
  Gauge,
  Megaphone,
  MessageSquarePlus,
  Phone,
  Send,
  ShieldCheck,
  Upload,
  Users,
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
import { cn, formatCount } from '@/lib/utils';

const EMPTY: Counts = { submitted: 0, sent: 0, delivered: 0, failed: 0 };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  { label: 'New campaign', to: '/campaigns', icon: Megaphone },
  { label: 'Upload contacts', to: '/contacts', icon: Upload },
  { label: 'Create template', to: '/templates', icon: MessageSquarePlus },
  { label: 'Open inbox', to: '/inbox', icon: Send },
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

const QUALITY: Record<QualityRating, { label: string; dot: string; text: string }> = {
  green: { label: 'High', dot: 'bg-success', text: 'text-success-emphasis' },
  yellow: { label: 'Medium', dot: 'bg-warning', text: 'text-warning-emphasis' },
  red: { label: 'Low', dot: 'bg-destructive', text: 'text-destructive-emphasis' },
  unknown: { label: 'Not rated', dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
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

  const attention = buildAttention(today, last30, deliveryRate);
  const steps = buildSteps(cc, last30);
  const stepsDone = steps.filter((s) => s.done).length;
  const onboarding = !ccLoading && stepsDone < steps.length;
  const isNew =
    !ccLoading &&
    !cc.connected &&
    (cc.contactsTotal ?? 0) === 0 &&
    cc.templatesTotal === 0 &&
    last30.sent === 0;
  const hasVolume = last30.sent > 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isNew ? "Let's get your WhatsApp Business account live." : "Here's your WhatsApp command center."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => (
            <Button key={a.to} asChild variant={a.label === 'New campaign' ? 'default' : 'outline'} size="sm">
              <Link to={a.to}>
                <a.icon />
                {a.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Compact attention strip — inline, only when something needs action */}
      {attention.length > 0 && (
        <div className="flex flex-col gap-2">
          {attention.map((item) => (
            <Link
              key={item.title}
              to={item.to}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors',
                item.tone === 'danger'
                  ? 'border-destructive/25 bg-destructive/5 hover:bg-destructive/10'
                  : 'border-warning/25 bg-warning/10 hover:bg-warning/15',
              )}
            >
              <AlertTriangle
                className={cn('size-4 shrink-0', item.tone === 'danger' ? 'text-destructive-emphasis' : 'text-warning-emphasis')}
              />
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="hidden text-muted-foreground sm:inline">— {item.description}</span>
              <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {/* Quick start checklist (young workspaces only) */}
      {(ccLoading || onboarding) && (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border bg-secondary/30">
            <div>
              <CardTitle>{isNew ? 'Getting started' : 'Finish setting up'}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Complete these steps to start sending on WhatsApp.
              </p>
            </div>
            {!ccLoading && (
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {stepsDone}/{steps.length}
                </p>
                <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(stepsDone / steps.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {ccLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Business status strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoTile
          icon={Phone}
          label="WhatsApp number"
          loading={ccLoading}
          value={cc.number ? cc.number.phoneNumber : cc.connected ? 'Connected' : 'Not connected'}
          sub={cc.number?.displayName ?? (cc.connected ? 'Active' : 'Connect to start sending')}
          tone={cc.connected ? 'success' : 'warning'}
          to="/connect"
        />
        <InfoTile
          icon={Gauge}
          label="Messaging tier"
          loading={ccLoading}
          value={cc.number ? TIER_LABEL[cc.number.messagingTier] : '—'}
          sub="Per-24h send limit"
          to="/reports"
        />
        <InfoTile
          icon={ShieldCheck}
          label="Quality rating"
          loading={ccLoading}
          value={cc.number ? QUALITY[cc.number.qualityRating].label : '—'}
          sub="Meta sender quality"
          dot={cc.number ? QUALITY[cc.number.qualityRating].dot : undefined}
          to="/reports"
        />
        <InfoTile
          icon={FileText}
          label="Templates"
          loading={ccLoading}
          value={cc.templatesTotal === 0 ? 'None yet' : formatCount(cc.templatesTotal)}
          sub={cc.templatesTotal > 0 ? `${cc.templatesApproved} approved` : 'Create your first'}
          to="/templates"
        />
      </div>

      {/* KPIs — context + click-through */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          to="/reports"
          label="Messages sent"
          loading={statsLoading}
          value={formatCount(last30.sent)}
          icon={Send}
          hint="Last 30 days"
        />
        <KpiCard
          to="/reports"
          label="Delivery rate"
          loading={statsLoading}
          value={deliveryRate === null ? '—' : `${deliveryRate.toFixed(1)}%`}
          icon={BadgeCheck}
          hint={deliveryRate === null ? 'No sends yet' : 'Delivered ÷ sent'}
        />
        <KpiCard
          to="/contacts"
          label="Contacts"
          loading={ccLoading}
          value={cc.contactsTotal === null ? '—' : cc.contactsTotal === 0 ? 'None yet' : formatCount(cc.contactsTotal)}
          icon={Users}
          hint={(cc.contactsTotal ?? 0) > 0 ? 'Your audience' : 'Import a CSV'}
        />
        <KpiCard
          to="/reports"
          label="Failed (30d)"
          loading={statsLoading}
          value={formatCount(last30.failed)}
          icon={AlertTriangle}
          hint={last30.failed > 0 ? 'Review delivery issues' : 'No failures'}
          tone={last30.failed > 0 ? 'danger' : undefined}
        />
      </div>

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
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
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
                  <li key={c.id} className={cn('px-4 py-3', i > 0 && 'border-t border-border')}>
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
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
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
                  <li key={m.id} className={cn('px-4 py-2.5', i > 0 && 'border-t border-border')}>
                    <ActivityRow m={m} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Compact trend — only once there's real volume (no empty chart dominating) */}
      {hasVolume && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>30-day message trend</CardTitle>
            <span className="text-xs text-muted-foreground">Today: {formatCount(today.sent)} sent</span>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#98A2B3' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#98A2B3' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E5E9F0',
                      boxShadow: '0 12px 32px -8px rgba(11,18,32,0.12)',
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="sent" name="Sent" stroke="#64748B" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="delivered" name="Delivered" stroke="#16B364" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="failed" name="Failed" stroke="#F04438" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------- pieces ----------------------------- */

function InfoTile({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  tone,
  dot,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
  tone?: 'success' | 'warning';
  dot?: string;
  to: string;
}): JSX.Element {
  return (
    <Link to={to} className="group block">
      <Card className="h-full p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </div>
        {loading ? (
          <Skeleton className="mt-2.5 h-6 w-24 rounded" />
        ) : (
          <p className="mt-2 flex items-center gap-1.5 truncate text-lg font-semibold text-foreground" title={value}>
            {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} />}
            <span className="truncate">{value}</span>
          </p>
        )}
        {sub && !loading && (
          <p className={cn('mt-0.5 truncate text-xs', tone === 'warning' ? 'text-warning-emphasis' : 'text-muted-foreground')}>
            {sub}
          </p>
        )}
      </Card>
    </Link>
  );
}

function KpiCard({
  to,
  label,
  value,
  hint,
  icon: Icon,
  loading,
  tone,
}: {
  to: string;
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  loading?: boolean;
  tone?: 'danger';
}): JSX.Element {
  return (
    <Link to={to} className="group block">
      <Card className="h-full p-5 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span className={cn('text-muted-foreground [&_svg]:size-4', tone === 'danger' && value !== '0' && 'text-destructive-emphasis')}>
            <Icon />
          </span>
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-20 rounded" />
        ) : (
          <p className="mt-3 text-3xl font-semibold leading-none tracking-tight text-foreground">{value}</p>
        )}
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          {hint}
          <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </p>
      </Card>
    </Link>
  );
}

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
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
          <Badge variant={CAMPAIGN_VARIANT[bucket] ?? 'default'} className="shrink-0 capitalize">
            {bucket}
          </Badge>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 w-full max-w-[8rem] overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', bucket === 'failed' ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatCount(c.sent)}/{formatCount(total)} sent
          </span>
        </div>
      </div>
    </div>
  );
}

const ACTIVITY_VARIANT: Record<string, BadgeProps['variant']> = {
  queued: 'default',
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function ActivityRow({ m }: { m: ReportMessageRow }): JSX.Element {
  const outbound = m.direction === 'out';
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs',
          outbound ? 'bg-info/10 text-info-emphasis' : 'bg-success/10 text-success-emphasis',
        )}
        title={outbound ? 'Outbound' : 'Inbound'}
      >
        {outbound ? '↑' : '↓'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{m.templateName ?? m.type}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{m.contactPhone}</p>
      </div>
      <Badge variant={ACTIVITY_VARIANT[m.status] ?? 'default'} className="shrink-0 capitalize">
        {m.status}
      </Badge>
      <span className="w-8 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{relativeTime(m.ts)}</span>
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
  title: string;
  description: string;
  to: string;
  tone: 'warning' | 'danger';
}

/** Derive the attention queue strictly from real numbers — no invented events. */
function buildAttention(today: Counts, last30: Counts, deliveryRate: number | null): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (last30.failed > 0) {
    items.push({
      title: `${formatCount(last30.failed)} failed deliveries`,
      description: 'Review failures in the last 30 days',
      to: '/reports',
      tone: 'danger',
    });
  }
  if (deliveryRate !== null && deliveryRate < 95) {
    items.push({
      title: `Delivery rate at ${deliveryRate.toFixed(1)}%`,
      description: 'Below the 95% healthy threshold',
      to: '/reports',
      tone: 'warning',
    });
  }
  if (last30.sent > 0 && today.sent === 0) {
    items.push({
      title: 'Nothing sent today',
      description: 'Launch a campaign to keep momentum',
      to: '/campaigns',
      tone: 'warning',
    });
  }
  return items;
}
