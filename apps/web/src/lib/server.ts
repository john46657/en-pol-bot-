/** Gewählter Discord-Server (Dropdown oben links). '' = alle Server. Wird bei jeder API-Anfrage als `X-Guild-Id` mitgeschickt. */
const KEY = 'enrp.server';
const listeners = new Set<() => void>();
let current = (() => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } })();
export const getServer = () => current;
export function setServer(id: string) {
  if (id === current) return;
  current = id;
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* privater Modus */ }
  listeners.forEach((l) => l());
}
export function subscribeServer(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
