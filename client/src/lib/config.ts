/**
 * Validates and exposes the public client configuration from import.meta.env.
 * Fails fast at module load if a required VITE_* var is missing so we never run
 * with a half-configured Firebase/Razorpay setup.
 *
 * Only PUBLIC values live here. Server secrets never reach the client.
 */

/** Read a required env var or throw a clear, actionable error. */
function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `Missing required environment variable ${String(name)}. ` +
        `Set it in client/.env (see .env.example).`,
    );
  }
  return value;
}

export interface ClientConfig {
  /** Base path/URL the apiClient prefixes to every request. */
  apiBaseUrl: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  razorpay: {
    keyId: string;
  };
}

export const config: ClientConfig = Object.freeze({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  firebase: {
    apiKey: required('VITE_FIREBASE_API_KEY'),
    authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: required('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: required('VITE_FIREBASE_APP_ID'),
  },
  razorpay: {
    keyId: required('VITE_RAZORPAY_KEY_ID'),
  },
});
