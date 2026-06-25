/**
 * Firebase Web SDK initialization (client-side, PUBLIC config only).
 * We only use Firebase Auth on the client — all data access goes through the
 * Express API, never directly to Firestore.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { config } from './config';

// Reuse an existing app instance during HMR to avoid "duplicate app" errors.
const firebaseApp: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp({
      apiKey: config.firebase.apiKey,
      authDomain: config.firebase.authDomain,
      projectId: config.firebase.projectId,
      storageBucket: config.firebase.storageBucket,
      messagingSenderId: config.firebase.messagingSenderId,
      appId: config.firebase.appId,
    });

export const auth: Auth = getAuth(firebaseApp);
export { firebaseApp };
