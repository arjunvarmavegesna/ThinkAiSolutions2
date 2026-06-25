/**
 * Standalone per-tenant pricing editor (reseller admin).
 * Loads current charge + cost rates (GET /api/admin/pricing/:tenantId) and saves edits
 * (PUT /api/admin/pricing/:tenantId). The PricingForm owns rupee<->paise conversion and
 * the live margin preview.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PricingResponse, SetPricingRequest } from '@thinkai/shared';
import { getPricing, setPricing } from '../../api/adminApi';
import { ApiError } from '../../lib/apiClient';
import { PricingForm } from '../../components/admin/PricingForm';
import type { PricingFormInitial } from '../../components/admin/PricingForm';

export function PricingPage() {
  const { tenantId = '' } = useParams<{ tenantId: string }>();

  const [initial, setInitial] = useState<PricingFormInitial | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  /** Flatten the PricingResponse (charge + cost docs) into the form's initial paise. */
  function toInitial(res: PricingResponse): PricingFormInitial {
    return {
      marketingPaise: res.charge?.marketingPaise,
      utilityPaise: res.charge?.utilityPaise,
      authPaise: res.charge?.authPaise,
      costMarketingPaise: res.cost?.marketingPaise,
      costUtilityPaise: res.cost?.utilityPaise,
      costAuthPaise: res.cost?.authPaise,
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getPricing(tenantId);
      setInitial(toInitial(res));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load pricing.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(req: Omit<SetPricingRequest, 'tenantId'>) {
    setSaveError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      const res = await setPricing(tenantId, { tenantId, ...req });
      setInitial(toInitial(res));
      setSavedMessage('Pricing saved.');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save pricing.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        to={`/admin/tenants/${encodeURIComponent(tenantId)}`}
        className="text-sm text-emerald-700 hover:underline"
      >
        ← Back to tenant
      </Link>

      <h1 className="mt-4 mb-1 text-2xl font-semibold text-gray-900">Pricing</h1>
      <p className="mb-6 text-sm text-gray-500">
        Per-category rates you charge this tenant, with a margin preview against your BSP
        cost.
      </p>

      {loading && <p className="text-sm text-gray-500">Loading pricing…</p>}

      {loadError && !loading && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}

      {!loading && !loadError && initial && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <PricingForm
            initial={initial}
            onSubmit={handleSubmit}
            submitting={saving}
            submitLabel="Save pricing"
            error={saveError}
          />
          {savedMessage && (
            <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {savedMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
