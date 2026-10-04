/** Wert-Prüfer, die jede Normalisierung nutzt (eigene Datei, damit config.ts und widgets.ts sich nicht gegenseitig importieren). */
// --- Wert-Prüfer ---------------------------------------------------------------------------------
export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const HEX = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const color = (v: unknown, d: string) =>
  typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : d;
export const num = (v: unknown, min: number, max: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
export const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
export const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
  list.includes(v as T) ? (v as T) : d;
export const text = (v: unknown, max: number, d: string) =>
  typeof v === 'string'
    ? [...v]
        .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
        .join('')
        .slice(0, max)
    : d;
/** Nur https-URLs oder lokale Uploads – nie javascript:, data:, Protokoll-relative oder fremde Schemata. */
export function safeUrl(v: unknown, d = ''): string {
  if (typeof v !== 'string' || v.length > 500) return d;
  if (v === '') return '';
  if (/^\/uploads\/[A-Za-z0-9._\-/]+$/.test(v) && !v.includes('..')) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : d;
  } catch {
    return d;
  }
}

/** Mehrzeiliger Text: Zeilenumbrüche bleiben (als `\n`), alle anderen Steuerzeichen entfallen. */
export const longText = (v: unknown, max: number, d: string) =>
  typeof v === 'string'
    ? [...v.replace(/\r\n?/g, '\n')]
        .filter((ch) => ch === '\n' || (ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127))
        .join('')
        .slice(0, max)
    : d;
