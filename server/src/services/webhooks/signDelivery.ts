/**
 * Sign an outbound client-webhook POST so the receiving tenant can verify it came from us.
 *
 * Signature = 'sha256=' + HMAC-SHA256(signingSecret, EXACT json body bytes), hex-encoded — the
 * same construction Meta uses for X-Hub-Signature-256 and Razorpay for x-razorpay-signature, so
 * a client can verify it with any standard HMAC library over the raw request body.
 */

import { createHmac } from 'node:crypto';

export { WEBHOOK_SIGNATURE_HEADER } from './constants';

/** Compute the `sha256=<hex>` signature header value for a JSON body string. */
export function signWebhookBody(signingSecret: string, body: string): string {
  const digest = createHmac('sha256', signingSecret).update(body, 'utf8').digest('hex');
  return `sha256=${digest}`;
}
