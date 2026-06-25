/**
 * Wraps an async Express handler so any thrown error / rejected promise is forwarded to
 * Express's error middleware (next), instead of crashing the request. Use on every async
 * route handler.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
