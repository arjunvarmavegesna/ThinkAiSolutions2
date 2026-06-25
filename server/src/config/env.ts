/**
 * Centralized, validated environment configuration.
 *
 * The whole app reads config ONLY from the frozen `config` object exported here.
 * Validation runs once at module load (boot). In production a missing REQUIRED var
 * throws and the process refuses to start; in development the same vars may be empty
 * and we emit a warning instead, so the app can still boot for local UI work.
 */

import { z } from 'zod';
import * as dotenv from 'dotenv';

import { META_GRAPH_VERSION } from '@thinkai/shared';

// Load .env as early as possible (no-op in production where vars come from Railway).
dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

/**
 * In production these secrets are required. In development we tolerate empties (so the
 * server boots without real credentials) and surface a single aggregated warning below.
 */
const requiredInProd = z.string().refine((v) => !isProd || v.trim().length > 0, {
  message: 'required in production',
});

/**
 * Meta sandbox flag. 'test' lets us run the full direct-Meta flow against Meta's TEST number
 * with only a fresh app's App id/secret + the test number's temporary token + a verify token —
 * the live-only credentials (System User token, Embedded Signup Config id) are treated as
 * OPTIONAL so the server boots without them. Defaults to 'live' in production, 'test' in dev.
 */
const metaMode: 'test' | 'live' =
  process.env.META_MODE === 'test' || process.env.META_MODE === 'live'
    ? process.env.META_MODE
    : isProd
      ? 'live'
      : 'test';

/**
 * Required in production ONLY when running in live mode. In test mode these stay optional, so a
 * pre-approval server (META_MODE=test, NODE_ENV=production) boots cleanly without them.
 */
const requiredInLiveProd = z.string().refine(
  (v) => !(isProd && metaMode === 'live') || v.trim().length > 0,
  { message: 'required in production when META_MODE=live' },
);

/**
 * Firebase private keys are commonly stored with literal "\n" escape sequences in env
 * managers. Convert those back into real newlines so the PEM parses.
 */
const normalizePrivateKey = (raw: string): string => raw.replace(/\\n/g, '\n');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.string().default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:8080'),

  // Postgres connection string (Prisma). Replaces Firestore as the database.
  DATABASE_URL: requiredInProd.default(''),

  // Firebase admin credentials.
  FIREBASE_PROJECT_ID: requiredInProd.default(''),
  FIREBASE_CLIENT_EMAIL: requiredInProd.default(''),
  FIREBASE_PRIVATE_KEY: requiredInProd.default(''),

  // Active WhatsApp provider. 'metaCloud' (direct Meta Cloud API) is the sole provider.
  BSP_PROVIDER: z.string().default('metaCloud'),
  // Per-request timeout (ms) for outbound Graph calls (metaCloud's graphFetch AbortController).
  BSP_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),

  // Meta WhatsApp Cloud API (direct Tech Provider) — the active messaging backend.
  // Sandbox flag: 'test' (Meta test number + temp token, pre-approval) | 'live' (System User).
  META_MODE: z.enum(['test', 'live']).default(metaMode),
  // App id — needed for Embedded Signup. Required in prod ONLY when live; optional in test mode
  // so a pre-approval, signup-only server boots before a Meta app exists.
  META_APP_ID: requiredInLiveProd.default(''),
  // App Secret — verifies the X-Hub-Signature-256 webhook HMAC. Required in prod ONLY when live;
  // in test mode the Meta webhook fail-closes (rejects) until it is set, so boot stays optional.
  META_APP_SECRET: requiredInLiveProd.default(''),
  // LIVE-ONLY: server-side Bearer for Graph calls once approved. Optional in test mode.
  META_SYSTEM_USER_TOKEN: requiredInLiveProd.default(''),
  // TEST-MODE Bearer: the Meta test number's temporary access token (rotates ~24h). Optional at
  // boot (a missing value only warns; metaCloud sends fail with a clear error until it is set).
  META_TEST_ACCESS_TOKEN: z.string().default(''),
  // LIVE-ONLY: Embedded Signup configuration id (needs App Review). Optional in test mode.
  META_CONFIG_ID: requiredInLiveProd.default(''),
  // Token echoed in the GET webhook handshake (hub.verify_token). Required in prod ONLY when
  // live; optional in test mode (no live webhook to verify until a real WABA is connected).
  META_WEBHOOK_VERIFY_TOKEN: requiredInLiveProd.default(''),
  // Graph API version. Empty/unset falls back to the single shared constant so server + client
  // never drift; set 'vNN.0' here only for a hotfix without a rebuild. NOTE: Zod's .default()
  // only fills `undefined`, so an explicit '' (as cloudrun.env.yaml carries) would otherwise slip
  // through — the client then hands version:'' to the FB SDK ("invalid version specified", no ES
  // popup) and server Graph URLs lose their version segment. Map empty/whitespace to the default.
  META_GRAPH_VERSION: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : META_GRAPH_VERSION)),

  // Self-serve signup: default per-category CHARGE rates (integer paise) auto-seeded onto a
  // new tenant's pricing/{tenantId} so they can send after a wallet recharge. SET NON-ZERO IN
  // PRODUCTION — zero would mean free messaging for self-serve tenants.
  SIGNUP_DEFAULT_MARKETING_PAISE: z.coerce.number().int().nonnegative().default(90),
  SIGNUP_DEFAULT_UTILITY_PAISE: z.coerce.number().int().nonnegative().default(35),
  SIGNUP_DEFAULT_AUTH_PAISE: z.coerce.number().int().nonnegative().default(35),

  // Client-facing webhook forwarding (Developer Hub 2.5): hard timeout (ms) for each POST to a
  // tenant's callback URL, so a slow/hanging client endpoint can't tie up the delivery worker.
  WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // Secret storage.
  SECRET_STORE_DRIVER: z.string().default('firestore'),
  SECRETS_ENCRYPTION_KEY: requiredInProd.default(''),

  // Razorpay.
  RAZORPAY_KEY_ID: requiredInProd.default(''),
  RAZORPAY_KEY_SECRET: requiredInProd.default(''),
  // Optional at boot — set after you create the Razorpay webhook; signature verification
  // fail-closes until then.
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),

  // GST invoicing (seller identity). Optional even in production.
  SELLER_GSTIN: z.string().optional(),
  SELLER_STATE: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Aggregate all field errors into a single readable message; do NOT print values.
  const issues = parsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const e = parsed.data;

/**
 * In development we allow empty secrets so the app can boot. Collect which groups are
 * unset and warn once (via console; the pino logger is not yet constructed here).
 */
if (!isProd) {
  const missing: string[] = [];
  if (!e.FIREBASE_PROJECT_ID || !e.FIREBASE_CLIENT_EMAIL || !e.FIREBASE_PRIVATE_KEY) {
    missing.push('firebase');
  }
  if (!e.SECRETS_ENCRYPTION_KEY) missing.push('secretsEncryptionKey');
  if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET || !e.RAZORPAY_WEBHOOK_SECRET) {
    missing.push('razorpay');
  }
  if (!e.META_APP_ID || !e.META_APP_SECRET || !e.META_WEBHOOK_VERIFY_TOKEN) {
    missing.push('meta(appId/appSecret/webhookVerifyToken)');
  }
  if (e.META_MODE === 'test' && !e.META_TEST_ACCESS_TOKEN) {
    missing.push('metaTestAccessToken (META_MODE=test)');
  }
  if (e.META_MODE === 'live' && (!e.META_SYSTEM_USER_TOKEN || !e.META_CONFIG_ID)) {
    missing.push('metaLive(systemUserToken/configId)');
  }
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config] Running in development with unset secrets: ${missing.join(
        ', ',
      )}. These are required in production.`,
    );
  }
}

/** The single, frozen configuration object the rest of the server reads. */
export const config = Object.freeze({
  port: e.PORT,
  nodeEnv: e.NODE_ENV,
  isProd,
  corsOrigin: e.CORS_ORIGIN,
  publicBaseUrl: e.PUBLIC_BASE_URL,
  databaseUrl: e.DATABASE_URL,
  firebase: Object.freeze({
    projectId: e.FIREBASE_PROJECT_ID,
    clientEmail: e.FIREBASE_CLIENT_EMAIL,
    privateKey: e.FIREBASE_PRIVATE_KEY ? normalizePrivateKey(e.FIREBASE_PRIVATE_KEY) : '',
  }),
  bsp: Object.freeze({
    provider: e.BSP_PROVIDER,
    httpTimeoutMs: e.BSP_HTTP_TIMEOUT_MS,
  }),
  meta: Object.freeze({
    mode: e.META_MODE,
    appId: e.META_APP_ID,
    appSecret: e.META_APP_SECRET,
    systemUserToken: e.META_SYSTEM_USER_TOKEN,
    testAccessToken: e.META_TEST_ACCESS_TOKEN,
    configId: e.META_CONFIG_ID,
    webhookVerifyToken: e.META_WEBHOOK_VERIFY_TOKEN,
    graphVersion: e.META_GRAPH_VERSION,
  }),
  signup: Object.freeze({
    defaultPricing: Object.freeze({
      marketingPaise: e.SIGNUP_DEFAULT_MARKETING_PAISE,
      utilityPaise: e.SIGNUP_DEFAULT_UTILITY_PAISE,
      authPaise: e.SIGNUP_DEFAULT_AUTH_PAISE,
    }),
  }),
  webhook: Object.freeze({
    deliveryTimeoutMs: e.WEBHOOK_DELIVERY_TIMEOUT_MS,
  }),
  secretStoreDriver: e.SECRET_STORE_DRIVER,
  secretsEncryptionKey: e.SECRETS_ENCRYPTION_KEY,
  razorpay: Object.freeze({
    keyId: e.RAZORPAY_KEY_ID,
    keySecret: e.RAZORPAY_KEY_SECRET,
    webhookSecret: e.RAZORPAY_WEBHOOK_SECRET,
  }),
  gst: Object.freeze({
    sellerGstin: e.SELLER_GSTIN,
    sellerStateCode: e.SELLER_STATE,
  }),
  logLevel: e.LOG_LEVEL,
});

export type AppConfig = typeof config;
