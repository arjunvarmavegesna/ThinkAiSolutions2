/**
 * Resolve the media-header parameter for a template send (image/video/document headers).
 *
 * For "reuse the approved sample" semantics: a media-header template was created with a sample
 * file whose Meta CDN URL Meta stores back on the template as
 * `components[HEADER].example.header_handle[0]`. To SEND that template we must attach a HEADER
 * component carrying real media — Meta rejects a media-header send with no header parameter
 * (#132012 "expected IMAGE, received UNKNOWN").
 *
 * We fetch that sample once, upload it to a Meta media id (a public-link send of the signed,
 * expiring scontent URL is unreliable — Meta often can't fetch it), and reuse the id for every
 * recipient of the campaign. Media ids are valid ~30 days, so a short in-process cache keyed by
 * (tenant, template) amortizes the upload across the whole broadcast and across back-to-back
 * sends, with no schema changes.
 */

import type { Template } from '@thinkai/shared';

import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import type { BspContext, TemplateHeaderFormat, TemplateHeaderMedia } from '../bsp/types';
import type { BspProvider } from '../bsp/BspProvider';

const MEDIA_FORMATS: ReadonlySet<string> = new Set(['IMAGE', 'VIDEO', 'DOCUMENT']);

interface RawComponent {
  type?: string;
  format?: string;
  example?: { header_handle?: string[] };
}

/** Parse the JSON-encoded (or already-array) `components` field into an array. */
function parseComponents(template: Template): RawComponent[] {
  const raw = (template as { components?: unknown }).components;
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as RawComponent[]) : [];
  } catch {
    return [];
  }
}

/** The media-header descriptor (format + sample URL) for a template, or null for non-media headers. */
export function templateMediaHeaderInfo(
  template: Template,
): { format: TemplateHeaderFormat; sampleUrl: string | undefined } | null {
  const header = parseComponents(template).find(
    (c) => String(c.type).toUpperCase() === 'HEADER',
  );
  if (!header) return null;
  const format = String(header.format ?? '').toUpperCase();
  if (!MEDIA_FORMATS.has(format)) return null;
  return {
    format: format as TemplateHeaderFormat,
    sampleUrl: header.example?.header_handle?.[0],
  };
}

/** Cache one uploaded media id per (tenant, template) for ~24h (well inside Meta's ~30d validity). */
interface CacheEntry {
  media: TemplateHeaderMedia;
  expiresAt: number;
}
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

/** Derive a recipient-facing filename for document headers from the sample URL (best-effort). */
function filenameFromUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    const last = path.slice(path.lastIndexOf('/') + 1);
    return last.length > 0 ? decodeURIComponent(last) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the header-media parameter for a media-header template, uploading the approved sample
 * to a reusable media id on first use. Returns undefined for templates with no media header
 * (text-only / text header) so the caller sends them unchanged.
 *
 * Throws a clear AppError when a media header has no usable sample URL (e.g. the template was
 * never synced, or the scontent URL has expired) — actionable as "re-sync the template" rather
 * than surfacing Meta's opaque #132012.
 */
export async function resolveTemplateHeaderMedia(
  tenantId: string,
  template: Template,
  ctx: BspContext,
  provider: BspProvider,
): Promise<TemplateHeaderMedia | undefined> {
  const info = templateMediaHeaderInfo(template);
  if (!info) return undefined;

  const cacheKey = `${tenantId}:${template.name}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.media;

  if (!info.sampleUrl) {
    throw AppError.badRequest(
      `Template '${template.name}' has a ${info.format} header but no stored sample image. Re-sync the template from WhatsApp, then retry.`,
      'template_header_sample_missing',
    );
  }

  // Fetch the approved sample bytes from Meta's CDN (signed, no auth needed).
  let res: Response;
  try {
    res = await fetch(info.sampleUrl);
  } catch (err) {
    throw AppError.badRequest(
      `Could not fetch the header sample for template '${template.name}'. Re-sync the template and retry.`,
      'template_header_sample_unreachable',
    );
  }
  if (!res.ok) {
    throw AppError.badRequest(
      `The header sample for template '${template.name}' is no longer available (HTTP ${res.status}). Re-sync the template to refresh it, then retry.`,
      'template_header_sample_expired',
    );
  }
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());

  const fileName = filenameFromUrl(info.sampleUrl) ?? 'header';
  const { metaMediaId } = await provider.uploadMedia(ctx, { buffer, mimeType, fileName });

  const media: TemplateHeaderMedia = {
    format: info.format,
    mediaId: metaMediaId,
    ...(info.format === 'DOCUMENT' ? { filename: fileName } : {}),
  };
  cache.set(cacheKey, { media, expiresAt: Date.now() + CACHE_TTL_MS });
  logger.info(
    { tenantId, template: template.name, format: info.format, mediaId: metaMediaId },
    'template: resolved + cached header sample media id',
  );
  return media;
}
