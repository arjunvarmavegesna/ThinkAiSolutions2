/**
 * Application route tree (react-router v6).
 *
 * Landing:
 *   - reseller_admin -> /admin (owner console, kept separate)
 *   - tenant_admin / agent -> /dashboard (the Twincles-style business dashboard shell)
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, landingPathForRole } from '../auth/ProtectedRoute';
import { useAuth } from '../auth/useAuth';
import { Login } from '../pages/Login';
import { Signup } from '../pages/Signup';
import { Connect } from '../pages/Connect';
import { AppShell } from '../components/layout/AppShell';
import { Dashboard } from '../pages/Dashboard';
import { Templates } from '../pages/Templates';
import { Campaigns } from '../pages/Campaigns';
import { Media } from '../pages/Media';
import { Reports } from '../pages/Reports';
import { Contacts } from '../pages/Contacts';
import { UserAttributes } from '../pages/UserAttributes';

import { InboxPage } from '../features/inbox/InboxPage';
import { WalletPage } from '../features/wallet/WalletPage';
import { DeveloperPage } from '../features/developer/DeveloperPage';
import { ApiKeysCard } from '../features/developer/ApiKeysCard';
import { WebhookConfigCard } from '../features/developer/WebhookConfigCard';
import { DeliveryLogTable } from '../features/developer/DeliveryLogTable';
import { TenantsListPage } from '../pages/admin/TenantsListPage';
import { CreateTenantPage } from '../pages/admin/CreateTenantPage';
import { TenantDetailPage } from '../pages/admin/TenantDetailPage';
import { PricingPage } from '../pages/admin/PricingPage';
import { GlobalUsagePage } from '../pages/admin/GlobalUsagePage';
import { AccountPage } from '../pages/account/AccountPage';
import { HelpCenter } from '../pages/help/HelpCenter';
import { HelpArticle } from '../pages/help/HelpArticle';

/** Sends an already-resolved user to their role's home; falls back to /login. */
function RootRedirect(): JSX.Element {
  const { user, role, loading } = useAuth();
  if (loading) return <></>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={landingPathForRole(role)} replace />;
}

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Tenant self-serve onboarding — standalone (pre-dashboard), tenant_admin only. */}
      <Route element={<ProtectedRoute allowedRoles={['tenant_admin']} />}>
        <Route path="/connect" element={<Connect />} />
      </Route>

      {/* Business dashboard (tenant_admin/agent) inside the Twincles-style shell. */}
      <Route element={<ProtectedRoute allowedRoles={['tenant_admin', 'agent']} />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/settings/attributes" element={<UserAttributes />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/media" element={<Media />} />
          <Route path="/reports" element={<Reports />} />
          {/* Personal account + docs — available to tenant_admin and agents. */}
          <Route path="/account" element={<AccountPage />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/help/:slug" element={<HelpArticle />} />
          {/* Wallet + Developer stay inside the shell, but tenant-admin only (not agents). */}
          <Route element={<ProtectedRoute allowedRoles={['tenant_admin']} />}>
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/developer" element={<DeveloperPage />}>
              <Route index element={<Navigate to="keys" replace />} />
              <Route path="keys" element={<ApiKeysCard />} />
              <Route path="webhooks" element={<WebhookConfigCard />} />
              <Route path="logs" element={<DeliveryLogTable />} />
            </Route>
          </Route>
        </Route>
      </Route>

      {/* Direct Admin console (the Tech Provider operator view) — now inside the rail shell. */}
      <Route element={<ProtectedRoute allowedRoles={['reseller_admin']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<TenantsListPage />} />
          <Route path="/admin/tenants/new" element={<CreateTenantPage />} />
          <Route path="/admin/tenants/:tenantId" element={<TenantDetailPage />} />
          <Route path="/admin/pricing/:tenantId" element={<PricingPage />} />
          <Route path="/admin/usage" element={<GlobalUsagePage />} />
          {/* Personal account + docs for the operator too. */}
          <Route path="/account" element={<AccountPage />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/help/:slug" element={<HelpArticle />} />
        </Route>
      </Route>

      {/* Root: route to the role's landing page. */}
      <Route path="/" element={<RootRedirect />} />

      {/* Unknown path -> root, which re-resolves the correct landing. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
