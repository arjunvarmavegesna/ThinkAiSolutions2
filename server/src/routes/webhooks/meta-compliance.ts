/**
 * Meta App Review compliance callbacks — Deauthorize + Data Deletion Request.
 *
 * Both are mounted (in app.ts) with rawBodyParser BEFORE express.json(), so on POST `req.body`
 * is the exact raw Buffer Meta delivered (form-urlencoded `signed_request=...`). Each verifies
 * the signed_request against META_APP_SECRET (parseSignedRequest) BEFORE trusting any field —
 * the same fail-closed, verify-at-the-edge contract as the WhatsApp webhook. No Graph/provider
 * calls happen here, so nothing belongs in BspProvider.
 *
 * NOTE on identity: both callbacks identify the person only by an app-scoped Facebook user_id,
 * which the platform does not currently map to a tenant/WABA. We verify + record + acknowledge;
 * WABA flagging and actual erasure are best-effort/manual until that mapping exists.
 *
 * - POST /api/webhooks/deauthorize : user removed the app. Verify -> record -> 200.
 * - POST /api/webhooks/data-deletion : Verify -> create a tracked deletion request ->
 *     return the Meta-required JSON { url, confirmation_code }.
 * - GET  /api/webhooks/data-deletion?id=<code> : the human-facing status page the returned
 *     `url` points to; renders the request's current status.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { asyncHandler } from '../../lib/asyncHandler';
import { logger } from '../../lib/logger';
import { config } from '../../config/env';
import { parseSignedRequest } from '../../lib/signedRequest';
import {
  createDeletionRequest,
  getDeletionStatus,
  recordDeauthorization,
} from '../../services/compliance/dataDeletion';

export const deauthorizeRouter = Router();
export const dataDeletionRouter = Router();

/** Read the raw Buffer body regardless of how the raw parser surfaced it. */
function rawBodyOf(req: Request): Buffer {
  return Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : '', 'utf8');
}

// ---------------------------------------------------------------------------
// Deauthorize: Meta calls this when a user removes the app.
// ---------------------------------------------------------------------------
deauthorizeRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseSignedRequest(rawBodyOf(req));
    if (!payload) {
      logger.warn('Meta deauthorize: signed_request verification failed, rejecting');
      res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid signed_request' } });
      return;
    }

    await recordDeauthorization({
      fbUserId: payload.user_id ?? null,
      issuedAt: typeof payload.issued_at === 'number' ? payload.issued_at : null,
    });

    // user_id is app-scoped and not mapped to a tenant/WABA today, so we cannot flag a specific
    // WABA as disabled — recorded for audit + manual follow-up.
    logger.info({ fbUserId: payload.user_id }, 'Meta deauthorize callback received');
    res.status(200).json({ received: true });
  }),
);

// ---------------------------------------------------------------------------
// Data Deletion Request: Meta's callback. Must return { url, confirmation_code }.
// ---------------------------------------------------------------------------
dataDeletionRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = parseSignedRequest(rawBodyOf(req));
    if (!payload) {
      logger.warn('Meta data-deletion: signed_request verification failed, rejecting');
      res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid signed_request' } });
      return;
    }

    const confirmationCode = await createDeletionRequest({
      fbUserId: payload.user_id ?? null,
      issuedAt: typeof payload.issued_at === 'number' ? payload.issued_at : null,
    });

    // Status page the user can visit to check progress (GET handler below).
    const url = `${config.publicBaseUrl}/api/webhooks/data-deletion?id=${encodeURIComponent(
      confirmationCode,
    )}`;

    logger.info(
      { fbUserId: payload.user_id, confirmationCode },
      'Meta data-deletion callback received; deletion request recorded',
    );
    res.status(200).json({ url, confirmation_code: confirmationCode });
  }),
);

/**
 * Human-facing status page. The `url` we return to Meta points here with ?id=<code>; a user
 * visiting it sees the current state of their deletion request.
 */
dataDeletionRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.query.id;
    const code = typeof id === 'string' ? id : Array.isArray(id) && typeof id[0] === 'string' ? id[0] : '';

    if (!code) {
      res.status(400).type('text/plain').send('Missing deletion request id.');
      return;
    }

    const record = await getDeletionStatus(code);
    if (!record) {
      res.status(404).type('text/plain').send('No data deletion request found for that code.');
      return;
    }

    // Minimal, dependency-free status page. The confirmation code is opaque/unguessable, so
    // exposing only the status for a supplied code does not leak cross-user data.
    res
      .status(200)
      .type('text/html')
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>Data Deletion Status</title></head>` +
          `<body style="font-family:system-ui,sans-serif;max-width:42rem;margin:3rem auto;padding:0 1rem">` +
          `<h1>Data Deletion Request</h1>` +
          `<p>Confirmation code: <code>${code}</code></p>` +
          `<p>Status: <strong>${record.status}</strong></p>` +
          `<p>We have received your request and are processing the deletion of your associated data.` +
          ` If you have questions, contact us at thinkaisolutions.com.</p>` +
          `</body></html>`,
      );
  }),
);
