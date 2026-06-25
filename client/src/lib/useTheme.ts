/**
 * Shared light/dark theme store. The active theme is the source-of-truth `.dark` class on
 * <html> (set before paint by the inline script in index.html). These helpers flip that class,
 * persist the choice, sync the mobile `theme-color`, and notify every subscriber so the Topbar
 * button and the ⌘K palette stay in lockstep.
 */
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const EVENT = 'themechange';

/** Read the current theme straight off the document (what the user actually sees). */
function current(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function apply(t: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem('theme', t);
  } catch {
    // storage may be unavailable (private mode) — theme still applies for the session
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#0A0E1A' : '#0A1228');
  window.dispatchEvent(new Event(EVENT));
}

export function setTheme(t: Theme): void {
  apply(t);
}

export function toggleTheme(): void {
  apply(current() === 'dark' ? 'light' : 'dark');
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Subscribe a component to the active theme. */
export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as Theme);
  return { theme, toggle: toggleTheme, setTheme };
}
