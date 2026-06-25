/// <reference types="vite/client" />

/**
 * Typed environment variables exposed to the client via import.meta.env.
 * Only PUBLIC values may live here — never put server secrets (BSP apikeys,
 * Razorpay key secret, Firebase admin creds) in VITE_* vars.
 */
interface ImportMetaEnv {
  /** Base URL the apiClient prefixes to every request. Defaults to '/api'. */
  readonly VITE_API_BASE_URL?: string;

  // Firebase web app config (public — safe to ship to the browser).
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;

  /** Public Razorpay key id used by Checkout (NOT the key secret). */
  readonly VITE_RAZORPAY_KEY_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
