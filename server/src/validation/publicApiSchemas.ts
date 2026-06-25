/**
 * Zod schemas for the client-facing /api/v1 surface. Kept intentionally close to the existing
 * inbox/contacts validation; the underlying services do the deeper normalization (phone → E.164,
 * template approval, window checks), so these guard shape + obvious bounds at the edge.
 */

import { z } from 'zod';

import { OPT_IN_STATUSES } from '@thinkai/shared';

/** A non-empty phone string; the contacts/send services canonicalize it to E.164. */
const phone = z.string().trim().min(1, 'to/phone is required');

// ---- POST /api/v1/messages (discriminated by `type`) ----
const sendTemplate = z.object({
  type: z.literal('template'),
  to: phone,
  templateName: z.string().trim().min(1, 'templateName is required'),
  languageCode: z.string().trim().min(1, 'languageCode is required'),
  variables: z.array(z.string()).max(64).optional(),
});
const sendSession = z.object({
  type: z.literal('session'),
  to: phone,
  text: z.string().min(1, 'text is required').max(4096),
});

// A WhatsApp interactive object (list / reply-buttons / cta_url). We validate the envelope shape
// — interactive kind + a required `action`, with an optional `body.text` — and pass the nested
// list/button structures through unchanged (the provider + WhatsApp do the deep validation).
const interactiveObject = z
  .object({
    type: z.enum(['list', 'button', 'cta_url', 'product', 'product_list']),
    header: z.record(z.unknown()).optional(),
    body: z.object({ text: z.string().min(1).max(4096) }).passthrough().optional(),
    footer: z.record(z.unknown()).optional(),
    action: z.record(z.unknown()),
  })
  .passthrough();
const sendInteractive = z.object({
  type: z.literal('interactive'),
  to: phone,
  interactive: interactiveObject,
});

export const sendMessageSchema = z.discriminatedUnion('type', [
  sendTemplate,
  sendSession,
  sendInteractive,
]);

// ---- POST /api/v1/contacts ----
export const createContactSchema = z.object({
  phone,
  name: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  attributes: z.record(z.string()).optional(),
  optInStatus: z.enum(OPT_IN_STATUSES).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
