/**
 * Wallet routes (mounted at /api/wallet). All endpoints are tenant-scoped.
 *
 *   GET  /balance        -> WalletBalanceResponse
 *   GET  /transactions   -> ListWalletTransactionsResponse (cursor-paginated)
 *   POST /recharge/order -> CreateRechargeOrderResponse
 *
 * Tenant resolution: `requireTenant` puts the resolved tenant id on `res.locals.tenantId`
 * (tenant_admin/agent use their token tenant; a reseller_admin may target a tenant via
 * ?tenantId). Tenant users NEVER pass their own tenantId in the body.
 *
 * RECHARGE FLOW (Phase 1): the client asks to credit `creditPaise` (the taxable base). We
 * add 18% GST on top, create a Razorpay order for the GROSS total (credit + GST), and persist
 * a walletOrders/{orderId} doc binding that order to this tenant + the exact amounts. The
 * wallet is only credited later, by the verified payment.captured webhook — never here.
 */

import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import type {
  CreateRechargeOrderRequest,
  CreateRechargeOrderResponse,
  ListWalletTransactionsResponse,
  WalletBalanceResponse,
  WalletTransactionDTO,
  WalletTxnType,
} from '@thinkai/shared';

import { config } from '../config/env';
import { prisma } from '../config/db';
import { msBig, msNum } from '../db/serde';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../lib/asyncHandler';
import { logger } from '../lib/logger';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
import { computeRechargeBreakdown } from '../services/wallet/billing';
import { createRazorpayOrder } from '../services/payments/razorpay';
import { getBalance } from '../services/wallet/walletService';

export const walletRouter = Router();

/** Default + max page sizes for the transaction history list. */
const DEFAULT_TXN_LIMIT = 30;
const MAX_TXN_LIMIT = 100;

/** Clamp a caller-supplied limit into [1, MAX_TXN_LIMIT]; fall back to the default. */
function normalizeLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return DEFAULT_TXN_LIMIT;
  const floored = Math.floor(n);
  if (floored < 1) return DEFAULT_TXN_LIMIT;
  return Math.min(floored, MAX_TXN_LIMIT);
}

/** Minimum recharge: ₹1 (Razorpay rejects sub-rupee orders and 0 is meaningless). */
const MIN_CREDIT_PAISE = 100;
/** Sanity ceiling so a malformed request cannot create an absurd order. */
const MAX_CREDIT_PAISE = 100_000_000; // ₹10,00,000

// All wallet endpoints require a verified user resolved to a concrete tenant.
walletRouter.use(verifyAuth, requireTenant);

/** GET /balance — current wallet balance in integer paise (0 if no wallet doc yet). */
walletRouter.get(
  '/balance',
  asyncHandler(async (_req, res) => {
    const tenantId = res.locals.tenantId as string;
    const balancePaise = await getBalance(tenantId);
    const body: WalletBalanceResponse = { balancePaise };
    res.json(body);
  }),
);

/**
 * GET /transactions — recharge/debit/refund ledger, newest first.
 *
 * Cursor is the opaque doc id of the last row returned; we resolve it back to a snapshot
 * for `startAfter()` so pagination is stable even when many rows share the same `ts`.
 */
walletRouter.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const limit = normalizeLimit(req.query.limit);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    // Keyset pagination on (ts desc, id) — the opaque cursor is the last row id.
    const rows = await prisma.walletTransaction.findMany({
      where: { tenantId },
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { tenantId_id: { tenantId, id: cursor } }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    const items: WalletTransactionDTO[] = page.map((r) => ({
      id: r.id,
      type: r.type as WalletTxnType,
      amountPaise: r.amountPaise,
      gstPaise: r.gstPaise,
      balanceAfter: r.balanceAfter,
      ref: r.ref,
      ...(r.note ? { note: r.note } : {}),
      ts: msNum(r.ts) as number,
    }));

    const nextCursor = hasMore ? page[page.length - 1].id : undefined;
    const body: ListWalletTransactionsResponse = nextCursor
      ? { items, nextCursor }
      : { items };
    res.json(body);
  }),
);

/**
 * POST /recharge/order — start a wallet recharge.
 *
 * Steps:
 *  1. Validate the requested credit (integer paise within sane bounds).
 *  2. Compute the GST breakdown: client pays credit + 18% GST; wallet later gets the NET credit.
 *  3. Create a Razorpay order for the GROSS total.
 *  4. Persist walletOrders/{orderId} binding the order to this tenant + the exact amounts, so
 *     the webhook can resolve tenant + amounts from the order id alone (never trusting the
 *     amounts in the webhook payload).
 *  5. Return the order id, gross amount, public key id, and the credit/GST split for the UI.
 */
walletRouter.post(
  '/recharge/order',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const reqBody = req.body as Partial<CreateRechargeOrderRequest>;
    const creditPaise = reqBody.creditPaise;

    // Money must be a positive integer number of paise within bounds.
    if (
      typeof creditPaise !== 'number' ||
      !Number.isInteger(creditPaise) ||
      creditPaise < MIN_CREDIT_PAISE ||
      creditPaise > MAX_CREDIT_PAISE
    ) {
      throw AppError.badRequest(
        'creditPaise must be an integer number of paise within the allowed range',
        'invalid_amount',
      );
    }

    // GST is added ON TOP of the credit; the wallet later receives the NET credit only.
    const breakdown = computeRechargeBreakdown(creditPaise);

    // Pre-allocate the wallet order id; it doubles as the Razorpay receipt reference.
    const receipt = randomUUID();

    // Create the gateway order for the GROSS total (paise). notes aid reconciliation.
    const { orderId } = await createRazorpayOrder({
      amountPaise: breakdown.totalPaise,
      receipt,
      notes: {
        tenantId,
        walletOrderRef: receipt,
        creditPaise: String(breakdown.creditPaise),
        gstPaise: String(breakdown.gstPaise),
      },
    });

    // Bind the order to this tenant + amounts. The webhook reads THIS row (by razorpayOrderId)
    // for the authoritative credit/GST — payload amounts are never trusted.
    await prisma.walletOrder.create({
      data: {
        tenantId,
        id: receipt,
        creditPaise: breakdown.creditPaise,
        gstPaise: breakdown.gstPaise,
        totalPaise: breakdown.totalPaise,
        razorpayOrderId: orderId,
        status: 'created',
        createdAt: msBig(Date.now()),
      },
    });

    logger.info(
      { tenantId, orderId, walletOrderRef: receipt, totalPaise: breakdown.totalPaise },
      'wallet recharge order created',
    );

    const body: CreateRechargeOrderResponse = {
      orderId,
      amountPaise: breakdown.totalPaise,
      currency: 'INR',
      keyId: config.razorpay.keyId,
      creditPaise: breakdown.creditPaise,
      gstPaise: breakdown.gstPaise,
    };
    res.json(body);
  }),
);
