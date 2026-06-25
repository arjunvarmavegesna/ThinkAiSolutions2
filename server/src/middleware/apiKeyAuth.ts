/**
 * API-key authentication for the client-facing /api/v1 surface — the server-to-server parallel of
 * `verifyAuth`. Reads `Authorization: Bearer tai_…`, resolves the key to a tenant + scopes, and
 * sets BOTH `req.apiKey` and the same `res.locals.tenantId` the Firebase guards set, so the reused
 * tenant-scoped services work unchanged. `requireScope` then gates each endpoint.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ApiScope } from '@thinkai/shared';

import { AppError } from '../lib/AppError';
import type { ApiKeyContext } from '../auth/types';
import { resolveApiKey } from '../services/apiKeys/apiKeyService';

/** Extract a bearer token from the Authorization header, or null if absent/malformed. */
function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/** Authenticate the request with an API key; populate req.apiKey + res.locals.tenantId. */
export async function verifyApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw AppError.unauthorized('Missing or malformed Authorization header', 'invalid_api_key');
    }

    const resolved = await resolveApiKey(token);
    if (!resolved) {
      throw AppError.unauthorized('Invalid or revoked API key', 'invalid_api_key');
    }

    const ctx: ApiKeyContext = {
      id: resolved.id,
      tenantId: resolved.tenantId,
      scopes: resolved.scopes,
    };
    req.apiKey = ctx;
    res.locals.tenantId = resolved.tenantId;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(AppError.unauthorized('Invalid API key', 'invalid_api_key'));
  }
}

/** Require that the authenticated key carries `scope`; 403 'insufficient_scope' otherwise. */
export const requireScope =
  (scope: ApiScope): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const ctx = req.apiKey;
    if (!ctx) {
      next(AppError.unauthorized('API key required', 'invalid_api_key'));
      return;
    }
    if (!ctx.scopes.includes(scope)) {
      next(AppError.forbidden(`Missing required scope: ${scope}`, 'insufficient_scope'));
      return;
    }
    next();
  };
