/**
 * Reseller-admin: per-tenant pricing.
 *
 *   GET /api/admin/pricing/:tenantId  -> { charge, cost }
 *   PUT /api/admin/pricing/:tenantId  -> set charge rates (pricing/{tid}) + optional cost
 *                                        rates (pricingCost/{tid}); returns the new values.
 *
 * `pricing/{tenantId}` holds the rates we CHARGE the tenant (tenant-readable). `pricingCost/
 * {tenantId}` holds OUR BSP cost rates for margin reporting (reseller-admin only, never
 * tenant-readable — enforced in Firestore rules). Both are flat top-level docs keyed by
 * tenantId. All rates are integer paise.
 */

import type { Request, Response } from 'express';

import type { Pricing, PricingCost, PricingResponse } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig, msNum } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import {
  parseOrThrow,
  setPricingSchema,
  tenantIdParamSchema,
} from '../../validation/adminSchemas';

/** Resolve and validate the :tenantId path param, asserting the tenant exists. */
async function resolveTenantId(req: Request): Promise<string> {
  const { tenantId } = parseOrThrow(tenantIdParamSchema, req.params);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw AppError.notFound('Tenant not found');
  }
  return tenantId;
}

/** Read both pricing rows for a tenant into the response shape (nulls when unset). */
async function readPricing(tenantId: string): Promise<PricingResponse> {
  const [charge, cost] = await Promise.all([
    prisma.pricing.findUnique({ where: { tenantId } }),
    prisma.pricingCost.findUnique({ where: { tenantId } }),
  ]);

  return {
    charge: charge
      ? ({
          marketingPaise: charge.marketingPaise,
          utilityPaise: charge.utilityPaise,
          authPaise: charge.authPaise,
          updatedAt: msNum(charge.updatedAt) as number,
        } as Pricing)
      : null,
    cost: cost
      ? ({
          marketingPaise: cost.marketingPaise,
          utilityPaise: cost.utilityPaise,
          authPaise: cost.authPaise,
          updatedAt: msNum(cost.updatedAt) as number,
        } as PricingCost)
      : null,
  };
}

/** GET /api/admin/pricing/:tenantId */
export async function getPricing(req: Request, res: Response): Promise<void> {
  const tenantId = await resolveTenantId(req);
  const body = await readPricing(tenantId);
  res.json(body);
}

/** PUT /api/admin/pricing/:tenantId */
export async function setPricing(req: Request, res: Response): Promise<void> {
  const tenantId = await resolveTenantId(req);
  const input = parseOrThrow(setPricingSchema, req.body);

  const now = msBig(Date.now());

  const chargeData = {
    marketingPaise: input.marketingPaise,
    utilityPaise: input.utilityPaise,
    authPaise: input.authPaise,
    updatedAt: now,
  };

  const ops = [
    prisma.pricing.upsert({
      where: { tenantId },
      create: { tenantId, ...chargeData },
      update: chargeData,
    }),
  ];

  // Cost rates are optional; only write pricingCost when all three are provided so we never
  // persist a half-populated cost row that would skew margin reporting.
  const hasCost =
    input.costMarketingPaise !== undefined &&
    input.costUtilityPaise !== undefined &&
    input.costAuthPaise !== undefined;

  if (hasCost) {
    const costData = {
      marketingPaise: input.costMarketingPaise as number,
      utilityPaise: input.costUtilityPaise as number,
      authPaise: input.costAuthPaise as number,
      updatedAt: now,
    };
    ops.push(
      prisma.pricingCost.upsert({
        where: { tenantId },
        create: { tenantId, ...costData },
        update: costData,
      }),
    );
  }

  await prisma.$transaction(ops);

  logger.info({ tenantId, hasCost }, 'setPricing: pricing updated');

  const body = await readPricing(tenantId);
  res.json(body);
}
