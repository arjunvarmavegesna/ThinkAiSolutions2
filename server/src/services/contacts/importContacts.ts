/**
 * Bulk contact import (feature 1.2). The client parses the CSV (papaparse), maps columns, and
 * POSTs rows in chunks (~1k each); this service validates + dedupes + writes ONE chunk and reports
 * added / updated / skipped so the client can aggregate a live progress bar.
 *
 * Dedupe by phone via the deterministic id (same as the inbound + add paths). Existing contacts
 * are merged (tags union, attributes overwrite-when-present, name overwritten). Writes run inside a
 * single Postgres transaction; existence is resolved up front to count added vs updated and to
 * compute the tag union for updates.
 */

import type { ImportContactRow, ImportContactsResponse, ImportSkippedRow } from '@thinkai/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';
import { conversationIdForPhone } from '../conversations/window';
import { normalizePhone } from './manageContacts';

interface Prepared {
  id: string;
  phone: string;
  name?: string;
  tags: string[];
  attributes?: Record<string, string>;
}

export async function importContacts(
  tenantId: string,
  rows: ImportContactRow[],
): Promise<ImportContactsResponse> {
  const now = msBig(Date.now());
  const skipped: ImportSkippedRow[] = [];

  // Dedupe within the chunk by id (later row wins) while collecting parse errors.
  const byId = new Map<string, Prepared>();
  rows.forEach((row, index) => {
    let phone: string;
    try {
      phone = normalizePhone(row.phone ?? '');
    } catch {
      skipped.push({ index, phone: row.phone, reason: 'Invalid phone number' });
      return;
    }
    const id = conversationIdForPhone(phone);
    const name = row.name?.trim();
    const tags = Array.from(
      new Set((row.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0)),
    );
    byId.set(id, {
      id,
      phone,
      ...(name ? { name } : {}),
      tags,
      ...(row.attributes && Object.keys(row.attributes).length > 0
        ? { attributes: row.attributes }
        : {}),
    });
  });

  const entries = [...byId.values()];
  if (entries.length === 0) return { added: 0, updated: 0, skipped };

  // Resolve which ids already exist (added vs updated) + their current tags (for the union).
  const existingRows = await prisma.contact.findMany({
    where: { tenantId, id: { in: entries.map((e) => e.id) } },
    select: { id: true, tags: true },
  });
  const existingTags = new Map(existingRows.map((r) => [r.id, r.tags]));

  let added = 0;
  let updated = 0;
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const e of entries) {
    const prior = existingTags.get(e.id);
    if (prior !== undefined) {
      updated += 1;
      const mergedTags = Array.from(new Set([...prior, ...e.tags]));
      ops.push(
        prisma.contact.update({
          where: { tenantId_id: { tenantId, id: e.id } },
          data: {
            phone: e.phone,
            channel: 'whatsapp',
            updatedAt: now,
            tags: mergedTags,
            ...(e.name ? { name: e.name, nameLower: e.name.toLowerCase() } : {}),
            ...(e.attributes ? { attributes: e.attributes } : {}),
          },
        }),
      );
    } else {
      added += 1;
      ops.push(
        prisma.contact.create({
          data: {
            tenantId,
            id: e.id,
            phone: e.phone,
            channel: 'whatsapp',
            createdAt: now,
            updatedAt: now,
            tags: e.tags,
            optInStatus: 'unknown',
            source: 'import',
            status: 'active',
            ...(e.name ? { name: e.name, nameLower: e.name.toLowerCase() } : {}),
            ...(e.attributes ? { attributes: e.attributes } : {}),
          },
        }),
      );
    }
  }

  await prisma.$transaction(ops);

  logger.info(
    { tenantId, received: rows.length, added, updated, skipped: skipped.length },
    'contacts: import chunk processed',
  );
  return { added, updated, skipped };
}
