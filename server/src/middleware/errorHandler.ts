/**
 * Central Express error handler. Converts thrown errors into the standard API envelope
 * `{ error: { code, message } }`. Known AppErrors keep their code + statusCode; anything
 * else becomes a 500 'internal_error' with NO internal details leaked in production.
 */

import type { ErrorRequestHandler } from 'express';
import type { ApiErrorBody } from '@thinkai/shared';

import { AppError } from '../lib/AppError';
import { BspError } from '../services/bsp/errors';
import { config } from '../config/env';
import { logger } from '../lib/logger';

// 4-arg signature is what marks this as an Express error handler — keep all four params.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    // Operational errors are expected; log at warn without a stack flood.
    logger.warn({ code: err.code, statusCode: err.statusCode }, err.message);
    const body: ApiErrorBody = { error: { code: err.code, message: err.message } };
    res.status(err.statusCode).json(body);
    return;
  }

  // Provider (Meta Graph) failures: surface the cause instead of a blank 500. A Meta 4xx
  // usually means OUR request was bad (e.g. an invalid template payload) → pass that status
  // through so the tenant sees WHY and can fix it; auth (401/403) means our token is the
  // problem and rate-limit/5xx/unknown are upstream issues → report 502/429 accordingly.
  if (err instanceof BspError) {
    const upstream = err.status;
    const status =
      upstream === 429
        ? 429
        : upstream && upstream >= 400 && upstream < 500 && upstream !== 401 && upstream !== 403
          ? upstream
          : 502;
    logger.warn(
      { code: err.code, providerCode: err.providerCode, upstream },
      `Provider error: ${err.message}`,
    );
    const body: ApiErrorBody = { error: { code: err.code, message: err.message } };
    res.status(status).json(body);
    return;
  }

  // Unexpected error: log full detail server-side, return a generic message to clients.
  logger.error({ err }, 'Unhandled error');
  const message = config.isProd ? 'Internal server error' : String((err as Error)?.message ?? err);
  const body: ApiErrorBody = { error: { code: 'internal_error', message } };
  res.status(500).json(body);
};
