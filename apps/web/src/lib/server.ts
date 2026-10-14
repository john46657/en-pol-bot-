/**
 * Der Discord-Server dieses Systems – fest eingerichtet (kommt mit dem Profil von der API), keine Auswahl.
 * '' = noch nicht eingerichtet.
 */
const listeners = new Set<() => void>();
let current = '';
export const getServer = () => current;
export function setHomeServer(id: string | null | undefined) {
  const next = id ?? '';
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}
export function subscribeServer(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
