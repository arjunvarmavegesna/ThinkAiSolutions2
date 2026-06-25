/**
 * Server-internal NORMALIZED BSP DTOs. These deliberately live server-side (not in
 * @thinkai/shared) so the browser bundle never imports BSP internals and so Meta/Graph
 * specifics stay isolated. Only files under services/bsp/ may know provider shapes.
 */

import type {
  BspProviderName,
  MessageCategory,
  MessageStatus,
  MessageType,
  MessagingTier,
  QualityRating,
  TemplateStatus,
} from '@thinkai/shared';

/** Per-call context identifying the WABA and carrying the resolved plaintext apikey. */
export interface BspContext {
  tenantId: string;
  /** Which provider serves this WABA — selects the implementation + auth. */
  provider: BspProviderName;
  /** Provider-agnostic routing/addressing id. For metaCloud this equals phoneNumberId. */
  providerRef?: string;
  /** Meta phone_number_id — used for /messages and /media. */
  phoneNumberId?: string;
  /** Meta WABA id — used for template fetch / waba info. */
  wabaId?: string;
  /** Resolved at call time from SecretStore; never persisted or logged. */
  apiKey: string;
}

export interface SendTextInput {
  toPhone: string;
  body: string;
}

/**
 * Inputs for a combined read-receipt + typing indicator. Meta couples the two: a typing bubble is
 * shown by marking the triggering inbound message read on the same call, so the only input is that
 * message's id (no recipient — the target is implied by the message_id).
 */
export interface MarkReadAndTypeInput {
  /** Meta wamid of the inbound message to mark read + show typing for. */
  messageId: string;
}

/**
 * Media-header parameter for a template send (image/video/document header templates). Meta
 * requires a HEADER component whose parameter carries the actual media, addressed by a
 * pre-uploaded `mediaId` (preferred — survives reuse) OR a public `link` Meta can fetch.
 */
export interface TemplateHeaderMedia {
  format: TemplateHeaderFormat;
  /** Pre-uploaded Meta media id (mutually exclusive with link). */
  mediaId?: string;
  /** Public HTTPS URL Meta can fetch (mutually exclusive with mediaId). */
  link?: string;
  /** Document headers only — the filename shown to the recipient. */
  filename?: string;
}

export interface SendTemplateInput {
  toPhone: string;
  templateName: string;
  languageCode: string;
  /** Positional body variables -> Meta template body components in order. */
  variables: string[];
  /** Media header parameter — required for IMAGE/VIDEO/DOCUMENT header templates. */
  header?: TemplateHeaderMedia;
}

/**
 * An interactive message (WhatsApp list / reply-buttons / cta_url). `interactive` is the
 * provider-neutral interactive object exactly as WhatsApp expects under the `interactive` key
 * (the caller builds the list/button/action shape); the provider wraps it with messaging_product
 * + recipient + `type:'interactive'`. Like free-text, only valid inside the 24h service window.
 */
export interface SendInteractiveInput {
  toPhone: string;
  interactive: Record<string, unknown>;
}

/** A media send (image/document/audio/video/sticker) by public link OR pre-uploaded id. */
export interface SendMediaInput {
  toPhone: string;
  /** WhatsApp media message kind. */
  mediaType: 'image' | 'document' | 'audio' | 'video' | 'sticker';
  /** Public HTTPS URL of the media (mutually exclusive with mediaId). */
  link?: string;
  /** Pre-uploaded Meta media id (mutually exclusive with link). */
  mediaId?: string;
  /** Optional caption — image / video / document only. */
  caption?: string;
  /** Optional filename — document only. */
  filename?: string;
}

export interface SendResult {
  /** Provider message id, Meta wamid.* */
  bspMessageId: string;
}

/** A file to upload to the provider's media store. */
export interface UploadMediaAsset {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

/** Result of a media upload — the provider media id used when sending. */
export interface UploadMediaResult {
  metaMediaId: string;
}

/**
 * Result of a resumable (template-header) media upload — the file handle Meta requires inside a
 * template HEADER `example`. Distinct from UploadMediaResult: a send-media id can't be a header
 * example, and a header handle can't be sent as a message.
 */
export interface TemplateMediaHandleResult {
  handle: string;
}

/** A provider-hosted media URL (short-lived; requires the provider token to download). */
export interface MediaUrlResult {
  url: string;
  mimeType?: string;
  sizeBytes?: number;
}

/** Raw media bytes fetched from the provider (for an authenticated preview proxy). */
export interface DownloadedMedia {
  buffer: Buffer;
  contentType: string;
}

export interface NormalizedTemplate {
  name: string;
  language: string;
  status: TemplateStatus;
  category: MessageCategory;
  bspTemplateId?: string;
  components?: unknown;
  variableCount?: number;
}

/**
 * A button to attach to a template. Two families (never mixed in one template):
 * call-to-action (URL + PHONE_NUMBER) or quick-reply.
 */
export interface TemplateButtonDef {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  /** Destination URL — URL buttons only. */
  url?: string;
  /** Full international phone number (e.g. +919876543210) — PHONE_NUMBER buttons only. */
  phoneNumber?: string;
}

/** Media header format for a template; text headers use `header` instead. */
export type TemplateHeaderFormat = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

/**
 * Provider-neutral definition of a template to create/edit. The provider mapper turns this
 * into the Meta `components` payload; another channel's provider would map it differently.
 */
export interface TemplateDefinition {
  name: string;
  category: 'marketing' | 'utility' | 'authentication';
  language: string;
  body: string;
  /** Plain-text header (mutually exclusive with a media header). */
  header?: string;
  /** Media header format — paired with `headerHandle` for an IMAGE/VIDEO/DOCUMENT header. */
  headerFormat?: TemplateHeaderFormat;
  /** Resumable-upload file handle for the sample media (required when `headerFormat` is set). */
  headerHandle?: string;
  footer?: string;
  buttons?: TemplateButtonDef[];
  /** One sample per positional {{n}} in body order (Meta requires samples to approve). */
  variableSamples?: string[];
}

/** Result of a create/edit template call. */
export interface TemplateMutationResult {
  /** Meta template id (present on create; edit returns success only). */
  bspTemplateId?: string;
  /** Status Meta assigns on submit — normally 'pending'. */
  status: TemplateStatus;
}

/**
 * A template approval-status change delivered via the `message_template_status_update` webhook
 * field. Keyed by the Meta WABA id (entry.id) — NOT a phone_number_id — so routing uses the
 * WABA reverse lookup.
 */
export interface NormalizedTemplateStatusUpdate {
  /** Meta WABA id (the webhook entry id) used to reverse-map to a tenant. */
  wabaId?: string;
  /** Meta template id, if present on the event. */
  bspTemplateId?: string;
  /** Template name — the doc id we update. */
  templateName: string;
  status: TemplateStatus;
  /** Meta's reason when status is 'rejected'. */
  reason?: string;
  /** epoch ms */
  ts: number;
}

export interface NormalizedInboundMessage {
  /** Meta phone_number_id; set by the metaCloud parser. */
  phoneNumberId?: string;
  /** Provider-agnostic routing id (for metaCloud, the phone_number_id). */
  providerRef?: string;
  fromPhone: string;
  contactName?: string;
  bspMessageId: string;
  type: MessageType;
  body?: string;
  /**
   * Machine-routable selection token for a reply, when the inbound is one: an interactive
   * list/button reply id, a template quick-reply button payload, or a flow (nfm_reply) response.
   * `body` stays the human-readable title/text for the inbox; bots route on `replyId`.
   */
  replyId?: string;
  /** epoch ms */
  ts: number;
}

export interface NormalizedStatusUpdate {
  /** Meta phone_number_id; set by the metaCloud parser. */
  phoneNumberId?: string;
  /** Provider-agnostic routing id (for metaCloud, the phone_number_id). */
  providerRef?: string;
  bspMessageId: string;
  status: MessageStatus;
  /** epoch ms */
  ts: number;
  recipientPhone?: string;
  /** Authoritative billable category if the provider reports it. */
  category?: MessageCategory;
  error?: { code?: string; title?: string; detail?: string };
}

/**
 * A phone-number quality/limit change from the `phone_number_quality_update` webhook field.
 * Routed by phone_number_id (metadata) or WABA id (entry.id).
 */
export interface NormalizedQualityUpdate {
  phoneNumberId?: string;
  wabaId?: string;
  rating?: QualityRating;
  tier?: MessagingTier;
  /** Meta event (e.g. FLAGGED, UPGRADE, DOWNGRADE), when present. */
  event?: string;
  /** epoch ms */
  ts: number;
}

/** Result of an on-demand phone-number quality fetch (GET /{phone_number_id}). */
export interface PhoneNumberQuality {
  rating?: QualityRating;
  tier?: MessagingTier;
}

export interface ParsedWebhook {
  inbound: NormalizedInboundMessage[];
  statuses: NormalizedStatusUpdate[];
  /** Template approval-status changes (message_template_status_update). */
  templateStatuses: NormalizedTemplateStatusUpdate[];
  /** Phone-number quality/limit changes (phone_number_quality_update). */
  qualityUpdates: NormalizedQualityUpdate[];
}

export interface SetWebhookInput {
  webhookUrl: string;
  /** Custom headers a provider echoes back on each callback (legacy authenticity mechanism). */
  headers: Record<string, string>;
}

export interface WebhookVerifyInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}
