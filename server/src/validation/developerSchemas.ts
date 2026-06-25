/**
 * Zod schema for the Developer Hub webhook-config endpoint. The callback URL must be a valid
 * HTTPS URL (we never POST tenant events over plaintext http), and at least one event type must
 * be selected for the config to be meaningful.
 */

import { z } from 'zod';

import { WEBHOOK_EVENT_TYPES } from '@thinkai/shared';

/** A syntactically valid https:// URL. */
const httpsUrl = z
  .string()
  .trim()
  .url('callbackUrl must be a valid URL')
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'callbackUrl must use https');

// ---- PUT /api/developer/webhook ----
export const updateWebhookConfigSchema = z.object({
  enabled: z.boolean(),
  callbackUrl: httpsUrl,
  eventTypes: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, 'Select at least one event type'),
});

export type UpdateWebhookConfigInput = z.infer<typeof updateWebhookConfigSchema>;
