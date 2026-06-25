/**
 * Wallet routes (mounted at /api/wallet). All endpoints are tenant-scoped, read-only.
 *
 *   GET  /balance        -> WalletBalanceResponse
 *   GET  /transactions   -> ListWalletTransactionsResponse (cursor-paginated)
 *
 * LEGACY: the per-message wallet was replaced by a flat ₹2,500/month subscription (see
 * /api/subscription). The wallet is no longer debited or recharged; these two read endpoints
 * remain only so any historical balance/ledger stays viewable. New payments go through
 * /api/subscription/order, and the GST record of each renewal is a /api/subscription/invoices row.
 */

import { Router } from 'express';

import type {
  ListWalletTransactionsResponse,
  WalletBalanceResponse,
  WalletTransactionDTO,
  WalletTxnType,
} from '@thinkai/shared';

import { prisma } from '../config/db';
import { msNum } from '../db/serde';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';
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

// All wallet endpoints require a verified user resolved to a concrete tenant.
walletRouter.use(verifyAuth, requireTenant);

/** GET /balance — current wallet balance in integer paise (0 if no wallet doc / legacy). */
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
 * GET /transactions — historical recharge/debit/refund ledger, newest first.
 *
 * Cursor is the opaque doc id of the last row returned; we resolve it back for `startAfter()`
 * so pagination is stable even when many rows share the same `ts`. No new rows are written now.
 */
walletRouter.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const tenantId = res.locals.tenantId as string;
    const limit = normalizeLimit(req.query.limit);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

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
    const body: ListWalletTransactionsResponse = nextCursor ? { items, nextCursor } : { items };
    res.json(body);
  }),
);
