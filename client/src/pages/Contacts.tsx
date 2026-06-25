/**
 * Contacts — tenant-scoped contact management (feature 1.2). Filter/search + server-side cursor
 * pagination (handles very large lists), per-row edit/delete, a bulk Actions menu (tag/untag/
 * delete/export), single Add, and CSV Import. Custom attributes render as optional columns.
 *
 * Pagination keeps a cursor history so Prev/Next walk the same ordered query. Selection is scoped
 * to the current page (cleared on page/filter change) so bulk + export act on what you can see.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Tag,
  TagsIcon,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { CONTACT_SOURCES, CONTACT_STATUSES, OPT_IN_STATUSES } from '@thinkai/shared';
import type {
  ContactAttributeDef,
  ContactDTO,
  ContactSettingsResponse,
  ContactTag,
  OptInStatus,
} from '@thinkai/shared';

import { ApiError } from '../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContactAvatar } from '@/components/ui/avatar';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  bulkAction,
  createContact,
  deleteAllContacts,
  deleteContact,
  getContactSettings,
  listContacts,
  updateContact,
} from '../features/contacts/api';
import { TagChip, tagColor } from '../features/contacts/TagPicker';
import { ContactEditorModal } from '../features/contacts/ContactEditorModal';
import type { ContactFormPayload } from '../features/contacts/ContactEditorModal';
import { ImportContactsModal } from '../features/contacts/ImportContactsModal';

const PAGE_SIZE = 25;

/** Shared select styling (no Select primitive — match the Input look). */
const selectCls =
  'flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const OPT_IN_VARIANT: Record<OptInStatus, BadgeProps['variant']> = {
  opted_in: 'success',
  opted_out: 'danger',
  unknown: 'outline',
};

interface Filters {
  search: string;
  tag: string;
  optInStatus: string;
  source: string;
  status: string;
}
const EMPTY_FILTERS: Filters = { search: '', tag: '', optInStatus: '', source: '', status: '' };

export function Contacts(): JSX.Element {
  const [attributes, setAttributes] = useState<ContactAttributeDef[]>([]);
  const [palette, setPalette] = useState<ContactTag[]>([]);

  const [contacts, setContacts] = useState<ContactDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Draft (inputs) vs applied (committed) filters.
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  // Cursor pagination: history[pageIndex] is the cursor that produced the current page.
  const [history, setHistory] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editorInitial, setEditorInitial] = useState<ContactDTO | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Load attribute defs + tag palette once.
  useEffect(() => {
    getContactSettings()
      .then((s: ContactSettingsResponse) => {
        setAttributes(s.attributes);
        setPalette(s.tags);
      })
      .catch(() => undefined);
  }, []);

  const fetchPage = useCallback(async (cursor: string | undefined, f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listContacts({
        search: f.search || undefined,
        tag: f.tag || undefined,
        optInStatus: f.optInStatus || undefined,
        source: f.source || undefined,
        status: f.status || undefined,
        cursor,
        limit: PAGE_SIZE,
      });
      setContacts(res.items);
      setNextCursor(res.nextCursor);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load contacts.');
    } finally {
      setLoading(false);
    }
  }, []);

  // (Re)load page 1 whenever the applied filters change.
  useEffect(() => {
    setHistory([undefined]);
    setPageIndex(0);
    void fetchPage(undefined, applied);
  }, [applied, fetchPage]);

  const goNext = useCallback(() => {
    if (!nextCursor) return;
    const newHistory = history.slice(0, pageIndex + 1);
    newHistory.push(nextCursor);
    setHistory(newHistory);
    setPageIndex(pageIndex + 1);
    void fetchPage(nextCursor, applied);
  }, [nextCursor, history, pageIndex, applied, fetchPage]);

  const goPrev = useCallback(() => {
    if (pageIndex === 0) return;
    const idx = pageIndex - 1;
    setPageIndex(idx);
    void fetchPage(history[idx], applied);
  }, [pageIndex, history, applied, fetchPage]);

  const reloadCurrent = useCallback(() => {
    void fetchPage(history[pageIndex], applied);
  }, [history, pageIndex, applied, fetchPage]);

  // ---- mutations ----
  const openAdd = useCallback(() => {
    setEditorMode('create');
    setEditorInitial(undefined);
    setSaveError(null);
    setEditorOpen(true);
  }, []);
  const openEdit = useCallback((c: ContactDTO) => {
    setEditorMode('edit');
    setEditorInitial(c);
    setSaveError(null);
    setEditorOpen(true);
  }, []);

  const handleSave = useCallback(
    async (payload: ContactFormPayload) => {
      setSaving(true);
      setSaveError(null);
      try {
        if (editorMode === 'edit' && editorInitial) {
          await updateContact(editorInitial.id, {
            name: payload.name,
            tags: payload.tags,
            optInStatus: payload.optInStatus,
            status: payload.status,
            attributes: payload.attributes,
          });
          setNotice('Contact updated.');
        } else {
          await createContact({
            phone: payload.phone,
            name: payload.name,
            tags: payload.tags,
            optInStatus: payload.optInStatus,
            status: payload.status,
            attributes: payload.attributes,
            source: 'manual',
          });
          setNotice('Contact saved.');
        }
        setEditorOpen(false);
        reloadCurrent();
      } catch (err) {
        setSaveError(err instanceof ApiError ? err.message : 'Could not save the contact.');
      } finally {
        setSaving(false);
      }
    },
    [editorMode, editorInitial, reloadCurrent],
  );

  const handleDelete = useCallback(
    async (c: ContactDTO) => {
      if (!window.confirm(`Delete ${c.name || c.phone}?`)) return;
      try {
        await deleteContact(c.id);
        setNotice('Contact deleted.');
        reloadCurrent();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Delete failed.');
      }
    },
    [reloadCurrent],
  );

  const handleDeleteAll = useCallback(async () => {
    if (!window.confirm('Delete ALL contacts? This cannot be undone.')) return;
    if (!window.confirm('Are you sure? Every contact for this account will be permanently removed.')) return;
    try {
      const { deleted } = await deleteAllContacts();
      setNotice(`All contacts deleted (${deleted} removed).`);
      setHistory([undefined]);
      setPageIndex(0);
      void fetchPage(undefined, applied);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete all failed.');
    }
  }, [applied, fetchPage]);

  // ---- selection + bulk ----
  const allOnPageSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const toggleAll = (): void =>
    setSelected(allOnPageSelected ? new Set() : new Set(contacts.map((c) => c.id)));
  const toggleOne = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBulk = useCallback(
    async (action: 'add_tag' | 'remove_tag' | 'delete') => {
      const ids = [...selected];
      if (ids.length === 0) return;
      let tag: string | undefined;
      if (action !== 'delete') {
        tag = window.prompt(action === 'add_tag' ? 'Tag to add:' : 'Tag to remove:')?.trim() || undefined;
        if (!tag) return;
      } else if (!window.confirm(`Delete ${ids.length} contact(s)?`)) {
        return;
      }
      try {
        const { affected } = await bulkAction({ action, contactIds: ids, tag });
        setNotice(`${action.replace('_', ' ')} applied to ${affected} contact(s).`);
        reloadCurrent();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Bulk action failed.');
      }
    },
    [selected, reloadCurrent],
  );

  const exportSelected = useCallback(() => {
    const rows = contacts
      .filter((c) => selected.has(c.id))
      .map((c) => {
        const base: Record<string, string> = {
          phone: c.phone,
          name: c.name ?? '',
          tags: (c.tags ?? []).join(','),
          optInStatus: c.optInStatus,
          source: c.source ?? '',
          status: c.status ?? '',
        };
        for (const a of attributes) base[a.name] = c.attributes?.[a.name] ?? '';
        return base;
      });
    if (rows.length === 0) return;
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-export-${rows.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [contacts, selected, attributes]);

  const selectedCount = selected.size;
  const showingFrom = contacts.length > 0 ? pageIndex * PAGE_SIZE + 1 : 0;

  const hasFilters = useMemo(
    () => Object.values(applied).some((v) => v !== ''),
    [applied],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Search, segment, and manage your audience."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/settings/attributes">
                <Settings2 />
                Attributes
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload />
              Import
            </Button>
            <Button onClick={openAdd}>
              <Plus />
              Add contact
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleDeleteAll()}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/40"
            >
              <Trash2 />
              Remove all
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

      {/* Segments overview — quick-filter chips built from the tenant's tag palette */}
      {palette.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <TagsIcon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Segments</p>
                <p className="text-xs text-muted-foreground">
                  {palette.length} tag{palette.length === 1 ? '' : 's'} — click to filter your audience
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {palette.slice(0, 8).map((t) => {
                const active = applied.tag === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => {
                      const next = active ? '' : t.name;
                      setDraft((d) => ({ ...d, tag: next }));
                      setApplied((a) => ({ ...a, tag: next }));
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-primary-emphasis'
                        : 'border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <FieldLabel>Search</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={draft.search}
                  onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && setApplied(draft)}
                  placeholder="Name or mobile"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <FieldLabel>Tag</FieldLabel>
              <select value={draft.tag} onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))} className={selectCls}>
                <option value="">All tags</option>
                {palette.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Opt-in</FieldLabel>
              <select
                value={draft.optInStatus}
                onChange={(e) => setDraft((d) => ({ ...d, optInStatus: e.target.value }))}
                className={selectCls}
              >
                <option value="">All</option>
                {OPT_IN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Source</FieldLabel>
              <select value={draft.source} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))} className={selectCls}>
                <option value="">All</option>
                {CONTACT_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} className={selectCls}>
                <option value="">All</option>
                {CONTACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setApplied(draft)}>
              <Search />
              Search
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                setApplied(EMPTY_FILTERS);
              }}
            >
              <RotateCcw />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action bar + table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 border-b border-border">
          <CardTitle className="flex items-center gap-2">
            All contacts
            {selectedCount > 0 && <Badge variant="primary">{selectedCount} selected</Badge>}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={selectedCount === 0}>
                <TagsIcon />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void runBulk('add_tag')}>
                <Tag />
                Add tag…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void runBulk('remove_tag')}>
                <Tag />
                Remove tag…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={exportSelected}>
                <Download />
                Export selected (CSV)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => void runBulk('delete')}>
                <Trash2 />
                Delete selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-[hsl(var(--primary))]"
                      checked={allOnPageSelected}
                      onChange={toggleAll}
                      aria-label="Select all on page"
                    />
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Tags</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Opt-in</th>
                  <th className="px-4 py-3">Status</th>
                  {attributes.map((a) => (
                    <th key={a.name} className="px-4 py-3">
                      {a.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  contacts.map((c) => {
                    const isSel = selected.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50',
                          isSel && 'bg-primary/5',
                        )}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            className="size-4 accent-[hsl(var(--primary))]"
                            checked={isSel}
                            onChange={() => toggleOne(c.id)}
                            aria-label={`Select ${c.phone}`}
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <ContactAvatar name={c.name} phone={c.phone} className="size-8 text-[11px]" />
                            <span className="truncate font-medium text-foreground">{c.name || 'Unnamed contact'}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-muted-foreground">{c.phone}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(c.tags ?? []).map((t) => (
                              <TagChip key={t} name={t} color={tagColor(t, palette)} />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">{c.source ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={OPT_IN_VARIANT[c.optInStatus] ?? 'outline'} className="capitalize">
                            {c.optInStatus.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">{c.status ?? '—'}</td>
                        {attributes.map((a) => (
                          <td key={a.name} className="px-4 py-3 text-muted-foreground">
                            {c.attributes?.[a.name] ?? ''}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)} aria-label="Edit">
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void handleDelete(c)}
                              aria-label="Delete"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : contacts.length === 0 ? (
              <EmptyState
                className="m-4 border-0"
                icon={<Users />}
                title={hasFilters ? 'No matching contacts' : 'No contacts yet'}
                description={
                  hasFilters
                    ? 'Adjust or reset your filters to see more.'
                    : 'Add a contact or import a CSV to get started.'
                }
                action={
                  hasFilters ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDraft(EMPTY_FILTERS);
                        setApplied(EMPTY_FILTERS);
                      }}
                    >
                      <RotateCcw />
                      Reset filters
                    </Button>
                  ) : (
                    <Button onClick={openAdd}>
                      <Plus />
                      Add contact
                    </Button>
                  )
                }
              />
            ) : null}
          </div>

          {/* Pagination */}
          {contacts.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span className="tabular-nums">
                Showing {showingFrom}–{showingFrom + contacts.length - 1}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={goPrev} disabled={pageIndex === 0 || loading}>
                  <ChevronLeft />
                  Prev
                </Button>
                <Button variant="outline" size="sm" onClick={goNext} disabled={!nextCursor || loading}>
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ContactEditorModal
        open={editorOpen}
        mode={editorMode}
        initial={editorInitial}
        attributes={attributes}
        palette={palette}
        submitting={saving}
        error={saveError}
        onClose={() => setEditorOpen(false)}
        onSubmit={handleSave}
      />
      <ImportContactsModal
        open={importOpen}
        attributes={attributes}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          setNotice('Import finished.');
          reloadCurrent();
        }}
      />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;
}
