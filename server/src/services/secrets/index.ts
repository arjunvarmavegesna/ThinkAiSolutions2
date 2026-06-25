/**
 * SecretStore factory.
 *
 * Selects the concrete driver from config.secretStoreDriver (SECRET_STORE_DRIVER):
 *   - 'postgres' (default): AES-256-GCM encrypted secrets in the server-only `secrets`
 *     table. Recommended for production multi-tenant use.
 *   - 'env': resolve secrets from process.env via 'env:NAME' references (dev/static).
 *
 * Exposes a single shared `secretStore` instance that the rest of the server uses
 * (e.g. webhook signing-secret storage, resolveBspContext reading a BSP apikey back).
 */
import { config } from '../../config/env';
import { SecretStore } from './SecretStore';
import { PostgresSecretStore } from './postgresSecretStore';
import { EnvSecretStore } from './envSecretStore';

function createSecretStore(): SecretStore {
  switch (config.secretStoreDriver) {
    case 'env':
      return new EnvSecretStore();
    case 'postgres':
    // 'firestore' is accepted as a legacy alias for the default Postgres driver so an
    // un-updated SECRET_STORE_DRIVER value keeps booting after the migration.
    case 'firestore':
    default:
      return new PostgresSecretStore();
  }
}

/** Process-wide singleton SecretStore selected by SECRET_STORE_DRIVER. */
export const secretStore: SecretStore = createSecretStore();

export { SecretStore } from './SecretStore';
export { PostgresSecretStore } from './postgresSecretStore';
export { EnvSecretStore } from './envSecretStore';
