/**
 * Meta Embedded Signup onboarding calls (Graph API). Kept in bsp/ so all Meta Graph specifics
 * stay isolated. These run ONCE at onboarding (not per-message), so they are deliberately NOT
 * part of the BspProvider interface:
 *
 *   exchangeSignupCode      GET  /oauth/access_token   (App id+secret + ES code)
 *   subscribeAppToWaba      POST /{waba_id}/subscribed_apps        (System User token)
 *   registerPhoneNumber     POST /{phone_number_id}/register       (System User token)
 *   fetchPhoneNumberProfile GET  /{phone_number_id}?fields=...     (System User token)
 *
 * Auth: the shared platform System User token (config.meta.systemUserToken) for the management
 * calls; the App id+secret for the code exchange. Errors map through the shared errors.ts.
 */

import { config } from '../../config/env';
import { logger } from '../../lib/logger';
import { mapBspError, BspError } from './errors';

type HttpMethod = 'GET' | 'POST';

/** Base Graph URL pinned to the configured version (defaults to the shared META_GRAPH_VERSION). */
function graphBase(): string {
  return `https://graph.facebook.com/${config.meta.graphVersion}`;
}

/** Append a query object to a path as a query string (values URL-encoded). */
function withQuery(path: string, query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0) return path;
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${path}${path.includes('?') ? '&' : '?'}${qs}`;
}

/**
 * One Graph call with a hard timeout + typed error mapping. `bearer` is sent as
 * Authorization when provided (the management calls); the code exchange passes no bearer and
 * carries the App secret in the query instead.
 */
async function graphCall<T = unknown>(
  method: HttpMethod,
  path: string,
  opts: { bearer?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const url = `${graphBase()}${withQuery(path, opts.query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.bsp.httpTimeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(opts.bearer ? { Authorization: `Bearer ${opts.bearer}` } : {}),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === 'AbortError';
    if (aborted) throw new BspError('bsp_timeout', 'Meta onboarding request timed out');
    throw new BspError('bsp_network', 'Meta onboarding request failed to reach the Graph API');
  } finally {
    clearTimeout(timeout);
  }

  const rawText = await res.text();
  let parsed: unknown;
  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = undefined;
    }
  }

  if (!res.ok) {
    logger.warn({ method, path, status: res.status }, 'Meta onboarding call returned non-2xx');
    throw mapBspError(res.status, parsed);
  }
  return (parsed ?? ({} as unknown)) as T;
}

/**
 * Exchange the Embedded Signup authorization code for a business access token, completing the
 * OAuth handshake server-side. We do NOT persist this token (sends use the shared System User
 * token); a failure here means the code is invalid/expired and onboarding should stop.
 */
export async function exchangeSignupCode(code: string): Promise<string> {
  if (!config.meta.appId || !config.meta.appSecret) {
    throw new BspError('meta_unconfigured', 'Meta App id/secret are not configured');
  }
  const res = await graphCall<{ access_token?: string }>('GET', '/oauth/access_token', {
    query: {
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      code,
    },
  });
  if (!res.access_token) {
    throw new BspError('meta_exchange_failed', 'Code exchange returned no access_token');
  }
  return res.access_token;
}

/**
 * Subscribe OUR app to the client's WABA so inbound + status webhooks flow to us.
 * Idempotent on Meta's side (re-subscribing is a no-op).
 */
export async function subscribeAppToWaba(wabaId: string): Promise<void> {
  await graphCall('POST', `/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    bearer: config.meta.systemUserToken,
  });
}

/**
 * Register the client's phone number for the Cloud API (required before sending).
 * Body needs a 6-digit two-step-verification PIN. TODO(meta): if the number has no PIN set
 * yet, a set_two_step / migration step may be required first — confirm against your ES setup.
 */
export async function registerPhoneNumber(phoneNumberId: string, pin: string): Promise<void> {
  await graphCall('POST', `/${encodeURIComponent(phoneNumberId)}/register`, {
    bearer: config.meta.systemUserToken,
    body: { messaging_product: 'whatsapp', pin },
  });
}

/** Fetch a number's display phone + verified name to complete the WABA doc when ES omits them. */
export async function fetchPhoneNumberProfile(
  phoneNumberId: string,
): Promise<{ displayPhoneNumber?: string; verifiedName?: string }> {
  const res = await graphCall<{ display_phone_number?: string; verified_name?: string }>(
    'GET',
    `/${encodeURIComponent(phoneNumberId)}`,
    { bearer: config.meta.systemUserToken, query: { fields: 'display_phone_number,verified_name' } },
  );
  return { displayPhoneNumber: res.display_phone_number, verifiedName: res.verified_name };
}
