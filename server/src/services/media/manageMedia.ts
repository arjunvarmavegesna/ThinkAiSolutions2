/**
 * Media library service (feature 2.1) — upload/list/delete reusable media + fetch bytes for a
 * preview proxy. All Graph calls go through the BSP provider (isolation); here we only decode the
 * upload, persist/read the `media/{mediaId}` doc, and orchestrate.
 *
 * The binary itself is NOT stored by us — it lives in Meta's media store (retained ~30 days);
 * we keep the Meta media id + metadata and reference it when sending. (Persisting bytes to
 * Firebase Storage for durable preview/re-upload is a documented follow-up.)
 */

import { randomUUID } from 'node:crypto';

import type { MediaAsset, MediaAssetDTO } from '@thinkai/shared';
import type { MediaAsset as PMediaAsset } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig, msNum } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveTenantBspContext } from '../bsp';
import type { DownloadedMedia } from '../bsp/types';
import { MAX_MEDIA_BYTES } from '../../validation/media.schema';

/** Convert a Prisma media row into the domain MediaAssetDTO (number timestamps). */
function toMediaDTO(row: PMediaAsset): MediaAssetDTO {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    metaMediaId: row.metaMediaId,
    ...(row.handle ? { handle: row.handle } : {}),
    uploadedBy: row.uploadedBy,
    ...(row.channel ? { channel: row.channel as MediaAsset['channel'] } : {}),
    createdAt: msNum(row.createdAt) as number,
  };
}

/** Decode a base64 payload to a Buffer, enforcing the size cap (post-decode). */
function decodeBase64(dataBase64: string): Buffer {
  // Tolerate an accidental data: URI prefix from the browser.
  const cleaned = dataBase64.includes(',') ? dataBase64.slice(dataBase64.indexOf(',') + 1) : dataBase64;
  const buffer = Buffer.from(cleaned, 'base64');
  if (buffer.length === 0) {
    throw AppError.badRequest('File data could not be decoded', 'bad_media');
  }
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw AppError.badRequest(
      `File is too large (${Math.round(buffer.length / 1024 / 1024)} MB; max ${MAX_MEDIA_BYTES / 1024 / 1024} MB)`,
      'media_too_large',
    );
  }
  return buffer;
}

export async function uploadMedia(
  tenantId: string,
  uploadedBy: string,
  input: { fileName: string; mimeType: string; dataBase64: string },
): Promise<MediaAssetDTO> {
  const buffer = decodeBase64(input.dataBase64);

  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  const { metaMediaId } = await provider.uploadMedia(ctx, {
    buffer,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });

  const now = Date.now();
  const id = randomUUID();
  const row = await prisma.mediaAsset.create({
    data: {
      tenantId,
      id,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: buffer.length,
      metaMediaId,
      uploadedBy,
      channel: 'whatsapp',
      createdAt: msBig(now),
    },
  });

  logger.info({ tenantId, mediaId: id, metaMediaId, bytes: buffer.length }, 'media: uploaded');
  return toMediaDTO(row);
}

export async function listMedia(tenantId: string): Promise<MediaAssetDTO[]> {
  const rows = await prisma.mediaAsset.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toMediaDTO);
}

export async function deleteMedia(tenantId: string, mediaId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { tenantId_id: { tenantId, id: mediaId } },
  });
  if (!asset) {
    throw AppError.notFound('Media not found', 'media_not_found');
  }

  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  // Best-effort delete on Meta; if Meta already expired/dropped it, still remove our record.
  try {
    await provider.deleteMedia(ctx, asset.metaMediaId);
  } catch (err) {
    logger.warn({ tenantId, mediaId, err: (err as Error)?.message }, 'media: Meta delete failed; removing local record');
  }
  await prisma.mediaAsset.delete({ where: { tenantId_id: { tenantId, id: mediaId } } });
  logger.info({ tenantId, mediaId }, 'media: deleted');
}

/** Fetch a media asset's bytes from Meta for an authenticated preview proxy. */
export async function getMediaBinary(tenantId: string, mediaId: string): Promise<DownloadedMedia> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { tenantId_id: { tenantId, id: mediaId } },
  });
  if (!asset) {
    throw AppError.notFound('Media not found', 'media_not_found');
  }

  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);
  return provider.downloadMedia(ctx, asset.metaMediaId);
}
