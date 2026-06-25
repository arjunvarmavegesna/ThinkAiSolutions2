/**
 * Shared tenant provisioning: create a tenant + seed its wallet (0 paise) — and, for
 * self-serve signups, seed default per-category CHARGE rates — all in ONE atomic batch.
 *
 * Mirrors the admin path (controllers/admin/tenantsController.ts createTenant) so both the
 * reseller-admin "create tenant" wizard and the public self-serve register produce identical
 * tenant + wallet documents. The only difference: self-serve also seeds pricing/{tenantId}
 * from config.signup.defaultPricing so a new tenant can send right after a wallet recharge
 * (the admin path leaves pricing for wizard step 4).
 */

import { randomUUID } from 'node:crypto';

import type { TenantBilling } from '@thinkai/shared';
import type { Prisma } from '@prisma/client';

import { config } from '../../config/env';
import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';

export interface ProvisionTenantInput {
  name: string;
  plan?: string;
  billing?: TenantBilling;
  /** When true, seed pricing/{tenantId} with config.signup.defaultPricing (self-serve path). */
  seedDefaultPricing?: boolean;
}

export interface ProvisionTenantResult {
  tenantId: string;
}

export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const now = msBig(Date.now());

  // Keep only the billing fields the caller supplied.
  const billing: TenantBilling = {};
  if (input.billing?.legalName) billing.legalName = input.billing.legalName;
  if (input.billing?.gstin) billing.gstin = input.billing.gstin;
  if (input.billing?.stateCode) billing.stateCode = input.billing.stateCode;
  if (input.billing?.address) billing.address = input.billing.address;

  const tenantId = randomUUID();

  // Tenant + wallet (+ optional default pricing) created in ONE transaction (mirrors the former
  // atomic Firestore batch).
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.tenant.create({
      data: {
        id: tenantId,
        name: input.name,
        plan: input.plan ?? 'standard',
        status: 'active',
        createdAt: now,
        billing: billing as Prisma.InputJsonValue,
      },
    }),
    prisma.wallet.create({ data: { tenantId, balancePaise: 0, updatedAt: now } }),
  ];

  if (input.seedDefaultPricing) {
    ops.push(
      prisma.pricing.create({
        data: {
          tenantId,
          marketingPaise: config.signup.defaultPricing.marketingPaise,
          utilityPaise: config.signup.defaultPricing.utilityPaise,
          authPaise: config.signup.defaultPricing.authPaise,
          updatedAt: now,
        },
      }),
    );
  }

  await prisma.$transaction(ops);
  return { tenantId };
}
