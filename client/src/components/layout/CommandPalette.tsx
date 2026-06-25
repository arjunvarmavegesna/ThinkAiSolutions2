import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { navForRole, quickActionsForRole } from '@/lib/navigation';
import { useTheme } from '@/lib/useTheme';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

interface CommandMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const CommandMenuContext = React.createContext<CommandMenuContextValue | null>(null);

/** Provides global ⌘K state + the keyboard listener. Wrap the shell with this. */
export function CommandMenuProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((o) => !o), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggle]);

  const value = React.useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  return <CommandMenuContext.Provider value={value}>{children}</CommandMenuContext.Provider>;
}

export function useCommandMenu(): CommandMenuContextValue {
  const ctx = React.useContext(CommandMenuContext);
  if (!ctx) throw new Error('useCommandMenu must be used within CommandMenuProvider');
  return ctx;
}

/** The ⌘K palette itself: navigate anywhere or fire a quick action. */
export function CommandPalette(): JSX.Element {
  const { open, setOpen } = useCommandMenu();
  const { role, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  const groups = React.useMemo(() => navForRole(role), [role]);
  const actions = React.useMemo(() => quickActionsForRole(role), [role]);

  const run = React.useCallback(
    (fn: () => void) => {
      setOpen(false);
      // Defer so the dialog close animation doesn't fight the route transition.
      requestAnimationFrame(fn);
    },
    [setOpen],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          {actions.map((a) => (
            <CommandItem
              key={a.to + a.label}
              value={`${a.label} ${a.keywords ?? ''}`}
              onSelect={() => run(() => navigate(a.to))}
            >
              <a.icon />
              {a.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {groups.map((group) => (
          <React.Fragment key={group.label}>
            <CommandSeparator />
            <CommandGroup heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`go ${item.label}`}
                  onSelect={() => run(() => navigate(item.to))}
                >
                  <item.icon />
                  {item.label}
                  <CommandShortcut>
                    <ArrowRight className="size-3.5" />
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}

        <CommandSeparator />
        <CommandGroup heading="Account">
          <CommandItem
            value="toggle theme appearance dark light mode"
            onSelect={() => run(toggleTheme)}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          </CommandItem>
          <CommandItem value="log out sign out" onSelect={() => run(() => void logout())}>
            <LogOut />
            Log out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
