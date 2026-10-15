/** Gewählter Discord-Server (Dropdown oben links). '' = alle Server. Wird bei jeder API-Anfrage als `X-Guild-Id` mitgeschickt. */
const KEY = 'enrp.server';
const listeners = new Set<() => void>();
let current = (() => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } })();
export const getServer = () => current;
export function setServer(id: string) {
  if (id === current) return;
  current = id;
  if (id) try { sessionStorage.removeItem('enrp.server.all'); } catch { /* privater Modus */ }
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* privater Modus */ }
  listeners.forEach((l) => l());
}
export function subscribeServer(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/**
 * „Alle Server“ ausdrücklich gewählt (Server-Übersicht, nur Systemadministratoren) – gilt für diese Sitzung im Browser.
 * Ohne diese Wahl wird bei genau einem Server dieser automatisch gewählt (sonst stünden Daten aller Bereiche gemischt da).
 */
const ALL_KEY = 'enrp.server.all';
export const chooseAllServers = () => { try { sessionStorage.setItem(ALL_KEY, '1'); } catch { /* privater Modus */ } setServer(''); };
export const allServersChosen = () => { try { return sessionStorage.getItem(ALL_KEY) === '1'; } catch { return false; } };
