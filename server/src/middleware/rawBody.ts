/**
 * Raw-body parser for webhook routes. Webhook authenticity (Razorpay HMAC signature,
 * Meta X-Hub-Signature-256) must be verified against the EXACT bytes received, so these
 * routes must be mounted with this parser BEFORE express.json() runs. After this runs,
 * `req.body` is a Buffer.
 */

import express from 'express';

export const rawBodyParser = express.raw({ type: '*/*' });
