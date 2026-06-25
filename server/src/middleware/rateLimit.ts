/**
 * Tiny in-memory, per-IP fixed-window rate limiter — guards the PUBLIC self-serve surface
 * (signup/provision) against scripted abuse. Deliberately dependency-free (no new tool): the
 * protected resource is tenant provisioning, and Firebase Auth already throttles raw account
 * creation, so a per-instance counter is sufficient.
 *
 * Caveat: state is per Cloud Run instance and resets on restart/scale-out. Good enough for
 * signup abuse; swap in a shared store (e.g. Firestore/Redis) if you ever need global limits.
 *
 * `app.set('trust proxy', true)` is set in app.ts, so `req.ip` is the real client IP behind
 * the Cloud Run / Firebase Hosting proxy.
 */

import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../lib/AppError';

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key within the window. */
  max: number;
  /** Machine-readable error code returned on limit (default 'rate_limited'). */
  code?: string;
  /** Human message returned on limit. */
  message?: string;
  /**
   * Derive the bucket key from the request. Defaults to the client IP — pass e.g.
   * `(req) => req.apiKey?.id ?? req.ip` to rate-limit the public API per API key instead.
   */
  keyFn?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Build an Express middleware enforcing `max` requests per `windowMs` per client IP.
 * Replies 429 (with a `Retry-After` header) via the central error handler once exceeded.
 */
export function rateLimit(opts: RateLimitOptions) {
  const { windowMs, max } = opts;
  const code = opts.code ?? 'rate_limited';
  const message = opts.message ?? 'Too many requests. Please wait and try again.';
  const keyFn = opts.keyFn ?? ((req: Request) => req.ip ?? 'unknown');

  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = keyFn(req) || 'unknown';

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      // New window for this IP. Opportunistically sweep one expired entry to bound memory.
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
      sweepExpired(buckets, now);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      next(new AppError(code, message, 429));
      return;
    }

    next();
  };
}

/** Drop a handful of expired buckets so the map can't grow without bound under churn. */
function sweepExpired(buckets: Map<string, Bucket>, now: number): void {
  let scanned = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    scanned += 1;
    if (scanned >= 100) break; // cap work per request — full cleanup happens across many calls
  }
}
