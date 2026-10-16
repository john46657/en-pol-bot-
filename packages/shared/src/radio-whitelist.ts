/**
 * Funk-Whitelist (externer Funkdienst): Status, Regeln für den Discord-Rollenabgleich und CSV-Hilfen.
 * Reine Funktionen – Backend (maßgeblich) und Dashboard (Anzeige) nutzen dieselben Regeln.
 */
export const RADIO_GRANT_STATUSES = ['PENDING', 'ACTIVE', 'DISABLED', 'SUSPENDED', 'EXPIRED', 'REVOKED'] as const;
export type RadioGrantStatus = (typeof RADIO_GRANT_STATUSES)[number];
export const RADIO_GRANT_STATUS_LABEL: Record<RadioGrantStatus, string> = {
  PENDING: 'Ausstehend', ACTIVE: 'Aktiv', DISABLED: 'Deaktiviert', SUSPENDED: 'Gesperrt', EXPIRED: 'Abgelaufen', REVOKED: 'Entzogen (archiviert)',
};
export const RADIO_GRANT_SOURCES = ['MANUAL', 'ROLE', 'REQUEST', 'LEGACY'] as const;
export type RadioGrantSource = (typeof RADIO_GRANT_SOURCES)[number];
export const RADIO_GRANT_SOURCE_LABEL: Record<RadioGrantSource, string> = { MANUAL: 'Manuell', ROLE: 'Discord-Rolle', REQUEST: 'Antrag', LEGACY: 'Übernommen' };

export interface RadioGrantState { status: string; expiresAt: Date | string | null; suspendedUntil?: Date | string | null; statusBeforeSuspend?: string | null }
const t = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/** Tatsächlicher Status zum Zeitpunkt `now` (abgelaufene Freigaben bzw. abgelaufene Sperren, bevor die Hintergrundaufgabe sie speichert). */
export function effectiveRadioStatus(g: RadioGrantState, now = new Date()): RadioGrantStatus {
  const n = now.getTime();
  if (g.status === 'SUSPENDED') {
    const until = t(g.suspendedUntil);
    if (until === null || until > n) return 'SUSPENDED';
    return effectiveRadioStatus({ status: g.statusBeforeSuspend ?? 'ACTIVE', expiresAt: g.expiresAt }, now);
  }
  if (g.status === 'ACTIVE') { const e = t(g.expiresAt); if (e !== null && e <= n) return 'EXPIRED'; }
  return (RADIO_GRANT_STATUSES as readonly string[]).includes(g.status) ? (g.status as RadioGrantStatus) : 'DISABLED';
}
/** Darf das Mitglied den Funkdienst nutzen? Nur eine aktive, nicht abgelaufene, nicht gesperrte Freigabe. */
export const isRadioAuthorized = (g: RadioGrantState | null | undefined, now = new Date()) => !!g && effectiveRadioStatus(g, now) === 'ACTIVE';

// ---------- Discord-Rollenabgleich ----------
export interface RadioRoleRules {
  enabled: boolean;
  /** Rollen, die eine Funkberechtigung geben (eine genügt). */
  grantRoleIds: string[];
  /** Rollen, von denen mindestens eine nötig ist, um eine Freigabe zu behalten. Leer = die Rollen aus grantRoleIds. */
  requiredRoleIds: string[];
  /** Rolle erhalten: Freigabe sofort aktiv, als „ausstehend“ zur Prüfung oder nichts tun. */
  onRoleGain: 'ACTIVATE' | 'PENDING' | 'NONE';
  /** Rolle verloren – über die Rolle entstandene Freigaben: entziehen (archivieren), deaktivieren oder nichts tun. */
  onRoleLoss: 'REVOKE' | 'DISABLE' | 'NONE';
  /** Rolle verloren – manuell/per Antrag erteilte Freigaben: behalten (Standard), deaktivieren oder entziehen. */
  manualOnRoleLoss: 'KEEP' | 'DISABLE' | 'REVOKE';
}
export const DEFAULT_RADIO_ROLE_RULES: RadioRoleRules = { enabled: false, grantRoleIds: [], requiredRoleIds: [], onRoleGain: 'ACTIVATE', onRoleLoss: 'REVOKE', manualOnRoleLoss: 'KEEP' };

export interface RoleSyncGrant { status: string; source: string; roleRevoked: boolean; archived: boolean; expiresAt: Date | string | null; suspendedUntil?: Date | string | null; statusBeforeSuspend?: string | null }
export type RoleSyncAction =
  | { kind: 'none'; why: string }
  | { kind: 'create'; status: 'ACTIVE' | 'PENDING' }
  | { kind: 'reactivate'; status: 'ACTIVE' | 'PENDING' }
  | { kind: 'disable' }
  | { kind: 'revoke' };

/**
 * Was der Rollenabgleich für ein Mitglied tun soll. `roleIds = null`: Mitglied ist nicht (mehr) auf dem Server.
 * Regeln: Sperren werden nie durch Rollen aufgehoben; manuell entzogene oder deaktivierte Freigaben werden nie automatisch
 * wieder aktiv (nur solche, die der Abgleich selbst entzogen hat); manuelle Freigaben folgen `manualOnRoleLoss`.
 */
export function radioRoleSyncAction(rules: RadioRoleRules, roleIds: readonly string[] | null, grant: RoleSyncGrant | null, now = new Date()): RoleSyncAction {
  if (!rules.enabled) return { kind: 'none', why: 'Rollenabgleich ist ausgeschaltet.' };
  const has = (ids: readonly string[]) => !!roleIds && ids.some((r) => roleIds.includes(r));
  const hasGrantRole = rules.grantRoleIds.length > 0 && has(rules.grantRoleIds);
  const required = rules.requiredRoleIds.length ? rules.requiredRoleIds : rules.grantRoleIds;
  const keeps = required.length === 0 ? roleIds !== null : has(required);
  const gainStatus = rules.onRoleGain === 'PENDING' ? 'PENDING' : 'ACTIVE';

  if (!grant) return hasGrantRole && rules.onRoleGain !== 'NONE' ? { kind: 'create', status: gainStatus } : { kind: 'none', why: 'Keine Freigabe und keine berechtigende Rolle.' };
  const status = effectiveRadioStatus(grant, now);
  if (status === 'SUSPENDED') return { kind: 'none', why: 'Gesperrt – Sperren hebt nur eine Führungskraft auf.' };
  if (grant.archived || status === 'REVOKED' || status === 'DISABLED') {
    if (grant.roleRevoked && hasGrantRole && keeps && rules.onRoleGain !== 'NONE') return { kind: 'reactivate', status: gainStatus };
    return { kind: 'none', why: grant.roleRevoked ? 'Berechtigende Rolle fehlt weiterhin.' : 'Manuell entzogen/deaktiviert – wird nicht automatisch wieder aktiv.' };
  }
  if (keeps) return { kind: 'none', why: 'Erforderliche Rolle vorhanden.' };
  const policy = grant.source === 'ROLE' ? rules.onRoleLoss : rules.manualOnRoleLoss;
  if (policy === 'REVOKE') return { kind: 'revoke' };
  if (policy === 'DISABLE') return { kind: 'disable' };
  return { kind: 'none', why: grant.source === 'ROLE' ? 'Regel: bei Rollenverlust nichts tun.' : 'Manuelle Freigabe bleibt laut Regel bestehen.' };
}

// ---------- CSV (Export/Import für Funkdienste ohne API) ----------
export const RADIO_CSV_COLUMNS = ['discord_id', 'discord_name', 'external_name', 'status', 'rank', 'department', 'expires_at', 'reason'] as const;

/** Eine CSV-Zelle (Komma-getrennt, RFC 4180), mit Schutz vor Formel-Injektion in Tabellenprogrammen. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Einfacher CSV-Leser (Komma oder Semikolon, Anführungszeichen, Zeilenumbrüche in Feldern). Erste Zeile = Spaltennamen. */
export function parseCsv(text: string): { header: string[]; rows: { line: number; cells: Record<string, string> }[] } {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const records: { line: number; cells: string[] }[] = [];
  let cur: string[] = [], cell = '', quoted = false, line = 1, start = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else { if (c === '\n') line++; cell += c; }
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { cur.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      cur.push(cell); records.push({ line: start, cells: cur }); cur = []; cell = ''; line++; start = line;
    } else cell += c;
  }
  if (cell !== '' || cur.length) { cur.push(cell); records.push({ line: start, cells: cur }); }
  const nonEmpty = records.filter((r) => r.cells.some((x) => x.trim() !== ''));
  const header = (nonEmpty.shift()?.cells ?? []).map((h) => h.trim().toLowerCase());
  return { header, rows: nonEmpty.map((r) => ({ line: r.line, cells: Object.fromEntries(header.map((h, i) => [h, (r.cells[i] ?? '').trim().replace(/^'(?=[=+\-@])/, '')])) })) };
}
