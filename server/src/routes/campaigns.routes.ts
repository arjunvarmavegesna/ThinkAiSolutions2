/**
 * Campaigns (broadcast) — tenant-scoped.
 *
 *   GET  /api/campaigns       -> list campaigns (newest first)
 *   POST /api/campaigns       -> enqueue a broadcast (queued + metered background send)
 *   GET  /api/campaigns/:id   -> campaign detail + per-recipient progress
 *
 * All verifyAuth + requireTenant. POST resolves the audience (explicit list or segment) and
 * writes a queued campaign + recipients subcollection; the campaignWorker drains it through the
 * per-message debit + BSP pipeline (see services/campaigns/*).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type {
  AudiencePreviewResponse,
  CampaignDetailResponse,
  CampaignDTO,
  CampaignFunnel,
  CampaignRecipientDTO,
  CampaignReportResponse,
  ListCampaignsResponse,
} from '@thinkai/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '../config/db';
import { toCampaign, toCampaignRecipient } from '../db/mappers';
import { asyncHandler } from '../lib/asyncHandler';
import { AppError } from '../lib/AppError';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
import { parseOrThrow } from '../validation/adminSchemas';
import { createCampaignSchema, previewAudienceSchema } from '../validation/campaigns.schema';
import { createCampaign } from '../services/campaigns/createCampaign';
import { resolveSegment } from '../services/campaigns/resolveSegment';

export const campaignsRouter = Router();

/** Max recipient rows returned in a single detail response. */
const RECIPIENT_PAGE = 500;

campaignsRouter.get(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (_req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const rows = await prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const campaigns: CampaignDTO[] = rows.map((r) => toCampaign(r) as CampaignDTO);
    const body: ListCampaignsResponse = { campaigns };
    res.json(body);
  }),
);

campaignsRouter.post(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(createCampaignSchema, req.body);
    const result = await createCampaign(tenantId, input);
    res.status(201).json(result);
  }),
);

/**
 * POST /api/campaigns/preview-audience — resolve a segment to a recipient count WITHOUT writing
 * anything, so the create-campaign UI can show "N contacts match" live (and avoid a doomed send).
 */
campaignsRouter.post(
  '/preview-audience',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const { segment } = parseOrThrow(previewAudienceSchema, req.body);
    const resolved = await resolveSegment(tenantId, segment);
    // Hand back the first recipient as a sample so the create modal can live-preview merge tags.
    const first = resolved[0];
    const body: AudiencePreviewResponse = {
      count: resolved.length,
      ...(first ? { sample: { phone: first.phone, ...(first.name ? { name: first.name } : {}) } } : {}),
    };
    res.json(body);
  }),
);

/** GET /api/campaigns/:id — campaign + a page of per-recipient progress. */
campaignsRouter.get(
  '/:id',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const campaignId = req.params.id;

    const campaignRow = await prisma.campaign.findUnique({
      where: { tenantId_id: { tenantId, id: campaignId } },
    });
    if (!campaignRow) {
      throw AppError.notFound('Campaign not found');
    }
    const campaign: CampaignDTO = toCampaign(campaignRow) as CampaignDTO;

    const recipientCount = await prisma.campaignRecipient.count({
      where: { tenantId, campaignId },
    });
    const recipientRows = await prisma.campaignRecipient.findMany({
      where: { tenantId, campaignId },
      take: RECIPIENT_PAGE,
    });
    const recipients: CampaignRecipientDTO[] = recipientRows.map(
      (r) => toCampaignRecipient(r) as CampaignRecipientDTO,
    );
    // Surface failures + in-flight first, then the rest.
    const rank: Record<string, number> = { failed: 0, pending: 1, sent: 2, delivered: 3, read: 4 };
    recipients.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));

    const body: CampaignDetailResponse = { campaign, recipients, recipientCount };
    res.json(body);
  }),
);

/**
 * GET /api/campaigns/:id/report — delivery funnel (counted per recipient status) + a
 * cursor-paginated page of recipient rows. `?cursor=<lastDocId>` fetches the next page;
 * `?status=<recipientStatus>` filters the rows (the funnel always reflects ALL recipients).
 */
campaignsRouter.get(
  '/:id/report',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const campaignId = req.params.id;

    const campaignRow = await prisma.campaign.findUnique({
      where: { tenantId_id: { tenantId, id: campaignId } },
    });
    if (!campaignRow) {
      throw AppError.notFound('Campaign not found');
    }

    // Funnel: one grouped count over the recipient set (no full read of the rows).
    const grouped = await prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { tenantId, campaignId },
      _count: { _all: true },
    });
    const countOf = (s: string): number =>
      grouped.find((g) => g.status === s)?._count._all ?? 0;
    const funnel: CampaignFunnel = {
      pending: countOf('pending'),
      sent: countOf('sent'),
      delivered: countOf('delivered'),
      read: countOf('read'),
      failed: countOf('failed'),
      total: grouped.reduce((a, g) => a + g._count._all, 0),
    };

    // Rows page, ordered by id for a stable keyset cursor.
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const where: Prisma.CampaignRecipientWhereInput = { tenantId, campaignId };
    if (statusFilter) where.status = statusFilter;

    const rowRows = await prisma.campaignRecipient.findMany({
      where,
      orderBy: { id: 'asc' },
      take: RECIPIENT_PAGE,
      ...(cursor
        ? { cursor: { tenantId_campaignId_id: { tenantId, campaignId, id: cursor } }, skip: 1 }
        : {}),
    });
    const rows: CampaignRecipientDTO[] = rowRows.map(
      (r) => toCampaignRecipient(r) as CampaignRecipientDTO,
    );
    const nextCursor =
      rowRows.length === RECIPIENT_PAGE ? rowRows[rowRows.length - 1].id : undefined;

    const body: CampaignReportResponse = { campaignId, funnel, rows, nextCursor };
    res.json(body);
  }),
);
