/**
 * Developer Hub API keys (client-facing /api/v1). A key is a high-entropy token `tai_<48 hex>`.
 * We store ONLY its SHA-256 hash, and the hash IS the primary key — so authenticating a
 * presented key is an O(1) lookup (no scan on the hot path). The raw key is returned once
 * at creation and never persisted; there is no way to recover it.
 *
 * Hashing is unsalted SHA-256: the token already carries 192 bits of entropy (the GitHub-PAT
 * model), so a salt would add nothing and would break the primary-key lookup.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { ApiKeyDTO, ApiScope, CreateApiKeyResponse } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig, msNum } from '../../db/serde';
import { AppError } from '../../lib/AppError';

/** Human-facing key prefix; the rest is random hex. */
const KEY_PREFIX = 'tai_';
/** Don't write lastUsedAt more than once per this interval per key (avoids a write per request). */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/** In-memory memo of the last time we persisted lastUsedAt for a key (per instance). */
const lastUsedMemo = new Map<string, number>();

/** Stored api_keys row shape (the fields we read back). */
interface ApiKeyRow {
  id: string;
  tenantId: string;
  name: string;
  scopes: string[];
  keyPrefix: string;
  createdAt: bigint;
  lastUsedAt: bigint | null;
  revokedAt: bigint | null;
}

/** SHA-256 hex of the raw key — used as the api_keys primary key. */
export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Map a stored key row to its masked DTO (never carries the secret). */
export function toApiKeyDTO(key: ApiKeyRow): ApiKeyDTO {
  const lastUsedAt = msNum(key.lastUsedAt);
  return {
    id: key.id,
    name: key.name,
    scopes: key.scopes as ApiScope[],
    keyPrefix: key.keyPrefix,
    createdAt: msNum(key.createdAt) as number,
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
    revoked: key.revokedAt !== null,
  };
}

/** Create a new key for a tenant. Returns the full secret ONCE (caller must not log it). */
export async function generateApiKey(
  tenantId: string,
  input: { name: string; scopes: ApiScope[]; createdBy: string },
): Promise<CreateApiKeyResponse> {
  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  const id = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12); // "tai_" + 8 hex chars

  await prisma.apiKey.create({
    data: {
      id,
      tenantId,
      name: input.name,
      scopes: input.scopes,
      keyPrefix,
      createdBy: input.createdBy,
      createdAt: msBig(Date.now()),
    },
  });

  return { id, name: input.name, scopes: input.scopes, keyPrefix, apiKey: rawKey };
}

/** List a tenant's keys (masked), newest first. */
export async function listApiKeys(tenantId: string): Promise<ApiKeyDTO[]> {
  const rows = await prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toApiKeyDTO);
}

/** Revoke a key (idempotent). 404 if it doesn't exist or belongs to another tenant. */
export async function revokeApiKey(tenantId: string, id: string): Promise<void> {
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.tenantId !== tenantId) {
    throw AppError.notFound('API key not found');
  }
  if (key.revokedAt === null) {
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: msBig(Date.now()) } });
  }
}

/**
 * Resolve a presented raw key to its context, or null if unknown/revoked. Touches lastUsedAt
 * best-effort (throttled, non-blocking) so a slow write never delays the API call.
 */
export async function resolveApiKey(
  rawKey: string,
): Promise<{ id: string; tenantId: string; scopes: ApiScope[] } | null> {
  const id = hashKey(rawKey);
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key) return null;
  if (key.revokedAt !== null) return null;

  const now = Date.now();
  const last = lastUsedMemo.get(id) ?? 0;
  if (now - last > LAST_USED_THROTTLE_MS) {
    lastUsedMemo.set(id, now);
    void prisma.apiKey
      .update({ where: { id }, data: { lastUsedAt: msBig(now) } })
      .catch(() => undefined);
  }

  return { id, tenantId: key.tenantId, scopes: key.scopes as ApiScope[] };
}
