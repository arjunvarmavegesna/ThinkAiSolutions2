/**
 * Client-facing public API (mounted at /api/v1). Authenticated by a per-tenant API KEY (not a
 * Firebase token): `verifyApiKey` resolves the key -> tenant + scopes and sets res.locals.tenantId,
 * so every handler REUSES the existing tenant-scoped services unchanged (no fork of the send path
 * or billing). Each endpoint is gated by `requireScope` and the whole surface is rate-limited
 * per key.
 *
 *   POST /api/v1/messages        (messages:send)  template or session send
 *   GET  /api/v1/messages/:id    (messages:read)  status of one of our outbound messages
 *   POST /api/v1/contacts        (contacts:write) create/upsert a contact
 *   GET  /api/v1/contacts        (contacts:read)  list contacts
 */

import { Router } from 'express';

import type {
  ApiMessageStatusResponse,
  ContactSource,
  ContactStatus,
  ListContactsResponse,
  OptInStatus,
  SendMessageResponse,
} from '@thinkai/shared';

import { asyncHandler } from '../lib/asyncHandler';
import { AppError } from '../lib/AppError';
import { requireScope, verifyApiKey } from '../middleware/apiKeyAuth';
import { rateLimit } from '../middleware/rateLimit';
import { parseOrThrow } from '../validation/adminSchemas';
import { createContactSchema, sendMessageSchema } from '../validation/publicApiSchemas';
import { conversationIdForPhone } from '../services/conversations/window';
import { sendInteractiveMessage } from '../services/messages/sendInteractive';
import { sendTemplateMessage } from '../services/messages/sendTemplate';
import { sendTextMessage } from '../services/messages/sendText';
import { getMessage } from '../services/messages/readService';
import { createContact, listContacts } from '../services/contacts/manageContacts';

export const publicApiRouter = Router();

/** Read a query param as a non-empty string, else undefined. */
function qstr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
/** Read a query param as a finite number, else undefined. */
function qnum(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Authenticate every request with an API key, then rate-limit PER KEY (60/min).
publicApiRouter.use(verifyApiKey);
publicApiRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 60,
    keyFn: (req) => req.apiKey?.id ?? req.ip ?? 'unknown',
    message: 'API rate limit exceeded. Slow down and retry.',
  }),
);

/** POST /messages — send a template, or a session (free-text) message in an open 24h window. */
publicApiRouter.post(
  '/messages',
  requireScope('messages:send'),
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(sendMessageSchema, req.body);

    let result: SendMessageResponse;
    if (input.type === 'template') {
      result = await sendTemplateMessage(tenantId, {
        toPhone: input.to,
        templateName: input.templateName,
        languageCode: input.languageCode,
        variables: input.variables ?? [],
      });
    } else if (input.type === 'interactive') {
      // Interactive (list/buttons/cta_url) is a service-class message: same open-window rule as
      // session text — needs a conversation; 404 if none, 409 if the window is closed.
      const conversationId = conversationIdForPhone(input.to);
      result = await sendInteractiveMessage(tenantId, conversationId, { interactive: input.interactive });
    } else {
      // A session message needs an open conversation (only an inbound reply opens the window);
      // sendTextMessage 404s if none exists and 409s if the window is closed.
      const conversationId = conversationIdForPhone(input.to);
      result = await sendTextMessage(tenantId, conversationId, { body: input.text });
    }
    res.status(201).json(result);
  }),
);

/** GET /messages/:id — status of one outbound message (by the id we returned at send time). */
publicApiRouter.get(
  '/messages/:id',
  requireScope('messages:read'),
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const msg = await getMessage(tenantId, req.params.id);
    if (!msg) throw AppError.notFound('Message not found');

    const body: ApiMessageStatusResponse = {
      id: msg.id,
      status: msg.status,
      to: msg.contactPhone,
      type: msg.type,
      ts: msg.ts,
      ...(msg.error ? { error: msg.error } : {}),
    };
    res.json(body);
  }),
);

/** POST /contacts — create/upsert a contact (deduped by phone). Marked source 'api'. */
publicApiRouter.post(
  '/contacts',
  requireScope('contacts:write'),
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(createContactSchema, req.body);
    const contact = await createContact(tenantId, { ...input, source: 'api' });
    res.status(201).json(contact);
  }),
);

/** GET /contacts — list/search the tenant's contacts (cursor-paginated). */
publicApiRouter.get(
  '/contacts',
  requireScope('contacts:read'),
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const q = req.query;
    const body: ListContactsResponse = await listContacts(tenantId, {
      search: qstr(q.search),
      tag: qstr(q.tag),
      optInStatus: qstr(q.optInStatus) as OptInStatus | undefined,
      source: qstr(q.source) as ContactSource | undefined,
      status: qstr(q.status) as ContactStatus | undefined,
      cursor: qstr(q.cursor),
      limit: qnum(q.limit),
    });
    res.json(body);
  }),
);
