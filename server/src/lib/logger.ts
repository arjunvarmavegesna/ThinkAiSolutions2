/**
 * Application logger (pino). Level comes from config.logLevel.
 *
 * NEVER log secrets (apikeys, Razorpay keys, Firebase private key). BSP/secret modules
 * are responsible for redacting before they hand anything to this logger.
 */

import pino from 'pino';

import { config } from '../config/env';

export const logger = pino({
  level: config.logLevel,
  // Redact common secret-bearing fields defensively if they ever slip into a log object.
  redact: {
    paths: ['apikey', 'apiKey', 'authorization', 'password', 'privateKey', 'keySecret'],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
