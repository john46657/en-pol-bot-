import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'nexus-theme';

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null; // z. B. Privatmodus – Seite funktioniert ohne Speicherung
  }
}

const system = (): Theme =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

// Gemeinsamer Zustand: eigene Wahl des Benutzers > Vorgabe des Servers (Design) > Systemeinstellung.
let serverDefault: Theme | null = null;
let override: Theme | null = null; // gilt, falls localStorage nicht beschreibbar ist
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const current = (): Theme => stored() ?? override ?? serverDefault ?? system();

/** Hat der Benutzer selbst zwischen hell und dunkel gewählt? Dann gilt das statt der Server-Vorgabe. */
export const hasStoredTheme = (): boolean => stored() !== null || override !== null;

/** Vorgabe-Modus des Servers (`null` = System). Wirkt nur, solange der Benutzer nichts gewählt hat. */
export function setServerThemeDefault(mode: Theme | null): void {
  if (serverDefault === mode) return;
  serverDefault = mode;
  notify();
}

/** Dark Mode: eigene Wahl, sonst Server-Vorgabe, sonst Systemeinstellung; setzt `data-theme` am `<html>`. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    current,
  );
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    override = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignorieren */
    }
    notify();
  }, []);
  return { theme, toggle };
}

/** Beim Start anwenden, damit es kein Aufblitzen gibt. */
export function applyInitialTheme(): void {
  document.documentElement.dataset['theme'] = current();
}
