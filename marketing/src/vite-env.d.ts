/// <reference types="vite/client" />

/**
 * Typed environment variables exposed to the marketing site via import.meta.env.
 * This is a public, static brochure site — never put any secret in VITE_* vars.
 */
interface ImportMetaEnv {
  /** Target of the "Login / Go to Console" button. Defaults to the production console. */
  readonly VITE_CONSOLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
