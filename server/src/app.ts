/**
 * Express application factory.
 *
 * Middleware ORDER matters:
 *  1. helmet (security headers) + cors.
 *  2. Webhook routers mounted with the RAW body parser BEFORE express.json(), so webhook
 *     signature/header verification sees the exact received bytes (req.body is a Buffer).
 *  3. express.json() for the rest of the API.
 *  4. pino-http request logging.
 *  5. health + api routers.
 *  6. notFound, then the error handler (last).
 */

import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';

import { config } from './config/env';
import { logger } from './lib/logger';
import { rawBodyParser } from './middleware/rawBody';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { healthRouter } from './routes/health';
import { apiRouter } from './routes/index';
import { mediaRouter } from './routes/media.routes';
import { contactsRouter } from './routes/contacts.routes';
import { metaWebhookRouter } from './routes/webhooks/meta';
import { razorpayWebhookRouter } from './routes/webhooks/razorpay';
import { deauthorizeRouter, dataDeletionRouter } from './routes/webhooks/meta-compliance';

export function createApp(): Express {
  const app = express();

  // Behind Railway's proxy — trust it so req.ip / protocol reflect the client.
  app.set('trust proxy', true);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));

  // API responses are authenticated + per-tenant — never let Firebase Hosting's CDN cache
  // them (a cached 404/200 keyed by accept-encoding would be served to the wrong user/state).
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // --- Webhooks FIRST, with raw body, before express.json() ---
  // These routers verify authenticity against the raw bytes, so JSON parsing must NOT
  // have consumed the stream yet. Meta (HMAC + hub.challenge) is the WhatsApp path;
  // Razorpay (HMAC) is the payments path.
  app.use('/api/webhooks/meta', rawBodyParser, metaWebhookRouter);
  app.use('/api/webhooks/razorpay', rawBodyParser, razorpayWebhookRouter);

  // Meta App Review compliance callbacks. signed_request (NOT X-Hub-Signature-256) verified
  // against META_APP_SECRET inside each router, so they also need the raw bytes before json().
  app.use('/api/webhooks/deauthorize', rawBodyParser, deauthorizeRouter);
  app.use('/api/webhooks/data-deletion', rawBodyParser, dataDeletionRouter);

  // Media uploads arrive as base64 JSON, so this router needs a larger body limit than the
  // rest of the API. Mounted BEFORE the default express.json() — body-parser marks the body as
  // read, so the default parser below no-ops for these requests. (The router still enforces
  // verifyAuth + requireTenant internally.)
  app.use('/api/media', express.json({ limit: '20mb' }), mediaRouter);

  // Contact import arrives as chunked JSON rows (~1k/request), larger than the default API body.
  // Mounted BEFORE the default express.json() (and before the '/api' aggregator) so this limit
  // wins for contacts requests. The router still enforces verifyAuth + requireTenant internally.
  app.use('/api/contacts', express.json({ limit: '10mb' }), contactsRouter);

  // --- Normal JSON API from here on ---
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  // Health is reachable both bare (Railway healthcheck) and under /api.
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);

  app.use('/api', apiRouter);

  // 404 for anything unmatched, then the central error handler (must be last).
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
