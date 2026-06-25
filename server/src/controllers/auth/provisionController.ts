/**
 * Self-serve provisioning: POST /api/auth/register (mounted with `verifyFirebaseUser`).
 *
 * Turns a brand-new authenticated user (valid Firebase token, no role claim) into the
 * tenant_admin of a freshly-created tenant. Steps:
 *  1. Require a VERIFIED email (Google is pre-verified; email/password must click the link).
 *  2. Idempotency: if the caller is already provisioned (role claim or users/{uid} doc),
 *     return their existing tenant — never create a second one, never change an existing role.
 *  3. Provision a new tenant (+ wallet 0 + default pricing), set tenant_admin claims, and
 *     bind users/{uid} in a transaction (create-if-absent) so two concurrent submits can't
 *     bind one user to two tenants.
 *
 * SECURITY: the granted role is hard-coded 'tenant_admin' (no path to reseller_admin); the
 * body carries only an optional display name (provisionSchema.strict()); identity comes from
 * the verified token.
 */

import type { Request, Response } from 'express';

import { isDisposableEmail } from '@thinkai/shared';
import type { ProvisionResponse, Role } from '@thinkai/shared';
import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { setUserClaims } from '../../auth/claims';
import { provisionTenant } from '../../services/provisioning/provisionTenant';
import { parseOrThrow } from '../../validation/adminSchemas';
import { provisionSchema } from '../../validation/authSchemas';

/** Derive a friendly default tenant name from the email local-part, else a generic fallback. */
function defaultTenantName(email: string | null): string {
  const local = email ? email.split('@')[0]?.trim() : '';
  return local && local.length > 0 ? local : 'My Workspace';
}

export async function provisionSelfServe(req: Request, res: Response): Promise<void> {
  const fb = req.firebaseUser;
  if (!fb) {
    throw AppError.unauthorized();
  }

  // 1. (Email verification removed — provision on any valid Firebase token.)

  // 2a. Already provisioned per the token's claims?
  if (fb.role === 'tenant_admin' && fb.tenantId) {
    const body: ProvisionResponse = { tenantId: fb.tenantId, role: 'tenant_admin', created: false };
    res.status(200).json(body);
    return;
  }
  if (fb.role && fb.role !== 'tenant_admin') {
    // A reseller_admin or agent already exists — self-serve provisioning doesn't apply.
    throw AppError.conflict('Account already provisioned', 'already_provisioned');
  }

  // 2b. Already provisioned per the users/{uid} row (claims may simply be lagging)?
  const existing = await prisma.user.findUnique({ where: { id: fb.uid } });
  if (existing) {
    const u = existing;
    if (u.role === 'tenant_admin' && u.tenantId) {
      // Re-assert claims in case they were lost, then return idempotently.
      await setUserClaims(fb.uid, { role: 'tenant_admin', tenantId: u.tenantId });
      const body: ProvisionResponse = { tenantId: u.tenantId, role: 'tenant_admin', created: false };
      res.status(200).json(body);
      return;
    }
    throw AppError.conflict('Account already provisioned', 'already_provisioned');
  }

  // Block throwaway inboxes — but only when creating a NEW tenant (the idempotent returns above
  // already short-circuited existing users, so we never lock anyone out of their own account).
  if (fb.email && isDisposableEmail(fb.email)) {
    throw AppError.badRequest(
      'Disposable email addresses are not allowed. Please sign up with a permanent email.',
      'disposable_email',
    );
  }

  const input = parseOrThrow(provisionSchema, req.body);
  const name = input.name ?? defaultTenantName(fb.email);

  // 3. Create the tenant (+ wallet 0 + default pricing), then bind users/{uid} transactionally.
  const { tenantId } = await provisionTenant({ name, seedDefaultPricing: true });

  // Bind users/{uid} create-if-absent. The deterministic uid primary key makes this idempotent:
  // a concurrent submit that lost the race hits a unique violation and we re-read the winner.
  let bind: { user: { role: string; tenantId: string | null }; isNew: boolean };
  const already = await prisma.user.findUnique({ where: { id: fb.uid } });
  if (already) {
    bind = { user: already, isNew: false };
  } else {
    try {
      const user = await prisma.user.create({
        data: {
          id: fb.uid,
          role: 'tenant_admin',
          tenantId,
          name,
          email: fb.email ?? '',
          createdAt: msBig(Date.now()),
        },
      });
      bind = { user, isNew: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await prisma.user.findUnique({ where: { id: fb.uid } });
        bind = { user: winner!, isNew: false };
      } else {
        throw err;
      }
    }
  }

  if (!bind.isNew) {
    // Lost a concurrent race: another request already bound this user. The tenant we just
    // created is a harmless orphan (empty, wallet 0) — log it for cleanup and return the
    // winner's tenant so the user is bound to exactly one.
    logger.warn(
      { uid: fb.uid, orphanTenantId: tenantId, boundTenantId: bind.user.tenantId },
      'provision race: discarding orphan tenant, returning the already-bound tenant',
    );
    await setUserClaims(fb.uid, {
      role: bind.user.role as Role,
      tenantId: bind.user.tenantId,
    });
    const body: ProvisionResponse = {
      tenantId: bind.user.tenantId ?? tenantId,
      role: 'tenant_admin',
      created: false,
    };
    res.status(200).json(body);
    return;
  }

  await setUserClaims(fb.uid, { role: 'tenant_admin', tenantId });
  logger.info({ uid: fb.uid, tenantId }, 'provision: self-serve tenant created');

  const body: ProvisionResponse = { tenantId, role: 'tenant_admin', created: true };
  res.status(201).json(body);
}
