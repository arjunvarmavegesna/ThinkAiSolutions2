/**
 * Manual WABA connect form (reseller admin) for metaCloud — the manual fallback to Embedded
 * Signup, used to wire the Meta TEST number by hand (and for demo videos). Enter the WABA id +
 * phone_number_id. NO apikey: sends use the global Meta token (System User in live, the test
 * number's temporary token in test) and Meta verifies webhooks at the App level.
 */
import { useState } from 'react';
import type { ConnectWabaRequest } from '@thinkai/shared';

interface FormState {
  phoneNumber: string;
  displayName: string;
  wabaId: string;
  phoneNumberId: string;
}

export interface WabaConnectFormProps {
  /** Submit handler: parent injects tenantId and calls connectWaba. */
  onSubmit: (req: Omit<ConnectWabaRequest, 'tenantId'>) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
  /** Optional error string surfaced by the parent (e.g. health check failed). */
  error?: string | null;
}

const EMPTY: FormState = {
  phoneNumber: '',
  displayName: '',
  wabaId: '',
  phoneNumberId: '',
};

/** Loose E.164 check: a leading + and 8–15 digits. Server is the source of truth. */
function looksLikeE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

export function WabaConnectForm({
  onSubmit,
  submitting = false,
  submitLabel = 'Connect WABA',
  error,
}: WabaConnectFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [localError, setLocalError] = useState<string | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const phoneNumber = form.phoneNumber.trim();
    const displayName = form.displayName.trim();
    const wabaId = form.wabaId.trim();
    const phoneNumberId = form.phoneNumberId.trim();

    if (!looksLikeE164(phoneNumber)) {
      setLocalError('Phone number must be in E.164 format, e.g. +919876543210.');
      return;
    }
    if (!displayName) {
      setLocalError('Display name is required.');
      return;
    }
    if (!wabaId || !phoneNumberId) {
      setLocalError('Enter both the WABA id and the phone_number_id.');
      return;
    }

    await onSubmit({ provider: 'metaCloud', phoneNumber, displayName, wabaId, phoneNumberId });
  }

  const shownError = error ?? localError;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
      <p className="rounded bg-slate-50 px-3 py-2 text-xs text-gray-500">
        Direct Meta Cloud API connect. Enter the WABA id + phone_number_id — sends use the global
        Meta token (System User in live, the test number&apos;s temporary token in test), so no
        per-WABA apikey is needed.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Display name"
          value={form.displayName}
          onChange={(v) => update('displayName', v)}
          placeholder="Acme Clinic"
          disabled={submitting}
        />
        <Field
          label="Phone number (E.164)"
          value={form.phoneNumber}
          onChange={(v) => update('phoneNumber', v)}
          placeholder="+919876543210"
          disabled={submitting}
        />
        <Field
          label="WABA id (Meta)"
          value={form.wabaId}
          onChange={(v) => update('wabaId', v)}
          placeholder="Used for template fetch"
          disabled={submitting}
        />
        <Field
          label="phone_number_id (Meta)"
          value={form.phoneNumberId}
          onChange={(v) => update('phoneNumberId', v)}
          placeholder="Used for sending + webhooks"
          disabled={submitting}
        />
      </div>

      {shownError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{shownError}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {submitting ? 'Connecting…' : submitLabel}
      </button>
    </form>
  );
}

/** Small labelled text input used across the WABA form. */
function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{props.label}</label>
      <input
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-100"
      />
    </div>
  );
}
