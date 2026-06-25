/**
 * Light/dark theme toggle button (top bar). Backed by the shared theme store in
 * `@/lib/useTheme`, so it stays in sync with the ⌘K palette's "Toggle theme" command.
 * The no-flash initial `.dark` class is set by an inline script in index.html before paint.
 */
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/useTheme';

export function ThemeToggle(): JSX.Element {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button variant="ghost" size="icon" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} onClick={toggle}>
      {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </Button>
  );
}
