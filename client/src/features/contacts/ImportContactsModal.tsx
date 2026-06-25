/**
 * Bulk CSV import. Flow: select file -> papaparse -> map CSV columns to contact fields/attributes
 * -> chunked upload (~1k rows/request) with a live progress bar -> summary (added/updated/skipped).
 *
 * The CSV is parsed entirely in the browser; rows are uploaded in chunks so each request stays
 * small and we can report progress for very large files. The server batch-writes + dedupes by
 * phone (an existing contact is updated, invalid phones are skipped with a reason).
 */
import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import type { ContactAttributeDef, ImportContactRow, ImportSkippedRow } from '@thinkai/shared';

import { ApiError } from '../../lib/apiClient';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { importContacts } from './api';

const CHUNK = 1000;

/** Built-in (non-attribute) mapping targets. Phone is required. */
const BASE_TARGETS = [
  { key: 'phone', label: 'Phone (required)', required: true },
  { key: 'name', label: 'Name', required: false },
  { key: 'tags', label: 'Tags (comma-separated)', required: false },
] as const;

/** Shared select styling (match the Input look). */
const selectCls =
  'flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

type Step = 'select' | 'mapping' | 'importing' | 'done';

interface Summary {
  added: number;
  updated: number;
  skipped: number;
  reasons: string[];
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function ImportContactsModal({
  open,
  attributes,
  onClose,
  onDone,
}: {
  open: boolean;
  attributes: ContactAttributeDef[];
  onClose: () => void;
  onDone: () => void;
}): JSX.Element {
  const [step, setStep] = useState<Step>('select');
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Attribute names become extra mapping targets alongside phone/name/tags.
  const targets = useMemo(
    () => [...BASE_TARGETS.map((t) => ({ ...t })), ...attributes.map((a) => ({ key: `attr:${a.name}`, label: a.name, required: false }))],
    [attributes],
  );

  function reset(): void {
    setStep('select');
    setFileName('');
    setColumns([]);
    setRows([]);
    setMapping({});
    setProgress(0);
    setSummary(null);
    setError(null);
  }

  function handleFile(file: File): void {
    setError(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const fields = res.meta.fields ?? [];
        setColumns(fields);
        setRows(res.data);
        // Auto-guess: match a CSV column to each target by case-insensitive header name.
        const guess: Record<string, string> = {};
        for (const t of targets) {
          const label = t.key.startsWith('attr:') ? t.key.slice(5) : t.key;
          const hit = fields.find((f) => f.toLowerCase() === label.toLowerCase());
          if (hit) guess[t.key] = hit;
        }
        setMapping(guess);
        setStep('mapping');
      },
      error: (err) => setError(err.message || 'Could not parse the CSV'),
    });
  }

  function buildRow(raw: Record<string, string>): ImportContactRow | null {
    const phoneCol = mapping.phone;
    const phone = phoneCol ? (raw[phoneCol] ?? '').trim() : '';
    if (!phone) return null; // no phone -> skip locally (counted below)
    const row: ImportContactRow = { phone };
    if (mapping.name && raw[mapping.name]) row.name = raw[mapping.name].trim();
    if (mapping.tags && raw[mapping.tags]) row.tags = splitTags(raw[mapping.tags]);
    const attrs: Record<string, string> = {};
    for (const a of attributes) {
      const col = mapping[`attr:${a.name}`];
      if (col && raw[col] && raw[col].trim()) attrs[a.name] = raw[col].trim();
    }
    if (Object.keys(attrs).length > 0) row.attributes = attrs;
    return row;
  }

  async function runImport(): Promise<void> {
    if (!mapping.phone) {
      setError('Map the Phone column before importing.');
      return;
    }
    setStep('importing');
    setError(null);
    const acc: Summary = { added: 0, updated: 0, skipped: 0, reasons: [] };

    // Build all rows; rows with no phone are skipped client-side.
    const mapped: ImportContactRow[] = [];
    let skippedNoPhone = 0;
    for (const raw of rows) {
      const r = buildRow(raw);
      if (r) mapped.push(r);
      else skippedNoPhone += 1;
    }
    acc.skipped += skippedNoPhone;
    if (skippedNoPhone > 0) acc.reasons.push(`${skippedNoPhone} row(s) had no phone number`);

    try {
      for (let i = 0; i < mapped.length; i += CHUNK) {
        const chunk = mapped.slice(i, i + CHUNK);
        const res = await importContacts({ rows: chunk });
        acc.added += res.added;
        acc.updated += res.updated;
        acc.skipped += res.skipped.length;
        for (const s of res.skipped.slice(0, 3)) acc.reasons.push(reasonLine(s));
        setProgress(Math.min(100, Math.round(((i + chunk.length) / Math.max(mapped.length, 1)) * 100)));
        setSummary({ ...acc });
      }
      setProgress(100);
      setSummary({ ...acc, reasons: dedupe(acc.reasons).slice(0, 6) });
      setStep('done');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed partway through.');
      setStep('mapping');
    }
  }

  function closeAndReset(): void {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAndReset()}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Import contacts</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive-emphasis">
              {error}
            </p>
          )}

          {step === 'select' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Upload a CSV with a <strong className="text-foreground">phone</strong> column (required). Optional:
                name, tags (comma-separated), and any of your custom attributes.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/70"
              />
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{rows.length.toLocaleString('en-IN')}</strong> rows in “{fileName}”.
                Map your columns:
              </p>
              <div className="space-y-2">
                {targets.map((t) => (
                  <div key={t.key} className="flex items-center gap-2">
                    <span className="w-44 shrink-0 text-sm text-muted-foreground">{t.label}</span>
                    <select
                      value={mapping[t.key] ?? ''}
                      onChange={(e) => setMapping((p) => ({ ...p, [t.key]: e.target.value }))}
                      className={selectCls}
                    >
                      <option value="">— Not mapped —</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(step === 'importing' || step === 'done') && (
            <div className="space-y-3">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">
                {step === 'done' ? 'Import complete.' : `Importing… ${progress}%`}
              </p>
              {summary && (
                <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground">
                  <p>
                    <span className="font-semibold text-success-emphasis">{summary.added}</span> added ·{' '}
                    <span className="font-semibold text-info-emphasis">{summary.updated}</span> updated ·{' '}
                    <span className="font-semibold text-warning-emphasis">{summary.skipped}</span> skipped
                  </p>
                  {summary.reasons.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-[11px] text-muted-foreground">
                      {summary.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-4">
          {step === 'mapping' && (
            <>
              <Button type="button" variant="ghost" onClick={reset}>
                Back
              </Button>
              <Button type="button" onClick={() => void runImport()} disabled={!mapping.phone}>
                Import {rows.length.toLocaleString('en-IN')} rows
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button type="button" onClick={closeAndReset}>
              Done
            </Button>
          )}
          {step === 'importing' && <span className="text-sm text-muted-foreground">Working…</span>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function reasonLine(s: ImportSkippedRow): string {
  return s.phone ? `${s.reason}: ${s.phone}` : s.reason;
}
function dedupe(list: string[]): string[] {
  return Array.from(new Set(list));
}
