/**
 * Tenant-facing Contacts management (feature 1.2). All routes are verifyAuth + requireTenant and
 * tenant-scoped via res.locals.tenantId (never a client-supplied tenant).
 *
 *   GET    /api/contacts              -> filtered/searched, cursor-paginated list
 *   POST   /api/contacts              -> add (dedupe by phone: updates if exists)
 *   POST   /api/contacts/import       -> import one chunk of mapped rows (batched)
 *   POST   /api/contacts/bulk-action  -> add_tag / remove_tag / delete across a selection
 *   PATCH  /api/contacts/:id          -> edit a contact
 *   DELETE /api/contacts/:id          -> delete a contact
 *
 *   GET    /api/contact-attributes    -> attribute definitions + tag palette
 *   PUT    /api/contact-attributes    -> replace attribute definitions + tag palette
 *
 * Mounted with a larger JSON body limit (see app.ts) so import chunks fit.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { CONTACT_SOURCES, CONTACT_STATUSES, OPT_IN_STATUSES } from '@thinkai/shared';
import type {
  BulkActionResponse,
  ContactDTO,
  ContactSettingsResponse,
  ContactSource,
  ContactStatus,
  ImportContactsResponse,
  ListContactsResponse,
  OptInStatus,
} from '@thinkai/shared';

import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
import { parseOrThrow } from '../validation/adminSchemas';
import {
  bulkActionSchema,
  createContactSchema,
  importContactsSchema,
  updateContactSchema,
  updateContactSettingsSchema,
} from '../validation/contacts.schema';
import {
  bulkAction,
  createContact,
  deleteAllContacts,
  deleteContact,
  listContacts,
  updateContact,
} from '../services/contacts/manageContacts';
import { importContacts } from '../services/contacts/importContacts';
import {
  getContactSettings,
  updateContactSettings,
} from '../services/contacts/contactSettings';

export const contactsRouter = Router();

/** Narrow a query-string value to a known enum member (or undefined). */
function pickEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | undefined {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

/** GET /api/contacts — list with filters/search/pagination. */
contactsRouter.get(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const q = req.query;
    const limitRaw = typeof q.limit === 'string' ? Number(q.limit) : undefined;
    const result: ListContactsResponse = await listContacts(tenantId, {
      search: typeof q.search === 'string' ? q.search : undefined,
      tag: typeof q.tag === 'string' ? q.tag : undefined,
      optInStatus: pickEnum<OptInStatus>(q.optInStatus, OPT_IN_STATUSES),
      source: pickEnum<ContactSource>(q.source, CONTACT_SOURCES),
      status: pickEnum<ContactStatus>(q.status, CONTACT_STATUSES),
      cursor: typeof q.cursor === 'string' ? q.cursor : undefined,
      limit: limitRaw && Number.isFinite(limitRaw) ? limitRaw : undefined,
    });
    res.json(result);
  }),
);

/** POST /api/contacts — add a contact (upsert by phone). */
contactsRouter.post(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(createContactSchema, req.body);
    const contact: ContactDTO = await createContact(tenantId, input);
    res.status(201).json(contact);
  }),
);

/** POST /api/contacts/import — import one chunk of mapped rows. */
contactsRouter.post(
  '/import',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(importContactsSchema, req.body);
    const result: ImportContactsResponse = await importContacts(tenantId, input.rows);
    res.json(result);
  }),
);

/** POST /api/contacts/bulk-action — tag / untag / delete a selection. */
contactsRouter.post(
  '/bulk-action',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(bulkActionSchema, req.body);
    const result: BulkActionResponse = await bulkAction(tenantId, input);
    res.json(result);
  }),
);

/** DELETE /api/contacts — delete ALL contacts for the tenant. */
contactsRouter.delete(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (_req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const result = await deleteAllContacts(tenantId);
    res.json(result);
  }),
);

/** PATCH /api/contacts/:id — edit a contact. */
contactsRouter.patch(
  '/:id',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(updateContactSchema, req.body);
    const contact: ContactDTO = await updateContact(tenantId, req.params.id, input);
    res.json(contact);
  }),
);

/** DELETE /api/contacts/:id — delete a contact. */
contactsRouter.delete(
  '/:id',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    await deleteContact(tenantId, req.params.id);
    res.status(204).end();
  }),
);

/** Separate router for /api/contact-attributes (attribute defs + tag palette). */
export const contactSettingsRouter = Router();

/** GET /api/contact-attributes — attribute definitions + tag palette. */
contactSettingsRouter.get(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (_req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const result: ContactSettingsResponse = await getContactSettings(tenantId);
    res.json(result);
  }),
);

/** PUT /api/contact-attributes — replace attribute definitions + tag palette. */
contactSettingsRouter.put(
  '/',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const input = parseOrThrow(updateContactSettingsSchema, req.body);
    const result: ContactSettingsResponse = await updateContactSettings(tenantId, input);
    res.json(result);
  }),
);
