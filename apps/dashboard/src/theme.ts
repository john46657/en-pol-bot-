import { useCallback, useEffect, useState } from 'react';

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

/** Dark Mode: gespeicherte Wahl, sonst Systemeinstellung; setzt `data-theme` am `<html>`. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system());
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignorieren */
      }
      return next;
    });
  }, []);
  return { theme, toggle };
}

/** Beim Start anwenden, damit es kein Aufblitzen gibt. */
export function applyInitialTheme(): void {
  document.documentElement.dataset['theme'] = stored() ?? system();
}
