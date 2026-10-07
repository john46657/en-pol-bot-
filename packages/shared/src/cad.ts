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

export const CAD_EVENTS = ['incident.created', 'incident.status', 'incident.assigned', 'incident.closed', 'call.received', 'announcement', 'radio'] as const;
export type CadEvent = (typeof CAD_EVENTS)[number];
export const CAD_EVENT_LABELS: Record<CadEvent, string> = {
  'incident.created': 'Neuer Einsatz', 'incident.status': 'Einsatzstatus geändert', 'incident.assigned': 'Einheit zugewiesen',
  'incident.closed': 'Einsatz abgeschlossen', 'call.received': 'Notruf eingegangen', announcement: 'Wichtige Leitstellenmeldung', radio: 'Funkmeldung',
};

/** Datenarten, die eine Server-Verbindung senden darf, und Aktionen, die der verbundene Server zurück ausführen darf. */
export const CAD_LINK_SEND_TYPES = ['incidents', 'incident_status', 'unit_requests', 'calls', 'announcements', 'radio'] as const;
export const CAD_LINK_ACTIONS = ['status_report', 'radio', 'view_incidents', 'dispatch'] as const;
export const CAD_LINK_LABELS: Record<string, string> = {
  incidents: 'Einsätze senden', incident_status: 'Einsatzstatus senden', unit_requests: 'Einheiten anfordern', calls: 'Notrufe senden', announcements: 'Leitstellenmeldungen senden', radio: 'Funkmeldungen senden',
  status_report: 'Status zurückmelden', view_incidents: 'Einsatzstatus sehen', dispatch: 'Notrufe/Einsätze bearbeiten (Übernehmen, Einsatz erstellen, Einheit zuweisen)',
};
/** Welche Datenart ein CAD-Ereignis bei verbundenen Servern ist. */
export const CAD_EVENT_SEND_TYPE: Record<CadEvent, (typeof CAD_LINK_SEND_TYPES)[number]> = {
  'incident.created': 'incidents', 'incident.status': 'incident_status', 'incident.assigned': 'unit_requests', 'incident.closed': 'incident_status',
  'call.received': 'calls', announcement: 'announcements', radio: 'radio',
};

export const CAD_WIDGETS = ['activeIncidents', 'availableUnits', 'erlcPlayers', 'erlcQueue', 'activeCalls', 'staffOnline', 'erlcStatus', 'map', 'units', 'radio', 'persons', 'vehicles', 'dutyActivity'] as const;
export const CAD_WIDGET_LABELS: Record<string, string> = {
  activeIncidents: 'Aktive Einsätze', availableUnits: 'Verfügbare Einheiten', erlcPlayers: 'ER:LC-Spieler', erlcQueue: 'Warteschlange', activeCalls: 'Aktive Notrufe',
  staffOnline: 'Server-Team online', erlcStatus: 'ER:LC-Status', map: 'Einsatzkarte', units: 'Einheiten', radio: 'Letzte Funkmeldungen', persons: 'Personen', vehicles: 'Fahrzeuge', dutyActivity: 'Aktivität im Dienst',
};

/** Offizielle ER:LC-Kartenbilder sind 5355 × 5355 px, Spielkoordinate (0,0) liegt in der Mitte. */
export const ERLC_MAP_SIZE = 5355;

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
    { key: 'vehicles', label: 'Fahrzeuge', builtin: true, enabledByDefault: false },
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
    { key: 'vehicle', label: 'Fahrzeug', emoji: '🚗', color: '#a855f7' },
    { key: 'staff', label: 'Staff', emoji: '👮', color: '#f59e0b' },
    { key: 'player', label: 'Spieler', emoji: '•', color: '#94a3b8' },
    { key: 'poi', label: 'POI', emoji: '📍', color: '#10b981' },
  ],
  map: { imageUrl: null, width: ERLC_MAP_SIZE, height: ERLC_MAP_SIZE, originX: ERLC_MAP_SIZE / 2, originY: ERLC_MAP_SIZE / 2, scale: 1 },
  routes: [],
  memberFields: [],
  widgets: ['activeIncidents', 'availableUnits', 'activeCalls', 'dutyActivity', 'erlcStatus', 'erlcPlayers', 'erlcQueue', 'staffOnline', 'map', 'radio'],
};

/** Spielkoordinate (ER:LC: X nach rechts, Z nach unten, Ursprung Mitte) → Pixel im Kartenbild. */
export const gameToPixel = (m: CadMapConfig, x: number, z: number) => ({ px: m.originX + x * m.scale, py: m.originY + z * m.scale });
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
