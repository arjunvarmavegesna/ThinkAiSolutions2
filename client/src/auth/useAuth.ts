/**
 * Public hook for reading auth state. Thin re-export over the context accessor
 * so feature code imports a single stable name: `useAuth`.
 */
import { useAuthContext, type AuthState } from './AuthContext';

export function useAuth(): AuthState {
  return useAuthContext();
}

export type { AuthState };
