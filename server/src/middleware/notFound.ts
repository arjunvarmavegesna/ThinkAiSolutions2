/**
 * Terminal 404 handler for unmatched routes. Mounted after all routers and before the
 * error handler. Returns the standard API error envelope.
 */

import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@thinkai/shared';

export const notFound = (req: Request, res: Response): void => {
  const body: ApiErrorBody = {
    error: { code: 'not_found', message: `Route not found: ${req.method} ${req.originalUrl}` },
  };
  res.status(404).json(body);
};
