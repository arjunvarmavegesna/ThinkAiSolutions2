/**
 * Tenant self-serve onboarding API (the /api/onboarding/* routes). Mirrors the admin
 * onboarding wrappers but the tenant is implicit from the caller's token — so the exchange
 * request omits tenantId.
 */
import type {
  ExchangeSignupCodeResponse,
  ExchangeSignupCodeTenantRequest,
  OnboardingConfigResponse,
  WabaStatusResponse,
} from '@thinkai/shared';

import { apiClient } from '../lib/apiClient';

/** GET /api/onboarding/config — public Meta values to launch the Embedded Signup popup. */
export function getTenantOnboardingConfig(): Promise<OnboardingConfigResponse> {
  return apiClient.get<OnboardingConfigResponse>('/onboarding/config');
}

/** POST /api/onboarding/exchange — finish Embedded Signup on the caller's own tenant. */
export function exchangeTenantSignupCode(
  req: ExchangeSignupCodeTenantRequest,
): Promise<ExchangeSignupCodeResponse> {
  return apiClient.post<ExchangeSignupCodeResponse>('/onboarding/exchange', req);
}

/** GET /api/onboarding/waba-status — does the caller's tenant have a WABA yet? */
export function getWabaStatus(): Promise<WabaStatusResponse> {
  return apiClient.get<WabaStatusResponse>('/onboarding/waba-status');
}
