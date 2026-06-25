/**
 * Reseller-admin API surface. Thin typed wrappers over the shared apiClient so the
 * admin pages never hand-roll fetch calls or path strings. Every function here maps
 * 1:1 to a `/api/admin/...` route in the server contract and uses the shared DTOs.
 *
 * Tenant users never reach these endpoints — they are guarded server-side by
 * requireResellerAdmin. The client just renders what the API returns.
 */
import type {
  ConnectWabaRequest,
  ConnectWabaResponse,
  CreateTenantRequest,
  CreateTenantResponse,
  CreateTenantUserRequest,
  CreateTenantUserResponse,
  ExchangeSignupCodeRequest,
  ExchangeSignupCodeResponse,
  ListTenantsResponse,
  OnboardingConfigResponse,
  PricingResponse,
  SetPricingRequest,
  UsageResponse,
} from '@thinkai/shared';
import { apiClient } from '../lib/apiClient';

/** GET /api/admin/tenants — every tenant we resell to. */
export function listTenants(): Promise<ListTenantsResponse> {
  return apiClient.get<ListTenantsResponse>('/admin/tenants');
}

/** POST /api/admin/tenants — wizard step 1. Also seeds the wallet doc server-side. */
export function createTenant(req: CreateTenantRequest): Promise<CreateTenantResponse> {
  return apiClient.post<CreateTenantResponse>('/admin/tenants', req);
}

/** POST /api/admin/users — wizard step 2: the tenant-admin login for this client. */
export function createTenantUser(
  req: CreateTenantUserRequest,
): Promise<CreateTenantUserResponse> {
  return apiClient.post<CreateTenantUserResponse>('/admin/users', req);
}

/**
 * POST /api/admin/wabas — wizard step 3. The raw apikey is sent once, stored
 * server-side via the SecretStore, and never echoed back (write-only field).
 */
export function connectWaba(req: ConnectWabaRequest): Promise<ConnectWabaResponse> {
  return apiClient.post<ConnectWabaResponse>('/admin/wabas', req);
}

/** GET /api/admin/onboarding/config — public Meta values to launch the Embedded Signup popup. */
export function getOnboardingConfig(): Promise<OnboardingConfigResponse> {
  return apiClient.get<OnboardingConfigResponse>('/admin/onboarding/config');
}

/**
 * POST /api/admin/onboarding/exchange — finish Embedded Signup. The server exchanges the code,
 * subscribes our app, registers the number, and persists the WABA. No secret travels here.
 */
export function exchangeEmbeddedSignupCode(
  req: ExchangeSignupCodeRequest,
): Promise<ExchangeSignupCodeResponse> {
  return apiClient.post<ExchangeSignupCodeResponse>('/admin/onboarding/exchange', req);
}

/** GET /api/admin/pricing/:tenantId — current charge + cost rates (cost is reseller-only). */
export function getPricing(tenantId: string): Promise<PricingResponse> {
  return apiClient.get<PricingResponse>(`/admin/pricing/${encodeURIComponent(tenantId)}`);
}

/** PUT /api/admin/pricing/:tenantId — wizard step 4 and the standalone pricing editor. */
export function setPricing(
  tenantId: string,
  req: SetPricingRequest,
): Promise<PricingResponse> {
  return apiClient.put<PricingResponse>(
    `/admin/pricing/${encodeURIComponent(tenantId)}`,
    req,
  );
}

/** GET /api/admin/usage — global per-tenant message counts, revenue, cost, margin. */
export function getUsage(): Promise<UsageResponse> {
  return apiClient.get<UsageResponse>('/admin/usage');
}

/** POST /api/admin/tenants/:tenantId/templates/sync — pull approved templates from the BSP. */
export function syncTemplates(tenantId: string): Promise<{ synced: number }> {
  return apiClient.post<{ synced: number }>(
    `/admin/tenants/${encodeURIComponent(tenantId)}/templates/sync`,
  );
}
