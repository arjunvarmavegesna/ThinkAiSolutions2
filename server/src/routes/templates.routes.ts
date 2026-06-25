/**
 * Tenant-facing WhatsApp templates.
 *
 *   GET    /api/templates        -> all templates for the tenant (any status)
 *   POST   /api/templates/sync   -> pull templates from WhatsApp (Meta) into Firestore
 *   POST   /api/templates        -> author a template + submit it to Meta for review
 *   PUT    /api/templates/:name  -> edit a template + re-submit
 *   DELETE /api/templates/:name  -> delete a template
 *
 * All are verifyAuth + requireTenant. Create/edit/delete go through the BSP isolation layer
 * (provider.createTemplate/editTemplate/deleteTemplate); Meta's approval verdict arrives
 * asynchronously via the message_template_status_update webhook.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type {
  CreateTemplateResponse,
  ListTemplatesResponse,
  TemplateDTO,
  UploadTemplateSampleResponse,
} from '@thinkai/shared';

import { prisma } from '../config/db';
import { toTemplate } from '../db/mappers';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
import { parseOrThrow } from '../validation/adminSchemas';
import {
  createTemplateSchema,
  sampleMediaSchema,
  updateTemplateSchema,
} from '../validation/templates.schema';
import { syncTemplates } from '../services/templates/syncTemplates';
import {
  createTemplate,
  deleteTemplate,
  editTemplate,
} from '../services/templates/manageTemplates';
import { uploadTemplateSampleMedia } from '../services/templates/uploadTemplateSample';

export const templatesRouter = Router();

/** GET /api/templates — list every template for the tenant, newest first. */
templatesRouter.get(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (_req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const rows = await prisma.template.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
    const templates: TemplateDTO[] = rows.map((r) => toTemplate(r) as TemplateDTO);
    const body: ListTemplatesResponse = { templates };
    res.json(body);
  }),
);

/** POST /api/templates/sync — refresh templates from the BSP. Returns how many were upserted. */
templatesRouter.post(
  '/sync',
  verifyAuth,
  requireTenant,
  asyncHandler(async (_req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const synced = await syncTemplates(tenantId);
    res.json({ synced });
  }),
);

/**
 * POST /api/templates/sample-media — upload a sample header file (base64) and return the
 * resumable-upload file handle to embed in a media-header template. Separate from /api/media:
 * a media-library id can't be used as a template HEADER example.
 */
templatesRouter.post(
  '/sample-media',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(sampleMediaSchema, req.body);
    const { handle } = await uploadTemplateSampleMedia(tenantId, input);
    const body: UploadTemplateSampleResponse = { handle };
    res.status(201).json(body);
  }),
);

/** POST /api/templates — author a template and submit it to Meta for review. */
templatesRouter.post(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(createTemplateSchema, req.body);
    const doc = await createTemplate(tenantId, input);
    const body: CreateTemplateResponse = {
      name: doc.name,
      bspTemplateId: doc.bspTemplateId,
      status: doc.status,
    };
    res.status(201).json(body);
  }),
);

/** PUT /api/templates/:name — edit a template and re-submit it for review. */
templatesRouter.put(
  '/:name',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(updateTemplateSchema, req.body);
    const doc = await editTemplate(tenantId, req.params.name, input);
    const body: CreateTemplateResponse = {
      name: doc.name,
      bspTemplateId: doc.bspTemplateId,
      status: doc.status,
    };
    res.json(body);
  }),
);

/** DELETE /api/templates/:name — delete a template from Meta + locally. */
templatesRouter.delete(
  '/:name',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    await deleteTemplate(tenantId, req.params.name);
    res.status(204).end();
  }),
);
