/**
 * Tenant self-serve onboarding (mounted at /api/onboarding).
 *
 * Lets a tenant_admin connect their OWN WhatsApp Business Account via Meta Embedded Signup
 * after self-serve signup — the tenant is taken STRICTLY from the caller's token (requireTenant
 * sets res.locals.tenantId), never from the request body. requireRole('tenant_admin') runs
 * BEFORE requireTenant so reseller_admin + agents are rejected at the role gate (admins use the
 * /api/admin/onboarding/* routes instead).
 *
 *   GET  /config        public Meta values to launch the ES popup
 *   POST /exchange      finish ES -> persist the WABA on the caller's tenant (no tenantId in body)
 *   GET  /waba-status   does the caller's tenant have a WABA yet?
 */

import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireRole, requireTenant } from '../middleware/guards';
import {
  exchangeEmbeddedSignupForTenant,
  getOnboardingConfig,
  getWabaStatus,
} from '../controllers/admin/onboardingController';

export const onboardingRouter = Router();

onboardingRouter.use(verifyAuth, requireRole('tenant_admin'), requireTenant);

onboardingRouter.get('/config', asyncHandler(getOnboardingConfig));
onboardingRouter.post('/exchange', asyncHandler(exchangeEmbeddedSignupForTenant));
onboardingRouter.get('/waba-status', asyncHandler(getWabaStatus));
