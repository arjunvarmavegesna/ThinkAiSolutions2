/**
 * API request/response contracts between the React client and the Express server.
 * The client NEVER reads Firestore directly — these DTOs are the entire surface.
 */

import type {
  ApiScope,
  BillableCategory,
  BspProviderName,
  CampaignStatus,
  ChannelName,
  ContactSource,
  ContactStatus,
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
  WabaStatus,
  WebhookEventType,
} from './enums';
import type {
  Campaign,
  CampaignRecipient,
  CampaignSegment,
  Contact,
  ContactAttributeDef,
  ContactTag,
  Conversation,
  Invoice,
  MediaAsset,
  Message,
  MessageError,
  Pricing,
  PricingCost,
  QualityHistoryEntry,
  Template,
  Tenant,
  WalletTransaction,
  WebhookConfig,
  WebhookDelivery,
  WithId,
} from './firestore';

/** Standard error envelope returned by the server error handler. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** Generic cursor-paginated list. */
export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
}

// ---- Auth ----
export interface AuthMeResponse {
  uid: string;
  role: Role;
  tenantId: string | null;
  name: string;
  email: string;
}

// ---- Reseller admin: tenants ----
export interface CreateTenantRequest {
  name: string;
  plan?: string;
  billing: {
    legalName?: string;
    gstin?: string;
    stateCode?: string;
    address?: string;
  };
}
export interface CreateTenantResponse {
  tenantId: string;
}
export type TenantDTO = WithId<Tenant>;
export interface ListTenantsResponse {
  tenants: TenantDTO[];
}

// ---- Reseller admin: tenant users ----
export interface CreateTenantUserRequest {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: Exclude<Role, 'reseller_admin'>;
}
export interface CreateTenantUserResponse {
  uid: string;
}

// ---- Reseller admin: WABA connect (manual metaCloud, e.g. the Meta test number) ----
export interface ConnectWabaRequest {
  tenantId: string;
  /** Provider backend for this WABA. Defaults to 'metaCloud' (the only provider). */
  provider?: BspProviderName;
  phoneNumber: string;
  displayName: string;
  /** Meta WABA id — used for template fetch / waba info. */
  wabaId?: string;
  /** Meta phone_number_id — send + inbound-routing target. */
  phoneNumberId?: string;
}
export interface ConnectWabaResponse {
  /** Firestore waba doc id. */
  wabaId: string;
  webhookRegistered: boolean;
}

// ---- Reseller admin: Meta Embedded Signup onboarding (direct Meta path) ----
/** Public Meta values the browser needs to launch the Embedded Signup popup (no secrets). */
export interface OnboardingConfigResponse {
  appId: string;
  configId: string;
  graphVersion: string;
  /**
   * Whether Embedded Signup is usable right now (live mode + a Config id is set). In test mode
   * this is false, so the "Connect WhatsApp" button shows an "available after approval" state
   * instead of launching a broken popup.
   */
  embeddedSignupAvailable: boolean;
}

/** Captured by the Embedded Signup popup, exchanged + completed server-side. */
export interface ExchangeSignupCodeRequest {
  tenantId: string;
  /** Authorization code returned by the ES popup (exchanged server-side; never stored). */
  code: string;
  /** WABA id from the ES sessionInfo event. */
  wabaId: string;
  /** phone_number_id from the ES sessionInfo event (the inbound-routing key). */
  phoneNumberId: string;
  /** Display phone number (E.164) if the popup surfaced it; otherwise fetched from Graph. */
  phoneNumber?: string;
  /** Friendly display name; otherwise fetched from Graph (verified_name). */
  displayName?: string;
  /** 6-digit PIN for Cloud API number registration (two-step verification), if available. */
  pin?: string;
}

export interface ExchangeSignupCodeResponse {
  /** Firestore waba doc id. */
  wabaDocId: string;
  /** Meta WABA id persisted on the doc. */
  wabaId: string;
  /** Meta phone_number_id persisted on the doc. */
  phoneNumberId: string;
  /** Our app subscribed to the WABA (POST /{waba_id}/subscribed_apps). */
  subscribed: boolean;
  /** Number registered for the Cloud API (POST /{phone_number_id}/register). */
  registered: boolean;
  status: WabaStatus;
}

// ---- Self-serve signup (tenant_admin provisions their own tenant) ----
/** Result of POST /api/auth/register — provisions (or returns) the caller's own tenant. */
export interface ProvisionResponse {
  /** The tenant the caller now owns. */
  tenantId: string;
  /** Always 'tenant_admin' for self-serve. */
  role: 'tenant_admin';
  /** true if a new tenant was created; false if the caller was already provisioned (idempotent). */
  created: boolean;
}

/** Same as ExchangeSignupCodeRequest but WITHOUT tenantId — the tenant-scoped onboarding route
 * derives the tenant from the caller's own token, so the client never sends one. */
export type ExchangeSignupCodeTenantRequest = Omit<ExchangeSignupCodeRequest, 'tenantId'>;

/** Whether the caller's tenant has a WABA yet (drives the post-signup "Connect WhatsApp" gate). */
export interface WabaStatusResponse {
  /** A WABA doc exists for the tenant (any status). */
  hasWaba: boolean;
  /** At least one WABA is status==='connected'. */
  connected: boolean;
}

// ---- Reseller admin: pricing ----
export interface SetPricingRequest {
  tenantId: string;
  marketingPaise: number;
  utilityPaise: number;
  authPaise: number;
  /** Our cost rates (optional) — written to pricingCost, reseller-only. */
  costMarketingPaise?: number;
  costUtilityPaise?: number;
  costAuthPaise?: number;
}
export interface PricingResponse {
  charge: Pricing | null;
  cost: PricingCost | null;
}

// ---- Reseller admin: usage / revenue / margin ----
export interface TenantUsageRow {
  tenantId: string;
  name: string;
  messageCount: number;
  revenuePaise: number;
  costPaise: number;
  marginPaise: number;
}
export interface UsageResponse {
  rows: TenantUsageRow[];
  totals: {
    messageCount: number;
    revenuePaise: number;
    costPaise: number;
    marginPaise: number;
  };
}

// ---- Inbox: conversations + messages ----
export type ConversationDTO = WithId<Conversation> & { windowOpen: boolean };
export type MessageDTO = WithId<Message>;
export type TemplateDTO = WithId<Template>;

export type ListConversationsResponse = Paginated<ConversationDTO>;
export type ListMessagesResponse = Paginated<MessageDTO>;
export interface ListTemplatesResponse {
  templates: TemplateDTO[];
}

// ---- Templates: author / submit / edit (1.1) ----
/**
 * A button on a template. Two mutually-exclusive families (a template uses one or the other):
 *  - Call-to-action: `URL` (text + url, optional {{1}} suffix) and `PHONE_NUMBER` (text +
 *    full international number). Max 2 per template.
 *  - Quick reply: `QUICK_REPLY` (text only). Max 3 per template.
 */
export interface TemplateButtonInput {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  /** Button label shown to the user (<=25 chars per Meta). */
  text: string;
  /** Destination URL — required when type==='URL'; may contain a single {{1}} suffix var. */
  url?: string;
  /** Full international phone number (e.g. +919876543210) — required when type==='PHONE_NUMBER'. */
  phoneNumber?: string;
}

/** Media header format for a template (text headers use `header` instead). */
export type TemplateHeaderFormat = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

/**
 * POST /api/templates — author a template and submit it to Meta for review.
 * The body uses positional {{1}}, {{2}}… placeholders; `variableSamples` provides one example
 * value per placeholder (Meta requires samples to approve a template with variables).
 */
export interface CreateTemplateRequest {
  /** Unique within the WABA; lowercase letters, digits, underscores (Meta constraint). */
  name: string;
  category: 'marketing' | 'utility' | 'authentication';
  /** Meta language code, e.g. 'en_US'. */
  language: string;
  /** BODY text with positional {{n}} placeholders. */
  body: string;
  /** Optional plain-text header (mutually exclusive with a media header). */
  header?: string;
  /** Media header format — set with `headerHandle` for an IMAGE/VIDEO/DOCUMENT header. */
  headerFormat?: TemplateHeaderFormat;
  /** Resumable-upload file handle for the sample media (required when `headerFormat` is set). */
  headerHandle?: string;
  /** Optional footer text (<=60 chars). */
  footer?: string;
  /** Optional buttons — all CTA (URL/PHONE_NUMBER) OR all quick-reply, never mixed. */
  buttons?: TemplateButtonInput[];
  /** One example value per {{n}} in body order; required when body has placeholders. */
  variableSamples?: string[];
}

/** PUT /api/templates/:name — edit an existing template (re-submits to Meta). Same shape minus name. */
export type UpdateTemplateRequest = Omit<CreateTemplateRequest, 'name'>;

export interface CreateTemplateResponse {
  /** Firestore template doc id (== template name). */
  name: string;
  /** Meta template id assigned on submit. */
  bspTemplateId?: string;
  /** Status right after submit — typically 'pending'. */
  status: TemplateStatus;
}

/** Free-text reply inside an existing conversation (allowed only if window open). */
export interface SendTextRequest {
  body: string;
}

/** Send an approved template to a phone number (creates/opens the conversation). */
export interface SendTemplateRequest {
  toPhone: string;
  templateName: string;
  languageCode: string;
  /** Positional body variables, mapped in order into the Meta template body components. */
  variables: string[];
}

export interface SendMessageResponse {
  messageId: string;
  conversationId: string;
  status: MessageStatus;
}

// ---- Wallet ----
export interface WalletBalanceResponse {
  balancePaise: number;
}
export interface CreateRechargeOrderRequest {
  /** Desired wallet credit (taxable base) in integer paise. */
  creditPaise: number;
}
export interface CreateRechargeOrderResponse {
  orderId: string;
  /** Amount the client pays via Razorpay = creditPaise + gstPaise. */
  amountPaise: number;
  currency: 'INR';
  /** Public Razorpay key id for Checkout. */
  keyId: string;
  creditPaise: number;
  gstPaise: number;
}
export type WalletTransactionDTO = WithId<WalletTransaction>;
export type ListWalletTransactionsResponse = Paginated<WalletTransactionDTO>;
export type InvoiceDTO = WithId<Invoice>;

// ---- Subscription (flat ₹2,500/month plan; replaced per-message wallet billing) ----
/** Current subscription state + the fixed monthly price split, for the Billing screen. */
export interface SubscriptionDTO {
  status: SubscriptionStatus;
  /** Epoch ms when the paid month ends. 0 = never subscribed. Sends allowed iff `active`. */
  currentPeriodEnd: number;
  /** Whether sends are currently allowed (currentPeriodEnd > now). */
  active: boolean;
  /** Monthly base price (paise) — ₹2,500. */
  pricePaise: number;
  /** 18% GST on the base (paise). */
  gstPaise: number;
  /** What the client pays per renewal = pricePaise + gstPaise (paise) — ₹2,950. */
  totalPaise: number;
}
export type GetSubscriptionResponse = SubscriptionDTO;

/** POST /api/subscription/order → Razorpay Checkout params for one monthly renewal. */
export interface CreateSubscriptionOrderResponse {
  orderId: string;
  /** Total to pay via Razorpay = base + GST (paise). */
  amountPaise: number;
  currency: 'INR';
  /** Public Razorpay key id for Checkout. */
  keyId: string;
  pricePaise: number;
  gstPaise: number;
}
export type ListInvoicesResponse = Paginated<InvoiceDTO>;

// ---- Developer Hub: client-facing webhooks (2.5) ----
/**
 * The webhook config fields safe to return to the client: NO signing secret and NO secret ref.
 * Derived from the stored WebhookConfig so the two never drift.
 */
export type WebhookConfigPublic = Pick<
  WebhookConfig,
  'enabled' | 'callbackUrl' | 'eventTypes' | 'secretLast4' | 'updatedAt'
>;

/** GET /api/developer/webhook — current config (null until first configured). Never includes the secret. */
export interface GetWebhookConfigResponse {
  config: WebhookConfigPublic | null;
}

/** PUT /api/developer/webhook — upsert callback URL + subscribed event types + enabled flag. */
export interface UpdateWebhookConfigRequest {
  enabled: boolean;
  /** Must be a valid https URL (enforced server-side). */
  callbackUrl: string;
  eventTypes: WebhookEventType[];
}
export interface UpdateWebhookConfigResponse {
  config: WebhookConfigPublic;
}

/**
 * POST /api/developer/webhook/secret — (re)generate the HMAC signing secret. The full secret is
 * returned EXACTLY ONCE here and never again; thereafter only `secretLast4` is shown.
 */
export interface RotateWebhookSecretResponse {
  signingSecret: string;
  secretLast4: string;
}

export type WebhookDeliveryDTO = WithId<WebhookDelivery>;
/** GET /api/developer/webhook/deliveries — recent delivery log, newest first (cursor-paginated). */
export type ListWebhookDeliveriesResponse = Paginated<WebhookDeliveryDTO>;

// ---- Developer Hub: API keys (per-tenant, client-facing /api/v1) ----
/** POST /api/developer/api-keys — create a key. */
export interface CreateApiKeyRequest {
  name: string;
  scopes: ApiScope[];
}
/** Response to key creation. The full `apiKey` is returned ONCE here and never again. */
export interface CreateApiKeyResponse {
  /** The key id (its SHA-256 hash) — used to revoke. */
  id: string;
  name: string;
  scopes: ApiScope[];
  keyPrefix: string;
  /** The full secret key — display once, then unrecoverable. */
  apiKey: string;
}
/** A masked key for listing — never carries the secret. */
export interface ApiKeyDTO {
  id: string;
  name: string;
  scopes: ApiScope[];
  keyPrefix: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked: boolean;
}
/** GET /api/developer/api-keys — all of the tenant's keys (masked), newest first. */
export interface ListApiKeysResponse {
  keys: ApiKeyDTO[];
}

// ---- Public client API (/api/v1, authenticated by an API key) ----
/** POST /api/v1/messages — send a template, or a session (free-text) message in an open window. */
export type ApiSendMessageRequest =
  | { type: 'template'; to: string; templateName: string; languageCode: string; variables?: string[] }
  | { type: 'session'; to: string; text: string };

/** GET /api/v1/messages/:id — current status of one outbound message we sent. */
export interface ApiMessageStatusResponse {
  id: string;
  status: MessageStatus;
  to: string;
  type: MessageType;
  error?: MessageError;
  ts: number;
}

// ---- Campaigns (broadcast) ----
export interface CreateCampaignRequest {
  title: string;
  templateName: string;
  languageCode: string;
  /** Positional body variables, shared across all recipients in this campaign. */
  variables: string[];
  /**
   * Recipient phone numbers (E.164). Provide EITHER an explicit list OR a `segment` (at least
   * one is required). When both are given, the explicit list wins.
   */
  recipients?: string[];
  /** Audience selector resolved server-side from contacts (tags / opt-in). */
  segment?: CampaignSegment;
  /** Epoch ms to start sending; omit/now for an immediate send. */
  scheduledAt?: number;
}
export type CampaignDTO = WithId<Campaign>;
export type CampaignRecipientDTO = WithId<CampaignRecipient>;
export interface ListCampaignsResponse {
  campaigns: CampaignDTO[];
}
export interface CreateCampaignResponse {
  campaignId: string;
  /** Number of recipients enqueued. */
  total: number;
  /** Lifecycle status right after enqueue — 'queued'. */
  status: CampaignStatus;
}

/** POST /api/campaigns/preview-audience — resolve a segment to a recipient count (no write). */
export interface AudiencePreviewRequest {
  segment: CampaignSegment;
}
export interface AudiencePreviewResponse {
  /** Distinct, non-opted-out recipients the segment currently resolves to. */
  count: number;
  /** First resolved recipient, for the create-campaign merge-tag live preview (absent if count 0). */
  sample?: { name?: string; phone: string };
}

/** GET /api/campaigns/:id — campaign detail + a page of per-recipient progress rows. */
export interface CampaignDetailResponse {
  campaign: CampaignDTO;
  recipients: CampaignRecipientDTO[];
  /** Total recipient rows (may exceed `recipients.length` when paginated). */
  recipientCount: number;
}

/** Delivery funnel for a campaign, computed from per-recipient statuses. */
export interface CampaignFunnel {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

/** GET /api/campaigns/:id/report — funnel + a page of recipient rows (cursor-paginated by doc id). */
export interface CampaignReportResponse {
  campaignId: string;
  funnel: CampaignFunnel;
  rows: CampaignRecipientDTO[];
  /** Pass back as `?cursor=` to fetch the next page; absent when the last page is reached. */
  nextCursor?: string;
}

// ---- Quality Signal Report (3.1) ----
/** One WABA's current quality rating + messaging tier, with its recent history. */
export interface QualityWabaDTO {
  /** Firestore WABA doc id. */
  id: string;
  phoneNumber: string;
  displayName: string;
  status: WabaStatus;
  qualityRating: QualityRating;
  messagingTier: MessagingTier;
  qualityUpdatedAt?: number;
  /** Most-recent-first quality/tier snapshots. */
  history: QualityHistoryEntry[];
}

/** GET /api/quality — per-number quality panel for the tenant. */
export interface QualityResponse {
  wabas: QualityWabaDTO[];
}

// ---- Media library (2.1) ----
/** POST /api/media — upload a file (base64) to the tenant's media library. */
export interface UploadMediaRequest {
  fileName: string;
  mimeType: string;
  /** File bytes, base64-encoded (no data: URI prefix). */
  dataBase64: string;
}
export type MediaAssetDTO = WithId<MediaAsset>;
export interface UploadMediaResponse {
  media: MediaAssetDTO;
}
export interface ListMediaResponse {
  media: MediaAssetDTO[];
}

/**
 * POST /api/templates/sample-media — upload a sample header file (base64) via the resumable
 * upload API. Returns the file `handle` Meta requires inside a template HEADER example. This is
 * distinct from the media library: a /media id can NOT be used as a template header example.
 */
export interface UploadTemplateSampleRequest {
  fileName: string;
  mimeType: string;
  /** File bytes, base64-encoded (no data: URI prefix). */
  dataBase64: string;
}
export interface UploadTemplateSampleResponse {
  /** Resumable-upload file handle to pass back as CreateTemplateRequest.headerHandle. */
  handle: string;
}

// ---- Contacts management (1.2) ----
export type ContactDTO = WithId<Contact>;

/** GET /api/contacts — cursor-paginated, filtered/searched list of contacts. */
export interface ListContactsResponse extends Paginated<ContactDTO> {
  /** Best-effort total for the active filter (omitted for very large result sets). */
  total?: number;
}

/** POST /api/contacts — add a contact (dedupe by phone: updates if it already exists). */
export interface CreateContactRequest {
  /** E.164 phone (the dedupe key). */
  phone: string;
  name?: string;
  tags?: string[];
  optInStatus?: OptInStatus;
  /** Custom attribute values keyed by attribute name. */
  attributes?: Record<string, string>;
  source?: ContactSource;
  status?: ContactStatus;
}

/** PATCH /api/contacts/:id — partial edit (phone is immutable; it's the identity). */
export interface UpdateContactRequest {
  name?: string;
  tags?: string[];
  optInStatus?: OptInStatus;
  attributes?: Record<string, string>;
  status?: ContactStatus;
}

/** One mapped row in a bulk import (already mapped from CSV columns on the client). */
export interface ImportContactRow {
  phone: string;
  name?: string;
  tags?: string[];
  attributes?: Record<string, string>;
}

/** POST /api/contacts/import — one chunk of mapped rows (the client sends ~1k per request). */
export interface ImportContactsRequest {
  rows: ImportContactRow[];
}
export interface ImportSkippedRow {
  /** Row index within this chunk. */
  index: number;
  phone?: string;
  reason: string;
}
export interface ImportContactsResponse {
  added: number;
  updated: number;
  skipped: ImportSkippedRow[];
}

/** POST /api/contacts/bulk-action — tag/untag/delete a set of contacts by id. */
export interface BulkActionRequest {
  action: 'add_tag' | 'remove_tag' | 'delete';
  contactIds: string[];
  /** Required for add_tag / remove_tag. */
  tag?: string;
}
export interface BulkActionResponse {
  affected: number;
}

/** GET/PUT /api/contact-attributes — tenant attribute definitions + tag palette. */
export interface ContactSettingsResponse {
  attributes: ContactAttributeDef[];
  tags: ContactTag[];
}
export interface UpdateContactSettingsRequest {
  attributes?: ContactAttributeDef[];
  tags?: ContactTag[];
}

// ---- Reports (Phase 2) ----
/** One row in the API / Message Report (2.4). Derived from a stored `messages` doc. */
export interface ReportMessageRow {
  id: string;
  /** epoch ms */
  ts: number;
  direction: MessageDirection;
  channel: ChannelName;
  contactPhone: string;
  type: MessageType;
  templateName?: string;
  status: MessageStatus;
  category: MessageCategory;
  /** Bare tenant charge debited (paise); 0 for inbound / free service messages. */
  costPaise: number;
  error?: MessageError;
}

/** GET /api/reports/messages — a page of message rows for the selected range + filters. */
export interface ReportMessagesResponse {
  rows: ReportMessageRow[];
  /** Total rows matching the range + filters (may exceed `rows.length` when limited). */
  total: number;
  /** True if the date-range scan hit the safety cap — results may be incomplete; narrow the range. */
  truncated: boolean;
}

/** One day in the Daily Report (2.3). Outbound funnel counts + inbound + spend. */
export interface DailyReportRow {
  /** UTC day, yyyy-mm-dd. */
  date: string;
  submitted: number;
  sent: number;
  delivered: number;
  failed: number;
  /** Inbound messages received that day. */
  received: number;
  /** Sum of outbound `costPaise` debited that day. */
  costPaise: number;
}

/** GET /api/reports/daily — a per-day series for the selected range, plus range totals. */
export interface DailyReportResponse {
  rows: DailyReportRow[];
  totals: Omit<DailyReportRow, 'date'>;
  /** True if the range scan hit the safety cap — totals may be incomplete; narrow the range. */
  truncated: boolean;
}

// Re-export a couple of vocab types handy for client forms.
export type { BillableCategory, MessageCategory };
