/**
 * Typed wrappers for the Developer Hub webhook endpoints (/api/developer/*). Mirrors the other
 * feature api modules: thin functions over apiClient, all types from @thinkai/shared.
 */
import type {
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  GetWebhookConfigResponse,
  ListApiKeysResponse,
  ListWebhookDeliveriesResponse,
  RotateWebhookSecretResponse,
  UpdateWebhookConfigRequest,
  UpdateWebhookConfigResponse,
} from '@thinkai/shared';

import { apiClient } from '../../lib/apiClient';

/** GET current webhook config (no secret; null until configured). */
export function getWebhookConfig(): Promise<GetWebhookConfigResponse> {
  return apiClient.get<GetWebhookConfigResponse>('/developer/webhook');
}

/** PUT the callback URL + subscribed event types + enabled flag. */
export function updateWebhookConfig(
  body: UpdateWebhookConfigRequest,
): Promise<UpdateWebhookConfigResponse> {
  return apiClient.put<UpdateWebhookConfigResponse>('/developer/webhook', body);
}

/** POST to (re)generate the signing secret — the full secret comes back exactly once. */
export function rotateWebhookSecret(): Promise<RotateWebhookSecretResponse> {
  return apiClient.post<RotateWebhookSecretResponse>('/developer/webhook/secret');
}

/** GET the recent delivery log (cursor-paginated, newest first). */
export function listWebhookDeliveries(cursor?: string): Promise<ListWebhookDeliveriesResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiClient.get<ListWebhookDeliveriesResponse>(`/developer/webhook/deliveries${query}`);
}

// ---- API keys ----

/** GET the tenant's API keys (masked). */
export function listApiKeys(): Promise<ListApiKeysResponse> {
  return apiClient.get<ListApiKeysResponse>('/developer/api-keys');
}

/** POST to create a key — the full secret comes back exactly once. */
export function createApiKey(body: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return apiClient.post<CreateApiKeyResponse>('/developer/api-keys', body);
}

/** DELETE to revoke a key by id. */
export function revokeApiKey(id: string): Promise<void> {
  return apiClient.del<void>(`/developer/api-keys/${encodeURIComponent(id)}`);
}
