/**
 * Reseller-admin: global usage / revenue / margin.
 *
 *   GET /api/admin/usage -> per-tenant rows + grand totals.
 *
 * For each tenant we aggregate its OUTBOUND BILLABLE messages (those that incurred a wallet
 * charge, i.e. costPaise > 0 — marketing/utility/authentication template sends; free-text
 * 'service' replies are costPaise 0 and excluded):
 *   - messageCount : number of billable messages
 *   - revenuePaise : sum of what we charged the tenant (the bare per-message debit)
 *   - costPaise    : sum of OUR BSP cost, looked up per category from pricingCost/{tenantId}
 *   - marginPaise  : revenuePaise - costPaise
 *
 * revenue is taken from the message's recorded `costPaise` (the charge actually debited) so
 * the figure stays correct even if the tenant's charge rates change later. cost is derived
 * from the current pricingCost doc; tenants without a cost doc report costPaise 0 (margin ==
 * revenue) until the admin sets their cost rates. All amounts are integer paise.
 */

import type { Request, Response } from 'express';

import type {
  MessageCategory,
  PricingCost,
  TenantUsageRow,
  UsageResponse,
} from '@thinkai/shared';

import { prisma } from '../../config/db';

/** Map a billable category to its per-message rate within a PricingCost doc. */
function costRateForCategory(cost: PricingCost | null, category: MessageCategory): number {
  if (!cost) return 0;
  switch (category) {
    case 'marketing':
      return cost.marketingPaise;
    case 'utility':
      return cost.utilityPaise;
    case 'authentication':
      return cost.authPaise;
    default:
      // 'service' (and any non-billable) carries no BSP cost in Phase 1.
      return 0;
  }
}

/** Aggregate one tenant's billable messages into a usage row. */
async function aggregateTenant(
  tenantId: string,
  name: string,
): Promise<TenantUsageRow> {
  // Our BSP cost rates for this tenant (may be absent -> cost contribution is 0).
  const costRow = await prisma.pricingCost.findUnique({ where: { tenantId } });
  const cost: PricingCost | null = costRow
    ? {
        marketingPaise: costRow.marketingPaise,
        utilityPaise: costRow.utilityPaise,
        authPaise: costRow.authPaise,
        updatedAt: Number(costRow.updatedAt),
      }
    : null;

  // Only messages that were actually charged contribute to revenue/cost. Filtering on
  // costPaise > 0 captures exactly the billable outbound sends and skips inbound/service.
  const messages = await prisma.message.findMany({
    where: { tenantId, costPaise: { gt: 0 } },
    select: { costPaise: true, category: true },
  });

  let messageCount = 0;
  let revenuePaise = 0;
  let costPaise = 0;

  for (const data of messages) {
    const charged = data.costPaise ?? 0;
    if (charged <= 0) continue;
    messageCount += 1;
    revenuePaise += charged;
    costPaise += costRateForCategory(cost, (data.category ?? 'service') as MessageCategory);
  }

  return {
    tenantId,
    name,
    messageCount,
    revenuePaise,
    costPaise,
    marginPaise: revenuePaise - costPaise,
  };
}

/** GET /api/admin/usage */
export async function getUsage(_req: Request, res: Response): Promise<void> {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });

  // Aggregate each tenant in parallel; per-tenant work is independent.
  const rows = await Promise.all(
    tenants.map((t) => aggregateTenant(t.id, t.name ?? t.id)),
  );

  const totals = rows.reduce(
    (acc, r) => ({
      messageCount: acc.messageCount + r.messageCount,
      revenuePaise: acc.revenuePaise + r.revenuePaise,
      costPaise: acc.costPaise + r.costPaise,
      marginPaise: acc.marginPaise + r.marginPaise,
    }),
    { messageCount: 0, revenuePaise: 0, costPaise: 0, marginPaise: 0 },
  );

  const body: UsageResponse = { rows, totals };
  res.json(body);
}
