/**
 * Meta App Review compliance records (Deauthorize + Data Deletion Request callbacks).
 *
 * These callbacks identify the person only by an app-scoped Facebook `user_id`. The platform
 * does not currently persist that id at onboarding, so we CANNOT resolve user_id -> tenant/WABA
 * here. We therefore record the requests in top-level (non-tenant) collections for audit and
 * to back the status page, and treat the actual data erasure as best-effort/manual until a
 * user_id -> tenant mapping exists. This file is Firestore-only — no Graph/provider calls.
 */

import { randomBytes, randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';

export type DeletionStatus = 'received' | 'in_progress' | 'completed';

export interface DataDeletionRequest {
  /** Doc id and the code returned to Meta; the user quotes it on the status page. */
  confirmationCode: string;
  /** App-scoped Facebook user id from the signed_request (may be absent on a malformed payload). */
  fbUserId: string | null;
  status: DeletionStatus;
  /** signed_request issued_at (epoch SECONDS, as Meta sends it), if present. */
  issuedAt: number | null;
  /** When we recorded it (epoch MILLISECONDS — platform time convention). */
  createdAt: number;
}

/** A short, URL-safe, hard-to-guess confirmation code. */
function generateConfirmationCode(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Record a data-deletion request and return its confirmation code. Idempotency is not keyed
 * (Meta does not supply a stable request id); each callback creates a fresh tracked request,
 * which is acceptable — duplicates simply produce extra "received" rows.
 */
export async function createDeletionRequest(args: {
  fbUserId: string | null;
  issuedAt: number | null;
}): Promise<string> {
  const confirmationCode = generateConfirmationCode();
  const record: DataDeletionRequest = {
    confirmationCode,
    fbUserId: args.fbUserId,
    status: 'received',
    issuedAt: args.issuedAt,
    createdAt: Date.now(),
  };
  await prisma.dataDeletionRequest.create({
    data: {
      code: confirmationCode,
      payload: record as unknown as Prisma.InputJsonValue,
      createdAt: msBig(record.createdAt),
    },
  });
  return confirmationCode;
}

/** Look up a deletion request by its confirmation code for the status page. */
export async function getDeletionStatus(
  confirmationCode: string,
): Promise<DataDeletionRequest | null> {
  const row = await prisma.dataDeletionRequest.findUnique({ where: { code: confirmationCode } });
  return row ? (row.payload as unknown as DataDeletionRequest) : null;
}

/** Record an app deauthorization (user removed the app) for audit. No WABA flagged (see header). */
export async function recordDeauthorization(args: {
  fbUserId: string | null;
  issuedAt: number | null;
}): Promise<void> {
  const now = Date.now();
  await prisma.deauthorization.create({
    data: {
      id: randomUUID(),
      payload: { fbUserId: args.fbUserId, issuedAt: args.issuedAt, createdAt: now },
      createdAt: msBig(now),
    },
  });
}
