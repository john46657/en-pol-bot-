import { useEffect, useState } from 'react';

const query = (q: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);

/** true, solange die Media-Query zutrifft (ohne matchMedia, z. B. in Tests: `fallback`). */
export function useMediaQuery(q: string, fallback = false): boolean {
  const [match, setMatch] = useState(() => query(q)?.matches ?? fallback);
  useEffect(() => {
    const m = query(q);
    if (!m) return;
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return match;
}

/** Schmaler Bildschirm (Handy, < 640 px). */
export const usePhone = () => useMediaQuery('(max-width: 639px)');
