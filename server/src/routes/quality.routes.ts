/**
 * Quality Signal Report (feature 3.1) — tenant-scoped.
 *
 *   GET /api/quality            -> each WABA's quality rating + messaging tier + recent history
 *   GET /api/quality?refresh=1  -> pull live quality from Meta per number first, then return
 *
 * verifyAuth + requireTenant. Quality is fed mainly by the verified phone_number_quality_update
 * webhook; the refresh path is an on-demand Graph fetch through the BSP isolation layer.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { QualityResponse } from '@thinkai/shared';

import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
import { getTenantQuality } from '../services/quality/getTenantQuality';

export const qualityRouter = Router();

qualityRouter.get(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const body: QualityResponse = await getTenantQuality(tenantId, refresh);
    res.json(body);
  }),
);
