/**
 * Row -> domain mappers for the Postgres data layer.
 *
 * Prisma returns columns with `bigint` timestamps and `null` for absent optionals; the
 * domain types (shared/src/types/firestore.ts) use `number` timestamps and OMIT absent
 * optionals (mirroring how Firestore docs stored only present fields). These helpers
 * convert at the boundary so the rest of the server keeps the exact shapes it had before.
 */

import type {
  Campaign,
  CampaignRecipient,
  Contact,
  Conversation,
  Message,
  MessageError,
  Pricing,
  Template,
  WithId,
} from '@thinkai/shared';
import type {
  Campaign as PCampaign,
  CampaignRecipient as PCampaignRecipient,
  Contact as PContact,
  Conversation as PConversation,
  Message as PMessage,
  Pricing as PPricing,
  Template as PTemplate,
} from '@prisma/client';

import { msNum } from './serde';

/** Drop keys whose value is `undefined` (built from null columns) so optionals stay omitted. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}

export function toMessage(row: PMessage): WithId<Message> {
  return compact({
    id: row.id,
    conversationId: row.conversationId,
    contactPhone: row.contactPhone,
    direction: row.direction as Message['direction'],
    channel: (row.channel ?? undefined) as Message['channel'],
    type: row.type as Message['type'],
    body: row.body ?? undefined,
    templateName: row.templateName ?? undefined,
    campaignId: row.campaignId ?? undefined,
    campaignRecipientId: row.campaignRecipientId ?? undefined,
    status: row.status as Message['status'],
    category: row.category as Message['category'],
    costPaise: row.costPaise,
    bspMessageId: row.bspMessageId ?? undefined,
    error: (row.error ?? undefined) as MessageError | undefined,
    ts: msNum(row.ts) as number,
  });
}

export function toConversation(row: PConversation): WithId<Conversation> {
  return compact({
    id: row.id,
    contactPhone: row.contactPhone,
    contactName: row.contactName ?? undefined,
    lastMessageAt: msNum(row.lastMessageAt) as number,
    lastMessagePreview: row.lastMessagePreview ?? undefined,
    windowExpiresAt: msNum(row.windowExpiresAt) as number,
    unreadCount: row.unreadCount,
    createdAt: msNum(row.createdAt) as number,
  });
}

export function toTemplate(row: PTemplate): WithId<Template> {
  return compact({
    id: row.id,
    name: row.name,
    category: row.category as Template['category'],
    language: row.language,
    body: row.body ?? undefined,
    status: row.status as Template['status'],
    channel: (row.channel ?? undefined) as Template['channel'],
    bspTemplateId: row.bspTemplateId ?? undefined,
    components: row.components ?? undefined,
    variableCount: row.variableCount ?? undefined,
    submittedAt: msNum(row.submittedAt),
    rejectionReason: row.rejectionReason ?? undefined,
    updatedAt: msNum(row.updatedAt) as number,
  });
}

export function toPricing(row: PPricing): Pricing {
  return {
    marketingPaise: row.marketingPaise,
    utilityPaise: row.utilityPaise,
    authPaise: row.authPaise,
    updatedAt: msNum(row.updatedAt) as number,
  };
}

export function toContact(row: PContact): WithId<Contact> {
  return compact({
    id: row.id,
    phone: row.phone,
    name: row.name ?? undefined,
    nameLower: row.nameLower ?? undefined,
    tags: row.tags,
    optInStatus: row.optInStatus as Contact['optInStatus'],
    attributes: (row.attributes ?? undefined) as Record<string, string> | undefined,
    source: (row.source ?? undefined) as Contact['source'],
    status: (row.status ?? undefined) as Contact['status'],
    channel: (row.channel ?? undefined) as Contact['channel'],
    createdAt: msNum(row.createdAt) as number,
    updatedAt: msNum(row.updatedAt) as number,
  });
}

export function toCampaign(row: PCampaign): WithId<Campaign> {
  return compact({
    id: row.id,
    title: row.title,
    channel: (row.channel ?? undefined) as Campaign['channel'],
    templateName: row.templateName,
    languageCode: row.languageCode,
    status: row.status as Campaign['status'],
    totalRecipients: row.totalRecipients,
    submitted: row.submitted,
    sent: row.sent,
    delivered: row.delivered,
    read: row.read ?? undefined,
    failed: row.failed,
    variables: row.variables,
    templateVariablesMode: (row.templateVariablesMode ?? undefined) as
      | Campaign['templateVariablesMode'],
    segment: (row.segment ?? undefined) as Campaign['segment'],
    scheduledAt: msNum(row.scheduledAt),
    startedAt: msNum(row.startedAt),
    completedAt: msNum(row.completedAt),
    createdAt: msNum(row.createdAt) as number,
  });
}

export function toCampaignRecipient(row: PCampaignRecipient): WithId<CampaignRecipient> {
  return compact({
    id: row.id,
    phone: row.phone,
    status: row.status as CampaignRecipient['status'],
    contactId: row.contactId ?? undefined,
    name: row.name ?? undefined,
    messageId: row.messageId ?? undefined,
    bspMessageId: row.bspMessageId ?? undefined,
    error: (row.error ?? undefined) as MessageError | undefined,
    updatedAt: msNum(row.updatedAt) as number,
  });
}
