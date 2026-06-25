/** Zod schema for creating a Developer Hub API key. At least one scope must be granted. */

import { z } from 'zod';

import { API_SCOPES } from '@thinkai/shared';

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1, 'Select at least one scope'),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
