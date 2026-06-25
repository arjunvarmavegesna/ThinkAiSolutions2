/**
 * Subscription routes (mounted at /api/subscription). All endpoints are tenant-scoped.
 *
 *   GET  /            -> GetSubscriptionResponse        (status + price split)
 *   POST /order       -> CreateSubscriptionOrderResponse (start a ₹2,950 monthly payment)
 *   GET  /invoices    -> ListInvoicesResponse            (GST invoice history, newest first)
 *
 * This replaced the wallet recharge flow. The fixed monthly price is ₹2,500 + 18% GST = ₹2,950;
 * paying it (verified by the Razorpay webhook) extends the tenant's access by one month. We never
 * trust a client-supplied amount — the order amount is the fixed server-side constant.
 */

import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import type {
  CreateSubscriptionOrderResponse,
  GetSubscriptionResponse,
  ListInvoicesResponse,
} from '@thinkai/shared';

import { config } from '../config/env';
import { prisma } from '../config/db';
import { msBig } from '../db/serde';
import { asyncHandler } from '../lib/asyncHandler';
import { logger } from '../lib/logger';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
import { createRazorpayOrder } from '../services/payments/razorpay';
import { listInvoices } from '../services/invoices/invoiceService';
import {
  getSubscription,
  SUBSCRIPTION_BASE_PAISE,
  SUBSCRIPTION_GST_PAISE,
  SUBSCRIPTION_TOTAL_PAISE,
} from '../services/subscription/subscriptionService';

export const subscriptionRouter = Router();

// Every subscription endpoint requires a verified user resolved to a concrete tenant.
subscriptionRouter.use(verifyAuth, requireTenant);

/** GET / — current subscription status + the fixed ₹2,500 + GST price split. */
subscriptionRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const tenantId = res.locals.tenantId as string;
    const body: GetSubscriptionResponse = await getSubscription(tenantId);
    res.json(body);
  }),
);

/**
 * POST /order — start one monthly renewal payment.
 *
 * Creates a Razorpay order for the FIXED gross total (₹2,500 + 18% GST) and persists a
 * walletOrders row binding the order to this tenant + the credit/GST split, so the webhook can
 * resolve everything from the order id alone (it never trusts the webhook payload amounts).
 */
subscriptionRouter.post(
  '/order',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;

    // Order id doubles as the Razorpay receipt reference.
    const receipt = randomUUID();

    const { orderId } = await createRazorpayOrder({
      amountPaise: SUBSCRIPTION_TOTAL_PAISE,
      receipt,
      notes: {
        tenantId,
        purpose: 'subscription',
        walletOrderRef: receipt,
        creditPaise: String(SUBSCRIPTION_BASE_PAISE),
        gstPaise: String(SUBSCRIPTION_GST_PAISE),
      },
    });

    // Bind the order; the webhook reads THIS row (by razorpayOrderId) for the authoritative amounts.
    await prisma.walletOrder.create({
      data: {
        tenantId,
        id: receipt,
        creditPaise: SUBSCRIPTION_BASE_PAISE,
        gstPaise: SUBSCRIPTION_GST_PAISE,
        totalPaise: SUBSCRIPTION_TOTAL_PAISE,
        razorpayOrderId: orderId,
        status: 'created',
        createdAt: msBig(Date.now()),
      },
    });

    logger.info({ tenantId, orderId, totalPaise: SUBSCRIPTION_TOTAL_PAISE }, 'subscription order created');

    const body: CreateSubscriptionOrderResponse = {
      orderId,
      amountPaise: SUBSCRIPTION_TOTAL_PAISE,
      currency: 'INR',
      keyId: config.razorpay.keyId,
      pricePaise: SUBSCRIPTION_BASE_PAISE,
      gstPaise: SUBSCRIPTION_GST_PAISE,
    };
    res.json(body);
  }),
);

/** GET /invoices — GST invoice history (the record of monthly subscription payments). */
subscriptionRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const body: ListInvoicesResponse = await listInvoices(tenantId, {
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json(body);
  }),
);
