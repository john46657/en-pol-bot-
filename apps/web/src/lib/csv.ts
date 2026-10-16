import { apiHeaders } from './api';

/** CSV für Excel (Semikolon, UTF-8 mit BOM): Zellen mit ; " oder Zeilenumbruch werden in Anführungszeichen gesetzt. */
export const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (head: string[], rows: unknown[][]) => `﻿${[head, ...rows].map((r) => r.map(csvCell).join(';')).join('\n')}`;

/** Datei im Browser speichern. */
export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** CSV-Datei mit Datum im Namen, z. B. `dienststunden-2026-10-16.csv`. */
export const downloadCsv = (base: string, head: string[], rows: unknown[][]) => downloadFile(`${base}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(head, rows));

/** Datei von der API laden (mit Server-Kennung des gewählten Servers) und speichern – statt eines Links ohne Header. */
export async function downloadApi(path: string, fallbackName: string) {
  const res = await fetch(`/api/v1${path}`, { credentials: 'same-origin', headers: apiHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Download fehlgeschlagen (${res.status})`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
