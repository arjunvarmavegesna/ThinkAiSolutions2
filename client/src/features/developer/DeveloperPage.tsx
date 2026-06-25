/**
 * Developer Hub — tabbed layout. The header + tab bar are persistent; each tab is its own route
 * (/developer/keys · /developer/webhooks · /developer/logs) rendered into the <Outlet/>, so tabs
 * are linkable and survive a refresh.
 */
import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: 'keys', label: 'API Keys' },
  { to: 'webhooks', label: 'Webhooks' },
  { to: 'logs', label: 'Delivery Logs' },
];

export function DeveloperPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-800">Developer</h1>
        <p className="text-sm text-gray-500">
          API keys and webhooks for building your own integrations.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-brand-600'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
