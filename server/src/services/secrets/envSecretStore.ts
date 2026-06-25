/**
 * Environment-variable-backed SecretStore for dev / static configuration.
 *
 * References are of the form 'env:NAME' and resolve to process.env[NAME] at read
 * time. This driver does NOT persist anything: secrets must already exist in the
 * environment (e.g. a single shared BSP apikey injected via Railway env vars).
 *
 * putSecret therefore cannot create a new secret — it only validates that the
 * named env var is present and returns its reference. This makes the env driver a
 * drop-in for setups where every WABA shares one statically-configured apikey.
 */
import { SecretStore } from './SecretStore';

/** Prefix that marks a reference as resolvable from the process environment. */
const ENV_REF_PREFIX = 'env:';

/** Build the env reference for a namespace/id pair (id is treated as the var name). */
function envRefFor(id: string): string {
  return `${ENV_REF_PREFIX}${id}`;
}

/** Extract the env var name from an 'env:NAME' reference, or null if malformed. */
function envVarNameFromRef(ref: string): string | null {
  if (!ref.startsWith(ENV_REF_PREFIX)) {
    return null;
  }
  const name = ref.slice(ENV_REF_PREFIX.length);
  return name.length > 0 ? name : null;
}

export class EnvSecretStore implements SecretStore {
  /**
   * Validates that the env var (named by `id`) exists and returns its reference.
   * The `namespace` is not used for resolution here (env vars are flat) but is
   * accepted to satisfy the SecretStore contract. The provided `value` is ignored
   * because this driver does not write to the environment.
   */
  async putSecret(_namespace: string, id: string, _value: string): Promise<string> {
    if (process.env[id] === undefined) {
      throw new Error(
        `EnvSecretStore: environment variable "${id}" is not set; cannot reference a missing secret.`,
      );
    }
    return envRefFor(id);
  }

  async getSecret(ref: string): Promise<string> {
    const name = envVarNameFromRef(ref);
    if (!name) {
      throw new Error(`EnvSecretStore: invalid env reference "${ref}" (expected "env:NAME").`);
    }
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`EnvSecretStore: environment variable "${name}" is not set.`);
    }
    return value;
  }

  /**
   * Rotation is not supported for env-backed secrets: the value lives in the
   * deployment environment, not in this process. We only verify the var still
   * exists so callers fail fast instead of silently no-op'ing.
   */
  async rotateSecret(ref: string, _value: string): Promise<void> {
    const name = envVarNameFromRef(ref);
    if (!name) {
      throw new Error(`EnvSecretStore: invalid env reference "${ref}" (expected "env:NAME").`);
    }
    if (process.env[name] === undefined) {
      throw new Error(`EnvSecretStore: environment variable "${name}" is not set; nothing to rotate.`);
    }
    // No-op: env-backed values must be rotated in the deployment platform, not here.
  }
}
