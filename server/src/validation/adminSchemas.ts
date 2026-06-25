/**
 * Zod request schemas for the reseller-admin API surface.
 *
 * These validate the raw JSON body BEFORE any controller logic runs, then narrow it into
 * the shared DTO types. Money is always integer paise (non-negative ints). GSTIN, when
 * present, is validated with the shared `isValidGstin` so a malformed number never reaches
 * Firestore. Tenant users provisioned here may only be tenant_admin or agent — never a
 * reseller_admin — so that privilege escalation is impossible via this endpoint.
 */

import { z } from 'zod';

import { BSP_PROVIDERS, isValidGstin, VALID_GST_STATE_CODES } from '@thinkai/shared';

import { AppError } from '../lib/AppError';

/** Integer paise rate: a non-negative whole number (0 is allowed, e.g. free utility). */
const paise = z.number().int().nonnegative();

/** A 2-digit GST state code restricted to the valid set (01–37, 97). */
const stateCode = z
  .string()
  .trim()
  .refine((v) => VALID_GST_STATE_CODES.has(v), { message: 'Invalid GST state code' });

/** A GSTIN that passes the full shared format + state-code check. */
const gstin = z
  .string()
  .trim()
  .refine((v) => isValidGstin(v), { message: 'Invalid GSTIN' });

/** Loose E.164-ish phone check: a leading + and 8–15 digits. */
const phoneNumber = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone number must be E.164, e.g. +9198XXXXXXXX');

// ---- POST /api/admin/tenants ----
export const createTenantSchema = z.object({
  name: z.string().trim().min(1, 'Tenant name is required'),
  plan: z.string().trim().min(1).optional(),
  billing: z
    .object({
      legalName: z.string().trim().min(1).optional(),
      gstin: gstin.optional(),
      stateCode: stateCode.optional(),
      address: z.string().trim().min(1).optional(),
    })
    .default({}),
});

// ---- POST /api/admin/users ----
export const createTenantUserSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId is required'),
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('A valid email is required'),
  // Firebase Auth requires a minimum of 6 characters.
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['tenant_admin', 'agent']),
});

// ---- POST /api/admin/wabas (manual metaCloud connect, e.g. the Meta test number) ----
// metaCloud addresses the WABA by the two Meta ids and authenticates with the global token
// (System User in live, the test number's temporary token in test) — no per-WABA apikey, and
// Meta verifies webhooks at the App level, so there's no webhook secret to register here.
export const connectWabaSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId is required'),
  provider: z.enum(BSP_PROVIDERS).default('metaCloud'),
  phoneNumber,
  displayName: z.string().trim().min(1, 'displayName is required'),
  wabaId: z.string().trim().min(1, 'wabaId is required'),
  phoneNumberId: z.string().trim().min(1, 'phoneNumberId is required'),
});

// ---- POST /api/admin/onboarding/exchange (Meta Embedded Signup) ----
// The browser captures { code, wabaId, phoneNumberId } from the ES popup; the server exchanges
// the code, subscribes our app, registers the number, and persists the WABA. No apikey here —
// metaCloud uses the shared System User token. phoneNumber/displayName are filled from Graph
// when the popup doesn't surface them; pin (if provided) drives Cloud API number registration.
export const exchangeSignupSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId is required'),
  code: z.string().trim().min(1, 'code is required'),
  wabaId: z.string().trim().min(1, 'wabaId is required'),
  phoneNumberId: z.string().trim().min(1, 'phoneNumberId is required'),
  phoneNumber: phoneNumber.optional(),
  displayName: z.string().trim().min(1).optional(),
  pin: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'PIN must be 6 digits')
    .optional(),
});

// ---- PUT /api/admin/pricing/:tenantId ----
// tenantId travels in the path; the body carries the per-category rates. We accept (but do
// not require) an in-body tenantId to match the shared DTO; the controller uses the path.
export const setPricingSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  marketingPaise: paise,
  utilityPaise: paise,
  authPaise: paise,
  costMarketingPaise: paise.optional(),
  costUtilityPaise: paise.optional(),
  costAuthPaise: paise.optional(),
});

/** Path/query param that must be a present, non-empty tenant id. */
export const tenantIdParamSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId is required'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateTenantUserInput = z.infer<typeof createTenantUserSchema>;
export type ConnectWabaInput = z.infer<typeof connectWabaSchema>;
export type ExchangeSignupInput = z.infer<typeof exchangeSignupSchema>;
export type SetPricingInput = z.infer<typeof setPricingSchema>;

/**
 * Parse `data` with `schema`, converting any ZodError into a 400 AppError carrying the
 * first issue's message. Used by every admin controller so validation failures surface as
 * the standard `{ error: { code, message } }` envelope with a 400 status.
 */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  // Surface the first, most actionable validation message.
  const first = result.error.issues[0];
  const path = first.path.length > 0 ? `${first.path.join('.')}: ` : '';
  throw AppError.badRequest(`${path}${first.message}`, 'validation_error');
}
