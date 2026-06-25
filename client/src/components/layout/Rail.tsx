import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronsUpDown } from 'lucide-react';
import type { Role } from '@thinkai/shared';
import { consoleLabelForRole, navForRole } from '@/lib/navigation';
import { MetaLogo } from '@/components/MetaLogo';
import { cn } from '@/lib/utils';

/**
 * Theme-aware vertical navigation rail (Linear-style): a white surface in light mode, deep
 * navy in dark (driven by the --rail* tokens). The active item shows a brand-blue pill that
 * slides between items via a shared `layoutId` for a premium, continuous feel.
 */
export function Rail({ role }: { role: Role | null }): JSX.Element {
  const groups = navForRole(role);

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-rail-border bg-rail text-rail-foreground lg:flex">
      {/* Workspace switcher */}
      <button
        type="button"
        className="m-3 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-rail-foreground/[0.06]"
      >
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-black/5">
          <img src="/logo.png?v=2" alt="" className="size-full object-contain" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">ThinkAiSolutions</span>
          <span className="block truncate text-xs text-rail-muted">{consoleLabelForRole(role)}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-rail-muted" />
      </button>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-rail-muted/80">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                        isActive ? 'text-rail-foreground' : 'text-rail-muted hover:text-rail-foreground',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="rail-active"
                            className="absolute inset-0 rounded-md bg-rail-accent ring-1 ring-inset ring-rail-border"
                            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                          />
                        )}
                        <item.icon
                          className={cn(
                            'relative z-10 size-[18px] shrink-0 transition-colors',
                            isActive ? 'text-primary' : 'text-rail-muted group-hover:text-rail-foreground',
                          )}
                        />
                        <span className="relative z-10 truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-rail-border px-4 py-3">
        <p className="flex items-center gap-1.5 text-[11px] text-rail-muted">
          <MetaLogo className="h-5 w-auto shrink-0" />
          Meta Tech Provider
        </p>
      </div>
    </aside>
  );
}
