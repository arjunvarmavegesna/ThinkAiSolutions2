/**
 * Upload a sample media file for a template HEADER and return the file handle Meta requires in
 * the create/edit-template HEADER example (media headers — feature 1.1 + 2.1).
 *
 * This is deliberately separate from the media library (services/media): a /media send id can NOT
 * be used as a template header example — Meta only accepts a resumable-upload file handle there.
 * The handle is short-lived and single-purpose; we don't persist it (the client passes it straight
 * back in the create-template request).
 */

import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveTenantBspContext } from '../bsp';
import { MAX_TEMPLATE_SAMPLE_BYTES } from '../../validation/templates.schema';

/** Decode a base64 payload to a Buffer, enforcing the size cap (post-decode). */
function decodeBase64(dataBase64: string): Buffer {
  // Tolerate an accidental data: URI prefix from the browser.
  const cleaned = dataBase64.includes(',')
    ? dataBase64.slice(dataBase64.indexOf(',') + 1)
    : dataBase64;
  const buffer = Buffer.from(cleaned, 'base64');
  if (buffer.length === 0) {
    throw AppError.badRequest('File data could not be decoded', 'bad_media');
  }
  if (buffer.length > MAX_TEMPLATE_SAMPLE_BYTES) {
    throw AppError.badRequest(
      `File is too large (${Math.round(buffer.length / 1024 / 1024)} MB; max ${MAX_TEMPLATE_SAMPLE_BYTES / 1024 / 1024} MB)`,
      'media_too_large',
    );
  }
  return buffer;
}

export async function uploadTemplateSampleMedia(
  tenantId: string,
  input: { fileName: string; mimeType: string; dataBase64: string },
): Promise<{ handle: string }> {
  const buffer = decodeBase64(input.dataBase64);

  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);
  if (!provider.uploadTemplateMediaHandle) {
    throw AppError.badRequest(
      'This provider does not support media template headers',
      'media_header_unsupported',
    );
  }

  const { handle } = await provider.uploadTemplateMediaHandle(ctx, {
    buffer,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });

  logger.info({ tenantId, bytes: buffer.length, mimeType: input.mimeType }, 'template: sample media uploaded');
  return { handle };
}
