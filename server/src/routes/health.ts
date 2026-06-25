/**
 * Health/liveness endpoint. Mounted at both '/health' (Railway healthcheck) and
 * '/api/health'. Keep it dependency-free so it answers even if Firestore/BSP are down.
 */

import { Router, type Request, type Response } from 'express';

// Static version string; pulled from package.json at build time would add a JSON import
// dependency, so keep it simple and bump manually with releases.
const VERSION = '0.1.0';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    version: VERSION,
  });
});
