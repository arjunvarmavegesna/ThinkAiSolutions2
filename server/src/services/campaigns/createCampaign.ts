/**
 * Enqueue a broadcast campaign (feature 1.2). This REPLACES the old synchronous send: instead
 * of looping sends in the request, we persist a `queued` campaign + a `recipients` subcollection
 * and return immediately. The campaignWorker drains it in the background through the SAME
 * per-message debit/send pipeline, so billing + message docs are unchanged.
 *
 * Audience: an explicit `recipients` list wins; otherwise the `segment` is resolved from contacts
 * (opt-out always excluded). A future `scheduledAt` keeps the campaign queued until it is due.
 */

import { randomUUID } from 'node:crypto';

import { containsMergeTag } from '@thinkai/shared';
import type { CreateCampaignRequest, CreateCampaignResponse } from '@thinkai/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { resolveSegment, type ResolvedRecipient } from './resolveSegment';

/** Reduce a phone to digits so the recipient list de-dupes by number (the recipient row id). */
function recipientDocId(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 ? digits : phone.replace(/[^\w]/g, '_');
}

/** Chunk recipient inserts to keep each createMany statement a reasonable size. */
const WRITE_CHUNK = 1000;

export async function createCampaign(
  tenantId: string,
  input: CreateCampaignRequest,
): Promise<CreateCampaignResponse> {
  // Pre-flight: the template must exist + be approved, so we never queue a doomed campaign.
  const tpl = await prisma.template.findUnique({
    where: { tenantId_id: { tenantId, id: input.templateName } },
  });
  if (!tpl || tpl.status !== 'approved') {
    throw AppError.badRequest(
      `Template '${input.templateName}' is not approved`,
      'template_not_approved',
    );
  }

  // Merge tags resolve from contact records, which a pasted-numbers ("recipients") audience does
  // not have. Reject early so we never queue a campaign that would deliver raw "{{contact.*}}" text
  // to a customer. (createCampaignSchema enforces the same at the API boundary; this guard also
  // covers any direct service caller.)
  const isListAudience = !!(input.recipients && input.recipients.length > 0);
  if (isListAudience && input.variables.some(containsMergeTag)) {
    throw AppError.badRequest(
      'Merge tags like {{contact.name}} need a contact segment — pasted numbers have no contact records to personalize from.',
      'merge_tag_requires_segment',
    );
  }

  // Resolve the audience. An explicit recipients list takes precedence over a segment.
  let resolved: ResolvedRecipient[];
  if (input.recipients && input.recipients.length > 0) {
    resolved = input.recipients.map((r) => ({ phone: r.trim() })).filter((r) => r.phone.length > 0);
  } else if (input.segment) {
    resolved = await resolveSegment(tenantId, input.segment);
  } else {
    throw AppError.badRequest('Provide either a recipients list or a segment', 'no_audience');
  }

  // De-dupe by sanitized phone id.
  const byId = new Map<string, ResolvedRecipient>();
  for (const r of resolved) {
    if (!r.phone) continue;
    const id = recipientDocId(r.phone);
    if (!byId.has(id)) byId.set(id, r);
  }
  if (byId.size === 0) {
    const hint = input.segment
      ? " — no contacts match. Check your tags, or uncheck 'Only opted-in' (newly added contacts are 'unknown' opt-in)."
      : '.';
    throw AppError.badRequest(`The audience resolved to zero recipients${hint}`, 'no_recipients');
  }

  const now = Date.now();
  const scheduledAt = input.scheduledAt && input.scheduledAt > now ? input.scheduledAt : now;

  const campaignId = randomUUID();
  await prisma.campaign.create({
    data: {
      tenantId,
      id: campaignId,
      title: input.title,
      channel: 'whatsapp',
      templateName: input.templateName,
      languageCode: input.languageCode,
      status: 'queued',
      totalRecipients: byId.size,
      submitted: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      // Store the RAW variable strings (merge tags unresolved); resolution is per recipient at send
      // time (processCampaign). 'per_contact' when any variable is a merge tag, else 'static'.
      variables: input.variables,
      templateVariablesMode: input.variables.some(containsMergeTag) ? 'per_contact' : 'static',
      scheduledAt: msBig(scheduledAt),
      createdAt: msBig(now),
      ...(input.segment ? { segment: input.segment as Prisma.InputJsonValue } : {}),
    },
  });

  // Write the recipient rows (status 'pending') in chunks.
  const entries = [...byId.entries()];
  for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
    await prisma.campaignRecipient.createMany({
      data: entries.slice(i, i + WRITE_CHUNK).map(([id, r]) => ({
        tenantId,
        campaignId,
        id,
        phone: r.phone,
        status: 'pending',
        updatedAt: msBig(now),
        ...(r.contactId ? { contactId: r.contactId } : {}),
        // Snapshot the contact name NOW so the send loop resolves {{contact.name}} without an extra
        // read. For a scheduled campaign this is the name as of creation, not send (Phase 1).
        ...(r.name ? { name: r.name } : {}),
      })),
    });
  }

  logger.info(
    { tenantId, campaignId, recipients: byId.size, scheduledAt },
    'createCampaign: enqueued',
  );

  return { campaignId, total: byId.size, status: 'queued' };
}
