/**
 * Facebook `signed_request` parsing + verification.
 *
 * Meta's app lifecycle callbacks — Deauthorize and Data Deletion Request — do NOT use the
 * X-Hub-Signature-256 header that the WhatsApp webhook (`/api/webhooks/meta`) uses. Instead
 * the body arrives form-urlencoded as `signed_request=<encodedSig>.<encodedPayload>`, where:
 *   - `encodedPayload` is base64url(JSON.stringify(payload))
 *   - `encodedSig`     is base64url(HMAC-SHA256(encodedPayload, META_APP_SECRET))   <-- raw bytes
 * i.e. the signature is computed over the ENCODED payload STRING exactly as received, not over
 * the decoded JSON. We recompute it and constant-time compare BEFORE trusting any field.
 *
 * Fail-closed: any missing secret / malformed input / signature mismatch / wrong algorithm
 * returns null, and the caller must reject. This mirrors verifyMetaSignature in the webhook
 * route — verification lives at the edge, never in BspProvider (no Graph calls happen here).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { config } from '../config/env';
import { logger } from './logger';

/** Decoded Facebook signed_request payload (only the fields we rely on are typed). */
export interface SignedRequestPayload {
  algorithm: string;
  issued_at?: number;
  /** App-scoped Facebook user id of the person who triggered the callback. */
  user_id?: string;
  [key: string]: unknown;
}

/**
 * Pull the `signed_request` value out of a form-urlencoded raw body Buffer.
 * The compliance routes are mounted with rawBodyParser (express.raw), so `req.body` is the
 * exact bytes — we parse the urlencoded form ourselves rather than adding a body parser.
 */
export function extractSignedRequest(rawBody: Buffer): string | null {
  const text = rawBody.toString('utf8');
  const value = new URLSearchParams(text).get('signed_request');
  return value && value.length > 0 ? value : null;
}

/**
 * Verify + decode a signed_request string. Returns the payload on success, null on any failure
 * (missing app secret, bad shape, algorithm other than HMAC-SHA256, or signature mismatch).
 */
export function verifySignedRequest(signedRequest: string): SignedRequestPayload | null {
  const secret = config.meta.appSecret;
  if (!secret) {
    logger.error('Meta App Secret is not configured; rejecting signed_request callback');
    return null;
  }

  const dot = signedRequest.indexOf('.');
  if (dot <= 0 || dot === signedRequest.length - 1) return null;

  const encodedSig = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);

  // Recompute the expected signature over the ENCODED payload string (raw HMAC bytes).
  const expected = createHmac('sha256', secret).update(encodedPayload).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(encodedSig, 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // Meta only signs with HMAC-SHA256; reject anything else even if the bytes matched.
  if (typeof payload.algorithm !== 'string' || payload.algorithm.toUpperCase() !== 'HMAC-SHA256') {
    return null;
  }

  return payload;
}

/** Convenience: extract from a raw body then verify. Returns null on any failure. */
export function parseSignedRequest(rawBody: Buffer): SignedRequestPayload | null {
  const sr = extractSignedRequest(rawBody);
  if (!sr) return null;
  return verifySignedRequest(sr);
}
