/**
 * API router aggregator. Mounts every feature router under '/api' (the parent mount in
 * app.ts). The imported routers are authored by other waves; the import paths + export
 * names here are the contract they fulfill.
 */

import { Router } from 'express';

import { authRouter } from './auth.routes';
import { onboardingRouter } from './onboarding.routes';
import { inboxRouter } from './inbox.routes';
import { walletRouter } from './wallet.routes';
import { subscriptionRouter } from './subscription.routes';
import { adminRouter } from './admin.routes';
import { dashboardRouter } from './dashboard.routes';
import { templatesRouter } from './templates.routes';
import { campaignsRouter } from './campaigns.routes';
import { reportsRouter } from './reports.routes';
import { qualityRouter } from './quality.routes';
import { contactSettingsRouter } from './contacts.routes';
import { developerRouter } from './developer.routes';
import { publicApiRouter } from './publicApi.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/onboarding', onboardingRouter);
apiRouter.use('/inbox', inboxRouter);
apiRouter.use('/wallet', walletRouter);
apiRouter.use('/subscription', subscriptionRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/templates', templatesRouter);
apiRouter.use('/campaigns', campaignsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/quality', qualityRouter);
apiRouter.use('/developer', developerRouter);
// Client-facing public API (API-key auth, not Firebase). Inherits the global /api no-store header.
apiRouter.use('/v1', publicApiRouter);
// /api/contacts itself is mounted in app.ts with a larger body limit (import chunks).
apiRouter.use('/contact-attributes', contactSettingsRouter);
