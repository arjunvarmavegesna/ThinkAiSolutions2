/**
 * Sync this tenant's WhatsApp message templates from the BSP into Firestore.
 *
 * This is how approved templates enter our system: the reseller admin (or an onboarding
 * step) triggers a sync, we fetch the WABA's templates from the BSP, and upsert each one
 * as a template doc keyed by its NAME (template names are unique within a WABA, and the
 * send path looks templates up by name).
 *
 * The BSP layer already normalizes Meta status + category strings into our
 * lowercase enums (see services/bsp/metaCloud.mapping.ts), so here we only persist the
 * NormalizedTemplate fields onto the Template document shape.
 */

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveTenantBspContext } from '../bsp';

export async function syncTemplates(tenantId: string): Promise<number> {
  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  const templates = await provider.getTemplates(ctx);
  const now = msBig(Date.now());

  // One transaction of upserts; the template id is the name so the send path can fetch by name
  // directly and repeat syncs overwrite in place rather than duplicating. The update clause
  // preserves any locally-set fields (e.g. a stored body) across syncs.
  await prisma.$transaction(
    templates.map((t) => {
      const fields = {
        name: t.name,
        category: t.category,
        language: t.language,
        status: t.status,
        ...(t.bspTemplateId !== undefined ? { bspTemplateId: t.bspTemplateId } : {}),
        // `components` is an opaque blob for a future send modal; keep it JSON-encoded (a string)
        // exactly as before so downstream consumers JSON.parse it identically.
        ...(t.components !== undefined ? { components: JSON.stringify(t.components) } : {}),
        ...(t.variableCount !== undefined ? { variableCount: t.variableCount } : {}),
        updatedAt: now,
      };
      return prisma.template.upsert({
        where: { tenantId_id: { tenantId, id: t.name } },
        create: { tenantId, id: t.name, ...fields },
        update: fields,
      });
    }),
  );

  logger.info({ tenantId, count: templates.length }, 'syncTemplates: upserted templates');
  return templates.length;
}
