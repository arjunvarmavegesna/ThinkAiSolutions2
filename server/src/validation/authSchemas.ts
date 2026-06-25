/**
 * Zod schemas for the self-serve auth surface.
 *
 * SECURITY: `provisionSchema` is `.strict()` and accepts ONLY an optional cosmetic display
 * name. Identity (uid / email / email_verified) is read from the VERIFIED Firebase token, and
 * the granted role is hard-coded to 'tenant_admin' in the controller — so a caller can never
 * inject `role`, `tenantId`, or `email` to escalate or hijack a tenant.
 */

import { z } from 'zod';

import { exchangeSignupSchema } from './adminSchemas';

/** POST /api/auth/provision body. */
export const provisionSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

/**
 * Tenant-scoped Embedded Signup exchange: identical to the admin schema but WITHOUT tenantId —
 * the tenant is derived from the caller's own token (res.locals.tenantId via requireTenant).
 */
export const exchangeSignupTenantSchema = exchangeSignupSchema.omit({ tenantId: true });

export type ProvisionInput = z.infer<typeof provisionSchema>;
export type ExchangeSignupTenantInput = z.infer<typeof exchangeSignupTenantSchema>;
