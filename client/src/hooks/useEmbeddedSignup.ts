/**
 * Meta Embedded Signup launcher.
 *
 * Flow: fetch the PUBLIC Meta config from our server (App id + Config id + Graph version —
 * single source of truth, so the browser never hard-codes them), load the Facebook JS SDK via
 * <script> (no npm dependency), then FB.login with our Config id to open the ES popup. We
 * capture TWO things and combine them:
 *   - the authorization `code` (from the FB.login callback, response_type='code'), and
 *   - `waba_id` + `phone_number_id` (from the WA_EMBEDDED_SIGNUP postMessage 'FINISH' event).
 *
 * Nothing secret is involved: App id + Config id are public by design. The captured values are
 * handed to the caller, which posts them to /admin/onboarding/exchange for the server to finish.
 */
import { useCallback, useRef, useState } from 'react';

import type { OnboardingConfigResponse } from '@thinkai/shared';

import { getOnboardingConfig } from '../api/adminApi';

/** Minimal shape of the Facebook JS SDK surface we use. */
interface FbLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}
interface FbSdk {
  init: (params: Record<string, unknown>) => void;
  login: (cb: (resp: FbLoginResponse) => void, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

/** What the caller needs to complete onboarding server-side. */
export interface EmbeddedSignupCapture {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

/** Facebook origins that may post the Embedded Signup sessionInfo message. */
const FB_ORIGINS = new Set(['https://www.facebook.com', 'https://web.facebook.com']);

/** Load + init the FB SDK exactly once, returning the ready FB object. */
let sdkPromise: Promise<FbSdk> | null = null;
function loadFbSdk(appId: string, version: string): Promise<FbSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<FbSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      if (window.FB) resolve(window.FB);
      else reject(new Error('Facebook SDK failed to initialize'));
    };

    const id = 'facebook-jssdk';
    if (document.getElementById(id)) return; // script already injected; fbAsyncInit will fire.
    const script = document.createElement('script');
    script.id = id;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      sdkPromise = null; // allow a retry on a transient load failure.
      reject(new Error('Failed to load the Facebook SDK'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

export function useEmbeddedSignup(
  fetchConfig: () => Promise<OnboardingConfigResponse> = getOnboardingConfig,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against double-launch (the popup is modal but the button could be double-clicked).
  const inFlight = useRef(false);

  const launch = useCallback(async (): Promise<EmbeddedSignupCapture> => {
    if (inFlight.current) throw new Error('Signup already in progress');
    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const cfg = await fetchConfig();
      if (!cfg.appId || !cfg.configId) {
        throw new Error('Meta App id / Config id are not configured on the server');
      }
      const fb = await loadFbSdk(cfg.appId, cfg.graphVersion);

      return await new Promise<EmbeddedSignupCapture>((resolve, reject) => {
        let captured: { wabaId?: string; phoneNumberId?: string } = {};
        let code: string | undefined;
        let settled = false;

        const cleanup = () => {
          window.removeEventListener('message', onMessage);
        };
        const finish = () => {
          if (settled) return;
          if (code && captured.wabaId && captured.phoneNumberId) {
            settled = true;
            cleanup();
            resolve({ code, wabaId: captured.wabaId, phoneNumberId: captured.phoneNumberId });
          }
        };
        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(message));
        };

        // Capture waba_id + phone_number_id from the ES sessionInfo postMessage.
        function onMessage(event: MessageEvent) {
          if (!FB_ORIGINS.has(event.origin)) return;
          let data: unknown;
          try {
            data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          } catch {
            return;
          }
          if (!data || typeof data !== 'object') return;
          const msg = data as { type?: string; event?: string; data?: Record<string, unknown> };
          if (msg.type !== 'WA_EMBEDDED_SIGNUP') return;

          if (msg.event === 'FINISH') {
            captured = {
              wabaId: typeof msg.data?.waba_id === 'string' ? msg.data.waba_id : undefined,
              phoneNumberId:
                typeof msg.data?.phone_number_id === 'string' ? msg.data.phone_number_id : undefined,
            };
            finish();
          } else if (msg.event === 'CANCEL') {
            fail('WhatsApp signup was cancelled before finishing.');
          } else if (msg.event === 'ERROR') {
            const reason =
              typeof msg.data?.error_message === 'string' ? msg.data.error_message : 'unknown error';
            fail(`WhatsApp signup failed: ${reason}`);
          }
        }

        window.addEventListener('message', onMessage);

        fb.login(
          (resp) => {
            const c = resp.authResponse?.code;
            if (c) {
              code = c;
              finish();
            } else {
              fail('WhatsApp signup did not return an authorization code.');
            }
          },
          {
            config_id: cfg.configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
          },
        );
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Embedded Signup failed';
      setError(message);
      throw err;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [fetchConfig]);

  return { launch, loading, error };
}
