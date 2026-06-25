import { AuthProvider } from './auth/AuthContext';
import { AppRoutes } from './routes/AppRoutes';

/**
 * Root application component. Wraps the route tree in the auth provider so every
 * route can read the current user, role, and tenantId from Firebase claims.
 * AuthProvider/AppRoutes are authored in a later wave; the imports resolve then.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
