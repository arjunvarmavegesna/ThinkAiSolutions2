/**
 * Add / edit a single contact. Phone is the identity: editable on create (E.164), locked on edit.
 * Tags use the palette-aware TagPicker; custom attributes render one input per tenant-defined
 * attribute. The parent maps the emitted payload to POST (create) or PATCH (edit).
 */
import { useEffect, useState } from 'react';
import { OPT_IN_STATUSES, CONTACT_STATUSES } from '@thinkai/shared';
import type {
  ContactAttributeDef,
  ContactDTO,
  ContactStatus,
  ContactTag,
  OptInStatus,
} from '@thinkai/shared';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TagPicker } from './TagPicker';

export interface ContactFormPayload {
  phone: string;
  name?: string;
  tags: string[];
  optInStatus: OptInStatus;
  status: ContactStatus;
  attributes: Record<string, string>;
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: ContactDTO;
  attributes: ContactAttributeDef[];
  palette: ContactTag[];
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: ContactFormPayload) => Promise<void>;
}

/** Shared select styling (match the Input look). */
const selectCls =
  'flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export function ContactEditorModal({
  open,
  mode,
  initial,
  attributes,
  palette,
  submitting,
  error,
  onClose,
  onSubmit,
}: Props): JSX.Element {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [optInStatus, setOptInStatus] = useState<OptInStatus>('unknown');
  const [status, setStatus] = useState<ContactStatus>('active');
  const [attrs, setAttrs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setPhone(initial?.phone ?? '');
    setName(initial?.name ?? '');
    setTags(initial?.tags ?? []);
    setOptInStatus(initial?.optInStatus ?? 'unknown');
    setStatus(initial?.status ?? 'active');
    const seeded: Record<string, string> = {};
    for (const def of attributes) {
      seeded[def.name] = initial?.attributes?.[def.name] ?? def.defaultValue ?? '';
    }
    setAttrs(seeded);
  }, [open, initial, attributes]);

  const phoneOk = phone.replace(/[^0-9]/g, '').length >= 7;
  const canSubmit = !submitting && phoneOk;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    const cleanedAttrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (v.trim().length > 0) cleanedAttrs[k] = v.trim();
    }
    await onSubmit({
      phone: phone.trim(),
      name: name.trim() || undefined,
      tags,
      optInStatus,
      status,
      attributes: cleanedAttrs,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{mode === 'edit' ? 'Edit contact' : 'Add contact'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive-emphasis">
              {error}
            </p>
          )}

          <Field label="Mobile number">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={mode === 'edit'}
              placeholder="+919876543210"
              className="disabled:bg-secondary"
            />
            {phone.length > 0 && !phoneOk && (
              <span className="text-[11px] text-destructive-emphasis">Enter a valid number with country code.</span>
            )}
          </Field>

          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Opt-in status">
              <select value={optInStatus} onChange={(e) => setOptInStatus(e.target.value as OptInStatus)} className={selectCls}>
                {OPT_IN_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as ContactStatus)} className={selectCls}>
                {CONTACT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Tags">
            <TagPicker value={tags} onChange={setTags} palette={palette} />
          </Field>

          {attributes.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-muted-foreground">Attributes</p>
              <div className="space-y-2">
                {attributes.map((def) => (
                  <div key={def.name} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={def.name}>
                      {def.name}
                    </span>
                    <Input
                      value={attrs[def.name] ?? ''}
                      onChange={(e) => setAttrs((p) => ({ ...p, [def.name]: e.target.value }))}
                      placeholder={def.defaultValue || `Value for ${def.name}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
