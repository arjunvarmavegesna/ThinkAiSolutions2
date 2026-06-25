/**
 * "Connect WhatsApp" via Meta Embedded Signup (the primary onboarding path for metaCloud).
 *
 * Launches the ES popup (useEmbeddedSignup), then posts the captured { code, wabaId,
 * phoneNumberId } to /admin/onboarding/exchange. The server exchanges the code, subscribes our
 * app, and persists the WABA. The number is registered for sending by Embedded Signup itself,
 * so no manual registration PIN is collected here. Nothing secret touches the browser — the
 * App id / Config id are public and come from the server.
 */
import { useEffect, useState } from 'react';

import type {
  ExchangeSignupCodeResponse,
  OnboardingConfigResponse,
} from '@thinkai/shared';

import { getOnboardingConfig } from '../../api/adminApi';
import { ApiError } from '../../lib/apiClient';
import { useEmbeddedSignup } from '../../hooks/useEmbeddedSignup';

/** Captured ES values handed to the injected exchange fn (the caller wires the tenant). */
export interface EmbeddedSignupCaptureInput {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  pin?: string;
}

export interface EmbeddedSignupButtonProps {
  /** Called after a successful onboarding so the parent can refresh state. */
  onConnected?: () => void;
  /**
   * Performs the server-side exchange. Admin callers wire the tenantId in
   * (`(c) => exchangeEmbeddedSignupCode({ tenantId, ...c })`); the tenant-scoped caller passes
   * `exchangeTenantSignupCode` directly (tenant comes from the token).
   */
  exchange: (capture: EmbeddedSignupCaptureInput) => Promise<ExchangeSignupCodeResponse>;
  /** Config fetcher; defaults (inside the hook) to the admin path. */
  fetchConfig?: () => Promise<OnboardingConfigResponse>;
}

export function EmbeddedSignupButton({ onConnected, exchange, fetchConfig }: EmbeddedSignupButtonProps) {
  const { launch, loading } = useEmbeddedSignup(fetchConfig);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // null = still checking; false = ES not available (test mode / pre-approval) -> show a hint.
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const load = fetchConfig ?? getOnboardingConfig;
    load()
      .then((cfg) => {
        if (active) setAvailable(cfg.embeddedSignupAvailable);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [fetchConfig]);

  const busy = loading || submitting;

  async function handleConnect() {
    setError(null);
    setSuccess(null);
    try {
      // 1. Open the ES popup and capture the code + Meta ids.
      const capture = await launch();

      // 2. Finish onboarding server-side (caller wired admin vs tenant-scoped exchange).
      setSubmitting(true);
      const res = await exchange({
        code: capture.code,
        wabaId: capture.wabaId,
        phoneNumberId: capture.phoneNumberId,
      });

      const detail = res.subscribed
        ? 'Your number is linked and receiving messages.'
        : 'Subscription is pending — try connecting again.';
      setSuccess(`WhatsApp connected (${res.status}). ${detail}`);
      onConnected?.();
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

  if (available === null) {
    return <p className="text-sm text-slate-500">Checking…</p>;
  }

  if (!available) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500"
        >
          Connect WhatsApp — available after approval
        </button>
        <p className="text-xs text-slate-500">
          Embedded Signup unlocks after Meta app review. Until then, an admin can connect a
          number manually (including the Meta test number) from the manual connect option.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleConnect}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {busy ? 'Connecting…' : 'Connect WhatsApp'}
      </button>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {success && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      )}
    </div>
  );
}
