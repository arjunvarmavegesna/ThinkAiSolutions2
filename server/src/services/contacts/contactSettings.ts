/**
 * Tenant contact settings (feature 1.2): custom attribute definitions + the tag palette.
 * One row per tenant (mirrors pricing); read by tenant members through the API, written
 * server-only. Attribute defs drive the optional Contacts columns and the campaign
 * personalization mapping; tag defs carry chip colors.
 */

import type {
  ContactAttributeDef,
  ContactSettingsResponse,
  ContactTag,
  UpdateContactSettingsRequest,
} from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';

export async function getContactSettings(tenantId: string): Promise<ContactSettingsResponse> {
  const row = await prisma.contactSettings.findUnique({ where: { tenantId } });
  if (!row) return { attributes: [], tags: [] };
  return {
    attributes: (row.attributes as ContactAttributeDef[] | null) ?? [],
    tags: (row.tags as ContactTag[] | null) ?? [],
  };
}

export async function updateContactSettings(
  tenantId: string,
  input: UpdateContactSettingsRequest,
): Promise<ContactSettingsResponse> {
  const attributes =
    input.attributes !== undefined
      ? input.attributes.map((a) => ({
          name: a.name,
          ...(a.defaultValue ? { defaultValue: a.defaultValue } : {}),
        }))
      : undefined;
  const tags =
    input.tags !== undefined ? input.tags.map((t) => ({ name: t.name, color: t.color })) : undefined;

  await prisma.contactSettings.upsert({
    where: { tenantId },
    create: {
      tenantId,
      attributes: attributes ?? [],
      tags: tags ?? [],
      updatedAt: msBig(Date.now()),
    },
    update: {
      updatedAt: msBig(Date.now()),
      ...(attributes !== undefined ? { attributes } : {}),
      ...(tags !== undefined ? { tags } : {}),
    },
  });
  logger.info({ tenantId }, 'contacts: settings updated');
  return getContactSettings(tenantId);
}
