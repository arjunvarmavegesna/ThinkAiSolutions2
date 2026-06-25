/**
 * 4-step tenant onboarding wizard (reseller admin).
 *
 *   Step 1  Tenant + billing  -> POST /api/admin/tenants   (returns tenantId)
 *   Step 2  Tenant-admin user -> POST /api/admin/users
 *   Step 3  WABA + apikey     -> POST /api/admin/wabas      (apikey write-only)
 *   Step 4  Pricing           -> PUT  /api/admin/pricing/:tenantId
 *
 * Each step is its own API call (per CLIENT CONTRACT) so a tenant is created as soon
 * as step 1 succeeds; later steps mutate that same tenantId. We never let the admin
 * pass a tenantId by hand — it comes from the step-1 response and is threaded forward.
 *
 * GSTIN is validated with isValidGstin BEFORE submit and malformed input is rejected.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ConnectWabaRequest,
  CreateTenantRequest,
  CreateTenantUserRequest,
  SetPricingRequest,
} from '@thinkai/shared';
import { isValidGstin, stateCodeFromGstin } from '@thinkai/shared';
import {
  connectWaba,
  createTenant,
  createTenantUser,
  exchangeEmbeddedSignupCode,
  setPricing,
} from '../../api/adminApi';
import { ApiError } from '../../lib/apiClient';
import { WabaConnectForm } from '../../components/admin/WabaConnectForm';
import { EmbeddedSignupButton } from '../../components/admin/EmbeddedSignupButton';
import { PricingForm } from '../../components/admin/PricingForm';

type StepIndex = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<StepIndex, string> = {
  1: 'Tenant & billing',
  2: 'Tenant admin',
  3: 'WhatsApp number',
  4: 'Pricing',
};

export function CreateTenantPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<StepIndex>(1);
  /** Set once step 1 succeeds; threaded into steps 2–4. */
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Step 1 form state ----
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [address, setAddress] = useState('');

  // ---- Step 2 form state ----
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');

  /** Translate any thrown error into a user-facing string. */
  function toMessage(err: unknown, fallback: string): string {
    return err instanceof ApiError ? err.message : fallback;
  }

  // ----- Step 1: create tenant -----
  async function submitStep1(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Tenant name is required.');
      return;
    }
    const trimmedGstin = gstin.trim().toUpperCase();
    if (trimmedGstin && !isValidGstin(trimmedGstin)) {
      setError('GSTIN is malformed. Expected a valid 15-character GSTIN.');
      return;
    }

    // If no explicit state code, derive it from the GSTIN for the invoice path later.
    const derivedState = trimmedGstin ? stateCodeFromGstin(trimmedGstin) : null;
    const effectiveStateCode = stateCode.trim() || derivedState || '';

    const req: CreateTenantRequest = {
      name: name.trim(),
      ...(plan.trim() ? { plan: plan.trim() } : {}),
      billing: {
        ...(legalName.trim() ? { legalName: legalName.trim() } : {}),
        ...(trimmedGstin ? { gstin: trimmedGstin } : {}),
        ...(effectiveStateCode ? { stateCode: effectiveStateCode } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
      },
    };

    setSubmitting(true);
    try {
      const res = await createTenant(req);
      setTenantId(res.tenantId);
      setStep(2);
    } catch (err) {
      setError(toMessage(err, 'Failed to create tenant.'));
    } finally {
      setSubmitting(false);
    }
  }

  // ----- Step 2: create tenant-admin user -----
  async function submitStep2(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tenantId) {
      setError('Tenant must be created first.');
      return;
    }
    if (!userName.trim() || !userEmail.trim() || userPassword.length < 6) {
      setError('Name, email, and a password of at least 6 characters are required.');
      return;
    }

    const req: CreateTenantUserRequest = {
      tenantId,
      name: userName.trim(),
      email: userEmail.trim(),
      password: userPassword,
      role: 'tenant_admin',
    };

    setSubmitting(true);
    try {
      await createTenantUser(req);
      setStep(3);
    } catch (err) {
      setError(toMessage(err, 'Failed to create tenant admin user.'));
    } finally {
      setSubmitting(false);
    }
  }

  // ----- Step 3: connect WABA -----
  async function submitStep3(waba: Omit<ConnectWabaRequest, 'tenantId'>) {
    setError(null);
    if (!tenantId) {
      setError('Tenant must be created first.');
      return;
    }
    setSubmitting(true);
    try {
      await connectWaba({ tenantId, ...waba });
      setStep(4);
    } catch (err) {
      setError(toMessage(err, 'Failed to connect the WhatsApp number.'));
    } finally {
      setSubmitting(false);
    }
  }

  // ----- Step 4: pricing (final) -----
  async function submitStep4(pricing: Omit<SetPricingRequest, 'tenantId'>) {
    setError(null);
    if (!tenantId) {
      setError('Tenant must be created first.');
      return;
    }
    setSubmitting(true);
    try {
      await setPricing(tenantId, { tenantId, ...pricing });
      // Done — drop the admin into the new tenant's detail page.
      navigate(`/admin/tenants/${encodeURIComponent(tenantId)}`);
    } catch (err) {
      setError(toMessage(err, 'Failed to save pricing.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">New tenant</h1>
      <p className="mb-6 text-sm text-gray-500">
        Onboard a client in four steps. The tenant is created at step 1; later steps add
        the login, WhatsApp number, and pricing.
      </p>

      <Stepper current={step} />

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        {step === 1 && (
          <form onSubmit={submitStep1} className="space-y-4">
            <TextField
              label="Tenant name"
              value={name}
              onChange={setName}
              placeholder="Acme Clinic"
              disabled={submitting}
              required
            />
            <TextField
              label="Plan (optional)"
              value={plan}
              onChange={setPlan}
              placeholder="starter"
              disabled={submitting}
            />
            <hr className="border-gray-100" />
            <p className="text-sm font-medium text-gray-700">Billing</p>
            <TextField
              label="Legal name (optional)"
              value={legalName}
              onChange={setLegalName}
              disabled={submitting}
            />
            <TextField
              label="GSTIN (optional)"
              value={gstin}
              onChange={setGstin}
              placeholder="22AAAAA0000A1Z5"
              disabled={submitting}
              mono
            />
            <TextField
              label="State code (optional, 01–37/97)"
              value={stateCode}
              onChange={setStateCode}
              placeholder="Derived from GSTIN if blank"
              disabled={submitting}
            />
            <TextField
              label="Address (optional)"
              value={address}
              onChange={setAddress}
              disabled={submitting}
            />
            {error && <ErrorBanner message={error} />}
            <PrimaryButton submitting={submitting} label="Create tenant & continue" />
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submitStep2} className="space-y-4">
            <p className="text-sm text-gray-600">
              Create the tenant-admin login. They will manage their own inbox, wallet,
              and agents.
            </p>
            <TextField
              label="Full name"
              value={userName}
              onChange={setUserName}
              disabled={submitting}
              required
            />
            <TextField
              label="Email"
              value={userEmail}
              onChange={setUserEmail}
              type="email"
              disabled={submitting}
              required
            />
            <TextField
              label="Temporary password (min 6 chars)"
              value={userPassword}
              onChange={setUserPassword}
              type="password"
              disabled={submitting}
              required
            />
            {error && <ErrorBanner message={error} />}
            <div className="flex gap-3">
              <BackButton onClick={() => setStep(1)} disabled={submitting} />
              <PrimaryButton submitting={submitting} label="Create user & continue" />
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Connect the tenant&apos;s WhatsApp number via Meta Embedded Signup. The client
              authorizes in the popup — no Meta key is handled here. You can also skip and
              connect it later from the tenant page.
            </p>
            {tenantId && (
              <EmbeddedSignupButton
                onConnected={() => setStep(4)}
                exchange={(c) => exchangeEmbeddedSignupCode({ tenantId, ...c })}
              />
            )}

            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700">
                Manual connect (metaCloud test number / legacy BSP)
              </summary>
              <div className="mt-3">
                <WabaConnectForm
                  onSubmit={submitStep3}
                  submitting={submitting}
                  submitLabel="Connect & continue"
                  error={error}
                />
              </div>
            </details>

            <div className="flex gap-3">
              <BackButton onClick={() => setStep(2)} disabled={submitting} />
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={submitting}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                Skip for now →
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Set the per-category rates you charge this tenant. Record your Meta raw cost to
              preview margin.
            </p>
            <PricingForm
              onSubmit={submitStep4}
              submitting={submitting}
              submitLabel="Save pricing & finish"
              error={error}
            />
            <BackButton onClick={() => setStep(3)} disabled={submitting} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Horizontal step indicator. */
function Stepper({ current }: { current: StepIndex }) {
  const steps: StepIndex[] = [1, 2, 3, 4];
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s) => {
        const done = s < current;
        const active = s === current;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={[
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                active
                  ? 'bg-emerald-600 text-white'
                  : done
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-gray-100 text-gray-400',
              ].join(' ')}
            >
              {s}
            </span>
            <span
              className={[
                'text-xs',
                active ? 'font-medium text-gray-900' : 'text-gray-400',
              ].join(' ')}
            >
              {STEP_LABELS[s]}
            </span>
            {s !== 4 && <span className="h-px flex-1 bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {props.label}
        {props.required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        className={[
          'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-100',
          props.mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </div>
  );
}

function PrimaryButton({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
    >
      {submitting ? 'Saving…' : label}
    </button>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
    >
      Back
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}
