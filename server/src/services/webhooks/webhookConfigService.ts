/**
 * Read/write a tenant's client-facing webhook configuration and its HMAC signing secret.
 *
 * Config doc: webhookConfig/{tenantId} (tenant-readable, server-written). The signing secret is
 * NEVER stored on that doc — it lives in the encrypted SecretStore (secrets/{ref}); the config
 * keeps only an opaque ref + the last 4 chars for the "show-once then masked" UI.
 */

import { randomBytes } from 'node:crypto';

import type {
  UpdateWebhookConfigRequest,
  WebhookConfig,
  WebhookConfigPublic,
  WebhookEventType,
} from '@thinkai/shared';
import type { WebhookConfig as PWebhookConfig } from '@prisma/client';

import { prisma } from '../../config/db';
import { msBig, msNum } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { secretStore } from '../secrets';
import { WEBHOOK_SECRET_NAMESPACE } from './constants';

/** Convert a Prisma webhook_configs row into the domain WebhookConfig (number timestamps). */
function toWebhookConfig(row: PWebhookConfig): WebhookConfig {
  return {
    enabled: row.enabled,
    callbackUrl: row.callbackUrl,
    eventTypes: row.eventTypes as WebhookEventType[],
    ...(row.signingSecretRef ? { signingSecretRef: row.signingSecretRef } : {}),
    ...(row.secretLast4 ? { secretLast4: row.secretLast4 } : {}),
    createdAt: msNum(row.createdAt) as number,
    updatedAt: msNum(row.updatedAt) as number,
  };
}

/** Read the tenant's webhook config, or null if never configured. */
export async function getWebhookConfig(tenantId: string): Promise<WebhookConfig | null> {
  const row = await prisma.webhookConfig.findUnique({ where: { tenantId } });
  return row ? toWebhookConfig(row) : null;
}

/** Strip the secret-bearing fields so a config is safe to return to the client. */
export function toPublicConfig(cfg: WebhookConfig): WebhookConfigPublic {
  return {
    enabled: cfg.enabled,
    callbackUrl: cfg.callbackUrl,
    eventTypes: cfg.eventTypes,
    ...(cfg.secretLast4 !== undefined ? { secretLast4: cfg.secretLast4 } : {}),
    updatedAt: cfg.updatedAt,
  };
}

/**
 * Create/replace the URL + event types + enabled flag. Enabling requires a signing secret to
 * already exist (we never deliver unsigned), so the UI must generate one first.
 */
export async function upsertWebhookConfig(
  tenantId: string,
  input: UpdateWebhookConfigRequest,
): Promise<WebhookConfig> {
  const existing = await getWebhookConfig(tenantId);

  if (input.enabled && !existing?.signingSecretRef) {
    throw AppError.badRequest(
      'Generate a signing secret before enabling webhooks',
      'webhook_secret_required',
    );
  }

  const now = Date.now();
  const next: WebhookConfig = {
    enabled: input.enabled,
    callbackUrl: input.callbackUrl,
    eventTypes: input.eventTypes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(existing?.signingSecretRef ? { signingSecretRef: existing.signingSecretRef } : {}),
    ...(existing?.secretLast4 ? { secretLast4: existing.secretLast4 } : {}),
  };
  await prisma.webhookConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      enabled: next.enabled,
      callbackUrl: next.callbackUrl,
      eventTypes: next.eventTypes,
      createdAt: msBig(next.createdAt),
      updatedAt: msBig(next.updatedAt),
      ...(next.signingSecretRef ? { signingSecretRef: next.signingSecretRef } : {}),
      ...(next.secretLast4 ? { secretLast4: next.secretLast4 } : {}),
    },
    update: {
      enabled: next.enabled,
      callbackUrl: next.callbackUrl,
      eventTypes: next.eventTypes,
      updatedAt: msBig(next.updatedAt),
    },
  });
  return next;
}

/**
 * Generate (or rotate) the tenant's signing secret. Returns the full secret ONCE — it is stored
 * only in encrypted form and can never be read back via the API. Creates a minimal config doc if
 * none exists yet (disabled, no URL) so the secret has somewhere to bind.
 */
export async function rotateSigningSecret(
  tenantId: string,
): Promise<{ signingSecret: string; secretLast4: string }> {
  const signingSecret = randomBytes(32).toString('hex');
  const secretLast4 = signingSecret.slice(-4);
  const signingSecretRef = await secretStore.putSecret(
    WEBHOOK_SECRET_NAMESPACE,
    tenantId,
    signingSecret,
  );

  const existing = await getWebhookConfig(tenantId);
  const now = Date.now();
  const next: WebhookConfig = {
    enabled: existing?.enabled ?? false,
    callbackUrl: existing?.callbackUrl ?? '',
    eventTypes: existing?.eventTypes ?? [],
    signingSecretRef,
    secretLast4,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await prisma.webhookConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      enabled: next.enabled,
      callbackUrl: next.callbackUrl,
      eventTypes: next.eventTypes,
      signingSecretRef,
      secretLast4,
      createdAt: msBig(next.createdAt),
      updatedAt: msBig(next.updatedAt),
    },
    update: { signingSecretRef, secretLast4, updatedAt: msBig(next.updatedAt) },
  });

  return { signingSecret, secretLast4 };
}

/** Resolve the plaintext signing secret for delivery signing; null if none is configured. */
export async function getSigningSecret(tenantId: string): Promise<string | null> {
  const cfg = await getWebhookConfig(tenantId);
  if (!cfg?.signingSecretRef) return null;
  return secretStore.getSecret(cfg.signingSecretRef);
}
