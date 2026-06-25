/**
 * Razorpay webhook (mounted at /api/webhooks/razorpay).
 *
 * SECURITY: this router is mounted with the raw-body parser BEFORE express.json(), so
 * `req.body` is the unmodified request Buffer. We verify the `x-razorpay-signature` header
 * by recomputing HMAC-SHA256 over those EXACT raw bytes (re-serialized JSON would not match).
 * An unverified request is rejected and never touches the wallet.
 *
 * SCOPE (Phase 1): we act on the `payment.captured` event ONLY. Any other event is
 * acknowledged with 200 and ignored, so Razorpay stops retrying it.
 *
 * IDEMPOTENCY: dedup key = razorpay_payment_id. We write a processedEvents marker and also
 * rely on the natural idempotency of creditRecharge (walletTransaction at a deterministic
 * doc id) and invoiceService.createForRecharge (invoice doc id = payment id). Redelivery of
 * the same captured payment therefore credits the wallet at most once.
 *
 * RECONCILIATION: we NEVER trust the amounts in the webhook payload. The tenant id and the
 * exact credit/GST split come from the walletOrders/{...} doc we persisted when the order was
 * created, looked up by the Razorpay order id carried in the payment.
 *
 * ACK FAST: Razorpay expects a quick 200. We return 200 on every handled (or safely ignored)
 * event; only signature failure / malformed body yields a non-2xx.
 */

import { Router } from 'express';

import type { WalletOrderStatus } from '@thinkai/shared';
import { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { asyncHandler } from '../../lib/asyncHandler';
import { logger } from '../../lib/logger';
import { rawBodyParser } from '../../middleware/rawBody';
import { verifyRazorpayWebhookSignature } from '../../services/payments/razorpay';
import { createForRecharge } from '../../services/invoices/invoiceService';
import { creditRecharge } from '../../services/wallet/walletService';

export const razorpayWebhookRouter = Router();

/** The only event we act on in Phase 1. */
const HANDLED_EVENT = 'payment.captured';

/** Minimal shape of the Razorpay webhook envelope we read (parse defensively). */
interface RazorpayPaymentEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  status?: string;
}
interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: {
      entity?: RazorpayPaymentEntity;
    };
  };
}

/** Find the walletOrder bound to a Razorpay order id (razorpayOrderId is a @unique column). */
async function findWalletOrder(
  razorpayOrderId: string,
): Promise<{ tenantId: string; id: string; creditPaise: number; gstPaise: number } | null> {
  const order = await prisma.walletOrder.findUnique({ where: { razorpayOrderId } });
  if (!order) return null;
  return {
    tenantId: order.tenantId,
    id: order.id,
    creditPaise: order.creditPaise,
    gstPaise: order.gstPaise,
  };
}

/** Best-effort status flip on the walletOrder row (does not affect the wallet credit). */
async function markOrderStatus(
  tenantId: string,
  id: string,
  status: WalletOrderStatus,
): Promise<void> {
  try {
    await prisma.walletOrder.update({ where: { tenantId_id: { tenantId, id } }, data: { status } });
  } catch (err) {
    // Non-fatal: the wallet credit already succeeded; the order status is cosmetic.
    logger.warn({ err, status }, 'razorpay webhook: failed to update walletOrder status');
  }
}

razorpayWebhookRouter.post(
  '/',
  rawBodyParser,
  asyncHandler(async (req, res) => {
    // req.body is a Buffer (raw parser). Verify the signature over the EXACT bytes.
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signature = req.header('x-razorpay-signature') ?? '';

    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      // Do not reveal whether the secret or the signature was wrong.
      logger.warn('razorpay webhook: signature verification failed');
      res.status(401).json({ error: { code: 'invalid_signature', message: 'Invalid signature' } });
      return;
    }

    // Parse the verified bytes. Malformed JSON after a valid signature is unexpected -> 400.
    let body: RazorpayWebhookBody;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as RazorpayWebhookBody;
    } catch {
      logger.warn('razorpay webhook: body is not valid JSON');
      res.status(400).json({ error: { code: 'bad_request', message: 'Malformed body' } });
      return;
    }

    // Phase 1 acts on payment.captured only; ack everything else so retries stop.
    if (body.event !== HANDLED_EVENT) {
      logger.info({ event: body.event }, 'razorpay webhook: ignored event');
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const payment = body.payload?.payment?.entity;
    const paymentId = payment?.id;
    const razorpayOrderId = payment?.order_id;

    // Without these ids we cannot reconcile; ack 200 so Razorpay does not hammer retries.
    if (!paymentId || !razorpayOrderId) {
      logger.warn({ paymentId, razorpayOrderId }, 'razorpay webhook: missing payment/order id');
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    // Fast dedup gate: a processedEvents marker keyed by the payment id. create() fails if it
    // already exists, so concurrent/redelivered captures short-circuit here. (creditRecharge
    // and invoice creation are independently idempotent too — this is just a cheap fast-path.)
    try {
      await prisma.processedEvent.create({
        data: {
          id: `razorpay_${paymentId}`,
          source: 'razorpay',
          key: paymentId,
          processedAt: msBig(Date.now()),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Already processed this payment — nothing more to do.
        logger.info({ paymentId }, 'razorpay webhook: duplicate payment.captured, skipping');
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
      throw err;
    }

    // Resolve tenant + authoritative amounts from OUR walletOrder doc, not the payload.
    const found = await findWalletOrder(razorpayOrderId);
    if (!found) {
      // Unknown order: log and ack 200 (retrying would never resolve it). The marker we wrote
      // prevents repeated work; reconciliation can be done manually from logs if needed.
      logger.error(
        { paymentId, razorpayOrderId },
        'razorpay webhook: no matching walletOrder for captured payment',
      );
      res.status(200).json({ received: true, unmatched: true });
      return;
    }

    const { tenantId, id: orderRowId, creditPaise, gstPaise } = found;

    // Credit the NET credit (GST was collected on top at checkout) — idempotent by payment id.
    const { balanceAfter } = await creditRecharge(tenantId, {
      paymentId,
      orderId: razorpayOrderId,
      creditPaise,
      gstPaise,
    });

    // Generate the GST invoice for this recharge — idempotent (invoice id = payment id).
    await createForRecharge(tenantId, {
      paymentId,
      orderId: razorpayOrderId,
      creditPaise,
      gstPaise,
    });

    // Mark the order paid (cosmetic; failure here does not undo the credit/invoice).
    await markOrderStatus(tenantId, orderRowId, 'paid');

    logger.info(
      { tenantId, paymentId, razorpayOrderId, creditPaise, balanceAfter },
      'razorpay webhook: wallet credited for captured payment',
    );

    res.status(200).json({ received: true });
  }),
);
