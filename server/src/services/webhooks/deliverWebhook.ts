/**
 * Perform ONE HTTP POST of a signed client-webhook payload, with a hard timeout so a slow or
 * hanging client endpoint can never tie up the delivery worker. Mirrors the AbortController
 * timeout pattern used by metaCloud.graphFetch.
 *
 * This is a pure transport helper: it never throws. It returns a structured result the worker
 * uses to decide deliver/retry/fail and to write the delivery log.
 */

import { logger } from '../../lib/logger';
import { WEBHOOK_SIGNATURE_HEADER } from './constants';

export interface DeliveryAttemptResult {
  /** True only on a 2xx response. */
  ok: boolean;
  /** HTTP status code, when we got a response. */
  statusCode?: number;
  /** Short, non-sensitive failure detail for the delivery log. */
  error?: string;
}

/** POST `body` to `url`, signed, with a timeout. Never throws — failures come back as a result. */
export async function postWebhook(params: {
  url: string;
  body: string;
  signature: string;
  timeoutMs: number;
}): Promise<DeliveryAttemptResult> {
  const { url, body, signature, timeoutMs } = params;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ThinkAiSolutions-Webhook/1',
        [WEBHOOK_SIGNATURE_HEADER]: signature,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    const detail = aborted ? `timeout after ${timeoutMs}ms` : 'network error';
    logger.warn({ url, aborted }, 'webhook delivery: request failed');
    return { ok: false, error: detail };
  } finally {
    clearTimeout(timer);
  }

  // Drain the body so the socket can be reused; we don't need the content.
  await res.text().catch(() => undefined);

  if (!res.ok) {
    return { ok: false, statusCode: res.status, error: `HTTP ${res.status}` };
  }
  return { ok: true, statusCode: res.status };
}
