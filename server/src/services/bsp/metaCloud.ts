/**
 * MetaCloudProvider — the ONE place that implements BspProvider against the Meta WhatsApp
 * Cloud API (Graph). This is the ACTIVE provider for the direct Tech Provider model.
 *
 * Auth: a single shared Meta System User access token (carried on ctx.apiKey, sourced from
 * config.meta in resolveBspContext) sent as `Authorization: Bearer`. We act on each client's
 * WABA with OUR token + THAT client's phone_number_id — there is no per-client Meta key.
 *
 * Transport is OWNED here (graphFetch below) rather than the shared Pinnacle httpClient, so
 * the Bearer scheme + graph.facebook.com base URL never leak into the legacy providers
 * (BSP isolation). Errors are mapped through the shared, provider-neutral errors.ts.
 *
 * Endpoints (base = https://graph.facebook.com/{version}):
 *   send:        POST /{phone_number_id}/messages      (Meta Cloud API JSON)
 *   templates:   GET  /{waba_id}/message_templates
 *   health:      GET  /{phone_number_id}
 *
 * Webhooks: Meta uses App-level subscriptions + signed payloads, so there is NO per-number
 * setWebhook (a no-op here — subscription happens at onboarding via /{waba_id}/subscribed_apps)
 * and authenticity is verified in routes/webhooks/meta.ts (X-Hub-Signature-256 HMAC over the
 * raw body + the GET hub.challenge handshake), NOT via verifyWebhook. parseWebhook IS used.
 */

import { config } from '../../config/env';
import { logger } from '../../lib/logger';
import { mapBspError, BspError } from './errors';
import {
  buildCreateTemplateBody,
  buildEditTemplateBody,
  buildInteractiveBody,
  buildMediaBody,
  buildTemplateBody,
  buildTextBody,
  buildTypingIndicatorBody,
  mapTemplatesResponse,
  parsePhoneNumberQuality,
  parseSendResponse,
  parseTemplateMutationResponse,
  parseWebhookBody,
} from './metaCloud.mapping';
import type { BspProvider } from './BspProvider';
import type {
  BspContext,
  DownloadedMedia,
  MarkReadAndTypeInput,
  MediaUrlResult,
  NormalizedTemplate,
  ParsedWebhook,
  PhoneNumberQuality,
  SendInteractiveInput,
  SendMediaInput,
  SendResult,
  SendTemplateInput,
  SendTextInput,
  TemplateDefinition,
  TemplateMediaHandleResult,
  TemplateMutationResult,
  UploadMediaAsset,
  UploadMediaResult,
} from './types';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Show only the last 4 characters of a token in logs; never the whole secret. */
function redactToken(token: string): string {
  if (!token) return '<empty>';
  return token.length <= 4 ? '****' : `****${token.slice(-4)}`;
}

/** Join the Graph base (https://graph.facebook.com/{version}) with a request path. */
function buildUrl(path: string): string {
  const base = `https://graph.facebook.com/${config.meta.graphVersion}`.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get('retry-after');
  if (!raw) return undefined;
  const sec = Number(raw);
  return Number.isFinite(sec) ? sec : undefined;
}

/**
 * Perform a single Meta Graph API call with a Bearer token.
 *
 * Mirrors the safety properties of the shared Pinnacle httpClient: hard timeout via
 * AbortController, token redaction in logs, no auto-retry (sends are non-idempotent and a
 * blind retry could double-send/double-bill), and typed BspError mapping on any non-2xx.
 *
 * @throws BspError (or subclass) on any non-2xx response or transport failure.
 */
async function graphFetch<T = unknown>(
  token: string,
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = buildUrl(path);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.bsp.httpTimeoutMs);

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn(
      { method, path, token: redactToken(token), aborted, durationMs: Date.now() - startedAt },
      'Meta Graph request transport error',
    );
    if (aborted) {
      throw new BspError('bsp_timeout', `Meta request timed out after ${config.bsp.httpTimeoutMs}ms`);
    }
    throw new BspError('bsp_network', 'Meta request failed to reach the Graph API');
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
    const retryAfterSec = res.status === 429 ? parseRetryAfter(res) : undefined;
    logger.warn(
      {
        method,
        path,
        token: redactToken(token),
        status: res.status,
        durationMs: Date.now() - startedAt,
        // The Meta error body (message + error_user_msg/error_subcode/error_data) carries no
        // secrets and is the only place the real rejection reason appears — log it.
        metaError: (parsed as Record<string, unknown> | undefined)?.error ?? parsed,
      },
      'Meta Graph request returned non-2xx',
    );
    throw mapBspError(res.status, parsed, retryAfterSec);
  }

  logger.debug(
    { method, path, token: redactToken(token), status: res.status, durationMs: Date.now() - startedAt },
    'Meta Graph request ok',
  );

  return (parsed ?? ({} as unknown)) as T;
}

/**
 * Multipart upload to the Graph API (used for POST /{phone_number_id}/media). We must NOT set
 * Content-Type ourselves — fetch derives the multipart boundary from the FormData. Same timeout
 * + redaction + error-mapping discipline as graphFetch.
 */
async function graphUpload<T = unknown>(token: string, path: string, form: FormData): Promise<T> {
  const url = buildUrl(path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.bsp.httpTimeoutMs);
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn({ path, token: redactToken(token), aborted }, 'Meta media upload transport error');
    if (aborted) {
      throw new BspError('bsp_timeout', `Meta upload timed out after ${config.bsp.httpTimeoutMs}ms`);
    }
    throw new BspError('bsp_network', 'Meta media upload failed to reach the Graph API');
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
    logger.warn(
      { path, token: redactToken(token), status: res.status, durationMs: Date.now() - startedAt },
      'Meta media upload returned non-2xx',
    );
    throw mapBspError(res.status, parsed);
  }
  return (parsed ?? ({} as unknown)) as T;
}

/**
 * Step 2 of Meta's resumable upload: POST the raw file bytes to the upload-session id returned
 * by `POST /{app_id}/uploads`. Meta requires `Authorization: OAuth <token>` here (NOT Bearer)
 * plus a `file_offset` header; the response carries the file handle as `{ h }`. Same timeout +
 * error-mapping discipline as graphFetch.
 */
async function graphResumableUploadBytes(
  token: string,
  sessionId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ h?: string }> {
  const url = buildUrl(`/${sessionId}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.bsp.httpTimeoutMs);
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: '0',
        'Content-Type': mimeType,
      },
      body: new Blob([buffer], { type: mimeType }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn({ token: redactToken(token), aborted }, 'Meta resumable upload transport error');
    if (aborted) {
      throw new BspError('bsp_timeout', `Meta resumable upload timed out after ${config.bsp.httpTimeoutMs}ms`);
    }
    throw new BspError('bsp_network', 'Meta resumable upload failed to reach the Graph API');
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
    logger.warn(
      { token: redactToken(token), status: res.status, durationMs: Date.now() - startedAt },
      'Meta resumable upload returned non-2xx',
    );
    throw mapBspError(res.status, parsed);
  }
  return (parsed ?? ({} as unknown)) as { h?: string };
}

/**
 * Download raw bytes from a Graph-hosted media URL (the short-lived URL returned by
 * GET /{media-id}). The URL still requires our Bearer token to fetch the bytes.
 */
async function graphDownloadBinary(token: string, mediaUrl: string): Promise<DownloadedMedia> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.bsp.httpTimeoutMs);
  let res: Response;
  try {
    res = await fetch(mediaUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === 'AbortError';
    if (aborted) throw new BspError('bsp_timeout', 'Meta media download timed out');
    throw new BspError('bsp_network', 'Meta media download failed');
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw mapBspError(res.status, undefined);
  }
  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

export class MetaCloudProvider implements BspProvider {
  readonly name = 'metaCloud';

  /** POST /{phone_number_id}/messages — free-text body. */
  async sendText(ctx: BspContext, input: SendTextInput): Promise<SendResult> {
    const res = await graphFetch<unknown>(ctx.apiKey, 'POST', `/${ctx.phoneNumberId}/messages`, buildTextBody(input));
    return this.toSendResult(res);
  }

  /** POST /{phone_number_id}/messages — interactive body (list / reply-buttons / cta_url). */
  async sendInteractive(ctx: BspContext, input: SendInteractiveInput): Promise<SendResult> {
    const res = await graphFetch<unknown>(ctx.apiKey, 'POST', `/${ctx.phoneNumberId}/messages`, buildInteractiveBody(input));
    return this.toSendResult(res);
  }

  /**
   * POST /{phone_number_id}/messages — mark an inbound message read AND show a typing indicator in
   * a single call (Meta couples the two). Fired best-effort from the inbound webhook so the sender
   * gets instant feedback while a bot composes its reply; Meta auto-dismisses the bubble after ~25s
   * or when our next message to that user is sent. Returns nothing — there is no message to track.
   */
  async markReadAndType(ctx: BspContext, input: MarkReadAndTypeInput): Promise<void> {
    await graphFetch<unknown>(
      ctx.apiKey,
      'POST',
      `/${ctx.phoneNumberId}/messages`,
      buildTypingIndicatorBody(input),
    );
  }

  /** POST /{phone_number_id}/messages — template body (positional BODY params only). */
  async sendTemplate(ctx: BspContext, input: SendTemplateInput): Promise<SendResult> {
    const res = await graphFetch<unknown>(ctx.apiKey, 'POST', `/${ctx.phoneNumberId}/messages`, buildTemplateBody(input));
    return this.toSendResult(res);
  }

  /** POST /{phone_number_id}/messages — media body (image/document/audio/video/sticker). */
  async sendMedia(ctx: BspContext, input: SendMediaInput): Promise<SendResult> {
    const res = await graphFetch<unknown>(ctx.apiKey, 'POST', `/${ctx.phoneNumberId}/messages`, buildMediaBody(input));
    return this.toSendResult(res);
  }

  /** GET /{waba_id}/message_templates — fetch + normalize templates. */
  async getTemplates(ctx: BspContext): Promise<NormalizedTemplate[]> {
    // Phase 1 fetches the first page only; wire ?after=<cursor> here when paging is needed.
    const res = await graphFetch<unknown>(ctx.apiKey, 'GET', `/${ctx.wabaId}/message_templates`);
    return mapTemplatesResponse(res);
  }

  /** POST /{waba_id}/message_templates — author + submit a template for review. */
  async createTemplate(ctx: BspContext, def: TemplateDefinition): Promise<TemplateMutationResult> {
    const res = await graphFetch<unknown>(
      ctx.apiKey,
      'POST',
      `/${ctx.wabaId}/message_templates`,
      buildCreateTemplateBody(def),
    );
    return parseTemplateMutationResponse(res);
  }

  /** POST /{message_template_id} — edit an existing template (components only) + re-submit. */
  async editTemplate(
    ctx: BspContext,
    bspTemplateId: string,
    def: TemplateDefinition,
  ): Promise<TemplateMutationResult> {
    const res = await graphFetch<unknown>(
      ctx.apiKey,
      'POST',
      `/${bspTemplateId}`,
      buildEditTemplateBody(def),
    );
    // Edit returns { success: true }; preserve the known id and report pending review.
    const parsed = parseTemplateMutationResponse(res);
    return { bspTemplateId, status: parsed.status };
  }

  /** DELETE /{waba_id}/message_templates?name= — delete a template by name. */
  async deleteTemplate(ctx: BspContext, name: string): Promise<void> {
    await graphFetch<unknown>(
      ctx.apiKey,
      'DELETE',
      `/${ctx.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    );
  }

  /** POST /{phone_number_id}/media (multipart) — upload bytes, returns the Meta media id. */
  async uploadMedia(ctx: BspContext, asset: UploadMediaAsset): Promise<UploadMediaResult> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', asset.mimeType);
    form.append(
      'file',
      new Blob([asset.buffer], { type: asset.mimeType }),
      asset.fileName ?? 'upload',
    );

    const res = await graphUpload<{ id?: string }>(ctx.apiKey, `/${ctx.phoneNumberId}/media`, form);
    if (!res || typeof res.id !== 'string' || res.id.length === 0) {
      throw new BspError('bsp_bad_response', 'Meta media upload returned no media id');
    }
    return { metaMediaId: res.id };
  }

  /**
   * Resumable upload for a template HEADER sample (image/video/document). Returns the file
   * HANDLE Meta requires inside a create/edit-template HEADER example — distinct from a /media
   * send id. Two steps:
   *   1) POST /{app_id}/uploads?file_name&file_length&file_type -> { id: <upload session> }
   *   2) POST /{upload session id} (raw bytes, OAuth auth + file_offset:0) -> { h: <handle> }
   */
  async uploadTemplateMediaHandle(
    ctx: BspContext,
    asset: UploadMediaAsset,
  ): Promise<TemplateMediaHandleResult> {
    const appId = config.meta.appId;
    if (!appId) {
      throw new BspError(
        'bsp_bad_request',
        'Meta App id is not configured; cannot upload a template sample media file',
      );
    }
    const fileName = asset.fileName ?? 'sample';
    const startPath =
      `/${appId}/uploads` +
      `?file_name=${encodeURIComponent(fileName)}` +
      `&file_length=${asset.buffer.length}` +
      `&file_type=${encodeURIComponent(asset.mimeType)}`;

    const session = await graphFetch<{ id?: string }>(ctx.apiKey, 'POST', startPath);
    if (!session || typeof session.id !== 'string' || session.id.length === 0) {
      throw new BspError('bsp_bad_response', 'Meta resumable upload returned no session id');
    }

    const res = await graphResumableUploadBytes(ctx.apiKey, session.id, asset.buffer, asset.mimeType);
    if (!res || typeof res.h !== 'string' || res.h.length === 0) {
      throw new BspError('bsp_bad_response', 'Meta resumable upload returned no file handle');
    }
    return { handle: res.h };
  }

  /** GET /{media-id} — short-lived URL + metadata for a media id. */
  async getMediaUrl(ctx: BspContext, mediaId: string): Promise<MediaUrlResult> {
    const res = await graphFetch<Record<string, unknown>>(ctx.apiKey, 'GET', `/${mediaId}`);
    const url = typeof res.url === 'string' ? res.url : undefined;
    if (!url) {
      throw new BspError('bsp_bad_response', 'Meta media lookup returned no url');
    }
    return {
      url,
      mimeType: typeof res.mime_type === 'string' ? res.mime_type : undefined,
      sizeBytes: typeof res.file_size === 'number' ? res.file_size : undefined,
    };
  }

  /** Resolve the media URL then fetch its bytes (both calls carry our Bearer token). */
  async downloadMedia(ctx: BspContext, mediaId: string): Promise<DownloadedMedia> {
    const { url, mimeType } = await this.getMediaUrl(ctx, mediaId);
    const dl = await graphDownloadBinary(ctx.apiKey, url);
    // Prefer Meta's declared mime type; fall back to the response content-type.
    return { buffer: dl.buffer, contentType: mimeType ?? dl.contentType };
  }

  /** DELETE /{media-id} — remove a media asset from Meta's store. */
  async deleteMedia(ctx: BspContext, mediaId: string): Promise<void> {
    await graphFetch<unknown>(ctx.apiKey, 'DELETE', `/${mediaId}`);
  }

  /** GET /{phone_number_id}?fields=quality_rating — current quality rating (+ tier if exposed). */
  async getPhoneNumberQuality(ctx: BspContext): Promise<PhoneNumberQuality> {
    const res = await graphFetch<unknown>(
      ctx.apiKey,
      'GET',
      `/${ctx.phoneNumberId}?fields=quality_rating,messaging_limit_tier`,
    );
    return parsePhoneNumberQuality(res);
  }

  /**
   * No-op for Meta: subscriptions are App-level (done at onboarding via
   * POST /{waba_id}/subscribed_apps), not a per-number registration. Kept to satisfy the
   * BspProvider contract.
   */
  async setWebhook(): Promise<void> {
    logger.debug('MetaCloudProvider.setWebhook is a no-op (App-level subscription)');
  }

  /**
   * NOT the Meta verification mechanism — Meta authenticity is checked in
   * routes/webhooks/meta.ts (X-Hub-Signature-256 HMAC over the raw body, plus the GET
   * hub.challenge handshake). This method exists only to satisfy the BspProvider contract
   * and fail-closed if ever invoked on the Meta path.
   */
  verifyWebhook(): boolean {
    logger.error('MetaCloudProvider.verifyWebhook called; Meta verification belongs in the route (HMAC)');
    return false;
  }

  /** Parse an already-verified raw Meta webhook body into normalized inbound + status arrays. */
  parseWebhook(rawBody: Buffer): ParsedWebhook {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      logger.warn('Meta webhook body was not valid JSON');
      return { inbound: [], statuses: [], templateStatuses: [], qualityUpdates: [] };
    }
    return parseWebhookBody(json);
  }

  /** GET /{phone_number_id} — succeeds (2xx) when the token + number are valid. */
  async healthCheck(ctx: BspContext): Promise<boolean> {
    try {
      await graphFetch<unknown>(ctx.apiKey, 'GET', `/${ctx.phoneNumberId}`);
      return true;
    } catch (err) {
      logger.warn(
        { code: err instanceof BspError ? err.code : 'unknown' },
        'Meta healthCheck failed',
      );
      return false;
    }
  }

  /** Shared: turn a raw send response into a SendResult or throw a typed BspError. */
  private toSendResult(res: unknown): SendResult {
    const bspMessageId = parseSendResponse(res);
    if (!bspMessageId) {
      throw new BspError('bsp_bad_response', 'Meta send returned no message id (wamid)');
    }
    return { bspMessageId };
  }
}
