/**
 * Self-serve auth API. The only call here is provisioning: after the browser authenticates
 * with Firebase (email/password or Google), it posts the fresh token to the server to get a
 * tenant + tenant_admin claims. Identity comes from the verified token, so the body carries
 * at most a cosmetic display name.
 */
import type { ProvisionResponse } from '@thinkai/shared';

import { apiClient } from '../lib/apiClient';

/** POST /api/auth/register — provision (or idempotently return) the caller's own tenant. */
export function provision(name?: string): Promise<ProvisionResponse> {
  return apiClient.post<ProvisionResponse>('/auth/register', name ? { name } : {});
}
