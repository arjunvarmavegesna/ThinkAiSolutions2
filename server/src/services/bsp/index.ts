/**
 * BSP provider factory + public surface for the BSP layer.
 *
 * The rest of the server depends ONLY on the generic BspProvider interface returned by
 * getBspProvider(). metaCloud (direct Meta WhatsApp Cloud API) is the sole provider today;
 * adding a future backend is the single switch here.
 *
 * Usage:
 *   const provider = getBspProvider();
 *   const ctx = await resolveTenantBspContext(tenantId);
 *   await provider.sendTemplate(ctx, { ... });
 */

import { BSP_PROVIDERS } from '@thinkai/shared';
import type { BspProviderName } from '@thinkai/shared';

import { config } from '../../config/env';
import { logger } from '../../lib/logger';
import { MetaCloudProvider } from './metaCloud';
import type { BspProvider } from './BspProvider';

/** One cached instance per provider name (providers are stateless + safe to reuse). */
const instances = new Map<BspProviderName, BspProvider>();

/** Coerce the configured BSP_PROVIDER string into a known provider name (default 'metaCloud'). */
export function defaultProviderName(): BspProviderName {
  const configured = config.bsp.provider as BspProviderName;
  if ((BSP_PROVIDERS as readonly string[]).includes(configured)) return configured;
  logger.warn({ configured: config.bsp.provider }, 'Unknown BSP_PROVIDER; defaulting to metaCloud');
  return 'metaCloud';
}

function createProvider(name: BspProviderName): BspProvider {
  switch (name) {
    case 'metaCloud':
      return new MetaCloudProvider();
    default:
      logger.warn({ name }, 'Unknown BSP provider requested; defaulting to metaCloud');
      return new MetaCloudProvider();
  }
}

/**
 * Return the BspProvider for `name`. With no argument, returns the configured default
 * (`config.bsp.provider`), preserving the original global behavior. Pass a per-WABA
 * provider name (from resolveBspContext) to address that WABA's backend.
 */
export function getBspProvider(name?: BspProviderName): BspProvider {
  const resolved = name ?? defaultProviderName();
  let provider = instances.get(resolved);
  if (!provider) {
    provider = createProvider(resolved);
    instances.set(resolved, provider);
  }
  return provider;
}

// Re-export the context resolvers so callers import the whole BSP surface from one place.
export {
  resolveTenantBspContext,
  resolveBspContextByWaba,
  resolveWabaByPhoneNumberId,
  resolveWabaByProviderRef,
  resolveWabaByWabaId,
} from './resolveBspContext';
export type { ResolvedBsp } from './resolveBspContext';

// Re-export error types so higher layers can branch on BSP failures without deep imports.
export {
  BspError,
  BspAuthError,
  BspWindowClosedError,
  BspRateLimitError,
  mapBspError,
} from './errors';

export { MetaCloudProvider } from './metaCloud';
export type { BspProvider } from './BspProvider';
