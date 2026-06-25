/**
 * Media library (feature 2.1) — tenant-scoped.
 *
 *   POST   /api/media            -> upload a file (base64 JSON) to the tenant's media library
 *   GET    /api/media            -> list media assets (newest first)
 *   GET    /api/media/:id/preview-> stream the bytes (authenticated proxy, for thumbnails)
 *   DELETE /api/media/:id        -> delete the asset (Meta + local record)
 *
 * All verifyAuth + requireTenant. Upload bytes are sent to Meta via the BSP provider
 * (provider isolation); only the Meta media id + metadata are stored. This router is mounted
 * with a larger JSON body limit (see app.ts) so base64 uploads fit.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { ListMediaResponse, UploadMediaResponse } from '@thinkai/shared';

import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
import { parseOrThrow } from '../validation/adminSchemas';
import { uploadMediaSchema } from '../validation/media.schema';
import { deleteMedia, getMediaBinary, listMedia, uploadMedia } from '../services/media/manageMedia';

export const mediaRouter = Router();

/** POST /api/media — upload a base64 file. */
mediaRouter.post(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const uid = req.auth?.uid ?? 'unknown';
    const input = parseOrThrow(uploadMediaSchema, req.body);
    const media = await uploadMedia(tenantId, uid, input);
    const body: UploadMediaResponse = { media };
    res.status(201).json(body);
  }),
);

/** GET /api/media — list the tenant's media assets. */
mediaRouter.get(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (_req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const body: ListMediaResponse = { media: await listMedia(tenantId) };
    res.json(body);
  }),
);

/** GET /api/media/:id/preview — stream bytes for an inline preview (image thumbnails, etc.). */
mediaRouter.get(
  '/:id/preview',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const { buffer, contentType } = await getMediaBinary(tenantId, req.params.id);
    res.setHeader('Content-Type', contentType);
    res.send(buffer);
  }),
);

/** DELETE /api/media/:id — delete the asset from Meta + our record. */
mediaRouter.delete(
  '/:id',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    await deleteMedia(tenantId, req.params.id);
    res.status(204).end();
  }),
);
