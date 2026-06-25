import { z } from 'zod';

import { CONTACT_SOURCES, CONTACT_STATUSES, OPT_IN_STATUSES } from '@thinkai/shared';

/**
 * Contacts management schemas (feature 1.2). Phone is validated leniently here (length/charset)
 * and canonicalized to E.164 in the service (normalizePhone), which is the single source of
 * truth so the add + import paths dedupe on the same key.
 */

const tagsField = z.array(z.string().trim().min(1).max(50)).max(50).optional();
const attributesField = z.record(z.string().trim().min(1).max(60), z.string().max(2000)).optional();

export const createContactSchema = z.object({
  phone: z.string().trim().min(5, 'Phone is required').max(20),
  name: z.string().trim().max(120).optional(),
  tags: tagsField,
  optInStatus: z.enum(OPT_IN_STATUSES).optional(),
  attributes: attributesField,
  source: z.enum(CONTACT_SOURCES).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
});

export const updateContactSchema = z.object({
  name: z.string().trim().max(120).optional(),
  tags: tagsField,
  optInStatus: z.enum(OPT_IN_STATUSES).optional(),
  attributes: attributesField,
  status: z.enum(CONTACT_STATUSES).optional(),
});

export const importContactsSchema = z.object({
  rows: z
    .array(
      z.object({
        phone: z.string().trim().max(40),
        name: z.string().trim().max(120).optional(),
        tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
        attributes: z.record(z.string().trim().min(1).max(60), z.string().max(2000)).optional(),
      }),
    )
    .min(1, 'No rows to import')
    .max(2000, 'At most 2000 rows per import request'),
});

export const bulkActionSchema = z
  .object({
    action: z.enum(['add_tag', 'remove_tag', 'delete']),
    contactIds: z
      .array(z.string().trim().min(1))
      .min(1, 'No contacts selected')
      .max(1000, 'At most 1000 contacts per bulk action'),
    tag: z.string().trim().min(1).max(50).optional(),
  })
  .refine((v) => v.action === 'delete' || (v.tag !== undefined && v.tag.length > 0), {
    message: 'A tag is required for add_tag / remove_tag',
    path: ['tag'],
  });

const attributeDefSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Attribute name is required')
    .max(60)
    .regex(/^[A-Za-z0-9_]+$/, 'Attribute name may contain only letters, digits and underscores'),
  defaultValue: z.string().trim().max(2000).optional(),
});

const tagDefSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a #RRGGBB hex')
    .default('#2563eb'),
});

export const updateContactSettingsSchema = z.object({
  attributes: z.array(attributeDefSchema).max(50, 'At most 50 attributes').optional(),
  tags: z.array(tagDefSchema).max(200, 'At most 200 tags').optional(),
});
