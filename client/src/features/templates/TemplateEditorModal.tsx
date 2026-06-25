/**
 * Create / edit a WhatsApp template in-console (feature 1.1 + media headers + interactive
 * buttons). Collects category, language, BODY text (with positional {{n}} placeholders), an
 * optional header (text OR an image/video/document sample), optional footer, and optional
 * buttons (call-to-action OR quick-reply). A live WhatsApp-style preview sits beside the form.
 *
 * Media headers upload the sample file first (POST /api/templates/sample-media → a resumable
 * file handle) and submit the handle; text-only templates send no header/button extras, so the
 * create path is byte-for-byte the original.
 *
 * On submit the parent POSTs (create) or PUTs (edit) to /api/templates; Meta reviews
 * asynchronously and the status lands later via the webhook.
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { TEMPLATE_LANGUAGES } from '@thinkai/shared';
import type { CreateTemplateRequest, TemplateButtonInput, TemplateDTO } from '@thinkai/shared';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fileToBase64, uploadTemplateSampleMedia } from './api';
import { TemplatePreview } from './TemplatePreview';
import type { ButtonDraft, HeaderType } from './TemplatePreview';

interface TemplateEditorModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Prefill source when editing. */
  initial?: TemplateDTO;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (req: CreateTemplateRequest) => Promise<void>;
}

const CATEGORIES = ['marketing', 'utility', 'authentication'] as const;
const NAME_RE = /^[a-z0-9_]+$/;

const HEADER_TYPES: { value: HeaderType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
];

/** Accept attribute + human hint for each media header type. */
const MEDIA_ACCEPT: Record<'image' | 'video' | 'document', { accept: string; hint: string }> = {
  image: { accept: 'image/jpeg,image/png', hint: 'JPEG or PNG' },
  video: { accept: 'video/mp4', hint: 'MP4' },
  document: { accept: 'application/pdf', hint: 'PDF' },
};

type ButtonMode = 'none' | 'cta' | 'quick';

/** Distinct positional placeholders in body order, e.g. "Hi {{1}}, {{2}}" -> [1, 2]. */
function placeholderNumbers(body: string): number[] {
  const matches = body.match(/\{\{\s*\d+\s*\}\}/g);
  if (!matches) return [];
  const nums = matches.map((m) => Number(m.replace(/[^\d]/g, '')));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

export function TemplateEditorModal({
  open,
  mode,
  initial,
  submitting,
  error,
  onClose,
  onSubmit,
}: TemplateEditorModalProps): JSX.Element {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('marketing');
  const [language, setLanguage] = useState('en_US');
  const [body, setBody] = useState('');
  const [header, setHeader] = useState('');
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [samples, setSamples] = useState<string[]>([]);

  // Header type + media-upload state. Defaults to 'text' (empty text = no header, so it stays
  // optional); there's no explicit 'None' option.
  const [headerType, setHeaderTypeState] = useState<HeaderType>('text');
  const [headerHandle, setHeaderHandle] = useState<string | null>(null);
  const [headerFileName, setHeaderFileName] = useState<string | undefined>(undefined);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | undefined>(undefined);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [headerUploadError, setHeaderUploadError] = useState<string | null>(null);

  const [buttonMode, setButtonMode] = useState<ButtonMode>('none');

  // (Re)seed the form whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setCategory(
      (CATEGORIES as readonly string[]).includes(initial?.category ?? '')
        ? (initial!.category as (typeof CATEGORIES)[number])
        : 'marketing',
    );
    setLanguage(initial?.language ?? 'en_US');
    setBody(initial?.body ?? '');
    setHeader('');
    setFooter('');
    setButtons([]);
    setSamples([]);
    setHeaderTypeState('text');
    setHeaderHandle(null);
    setHeaderFileName(undefined);
    setHeaderPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return undefined;
    });
    setHeaderUploading(false);
    setHeaderUploadError(null);
    setButtonMode('none');
  }, [open, initial]);

  // Revoke any object URL when the component unmounts.
  useEffect(() => {
    return () => {
      if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeholders = useMemo(() => placeholderNumbers(body), [body]);

  // Keep the samples array the same length as the placeholder list (depends only on the count).
  const placeholderCount = placeholders.length;
  useEffect(() => {
    setSamples((prev) => Array.from({ length: placeholderCount }, (_, i) => prev[i] ?? ''));
  }, [placeholderCount]);

  const isMediaHeader = headerType === 'image' || headerType === 'video' || headerType === 'document';

  /** Switch header type and clear any media-upload state tied to the previous type. */
  function setHeaderType(next: HeaderType): void {
    setHeaderTypeState(next);
    setHeaderHandle(null);
    setHeaderFileName(undefined);
    setHeaderUploadError(null);
    setHeaderPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return undefined;
    });
    if (next !== 'text') setHeader('');
  }

  async function handleMediaFile(file: File): Promise<void> {
    setHeaderUploadError(null);
    setHeaderUploading(true);
    setHeaderHandle(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const { handle } = await uploadTemplateSampleMedia({
        fileName: file.name,
        mimeType: file.type,
        dataBase64,
      });
      setHeaderHandle(handle);
      setHeaderFileName(file.name);
      if (headerType === 'image') {
        const url = URL.createObjectURL(file);
        setHeaderPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      }
    } catch (e) {
      setHeaderUploadError((e as Error)?.message ?? 'Could not upload the sample file');
      setHeaderFileName(undefined);
    } finally {
      setHeaderUploading(false);
    }
  }

  /** Switch button family; clear existing buttons so CTA + quick-reply never mix. */
  function setMode(next: ButtonMode): void {
    setButtonMode(next);
    setButtons([]);
  }

  function updateButton(idx: number, patch: Partial<ButtonDraft>): void {
    setButtons((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }

  const ctaCount = buttons.filter((b) => b.type !== 'QUICK_REPLY').length;
  const qrCount = buttons.filter((b) => b.type === 'QUICK_REPLY').length;

  const nameValid = mode === 'edit' || NAME_RE.test(name);
  const samplesFilled = placeholders.every((_, i) => (samples[i] ?? '').trim().length > 0);
  const buttonsValid = buttons.every((b) => {
    const t = b.text.trim();
    if (t.length === 0 || t.length > 25) return false;
    if (b.type === 'URL') return (b.url ?? '').trim().length > 0;
    if (b.type === 'PHONE_NUMBER')
      return (b.countryCode ?? '').trim().length > 0 && (b.phone ?? '').trim().length > 0;
    return true;
  });
  const buttonsWithinLimits = ctaCount <= 2 && qrCount <= 3;
  const headerReady = !isMediaHeader || (!!headerHandle && !headerUploading);

  const canSubmit =
    !submitting &&
    !headerUploading &&
    nameValid &&
    body.trim().length > 0 &&
    language.trim().length > 0 &&
    samplesFilled &&
    buttonsValid &&
    buttonsWithinLimits &&
    headerReady;

  /** Map editor drafts to the API button shape (combine dial code + number for phone buttons). */
  function toApiButtons(): TemplateButtonInput[] {
    return buttons.map((b) => {
      if (b.type === 'URL') return { type: 'URL', text: b.text.trim(), url: (b.url ?? '').trim() };
      if (b.type === 'PHONE_NUMBER') {
        const cc = (b.countryCode ?? '').trim();
        const dial = cc.startsWith('+') ? cc : `+${cc}`;
        const phoneNumber = `${dial}${(b.phone ?? '').trim()}`.replace(/\s+/g, '');
        return { type: 'PHONE_NUMBER', text: b.text.trim(), phoneNumber };
      }
      return { type: 'QUICK_REPLY', text: b.text.trim() };
    });
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    const headerFields: Partial<CreateTemplateRequest> =
      headerType === 'text' && header.trim()
        ? { header: header.trim() }
        : isMediaHeader && headerHandle
          ? {
              headerFormat: headerType.toUpperCase() as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
              headerHandle,
            }
          : {};

    const req: CreateTemplateRequest = {
      name: name.trim(),
      category,
      language: language.trim(),
      body: body.trim(),
      ...headerFields,
      ...(footer.trim() ? { footer: footer.trim() } : {}),
      ...(buttons.length > 0 ? { buttons: toApiButtons() } : {}),
      ...(placeholders.length > 0 ? { variableSamples: samples.map((s) => s.trim()) } : {}),
    };
    await onSubmit(req);
  }

  const media = isMediaHeader ? MEDIA_ACCEPT[headerType as 'image' | 'video' | 'document'] : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 p-0" hideClose>
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-border px-5 py-4">
          <DialogTitle>{mode === 'edit' ? 'Edit template' : 'Create template'}</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 lg:flex-row">
          {/* ---- Form column ---- */}
          <div className="flex-1 space-y-4">
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive-emphasis">
                {error}
              </p>
            )}

            <Field label="Template name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                disabled={mode === 'edit'}
                placeholder="order_confirmation"
                className={`${inputCls} disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-70`}
              />
              {mode === 'create' && name.length > 0 && !nameValid && (
                <span className="text-[11px] text-destructive-emphasis">
                  Lowercase letters, digits and underscores only.
                </span>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
                  className={inputCls}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={inputCls}
                >
                  {TEMPLATE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Header type selector + per-type input. */}
            <Field label="Header (optional)">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {HEADER_TYPES.map((h) => (
                  <button key={h.value} type="button" onClick={() => setHeaderType(h.value)} className={pillCls(headerType === h.value)}>
                    {h.label}
                  </button>
                ))}
              </div>

              {headerType === 'text' && (
                <input
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. Order update"
                  className={inputCls}
                />
              )}

              {isMediaHeader && media && (
                <div className="space-y-1.5">
                  <input
                    type="file"
                    accept={media.accept}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleMediaFile(file);
                    }}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-secondary-foreground hover:file:bg-secondary/70"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Sample {headerType} ({media.hint}) — Meta requires it to review the template.
                  </span>
                  {headerUploading && <span className="block text-[11px] text-muted-foreground">Uploading…</span>}
                  {headerHandle && !headerUploading && (
                    <span className="block text-[11px] text-success-emphasis">
                      ✓ Uploaded {headerFileName ? `“${headerFileName}”` : ''}
                    </span>
                  )}
                  {headerUploadError && (
                    <span className="block text-[11px] text-destructive-emphasis">{headerUploadError}</span>
                  )}
                </div>
              )}
            </Field>

            <Field label="Body">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Hi {{1}}, your order {{2}} is confirmed."
                className={`${inputCls} resize-y`}
              />
              <span className="text-[11px] text-muted-foreground">
                Use {'{{1}}'}, {'{{2}}'}… for variables.
              </span>
            </Field>

            {placeholders.length > 0 && (
              <Field label="Sample values (for Meta review)">
                <div className="space-y-2">
                  {placeholders.map((n, i) => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-xs text-muted-foreground">{`{{${n}}}`}</span>
                      <input
                        value={samples[i] ?? ''}
                        onChange={(e) =>
                          setSamples((prev) => prev.map((s, j) => (j === i ? e.target.value : s)))
                        }
                        placeholder={`Example for {{${n}}}`}
                        className={inputCls}
                      />
                    </div>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Footer (optional)">
              <input
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                maxLength={60}
                placeholder="e.g. Reply STOP to opt out"
                className={inputCls}
              />
            </Field>

            {/* Buttons: pick a family, then add buttons within its limits. */}
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Buttons (optional)</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(
                  [
                    { value: 'none', label: 'None' },
                    { value: 'cta', label: 'Call to actions' },
                    { value: 'quick', label: 'Quick replies' },
                  ] as { value: ButtonMode; label: string }[]
                ).map((m) => (
                  <button key={m.value} type="button" onClick={() => setMode(m.value)} className={pillCls(buttonMode === m.value)}>
                    {m.label}
                  </button>
                ))}
              </div>

              {buttonMode === 'cta' && (
                <div className="space-y-2">
                  {buttons.length < 2 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setButtons((p) => [...p, { type: 'URL', text: '', url: '' }])}
                        className={addBtnCls}
                      >
                        + URL
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setButtons((p) => [
                            ...p,
                            { type: 'PHONE_NUMBER', text: '', countryCode: '+91', phone: '' },
                          ])
                        }
                        className={addBtnCls}
                      >
                        + Phone number
                      </button>
                    </div>
                  )}
                  {buttons.map((b, i) => (
                    <div key={i} className="space-y-1 rounded-md border border-border p-2">
                      <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-[11px] uppercase text-muted-foreground">
                          {b.type === 'URL' ? 'URL' : 'Phone'}
                        </span>
                        <input
                          value={b.text}
                          onChange={(e) => updateButton(i, { text: e.target.value })}
                          placeholder="Button text"
                          maxLength={25}
                          className={inputCls}
                        />
                        <button
                          type="button"
                          onClick={() => setButtons((p) => p.filter((_, j) => j !== i))}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Remove button"
                        >
                          ✕
                        </button>
                      </div>
                      {b.type === 'URL' ? (
                        <input
                          value={b.url ?? ''}
                          onChange={(e) => updateButton(i, { url: e.target.value })}
                          placeholder="https://example.com/{{1}}"
                          className={inputCls}
                        />
                      ) : (
                        <div className="flex gap-2">
                          <input
                            value={b.countryCode ?? ''}
                            onChange={(e) => updateButton(i, { countryCode: e.target.value })}
                            placeholder="+91"
                            className={`${inputCls} w-20 shrink-0`}
                          />
                          <input
                            value={b.phone ?? ''}
                            onChange={(e) => updateButton(i, { phone: e.target.value })}
                            placeholder="9876543210"
                            className={inputCls}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <span className="text-[11px] text-muted-foreground">Up to 2 call-to-action buttons.</span>
                </div>
              )}

              {buttonMode === 'quick' && (
                <div className="space-y-2">
                  {buttons.length < 3 && (
                    <button
                      type="button"
                      onClick={() => setButtons((p) => [...p, { type: 'QUICK_REPLY', text: '' }])}
                      className={addBtnCls}
                    >
                      + Quick reply
                    </button>
                  )}
                  {buttons.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-[11px] uppercase text-muted-foreground">Reply</span>
                      <input
                        value={b.text}
                        onChange={(e) => updateButton(i, { text: e.target.value })}
                        placeholder="Quick reply text"
                        maxLength={25}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={() => setButtons((p) => p.filter((_, j) => j !== i))}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="Remove button"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <span className="text-[11px] text-muted-foreground">Up to 3 quick-reply buttons.</span>
                </div>
              )}
            </div>
          </div>

          {/* ---- Live preview column ---- */}
          <div className="lg:w-72 lg:shrink-0">
            <div className="lg:sticky lg:top-0">
              <TemplatePreview
                headerType={headerType}
                headerText={header}
                headerMediaName={headerFileName}
                headerPreviewUrl={headerPreviewUrl}
                body={body}
                placeholders={placeholders}
                samples={samples}
                footer={footer}
                buttons={buttons}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? 'Submitting…' : mode === 'edit' ? 'Save & re-submit' : 'Submit for review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shared input/select/textarea styling (match the design-system Input look). */
const inputCls =
  'flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/** Segmented "pill" toggle (header type + button family). */
function pillCls(active: boolean): string {
  return cn(
    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
    active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  );
}

/** Small "+ add" outline button for adding interactive buttons. */
const addBtnCls =
  'rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground shadow-xs transition-colors hover:bg-secondary';

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
