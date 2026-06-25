/**
 * Inbox routes (mounted at /api/inbox).
 *
 * The team inbox surface for tenant_admin / agent users (and reseller_admin acting on an
 * explicit tenant). Every route is guarded by `verifyAuth` then `requireTenant`, which
 * resolves the concrete tenant id onto `res.locals.tenantId`:
 *   - tenant_admin / agent -> their own token tenantId (they can never target another tenant)
 *   - reseller_admin       -> an explicit ?tenantId
 * Handlers read tenant scope ONLY from res.locals — never from the request body — so a
 * tenant user cannot smuggle a foreign tenantId. The client never touches Firestore; these
 * endpoints are its entire view of the inbox.
 *
 *   GET  /conversations                     -> ListConversationsResponse
 *   GET  /conversations/:id/messages        -> ListMessagesResponse (marks conversation read)
 *   POST /conversations/:id/messages        -> SendMessageResponse  (free-text, window-gated)
 *   POST /send-template                     -> SendMessageResponse  (approved template send)
 *   GET  /templates                         -> ListTemplatesResponse (approved only)
 */

import { Router } from 'express';
import type { Response } from 'express';

import type { ListTemplatesResponse, TemplateDTO } from '@thinkai/shared';

import { prisma } from '../config/db';
import { toTemplate } from '../db/mappers';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
import { listConversations, listMessages } from '../services/messages/readService';
import { sendTemplateMessage } from '../services/messages/sendTemplate';
import { sendTextMessage } from '../services/messages/sendText';
import { markConversationRead } from '../services/conversations/window';
import { sendTemplateSchema, sendTextSchema } from '../validation/messages.schema';

export const inboxRouter = Router();

// Every inbox route requires a verified user AND a resolved tenant on res.locals.
inboxRouter.use(verifyAuth, requireTenant);

/**
 * The resolved tenant id is the source of truth for tenant scope. `requireTenant`
 * guarantees it is present; this narrows the type for handlers and never falls back to
 * anything client-controlled.
 */
function tenantIdOf(res: Response): string {
  const tenantId = res.locals.tenantId;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    // Should be impossible after requireTenant — fail closed rather than guess.
    throw AppError.forbidden('No tenant resolved for this request');
  }
  return tenantId;
}

/** Parse an optional pagination limit from the query string (validation happens downstream). */
function parseLimit(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse an optional opaque cursor (a doc id) from the query string. */
function parseCursor(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

// GET /conversations — newest activity first, each row decorated with windowOpen.
inboxRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const tenantId = tenantIdOf(res);
    const result = await listConversations(tenantId, {
      cursor: parseCursor(req.query.cursor),
      limit: parseLimit(req.query.limit),
    });
    res.json(result);
  }),
);

// GET /conversations/:id/messages — full thread (oldest first). Opening a thread clears
// its unread counter, so we mark it read as a side effect of reading the history.
inboxRouter.get(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const tenantId = tenantIdOf(res);
    const conversationId = req.params.id;

    const result = await listMessages(tenantId, conversationId, {
      cursor: parseCursor(req.query.cursor),
      limit: parseLimit(req.query.limit),
    });

    // Reset unread on open. Best-effort; never blocks returning the history.
    await markConversationRead(tenantId, conversationId);

    res.json(result);
  }),
);

// POST /conversations/:id/messages — free-text reply inside the conversation. The service
// enforces the 24h window (409 'window_closed' if shut); 'service' messages are free.
inboxRouter.post(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const tenantId = tenantIdOf(res);
    const conversationId = req.params.id;

    const parsed = sendTextSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }

    const result = await sendTextMessage(tenantId, conversationId, { body: parsed.data.body });
    res.json(result);
  }),
);

// POST /send-template — send an approved template to a phone number, creating/opening the
// conversation. Billing + debit/refund are handled inside the service.
inboxRouter.post(
  '/send-template',
  asyncHandler(async (req, res) => {
    const tenantId = tenantIdOf(res);

    const parsed = sendTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body');
    }

    const result = await sendTemplateMessage(tenantId, {
      toPhone: parsed.data.toPhone,
      templateName: parsed.data.templateName,
      languageCode: parsed.data.languageCode,
      variables: parsed.data.variables,
    });
    res.json(result);
  }),
);

// GET /templates — approved templates only (the only ones the send modal may offer).
inboxRouter.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    const tenantId = tenantIdOf(res);

    const rows = await prisma.template.findMany({
      where: { tenantId, status: 'approved' },
    });
    const templates: TemplateDTO[] = rows.map((r) => toTemplate(r) as TemplateDTO);

    const body: ListTemplatesResponse = { templates };
    res.json(body);
  }),
);
