/**
 * Build the Quality Signal panel for a tenant (feature 3.1): each WABA's current rating + tier
 * (stored on the WABA doc, fed by webhooks) plus its recent history. With `refresh=true` we also
 * pull the live `quality_rating` from Meta per number (on-demand) and persist it before reading.
 *
 * WhatsApp-specific signal: gated to metaCloud WABAs; another channel would surface its own.
 */

import type {
  MessagingTier,
  QualityHistoryEntry,
  QualityRating,
  QualityResponse,
  QualityWabaDTO,
  WabaStatus,
} from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig, msNum } from '../../db/serde';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveBspContextByWaba } from '../bsp';

const HISTORY_LIMIT = 20;

/** Pull live quality from Meta for one WABA and persist it (rating/tier + a history row). */
async function refreshWaba(tenantId: string, wabaDocId: string): Promise<void> {
  const { ctx, provider } = await resolveBspContextByWaba(tenantId, wabaDocId);
  const quality = await getBspProvider(provider).getPhoneNumberQuality(ctx);
  if (!quality.rating && !quality.tier) return;

  const now = Date.now();
  await prisma.waba.update({
    where: { tenantId_id: { tenantId, id: wabaDocId } },
    data: {
      qualityUpdatedAt: msBig(now),
      updatedAt: msBig(now),
      ...(quality.rating ? { qualityRating: quality.rating } : {}),
      ...(quality.tier ? { messagingTier: quality.tier } : {}),
    },
  });

  await prisma.wabaQualityHistory.create({
    data: {
      tenantId,
      wabaId: wabaDocId,
      source: 'refresh',
      ts: msBig(now),
      ...(quality.rating ? { rating: quality.rating } : {}),
      ...(quality.tier ? { tier: quality.tier } : {}),
    },
  });
}

export async function getTenantQuality(
  tenantId: string,
  refresh: boolean,
): Promise<QualityResponse> {
  const wabaRows = await prisma.waba.findMany({ where: { tenantId } });

  // Optional live refresh per WABA (best-effort; a failure leaves the stored value in place).
  if (refresh) {
    await Promise.allSettled(
      wabaRows.map(async ({ id }) => {
        try {
          await refreshWaba(tenantId, id);
        } catch (err) {
          logger.warn({ tenantId, wabaDocId: id, err: (err as Error)?.message }, 'quality: refresh failed');
        }
      }),
    );
  }

  // Re-read after refresh + load each WABA's recent history.
  const wabas: QualityWabaDTO[] = await Promise.all(
    wabaRows.map(async ({ id }) => {
      const waba = await prisma.waba.findUnique({ where: { tenantId_id: { tenantId, id } } });
      const histRows = await prisma.wabaQualityHistory.findMany({
        where: { tenantId, wabaId: id },
        orderBy: { ts: 'desc' },
        take: HISTORY_LIMIT,
      });
      const history: QualityHistoryEntry[] = histRows.map((h) => ({
        source: h.source as QualityHistoryEntry['source'],
        ts: msNum(h.ts) as number,
        ...(h.rating ? { rating: h.rating as QualityRating } : {}),
        ...(h.tier ? { tier: h.tier as MessagingTier } : {}),
        ...(h.event ? { event: h.event } : {}),
      }));
      return {
        id,
        phoneNumber: waba?.phoneNumber ?? '',
        displayName: waba?.displayName ?? '',
        status: (waba?.status ?? 'pending') as WabaStatus,
        qualityRating: (waba?.qualityRating ?? 'unknown') as QualityRating,
        messagingTier: (waba?.messagingTier ?? 'unknown') as MessagingTier,
        qualityUpdatedAt: msNum(waba?.qualityUpdatedAt ?? null),
        history,
      };
    }),
  );

  return { wabas };
}
