/**
 * Reseller-admin: provision a tenant user (tenant_admin or agent).
 *
 *   POST /api/admin/users
 *
 * Flow: validate the target tenant exists -> create a Firebase Auth user (email+password)
 * -> set the role + tenantId custom claims -> write the users/{uid} profile doc. The
 * password is write-only: it is sent to Firebase Auth and NEVER stored in Firestore or
 * returned to the caller. Only tenant_admin/agent can be created here (schema enforces it),
 * so this endpoint can never mint another reseller_admin.
 */

import type { Request, Response } from 'express';

import type { CreateTenantUserResponse } from '@thinkai/shared';

import { adminAuth } from '../../config/firebase';
import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { setUserClaims } from '../../auth/claims';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { createTenantUserSchema, parseOrThrow } from '../../validation/adminSchemas';

/** Narrow firebase-admin's "user already exists" failure to a 409 conflict. */
function isEmailAlreadyExists(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'auth/email-already-exists'
  );
}

/** POST /api/admin/users — create a Firebase Auth user + claims + Firestore profile. */
export async function createTenantUser(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createTenantUserSchema, req.body);

  // The tenant must exist before we attach a user to it.
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) {
    throw AppError.notFound('Tenant not found');
  }

  // Create the Auth user. We do NOT reuse a pre-existing account: a duplicate email is a
  // 409 so the admin can resolve the collision explicitly rather than silently re-homing
  // someone else's login under this tenant.
  let uid: string;
  try {
    const created = await adminAuth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.name,
    });
    uid = created.uid;
  } catch (err) {
    if (isEmailAlreadyExists(err)) {
      throw AppError.conflict('A user with this email already exists', 'email_exists');
    }
    throw err;
  }

  // Role + tenant live in the token's custom claims (authoritative for authorization).
  await setUserClaims(uid, { role: input.role, tenantId: input.tenantId });

  await prisma.user.create({
    data: {
      id: uid,
      role: input.role,
      tenantId: input.tenantId,
      name: input.name,
      email: input.email,
      createdAt: msBig(Date.now()),
    },
  });

  logger.info(
    { uid, tenantId: input.tenantId, role: input.role },
    'createTenantUser: provisioned tenant user',
  );

  // Never echo the password back.
  const body: CreateTenantUserResponse = { uid };
  res.status(201).json(body);
}
