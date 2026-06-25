/**
 * Wallet ledger. All balance mutations run inside a Postgres transaction that takes a
 * `SELECT … FOR UPDATE` row lock on the tenant's wallet row, so the balance read, the
 * new-balance write, and the walletTransaction write are atomic and serialized per wallet —
 * no double-spend, no lost updates under concurrency. (This replaces the Firestore
 * runTransaction; the invariants are identical.)
 *
 * IDEMPOTENCY: each walletTransaction is written at a deterministic primary key derived from
 * the natural key (messageId / paymentId). Inside the transaction we first read that txn
 * row; if it already exists the operation is a no-op that returns the recorded result.
 * This makes retries (webhook redelivery, message-send retries) safe.
 *
 * MONEY: integer paise only. TIME: epoch milliseconds captured with Date.now().
 */

import type { MessageCategory } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { debitTxnId, rechargeTxnId, refundTxnId } from './idempotency';

/**
 * Lock the tenant's wallet row and return its current balance (0 if the row does not exist
 * yet — provisioning creates it, but we stay defensive). Must be called inside a transaction;
 * the FOR UPDATE lock serializes concurrent mutations for this tenant until commit.
 */
async function lockBalance(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  tenantId: string,
): Promise<number> {
  const rows = await tx.$queryRaw<
    { balancePaise: number }[]
  >`SELECT "balancePaise" FROM wallets WHERE "tenantId" = ${tenantId} FOR UPDATE`;
  return rows.length > 0 ? rows[0].balancePaise : 0;
}

/** Read the current wallet balance; treats a missing wallet row as a 0 balance. */
export async function getBalance(tenantId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({ where: { tenantId } });
  return wallet?.balancePaise ?? 0;
}

/**
 * Debit the tenant wallet for one outbound billable message.
 *
 * - chargePaise <= 0 (e.g. 'service'): nothing to bill — return the current balance.
 * - Idempotent: if a debit txn for this messageId already exists, return its recorded
 *   balanceAfter without touching the balance again.
 * - Insufficient balance: throw 402 insufficient_funds (the caller must NOT send).
 * - Otherwise: decrement the balance and append a 'debit' walletTransaction (gstPaise = 0,
 *   ref = messageId) at the deterministic primary key.
 */
export async function debitForMessage(
  tenantId: string,
  params: { messageId: string; category: MessageCategory; chargePaise: number },
): Promise<{ balanceAfter: number }> {
  const { messageId, chargePaise } = params;
  const txnId = debitTxnId(messageId);

  return prisma.$transaction(async (tx) => {
    // Idempotency check first: a prior debit for this message is authoritative.
    const existingTxn = await tx.walletTransaction.findUnique({
      where: { tenantId_id: { tenantId, id: txnId } },
    });
    if (existingTxn) return { balanceAfter: existingTxn.balanceAfter };

    const currentBalance = await lockBalance(tx, tenantId);

    // Free messages never touch the ledger.
    if (chargePaise <= 0) return { balanceAfter: currentBalance };

    // Prepaid wallet: block the send when funds cannot cover the bare charge.
    if (currentBalance < chargePaise) {
      throw AppError.paymentRequired('Insufficient wallet balance', 'insufficient_funds');
    }

    const now = Date.now();
    const balanceAfter = currentBalance - chargePaise;

    // Atomically write the new balance and the immutable ledger row.
    await tx.wallet.upsert({
      where: { tenantId },
      update: { balancePaise: balanceAfter, updatedAt: msBig(now) },
      create: { tenantId, balancePaise: balanceAfter, updatedAt: msBig(now) },
    });
    await tx.walletTransaction.create({
      data: {
        tenantId,
        id: txnId,
        type: 'debit',
        amountPaise: chargePaise,
        gstPaise: 0,
        balanceAfter,
        ref: messageId,
        ts: msBig(now),
      },
    });

    return { balanceAfter };
  });
}

/**
 * Credit the tenant wallet for a captured Razorpay recharge.
 *
 * Idempotent by the recharge txn primary key (derived from the payment id) — webhook
 * redelivery of the same payment.captured event is a safe no-op. Increments the balance
 * by the NET credit (gstPaise is recorded for reporting but NOT added to the balance; the
 * GST was charged on top at checkout, see CONFIRMED BILLING RULES).
 */
export async function creditRecharge(
  tenantId: string,
  params: { paymentId: string; orderId: string; creditPaise: number; gstPaise: number },
): Promise<{ balanceAfter: number }> {
  const { paymentId, creditPaise, gstPaise } = params;
  const txnId = rechargeTxnId(paymentId);

  return prisma.$transaction(async (tx) => {
    const existingTxn = await tx.walletTransaction.findUnique({
      where: { tenantId_id: { tenantId, id: txnId } },
    });
    if (existingTxn) return { balanceAfter: existingTxn.balanceAfter };

    const currentBalance = await lockBalance(tx, tenantId);

    const now = Date.now();
    const balanceAfter = currentBalance + creditPaise;

    await tx.wallet.upsert({
      where: { tenantId },
      update: { balancePaise: balanceAfter, updatedAt: msBig(now) },
      create: { tenantId, balancePaise: balanceAfter, updatedAt: msBig(now) },
    });
    await tx.walletTransaction.create({
      data: {
        tenantId,
        id: txnId,
        type: 'recharge',
        // amountPaise = the NET credit (taxable base); gstPaise recorded alongside.
        amountPaise: creditPaise,
        gstPaise,
        balanceAfter,
        ref: paymentId,
        ts: msBig(now),
      },
    });

    return { balanceAfter };
  });
}

/**
 * Reverse a prior message debit (e.g. the BSP send failed after we debited). Credits back
 * exactly the amount of the original debit. Idempotent by the refund txn primary key, and a
 * no-op if no matching debit exists (nothing was charged, so there is nothing to refund).
 */
export async function refundDebit(
  tenantId: string,
  params: { messageId: string },
): Promise<void> {
  const { messageId } = params;
  const refundId = refundTxnId(messageId);
  const debitId = debitTxnId(messageId);

  await prisma.$transaction(async (tx) => {
    // Already refunded? Nothing to do.
    const existingRefund = await tx.walletTransaction.findUnique({
      where: { tenantId_id: { tenantId, id: refundId } },
    });
    if (existingRefund) return;

    // Only refund against a real prior debit; otherwise there is nothing to reverse.
    const debit = await tx.walletTransaction.findUnique({
      where: { tenantId_id: { tenantId, id: debitId } },
    });
    if (!debit) {
      logger.warn({ tenantId, messageId }, 'refundDebit: no matching debit, skipping');
      return;
    }
    const amountPaise = debit.amountPaise;
    if (amountPaise <= 0) return;

    const currentBalance = await lockBalance(tx, tenantId);

    const now = Date.now();
    const balanceAfter = currentBalance + amountPaise;

    await tx.wallet.upsert({
      where: { tenantId },
      update: { balancePaise: balanceAfter, updatedAt: msBig(now) },
      create: { tenantId, balancePaise: balanceAfter, updatedAt: msBig(now) },
    });
    await tx.walletTransaction.create({
      data: {
        tenantId,
        id: refundId,
        type: 'refund',
        amountPaise,
        gstPaise: 0,
        balanceAfter,
        ref: messageId,
        note: 'Auto-refund: message send failed',
        ts: msBig(now),
      },
    });
  });
}
