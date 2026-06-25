/**
 * Application shell — dark vertical rail + sticky topbar + page canvas.
 * Replaces the old horizontal top-nav. Role-aware: the rail renders the Direct
 * Admin console for `reseller_admin`, the tenant workspace otherwise.
 *
 * Mounted as a react-router layout route (renders <Outlet />). A global ⌘K
 * command palette is provided here so every nested page can open it.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommandMenuProvider, CommandPalette } from './CommandPalette';
import { Rail } from './Rail';
import { Topbar } from './Topbar';

export function AppShell(): JSX.Element {
  const { role } = useAuth();
  const location = useLocation();

  return (
    <CommandMenuProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex min-h-screen bg-background">
          <Rail role={role} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="mx-auto w-full max-w-[1200px]"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
        <CommandPalette />
      </TooltipProvider>
    </CommandMenuProvider>
  );
}
