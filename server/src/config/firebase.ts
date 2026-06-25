/**
 * Firebase Admin initialization — AUTH ONLY.
 *
 * After the Postgres migration, Firebase is kept solely for identity: ID-token verification
 * and custom claims. All DATA lives in Postgres (see ./db). This module initializes a single
 * firebase-admin app from `config.firebase` and exposes only the Auth handle. In development we
 * tolerate missing credentials so the rest of the app can boot for UI work — Auth calls will
 * fail at runtime, but the process starts. In production env.ts guarantees the credentials.
 */

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

import { config } from './env';

/** Initialize (or reuse) the singleton admin app. */
function initAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const { projectId, clientEmail, privateKey } = config.firebase;

  // With full service-account credentials, use them explicitly.
  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId,
    });
  }

  // Dev fallback: boot without credentials (Firestore/Auth calls will error if used).
  return initializeApp(projectId ? { projectId } : {});
}

const app: App = initAdminApp();

/** Firebase Auth admin handle (custom claims, user management, token verification). */
export const adminAuth: Auth = getAuth(app);
