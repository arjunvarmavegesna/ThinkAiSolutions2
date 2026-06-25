/**
 * Generic secret storage contract. BSP apikeys and webhook secrets are stored here; only
 * an opaque REFERENCE (bspApiKeyRef / webhookSecretRef) is ever persisted in Firestore or
 * returned to callers. Plaintext secrets never touch Firestore docs or the client.
 *
 * Phase 1 ships an env-backed dev implementation (envSecretStore.ts). Production drivers
 * (GCP Secret Manager / Railway encrypted vars / Vault) implement this same interface
 * behind the SECRET_STORE_DRIVER factory.
 */
export interface SecretStore {
  /**
   * Store a secret and return an opaque reference to persist.
   * @param namespace logical bucket, e.g. 'bsp-apikey' or 'webhook-secret'
   * @param id stable id within the namespace, e.g. the waba doc id
   */
  putSecret(namespace: string, id: string, value: string): Promise<string>;

  /** Resolve a previously stored secret by its opaque reference. Throws if missing. */
  getSecret(ref: string): Promise<string>;

  /** Replace the value behind an existing reference. */
  rotateSecret(ref: string, value: string): Promise<void>;
}
