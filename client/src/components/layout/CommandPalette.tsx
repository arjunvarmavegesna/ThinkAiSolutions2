import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, LogOut, Megaphone, Moon, Sun, User } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { navForRole, quickActionsForRole } from '@/lib/navigation';
import { useTheme } from '@/lib/useTheme';
import { useGlobalSearch } from '@/features/dashboard/useGlobalSearch';
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
import { Badge, type BadgeProps } from '@/components/ui/badge';

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

const TEMPLATE_VARIANT: Record<string, BadgeProps['variant']> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
};
const CAMPAIGN_VARIANT: Record<string, BadgeProps['variant']> = {
  completed: 'success',
  sending: 'warning',
  failed: 'danger',
  queued: 'default',
};

/** The ⌘K palette: search contacts/campaigns/templates, navigate anywhere, or fire a quick action. */
export function CommandPalette(): JSX.Element {
  const { open, setOpen } = useCommandMenu();
  const { role, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [query, setQuery] = React.useState('');

  const groups = React.useMemo(() => navForRole(role), [role]);
  const actions = React.useMemo(() => quickActionsForRole(role), [role]);

  // Only tenants/agents own searchable entities; the admin console has none of these.
  const searchEnabled = role === 'tenant_admin' || role === 'agent';
  const search = useGlobalSearch(query, searchEnabled && open);
  const hasEntityResults =
    search.contacts.length > 0 || search.campaigns.length > 0 || search.templates.length > 0;

  // Reset the query each time the palette closes so it always opens clean.
  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const run = React.useCallback(
    (fn: () => void) => {
      setOpen(false);
      // Defer so the dialog close animation doesn't fight the route transition.
      requestAnimationFrame(fn);
    },
    [setOpen],
  );

  // Entity hits are fetched (already filtered) by us — prefix each value with the live query so
  // cmdk's built-in substring filter never hides a server result we deliberately surfaced.
  const tag = (id: string): string => `${query} ${id}`;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={searchEnabled ? 'Search contacts, campaigns, templates…' : 'Search or jump to…'}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{search.loading ? 'Searching…' : 'No results found.'}</CommandEmpty>

        {/* Entity search results — shown first so a query surfaces real records up top */}
        {search.contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {search.contacts.map((c) => (
              <CommandItem
                key={`contact-${c.id}`}
                value={tag(`contact ${c.id}`)}
                onSelect={() => run(() => navigate(`/contacts?search=${encodeURIComponent(c.phone)}`))}
              >
                <User />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.phone}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {search.campaigns.length > 0 && (
          <CommandGroup heading="Campaigns">
            {search.campaigns.map((c) => (
              <CommandItem
                key={`campaign-${c.id}`}
                value={tag(`campaign ${c.id}`)}
                onSelect={() => run(() => navigate(`/campaigns?id=${encodeURIComponent(c.id)}`))}
              >
                <Megaphone />
                <span className="flex-1 truncate">{c.title}</span>
                <Badge variant={CAMPAIGN_VARIANT[c.status] ?? 'default'} className="capitalize">
                  {c.status}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {search.templates.length > 0 && (
          <CommandGroup heading="Templates">
            {search.templates.map((t) => (
              <CommandItem
                key={`template-${t.id}`}
                value={tag(`template ${t.id}`)}
                onSelect={() => run(() => navigate('/templates'))}
              >
                <FileText />
                <span className="flex-1 truncate">{t.name}</span>
                <Badge variant={TEMPLATE_VARIANT[t.status] ?? 'default'} className="capitalize">
                  {t.status}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasEntityResults && <CommandSeparator />}

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
