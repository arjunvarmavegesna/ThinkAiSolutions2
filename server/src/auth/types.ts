/**
 * Auth context attached to each authenticated request.
 *
 * Populated by `verifyAuth` from the verified Firebase ID token's custom claims.
 * `tenantId` is null for reseller_admin (cross-tenant) and a concrete id for
 * tenant_admin / agent.
 */

import type { ApiScope, Role } from '@thinkai/shared';

export interface AuthContext {
  uid: string;
  role: Role;
  tenantId: string | null;
}

/**
 * Context attached by `verifyApiKey` when a request authenticates with a Developer Hub API key
 * (the client-facing /api/v1 surface) instead of a Firebase token. The middleware also mirrors
 * the Firebase path by setting `res.locals.tenantId`, so the reused tenant-scoped services work
 * unchanged.
 */
export interface ApiKeyContext {
  /** The key id (its SHA-256 hash). */
  id: string;
  tenantId: string;
  scopes: ApiScope[];
}

/**
 * Identity for an authenticated-but-possibly-UNPROVISIONED user (a brand-new signup that has
 * a valid Firebase token but no role claim yet). Populated by `verifyFirebaseUser` on the
 * self-serve provision route ONLY. `role`/`tenantId` are present iff already provisioned.
 */
export interface FirebaseUserContext {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: Role | null;
  tenantId: string | null;
}

// Augment Express's Request so handlers can read `req.auth` / `req.firebaseUser` with typing.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      firebaseUser?: FirebaseUserContext;
      apiKey?: ApiKeyContext;
    }
  }
}

// Ensure this file is treated as a module (the global augmentation above needs it).
export {};
