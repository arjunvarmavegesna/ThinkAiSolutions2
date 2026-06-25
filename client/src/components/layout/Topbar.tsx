import { Bell, LogOut, Search } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { WabaStatusBadge } from './WabaStatusBadge';
import { ThemeToggle } from './ThemeToggle';
import { useCommandMenu } from './CommandPalette';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Sticky top bar: command-search trigger, WhatsApp status, notifications, account. */
export function Topbar(): JSX.Element {
  const { user, role, logout } = useAuth();
  const { setOpen } = useCommandMenu();

  const name = user?.displayName || user?.email || 'Account';
  const initials = (name.trim()[0] || 'A').toUpperCase();
  const isAdmin = role === 'reseller_admin';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
      {/* Command search trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:border-ring/40 hover:text-foreground"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex flex-1 items-center justify-end gap-2">
        {!isAdmin && <WabaStatusBadge />}

        <ThemeToggle />

        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-[18px]" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{name}</span>
              <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={() => void logout()}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
