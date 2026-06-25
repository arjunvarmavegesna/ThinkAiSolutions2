/**
 * Contacts CRUD + list + bulk actions (feature 1.2). Tenant-scoped; all writes server-side.
 *
 * Identity: the contact id is DETERMINISTIC from the phone (conversationIdForPhone), the same
 * key the inbound pipeline uses — so "add" and "import" dedupe on phone automatically (an existing
 * contact is updated, never duplicated). Phones are canonicalized to E.164 (leading '+') so the
 * stored value is uniform and prefix-searchable.
 *
 * List: cursor-paginated (opaque id cursor, mirrors the inbox readService). Equality filters
 * (optInStatus / source / status) + a single-tag array membership, plus single-field prefix search
 * (numeric -> phone, text -> nameLower). Cross-field full-text is intentionally out of scope.
 */

import type {
  ContactDTO,
  ContactSource,
  ContactStatus,
  ListContactsResponse,
  OptInStatus,
} from '@thinkai/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { toContact } from '../../db/mappers';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { conversationIdForPhone } from '../conversations/window';

/** Canonicalize a phone to E.164 (leading '+', 7–15 digits). Throws on anything implausible. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw AppError.badRequest(`"${raw}" is not a valid phone number`, 'invalid_phone');
  }
  return `+${digits}`;
}

/** Trim, drop empties, de-duplicate a tag list. */
function dedupeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0)));
}

export interface CreateContactInput {
  phone: string;
  name?: string;
  tags?: string[];
  optInStatus?: OptInStatus;
  attributes?: Record<string, string>;
  source?: ContactSource;
  status?: ContactStatus;
}

/** Create a contact, or update it in place when the phone already exists (dedupe by phone). */
export async function createContact(tenantId: string, input: CreateContactInput): Promise<ContactDTO> {
  const phone = normalizePhone(input.phone);
  const id = conversationIdForPhone(phone);
  const now = Date.now();
  const name = input.name?.trim();

  // Fields set on BOTH create and update.
  const common: Prisma.ContactUncheckedUpdateInput = {
    phone,
    channel: 'whatsapp',
    updatedAt: msBig(now),
    ...(name ? { name, nameLower: name.toLowerCase() } : {}),
    ...(input.tags ? { tags: dedupeTags(input.tags) } : {}),
    ...(input.optInStatus ? { optInStatus: input.optInStatus } : {}),
    ...(input.attributes ? { attributes: input.attributes } : {}),
    ...(input.status ? { status: input.status } : {}),
  };

  const row = await prisma.contact.upsert({
    where: { tenantId_id: { tenantId, id } },
    create: {
      tenantId,
      id,
      phone,
      channel: 'whatsapp',
      createdAt: msBig(now),
      updatedAt: msBig(now),
      ...(name ? { name, nameLower: name.toLowerCase() } : {}),
      ...(input.tags ? { tags: dedupeTags(input.tags) } : {}),
      optInStatus: input.optInStatus ?? 'opted_in',
      ...(input.attributes ? { attributes: input.attributes } : {}),
      source: input.source ?? 'manual',
      status: input.status ?? 'active',
    },
    update: common,
  });

  logger.info({ tenantId, id }, 'contacts: upserted');
  return toContact(row) as ContactDTO;
}

export interface UpdateContactInput {
  name?: string;
  tags?: string[];
  optInStatus?: OptInStatus;
  attributes?: Record<string, string>;
  status?: ContactStatus;
}

/** Patch an existing contact (phone is immutable — it's the identity). */
export async function updateContact(
  tenantId: string,
  id: string,
  patch: UpdateContactInput,
): Promise<ContactDTO> {
  const existing = await prisma.contact.findUnique({ where: { tenantId_id: { tenantId, id } } });
  if (!existing) throw AppError.notFound('Contact not found', 'contact_not_found');

  const update: Prisma.ContactUncheckedUpdateInput = { updatedAt: msBig(Date.now()) };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    update.name = name;
    update.nameLower = name.toLowerCase();
  }
  if (patch.tags !== undefined) update.tags = dedupeTags(patch.tags);
  if (patch.optInStatus !== undefined) update.optInStatus = patch.optInStatus;
  if (patch.attributes !== undefined) update.attributes = patch.attributes;
  if (patch.status !== undefined) update.status = patch.status;

  const row = await prisma.contact.update({
    where: { tenantId_id: { tenantId, id } },
    data: update,
  });
  return toContact(row) as ContactDTO;
}

/** Delete all contacts for a tenant. */
export async function deleteAllContacts(tenantId: string): Promise<{ deleted: number }> {
  const { count } = await prisma.contact.deleteMany({ where: { tenantId } });
  logger.info({ tenantId, count }, 'contacts: deleted all');
  return { deleted: count };
}

/** Delete a contact. */
export async function deleteContact(tenantId: string, id: string): Promise<void> {
  const existing = await prisma.contact.findUnique({ where: { tenantId_id: { tenantId, id } } });
  if (!existing) throw AppError.notFound('Contact not found', 'contact_not_found');
  await prisma.contact.delete({ where: { tenantId_id: { tenantId, id } } });
  logger.info({ tenantId, id }, 'contacts: deleted');
}

export interface ListContactsOpts {
  search?: string;
  tag?: string;
  optInStatus?: OptInStatus;
  source?: ContactSource;
  status?: ContactStatus;
  cursor?: string;
  limit?: number;
}

/** List contacts with filters + single-field prefix search + cursor pagination. */
export async function listContacts(
  tenantId: string,
  opts: ListContactsOpts,
): Promise<ListContactsResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

  const where: Prisma.ContactWhereInput = { tenantId };
  if (opts.optInStatus) where.optInStatus = opts.optInStatus;
  if (opts.source) where.source = opts.source;
  if (opts.status) where.status = opts.status;
  if (opts.tag) where.tags = { has: opts.tag };

  // Prefix search picks the ordering column (numeric -> phone, text -> nameLower); otherwise
  // newest-first by createdAt. `id` is appended as a stable tie-breaker for cursor paging.
  let orderBy: Prisma.ContactOrderByWithRelationInput[];
  const search = opts.search?.trim();
  if (search) {
    const numeric = /^[+]?[0-9][0-9\s\-()]*$/.test(search);
    if (numeric) {
      where.phone = { startsWith: `+${search.replace(/[^0-9]/g, '')}` };
      orderBy = [{ phone: 'asc' }, { id: 'asc' }];
    } else {
      where.nameLower = { startsWith: search.toLowerCase() };
      orderBy = [{ nameLower: 'asc' }, { id: 'asc' }];
    }
  } else {
    orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
  }

  const rows = await prisma.contact.findMany({
    where,
    orderBy,
    take: limit + 1,
    ...(opts.cursor
      ? { cursor: { tenantId_id: { tenantId, id: opts.cursor } }, skip: 1 }
      : {}),
  });

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const items: ContactDTO[] = page.map((r) => toContact(r) as ContactDTO);
  const nextCursor = hasMore ? page[page.length - 1].id : undefined;
  return nextCursor ? { items, nextCursor } : { items };
}

export interface BulkActionInput {
  action: 'add_tag' | 'remove_tag' | 'delete';
  contactIds: string[];
  tag?: string;
}

/** Apply a tag/untag/delete across selected contacts (chunked). Tag ops use Postgres array SQL. */
export async function bulkAction(
  tenantId: string,
  input: BulkActionInput,
): Promise<{ affected: number }> {
  const ids = Array.from(new Set(input.contactIds));
  const now = msBig(Date.now());
  let affected = 0;

  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    if (input.action === 'delete') {
      await prisma.contact.deleteMany({ where: { tenantId, id: { in: chunk } } });
    } else if (input.action === 'add_tag' && input.tag) {
      // array_append only when the tag isn't already present (mirrors arrayUnion).
      await prisma.$executeRaw`
        UPDATE contacts
        SET tags = CASE WHEN ${input.tag} = ANY(tags) THEN tags ELSE array_append(tags, ${input.tag}) END,
            "updatedAt" = ${now}
        WHERE "tenantId" = ${tenantId} AND id = ANY(${chunk})`;
    } else if (input.action === 'remove_tag' && input.tag) {
      await prisma.$executeRaw`
        UPDATE contacts
        SET tags = array_remove(tags, ${input.tag}), "updatedAt" = ${now}
        WHERE "tenantId" = ${tenantId} AND id = ANY(${chunk})`;
    }
    affected += chunk.length;
  }
  logger.info({ tenantId, action: input.action, affected }, 'contacts: bulk action');
  return { affected };
}
