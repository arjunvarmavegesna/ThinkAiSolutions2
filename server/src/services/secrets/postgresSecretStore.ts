/**
 * Postgres-backed SecretStore using authenticated AES-256-GCM encryption.
 *
 * SECURITY MODEL (unchanged from the former Firestore store — only the backing store moved):
 * - The plaintext secret (BSP apikey, webhook signing secret) is encrypted with a server-only
 *   master key (config.secretsEncryptionKey) before it ever touches the database. Only the
 *   ciphertext + iv + auth tag are persisted (in the `secrets` table).
 * - Callers receive and persist an OPAQUE REFERENCE ("<namespace>:<id>"), never the value.
 *
 * AES-256-GCM is authenticated: the 16-byte tag detects any tampering at decrypt time
 * (decrypt throws instead of returning garbage). A fresh random 12-byte IV per encryption.
 */
import * as crypto from 'crypto';

import { prisma } from '../../config/db';
import { config } from '../../config/env';
import { msBig } from '../../db/serde';
import { SecretStore } from './SecretStore';

/** GCM standard nonce length (12 bytes) and auth tag length (16 bytes). */
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Encrypted fields, all base64. */
interface EncryptedFields {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Decode the configured master key into a raw 32-byte Buffer. Accepts hex (64 chars) or
 * base64; validates the decoded length is exactly 32 bytes (AES-256). Throws loudly if
 * misconfigured so we never silently use a weak/short key.
 */
function loadMasterKey(): Buffer {
  const raw = config.secretsEncryptionKey;
  if (!raw) {
    throw new Error(
      'SECRETS_ENCRYPTION_KEY is not set — the secret store requires a 32-byte AES key.',
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). ` +
        'Provide a 64-char hex string or a 32-byte base64 value.',
    );
  }
  return key;
}

/** Build the opaque reference (primary key) for a namespace/id pair. */
function refFor(namespace: string, id: string): string {
  return `${namespace}:${id}`;
}

export class PostgresSecretStore implements SecretStore {
  // Lazily derived so a misconfigured key only fails when secrets are actually used.
  private cachedKey: Buffer | null = null;

  private get masterKey(): Buffer {
    if (!this.cachedKey) this.cachedKey = loadMasterKey();
    return this.cachedKey;
  }

  private encrypt(value: string): EncryptedFields {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  private decrypt(fields: EncryptedFields): string {
    const iv = Buffer.from(fields.iv, 'base64');
    const tag = Buffer.from(fields.tag, 'base64');
    const ciphertext = Buffer.from(fields.ciphertext, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  async putSecret(namespace: string, id: string, value: string): Promise<string> {
    const ref = refFor(namespace, id);
    const enc = this.encrypt(value);
    const now = msBig(Date.now());
    // Deterministic ref => upsert is naturally idempotent for the same (namespace,id).
    await prisma.secret.upsert({
      where: { ref },
      create: { ref, namespace, secretId: id, ...enc, createdAt: now },
      update: { namespace, secretId: id, ...enc, updatedAt: now },
    });
    return ref;
  }

  async getSecret(ref: string): Promise<string> {
    const row = await prisma.secret.findUnique({ where: { ref } });
    if (!row) throw new Error(`Secret not found for reference: ${ref}`);
    return this.decrypt(row);
  }

  async rotateSecret(ref: string, value: string): Promise<void> {
    const row = await prisma.secret.findUnique({ where: { ref } });
    if (!row) throw new Error(`Cannot rotate — secret not found for reference: ${ref}`);
    const enc = this.encrypt(value);
    await prisma.secret.update({
      where: { ref },
      data: { ...enc, updatedAt: msBig(Date.now()) },
    });
  }
}
