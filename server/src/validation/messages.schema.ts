/**
 * Zod validation schemas for the inbox message-send endpoints.
 *
 * These guard the two write paths into the inbox:
 *   - free-text replies   (POST /api/inbox/conversations/:id/messages)
 *   - template sends       (POST /api/inbox/send-template)
 *
 * The parsed/typed values are structurally compatible with the shared DTOs
 * (SendTextRequest / SendTemplateRequest) so route handlers can hand them straight
 * to the message services. We validate strictly (.strict()) so a client cannot smuggle
 * extra fields — in particular a tenant user must NEVER be able to pass a tenantId in
 * the body; tenant scope is resolved server-side from the verified token.
 */

import { z } from 'zod';

/** A non-empty, trimmed string of at most `max` characters. */
const trimmedString = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(max));

/**
 * E.164-ish phone validation: optional leading '+', then 8–15 digits.
 * Kept deliberately permissive (we do not assume a country) but strict enough to reject
 * obviously malformed input before it reaches the BSP.
 */
const phoneSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().regex(/^\+?[1-9]\d{7,14}$/, 'must be a valid E.164 phone number'));

/**
 * Free-text reply body. Allowed only inside an open 24h service window (enforced in the
 * service layer); here we only validate shape and length.
 */
export const sendTextSchema = z
  .object({
    body: trimmedString(4096),
  })
  .strict();

export type SendTextInput = z.infer<typeof sendTextSchema>;

/**
 * Template send. `variables` are POSITIONAL body parameters mapped, in order, to the
 * Meta template body components. Defaults to an empty array for templates
 * with no variables.
 */
export const sendTemplateSchema = z
  .object({
    toPhone: phoneSchema,
    templateName: trimmedString(512),
    // Meta language codes look like 'en', 'en_US', 'pt_BR'. Allow letters + underscore.
    languageCode: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().regex(/^[a-zA-Z]{2,3}(_[a-zA-Z]{2,4})?$/, 'invalid language code')),
    variables: z.array(z.string().max(1024)).max(64).default([]),
  })
  .strict();

export type SendTemplateInput = z.infer<typeof sendTemplateSchema>;
