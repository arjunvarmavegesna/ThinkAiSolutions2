/**
 * Authorization guards. All assume `verifyAuth` ran first and set `req.auth`.
 *
 * - requireRole(...roles): allow only the listed roles (403 otherwise).
 * - requireResellerAdmin: shorthand for the reseller-admin-only endpoints.
 * - requireTenant: resolve a concrete tenant id for tenant-scoped routes and expose it as
 *   `res.locals.tenantId`. tenant_admin/agent always use their own token tenantId; a
 *   reseller_admin may target any tenant via an explicit `:tenantId` param or query.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { Role } from '@thinkai/shared';

import { AppError } from '../lib/AppError';

/** Allow only requests whose authenticated role is in `roles`. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(auth.role)) {
      next(AppError.forbidden('Insufficient role'));
      return;
    }
    next();
  };

/** Reseller-admin-only endpoints (tenant management, pricing, global usage). */
export const requireResellerAdmin: RequestHandler = requireRole('reseller_admin');

/** Read an explicit tenantId from the route params or query string (reseller-admin path). */
function explicitTenantId(req: Request): string | null {
  const fromParams = req.params?.tenantId;
  if (typeof fromParams === 'string' && fromParams.length > 0) return fromParams;
  const fromQuery = req.query?.tenantId;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
  return null;
}

/**
 * Ensure a tenant id is resolved for tenant-scoped routes and place it on
 * `res.locals.tenantId` for handlers.
 *
 * - tenant_admin / agent: use their token tenantId; 403 if (impossibly) unscoped.
 * - reseller_admin: must name a tenant explicitly via `:tenantId` param or `?tenantId`.
 */
export const requireTenant: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const auth = req.auth;
  if (!auth) {
    next(AppError.unauthorized());
    return;
  }

  if (auth.role === 'reseller_admin') {
    const tenantId = explicitTenantId(req);
    if (!tenantId) {
      next(AppError.badRequest('A tenantId is required for this request', 'tenant_required'));
      return;
    }
    res.locals.tenantId = tenantId;
    next();
    return;
  }

  // tenant_admin / agent are strictly scoped to their own tenant from the token.
  if (!auth.tenantId) {
    next(AppError.forbidden('No tenant is associated with this account'));
    return;
  }
  res.locals.tenantId = auth.tenantId;
  next();
};
