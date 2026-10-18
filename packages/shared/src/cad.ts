/**
 * CAD-Leitstelle + ER:LC: Standardwerte der Konfiguration. Alles hier ist nur der Startzustand –
 * Administratoren ändern Prioritäten, Status, Einheitentypen, Layer, Marker, Karte und Discord-Ziele im Dashboard.
 */
export interface CadOption { key: string; label: string; emoji?: string; color?: string; order?: number }
export interface CadStatusOption extends CadOption { /** Status beendet den Einsatz (Abschlusszeit wird gesetzt). */ closed?: boolean }
export interface CadUnitType extends CadOption { /** Layer, auf dem Einheiten dieses Typs erscheinen. */ layer?: string }
export interface CadLayer { key: string; label: string; builtin?: boolean; enabledByDefault?: boolean }
export interface CadMarkerStyle { key: string; label: string; emoji: string; color: string }
export interface CadMapConfig {
  /** Kartenbild (hochgeladene ER:LC-Map). Leer = noch keine Karte hinterlegt. */
  imageUrl?: string | null;
  width: number; height: number;
  /** Pixel des Spiel-Ursprungs (0,0) und Pixel pro Spieleinheit – zum Kalibrieren der Marker. */
  originX: number; originY: number; scale: number;
}
export interface CadRoute { id: string; guildId: string; event: CadEvent; channelIds: string[]; pingRoleIds: string[]; enabled: boolean }
export interface CadField { key: string; label: string; type: 'text' | 'number' | 'select'; options?: string[] }
export interface CadConfig {
  /** Discord-Server der Leitstelle (Heimat der Einsätze). */
  homeGuildId?: string | null;
  incidentNumberPrefix: string;
  incidentTypes: CadOption[];
  priorities: CadOption[];
  incidentStatuses: CadStatusOption[];
  unitStatuses: CadOption[];
  unitTypes: CadUnitType[];
  layers: CadLayer[];
  markers: CadMarkerStyle[];
  map: CadMapConfig;
  routes: CadRoute[];
  /** Zusätzliche Felder für Funk-/Personenzuordnung (Teamübersicht). */
  memberFields: CadField[];
  /** Widgets der Leitstellen-Startseite (Standard für alle; jeder Benutzer kann seine eigene Ansicht anpassen). */
  widgets: string[];
}

export const CAD_EVENTS = ['incident.created', 'incident.status', 'incident.assigned', 'incident.closed', 'incident.feedback', 'incident.support', 'call.received', 'announcement', 'radio', 'handover', 'wanted.hit', 'wanted.possible', 'wanted.erlc'] as const;
export type CadEvent = (typeof CAD_EVENTS)[number];
export const CAD_EVENT_LABELS: Record<CadEvent, string> = {
  'incident.created': 'Neuer Einsatz', 'incident.status': 'Einsatzstatus geändert', 'incident.assigned': 'Einheit zugewiesen',
  'incident.closed': 'Einsatz abgeschlossen', 'incident.feedback': 'Rückmeldung einer Einheit (MDT)', 'incident.support': 'Unterstützung benötigt',
  'call.received': 'Notruf eingegangen', announcement: 'Wichtige Leitstellenmeldung', radio: 'Funkmeldung', handover: 'Schichtübergabe',
  'wanted.hit': 'Fahndungstreffer (Roblox-ID bestätigt)', 'wanted.possible': 'Mögliche Fahndungsübereinstimmung (nur Name – Prüfung nötig)',
  'wanted.erlc': 'Im Spiel gesucht (ER:LC-Wanted-Sterne; ohne eigenen Kanal → Kanal „Fahndungstreffer“)',
};

/**
 * Rückmeldungen einer Einheit aus dem MDT bzw. Discord (`/cad rueckmeldung`). Sie landen in der Einsatzchronik;
 * `unitStatus` wird nur gesetzt, wenn es diesen Einheitenstatus in den CAD-Einstellungen gibt. Den Einsatz selbst ändern sie nie.
 */
export const CAD_FEEDBACK = [
  { key: 'accepted', label: 'Auftrag angenommen', emoji: '✅', unitStatus: 'EN_ROUTE' },
  { key: 'en_route', label: 'Ausgerückt', emoji: '🚓', unitStatus: 'EN_ROUTE' },
  { key: 'on_scene', label: 'Am Einsatzort', emoji: '📍', unitStatus: 'ON_SCENE' },
  { key: 'support', label: 'Unterstützung benötigt', emoji: '🆘' },
  { key: 'under_control', label: 'Einsatz unter Kontrolle', emoji: '🛡️' },
  { key: 'completed', label: 'Einsatz abgeschlossen (Meldung)', emoji: '🏁' },
] as const satisfies readonly { key: string; label: string; emoji: string; unitStatus?: string }[];
export type CadFeedbackKey = (typeof CAD_FEEDBACK)[number]['key'];
export const CAD_FEEDBACK_KEYS = CAD_FEEDBACK.map((f) => f.key) as [CadFeedbackKey, ...CadFeedbackKey[]];

/** Datenarten, die eine Server-Verbindung senden darf, und Aktionen, die der verbundene Server zurück ausführen darf. */
export const CAD_LINK_SEND_TYPES = ['incidents', 'incident_status', 'unit_requests', 'calls', 'announcements', 'radio'] as const;
export const CAD_LINK_ACTIONS = ['status_report', 'radio', 'view_incidents', 'dispatch'] as const;
export const CAD_LINK_LABELS: Record<string, string> = {
  incidents: 'Einsätze senden', incident_status: 'Einsatzstatus senden', unit_requests: 'Einheiten anfordern', calls: 'Notrufe senden', announcements: 'Leitstellenmeldungen senden', radio: 'Funkmeldungen senden',
  status_report: 'Status zurückmelden', view_incidents: 'Einsatzstatus sehen', dispatch: 'Notrufe/Einsätze bearbeiten (Übernehmen, Einsatz erstellen, Einheit zuweisen)',
};
/** Welche Datenart ein CAD-Ereignis bei verbundenen Servern ist. Fehlt ein Ereignis (Fahndungstreffer), geht es nie an verbundene Server. */
export const CAD_EVENT_SEND_TYPE: Partial<Record<CadEvent, (typeof CAD_LINK_SEND_TYPES)[number]>> = {
  'incident.created': 'incidents', 'incident.status': 'incident_status', 'incident.assigned': 'unit_requests', 'incident.closed': 'incident_status',
  'incident.feedback': 'incident_status', 'incident.support': 'incident_status', 'call.received': 'calls', announcement: 'announcements', radio: 'radio', handover: 'announcements',
};

export const CAD_WIDGETS = ['activeIncidents', 'availableUnits', 'activeCalls', 'erlcStatus', 'map', 'units', 'radio', 'persons', 'vehicles', 'dutyActivity'] as const;
export const CAD_WIDGET_LABELS: Record<string, string> = {
  activeIncidents: 'Aktive Einsätze', availableUnits: 'Verfügbare Einheiten', activeCalls: 'Aktive Notrufe',
  erlcStatus: 'ER:LC-Status', map: 'Einsatzkarte', units: 'Einheiten', radio: 'Letzte Funkmeldungen', persons: 'Personen', vehicles: 'Fahrzeuge', dutyActivity: 'Aktivität im Dienst',
};

/** Offizielle ER:LC-Kartenbilder sind 5355 × 5355 px, Spielkoordinate (0,0) liegt in der Mitte. */
export const ERLC_MAP_SIZE = 5355;
/**
 * Mitgelieferte offizielle ER:LC-Karte mit Postleitzahlen (Postals) und Straßennamen (api.erlc.gg/maps, „fall_postals“, 5355 × 5355)
 * – Standardkarte für Einsatzkarte, Leitstelle und Mini-Karten, gilt ohne eigenes Kartenbild oder wenn es nicht lädt.
 */
export const ERLC_BUILTIN_MAP = '/maps/erlc-map-postals.webp';

export const DEFAULT_CAD_CONFIG: CadConfig = {
  homeGuildId: null,
  incidentNumberPrefix: 'E',
  incidentTypes: [
    { key: 'ROBBERY', label: 'Raub', emoji: '💰' }, { key: 'SHOTS', label: 'Schussabgabe', emoji: '🔫' }, { key: 'TRAFFIC', label: 'Verkehrsunfall', emoji: '🚗' },
    { key: 'HOSTAGE', label: 'Geiselnahme', emoji: '🧷' }, { key: 'PURSUIT', label: 'Verfolgung', emoji: '🚓' }, { key: 'OTHER', label: 'Sonstiges', emoji: '📋' },
  ],
  priorities: [
    { key: 'HIGH', label: 'Hoch', emoji: '🔴', color: '#ef4444', order: 0 },
    { key: 'MEDIUM', label: 'Mittel', emoji: '🟠', color: '#f97316', order: 1 },
    { key: 'LOW', label: 'Niedrig', emoji: '🟢', color: '#22c55e', order: 2 },
  ],
  incidentStatuses: [
    { key: 'NEW', label: 'Neu', emoji: '🆕', color: '#3b82f6' },
    { key: 'ACKNOWLEDGED', label: 'Angenommen', emoji: '📥', color: '#6366f1' },
    { key: 'EN_ROUTE', label: 'Einheiten unterwegs', emoji: '🚓', color: '#0ea5e9' },
    { key: 'ON_SCENE', label: 'Am Einsatzort', emoji: '📍', color: '#f97316' },
    { key: 'CRITICAL', label: 'Kritisch', emoji: '🚨', color: '#ef4444' },
    { key: 'UNDER_CONTROL', label: 'Unter Kontrolle', emoji: '🛡️', color: '#22c55e' },
    { key: 'CLOSED', label: 'Abgeschlossen', emoji: '✅', color: '#64748b', closed: true },
    { key: 'CANCELLED', label: 'Abgebrochen', emoji: '✖️', color: '#64748b', closed: true },
  ],
  unitStatuses: [
    { key: 'AVAILABLE', label: 'Verfügbar', emoji: '🟢', color: '#22c55e' },
    { key: 'PATROL', label: 'Auf Streife', emoji: '🟡', color: '#eab308' },
    { key: 'EN_ROUTE', label: 'Unterwegs', emoji: '🔵', color: '#3b82f6' },
    { key: 'ON_SCENE', label: 'Am Einsatzort', emoji: '🟠', color: '#f97316' },
    { key: 'BUSY', label: 'Im Einsatz', emoji: '🔴', color: '#ef4444' },
    { key: 'UNAVAILABLE', label: 'Nicht verfügbar', emoji: '⚫', color: '#475569' },
    { key: 'OFF_DUTY', label: 'Außer Dienst', emoji: '⚪', color: '#94a3b8' },
  ],
  unitTypes: [
    { key: 'SEK', label: 'SEK', emoji: '🚓', color: '#1d4ed8', layer: 'sek' },
    { key: 'K9', label: 'K9', emoji: '🐕', color: '#a16207', layer: 'k9' },
    { key: 'PATROL', label: 'Streife', emoji: '🚔', color: '#0891b2', layer: 'units' },
  ],
  layers: [
    { key: 'incidents', label: 'Einsätze', builtin: true, enabledByDefault: true },
    { key: 'calls', label: 'ER:LC Notrufe', builtin: true, enabledByDefault: true },
    { key: 'sek', label: 'SEK-Einheiten', builtin: true, enabledByDefault: true },
    { key: 'k9', label: 'K9-Einheiten', builtin: true, enabledByDefault: true },
    { key: 'units', label: 'Weitere Einheiten', builtin: true, enabledByDefault: true },
    { key: 'vehicles', label: 'Polizeifahrzeuge (Position des Besitzers)', builtin: true, enabledByDefault: true },
    { key: 'staff', label: 'Staff', builtin: true, enabledByDefault: false },
    { key: 'players', label: 'Alle Spieler', builtin: true, enabledByDefault: false },
    { key: 'pois', label: 'Eigene POIs', builtin: true, enabledByDefault: true },
    { key: 'zones', label: 'Eigene Zonen', builtin: true, enabledByDefault: true },
    { key: 'restricted', label: 'Sperrbereiche', builtin: true, enabledByDefault: true },
  ],
  markers: [
    { key: 'incident', label: 'Einsatz', emoji: '🔴', color: '#ef4444' },
    { key: 'call', label: 'Emergency Call', emoji: '🚨', color: '#f43f5e' },
    { key: 'unit', label: 'Einheit', emoji: '🚔', color: '#0891b2' },
    { key: 'vehicle', label: 'Polizeifahrzeug', emoji: '🚓', color: '#2563eb' },
    { key: 'staff', label: 'Staff', emoji: '👮', color: '#f59e0b' },
    { key: 'player', label: 'Spieler', emoji: '•', color: '#94a3b8' },
    { key: 'poi', label: 'POI', emoji: '📍', color: '#10b981' },
  ],
  map: { imageUrl: null, width: ERLC_MAP_SIZE, height: ERLC_MAP_SIZE, originX: ERLC_MAP_SIZE / 2, originY: ERLC_MAP_SIZE / 2, scale: 1 },
  routes: [],
  memberFields: [],
  widgets: ['activeIncidents', 'availableUnits', 'activeCalls', 'dutyActivity', 'erlcStatus', 'map', 'radio'],
};

/** Spielkoordinate (ER:LC: X nach rechts, Z nach unten, Ursprung Mitte) → Pixel im Kartenbild. */
export const gameToPixel = (m: CadMapConfig, x: number, z: number) => ({ px: m.originX + x * m.scale, py: m.originY + z * m.scale });
/** Liegt eine Spielkoordinate auf der ER:LC-Karte? Laut ER:LC-Doku: Ursprung Kartenmitte, offizielle Karte 5355 × 5355. */
export const onErlcMap = (x: number | null | undefined, z: number | null | undefined) =>
  typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= ERLC_MAP_SIZE / 2 && Math.abs(z) <= ERLC_MAP_SIZE / 2;
/** POI, dessen Name zum Ort eines Notrufs passt („Bank“, „Jewelry Store“ …): erst exakt, dann enthalten (mind. 3 Zeichen). */
export function poiForPlace<T extends { name: string; x: number | null; z: number | null }>(place: string | null | undefined, pois: T[]): T | null {
  const norm = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
  const p = place ? norm(place) : '';
  if (p.length < 3) return null;
  const usable = pois.filter((o) => o.x !== null && o.z !== null && norm(o.name).length >= 3);
  return usable.find((o) => norm(o.name) === p) ?? usable.find((o) => p.includes(norm(o.name)) || norm(o.name).includes(p)) ?? null;
}

/** Selbstkalibrierung: Notruf-Position (`p*`) ↔ Standort des Anrufers (`c*`, dokumentierte Kartenkoordinaten). */
export interface CallCalibrationPair { px: number; pz: number; cx: number; cz: number }
export interface CallCalibration { ax: number; bx: number; az: number; bz: number; n: number }
/**
 * Lineare Umrechnung je Achse (kleinste Quadrate). Nur mit mind. 3 Paaren, genug Abstand zwischen den Punkten
 * und kleiner Abweichung – sonst `null` (lieber keine als eine geratene Umrechnung). Einzelne Ausreißer
 * (z. B. Anrufer, der sich nach dem Anruf bewegt hat) werden verworfen, solange mind. 3 Paare und ⅔ übrig bleiben.
 */
export function fitCallCalibration(pairs: CallCalibrationPair[]): CallCalibration | null {
  let rest = pairs;
  for (;;) {
    const fit = fitExact(rest);
    if (fit || rest.length - 1 < Math.max(3, Math.ceil((pairs.length * 2) / 3))) return fit;
    // Paar mit der größten Abweichung von der Ausgleichsgeraden ohne es weglassen
    const drop = rest.map((_, i) => i).sort((a, b) => outlierScore(rest, b) - outlierScore(rest, a))[0]!;
    rest = rest.filter((_, i) => i !== drop);
  }
}
/** Wie stark verbessert das Weglassen dieses Paars die Geraden? (größer = eher Ausreißer) */
function outlierScore(pairs: CallCalibrationPair[], i: number) {
  const others = pairs.filter((_, j) => j !== i);
  const line = (from: number[], to: number[]) => {
    const n = from.length, mf = from.reduce((a, b) => a + b, 0) / n, mt = to.reduce((a, b) => a + b, 0) / n;
    const sxx = from.reduce((a, f) => a + (f - mf) ** 2, 0) || 1;
    const a = from.reduce((acc, f, k) => acc + (f - mf) * (to[k]! - mt), 0) / sxx;
    return { a, b: mt - a * mf };
  };
  const lx = line(others.map((p) => p.px), others.map((p) => p.cx)), lz = line(others.map((p) => p.pz), others.map((p) => p.cz));
  const p = pairs[i]!;
  return Math.abs(lx.a * p.px + lx.b - p.cx) + Math.abs(lz.a * p.pz + lz.b - p.cz);
}
function fitExact(pairs: CallCalibrationPair[]): CallCalibration | null {
  if (pairs.length < 3) return null;
  const axis = (from: number[], to: number[]) => {
    const n = from.length, mf = from.reduce((a, b) => a + b, 0) / n, mt = to.reduce((a, b) => a + b, 0) / n;
    const sxx = from.reduce((a, f) => a + (f - mf) ** 2, 0);
    if (Math.max(...from) - Math.min(...from) < 100 || sxx === 0) return null;
    const a = from.reduce((acc, f, i) => acc + (f - mf) * (to[i]! - mt), 0) / sxx, b = mt - a * mf;
    const worst = Math.max(...from.map((f, i) => Math.abs(a * f + b - to[i]!)));
    return worst <= 60 && a > 0 ? { a, b } : null;
  };
  const x = axis(pairs.map((p) => p.px), pairs.map((p) => p.cx)), z = axis(pairs.map((p) => p.pz), pairs.map((p) => p.cz));
  return x && z ? { ax: x.a, bx: x.b, az: z.a, bz: z.b, n: pairs.length } : null;
}
export const applyCallCalibration = (c: CallCalibration, x: number, z: number) => ({ x: c.ax * x + c.bx, z: c.az * z + c.bz });

export const pixelToGame = (m: CadMapConfig, px: number, py: number) => ({ x: (px - m.originX) / m.scale, z: (py - m.originY) / m.scale });

// ---- ER:LC ----
export const ERLC_FEATURES = ['players', 'staff', 'queue', 'vehicles', 'emergencyCalls', 'modCalls', 'joinLogs', 'killLogs', 'commandLogs', 'commands', 'webhook'] as const;
export type ErlcFeature = (typeof ERLC_FEATURES)[number];
export const ERLC_FEATURE_LABELS: Record<ErlcFeature, string> = {
  players: 'Spieler (inkl. Positionen)', staff: 'Server-Team', queue: 'Warteschlange', vehicles: 'Fahrzeuge', emergencyCalls: 'Notrufe', modCalls: 'Mod-Rufe',
  joinLogs: 'Beitritte', killLogs: 'Kills', commandLogs: 'Befehlsprotokoll', commands: 'Befehle ausführen', webhook: 'Ereignis-Webhook',
};
/** Update-Intervalle, die zu den API-Limits passen (ein Abruf liefert alle Daten auf einmal). */
export const ERLC_POLL_OPTIONS = [5, 10, 15, 30, 60] as const;
export const ERLC_STATUSES = ['CONNECTED', 'LIMITED', 'OFFLINE', 'ERROR', 'UNKNOWN', 'DISABLED'] as const;
export type ErlcStatus = (typeof ERLC_STATUSES)[number];
export const ERLC_STATUS_LABEL: Record<ErlcStatus, string> = { CONNECTED: '🟢 Verbunden', LIMITED: '🟡 Eingeschränkt', OFFLINE: '🔴 Offline', ERROR: '⚠️ Fehler', UNKNOWN: '⚪ Noch nicht geprüft', DISABLED: '⏸️ Deaktiviert' };
/** Standard: Befehle, die nur mit `cad.erlc_command_critical` + Bestätigung laufen, und Befehle, die nie über das Dashboard laufen. */
export const ERLC_DEFAULT_CRITICAL = [':ban', ':unban', ':kick', ':pban', ':tban', ':shutdown', ':kill', ':mod', ':unmod', ':admin', ':unadmin', ':prty', ':weather', ':time'];
export const ERLC_DEFAULT_BLOCKED = [':shutdown'];

/** „Name:123“ (ER:LC-Spielerangabe) → { name, id }. */
export function parsePlayer(v: unknown): { name: string; id: string | null } {
  const s = String(v ?? '');
  const i = s.lastIndexOf(':');
  return i > 0 && /^\d+$/.test(s.slice(i + 1)) ? { name: s.slice(0, i), id: s.slice(i + 1) } : { name: s, id: null };
}

/**
 * Automatischer ER:LC-Fahndungsabgleich. Die ER:LC-API liefert je Spieler nur „Roblox-Name:Roblox-ID“ (Players, JoinLogs) –
 * weitere eindeutige Kennungen gibt es nicht. Bestätigt ist ein Treffer nur bei exakt gleicher Roblox-ID.
 */
export const WANTED_MATCH_TYPES = ['ROBLOX_ID', 'NAME', 'ALIAS', 'NAME_ID_MISMATCH', 'ERLC_WANTED'] as const;
export type WantedMatchType = (typeof WANTED_MATCH_TYPES)[number];
export const WANTED_MATCH_LABELS: Record<WantedMatchType, string> = {
  ROBLOX_ID: 'Roblox-ID stimmt überein', NAME: 'Nur Roblox-Name stimmt überein', ALIAS: 'Nur Alias stimmt überein', NAME_ID_MISMATCH: 'Name gleich, Roblox-ID abweichend',
  ERLC_WANTED: 'Im Spiel gesucht (ER:LC-Wanted-Sterne)',
};
export const WANTED_HIT_STATUSES = ['NEW', 'REVIEW_REQUIRED', 'ACKNOWLEDGED', 'CONFIRMED', 'REJECTED'] as const;
export type WantedHitStatus = (typeof WANTED_HIT_STATUSES)[number];
export const WANTED_HIT_STATUS_LABELS: Record<WantedHitStatus, string> = {
  NEW: 'Neu', REVIEW_REQUIRED: 'Manuelle Prüfung erforderlich', ACKNOWLEDGED: 'Zur Kenntnis genommen', CONFIRMED: 'Manuell bestätigt', REJECTED: 'Verworfen (nicht die Person)',
};

export interface WantedMatchPlayer { name: string; id: string | null }
export interface WantedMatchSubject { wantedId: string; personId: string; robloxUserId: string | null; robloxUsername: string; aliases: string[] }
export interface WantedMatch { wantedId: string; personId: string; matchType: WantedMatchType; identified: boolean }

/**
 * Spieler ↔ aktive Personen-Fahndungen. Reihenfolge: 1. exakte Roblox-ID (bestätigt), 2. Roblox-Name, 3. Alias – Namen sind
 * immer nur mögliche Treffer. Gleicher Name bei unterschiedlicher Roblox-ID wird eigens gekennzeichnet (wahrscheinlich andere Person).
 */
export function matchWantedPlayer(player: WantedMatchPlayer, subjects: WantedMatchSubject[]): WantedMatch[] {
  const lc = (v: string) => v.trim().toLowerCase();
  const name = lc(player.name);
  const out: WantedMatch[] = [];
  for (const s of subjects) {
    if (player.id && s.robloxUserId && player.id === s.robloxUserId) { out.push({ wantedId: s.wantedId, personId: s.personId, matchType: 'ROBLOX_ID', identified: true }); continue; }
    if (!name) continue;
    const idsDiffer = !!player.id && !!s.robloxUserId && player.id !== s.robloxUserId;
    if (lc(s.robloxUsername) === name) out.push({ wantedId: s.wantedId, personId: s.personId, matchType: idsDiffer ? 'NAME_ID_MISMATCH' : 'NAME', identified: false });
    else if (s.aliases.some((a) => lc(a) === name)) out.push({ wantedId: s.wantedId, personId: s.personId, matchType: idsDiffer ? 'NAME_ID_MISMATCH' : 'ALIAS', identified: false });
  }
  return out;
}

export interface PresenceRow { id: string; playerKey: string; joinedAt: Date; lastSeenAt: Date }
/** Uhren von ER:LC und Backend laufen nicht exakt gleich: ein Join-Log-Eintrag zählt erst als neuer Beitritt, wenn er deutlich nach dem Sitzungsbeginn liegt. */
export const JOIN_LOG_TOLERANCE_MS = 60_000;
/** Schlüssel eines Spielers: Roblox-ID, sonst (ohne ID von der API) der Name. */
export const playerKey = (p: WantedMatchPlayer) => (p.id ? `id:${p.id}` : `name:${p.name.trim().toLowerCase()}`);

/**
 * Vergleich der aktuellen mit der vorherigen Spielerliste: wer ist neu (Beitritt), wer ist geblieben, wer ist weg.
 * `joins`: Beitritte laut Join-Logs (Schlüssel → letzter Beitritt in ms). Liegt ein Beitritt nach dem letzten Sehen,
 * war der Spieler zwischen zwei Abfragen kurz weg → neue Sitzung (der Beitritt, mit dem die Sitzung begann, zählt nicht).
 */
export function diffPresence(current: WantedMatchPlayer[], previous: PresenceRow[], joins: Map<string, number> = new Map()) {
  const prev = new Map(previous.map((p) => [p.playerKey, p]));
  const seen = new Set<string>();
  const joined: WantedMatchPlayer[] = [], stayed: { player: WantedMatchPlayer; row: PresenceRow }[] = [], rejoined: { player: WantedMatchPlayer; row: PresenceRow }[] = [];
  for (const p of current) {
    const k = playerKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    const row = prev.get(k);
    if (!row) joined.push(p);
    else if ((joins.get(k) ?? 0) > Math.max(row.lastSeenAt.getTime(), row.joinedAt.getTime() + JOIN_LOG_TOLERANCE_MS)) rejoined.push({ player: p, row });
    else stayed.push({ player: p, row });
  }
  const left = previous.filter((p) => !seen.has(p.playerKey));
  return { joined, stayed, rejoined, left };
}
