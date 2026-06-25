/**
 * Permissive auth middleware for the SELF-SERVE PROVISION route ONLY.
 *
 * Unlike `verifyAuth` (which rejects any token lacking a role claim with 403 `no_role`), this
 * validates the Firebase ID token and exposes the user's identity WITHOUT requiring a role —
 * because a brand-new signup (email/password or Google) holds a valid token but has no claims
 * until provisioning runs. It sets `req.firebaseUser = { uid, email, emailVerified, role|null,
 * tenantId|null }`. `role`/`tenantId` are populated when the caller is already provisioned
 * (so the provision controller can return their existing tenant idempotently).
 *
 * SECURITY: mount this on exactly one route (`POST /api/auth/provision`). `verifyAuth` stays
 * strict everywhere else. checkRevoked=true so disabled/revoked sessions are still rejected.
 */

import type { NextFunction, Request, Response } from 'express';

import type { Role } from '@thinkai/shared';

import { adminAuth } from '../config/firebase';
import { AppError } from '../lib/AppError';
import type { FirebaseUserContext } from '../auth/types';

/** Extract a bearer token from the Authorization header, or null if absent/malformed. */
function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/** A valid role coming back from the token claims (defensive against stale/foreign tokens). */
function asRole(value: unknown): Role | null {
  return value === 'reseller_admin' || value === 'tenant_admin' || value === 'agent'
    ? value
    : null;
}

export async function verifyFirebaseUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw AppError.unauthorized('Missing or malformed Authorization header');
    }

    // checkRevoked=true so disabled/revoked sessions are rejected at the edge.
    const decoded = await adminAuth.verifyIdToken(token, true);

    const rawTenantId = decoded.tenantId;
    const firebaseUser: FirebaseUserContext = {
      uid: decoded.uid,
      email: typeof decoded.email === 'string' ? decoded.email : null,
      emailVerified: decoded.email_verified === true,
      role: asRole(decoded.role),
      tenantId:
        typeof rawTenantId === 'string' && rawTenantId.length > 0 ? rawTenantId : null,
    };
    req.firebaseUser = firebaseUser;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(AppError.unauthorized('Invalid or expired token'));
  }
}
