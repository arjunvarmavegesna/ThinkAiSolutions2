/**
 * Reseller-admin: manually connect a metaCloud WABA (WhatsApp Business number) to a tenant.
 *
 *   POST /api/admin/wabas
 *
 * This is the manual fallback to Embedded Signup — used to wire the Meta TEST number by hand
 * (and for demos). metaCloud needs NO per-WABA apikey: sends use the global Meta token (System
 * User in live, the test number's temporary token in test) and Meta verifies webhooks at the
 * App level (X-Hub-Signature-256), not per-number. Steps:
 *  1. Validate the target tenant exists.
 *  2. Persist the WABA doc (the two Meta ids; providerRef = phone_number_id, the inbound key).
 *  3. Resolve a BspContext + run healthCheck. On success mark 'connected', else leave 'pending'
 *     so the admin can retry — onboarding never hard-fails on a transient hiccup.
 */

import { randomUUID } from 'node:crypto';

import type { Request, Response } from 'express';

import type { ConnectWabaResponse, WabaStatus } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveBspContextByWaba } from '../../services/bsp';
import { connectWabaSchema, parseOrThrow } from '../../validation/adminSchemas';

/** POST /api/admin/wabas — manual metaCloud connect (e.g. wiring the Meta test number). */
export async function connectWaba(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(connectWabaSchema, req.body);

  // 1. Tenant must exist.
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) {
    throw AppError.notFound('Tenant not found');
  }

  const wabaDocId = randomUUID();

  // 2. Persist the WABA row. providerRef = phone_number_id is the inbound-routing key.
  const now = msBig(Date.now());
  await prisma.waba.create({
    data: {
      tenantId: input.tenantId,
      id: wabaDocId,
      provider: 'metaCloud',
      phoneNumber: input.phoneNumber,
      displayName: input.displayName,
      status: 'pending',
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      providerRef: input.phoneNumberId,
      createdAt: now,
      updatedAt: now,
    },
  });

  // 3. Health-check against Meta via a resolved context; promote to 'connected' on success.
  let status: WabaStatus = 'pending';
  try {
    const resolved = await resolveBspContextByWaba(input.tenantId, wabaDocId);
    const healthy = await getBspProvider(resolved.provider).healthCheck(resolved.ctx);
    status = healthy ? 'connected' : 'pending';
  } catch (err) {
    logger.warn(
      { tenantId: input.tenantId, wabaDocId, err: (err as Error)?.message },
      'connectWaba(metaCloud): health check failed; WABA left pending',
    );
  }
  await prisma.waba.update({
    where: { tenantId_id: { tenantId: input.tenantId, id: wabaDocId } },
    data: { status, updatedAt: msBig(Date.now()) },
  });

  logger.info(
    { tenantId: input.tenantId, wabaDocId, status },
    'connectWaba: metaCloud WABA connected (manual)',
  );
  const body: ConnectWabaResponse = { wabaId: wabaDocId, webhookRegistered: false };
  res.status(201).json(body);
}
