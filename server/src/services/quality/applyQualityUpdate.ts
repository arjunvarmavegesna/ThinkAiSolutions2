/**
 * Apply a `phone_number_quality_update` webhook event to the owning WABA (feature 3.1).
 *
 * Routes by phone_number_id (preferred) or the entry WABA id, then updates the WABA doc's
 * quality rating / messaging tier and appends a `qualityHistory` snapshot for the trend panel.
 * Best-effort + idempotent-enough: re-delivery just re-writes the same values + adds a history
 * row (history is an append-only audit, so duplicates are harmless).
 *
 * Called from routes/webhooks/meta.ts after signature verification; errors propagate to the
 * route's allSettled (a single failure never aborts the batch or changes the 200 ACK).
 */

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';
import { resolveWabaByPhoneNumberId, resolveWabaByWabaId } from '../bsp';
import type { NormalizedQualityUpdate } from '../bsp/types';

export async function applyQualityUpdate(update: NormalizedQualityUpdate): Promise<void> {
  const link =
    (await resolveWabaByPhoneNumberId(update.phoneNumberId)) ??
    (await resolveWabaByWabaId(update.wabaId));
  if (!link) return; // unknown number/WABA (already logged by the resolver).

  // Patch only the fields the event actually carried.
  await prisma.waba.update({
    where: { tenantId_id: { tenantId: link.tenantId, id: link.wabaDocId } },
    data: {
      qualityUpdatedAt: msBig(update.ts),
      updatedAt: msBig(Date.now()),
      ...(update.rating ? { qualityRating: update.rating } : {}),
      ...(update.tier ? { messagingTier: update.tier } : {}),
    },
  });

  await prisma.wabaQualityHistory.create({
    data: {
      tenantId: link.tenantId,
      wabaId: link.wabaDocId,
      source: 'webhook',
      ts: msBig(update.ts),
      ...(update.rating ? { rating: update.rating } : {}),
      ...(update.tier ? { tier: update.tier } : {}),
      ...(update.event ? { event: update.event } : {}),
    },
  });

  logger.info(
    { tenantId: link.tenantId, wabaDocId: link.wabaDocId, rating: update.rating, tier: update.tier, event: update.event },
    'quality: applied webhook update',
  );
}
