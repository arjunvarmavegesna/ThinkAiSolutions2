/**
 * Post-signup "Connect WhatsApp" step for a tenant_admin (the self-serve onboarding page).
 * Reuses the shared EmbeddedSignupButton wired to the TENANT-scoped onboarding endpoints
 * (the tenant comes from the caller's token — no tenantId is sent). If the tenant already has
 * a connected WABA, we skip straight to the dashboard.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmbeddedSignupButton } from '../components/admin/EmbeddedSignupButton';
import {
  exchangeTenantSignupCode,
  getTenantOnboardingConfig,
  getWabaStatus,
} from '../api/onboardingApi';
import { useAuth } from '../auth/useAuth';

export function Connect(): JSX.Element {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [checking, setChecking] = useState(true);

  // If a WABA is already connected, don't make them onboard again.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await getWabaStatus();
        if (active && status.connected) {
          navigate('/dashboard', { replace: true });
          return;
        }
      } catch {
        // Ignore — let them attempt onboarding; the button surfaces real errors.
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleConnected(): Promise<void> {
    try {
      const status = await getWabaStatus();
      if (status.connected) navigate('/dashboard', { replace: true });
    } catch {
      // Stay on the page; the button already showed a success/error message.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
            T
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Connect your WhatsApp</h1>
          <p className="mt-1 text-sm text-slate-500">
            Link your WhatsApp Business number to start sending and receiving messages.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {checking ? (
            <p className="text-sm text-slate-500">Checking your account…</p>
          ) : (
            <EmbeddedSignupButton
              onConnected={handleConnected}
              exchange={exchangeTenantSignupCode}
              fetchConfig={getTenantOnboardingConfig}
            />
          )}
        </div>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="font-medium text-slate-500 hover:text-slate-700"
          >
            Skip for now →
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="font-medium text-slate-400 hover:text-slate-600"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
