/**
 * Client-side auth state, sourced entirely from Firebase Auth.
 *
 * We listen on `onIdTokenChanged` (not just `onAuthStateChanged`) so role/tenant
 * claims refresh whenever the ID token is rotated (login, logout, token refresh,
 * or a server-side custom-claims update). Role + tenantId come from the verified
 * custom claims the server set via `setUserClaims` — the client trusts the token,
 * the server trusts the verified token, never a client-supplied tenantId.
 *
 * No Firestore access here: all data flows through the Express API.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import type { ProvisionResponse, Role } from '@thinkai/shared';
import { auth } from '../lib/firebase';
import { signinGoogle, signupEmail } from './signupMethods';
import { provision as provisionApi } from '../api/authApi';

/** Shape exposed to the app via `useAuth()`. */
export interface AuthState {
  /** The signed-in Firebase user, or null when signed out. */
  user: User | null;
  /** Resolved role from custom claims, or null until resolved / signed out. */
  role: Role | null;
  /** Tenant scope from custom claims. reseller_admin has tenantId null. */
  tenantId: string | null;
  /** True until the first auth state + claims resolution completes. */
  loading: boolean;
  /** Email/password sign-in. Throws on failure (caller shows the message). */
  login: (email: string, password: string) => Promise<void>;
  /** Sign out and clear local auth state. */
  logout: () => Promise<void>;
  /** Self-serve: create an email/password account (also sends a verification email). */
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  /** Self-serve: sign in with the Google popup (email is pre-verified by Google). */
  signInWithGoogle: () => Promise<void>;
  /** Provision (or idempotently fetch) the caller's own tenant, then refresh claims. */
  provision: (name?: string) => Promise<ProvisionResponse>;
  /** Force-refresh the ID token and re-read role/tenant claims (after provisioning/verifying). */
  refreshClaims: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/** Narrow an unknown claim value to a known Role, else null. */
function asRole(value: unknown): Role | null {
  return value === 'reseller_admin' || value === 'tenant_admin' || value === 'agent'
    ? value
    : null;
}

/** Narrow an unknown claim value to a tenant id string, else null. */
function asTenantId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Fires on sign-in, sign-out, and every ID-token refresh — keeping claims fresh.
    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setRole(null);
        setTenantId(null);
        setLoading(false);
        return;
      }

      try {
        // Read claims from the verified token; do NOT force-refresh on every event.
        const result = await nextUser.getIdTokenResult();
        setUser(nextUser);
        setRole(asRole(result.claims.role));
        setTenantId(asTenantId(result.claims.tenantId));
      } catch {
        // If claims can't be read, treat as an unresolved (claimless) session.
        setUser(nextUser);
        setRole(null);
        setTenantId(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Force-refresh the token and re-read claims directly (avoids a claimless flash after the
  // server sets custom claims; the forced refresh also fires onIdTokenChanged for consistency).
  const refreshClaims = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    const result = await u.getIdTokenResult(true);
    setRole(asRole(result.claims.role));
    setTenantId(asTenantId(result.claims.tenantId));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      role,
      tenantId,
      loading,
      login: async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
        // onIdTokenChanged will populate user/role/tenantId.
      },
      logout: async () => {
        await signOut(auth);
      },
      signUpWithEmail: async (email: string, password: string) => {
        await signupEmail(email.trim(), password);
        // User is now signed in but unverified + unprovisioned; the Signup page drives the rest.
      },
      signInWithGoogle: async () => {
        await signinGoogle();
      },
      provision: async (name?: string) => {
        const res = await provisionApi(name);
        await refreshClaims();
        return res;
      },
      refreshClaims,
    }),
    [user, role, tenantId, loading, refreshClaims],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Internal accessor used by the `useAuth` hook (kept in its own module so fast
 * refresh stays happy with components-only files). Throws if used outside the
 * provider to catch wiring mistakes early.
 */
export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
