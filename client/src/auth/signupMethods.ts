/**
 * Self-serve signup helpers over the Firebase Web SDK (kept out of lib/firebase.ts, which
 * stays init-only). Email/password signups get a verification email; Google sign-ins are
 * already email-verified by Google.
 */
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithPopup,
  type UserCredential,
} from 'firebase/auth';

import { auth } from '../lib/firebase';

export const googleProvider = new GoogleAuthProvider();

/** Create an email/password account. */
export async function signupEmail(email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** Sign in with the Google popup (email pre-verified by Google). */
export function signinGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

