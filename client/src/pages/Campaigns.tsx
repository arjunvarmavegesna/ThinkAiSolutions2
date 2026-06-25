/**
 * Campaigns — Twincles-style: Filters card → button bar (Search / Create new campaign) →
 * Campaign Report table. "Create new campaign" opens a modal: pick an approved template,
 * fill its variables, paste recipient numbers, and broadcast. Each recipient goes through
 * the per-message debit + BSP send pipeline on the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, Megaphone, Plus, Send, Users, XCircle } from 'lucide-react';
import { containsMergeTag, resolveVariable } from '@thinkai/shared';
import type { CampaignDTO, CreateCampaignRequest, TemplateDTO } from '@thinkai/shared';
import { ApiError } from '../lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/patterns/page-header';
import { StatCard } from '@/components/patterns/stat-card';
import { EmptyState } from '@/components/patterns/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCount } from '@/lib/utils';
import { listCampaigns, createCampaign, previewAudience } from '../features/campaigns/api';
import { listTemplates } from '../features/templates/api';
import { CampaignDetailModal } from '../features/campaigns/CampaignDetailModal';

/** Display bucket for a campaign — a queued campaign with a future start reads as "scheduled". */
function campaignBucket(c: CampaignDTO): string {
  if (c.status === 'queued' && c.scheduledAt && c.scheduledAt > Date.now()) return 'scheduled';
  return c.status;
}

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  scheduled: 'info',
  queued: 'default',
  sending: 'warning',
  completed: 'success',
  failed: 'danger',
};

const FILTER_BUCKETS = ['scheduled', 'queued', 'sending', 'completed', 'failed'] as const;

/** Shared input + select styling (match the design-system Input look). */
const inputCls =
  'flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

function fmt(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Local-time helpers for the date/time inputs (match native input semantics). */
const pad = (n: number): string => String(n).padStart(2, '0');
function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A small clickable schedule preset pill. */
function PresetChip({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary-emphasis"
    >
      {label}
    </button>
  );
}

/** A merge-tag insert chip (disabled for pasted-numbers audiences, which have no contacts). */
function TagChip({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary-emphasis disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
    >
      + {label}
    </button>
  );
}

/**
 * BODY text for the live preview: prefer a locally-stored `body`, else extract the BODY component
 * text from the JSON-encoded `components` (synced Meta templates store components, not body).
 */
function templateBodyText(t: TemplateDTO | null): string {
  if (!t) return '';
  if (t.body && t.body.trim()) return t.body;
  if (typeof t.components === 'string') {
    try {
      const comps = JSON.parse(t.components) as Array<{ type?: string; text?: string }>;
      const body = comps.find((c) => String(c.type).toUpperCase() === 'BODY');
      if (body && typeof body.text === 'string') return body.text;
    } catch {
      // Malformed components — fall through to no preview.
    }
  }
  return '';
}

/** Substitute positional {{1}}…{{n}} in a template body with the resolved values, in order. */
function renderPreview(body: string, values: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, num: string) => {
    const idx = Number(num) - 1;
    return idx >= 0 && idx < values.length ? values[idx] : `{{${num}}}`;
  });
}

export function Campaigns(): JSX.Element {
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  // Open the detail modal directly from a ?id= deep-link (e.g. from the dashboard or ⌘K palette).
  const [searchParams, setSearchParams] = useSearchParams();
  const [detailId, setDetailId] = useState<string | null>(() => searchParams.get('id'));

  const closeDetail = useCallback(() => {
    setDetailId(null);
    if (searchParams.has('id')) {
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCampaigns();
      setCampaigns(res.campaigns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While any campaign is still queued/sending, poll so the worker's progress shows live.
  const hasActive = useMemo(
    () => campaigns.some((c) => c.status === 'queued' || c.status === 'sending'),
    [campaigns],
  );
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [hasActive, load]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of campaigns) {
      const b = campaignBucket(c);
      m[b] = (m[b] ?? 0) + 1;
    }
    return m;
  }, [campaigns]);

  const totals = useMemo(
    () =>
      campaigns.reduce(
        (a, c) => ({
          recipients: a.recipients + c.totalRecipients,
          sent: a.sent + c.sent,
          failed: a.failed + c.failed,
        }),
        { recipients: 0, sent: 0, failed: 0 },
      ),
    [campaigns],
  );

  const filtered = useMemo(
    () => (filter === 'all' ? campaigns : campaigns.filter((c) => campaignBucket(c) === filter)),
    [campaigns, filter],
  );

  // Aggregate delivery funnel for the overview strip.
  const sentRate = totals.recipients > 0 ? Math.round((totals.sent / totals.recipients) * 100) : 0;
  const failRate = totals.recipients > 0 ? Math.round((totals.failed / totals.recipients) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Build, schedule, and track broadcasts across your audience."
        actions={
          <Button
            onClick={() => {
              setNotice(null);
              setModalOpen(true);
            }}
          >
            <Plus />
            New campaign
          </Button>
        }
      />

      {notice && (
        <Card className="border-success/25 bg-success/10 p-3 text-sm text-success-emphasis">{notice}</Card>
      )}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-emphasis">{error}</Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Campaigns"
          value={campaigns.length}
          format={formatCount}
          icon={<Megaphone />}
          hint={counts.scheduled ? `${counts.scheduled} scheduled` : 'All time'}
        />
        <StatCard
          label="Recipients"
          value={totals.recipients}
          format={formatCount}
          icon={<Users />}
          hint="Across all broadcasts"
        />
        <StatCard
          label="Sent"
          value={totals.sent}
          format={formatCount}
          icon={<Send />}
          hint={totals.recipients > 0 ? `${sentRate}% of recipients` : 'No sends yet'}
        />
        <StatCard
          label="Failed"
          value={totals.failed}
          format={formatCount}
          icon={<XCircle />}
          hint={totals.failed > 0 ? 'Needs review' : 'No failures'}
        />
      </div>

      {/* Delivery overview — aggregate funnel across every campaign */}
      {!loading && campaigns.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-success/10 text-success-emphasis">
                <CheckCircle2 className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Delivery overview</p>
                <p className="text-xs text-muted-foreground">
                  {formatCount(totals.sent)} sent · {formatCount(totals.failed)} failed ·{' '}
                  {formatCount(Math.max(0, totals.recipients - totals.sent - totals.failed))} pending
                </p>
              </div>
            </div>
            <div className="flex-1 sm:max-w-md">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-success transition-all" style={{ width: `${sentRate}%` }} />
                <div className="h-full bg-destructive transition-all" style={{ width: `${failRate}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>{sentRate}% sent</span>
                <span>{failRate}% failed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        <FilterPill label="All" count={campaigns.length} active={filter === 'all'} onClick={() => setFilter('all')} />
        {FILTER_BUCKETS.map((b) => (
          <FilterPill key={b} label={cap(b)} count={counts[b] ?? 0} active={filter === b} onClick={() => setFilter(b)} />
        ))}
      </div>

      {/* Board */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="No campaigns yet"
          description="Create your first broadcast — pick an approved template, choose an audience, and send."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus />
              New campaign
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title={`No ${filter} campaigns`}
          description="Nothing matches this filter right now."
          action={
            <Button variant="outline" onClick={() => setFilter('all')}>
              Show all
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CampaignCard key={c.id} c={c} onView={() => setDetailId(c.id)} />
          ))}
        </div>
      )}

      {modalOpen && (
        <CreateCampaignModal
          onClose={() => setModalOpen(false)}
          onCreated={(msg) => {
            setModalOpen(false);
            setNotice(msg);
            void load();
          }}
        />
      )}

      {detailId && <CampaignDetailModal campaignId={detailId} onClose={closeDetail} />}
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary-emphasis'
          : 'border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-primary/15' : 'bg-muted')}>{count}</span>
    </button>
  );
}

function CampaignCard({ c, onView }: { c: CampaignDTO; onView: () => void }): JSX.Element {
  const bucket = campaignBucket(c);
  const total = c.totalRecipients || 0;
  const done = c.sent + c.failed;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : bucket === 'completed' ? 100 : 0;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <Badge variant={STATUS_VARIANT[bucket] ?? 'default'} className="capitalize">
            {bucket}
          </Badge>
          <span className="text-xs text-muted-foreground">{fmt(c.createdAt)}</span>
        </div>

        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{c.title}</h3>
          <p className="truncate text-xs text-muted-foreground">{c.templateName}</p>
        </div>

        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', bucket === 'failed' ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>
              {formatCount(done)} / {formatCount(total)}
            </span>
            <span>{pct}%</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
          <CardStat label="Recipients" value={total} />
          <CardStat label="Sent" value={c.sent} tone="success" />
          <CardStat label="Failed" value={c.failed} tone={c.failed > 0 ? 'danger' : undefined} />
        </div>

        <Button variant="outline" size="sm" onClick={onView} className="w-full">
          <Eye />
          View details
        </Button>
      </CardContent>
    </Card>
  );
}

function CardStat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }): JSX.Element {
  return (
    <div>
      <p
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'success' ? 'text-success-emphasis' : tone === 'danger' ? 'text-destructive-emphasis' : 'text-foreground',
        )}
      >
        {formatCount(value)}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function CreateCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
}): JSX.Element {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [title, setTitle] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [variables, setVariables] = useState<string[]>([]);
  const [audienceMode, setAudienceMode] = useState<'list' | 'segment'>('list');
  const [recipientsText, setRecipientsText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [optInOnly, setOptInOnly] = useState(false);
  // Schedule: 'now' or a future local date + time.
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  // Live audience preview (segment mode only).
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  // First resolved contact in the segment — drives the merge-tag live preview.
  const [audienceSample, setAudienceSample] = useState<{ name?: string; phone: string } | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Caret-aware refs so an insert chip can splice a merge tag where the cursor is.
  const varRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    listTemplates()
      .then((r) => setTemplates(r.templates.filter((t) => t.status === 'approved')))
      .catch(() => setTemplates([]));
  }, []);

  // Debounced live recipient count so the user sees the audience size before submitting.
  useEffect(() => {
    if (audienceMode !== 'segment') {
      setAudienceCount(null);
      setAudienceSample(null);
      return;
    }
    setAudienceLoading(true);
    const handle = window.setTimeout(() => {
      const segTags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      previewAudience({ segment: { ...(segTags.length > 0 ? { tags: segTags } : {}), optInOnly } })
        .then((r) => {
          setAudienceCount(r.count);
          setAudienceSample(r.sample ?? null);
        })
        .catch(() => {
          setAudienceCount(null);
          setAudienceSample(null);
        })
        .finally(() => setAudienceLoading(false));
    }, 450);
    return () => window.clearTimeout(handle);
  }, [audienceMode, tagsText, optInOnly]);

  const selected = templates.find((t) => t.name === templateName) ?? null;
  const varCount = selected?.variableCount ?? 0;

  useEffect(() => {
    setVariables(Array.from({ length: varCount }, () => ''));
  }, [varCount]);

  const recipients = recipientsText
    .split(/[\n,]/)
    .map((r) => r.trim())
    .filter(Boolean);
  const tags = tagsText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  /** Splice a merge tag into variable `index` at the caret (or end), then restore focus + caret. */
  function insertTag(index: number, tag: string): void {
    const el = varRefs.current[index];
    const cur = variables[index] ?? '';
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + tag + cur.slice(end);
    setVariables((prev) => prev.map((x, j) => (j === index ? next : x)));
    const caret = start + tag.length;
    requestAnimationFrame(() => {
      const node = varRefs.current[index];
      if (node) {
        node.focus();
        node.setSelectionRange(caret, caret);
      }
    });
  }

  // Live preview: resolve variables with the SAME shared resolver the server uses. In segment mode
  // we resolve against the first matching contact; pasted-numbers mode has no contact, so values
  // are shown literally (merge tags would not resolve there and are blocked at submit anyway).
  const bodyText = templateBodyText(selected);
  const previewContact =
    audienceMode === 'segment' && audienceSample
      ? { name: audienceSample.name, phone: audienceSample.phone }
      : null;
  const previewValues = variables.map((v) =>
    previewContact ? resolveVariable(v, previewContact) : v.trim(),
  );
  const previewText = bodyText ? renderPreview(bodyText, previewValues) : '';
  const previewLabel = previewContact
    ? `Preview for ${previewContact.name ?? previewContact.phone}:`
    : 'Preview:';

  async function submit(): Promise<void> {
    setErr(null);
    if (!title.trim()) return setErr('Enter a campaign title.');
    if (!selected) return setErr('Pick an approved template.');

    const req: CreateCampaignRequest = {
      title: title.trim(),
      templateName: selected.name,
      languageCode: selected.language,
      // Store RAW values (merge tags unresolved); the server resolves per recipient at send time.
      variables: variables.map((v) => v.trim()),
    };

    if (audienceMode === 'list') {
      if (recipients.length === 0) return setErr('Add at least one recipient number.');
      // Pasted numbers have no contact records, so merge tags can never resolve — block early.
      if (req.variables.some(containsMergeTag)) {
        return setErr(
          'Merge tags like {{contact.name}} need a contact segment — switch the audience to “Contact segment”.',
        );
      }
      req.recipients = recipients;
    } else {
      // Segment mode: tags optional (empty = all contacts), opt-in optional.
      req.segment = { ...(tags.length > 0 ? { tags } : {}), optInOnly };
    }

    if (scheduleMode === 'later') {
      if (!dateStr || !timeStr) return setErr('Pick a date and time, or switch to “Send now”.');
      const ms = new Date(`${dateStr}T${timeStr}`).getTime();
      if (!Number.isFinite(ms)) return setErr('That schedule date/time is invalid.');
      if (ms <= Date.now()) return setErr('Pick a future date & time, or choose “Send now”.');
      req.scheduledAt = ms;
    }

    setSubmitting(true);
    try {
      const res = await createCampaign(req);
      const when = req.scheduledAt && req.scheduledAt > Date.now() ? 'scheduled' : 'queued';
      onCreated(`Campaign ${when}: ${res.total} recipient${res.total === 1 ? '' : 's'}.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to create campaign.');
    } finally {
      setSubmitting(false);
    }
  }

  /** Set the schedule to a common preset (relative to now), in local time. */
  function applyPreset(kind: 'hour' | 'tomorrow' | 'monday'): void {
    const d = new Date();
    if (kind === 'hour') {
      d.setHours(d.getHours() + 1);
    } else if (kind === 'tomorrow') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else {
      const diff = (8 - d.getDay()) % 7 || 7; // days until next Monday (>= 1)
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
    }
    setScheduleMode('later');
    setDateStr(toDateInput(d));
    setTimeStr(toTimeInput(d));
  }

  const scheduleSummary =
    scheduleMode === 'later' && dateStr && timeStr
      ? new Date(`${dateStr}T${timeStr}`).toLocaleString('en-IN', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

  // Block a doomed segment send (0 matches) right in the UI.
  const createDisabled = submitting || (audienceMode === 'segment' && audienceCount === 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Create new campaign</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-emphasis">
              {err}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Campaign title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="June refill reminder" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Template (approved)</label>
            <select value={templateName} onChange={(e) => setTemplateName(e.target.value)} className={inputCls}>
              <option value="">— Select a template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="mt-1 text-xs text-warning-emphasis">
                No approved templates yet — sync them on the Templates page first.
              </p>
            )}
          </div>

          {varCount > 0 && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-muted-foreground">
                Template variables{' '}
                <span className="font-normal text-muted-foreground/70">
                  — use {'{{contact.name}}'} to personalize per recipient
                </span>
              </label>
              {variables.map((v, i) => (
                <div key={i} className="space-y-1">
                  <input
                    ref={(el) => {
                      varRefs.current[i] = el;
                    }}
                    value={v}
                    onChange={(e) =>
                      setVariables((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    className={inputCls}
                    placeholder={`Variable {{${i + 1}}}`}
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Insert:</span>
                    <TagChip
                      label="Contact name"
                      disabled={audienceMode === 'list'}
                      onClick={() => insertTag(i, '{{contact.name}}')}
                    />
                    <TagChip
                      label="Contact phone"
                      disabled={audienceMode === 'list'}
                      onClick={() => insertTag(i, '{{contact.phone}}')}
                    />
                  </div>
                </div>
              ))}

              {audienceMode === 'list' && (
                <p className="text-[11px] text-warning-emphasis">
                  Personalization needs a contact segment — pasted numbers have no contact data, so
                  values are sent as typed.
                </p>
              )}

              {previewText && (
                <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs">
                  <span className="font-medium text-muted-foreground">{previewLabel}</span>{' '}
                  <span className="whitespace-pre-wrap text-foreground">“{previewText}”</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Audience</label>
            <div className="mb-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={audienceMode === 'list' ? 'default' : 'outline'}
                onClick={() => setAudienceMode('list')}
              >
                Paste numbers
              </Button>
              <Button
                type="button"
                size="sm"
                variant={audienceMode === 'segment' ? 'default' : 'outline'}
                onClick={() => setAudienceMode('segment')}
              >
                Contact segment
              </Button>
            </div>

            {audienceMode === 'list' ? (
              <>
                <textarea
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                  rows={5}
                  className={`${inputCls} resize-y font-mono`}
                  placeholder={'+919876543210\n+919812345678'}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  One E.164 number per line (or comma-separated). ({recipients.length} entered)
                </p>
              </>
            ) : (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Tags <span className="font-normal text-muted-foreground/70">(comma-separated; blank = all contacts)</span>
                  </label>
                  <Input
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="vip, diabetic, repeat"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 accent-[hsl(var(--primary))]"
                    checked={optInOnly}
                    onChange={(e) => setOptInOnly(e.target.checked)}
                  />
                  Only opted-in contacts
                </label>
                <p className="text-xs text-muted-foreground">
                  Opted-out contacts are always excluded. Recipients are resolved when the campaign runs.
                </p>
                <div className="text-xs">
                  {audienceLoading ? (
                    <span className="text-muted-foreground">Checking audience…</span>
                  ) : audienceCount === null ? null : audienceCount > 0 ? (
                    <span className="font-medium text-success-emphasis">
                      ≈ {audienceCount} contact{audienceCount === 1 ? '' : 's'} match this segment.
                    </span>
                  ) : (
                    <span className="font-medium text-warning-emphasis">
                      0 contacts match.{' '}
                      {optInOnly
                        ? 'Try unchecking “Only opted-in” — newly added contacts are “unknown”.'
                        : 'Add contacts or adjust the tags.'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-muted-foreground">Schedule</label>
            <div className="mb-2 inline-flex rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => setScheduleMode('now')}
                className={cn(
                  'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                  scheduleMode === 'now'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                Send now
              </button>
              <button
                type="button"
                onClick={() => {
                  setScheduleMode('later');
                  if (!dateStr || !timeStr) applyPreset('hour');
                }}
                className={cn(
                  'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                  scheduleMode === 'later'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                Schedule for later
              </button>
            </div>

            {scheduleMode === 'later' && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap gap-1.5">
                  <PresetChip label="In 1 hour" onClick={() => applyPreset('hour')} />
                  <PresetChip label="Tomorrow 9 AM" onClick={() => applyPreset('tomorrow')} />
                  <PresetChip label="Next Mon 9 AM" onClick={() => applyPreset('monday')} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
                    <input
                      type="date"
                      value={dateStr}
                      min={toDateInput(new Date())}
                      onChange={(e) => setDateStr(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="w-32">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Time</label>
                    <input
                      type="time"
                      value={timeStr}
                      onChange={(e) => setTimeStr(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                {scheduleSummary && (
                  <p className="text-xs text-muted-foreground">
                    Will send on <span className="font-medium text-foreground">{scheduleSummary}</span>.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={createDisabled}>
            {submitting ? 'Creating…' : scheduleMode === 'later' ? 'Schedule campaign' : 'Create campaign'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

