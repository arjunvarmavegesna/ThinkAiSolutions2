/**
 * Reseller-admin tenant management.
 *
 *   GET  /api/admin/tenants  -> list every tenant (cross-tenant; reseller-admin only)
 *   POST /api/admin/tenants  -> create a tenant + initialize its wallet doc (balance 0)
 *
 * A tenant create is the first onboarding step. We persist the tenant document and, in the
 * same batch, seed the single wallet doc at balancePaise 0 so the wallet exists before any
 * recharge/debit ever runs (the ledger code tolerates a missing wallet, but seeding keeps
 * the data model consistent and the admin UI honest).
 */

import { randomUUID } from 'node:crypto';

import type { Request, Response } from 'express';

import type {
  CreateTenantResponse,
  ListTenantsResponse,
  TenantBilling,
  TenantDTO,
  TenantStatus,
} from '@thinkai/shared';
import type { Prisma, Tenant as PTenant } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig, msNum } from '../../db/serde';
import { logger } from '../../lib/logger';
import { createTenantSchema, parseOrThrow } from '../../validation/adminSchemas';

/** Convert a Prisma tenants row into the domain TenantDTO (number timestamps). */
function toTenantDTO(row: PTenant): TenantDTO {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    status: row.status as TenantStatus,
    createdAt: msNum(row.createdAt) as number,
    billing: (row.billing ?? {}) as TenantBilling,
  };
}

/** GET /api/admin/tenants — list all tenants, newest first. */
export async function listTenants(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  const body: ListTenantsResponse = { tenants: rows.map(toTenantDTO) };
  res.json(body);
}

/** POST /api/admin/tenants — create a tenant and seed its wallet at 0 paise. */
export async function createTenant(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createTenantSchema, req.body);

  const now = msBig(Date.now());

  // Keep only the billing fields the caller supplied.
  const billing: TenantBilling = {};
  if (input.billing.legalName) billing.legalName = input.billing.legalName;
  if (input.billing.gstin) billing.gstin = input.billing.gstin;
  if (input.billing.stateCode) billing.stateCode = input.billing.stateCode;
  if (input.billing.address) billing.address = input.billing.address;

  const tenantId = randomUUID();

  // Tenant + wallet seeded atomically (mirrors the former Firestore batch).
  await prisma.$transaction([
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
  ]);

  logger.info({ tenantId }, 'createTenant: tenant + wallet seeded');

  const body: CreateTenantResponse = { tenantId };
  res.status(201).json(body);
}
