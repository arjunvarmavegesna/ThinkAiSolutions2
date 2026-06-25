/**
 * Reseller-admin API router (mounted at /api/admin).
 *
 * EVERY route here is reseller-admin-only: we apply verifyAuth + requireResellerAdmin at the
 * router level so no individual handler can be reached without a valid reseller-admin token.
 *
 *   GET  /tenants                          list all tenants
 *   POST /tenants                          create tenant (+ seed wallet at 0 paise)
 *   POST /users                            create a tenant_admin/agent user
 *   GET  /onboarding/config                public Meta values to launch Embedded Signup
 *   POST /onboarding/exchange              finish Embedded Signup (metaCloud) -> persist WABA
 *   POST /wabas                            connect a metaCloud WABA manually (e.g. test number)
 *   GET  /pricing/:tenantId                read charge + cost rates
 *   PUT  /pricing/:tenantId                set charge rates (+ optional cost rates)
 *   GET  /usage                            global usage / revenue / margin
 *   POST /tenants/:tenantId/templates/sync sync approved templates from the active provider
 */

import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireResellerAdmin } from '../middleware/guards';
import { syncTemplates } from '../services/templates/syncTemplates';
import { parseOrThrow, tenantIdParamSchema } from '../validation/adminSchemas';
import { createTenant, listTenants } from '../controllers/admin/tenantsController';
import { createTenantUser } from '../controllers/admin/usersController';
import { connectWaba } from '../controllers/admin/wabasController';
import {
  exchangeEmbeddedSignup,
  getOnboardingConfig,
} from '../controllers/admin/onboardingController';
import { getPricing, setPricing } from '../controllers/admin/pricingController';
import { getUsage } from '../controllers/admin/usageController';
import { applyMonthlyPayment, getSubscription } from '../services/subscription/subscriptionService';

export const adminRouter = Router();

// Gate the entire admin surface: authenticated AND reseller_admin.
adminRouter.use(verifyAuth, requireResellerAdmin);

// ---- Tenants ----
adminRouter.get('/tenants', asyncHandler(listTenants));
adminRouter.post('/tenants', asyncHandler(createTenant));

// ---- Tenant users ----
adminRouter.post('/users', asyncHandler(createTenantUser));

// ---- Embedded Signup onboarding (metaCloud, active path) ----
adminRouter.get('/onboarding/config', asyncHandler(getOnboardingConfig));
adminRouter.post('/onboarding/exchange', asyncHandler(exchangeEmbeddedSignup));

// ---- WABA connect (manual metaCloud fallback to Embedded Signup — e.g. the Meta test number) ----
adminRouter.post('/wabas', asyncHandler(connectWaba));

// ---- Pricing ----
adminRouter.get('/pricing/:tenantId', asyncHandler(getPricing));
adminRouter.put('/pricing/:tenantId', asyncHandler(setPricing));

// ---- Subscription (flat ₹2,500/month plan) ----
// View any tenant's subscription, and manually extend it by one month (for offline/bank
// payments) without going through Razorpay. Reseller-admin only (router-level gate above).
adminRouter.get(
  '/tenants/:tenantId/subscription',
  asyncHandler(async (req, res) => {
    const { tenantId } = parseOrThrow(tenantIdParamSchema, req.params);
    res.json(await getSubscription(tenantId));
  }),
);
adminRouter.post(
  '/tenants/:tenantId/subscription/extend',
  asyncHandler(async (req, res) => {
    const { tenantId } = parseOrThrow(tenantIdParamSchema, req.params);
    await applyMonthlyPayment(tenantId);
    res.json(await getSubscription(tenantId));
  }),
);

// ---- Usage ----
adminRouter.get('/usage', asyncHandler(getUsage));

// ---- Templates sync ----
adminRouter.post(
  '/tenants/:tenantId/templates/sync',
  asyncHandler(async (req, res) => {
    const { tenantId } = parseOrThrow(tenantIdParamSchema, req.params);
    const synced = await syncTemplates(tenantId);
    res.json({ synced });
  }),
);
