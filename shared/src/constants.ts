/**
 * Cross-package constants and money/GST helpers.
 *
 * MONEY RULE: every amount is an INTEGER number of paise. Never use floats for money.
 * GST RULE (Phase 1, confirmed): 18% GST is charged ONCE, at recharge, ON TOP of the
 * credit amount. Per-message wallet debits are the bare tenant rate with NO GST.
 * See gstOnPaise() — it is only used on the recharge path.
 *
 * TIME RULE: all Firestore timestamp fields in this platform are stored as epoch
 * milliseconds (number) to keep @thinkai/shared free of any Firebase SDK coupling and
 * to make the 24h service-window math trivial. Firestore can index/order numbers.
 */

/** 18% expressed in basis points (1/100th of a percent). */
export const GST_BPS = 1800;

/**
 * Flat monthly subscription price — the BASE (taxable) amount before GST, in integer paise.
 * ₹2,500/month. The client pays this + 18% GST (gstOnPaise) = ₹2,950 per renewal; paying it
 * extends the tenant's access by one month. This single rate replaced the old per-message
 * wallet billing — there is no per-message debit anymore.
 */
export const SUBSCRIPTION_PRICE_PAISE = 250000;

/** WhatsApp 24-hour customer service window, in milliseconds. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Meta Graph API version — pinned in ONE place so the server (Graph calls + webhook) and the
 * client (Embedded Signup / FB.login) can never drift apart. Bump this single constant to
 * upgrade everywhere; the server additionally accepts a META_GRAPH_VERSION env override for
 * a hotfix without a rebuild (it defaults to this value). Keep it in the form 'vNN.0'.
 */
export const META_GRAPH_VERSION = 'v23.0';

/** Top-level Firestore collection names. Tenant subcollections use the path helpers below. */
export const COLLECTIONS = {
  tenants: 'tenants',
  users: 'users',
  pricing: 'pricing',
  pricingCost: 'pricingCost',
  invoices: 'invoices',
  processedEvents: 'processedEvents',
  // Meta app-lifecycle compliance records (App Review). Top-level, NOT tenant-scoped: the
  // Deauthorize / Data Deletion callbacks identify the person only by an app-scoped Facebook
  // user_id, which we do not currently map to a tenant — so these cannot live under a tenant.
  dataDeletionRequests: 'dataDeletionRequests',
  deauthorizations: 'deauthorizations',
  /** Per-tenant client-facing webhook config (Developer Hub 2.5). Top-level, keyed by tenantId. */
  webhookConfig: 'webhookConfig',
  /** Developer Hub API keys. Top-level, keyed by the SHA-256 hash of the raw key. */
  apiKeys: 'apiKeys',
} as const;

/** Fixed doc id for the single wallet document under each tenant. */
export const WALLET_DOC_ID = 'current';

// ---- Firestore path helpers (tenant-scoped subcollections) ----
export const tenantPath = (tenantId: string): string => `tenants/${tenantId}`;
export const wabasPath = (tenantId: string): string => `tenants/${tenantId}/wabas`;
export const contactsPath = (tenantId: string): string => `tenants/${tenantId}/contacts`;
/** Tenant-scoped contact settings (custom attribute defs + tag palette). One doc per tenant. */
export const contactSettingsPath = (tenantId: string): string => `contactSettings/${tenantId}`;
export const templatesPath = (tenantId: string): string => `tenants/${tenantId}/templates`;
export const conversationsPath = (tenantId: string): string => `tenants/${tenantId}/conversations`;
export const messagesPath = (tenantId: string): string => `tenants/${tenantId}/messages`;
export const campaignsPath = (tenantId: string): string => `tenants/${tenantId}/campaigns`;
export const campaignRecipientsPath = (tenantId: string, campaignId: string): string =>
  `tenants/${tenantId}/campaigns/${campaignId}/recipients`;
export const mediaPath = (tenantId: string): string => `tenants/${tenantId}/media`;
export const qualityHistoryPath = (tenantId: string, wabaId: string): string =>
  `tenants/${tenantId}/wabas/${wabaId}/qualityHistory`;
export const walletDocPath = (tenantId: string): string =>
  `tenants/${tenantId}/wallet/${WALLET_DOC_ID}`;
export const walletTxnsPath = (tenantId: string): string =>
  `tenants/${tenantId}/walletTransactions`;
export const walletOrdersPath = (tenantId: string): string => `tenants/${tenantId}/walletOrders`;
/** Per-tenant client-facing webhook config (one doc; top-level, keyed by tenantId). */
export const webhookConfigPath = (tenantId: string): string => `webhookConfig/${tenantId}`;
/** Per-tenant client-webhook delivery queue + log (also queried collection-group by the worker). */
export const webhookDeliveriesPath = (tenantId: string): string =>
  `tenants/${tenantId}/webhookDeliveries`;
/** Developer Hub API keys (top-level, keyed by the SHA-256 hash of the raw key). */
export const apiKeysPath = (): string => 'apiKeys';

/**
 * 18% GST on a base amount, returned as integer paise (banker-free round-half-up).
 * ONLY used at recharge. Example: gstOnPaise(100000) === 18000 (₹1,000 -> ₹180).
 */
export const gstOnPaise = (basePaise: number): number =>
  Math.round((basePaise * GST_BPS) / 10000);

/** Convert rupees (may be fractional in the UI) to integer paise safely. */
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

/** Convert integer paise to a rupee number for display only. */
export const paiseToRupees = (paise: number): number => paise / 100;

// ---- GSTIN validation + state-code extraction ----
// GSTIN = 15 chars: 2 state code + 10 PAN + 1 entity + 'Z' + 1 checksum.
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Valid GST state codes: 01–37 plus 97 ("Other Territory"). */
export const VALID_GST_STATE_CODES: ReadonlySet<string> = new Set<string>([
  ...Array.from({ length: 37 }, (_, i) => String(i + 1).padStart(2, '0')),
  '97',
]);

export const isValidGstin = (gstin: string): boolean =>
  GSTIN_REGEX.test(gstin) && VALID_GST_STATE_CODES.has(gstin.slice(0, 2));

/** First two digits of a valid GSTIN are the GST state code; null if malformed. */
export const stateCodeFromGstin = (gstin: string): string | null =>
  isValidGstin(gstin) ? gstin.slice(0, 2) : null;
