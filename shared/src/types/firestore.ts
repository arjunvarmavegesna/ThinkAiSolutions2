/**
 * Firestore document shapes — the canonical data model. One interface per collection.
 *
 * Conventions:
 * - All money fields end in `Paise` and are INTEGER paise.
 * - All time fields are epoch MILLISECONDS (number). See constants.ts TIME RULE.
 * - Documents are stored WITHOUT their own id; use WithId<T> when the id matters.
 */

import type {
  ApiScope,
  BspProviderName,
  CampaignRecipientStatus,
  CampaignStatus,
  ChannelName,
  ContactSource,
  ContactStatus,
  InvoiceTaxType,
  MessageCategory,
  MessageDirection,
  MessageStatus,
  MessageType,
  MessagingTier,
  OptInStatus,
  QualityRating,
  Role,
  SubscriptionStatus,
  TemplateStatus,
  TenantStatus,
  WabaStatus,
  WalletOrderStatus,
  WalletTxnType,
  WebhookDeliveryStatus,
  WebhookEventType,
} from './enums';

/** Attaches the Firestore document id to a stored shape. */
export type WithId<T> = T & { id: string };

/** tenants/{tenantId} */
export interface Tenant {
  name: string;
  plan: string;
  status: TenantStatus;
  createdAt: number;
  billing: TenantBilling;
  /**
   * Flat-monthly-subscription gate (replaced per-message wallet billing). The tenant may send
   * only while this is 'active'. Authoritative check is `subscriptionCurrentPeriodEnd > now`;
   * this string mirrors it for display. Optional so pre-migration reads default to inactive.
   */
  subscriptionStatus?: SubscriptionStatus;
  /** Epoch ms when the current paid month ends. Active iff > now. 0/absent = never subscribed. */
  subscriptionCurrentPeriodEnd?: number;
}

export interface TenantBilling {
  legalName?: string;
  gstin?: string;
  /** Explicit GST state code (01–37/97). Overrides the code derived from `gstin` when set. */
  stateCode?: string;
  address?: string;
}

/** tenants/{tenantId}/wabas/{wabaId} */
export interface Waba {
  /** Provider backend serving this WABA. Always 'metaCloud'; omitted on the oldest docs. */
  provider?: BspProviderName;
  /** E.164 display phone number, e.g. +9198XXXXXXXX. */
  phoneNumber: string;
  displayName: string;
  status: WabaStatus;
  /**
   * Legacy: opaque reference to a per-WABA BSP apikey secret (NEVER the key itself). Unused by
   * metaCloud, which authenticates with the shared Meta System User token (config.meta).
   * Retained only so historical WABA docs still type-check.
   */
  bspApiKeyRef?: string;
  /** Meta WABA id — used for template fetch / waba info. */
  wabaId?: string;
  /** Meta phone_number_id — inbound-routing key + send/register target. */
  phoneNumberId?: string;
  /**
   * Provider-agnostic routing id used to reverse-map an inbound webhook to this WABA and to
   * address sends. For metaCloud this equals phoneNumberId. Indexed via a collectionGroup query.
   */
  providerRef?: string;
  /** Legacy: opaque reference to a per-WABA webhook secret (unused by metaCloud). */
  webhookSecretRef?: string;
  /** Meta quality rating (green/yellow/red) for this number. Fed by webhook + on-demand refresh (3.1). */
  qualityRating?: QualityRating;
  /** Meta messaging limit tier for this number. */
  messagingTier?: MessagingTier;
  /** Epoch ms the quality rating/tier was last updated. */
  qualityUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * tenants/{tenantId}/wabas/{wabaId}/qualityHistory/{entryId} — a point-in-time quality/tier
 * snapshot for the trend panel (3.1). Appended on each quality webhook + manual refresh.
 */
export interface QualityHistoryEntry {
  rating?: QualityRating;
  tier?: MessagingTier;
  /** Meta event that triggered a webhook update (e.g. FLAGGED/UPGRADE), if any. */
  event?: string;
  /** Where this snapshot came from. */
  source: 'webhook' | 'refresh';
  ts: number;
}

/** users/{uid} */
export interface User {
  role: Role;
  /** null for reseller_admin (cross-tenant); concrete id for tenant_admin / agent. */
  tenantId: string | null;
  name: string;
  email: string;
  createdAt: number;
}

/** tenants/{tenantId}/contacts/{contactId} */
export interface Contact {
  phone: string;
  name?: string;
  /** Lowercased name maintained server-side for case-insensitive prefix search. */
  nameLower?: string;
  tags?: string[];
  optInStatus: OptInStatus;
  /** Custom attribute values keyed by attribute name (see ContactAttributeDef). */
  attributes?: Record<string, string>;
  /** How the contact entered the system (defaults 'manual' for API-created). */
  source?: ContactSource;
  /** Soft active/inactive state (does NOT affect opt-out compliance in segments). */
  status?: ContactStatus;
  /** Messaging channel (default 'whatsapp' when absent on legacy docs). */
  channel?: ChannelName;
  createdAt: number;
  updatedAt: number;
}

/**
 * contactSettings/{tenantId} — tenant-defined custom attribute fields + tag palette.
 * One doc per tenant (mirrors pricing/{tenantId}); read by tenant members, written server-only.
 */
export interface ContactAttributeDef {
  /** Display + machine name; the key used inside Contact.attributes (e.g. "FName"). */
  name: string;
  /** Optional default applied when a contact has no value for this attribute. */
  defaultValue?: string;
}
export interface ContactTag {
  name: string;
  /** Chip color (hex, e.g. "#2563eb"). */
  color: string;
}
export interface ContactSettings {
  attributes: ContactAttributeDef[];
  tags: ContactTag[];
  updatedAt: number;
}

/** tenants/{tenantId}/templates/{templateId} */
export interface Template {
  name: string;
  category: MessageCategory;
  language: string;
  body?: string;
  status: TemplateStatus;
  /** Messaging channel (default 'whatsapp' when absent on legacy docs). */
  channel?: ChannelName;
  /** Meta template id. */
  bspTemplateId?: string;
  /**
   * Meta template components, JSON-encoded (kept opaque in Phase 1 for the send modal).
   * Stored as a string because Meta's example fields contain directly-nested arrays
   * (e.g. a BODY's example.body_text is string[][]) that Firestore cannot store; a future
   * consumer JSON.parses this back into the components array.
   */
  components?: unknown;
  /** Number of positional body variables the template expects. */
  variableCount?: number;
  /** Set when a tenant submits the template to Meta for review (epoch ms). */
  submittedAt?: number;
  /** Meta's reason when status is 'rejected' (from the message_template_status_update webhook). */
  rejectionReason?: string;
  updatedAt: number;
}

/** tenants/{tenantId}/conversations/{conversationId} (id is deterministic from contactPhone). */
export interface Conversation {
  contactPhone: string;
  contactName?: string;
  lastMessageAt: number;
  lastMessagePreview?: string;
  /** Epoch ms when the 24h service window closes. Past => window closed. */
  windowExpiresAt: number;
  unreadCount: number;
  createdAt: number;
}

/** tenants/{tenantId}/messages/{messageId} */
export interface Message {
  conversationId: string;
  contactPhone: string;
  direction: MessageDirection;
  /** Messaging channel (default 'whatsapp' when absent on legacy docs). */
  channel?: ChannelName;
  type: MessageType;
  body?: string;
  /** Set for outbound template sends. */
  templateName?: string;
  /** Set when this message was sent as part of a campaign (links status updates back to it). */
  campaignId?: string;
  /** The campaign recipient doc id (sanitized phone) this message was sent to. */
  campaignRecipientId?: string;
  status: MessageStatus;
  category: MessageCategory;
  /** Bare tenant rate debited for this message (no GST). 0 for inbound/service. */
  costPaise: number;
  /** Meta wamid.* */
  bspMessageId?: string;
  error?: MessageError;
  ts: number;
}

export interface MessageError {
  code?: string;
  title?: string;
  detail?: string;
}

/**
 * tenants/{tenantId}/media/{mediaId} — a reusable media asset (image/document/video) uploaded
 * to Meta for use in sends + template headers. We store the Meta media id (not the binary); the
 * bytes live in Meta's media store (retained ~30 days).
 */
export interface MediaAsset {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Meta media id returned by POST /{phone_number_id}/media — referenced when sending. */
  metaMediaId: string;
  /** Resumable-upload file handle for template HEADER media (set only when produced). */
  handle?: string;
  /** Firebase uid of the uploader. */
  uploadedBy: string;
  /** Messaging channel (default 'whatsapp'). */
  channel?: ChannelName;
  createdAt: number;
}

/** tenants/{tenantId}/wallet/current */
export interface Wallet {
  balancePaise: number;
  updatedAt: number;
}

/** tenants/{tenantId}/walletTransactions/{txnId} */
export interface WalletTransaction {
  type: WalletTxnType;
  /** For recharge: the NET credit (taxable base). For debit/refund: the message charge. */
  amountPaise: number;
  /** GST captured at recharge only; 0 for debit/refund. */
  gstPaise: number;
  balanceAfter: number;
  /** razorpayPaymentId (recharge) or messageId (debit/refund). */
  ref: string;
  note?: string;
  ts: number;
}

/** tenants/{tenantId}/walletOrders/{orderId} — binds a Razorpay order to a tenant + amounts. */
export interface WalletOrder {
  tenantId: string;
  /** Desired wallet credit (taxable base). */
  creditPaise: number;
  /** 18% GST added on top at recharge. */
  gstPaise: number;
  /** What the client actually pays = creditPaise + gstPaise. */
  totalPaise: number;
  razorpayOrderId: string;
  status: WalletOrderStatus;
  createdAt: number;
}

/** pricing/{tenantId} — rates we CHARGE this tenant (tenant-readable). */
export interface Pricing {
  marketingPaise: number;
  utilityPaise: number;
  authPaise: number;
  updatedAt: number;
}

/** pricingCost/{tenantId} — our Meta cost rates for margin (reseller-admin only, never tenant-readable). */
export interface PricingCost {
  marketingPaise: number;
  utilityPaise: number;
  authPaise: number;
  updatedAt: number;
}

/** invoices/{invoiceId} — minimal GST record generated per recharge. */
export interface Invoice {
  invoiceNumber: string;
  tenantId: string;
  taxableAmountPaise: number;
  gstTotalPaise: number;
  taxType: InvoiceTaxType;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  sellerGstin?: string;
  sellerStateCode?: string;
  buyerGstin?: string;
  buyerStateCode?: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  createdAt: number;
}

/** Audience selector resolved server-side from `contacts` into a recipient list. */
export interface CampaignSegment {
  /** Include contacts having ANY of these tags (Firestore array-contains-any, max 10). Empty/absent = all contacts. */
  tags?: string[];
  /** When true, restrict to contacts with optInStatus === 'opted_in' (opted_out are always excluded). */
  optInOnly?: boolean;
}

/** tenants/{tenantId}/campaigns/{campaignId} — a broadcast of one template to many recipients. */
export interface Campaign {
  title: string;
  /** Messaging channel (default 'whatsapp' when absent on legacy docs). */
  channel?: ChannelName;
  templateName: string;
  languageCode: string;
  status: CampaignStatus;
  totalRecipients: number;
  /** Counts captured at send time; delivered is updated later via status webhooks. */
  submitted: number;
  sent: number;
  delivered: number;
  /** Messages the recipient read. Advanced by status webhooks (2.2). */
  read?: number;
  failed: number;
  /** Positional template body variables. 'static' mode applies these to every recipient. */
  variables?: string[];
  /** How variables are sourced. Phase 1.2 supports 'static' (shared across recipients). */
  templateVariablesMode?: 'static' | 'per_contact';
  /** The audience selector used to build the recipient list (when not a raw list). */
  segment?: CampaignSegment;
  /** Epoch ms the worker may begin sending. Equals createdAt for immediate sends. */
  scheduledAt?: number;
  /** Epoch ms the worker claimed the campaign (queued -> sending). */
  startedAt?: number;
  /** Epoch ms the worker finished draining recipients. */
  completedAt?: number;
  createdAt: number;
}

/**
 * tenants/{tenantId}/campaigns/{campaignId}/recipients/{recipientId} — one row per recipient,
 * the source of truth for per-recipient progress (feeds the Campaign Tracking Report, 2.2).
 * recipientId is the sanitized phone (digits only) so the list de-dupes naturally.
 */
export interface CampaignRecipient {
  phone: string;
  status: CampaignRecipientStatus;
  /** Source contact doc id, when the recipient came from a segment (not a raw list). */
  contactId?: string;
  /**
   * Contact display name SNAPSHOTTED at campaign creation (from the segment resolve), so the send
   * loop can resolve {{contact.name}} without re-reading the contact. For a scheduled campaign this
   * is the name as of creation — a later rename is not reflected (accepted for Phase 1).
   */
  name?: string;
  /** Our outbound message doc id, set once the worker attempts the send. */
  messageId?: string;
  /** Meta wamid, set on a successful send (lets status webhooks fan back here in 2.2). */
  bspMessageId?: string;
  error?: MessageError;
  updatedAt: number;
}

/** processedEvents/{key} — idempotency marker for webhooks (key = razorpay_payment_id, etc.). */
export interface ProcessedEvent {
  source: 'razorpay' | 'metaCloud';
  key: string;
  processedAt: number;
}

/**
 * apiKeys/{sha256hex} — a per-tenant Developer Hub API key (client-facing /api/v1). The doc id IS
 * the SHA-256 hash of the raw key, enabling an O(1) lookup on auth; the raw key is shown ONCE at
 * creation and never stored. Server-only (never client-readable) — the console lists keys via the
 * API, not Firestore directly.
 */
export interface ApiKey {
  tenantId: string;
  /** Human label chosen at creation. */
  name: string;
  scopes: ApiScope[];
  /** First chars of the raw key, for display (e.g. "tai_3f9a…"). Not secret. */
  keyPrefix: string;
  /** Firebase uid of the tenant_admin who created it. */
  createdBy: string;
  createdAt: number;
  /** Epoch ms of the most recent authenticated use (best-effort, throttled). */
  lastUsedAt?: number;
  /** Epoch ms the key was revoked; once set the key no longer authenticates. */
  revokedAt?: number;
}

// ---------------------------------------------------------------------------
// Developer Hub 2.5 — client-facing webhook forwarding.
// ---------------------------------------------------------------------------

/**
 * webhookConfig/{tenantId} — a tenant's client-facing webhook configuration. One doc per tenant
 * (mirrors pricing/{tenantId}): read by tenant members, written server-only. The HMAC signing
 * secret itself lives in the server-only SecretStore (secrets/{ref}); here we keep only an
 * opaque reference plus the last 4 chars for the "show-once then masked" UI.
 */
export interface WebhookConfig {
  /** Master on/off switch. When false, NO events are enqueued or delivered. */
  enabled: boolean;
  /** HTTPS callback URL we POST events to (https enforced at write time). */
  callbackUrl: string;
  /** Which event types this tenant wants forwarded. */
  eventTypes: WebhookEventType[];
  /** Opaque SecretStore reference to the signing secret (NEVER the secret itself). */
  signingSecretRef?: string;
  /** Last 4 chars of the signing secret, for display after the one-time reveal. */
  secretLast4?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * The clean, documented event body we POST to a tenant's callback URL — our OWN schema, never a
 * raw Meta payload. Signed with X-ThinkAi-Signature: sha256=HMAC(secret, exact-json-bytes).
 */
export interface WebhookEventEnvelope {
  /** The delivery id — also the idempotency key the client can dedupe on. */
  id: string;
  event: WebhookEventType;
  /** Epoch ms the source event occurred. */
  createdAt: number;
  data: IncomingMessageEventData | MessageStatusEventData | TemplateStatusEventData;
}

export interface IncomingMessageEventData {
  /** Sender phone in E.164. */
  from: string;
  /** Meta wamid of the inbound message. */
  messageId: string;
  type: MessageType;
  text?: string;
  /**
   * Machine-routable selection token when the inbound is a reply: interactive list/button reply
   * id, template quick-reply button payload, or flow (nfm_reply) response_json. `text` stays the
   * human-readable title; integrators route on `replyId`.
   */
  replyId?: string;
  contactName?: string;
  /** epoch ms */
  timestamp: number;
}

export interface MessageStatusEventData {
  /** Meta wamid of the outbound message whose status changed. */
  messageId: string;
  status: MessageStatus;
  /** Recipient phone, when Meta reports it. */
  recipient?: string;
  /** epoch ms */
  timestamp: number;
  error?: MessageError;
}

export interface TemplateStatusEventData {
  templateName: string;
  status: TemplateStatus;
  /** Meta's rejection reason, when status is 'rejected'. */
  reason?: string;
  /** epoch ms */
  timestamp: number;
}

/**
 * tenants/{tenantId}/webhookDeliveries/{deliveryId} — one client-webhook delivery. This
 * collection IS both the delivery QUEUE and the client-visible delivery LOG. The doc id is
 * deterministic from the source event (e.g. incoming_${wamid}) so a Meta redelivery re-creates
 * the same id and is skipped — we never forward an event twice. Server-only writes.
 */
export interface WebhookDelivery {
  eventType: WebhookEventType;
  /** Source event's natural key (wamid / template name) for traceability. */
  eventId: string;
  /** The exact clean JSON body we POST (also what the client inspects in the log). */
  payload: WebhookEventEnvelope;
  /** Snapshot of the callback URL at enqueue time (a later config edit can't misroute it). */
  callbackUrl: string;
  status: WebhookDeliveryStatus;
  /** POST attempts made so far. */
  attempts: number;
  /** Max attempts before giving up (status -> 'failed'). */
  maxAttempts: number;
  /** HTTP status code of the most recent attempt, if any. */
  lastStatusCode?: number;
  /** Short error detail of the most recent failed attempt. */
  lastError?: string;
  /** Epoch ms the worker may (re)attempt this delivery — drives retry backoff. */
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  /** Epoch ms a 2xx was received. */
  deliveredAt?: number;
}
