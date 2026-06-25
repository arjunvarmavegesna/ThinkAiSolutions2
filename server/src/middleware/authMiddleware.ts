/**
 * Authentication middleware.
 *
 * Reads `Authorization: Bearer <idToken>`, verifies it with Firebase Admin (checking for
 * revocation), and populates `req.auth` from the token's custom claims. Any failure is a
 * 401 surfaced through the standard AppError envelope.
 */

import type { NextFunction, Request, Response } from 'express';

import type { Role } from '@thinkai/shared';

import { adminAuth } from '../config/firebase';
import { AppError } from '../lib/AppError';
import type { AuthContext } from '../auth/types';

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

export async function verifyAuth(
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

    const role = asRole(decoded.role);
    if (!role) {
      // A verified user without a usable role claim has not been provisioned yet.
      throw AppError.forbidden('User has no role assigned', 'no_role');
    }

    // tenantId claim may be missing/null (reseller_admin) — normalize to string | null.
    const rawTenantId = decoded.tenantId;
    const tenantId =
      typeof rawTenantId === 'string' && rawTenantId.length > 0 ? rawTenantId : null;

    const auth: AuthContext = { uid: decoded.uid, role, tenantId };
    req.auth = auth;
    next();
  } catch (err) {
    // Re-raise our own operational errors untouched; wrap everything else as 401.
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(AppError.unauthorized('Invalid or expired token'));
  }
}
