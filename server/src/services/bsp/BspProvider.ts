/**
 * Generic provider contract. ALL WhatsApp/Graph calls go through an implementation of this
 * interface (services/bsp/metaCloud.ts, the sole provider). No other module may import provider
 * specifics. Adding a future backend = one new file implementing this + one factory line.
 */

import type {
  BspContext,
  DownloadedMedia,
  MarkReadAndTypeInput,
  MediaUrlResult,
  NormalizedTemplate,
  ParsedWebhook,
  PhoneNumberQuality,
  SendInteractiveInput,
  SendMediaInput,
  SendResult,
  SendTemplateInput,
  SendTextInput,
  SetWebhookInput,
  TemplateDefinition,
  TemplateMediaHandleResult,
  TemplateMutationResult,
  UploadMediaAsset,
  UploadMediaResult,
  WebhookVerifyInput,
} from './types';

export interface BspProvider {
  /** Provider identifier, e.g. 'metaCloud'. */
  readonly name: string;

  /** Send a free-text message (Phase 1: only valid inside the 24h service window). */
  sendText(ctx: BspContext, input: SendTextInput): Promise<SendResult>;

  /** Send an approved template message. */
  sendTemplate(ctx: BspContext, input: SendTemplateInput): Promise<SendResult>;

  /**
   * Send an interactive message (list / reply-buttons / cta_url) inside the 24h service window.
   * Optional (like sendMedia): legacy providers that don't support interactive sends may omit it;
   * the active metaCloud provider implements it.
   */
  sendInteractive?(ctx: BspContext, input: SendInteractiveInput): Promise<SendResult>;

  /**
   * Mark an inbound message read AND show a typing indicator in one call (Meta couples the two).
   * Optional + best-effort UX, never on a billable/critical path; callers must feature-detect.
   * The active metaCloud provider implements it; legacy providers may omit it.
   */
  markReadAndType?(ctx: BspContext, input: MarkReadAndTypeInput): Promise<void>;

  /**
   * Send a media message (image/document/audio/video/sticker) by public link or a
   * pre-uploaded media id. Optional: legacy BSP providers that don't support direct media
   * sends may omit it (the active metaCloud provider implements it).
   */
  sendMedia?(ctx: BspContext, input: SendMediaInput): Promise<SendResult>;

  /** Fetch templates for the WABA (used to sync approved templates into Firestore). */
  getTemplates(ctx: BspContext): Promise<NormalizedTemplate[]>;

  /**
   * Author a new template and submit it to the provider for review. Returns the provider's
   * template id + initial status (normally 'pending'). WhatsApp-specific authoring (components/
   * buttons) is mapped inside the provider; a future channel implements its own.
   */
  createTemplate(ctx: BspContext, def: TemplateDefinition): Promise<TemplateMutationResult>;

  /** Edit an existing template (by provider template id) and re-submit it for review. */
  editTemplate(
    ctx: BspContext,
    bspTemplateId: string,
    def: TemplateDefinition,
  ): Promise<TemplateMutationResult>;

  /** Delete a template by name. */
  deleteTemplate(ctx: BspContext, name: string): Promise<void>;

  /** Upload a media file to the provider's media store; returns the provider media id. */
  uploadMedia(ctx: BspContext, asset: UploadMediaAsset): Promise<UploadMediaResult>;

  /**
   * Upload a sample media file for a template HEADER example and return its file handle.
   * Optional (like sendMedia): only providers whose template review needs an uploaded handle
   * implement it. metaCloud uses the resumable upload API (POST /{app_id}/uploads). This is
   * NOT the send path — the handle is only valid inside a create/edit-template HEADER example.
   */
  uploadTemplateMediaHandle?(
    ctx: BspContext,
    asset: UploadMediaAsset,
  ): Promise<TemplateMediaHandleResult>;

  /** Resolve a provider-hosted (short-lived) URL + metadata for a media id. */
  getMediaUrl(ctx: BspContext, mediaId: string): Promise<MediaUrlResult>;

  /** Download the raw bytes for a media id (for an authenticated preview proxy). */
  downloadMedia(ctx: BspContext, mediaId: string): Promise<DownloadedMedia>;

  /** Delete a media asset from the provider's store. */
  deleteMedia(ctx: BspContext, mediaId: string): Promise<void>;

  /** Fetch the current quality rating (+ tier when available) for the WABA's phone number. */
  getPhoneNumberQuality(ctx: BspContext): Promise<PhoneNumberQuality>;

  /**
   * Register our webhook URL + auth headers with the provider for this WABA. Legacy interface
   * method: metaCloud subscribes at the App level (during onboarding), so its impl is a no-op.
   */
  setWebhook(ctx: BspContext, input: SetWebhookInput): Promise<void>;

  /**
   * Verify webhook authenticity. Legacy interface method (an echoed-secret-header compare for
   * the old BSP scheme); metaCloud leaves it a no-op (returns false) because Meta authenticity
   * (X-Hub-Signature-256 HMAC + hub.challenge GET) is enforced in routes/webhooks/meta.ts.
   */
  verifyWebhook(
    input: WebhookVerifyInput,
    expectedHeaderName: string,
    expectedHeaderValue: string,
  ): boolean;

  /** Parse a raw (already-verified) webhook body into normalized inbound + status arrays. */
  parseWebhook(rawBody: Buffer): ParsedWebhook;

  /** Lightweight apikey/WABA validity check, used on WABA connect. */
  healthCheck(ctx: BspContext): Promise<boolean>;
}
