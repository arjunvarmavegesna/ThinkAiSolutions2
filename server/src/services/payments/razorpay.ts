/**
 * Razorpay integration: create a payment order and verify webhook authenticity.
 *
 * We talk to Razorpay over its REST API with HTTP Basic auth (key_id:key_secret) using the
 * global fetch — no extra SDK type dependency. The secret never leaves the server.
 *
 * WEBHOOK SECURITY: Razorpay signs the raw request body with HMAC-SHA256 keyed by the
 * webhook secret and sends it in the `x-razorpay-signature` header. We recompute that HMAC
 * over the EXACT raw bytes (never the re-serialized JSON) and compare in constant time.
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { config } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

/** Build the HTTP Basic auth header from the configured key id + secret. */
function basicAuthHeader(): string {
  const token = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString(
    'base64',
  );
  return `Basic ${token}`;
}

/** Shape of the Razorpay order create response fields we rely on. */
interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Create a Razorpay order for the given amount (in paise). `receipt` is our own reference
 * (e.g. the wallet order doc id) and `notes` carry tenant/order metadata for reconciliation.
 * Returns the Razorpay order id used by Checkout on the client.
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ orderId: string }> {
  const { amountPaise, receipt, notes } = params;

  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    throw AppError.badRequest('Razorpay is not configured', 'razorpay_unconfigured');
  }

  let res: Response;
  try {
    res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise, // Razorpay amounts are in the smallest currency unit (paise).
        currency: 'INR',
        receipt,
        notes: notes ?? {},
      }),
    });
  } catch (err) {
    // Network/timeout failure reaching Razorpay — surface as a clean 400, never leak creds.
    logger.error({ err }, 'razorpay createOrder request failed');
    throw AppError.badRequest('Failed to reach payment gateway', 'razorpay_unreachable');
  }

  if (!res.ok) {
    // Log status only (the body may echo request data); do not expose gateway internals.
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      detail = '';
    }
    logger.error({ status: res.status, detail }, 'razorpay createOrder returned error');
    throw AppError.badRequest('Payment gateway rejected the order', 'razorpay_order_failed');
  }

  const order = (await res.json()) as RazorpayOrderResponse;
  return { orderId: order.id };
}

/**
 * Verify a Razorpay webhook signature.
 *
 * Computes HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) as lowercase hex and compares it to
 * the provided `x-razorpay-signature` header in constant time. The comparison is over the
 * RAW request bytes — callers MUST pass the unparsed Buffer captured by the raw body parser.
 */
export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = config.razorpay.webhookSecret;
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  // timingSafeEqual throws on length mismatch, so guard length first (also constant given
  // both are fixed-length hex digests of the same algorithm).
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
