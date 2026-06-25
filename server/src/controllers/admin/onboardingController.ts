/**
 * Meta Embedded Signup onboarding — shared by TWO entry points:
 *   - reseller-admin: POST /api/admin/onboarding/exchange   (tenantId in the body)
 *   - tenant self-serve: POST /api/onboarding/exchange      (tenantId from the caller's token)
 *
 * Both funnel into `completeEmbeddedSignup(tenantId, fields)`. Plus `getOnboardingConfig`
 * (public Meta values to launch the popup) and `getWabaStatus` (does the tenant have a WABA
 * yet — drives the post-signup "Connect WhatsApp" gate).
 *
 * The exchange step: exchange the ES code, subscribe our app to the WABA, register the number
 * (when a PIN is given), fill phoneNumber/displayName from Graph if missing, and persist the
 * WABA doc with provider='metaCloud' + BOTH Meta ids (providerRef = phoneNumberId, the
 * collection-group-indexed inbound-routing key). No per-WABA secret — sends use the shared
 * System User token. Onboarding never hard-fails on a transient subscribe/register hiccup.
 */

import type { Request, Response } from 'express';

import { randomUUID } from 'node:crypto';

import type {
  ExchangeSignupCodeResponse,
  OnboardingConfigResponse,
  WabaStatus,
  WabaStatusResponse,
} from '@thinkai/shared';

import { config } from '../../config/env';
import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import {
  exchangeSignupCode,
  fetchPhoneNumberProfile,
  registerPhoneNumber,
  subscribeAppToWaba,
} from '../../services/bsp/metaCloud.onboarding';
import { exchangeSignupSchema, parseOrThrow } from '../../validation/adminSchemas';
import { exchangeSignupTenantSchema } from '../../validation/authSchemas';

/** GET onboarding/config — hand the browser the PUBLIC values to launch ES (tenant-agnostic). */
export async function getOnboardingConfig(_req: Request, res: Response): Promise<void> {
  const body: OnboardingConfigResponse = {
    appId: config.meta.appId,
    configId: config.meta.configId,
    graphVersion: config.meta.graphVersion,
    // ES is only usable once we're live AND have a reviewed Config id. In test mode it's off,
    // so the client shows an "available after approval" state instead of a broken popup.
    embeddedSignupAvailable:
      config.meta.mode === 'live' && !!config.meta.appId && !!config.meta.configId,
  };
  res.json(body);
}

/** The validated Embedded Signup fields (without tenantId — that's supplied separately). */
interface ExchangeFields {
  code: string;
  wabaId: string;
  phoneNumberId: string;
  phoneNumber?: string;
  displayName?: string;
  pin?: string;
}

/** Shared exchange + subscribe + register + persist for a given tenant. */
async function completeEmbeddedSignup(
  tenantId: string,
  input: ExchangeFields,
): Promise<ExchangeSignupCodeResponse> {
  // 1. Tenant must exist.
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw AppError.notFound('Tenant not found');
  }

  // 2. Exchange the ES code (validates the signup; throws a clean 4xx on invalid/expired code).
  await exchangeSignupCode(input.code);

  // 3. Subscribe our app to the WABA (inbound + status callbacks). Non-fatal on failure.
  let subscribed = false;
  try {
    await subscribeAppToWaba(input.wabaId);
    subscribed = true;
  } catch (err) {
    logger.warn(
      { tenantId, wabaId: input.wabaId, err: (err as Error)?.message },
      'onboarding: subscribed_apps failed; WABA left pending',
    );
  }

  // 4. Register the number for the Cloud API when a PIN was provided. Non-fatal on failure.
  let registered = false;
  if (input.pin) {
    try {
      await registerPhoneNumber(input.phoneNumberId, input.pin);
      registered = true;
    } catch (err) {
      logger.warn(
        { tenantId, phoneNumberId: input.phoneNumberId, err: (err as Error)?.message },
        'onboarding: number register failed; WABA left pending',
      );
    }
  }

  // 5. Complete identity fields from Graph when the popup didn't surface them.
  let phoneNumber = input.phoneNumber ?? '';
  let displayName = input.displayName ?? '';
  if (!phoneNumber || !displayName) {
    try {
      const profile = await fetchPhoneNumberProfile(input.phoneNumberId);
      phoneNumber = phoneNumber || profile.displayPhoneNumber || '';
      displayName = displayName || profile.verifiedName || '';
    } catch (err) {
      logger.warn({ err: (err as Error)?.message }, 'onboarding: phone profile fetch failed');
    }
  }

  // 6. Persist the WABA doc. metaCloud stores BOTH Meta ids; providerRef = phoneNumberId.
  //    Promote to 'connected' only when the app subscription AND Cloud-API number
  //    registration both succeeded; a subscribed-but-unregistered number still rejects
  //    sends with Meta error 133010, so it must stay 'pending' until registered.
  const status: WabaStatus = subscribed && registered ? 'connected' : 'pending';
  const now = msBig(Date.now());
  const wabaDocId = randomUUID();
  await prisma.waba.create({
    data: {
      tenantId,
      id: wabaDocId,
      provider: 'metaCloud',
      phoneNumber,
      displayName,
      status,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      providerRef: input.phoneNumberId,
      createdAt: now,
      updatedAt: now,
    },
  });

  logger.info(
    { tenantId, wabaDocId, status, subscribed, registered },
    'onboarding: Embedded Signup completed',
  );

  return {
    wabaDocId,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    subscribed,
    registered,
    status,
  };
}

/** POST /api/admin/onboarding/exchange — reseller-admin; tenantId comes from the body. */
export async function exchangeEmbeddedSignup(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(exchangeSignupSchema, req.body);
  const body = await completeEmbeddedSignup(input.tenantId, input);
  res.status(201).json(body);
}

/** POST /api/onboarding/exchange — tenant self-serve; tenantId comes from the caller's token. */
export async function exchangeEmbeddedSignupForTenant(req: Request, res: Response): Promise<void> {
  const tenantId = res.locals.tenantId as string;
  const input = parseOrThrow(exchangeSignupTenantSchema, req.body);
  const body = await completeEmbeddedSignup(tenantId, input);
  res.status(201).json(body);
}

/** GET /api/onboarding/waba-status — does the caller's tenant have a WABA yet? */
export async function getWabaStatus(_req: Request, res: Response): Promise<void> {
  const tenantId = res.locals.tenantId as string;
  const wabas = await prisma.waba.findMany({ where: { tenantId }, select: { status: true } });
  const body: WabaStatusResponse = {
    hasWaba: wabas.length > 0,
    connected: wabas.some((w) => w.status === 'connected'),
  };
  res.json(body);
}
