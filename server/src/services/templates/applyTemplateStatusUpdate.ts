/**
 * Apply a Meta `message_template_status_update` webhook event to the local Template doc.
 *
 * The event carries the Meta WABA id (not a phone_number_id), so we reverse-map it to a tenant
 * via resolveWabaByWabaId, then update the matching template (keyed by name) with the new status
 * and rejection reason. Idempotent — re-delivery just re-writes the same status.
 *
 * Called from routes/webhooks/meta.ts after signature verification; errors propagate to the
 * route's allSettled (a single failure never aborts the batch or changes the 200 ACK).
 */

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';
import { resolveWabaByWabaId } from '../bsp';
import type { NormalizedTemplateStatusUpdate } from '../bsp/types';

export async function applyTemplateStatusUpdate(
  update: NormalizedTemplateStatusUpdate,
): Promise<void> {
  const link = await resolveWabaByWabaId(update.wabaId);
  if (!link) return; // unknown WABA (already logged by the resolver).

  const existing = await prisma.template.findUnique({
    where: { tenantId_id: { tenantId: link.tenantId, id: update.templateName } },
  });
  if (!existing) {
    // The tenant may not have authored this in-console (e.g. created directly in Meta and not
    // yet synced). Nothing to update — a /sync will pull it in.
    logger.info(
      { tenantId: link.tenantId, name: update.templateName, status: update.status },
      'templateStatus: no local template doc; skipping',
    );
    return;
  }

  await prisma.template.update({
    where: { tenantId_id: { tenantId: link.tenantId, id: update.templateName } },
    data: {
      status: update.status,
      // Keep a rejection reason only while rejected; clear it (null) on any other transition.
      rejectionReason:
        update.status === 'rejected' && update.reason ? update.reason : null,
      ...(update.bspTemplateId ? { bspTemplateId: update.bspTemplateId } : {}),
      updatedAt: msBig(update.ts),
    },
  });

  logger.info(
    { tenantId: link.tenantId, name: update.templateName, status: update.status },
    'templateStatus: applied',
  );
}
