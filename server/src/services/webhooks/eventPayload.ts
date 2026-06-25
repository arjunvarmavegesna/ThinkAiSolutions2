/**
 * Map our already-normalized Meta events into the CLEAN, documented event envelope we POST to a
 * tenant's callback URL. We deliberately never forward raw Meta payloads — clients integrate
 * against this stable schema only.
 *
 * Each builder also yields a DETERMINISTIC delivery id derived from the source event's natural
 * key (wamid / template name). That id is both the Firestore doc id (so a Meta redelivery
 * re-creates the same doc and is skipped — never forwarded twice) and the envelope `id` the
 * client can dedupe on.
 */

import { toE164 } from '@thinkai/shared';
import type {
  IncomingMessageEventData,
  MessageStatusEventData,
  TemplateStatusEventData,
  WebhookEventEnvelope,
  WebhookEventType,
} from '@thinkai/shared';

import type {
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
  NormalizedTemplateStatusUpdate,
} from '../bsp/types';

/** A fully-prepared delivery: what to store and the clean body to POST. */
export interface PreparedDelivery {
  eventType: WebhookEventType;
  /** The source event's natural key (wamid / template name), for traceability/logs. */
  eventId: string;
  /** Deterministic Firestore doc id == envelope.id (idempotency key). */
  deliveryId: string;
  envelope: WebhookEventEnvelope;
}

/** Build the 'incoming_message' delivery for an inbound customer message. */
export function prepareIncomingMessage(msg: NormalizedInboundMessage): PreparedDelivery {
  const deliveryId = `incoming_${msg.bspMessageId}`;
  const data: IncomingMessageEventData = {
    from: toE164(msg.fromPhone),
    messageId: msg.bspMessageId,
    type: msg.type,
    timestamp: msg.ts,
    ...(msg.body !== undefined ? { text: msg.body } : {}),
    ...(msg.replyId !== undefined ? { replyId: msg.replyId } : {}),
    ...(msg.contactName !== undefined ? { contactName: msg.contactName } : {}),
  };
  return {
    eventType: 'incoming_message',
    eventId: msg.bspMessageId,
    deliveryId,
    envelope: { id: deliveryId, event: 'incoming_message', createdAt: msg.ts, data },
  };
}

/** Build the 'message_status' delivery for an outbound message status callback. */
export function prepareMessageStatus(upd: NormalizedStatusUpdate): PreparedDelivery {
  // Dedupe per (message, status): redelivery of the same status is skipped, but each distinct
  // status Meta reports for a message is forwarded once.
  const deliveryId = `status_${upd.bspMessageId}_${upd.status}`;
  const data: MessageStatusEventData = {
    messageId: upd.bspMessageId,
    status: upd.status,
    timestamp: upd.ts,
    ...(upd.recipientPhone !== undefined ? { recipient: upd.recipientPhone } : {}),
    ...(upd.error !== undefined ? { error: upd.error } : {}),
  };
  return {
    eventType: 'message_status',
    eventId: upd.bspMessageId,
    deliveryId,
    envelope: { id: deliveryId, event: 'message_status', createdAt: upd.ts, data },
  };
}

/** Build the 'template_status' delivery for a template approval-status change. */
export function prepareTemplateStatus(upd: NormalizedTemplateStatusUpdate): PreparedDelivery {
  const deliveryId = `template_${upd.templateName}_${upd.status}`;
  const data: TemplateStatusEventData = {
    templateName: upd.templateName,
    status: upd.status,
    timestamp: upd.ts,
    ...(upd.reason !== undefined ? { reason: upd.reason } : {}),
  };
  return {
    eventType: 'template_status',
    eventId: upd.templateName,
    deliveryId,
    envelope: { id: deliveryId, event: 'template_status', createdAt: upd.ts, data },
  };
}
