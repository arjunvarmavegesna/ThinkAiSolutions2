/**
 * Build a BspContext (phoneNumberId + wabaId + resolved plaintext apikey) for a tenant.
 *
 * This is the ONLY bridge between Firestore WABA docs / the SecretStore and the BSP layer.
 * The resolved apikey is carried in-memory on the BspContext for the duration of one call
 * and is NEVER persisted or logged (httpClient redacts it).
 *
 * A tenant may have multiple WABAs; Phase 1 picks the single connected one.
 */

import { AppError } from '../../lib/AppError';
import { config } from '../../config/env';
import { prisma } from '../../config/db';
import { msNum } from '../../db/serde';
import { logger } from '../../lib/logger';
import { BSP_PROVIDERS } from '@thinkai/shared';
import type { BspProviderName, Waba } from '@thinkai/shared';
import type { BspContext } from './types';

/** Shape we read off a WABA doc; mirrors the shared Waba type plus the doc id. */
type WabaDoc = Waba & { id: string };

/** Convert a Prisma `wabas` row (bigint timestamps) into the domain WabaDoc (number timestamps). */
function toWabaDoc(row: {
  id: string;
  provider: string | null;
  phoneNumber: string;
  displayName: string;
  status: string;
  bspApiKeyRef: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  providerRef: string | null;
  webhookSecretRef: string | null;
  qualityRating: string | null;
  messagingTier: string | null;
  qualityUpdatedAt: bigint | null;
  createdAt: bigint;
  updatedAt: bigint;
}): WabaDoc {
  return {
    id: row.id,
    provider: (row.provider ?? undefined) as Waba['provider'],
    phoneNumber: row.phoneNumber,
    displayName: row.displayName,
    status: row.status as Waba['status'],
    bspApiKeyRef: row.bspApiKeyRef ?? undefined,
    wabaId: row.wabaId ?? undefined,
    phoneNumberId: row.phoneNumberId ?? undefined,
    providerRef: row.providerRef ?? undefined,
    webhookSecretRef: row.webhookSecretRef ?? undefined,
    qualityRating: (row.qualityRating ?? undefined) as Waba['qualityRating'],
    messagingTier: (row.messagingTier ?? undefined) as Waba['messagingTier'],
    qualityUpdatedAt: msNum(row.qualityUpdatedAt),
    createdAt: msNum(row.createdAt) as number,
    updatedAt: msNum(row.updatedAt) as number,
  };
}

/** A resolved BSP context plus which provider should serve it (callers pass this to getBspProvider). */
export interface ResolvedBsp {
  ctx: BspContext;
  provider: BspProviderName;
}

/** Pick the provider for a WABA: its stored provider, else the configured default. */
function providerFor(waba: Pick<Waba, 'provider'>): BspProviderName {
  const list = BSP_PROVIDERS as readonly string[];
  if (waba.provider && list.includes(waba.provider)) return waba.provider;
  const configured = config.bsp.provider as BspProviderName;
  return list.includes(configured) ? configured : 'metaCloud';
}

/**
 * The Bearer token metaCloud uses for Graph calls. metaCloud acts on every client WABA with OUR
 * token + the client's phone_number_id (no per-client Meta key). Mode-aware:
 *  - live: the shared Meta System User token (META_SYSTEM_USER_TOKEN).
 *  - test: the Meta test number's temporary access token (META_TEST_ACCESS_TOKEN, rotates ~24h).
 * Both live in env config (never a Firestore tenant doc or the client bundle).
 */
function metaCloudBearer(): string {
  if (config.meta.mode === 'test') {
    const token = config.meta.testAccessToken;
    if (!token) {
      throw AppError.badRequest(
        'Meta test access token is not configured (set META_TEST_ACCESS_TOKEN)',
        'meta_test_token_missing',
      );
    }
    return token;
  }
  const token = config.meta.systemUserToken;
  if (!token) {
    throw AppError.badRequest('Meta System User token is not configured', 'meta_token_missing');
  }
  return token;
}

/** Turn a Firestore WABA doc into a BspContext (+ provider) by resolving its credentials. */
async function buildContext(tenantId: string, waba: WabaDoc): Promise<ResolvedBsp> {
  const provider = providerFor(waba);

  // metaCloud addresses every client WABA by its Meta ids and authenticates with OUR shared
  // token (System User in live, the test number's temporary token in test) — no per-WABA key.
  if (!waba.phoneNumberId || !waba.wabaId) {
    throw AppError.badRequest('WABA is missing phoneNumberId or wabaId', 'waba_incomplete');
  }
  const apiKey = metaCloudBearer();

  const ctx: BspContext = {
    tenantId,
    provider,
    // Generic routing/addressing id; for metaCloud this equals phoneNumberId.
    providerRef: waba.providerRef ?? waba.phoneNumberId,
    phoneNumberId: waba.phoneNumberId,
    wabaId: waba.wabaId,
    apiKey,
  };
  return { ctx, provider };
}

/**
 * Resolve the tenant's connected WABA into a BspContext.
 * Prefers status 'connected'; falls back to the most recently created WABA if none are
 * yet marked connected (e.g. mid-onboarding), so sends/health checks can still proceed.
 */
export async function resolveTenantBspContext(tenantId: string): Promise<ResolvedBsp> {
  const rows = await prisma.waba.findMany({ where: { tenantId } });
  if (rows.length === 0) {
    throw AppError.badRequest('No WABA connected for this tenant', 'no_waba');
  }

  const wabas: WabaDoc[] = rows.map(toWabaDoc);

  const connected = wabas.filter((w) => w.status === 'connected');
  const candidates = connected.length > 0 ? connected : wabas;

  // Deterministic pick: newest by createdAt (then id) so repeated calls choose the same WABA.
  candidates.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.id.localeCompare(b.id));

  return buildContext(tenantId, candidates[0]);
}

/** Resolve a specific WABA doc (by its Firestore id) into a BspContext. */
export async function resolveBspContextByWaba(
  tenantId: string,
  wabaDocId: string,
): Promise<ResolvedBsp> {
  const row = await prisma.waba.findUnique({
    where: { tenantId_id: { tenantId, id: wabaDocId } },
  });
  if (!row) {
    throw AppError.notFound('WABA not found');
  }
  return buildContext(tenantId, toWabaDoc(row));
}

/**
 * Reverse-lookup used by the inbound webhook: given a Meta phone_number_id, find which
 * tenant + WABA doc it belongs to. Uses a collectionGroup query across all tenants' wabas.
 *
 * Requires a Firestore collection-group index on `wabas.phoneNumberId` (see firestore.indexes).
 * Returns null when no WABA matches so the webhook can no-op safely.
 */
export async function resolveWabaByPhoneNumberId(
  phoneNumberId: string | undefined,
): Promise<{ tenantId: string; wabaDocId: string } | null> {
  if (!phoneNumberId) return null;
  return lookupWabaBy('phoneNumberId', phoneNumberId);
}

/**
 * Generic reverse-lookup by the provider-agnostic `providerRef` carried on a normalized
 * payload → owning tenant + WABA doc. Kept alongside resolveWabaByPhoneNumberId (metaCloud
 * routes inbound by phoneNumberId). Requires a collection-group index on `wabas.providerRef`.
 */
export async function resolveWabaByProviderRef(
  providerRef: string | undefined,
): Promise<{ tenantId: string; wabaDocId: string } | null> {
  if (!providerRef) return null;
  return lookupWabaBy('providerRef', providerRef);
}

/**
 * Reverse-lookup by Meta WABA id, used by the template-status webhook (its events carry the
 * waba_id on entry.id, not a phone_number_id). Requires a collection-group index on
 * `wabas.wabaId`. Returns null when no WABA matches so the webhook can no-op safely.
 */
export async function resolveWabaByWabaId(
  wabaId: string | undefined,
): Promise<{ tenantId: string; wabaDocId: string } | null> {
  if (!wabaId) return null;
  return lookupWabaBy('wabaId', wabaId);
}

/**
 * Shared reverse lookup for the webhook routers. Each of phoneNumberId / providerRef / wabaId is
 * a @unique column on `wabas`, so this is an indexed single-row lookup across all tenants
 * (replacing the former Firestore collectionGroup query).
 */
async function lookupWabaBy(
  field: 'phoneNumberId' | 'providerRef' | 'wabaId',
  value: string,
): Promise<{ tenantId: string; wabaDocId: string } | null> {
  const where =
    field === 'phoneNumberId'
      ? { phoneNumberId: value }
      : field === 'providerRef'
        ? { providerRef: value }
        : { wabaId: value };
  const row = await prisma.waba.findUnique({ where });

  if (!row) {
    logger.warn({ field, value }, 'Inbound webhook: no WABA matched routing id');
    return null;
  }

  return { tenantId: row.tenantId, wabaDocId: row.id };
}
