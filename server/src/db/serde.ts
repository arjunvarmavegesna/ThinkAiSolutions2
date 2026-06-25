/**
 * Serialization helpers for the Postgres data layer.
 *
 * The domain model (shared/src/types/firestore.ts) stores every timestamp as an epoch
 * MILLISECONDS `number`. Postgres holds them as `bigint` (so they don't overflow int32),
 * and Prisma returns/accepts JS `bigint`. These helpers convert at the repository boundary
 * so the rest of the server keeps working in plain `number`s exactly as it did with Firestore.
 */

/** bigint (or null) from the DB -> domain `number` (epoch ms). */
export function msNum(value: bigint | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

/** Required variant: bigint -> number, asserting presence (for non-null columns). */
export function msNumReq(value: bigint): number {
  return Number(value);
}

/** domain `number` (epoch ms) -> bigint for the DB. */
export function msBig(value: number): bigint {
  return BigInt(Math.trunc(value));
}

/** Optional domain number -> bigint | null (for nullable columns / partial updates). */
export function msBigOpt(value: number | null | undefined): bigint | null {
  return value === null || value === undefined ? null : BigInt(Math.trunc(value));
}

/**
 * Strip keys whose value is `undefined` from an object so a Prisma `update`/`create` payload
 * only carries fields the caller actually set (mirrors Firestore's partial-merge semantics).
 */
export function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
