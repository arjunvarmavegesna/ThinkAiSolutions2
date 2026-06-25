/**
 * Route guard. Blocks rendering until auth resolves, redirects unauthenticated
 * users to /login (preserving the attempted location), and optionally enforces a
 * role allow-list. A signed-in user whose role is not permitted is bounced to
 * their role's landing page rather than shown the protected content.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@thinkai/shared';
import { useAuth } from './useAuth';
import { LogoLoader } from '@/components/LogoLoader';

export interface ProtectedRouteProps {
  /** If set, only these roles may view the nested routes. */
  allowedRoles?: Role[];
}

/** The default page a given role should land on after auth. */
export function landingPathForRole(role: Role | null): string {
  return role === 'reseller_admin' ? '/admin' : '/dashboard';
}

/** Branded full-screen loader shown while the first auth resolution runs. */
function AuthLoading(): JSX.Element {
  return <LogoLoader label="Loading your workspace…" />;
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps): JSX.Element {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Wait for Firebase to report auth state + claims before deciding.
  if (loading) {
    return <AuthLoading />;
  }

  // Not signed in -> go to login, remembering where they were headed.
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Signed in but role not permitted -> send to their own landing page.
  if (allowedRoles && (role === null || !allowedRoles.includes(role))) {
    return <Navigate to={landingPathForRole(role)} replace />;
  }

  return <Outlet />;
}
