/**
 * BSP-layer error taxonomy.
 *
 * These wrap provider (Meta Graph) HTTP failures into a small, stable set of error types
 * the rest of the server can branch on WITHOUT knowing anything provider-specific.
 * Higher layers (sendTemplate/sendText) translate these into AppErrors for the API.
 *
 * NEVER put an apikey or raw secret into an error message — these may be logged.
 */

/** Base class for any failure originating from the BSP provider call. */
export class BspError extends Error {
  /** Stable machine code, e.g. 'bsp_error', 'bsp_auth', 'bsp_window_closed'. */
  readonly code: string;
  /** Upstream HTTP status, when the failure came from an HTTP response. */
  readonly status?: number;
  /** Provider-reported error code (e.g. Meta error code 131047), when available. */
  readonly providerCode?: string;

  constructor(code: string, message: string, status?: number, providerCode?: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.providerCode = providerCode;
    // Restore prototype chain for instanceof to work after TS down-compilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Invalid/expired/missing apikey, or WABA not authorized (HTTP 401/403). */
export class BspAuthError extends BspError {
  constructor(message = 'BSP authentication failed', status?: number, providerCode?: string) {
    super('bsp_auth', message, status, providerCode);
  }
}

/**
 * Outbound free-text rejected because the 24h customer service window is closed.
 * We pre-check the window ourselves, but the provider may also reject — surface it cleanly.
 */
export class BspWindowClosedError extends BspError {
  constructor(message = 'Service window is closed', status?: number, providerCode?: string) {
    super('bsp_window_closed', message, status, providerCode);
  }
}

/** Provider throttling (HTTP 429). Callers may choose to back off / retry later. */
export class BspRateLimitError extends BspError {
  /** Seconds to wait before retrying, if the provider supplied Retry-After. */
  readonly retryAfterSec?: number;

  constructor(message = 'BSP rate limit exceeded', status = 429, retryAfterSec?: number) {
    super('bsp_rate_limit', message, status);
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Meta error codes that indicate the 24h window is closed (re-engagement required).
 * 131047 = "Re-engagement message" (more than 24h since last user message).
 * 131051 = unsupported message type. 470/repeated-restriction families also map here.
 */
const WINDOW_CLOSED_PROVIDER_CODES = new Set<string>(['131047', '131026', '470']);

/** Meta/auth error codes that mean the apikey/token/permission is invalid. */
const AUTH_PROVIDER_CODES = new Set<string>(['0', '3', '10', '190', '200', '2500']);

/**
 * Pull a best-effort provider error message + numeric code out of a Meta Graph error body.
 * Meta shape: { error: { message, type, code, error_subcode, error_user_title, error_user_msg,
 * error_data: { details }, fbtrace_id } }.
 *
 * `message` is Meta's generic top-level text (e.g. "Invalid parameter"); the ACTIONABLE reason
 * lives in error_user_title / error_user_msg / error_data.details / error_subcode — especially
 * for template-authoring rejections. We fold all of those into one human-readable string so the
 * real cause reaches the API banner and the logs (these fields carry no secrets).
 *
 * Parse defensively and never throw from here.
 */
function extractProviderError(body: unknown): { message?: string; code?: string } {
  if (!body || typeof body !== 'object') {
    return {};
  }
  const root = body as Record<string, unknown>;
  const err = (root.error ?? root) as Record<string, unknown>;
  if (!err || typeof err !== 'object') {
    return {};
  }

  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;

  const base = str(err.message) ?? str(root.message);
  const userTitle = str(err.error_user_title);
  const userMsg = str(err.error_user_msg);
  // error_data is usually an object { details } but some Graph versions send a bare string.
  const errData = err.error_data;
  const details =
    errData && typeof errData === 'object'
      ? str((errData as Record<string, unknown>).details)
      : str(errData);
  const rawSubcode = err.error_subcode;
  const subcode =
    typeof rawSubcode === 'number' || typeof rawSubcode === 'string' ? String(rawSubcode) : undefined;

  // Compose: "<base> — <title> — <reason> (subcode N)", skipping blanks/duplicates.
  const parts: string[] = [];
  for (const p of [base, userTitle, userMsg ?? details]) {
    if (p && !parts.includes(p)) parts.push(p);
  }
  let message = parts.join(' — ') || undefined;
  if (message && subcode) message += ` (subcode ${subcode})`;

  const rawCode = err.code ?? root.code;
  const code =
    typeof rawCode === 'number' || typeof rawCode === 'string' ? String(rawCode) : undefined;
  return { message, code };
}

/**
 * Map an upstream HTTP failure to a typed BspError.
 * @param httpStatus HTTP status code from the provider response.
 * @param body parsed JSON body (or undefined if unparseable).
 * @param retryAfterSec optional Retry-After seconds (for 429).
 */
export function mapBspError(httpStatus: number, body: unknown, retryAfterSec?: number): BspError {
  const { message, code } = extractProviderError(body);
  const detail = message ? `: ${message}` : '';

  // Window-closed can present as 4xx with a specific provider code regardless of status.
  if (code && WINDOW_CLOSED_PROVIDER_CODES.has(code)) {
    return new BspWindowClosedError(`Service window is closed${detail}`, httpStatus, code);
  }

  if (httpStatus === 401 || httpStatus === 403 || (code && AUTH_PROVIDER_CODES.has(code))) {
    return new BspAuthError(`BSP authentication failed${detail}`, httpStatus, code);
  }

  if (httpStatus === 429) {
    return new BspRateLimitError(`BSP rate limit exceeded${detail}`, httpStatus, retryAfterSec);
  }

  return new BspError('bsp_error', `BSP request failed (HTTP ${httpStatus})${detail}`, httpStatus, code);
}
