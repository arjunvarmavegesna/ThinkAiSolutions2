/**
 * Templates — Customer.io-style template gallery. A Filters card, a button bar
 * (Create / Sync from WhatsApp), and a responsive grid of template cards showing
 * approval status, category, language, variable usage, and per-card actions
 * (Preview / Duplicate / Edit / Delete).
 *
 * "Sync from WhatsApp" calls POST /api/templates/sync, which resolves the tenant's WABA and
 * pulls templates from Meta into Firestore (approved ones become sendable from the inbox).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Copy,
  Eye,
  FileText,
  Hash,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { TEMPLATE_STATUSES } from '@thinkai/shared';
import type { CreateTemplateRequest, TemplateDTO, TemplateStatus } from '@thinkai/shared';
import { ApiError } from '../lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { cn } from '@/lib/utils';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  syncTemplatesFromBsp,
  updateTemplate,
} from '../features/templates/api';
import { TemplateEditorModal } from '../features/templates/TemplateEditorModal';
import { TemplatePreviewModal } from '../features/templates/TemplatePreviewModal';
import { templateBodyText } from '../features/templates/templateBody';

/** Status → tonal badge + an honest "what does this mean" hint. */
const STATUS_CONFIG: Record<TemplateStatus, { variant: BadgeProps['variant']; hint: string }> = {
  approved: { variant: 'success', hint: 'Live — ready to send' },
  pending: { variant: 'warning', hint: 'Awaiting Meta approval' },
  rejected: { variant: 'danger', hint: 'Rejected by Meta' },
  paused: { variant: 'outline', hint: 'Paused' },
  disabled: { variant: 'outline', hint: 'Disabled' },
  draft: { variant: 'info', hint: 'Draft — not yet submitted' },
};

const CATEGORIES = ['marketing', 'utility', 'authentication'] as const;

/** Category → icon + soft tint for the card medallion. */
const CATEGORY_CONFIG: Record<string, { icon: LucideIcon; className: string }> = {
  marketing: { icon: Megaphone, className: 'bg-info/10 text-info-emphasis' },
  utility: { icon: Wrench, className: 'bg-primary/10 text-primary-emphasis' },
  authentication: { icon: ShieldCheck, className: 'bg-warning/10 text-warning-emphasis' },
};

/** Status → the small dot tone next to the status hint. */
const STATUS_DOT: Record<TemplateStatus, string> = {
  approved: 'bg-success',
  pending: 'bg-warning',
  rejected: 'bg-destructive',
  paused: 'bg-muted-foreground/50',
  disabled: 'bg-muted-foreground/50',
  draft: 'bg-info',
};

/** Shared select styling (match the Input look). */
const selectCls =
  'flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

function formatTs(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Templates(): JSX.Element {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  // `applied` holds the committed filters (Search button); inputs are the draft.
  const [applied, setApplied] = useState({ name: '', category: '', status: '' });

  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Editor modal (create / edit) + save state.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editorInitial, setEditorInitial] = useState<TemplateDTO | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Preview modal.
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDTO | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTemplates();
      setTemplates(res.templates);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setNotice(null);
    setError(null);
    try {
      const { synced } = await syncTemplatesFromBsp();
      setNotice(`Synced ${synced} template${synced === 1 ? '' : 's'} from WhatsApp.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const openCreate = useCallback(() => {
    setEditorMode('create');
    setEditorInitial(undefined);
    setSaveError(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((t: TemplateDTO) => {
    setEditorMode('edit');
    setEditorInitial(t);
    setSaveError(null);
    setEditorOpen(true);
  }, []);

  /** Duplicate seeds a fresh create form from an existing template (new name required). */
  const openDuplicate = useCallback((t: TemplateDTO) => {
    setEditorMode('create');
    setEditorInitial({ ...t, name: `${t.name}_copy`, status: 'draft', bspTemplateId: undefined });
    setSaveError(null);
    setEditorOpen(true);
  }, []);

  const handleSave = useCallback(
    async (req: CreateTemplateRequest) => {
      setSaving(true);
      setSaveError(null);
      try {
        if (editorMode === 'edit' && editorInitial) {
          // Name is immutable on edit; send the rest.
          const { name: _name, ...rest } = req;
          await updateTemplate(editorInitial.name, rest);
          setNotice(`Template “${editorInitial.name}” re-submitted for review.`);
        } else {
          await createTemplate(req);
          setNotice(`Template “${req.name}” submitted for review.`);
        }
        setEditorOpen(false);
        await load();
      } catch (err) {
        setSaveError(err instanceof ApiError ? err.message : 'Could not save the template.');
      } finally {
        setSaving(false);
      }
    },
    [editorMode, editorInitial, load],
  );

  const handleDelete = useCallback(
    async (t: TemplateDTO) => {
      if (!window.confirm(`Delete template “${t.name}”? This removes it from WhatsApp too.`)) return;
      setError(null);
      try {
        await deleteTemplate(t.name);
        setNotice(`Template “${t.name}” deleted.`);
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Delete failed.');
      }
    },
    [load],
  );

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (applied.name && !t.name.toLowerCase().includes(applied.name.toLowerCase())) return false;
      if (applied.category && t.category !== applied.category) return false;
      if (applied.status && t.status !== applied.status) return false;
      return true;
    });
  }, [templates, applied]);

  const hasFilters = Boolean(applied.name || applied.category || applied.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Author, preview, and manage your approved WhatsApp message templates."
        actions={
          <>
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={cn(syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync from WhatsApp'}
            </Button>
            <Button onClick={openCreate}>
              <Plus />
              Create template
            </Button>
          </>
        }
      />

      {notice && (
        <Card className="border-success/25 bg-success/10 p-3 text-sm text-success-emphasis">{notice}</Card>
      )}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-emphasis">{error}</Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <FieldLabel>Template name</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setApplied({ name, category, status })}
                  placeholder="Search by name"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <FieldLabel>Category</FieldLabel>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
                <option value="">All statuses</option>
                {TEMPLATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => setApplied({ name, category, status })}>
                <Search />
                Search
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setName('');
                  setCategory('');
                  setStatus('');
                  setApplied({ name: '', category: '', status: '' });
                }}
              >
                <RotateCcw />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gallery */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={hasFilters ? 'No matching templates' : 'No templates yet'}
          description={
            hasFilters
              ? 'Adjust or reset your filters to see more.'
              : 'Create one in-console, or sync your approved templates from WhatsApp.'
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setName('');
                  setCategory('');
                  setStatus('');
                  setApplied({ name: '', category: '', status: '' });
                }}
              >
                <RotateCcw />
                Reset filters
              </Button>
            ) : (
              <Button onClick={openCreate}>
                <Plus />
                Create template
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((t, i) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.2), ease: [0.16, 1, 0.3, 1] }}
              >
                <TemplateCard
                  template={t}
                  onPreview={() => setPreviewTemplate(t)}
                  onDuplicate={() => openDuplicate(t)}
                  onEdit={() => openEdit(t)}
                  onDelete={() => void handleDelete(t)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <TemplateEditorModal
        open={editorOpen}
        mode={editorMode}
        initial={editorInitial}
        submitting={saving}
        error={saveError}
        onClose={() => setEditorOpen(false)}
        onSubmit={handleSave}
      />
      <TemplatePreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
    </div>
  );
}

function TemplateCard({
  template: t,
  onPreview,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  template: TemplateDTO;
  onPreview: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const cfg = STATUS_CONFIG[t.status] ?? { variant: 'outline' as const, hint: t.status };
  const body = templateBodyText(t);
  const cat = CATEGORY_CONFIG[t.category] ?? CATEGORY_CONFIG.utility;
  const CatIcon = cat.icon;

  return (
    <Card className="group flex h-full flex-col transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5', cat.className)}>
            <CatIcon />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-mono text-sm font-semibold text-foreground" title={t.name}>
              {t.name}
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[t.status] ?? 'bg-muted-foreground/50')} />
              {cfg.hint}
            </p>
          </div>
          <Badge variant={cfg.variant} className="shrink-0 capitalize">
            {t.status}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="capitalize">
            {t.category}
          </Badge>
          <Badge variant="outline" className="uppercase">
            {t.language}
          </Badge>
          <Badge variant="outline">
            <Hash className="size-3" />
            {t.variableCount ?? 0} var{(t.variableCount ?? 0) === 1 ? '' : 's'}
          </Badge>
        </div>

        <div className="flex-1 rounded-md border border-border bg-secondary/40 p-3">
          {body ? (
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{body}</p>
          ) : (
            <p className="text-xs italic text-muted-foreground/70">No body preview available.</p>
          )}
        </div>

        {t.status === 'rejected' && t.rejectionReason && (
          <p className="text-[11px] text-destructive-emphasis" title={t.rejectionReason}>
            {t.rejectionReason}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">Updated {formatTs(t.updatedAt)}</span>
          <TemplateIdLine id={t.bspTemplateId} />
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="flex-1" onClick={onPreview}>
            <Eye />
            Preview
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDuplicate} aria-label="Duplicate" title="Duplicate">
            <Copy />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit" title="Edit">
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete"
            title="Delete"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;
}

/**
 * The Meta-side template id (bspTemplateId) shown as small, muted proof that the template is
 * registered with WhatsApp. Display-only with a click-to-copy button when present.
 */
function TemplateIdLine({ id }: { id?: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  if (!id) {
    return <span className="text-[11px] text-muted-foreground/70">Not on Meta yet</span>;
  }

  const copy = (): void => {
    void navigator.clipboard?.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex max-w-[55%] items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      title={copied ? 'Copied!' : `Copy Meta ID ${id}`}
    >
      <span className="truncate font-mono">ID {id}</span>
      {copied ? <Check className="size-3 shrink-0 text-success" /> : <Copy className="size-3 shrink-0" />}
    </button>
  );
}
