/**
 * Custom-claims helper.
 *
 * Role + tenantId live in the Firebase ID token's custom claims so the API can authorize
 * every request without an extra Firestore read. reseller_admin is cross-tenant, so its
 * tenantId is always forced to null regardless of what the caller passes.
 */

import type { Role } from '@thinkai/shared';

import { adminAuth } from '../config/firebase';

export interface UserClaims {
  role: Role;
  tenantId: string | null;
}

/**
 * Set the role + tenantId custom claims on a Firebase Auth user.
 *
 * Invariant: a reseller_admin is never scoped to a tenant, so we null out tenantId for
 * that role even if a value was supplied. The user must refresh their ID token (or sign
 * in again) before the new claims take effect.
 */
export async function setUserClaims(
  uid: string,
  { role, tenantId }: UserClaims,
): Promise<void> {
  const resolvedTenantId = role === 'reseller_admin' ? null : tenantId;
  await adminAuth.setCustomUserClaims(uid, {
    role,
    tenantId: resolvedTenantId,
  });
}
