/**
 * Tunables for client-facing webhook delivery (Developer Hub 2.5).
 *
 * Retry model: the FIRST attempt plus up to (WEBHOOK_MAX_ATTEMPTS - 1) retries. After a failed
 * attempt #N (1-based), the delivery is re-queued for `now + WEBHOOK_BACKOFF_MS[N-1]`; once all
 * attempts are spent the delivery is marked 'failed'. With 4 attempts that is 3 retries spaced
 * 30s → 2m → 10m after the initial try.
 */

/** Total POST attempts (1 initial + 3 retries). */
export const WEBHOOK_MAX_ATTEMPTS = 4;

/** Backoff before each retry, indexed by the just-failed attempt number minus one. */
export const WEBHOOK_BACKOFF_MS = [30_000, 120_000, 600_000];

/** Secret namespace under which per-tenant signing secrets are stored in the SecretStore. */
export const WEBHOOK_SECRET_NAMESPACE = 'webhook-signing';

/** Header carrying the HMAC-SHA256 signature of the POST body. */
export const WEBHOOK_SIGNATURE_HEADER = 'X-ThinkAi-Signature';

/** How many due deliveries the worker claims per poll tick. */
export const WEBHOOK_CLAIM_BATCH = 10;

/**
 * Worker poll interval. The poller is now the RETRY safety net, not the primary delivery path —
 * the Meta hot path fires an immediate delivery (see kickDelivery) on enqueue, so happy-path
 * latency no longer depends on this interval. Kept short (1s) so due retries fire promptly; the
 * claim query is a single indexed `status='queued' AND nextAttemptAt<=now` lookup, cheap to run.
 */
export const WEBHOOK_WORKER_INTERVAL_MS = 1000;
