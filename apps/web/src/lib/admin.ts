import { localParts, zonedTime, ORG_TIME_ZONE } from '@enrp/shared';
import { api, apiHeaders } from './api';

/** Verwaltung 3.0: gemeinsame Hilfen fürs Dashboard. Zeiten werden immer in der Organisationszeit (Europe/Berlin) eingegeben und angezeigt. */
export const TZ = ORG_TIME_ZONE;

/** ISO → Wert für <input type="datetime-local"> in Organisationszeit. */
export function toLocalInput(iso: string | Date | null | undefined) {
  if (!iso) return '';
  const l = localParts(new Date(iso), TZ);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${l.y}-${p(l.m)}-${p(l.d)}T${p(l.h)}:${p(l.min)}`;
}
/** <input type="datetime-local"> (Organisationszeit) → ISO (UTC). Leer/ungültig → null. */
export function fromLocalInput(v: string): string | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? zonedTime(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, TZ).toISOString() : null;
}
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' });
export const dayKey = (iso: string | Date) => { const l = localParts(new Date(iso), TZ); return `${l.y}-${String(l.m).padStart(2, '0')}-${String(l.d).padStart(2, '0')}`; };

/** Datei-Download über die API (CSV-Exporte, Dokumente) – mit Server-Kontext und Session-Cookie. */
export async function download(path: string, filename: string) {
  const res = await fetch(`/api/v1${path}`, { credentials: 'same-origin', headers: apiHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { message?: string }).message ?? `Download fehlgeschlagen (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface Person { userId: string; name: string; rank: string | null; department: string | null; callsign: string | null }
export const fetchPeople = () => api<Person[]>('/shiftplan/people');
