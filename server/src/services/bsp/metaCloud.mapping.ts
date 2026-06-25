/**
 * Pure, side-effect-free translators between Meta WhatsApp Cloud API (Graph) wire shapes and
 * our server-internal Normalized* DTOs. No HTTP, no Firestore, no secrets here — just data.
 *
 * Self-contained per the "one mapper file per provider" rule (cf. pinnacle.mapping.ts /
 * aisensy.mapping.ts): metaCloud does NOT import another provider's mappers, so pinnacle.ts
 * can be deleted later without touching this file.
 *
 * Meta delivers the canonical webhook envelope `{ object, entry: [{ changes: [{ value }] }] }`
 * (no BSP wrapper), and the Graph send/template responses are the standard Meta shapes.
 */

import {
  toE164,
  type MessageCategory,
  type MessageStatus,
  type MessageType,
  type MessagingTier,
  type QualityRating,
  type TemplateStatus,
} from '@thinkai/shared';

import { BspError } from './errors';

import type {
  NormalizedInboundMessage,
  NormalizedQualityUpdate,
  NormalizedStatusUpdate,
  NormalizedTemplate,
  NormalizedTemplateStatusUpdate,
  MarkReadAndTypeInput,
  ParsedWebhook,
  PhoneNumberQuality,
  SendInteractiveInput,
  SendMediaInput,
  SendTemplateInput,
  SendTextInput,
  TemplateDefinition,
  TemplateMutationResult,
} from './types';

// ---------------------------------------------------------------------------
// Vocabulary mapping (status / category / type)
// ---------------------------------------------------------------------------

/** Meta template status (APPROVED/PENDING/...) -> our lowercase TemplateStatus. */
export function mapTemplateStatus(raw: unknown): TemplateStatus {
  switch (String(raw ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'approved';
    case 'PENDING':
    case 'IN_APPEAL':
    case 'PENDING_DELETION':
      return 'pending';
    case 'REJECTED':
      return 'rejected';
    case 'PAUSED':
    case 'FLAGGED':
      return 'paused';
    case 'DISABLED':
    case 'DELETED':
      return 'disabled';
    default:
      // Unknown vocab -> 'pending' so it is not mistakenly treated as sendable.
      return 'pending';
  }
}

/** Meta template category (MARKETING/UTILITY/AUTHENTICATION) -> our MessageCategory. */
export function mapTemplateCategory(raw: unknown): MessageCategory {
  switch (String(raw ?? '').toUpperCase()) {
    case 'MARKETING':
      return 'marketing';
    case 'UTILITY':
      return 'utility';
    case 'AUTHENTICATION':
      return 'authentication';
    default:
      // Unknown -> 'utility' is the safest billable default for a template.
      return 'utility';
  }
}

/** Meta pricing.category on a status callback -> our billable MessageCategory (or undefined). */
export function mapPricingCategory(raw: unknown): MessageCategory | undefined {
  switch (String(raw ?? '').toLowerCase()) {
    case 'marketing':
      return 'marketing';
    case 'utility':
      return 'utility';
    case 'authentication':
    case 'authentication_international':
      return 'authentication';
    case 'service':
      return 'service';
    default:
      return undefined;
  }
}

/** Meta quality rating (GREEN/YELLOW/RED) -> our lowercase QualityRating. */
export function mapQualityRating(raw: unknown): QualityRating {
  switch (String(raw ?? '').toUpperCase()) {
    case 'GREEN':
      return 'green';
    case 'YELLOW':
      return 'yellow';
    case 'RED':
      return 'red';
    default:
      return 'unknown';
  }
}

/** Meta messaging limit (TIER_1K, …) -> our normalized MessagingTier. */
export function mapMessagingTier(raw: unknown): MessagingTier {
  switch (String(raw ?? '').toUpperCase()) {
    case 'TIER_50':
      return 'tier_50';
    case 'TIER_250':
      return 'tier_250';
    case 'TIER_1K':
      return 'tier_1k';
    case 'TIER_10K':
      return 'tier_10k';
    case 'TIER_100K':
      return 'tier_100k';
    case 'TIER_UNLIMITED':
      return 'tier_unlimited';
    default:
      return 'unknown';
  }
}

/** Parse GET /{phone_number_id}?fields=quality_rating[,messaging_limit_tier] into a quality result. */
export function parsePhoneNumberQuality(body: unknown): PhoneNumberQuality {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  const out: PhoneNumberQuality = {};
  if (b.quality_rating !== undefined) out.rating = mapQualityRating(b.quality_rating);
  // Some Graph versions expose the tier on the node; tolerate its absence.
  if (b.messaging_limit_tier !== undefined) out.tier = mapMessagingTier(b.messaging_limit_tier);
  return out;
}

/** Meta message status string -> our MessageStatus (sent/delivered/read/failed). */
export function mapMessageStatus(raw: unknown): MessageStatus {
  switch (String(raw ?? '').toLowerCase()) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
    case 'deleted':
      return 'failed';
    default:
      // Unknown -> 'sent' (most conservative non-terminal). applyStatusUpdate enforces
      // monotonic transitions, so this can never regress an already-advanced status.
      return 'sent';
  }
}

/** Meta inbound message `type` -> our MessageType union (others -> 'unknown'). */
export function mapInboundType(raw: unknown): MessageType {
  const t = String(raw ?? '').toLowerCase();
  switch (t) {
    case 'text':
    case 'image':
    case 'document':
    case 'audio':
    case 'video':
    case 'sticker':
    case 'location':
    case 'contacts':
    case 'interactive':
    case 'button':
    case 'reaction':
      return t;
    default:
      return 'unknown';
  }
}

/** Meta webhook timestamps are in SECONDS; convert to epoch ms. Tolerates ms or strings. */
export function toEpochMs(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return Date.now();
  }
  // Heuristic: anything below ~10^12 is seconds; >= is already ms.
  return n < 1_000_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

// ---------------------------------------------------------------------------
// Outbound: build Meta Cloud API POST /{phone_number_id}/messages bodies
// ---------------------------------------------------------------------------

/** Free-text send body. */
export function buildTextBody(input: SendTextInput): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    // Meta requires the recipient as E.164 ('+<digits>'); normalize so bare-digit phones
    // (e.g. inbound-stored contacts) are accepted, not just '+'-prefixed ones.
    to: toE164(input.toPhone),
    type: 'text',
    text: { body: input.body },
  };
}

/**
 * Read-receipt + typing-indicator body. Meta couples the two: to render a typing bubble you mark
 * the triggering inbound message read AND set `typing_indicator` on the SAME /messages call. There
 * is no recipient/`to` field — the target is implied by `message_id`. The bubble clears on our next
 * message to that user or after ~25s, whichever comes first.
 */
export function buildTypingIndicatorBody(input: MarkReadAndTypeInput): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: input.messageId,
    typing_indicator: { type: 'text' },
  };
}

/** Interactive send body (list / reply-buttons / cta_url). The caller supplies the full
 *  WhatsApp `interactive` object; we only add messaging_product + recipient + type. */
export function buildInteractiveBody(input: SendInteractiveInput): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to: toE164(input.toPhone),
    type: 'interactive',
    interactive: input.interactive,
  };
}

/**
 * Template send body. Phase 1: positional BODY text parameters only (mapped in order).
 * Header / button / media params are a later phase.
 */
export function buildTemplateBody(input: SendTemplateInput): Record<string, unknown> {
  const components: Array<Record<string, unknown>> = [];

  // Media header (image/video/document templates): Meta needs a HEADER component whose single
  // parameter carries the media by id (preferred) or public link. Omitting it on a media-header
  // template is exactly the #132012 "expected IMAGE, received UNKNOWN" rejection. Header goes
  // first so the components array mirrors the template's own component order.
  if (input.header) {
    const kind = input.header.format.toLowerCase(); // 'image' | 'video' | 'document'
    const media: Record<string, unknown> = input.header.mediaId
      ? { id: input.header.mediaId }
      : { link: input.header.link };
    if (kind === 'document' && input.header.filename) media.filename = input.header.filename;
    components.push({ type: 'header', parameters: [{ type: kind, [kind]: media }] });
  }

  if (input.variables.length > 0) {
    components.push({
      type: 'body',
      parameters: input.variables.map((v) => ({ type: 'text', text: v })),
    });
  }
  return {
    messaging_product: 'whatsapp',
    to: toE164(input.toPhone),
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

/**
 * Media send body (image/document/audio/video/sticker) addressed by `link` OR `id`.
 * caption applies to image/video/document; filename applies to document.
 */
export function buildMediaBody(input: SendMediaInput): Record<string, unknown> {
  const media: Record<string, unknown> = {};
  if (input.mediaId) media.id = input.mediaId;
  else if (input.link) media.link = input.link;
  if (input.caption && input.mediaType !== 'audio' && input.mediaType !== 'sticker') {
    media.caption = input.caption;
  }
  if (input.filename && input.mediaType === 'document') {
    media.filename = input.filename;
  }
  return {
    messaging_product: 'whatsapp',
    to: toE164(input.toPhone),
    type: input.mediaType,
    [input.mediaType]: media,
  };
}

/**
 * Extract the wamid from a successful send response.
 * Shape: { messaging_product, contacts:[...], messages:[{ id: 'wamid....' }] }.
 */
export function parseSendResponse(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const messages = (body as Record<string, unknown>).messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const first = messages[0] as Record<string, unknown>;
    if (typeof first.id === 'string' && first.id.length > 0) {
      return first.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Templates fetch: GET /{waba_id}/message_templates
// ---------------------------------------------------------------------------

/** Count distinct positional {{n}} placeholders in a template body string. */
function countBodyVariables(text: string): number {
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g);
  if (!matches) return 0;
  return new Set(matches.map((m) => m.replace(/[^\d]/g, ''))).size;
}

/** Pull the BODY component text out of a Meta template `components` array. */
function extractBodyText(components: unknown): string | undefined {
  if (!Array.isArray(components)) return undefined;
  for (const c of components) {
    if (c && typeof c === 'object') {
      const comp = c as Record<string, unknown>;
      if (String(comp.type ?? '').toUpperCase() === 'BODY' && typeof comp.text === 'string') {
        return comp.text;
      }
    }
  }
  return undefined;
}

/** Map one Meta template object (data[] element) to Normalized, or null if unusable. */
export function mapTemplate(raw: unknown): NormalizedTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const name = typeof t.name === 'string' ? t.name : undefined;
  if (!name) return null;

  const components = t.components;
  const bodyText = extractBodyText(components);

  return {
    name,
    language: typeof t.language === 'string' ? t.language : 'en_US',
    status: mapTemplateStatus(t.status),
    category: mapTemplateCategory(t.category),
    bspTemplateId: t.id != null ? String(t.id) : undefined,
    components,
    variableCount: bodyText ? countBodyVariables(bodyText) : 0,
  };
}

/** Map the full GET /message_templates response (`{ data: [...] }`) into Normalized templates. */
export function mapTemplatesResponse(body: unknown): NormalizedTemplate[] {
  if (!body || typeof body !== 'object') return [];
  const data = (body as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];
  const out: NormalizedTemplate[] = [];
  for (const item of data) {
    const mapped = mapTemplate(item);
    if (mapped) out.push(mapped);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Template authoring: build POST /{waba_id}/message_templates create/edit bodies
// ---------------------------------------------------------------------------

/** Ordered list of distinct positional placeholders (1,2,3,…) appearing in a text. */
function placeholderOrder(text: string): number[] {
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g);
  if (!matches) return [];
  const nums = matches.map((m) => Number(m.replace(/[^\d]/g, '')));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

/** Map one provider-neutral button def to a Meta BUTTONS entry. */
function buildButton(b: NonNullable<TemplateDefinition['buttons']>[number]): Record<string, unknown> {
  if (b.type === 'URL') {
    const out: Record<string, unknown> = { type: 'URL', text: b.text, url: b.url ?? '' };
    // A URL button with a trailing {{1}} needs a sample full URL for Meta to approve it.
    if (typeof b.url === 'string' && /\{\{\s*\d+\s*\}\}/.test(b.url)) {
      out.example = [b.url.replace(/\{\{\s*\d+\s*\}\}/g, 'example')];
    }
    return out;
  }
  if (b.type === 'PHONE_NUMBER') {
    return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber ?? '' };
  }
  return { type: 'QUICK_REPLY', text: b.text };
}

/**
 * Build the Meta create/edit template payload from our TemplateDefinition.
 * Components: optional HEADER (TEXT, or IMAGE/VIDEO/DOCUMENT via a resumable-upload handle in the
 * example), required BODY (+ example samples when it has placeholders), optional FOOTER, optional
 * BUTTONS (CTA URL/PHONE_NUMBER or quick-reply).
 *
 * Backward-compat: when `headerFormat`/`headerHandle`/`buttons` are all absent (every text-only
 * template) the HEADER falls through to the original TEXT path and no BUTTONS are emitted — the
 * payload is identical to before this feature.
 *
 * @throws when the body has placeholders but the supplied sample count doesn't match.
 */
export function buildCreateTemplateBody(def: TemplateDefinition): Record<string, unknown> {
  const components: Array<Record<string, unknown>> = [];

  // Media header (image/video/document) carries the sample as a resumable-upload file handle;
  // a plain text header keeps the original TEXT shape (used whenever headerFormat is unset).
  if (def.headerFormat && def.headerHandle) {
    components.push({
      type: 'HEADER',
      format: def.headerFormat,
      example: { header_handle: [def.headerHandle] },
    });
  } else if (def.header && def.header.trim().length > 0) {
    components.push({ type: 'HEADER', format: 'TEXT', text: def.header });
  }

  const body: Record<string, unknown> = { type: 'BODY', text: def.body };
  const placeholders = placeholderOrder(def.body);
  if (placeholders.length > 0) {
    const samples = def.variableSamples ?? [];
    if (samples.length !== placeholders.length) {
      throw new BspError(
        'bsp_bad_request',
        `Template body has ${placeholders.length} variable(s) but ${samples.length} sample(s) were provided`,
      );
    }
    // Meta wants samples in placeholder order as a single example row.
    body.example = { body_text: [samples] };
  }
  components.push(body);

  if (def.footer && def.footer.trim().length > 0) {
    components.push({ type: 'FOOTER', text: def.footer });
  }

  if (def.buttons && def.buttons.length > 0) {
    components.push({ type: 'BUTTONS', buttons: def.buttons.map(buildButton) });
  }

  return {
    name: def.name,
    language: def.language,
    category: def.category.toUpperCase(),
    components,
  };
}

/**
 * The edit payload (POST /{message_template_id}) is the same component set WITHOUT name/language/
 * category (those are immutable on edit).
 */
export function buildEditTemplateBody(def: TemplateDefinition): Record<string, unknown> {
  const full = buildCreateTemplateBody(def);
  return { components: full.components };
}

/** Parse a create/edit response: `{ id, status, category }`. status defaults to 'pending'. */
export function parseTemplateMutationResponse(body: unknown): TemplateMutationResult {
  if (!body || typeof body !== 'object') return { status: 'pending' };
  const b = body as Record<string, unknown>;
  return {
    bspTemplateId: b.id != null ? String(b.id) : undefined,
    status: b.status != null ? mapTemplateStatus(b.status) : 'pending',
  };
}

// ---------------------------------------------------------------------------
// Inbound + status webhook parsing (canonical Meta envelope)
// ---------------------------------------------------------------------------

/** Best-effort plaintext body for a single inbound message of any supported type. */
function extractInboundBody(msg: Record<string, unknown>, type: MessageType): string | undefined {
  switch (type) {
    case 'text': {
      const text = msg.text as Record<string, unknown> | undefined;
      return typeof text?.body === 'string' ? text.body : undefined;
    }
    case 'button': {
      const btn = msg.button as Record<string, unknown> | undefined;
      return typeof btn?.text === 'string' ? btn.text : undefined;
    }
    case 'interactive': {
      const inter = msg.interactive as Record<string, unknown> | undefined;
      const reply =
        (inter?.button_reply as Record<string, unknown> | undefined) ??
        (inter?.list_reply as Record<string, unknown> | undefined);
      if (typeof reply?.title === 'string') return reply.title;
      // Flow completion (nfm_reply): show its human label ("body", e.g. "Sent") in the inbox.
      const nfm = inter?.nfm_reply as Record<string, unknown> | undefined;
      if (typeof nfm?.body === 'string') return nfm.body;
      return undefined;
    }
    case 'reaction': {
      const r = msg.reaction as Record<string, unknown> | undefined;
      return typeof r?.emoji === 'string' ? r.emoji : undefined;
    }
    default:
      // media/location/contacts/unknown have no inline text in Phase 1.
      return undefined;
  }
}

/**
 * Machine-routable reply token, when the inbound is a reply a bot should act on:
 * - interactive list/button reply -> the reply `id`
 * - flow completion (nfm_reply)   -> the `response_json` payload
 * - template quick-reply button   -> the button `payload`
 * Returns undefined for plain messages (text/media/etc.).
 */
function extractInboundReplyId(msg: Record<string, unknown>, type: MessageType): string | undefined {
  switch (type) {
    case 'interactive': {
      const inter = msg.interactive as Record<string, unknown> | undefined;
      const reply =
        (inter?.button_reply as Record<string, unknown> | undefined) ??
        (inter?.list_reply as Record<string, unknown> | undefined);
      if (typeof reply?.id === 'string') return reply.id;
      const nfm = inter?.nfm_reply as Record<string, unknown> | undefined;
      return typeof nfm?.response_json === 'string' ? nfm.response_json : undefined;
    }
    case 'button': {
      const btn = msg.button as Record<string, unknown> | undefined;
      return typeof btn?.payload === 'string' ? btn.payload : undefined;
    }
    default:
      return undefined;
  }
}

/** Index contacts[] by wa_id so we can attach a profile name to each message. */
function buildContactNameIndex(value: Record<string, unknown>): Map<string, string> {
  const index = new Map<string, string>();
  const contacts = value.contacts;
  if (Array.isArray(contacts)) {
    for (const c of contacts) {
      if (c && typeof c === 'object') {
        const contact = c as Record<string, unknown>;
        const waId = typeof contact.wa_id === 'string' ? contact.wa_id : undefined;
        const profile = contact.profile as Record<string, unknown> | undefined;
        const profileName = typeof profile?.name === 'string' ? profile.name : undefined;
        if (waId && profileName) index.set(waId, profileName);
      }
    }
  }
  return index;
}

/** Parse one inbound `messages[]` entry into a NormalizedInboundMessage. */
function parseInboundMessage(
  raw: unknown,
  phoneNumberId: string,
  nameIndex: Map<string, string>,
): NormalizedInboundMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as Record<string, unknown>;

  const from = typeof msg.from === 'string' ? msg.from : undefined;
  const id = typeof msg.id === 'string' ? msg.id : undefined;
  if (!from || !id) return null; // can't route / dedup without both.

  const type = mapInboundType(msg.type);

  return {
    phoneNumberId,
    fromPhone: from,
    contactName: nameIndex.get(from),
    bspMessageId: id,
    type,
    body: extractInboundBody(msg, type),
    replyId: extractInboundReplyId(msg, type),
    ts: toEpochMs(msg.timestamp),
  };
}

/** Parse one `statuses[]` entry into a NormalizedStatusUpdate. */
function parseStatusUpdate(raw: unknown, phoneNumberId: string): NormalizedStatusUpdate | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  const id = typeof s.id === 'string' ? s.id : undefined;
  if (!id) return null; // wamid is required to match our message.

  const pricing = s.pricing as Record<string, unknown> | undefined;
  const category = mapPricingCategory(pricing?.category);

  let error: NormalizedStatusUpdate['error'];
  const errors = s.errors;
  if (Array.isArray(errors) && errors.length > 0 && errors[0] && typeof errors[0] === 'object') {
    const e = errors[0] as Record<string, unknown>;
    const errData = e.error_data as Record<string, unknown> | undefined;
    error = {
      code: e.code != null ? String(e.code) : undefined,
      title: typeof e.title === 'string' ? e.title : undefined,
      detail:
        typeof e.message === 'string'
          ? e.message
          : typeof errData?.details === 'string'
            ? errData.details
            : undefined,
    };
  }

  return {
    phoneNumberId,
    bspMessageId: id,
    status: mapMessageStatus(s.status),
    ts: toEpochMs(s.timestamp),
    recipientPhone: typeof s.recipient_id === 'string' ? s.recipient_id : undefined,
    category,
    error,
  };
}

/**
 * Parse one `message_template_status_update` change value into a NormalizedTemplateStatusUpdate.
 * Meta value shape: { event, message_template_id, message_template_name, message_template_language,
 * reason }. `event` is the new status; `reason` is 'NONE' (-> undefined) or a rejection reason.
 */
function parseTemplateStatusUpdate(
  value: Record<string, unknown>,
  wabaId: string,
): NormalizedTemplateStatusUpdate | null {
  const templateName =
    typeof value.message_template_name === 'string' ? value.message_template_name : undefined;
  if (!templateName) return null; // can't match a doc without the name.

  const rawReason = typeof value.reason === 'string' ? value.reason : undefined;
  const reason = rawReason && rawReason.toUpperCase() !== 'NONE' ? rawReason : undefined;

  return {
    wabaId: wabaId || undefined,
    bspTemplateId:
      value.message_template_id != null ? String(value.message_template_id) : undefined,
    templateName,
    status: mapTemplateStatus(value.event),
    reason,
    ts: Date.now(),
  };
}

/**
 * Parse one `phone_number_quality_update` change value into a NormalizedQualityUpdate.
 * Meta value shape: { display_phone_number, event, current_limit } and (some versions)
 * quality_rating. We route by phone_number_id (metadata) or the entry WABA id.
 */
function parseQualityUpdate(
  value: Record<string, unknown>,
  phoneNumberId: string,
  wabaId: string,
): NormalizedQualityUpdate {
  return {
    phoneNumberId: phoneNumberId || undefined,
    wabaId: wabaId || undefined,
    rating: value.quality_rating !== undefined ? mapQualityRating(value.quality_rating) : undefined,
    tier: value.current_limit !== undefined ? mapMessagingTier(value.current_limit) : undefined,
    event: typeof value.event === 'string' ? value.event : undefined,
    ts: Date.now(),
  };
}

/**
 * Parse a raw (already-verified) Meta webhook body into normalized inbound + status +
 * template-status + quality arrays. Tolerant of batching (multiple entries / changes / messages /
 * statuses) and missing fields; never throws.
 */
export function parseWebhookBody(body: unknown): ParsedWebhook {
  const inbound: NormalizedInboundMessage[] = [];
  const statuses: NormalizedStatusUpdate[] = [];
  const templateStatuses: NormalizedTemplateStatusUpdate[] = [];
  const qualityUpdates: NormalizedQualityUpdate[] = [];

  if (!body || typeof body !== 'object') {
    return { inbound, statuses, templateStatuses, qualityUpdates };
  }

  const entries = (body as Record<string, unknown>).entry;
  if (!Array.isArray(entries)) {
    return { inbound, statuses, templateStatuses, qualityUpdates };
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    // entry.id is the Meta WABA id on template/account change events.
    const entryWabaId = typeof e.id === 'string' ? e.id : '';
    const changes = e.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const field = (change as Record<string, unknown>).field;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;

      // Template approval-status changes carry no phone_number_id; route by WABA id instead.
      if (field === 'message_template_status_update') {
        const parsed = parseTemplateStatusUpdate(v, entryWabaId);
        if (parsed) templateStatuses.push(parsed);
        continue;
      }

      const metadata = v.metadata as Record<string, unknown> | undefined;
      const phoneNumberId =
        typeof metadata?.phone_number_id === 'string' ? metadata.phone_number_id : '';

      // Phone-number quality/limit changes — route by phone_number_id or the entry WABA id.
      if (field === 'phone_number_quality_update') {
        qualityUpdates.push(parseQualityUpdate(v, phoneNumberId, entryWabaId));
        continue;
      }

      const nameIndex = buildContactNameIndex(v);

      const messages = v.messages;
      if (Array.isArray(messages)) {
        for (const m of messages) {
          const parsed = parseInboundMessage(m, phoneNumberId, nameIndex);
          if (parsed) inbound.push(parsed);
        }
      }

      const statusArr = v.statuses;
      if (Array.isArray(statusArr)) {
        for (const st of statusArr) {
          const parsed = parseStatusUpdate(st, phoneNumberId);
          if (parsed) statuses.push(parsed);
        }
      }
    }
  }

  return { inbound, statuses, templateStatuses, qualityUpdates };
}
