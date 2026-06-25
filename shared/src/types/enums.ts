/**
 * String-union enums. Each is exported as a readonly array (for runtime validation /
 * zod) plus a derived type. Keep these as the single vocabulary across client + server.
 */

export const ROLES = ['reseller_admin', 'tenant_admin', 'agent'] as const;
export type Role = (typeof ROLES)[number];

export const TENANT_STATUSES = ['active', 'suspended'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const WABA_STATUSES = ['pending', 'connected', 'disabled'] as const;
export type WabaStatus = (typeof WABA_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ['in', 'out'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Outbound Phase 1 supports text + template. Inbound may be any of these (others -> 'unknown'). */
export const MESSAGE_TYPES = [
  'text',
  'template',
  'image',
  'document',
  'audio',
  'video',
  'sticker',
  'location',
  'contacts',
  'interactive',
  'button',
  'reaction',
  'unknown',
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Billing categories. 'service' (free-text inside the 24h window) is free. */
export const MESSAGE_CATEGORIES = ['marketing', 'utility', 'authentication', 'service'] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/** Billable categories only (exclude 'service'). */
export const BILLABLE_CATEGORIES = ['marketing', 'utility', 'authentication'] as const;
export type BillableCategory = (typeof BILLABLE_CATEGORIES)[number];

export const TEMPLATE_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'paused',
  'disabled',
] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const OPT_IN_STATUSES = ['opted_in', 'opted_out', 'unknown'] as const;
export type OptInStatus = (typeof OPT_IN_STATUSES)[number];

/** How a contact entered the system (audience hygiene + reporting). */
export const CONTACT_SOURCES = ['manual', 'import', 'api', 'signup'] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

/** Soft active/inactive state on a contact (independent of opt-out compliance). */
export const CONTACT_STATUSES = ['active', 'inactive'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const WALLET_TXN_TYPES = ['recharge', 'debit', 'refund'] as const;
export type WalletTxnType = (typeof WALLET_TXN_TYPES)[number];

/** GST split applied on an invoice. */
export const INVOICE_TAX_TYPES = ['cgst_sgst', 'igst', 'unspecified'] as const;
export type InvoiceTaxType = (typeof INVOICE_TAX_TYPES)[number];

export const WALLET_ORDER_STATUSES = ['created', 'paid', 'failed'] as const;
export type WalletOrderStatus = (typeof WALLET_ORDER_STATUSES)[number];

/**
 * WhatsApp provider backend(s) behind the BspProvider interface. We are a DIRECT Meta
 * WhatsApp Cloud API Tech Provider, so 'metaCloud' is the sole provider. The enum is kept
 * (rather than inlined) so the provider mechanism stays open to a future backend.
 */
export const BSP_PROVIDERS = ['metaCloud'] as const;
export type BspProviderName = (typeof BSP_PROVIDERS)[number];

/**
 * Messaging channel a message/template/campaign belongs to. WhatsApp is the only channel
 * today; the field exists so Instagram / Messenger can plug in later without a data migration
 * (reads default an absent value to 'whatsapp').
 */
export const CHANNELS = ['whatsapp'] as const;
export type ChannelName = (typeof CHANNELS)[number];

/**
 * Broadcast campaign lifecycle. 'queued' = accepted and waiting for the worker (a future
 * `scheduledAt` keeps it queued until due); 'sending' = the worker is draining recipients.
 */
export const CAMPAIGN_STATUSES = ['queued', 'sending', 'completed', 'failed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * Per-recipient state within a campaign. Starts 'pending'; the worker sets 'sent' or 'failed'
 * at send time; 'delivered'/'read' are advanced later by status webhooks (feature 2.2).
 */
export const CAMPAIGN_RECIPIENT_STATUSES = [
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
] as const;
export type CampaignRecipientStatus = (typeof CAMPAIGN_RECIPIENT_STATUSES)[number];

/**
 * WhatsApp phone-number quality rating (Meta GREEN/YELLOW/RED), normalized lowercase.
 * 'unknown' covers a number Meta hasn't rated yet (or an unrecognized value).
 */
export const QUALITY_RATINGS = ['green', 'yellow', 'red', 'unknown'] as const;
export type QualityRating = (typeof QUALITY_RATINGS)[number];

/**
 * WhatsApp messaging limit tier (unique users a number may start conversations with per 24h),
 * normalized from Meta's TIER_50/TIER_250/TIER_1K/TIER_10K/TIER_100K/TIER_UNLIMITED.
 */
export const MESSAGING_TIERS = [
  'tier_50',
  'tier_250',
  'tier_1k',
  'tier_10k',
  'tier_100k',
  'tier_unlimited',
  'unknown',
] as const;
export type MessagingTier = (typeof MESSAGING_TIERS)[number];

/**
 * Client-facing webhook event types (Developer Hub 2.5). A tenant subscribes to any subset and
 * we forward a clean, HMAC-signed JSON copy of each to their own callback URL:
 *   - incoming_message: an inbound customer message
 *   - message_status:   an outbound message's status changed (sent/delivered/read/failed)
 *   - template_status:  a template's Meta approval status changed
 */
export const WEBHOOK_EVENT_TYPES = [
  'incoming_message',
  'message_status',
  'template_status',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/**
 * Lifecycle of one queued client-webhook delivery. 'queued' awaits the delivery worker (also
 * the state between retries, gated by nextAttemptAt); 'delivering' is claimed by the worker;
 * terminal states are 'delivered' (got a 2xx) and 'failed' (retries exhausted).
 */
export const WEBHOOK_DELIVERY_STATUSES = ['queued', 'delivering', 'delivered', 'failed'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

/**
 * Scopes a Developer Hub API key may hold (client-facing /api/v1). Each public endpoint requires
 * one of these; a key is granted any subset at creation.
 */
export const API_SCOPES = [
  'messages:send',
  'messages:read',
  'contacts:read',
  'contacts:write',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
