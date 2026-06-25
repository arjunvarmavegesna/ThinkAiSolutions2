/**
 * Reusable per-category pricing editor for the reseller admin.
 *
 * UX rule (CLIENT CONTRACT): the admin edits RUPEES; we convert to integer paise at
 * the edge (on submit) via rupeesToPaise. We also let the admin record our own BSP
 * COST rates so we can show a live margin preview (charge − cost) per category. Cost
 * rates are reseller-only and are written to pricingCost server-side.
 *
 * This component is presentational + local-state only: the parent owns submission
 * (used both inside the CreateTenant wizard and the standalone PricingPage).
 */
import { useState } from 'react';
import type { SetPricingRequest } from '@thinkai/shared';
import { paiseToRupees, rupeesToPaise } from '@thinkai/shared';

/** The three billable categories we price. 'service' is always free. */
type Category = 'marketing' | 'utility' | 'auth';

const CATEGORY_LABELS: Record<Category, string> = {
  marketing: 'Marketing',
  utility: 'Utility',
  auth: 'Authentication',
};

/** Rupee-string form state — one charge + one cost field per category. */
interface FormState {
  chargeMarketing: string;
  chargeUtility: string;
  chargeAuth: string;
  costMarketing: string;
  costUtility: string;
  costAuth: string;
}

export interface PricingFormInitial {
  /** Charge rates (what we bill the tenant) in paise. */
  marketingPaise?: number;
  utilityPaise?: number;
  authPaise?: number;
  /** Our cost rates (BSP wholesale) in paise. */
  costMarketingPaise?: number;
  costUtilityPaise?: number;
  costAuthPaise?: number;
}

export interface PricingFormProps {
  /** Existing rates to prefill (paise). Omitted/zero -> empty fields. */
  initial?: PricingFormInitial;
  /** Submit handler: receives the per-category rate request body sans tenantId. */
  onSubmit: (req: Omit<SetPricingRequest, 'tenantId'>) => Promise<void> | void;
  /** Disable inputs + button while the parent is saving. */
  submitting?: boolean;
  /** Button label (wizard uses "Save & finish", editor uses "Save pricing"). */
  submitLabel?: string;
  /** Optional error string surfaced by the parent. */
  error?: string | null;
}

/** Paise -> rupee string for a text input; empty string when no rate set. */
function paiseToField(paise: number | undefined): string {
  if (paise === undefined || paise === 0) return '';
  return String(paiseToRupees(paise));
}

/** Parse a rupee text field to paise; returns NaN for unparseable input. */
function fieldToPaise(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) return Number.NaN;
  return rupeesToPaise(rupees);
}

export function PricingForm({
  initial,
  onSubmit,
  submitting = false,
  submitLabel = 'Save pricing',
  error,
}: PricingFormProps) {
  const [form, setForm] = useState<FormState>(() => ({
    chargeMarketing: paiseToField(initial?.marketingPaise),
    chargeUtility: paiseToField(initial?.utilityPaise),
    chargeAuth: paiseToField(initial?.authPaise),
    costMarketing: paiseToField(initial?.costMarketingPaise),
    costUtility: paiseToField(initial?.costUtilityPaise),
    costAuth: paiseToField(initial?.costAuthPaise),
  }));
  const [localError, setLocalError] = useState<string | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Live margin = charge − cost, computed per category in paise from the rupee fields.
  function marginPaise(charge: string, cost: string): number | null {
    const c = fieldToPaise(charge);
    const k = fieldToPaise(cost);
    if (Number.isNaN(c) || Number.isNaN(k)) return null;
    if (cost.trim() === '') return null; // no cost recorded -> no margin to show
    return c - k;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const marketingPaise = fieldToPaise(form.chargeMarketing);
    const utilityPaise = fieldToPaise(form.chargeUtility);
    const authPaise = fieldToPaise(form.chargeAuth);
    const costMarketingPaise = fieldToPaise(form.costMarketing);
    const costUtilityPaise = fieldToPaise(form.costUtility);
    const costAuthPaise = fieldToPaise(form.costAuth);

    const anyNaN = [
      marketingPaise,
      utilityPaise,
      authPaise,
      costMarketingPaise,
      costUtilityPaise,
      costAuthPaise,
    ].some((v) => Number.isNaN(v));
    if (anyNaN) {
      setLocalError('Rates must be non-negative numbers (rupees).');
      return;
    }

    // Only send cost fields the admin actually filled in (avoid overwriting with 0).
    const req: Omit<SetPricingRequest, 'tenantId'> = {
      marketingPaise,
      utilityPaise,
      authPaise,
    };
    if (form.costMarketing.trim() !== '') req.costMarketingPaise = costMarketingPaise;
    if (form.costUtility.trim() !== '') req.costUtilityPaise = costUtilityPaise;
    if (form.costAuth.trim() !== '') req.costAuthPaise = costAuthPaise;

    await onSubmit(req);
  }

  const shownError = error ?? localError;
  const categories: { key: Category; chargeField: keyof FormState; costField: keyof FormState }[] =
    [
      { key: 'marketing', chargeField: 'chargeMarketing', costField: 'costMarketing' },
      { key: 'utility', chargeField: 'chargeUtility', costField: 'costUtility' },
      { key: 'auth', chargeField: 'chargeAuth', costField: 'costAuth' },
    ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Charge rate (₹/msg)</th>
              <th className="px-4 py-3 font-medium">Our cost (₹/msg)</th>
              <th className="px-4 py-3 font-medium">Margin (₹/msg)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map(({ key, chargeField, costField }) => {
              const margin = marginPaise(form[chargeField], form[costField]);
              const marginNegative = margin !== null && margin < 0;
              return (
                <tr key={key}>
                  <td className="px-4 py-3 font-medium text-gray-700">
                    {CATEGORY_LABELS[key]}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={form[chargeField]}
                      onChange={(e) => update(chargeField, e.target.value)}
                      disabled={submitting}
                      placeholder="0.00"
                      className="w-28 rounded border border-gray-300 px-2 py-1 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={form[costField]}
                      onChange={(e) => update(costField, e.target.value)}
                      disabled={submitting}
                      placeholder="0.00"
                      className="w-28 rounded border border-gray-300 px-2 py-1 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {margin === null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span
                        className={
                          marginNegative
                            ? 'font-medium text-red-600'
                            : 'font-medium text-emerald-600'
                        }
                      >
                        ₹{paiseToRupees(margin).toFixed(2)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Service messages (free-text inside the 24h window) are always free. GST is added
        once at wallet recharge, not per message.
      </p>

      {shownError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{shownError}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
