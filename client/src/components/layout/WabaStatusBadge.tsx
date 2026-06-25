/**
 * Console top-bar widget showing the tenant's WhatsApp Business API status (AiSensy-style):
 *  - connected -> green "Connected" chip
 *  - otherwise -> amber "Pending" chip + a "Continue with Facebook" button (tenant_admin only)
 *    that launches Meta Embedded Signup and finishes onboarding on the caller's own tenant.
 *
 * Embedded Signup only works in live mode (`config.embeddedSignupAvailable`); in test /
 * pre-approval the button is disabled with a hint, mirroring EmbeddedSignupButton. This is the
 * in-console entry point that replaces the post-signup full-page /connect redirect.
 */
import { useEffect, useState } from 'react';

import type { WabaStatusResponse } from '@thinkai/shared';

import { useAuth } from '../../auth/useAuth';
import { useEmbeddedSignup } from '../../hooks/useEmbeddedSignup';
import {
  exchangeTenantSignupCode,
  getTenantOnboardingConfig,
  getWabaStatus,
} from '../../api/onboardingApi';
import { ApiError } from '../../lib/apiClient';

export function WabaStatusBadge(): JSX.Element | null {
  const { role } = useAuth();
  const { launch, loading } = useEmbeddedSignup(getTenantOnboardingConfig);

  const [status, setStatus] = useState<WabaStatusResponse | null>(null);
  // null = still loading; true/false = whether Embedded Signup is usable right now.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load WABA status + whether Embedded Signup is usable (live mode + a Config id is set).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [s, cfg] = await Promise.all([getWabaStatus(), getTenantOnboardingConfig()]);
        if (!active) return;
        setStatus(s);
        setAvailable(cfg.embeddedSignupAvailable);
      } catch {
        // Don't break the header on a transient failure — assume not connected / not available.
        if (active) {
          setStatus({ hasWaba: false, connected: false });
          setAvailable(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleConnect(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      // 1. Open the Embedded Signup popup and capture the code + Meta ids.
      const capture = await launch();
      // 2. Finish onboarding on the caller's own tenant (tenant comes from the token).
      await exchangeTenantSignupCode({
        code: capture.code,
        wabaId: capture.wabaId,
        phoneNumberId: capture.phoneNumberId,
      });
      // 3. Re-read status so the chip flips to "Connected".
      setStatus(await getWabaStatus());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to connect WhatsApp.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Until the first status load resolves, render nothing (avoids a header flash).
  if (status === null) return null;

  if (status.connected) {
    return (
      <span className="hidden items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 sm:inline-flex">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        WhatsApp Business API: Connected
      </span>
    );
  }

  const canApply = role === 'tenant_admin';
  const busy = loading || submitting;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 sm:inline-flex">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        WhatsApp Business API:&nbsp;<span className="font-semibold">Pending</span>
      </span>

      {canApply && (
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={busy || available === false}
          title={
            available === false
              ? 'Embedded Signup unlocks after Meta app review. Until then, a number can be connected manually.'
              : error ?? undefined
          }
          className="inline-flex items-center gap-2 rounded-md bg-[#1877F2] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#166fe0] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FacebookGlyph />
          {busy
            ? 'Connecting…'
            : available === false
              ? 'Apply (after approval)'
              : 'Continue with Facebook'}
        </button>
      )}

      {error && (
        <span
          className="hidden max-w-[14rem] truncate text-xs text-rose-600 lg:inline"
          title={error}
        >
          {error}
        </span>
      )}
    </div>
  );
}

/** Facebook "f" glyph for the Continue-with-Facebook button. */
function FacebookGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}
