/**
 * Resolve a campaign audience `segment` into concrete recipients by reading the tenant's
 * `contacts` collection. Channel-neutral: it returns phones + contact ids; the send step
 * dispatches via the channel provider.
 *
 * Rules:
 *  - `tags` (optional, <=10): include contacts having ANY of them (Firestore array-contains-any).
 *    Empty/absent => all contacts.
 *  - Opt-out is ALWAYS honoured: contacts with optInStatus === 'opted_out' are excluded
 *    (compliance). `optInOnly` further restricts to optInStatus === 'opted_in'.
 *  - De-duped by phone.
 *
 * Each recipient also carries the contact's `name` + custom `attributes`, so a future
 * per-recipient {{n}} personalization step (in the send worker) can read them WITHOUT another
 * lookup. This file only RESOLVES recipients; it does not touch the send path.
 */

import type { CampaignSegment } from '@thinkai/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';

export interface ResolvedRecipient {
  phone: string;
  contactId?: string;
  /** Contact display name, when known (for personalization). */
  name?: string;
  /** Custom attribute values keyed by attribute name (for personalization). */
  attributes?: Record<string, string>;
}

export async function resolveSegment(
  tenantId: string,
  segment: CampaignSegment,
): Promise<ResolvedRecipient[]> {
  const where: Prisma.ContactWhereInput = { tenantId };
  if (segment.tags && segment.tags.length > 0) {
    where.tags = { hasSome: segment.tags }; // array-contains-any
  }

  const rows = await prisma.contact.findMany({ where });

  const byPhone = new Map<string, ResolvedRecipient>();
  for (const c of rows) {
    const phone = (c.phone ?? '').trim();
    if (!phone) continue;

    // Compliance: never include opted-out contacts. optInOnly tightens to opted_in only.
    if (c.optInStatus === 'opted_out') continue;
    if (segment.optInOnly && c.optInStatus !== 'opted_in') continue;

    if (!byPhone.has(phone)) {
      byPhone.set(phone, {
        phone,
        contactId: c.id,
        ...(c.name ? { name: c.name } : {}),
        ...(c.attributes ? { attributes: c.attributes as Record<string, string> } : {}),
      });
    }
  }

  return [...byPhone.values()];
}
