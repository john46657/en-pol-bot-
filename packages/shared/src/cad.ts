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

/**
 * Postleitzahlen (Postals) der offiziellen ER:LC-Karte → Spielkoordinate der Beschriftung (X, Z), ausgelesen aus
 * `fall_postals.png` (api.erlc.gg/maps, 5355 px, Ursprung Bildmitte, Maßstab 1). „319“ steht zweimal auf der Karte – hier die erste.
 */
export const ERLC_POSTALS: Record<string, [number, number]> = {
  '200': [-1498, 1635], '201': [-1170, 1666], '202': [-819, 1582], '203': [-1443, 1477], '204': [-1181, 1477], '205': [-837, 1396], '206': [-1249, 1343], '207': [-1106, 1343], '208': [-979, 1343], '209': [-1410, 1218], '210': [-1182, 1218], '211': [-980, 1218], '212': [-803, 1218], '213': [-1411, 1045], '214': [-1249, 1045], '215': [-1106, 1045], '216': [-978, 1045], '217': [-828, 1045], '218': [-568, 984], '219': [-1110, 925], '220': [-978, 925], '221': [-1411, 876], '222': [-1248, 924], '223': [-1102, 790], '224': [-978, 790], '225': [-772, 790], '226': [-532, 790], '227': [-1558, 738], '228': [-1404, 712], '229': [-1268, 766], '230': [-1048, 652], '231': [-827, 652],
  '300': [-214, 1342], '301': [10, 1380], '302': [435, 1343], '303': [856, 1257], '304': [-46, 1205], '305': [100, 1205], '306': [-46, 1010], '307': [120, 1064], '308': [671, 1064], '309': [119, 966], '310': [260, 966], '311': [404, 962], '312': [515, 979], '313': [649, 963], '314': [892, 959], '315': [-2, 824], '316': [186, 823], '317': [364, 824], '319': [514, 780], '320': [858, 817], '321': [26, 626], '322': [366, 640], '323': [514, 664], '324': [661, 664], '325': [858, 632], '326': [376, 488], '327': [607, 488],
  '400': [-1510, 476], '401': [-597, 532], '402': [-1713, 268], '403': [-1068, 399], '404': [-834, 399], '405': [-1392, 233], '406': [-1164, 233], '407': [-964, 233], '408': [-1421, 6], '409': [-1164, 62], '410': [-964, 62], '411': [-794, 62],
  '500': [-284, 50], '501': [296, 245], '502': [773, 186], '503': [630, -40], '504': [795, -464],
  '600': [-1502, -200], '601': [-841, -364], '602': [-1670, -609], '603': [-1111, -784], '604': [-1334, -946], '605': [-1500, -1111], '606': [-1795, -1294], '607': [-1602, -1294],
  '700': [196, -444], '701': [46, -612], '702': [260, -612], '703': [438, -652], '704': [145, -882], '705': [590, -896],
  '800': [-1588, -1510], '801': [-1391, -1458], '802': [-1216, -1552], '803': [-1674, -1752], '804': [-1492, -1674], '805': [-1236, -1684], '806': [-1438, -1794], '807': [-1164, -1802], '808': [-1339, -1926], '809': [-1084, -1950],
  '900': [-878, -1111], '901': [-364, -898], '902': [-444, -1145], '903': [-688, -1350], '904': [-844, -1636], '905': [-458, -1586], '906': [-734, -2062], '907': [-681, -2326], '908': [-395, -2338], '909': [-139, -2278],
  '1000': [3, -1528], '1001': [470, -1325], '1002': [896, -1287], '1003': [738, -1425], '1004': [878, -1424], '1005': [534, -1583], '1006': [738, -1558], '1007': [878, -1560], '1008': [738, -1694], '1009': [894, -1688], '1010': [807, -1940], '1011': [533, -2096],
  '1100': [1320, -1059], '1101': [1530, -1116], '1102': [1320, -1245], '1103': [1466, -1282], '1104': [1634, -1245], '1105': [1320, -1452], '1106': [1466, -1452], '1107': [1570, -1448], '1108': [1548, -1664], '1109': [1255, -1738],
  '1200': [1290, 958], '1201': [1482, 957], '1202': [1840, 821], '1203': [1152, 590], '1204': [1890, 605], '1205': [1344, 319], '1206': [1551, 143], '1207': [1850, 143], '1208': [983, -88], '1209': [1515, -374], '1210': [1084, -505], '1211': [1136, -788], '1212': [1407, -606], '1213': [1700, -671],
};
/**
 * Position aus einer Ortsangabe mit Postleitzahl: „PLZ 321“, „Postal 321“, „P-321“ oder eine alleinstehende bekannte PLZ („321 Main Street“).
 * Unbekannte Nummern ergeben keine Position (lieber keine als eine geratene).
 */
export function postalPosition(text: string | null | undefined): { postal: string; x: number; z: number } | null {
  if (!text) return null;
  const tagged = /\b(?:plz|postal(?:\s*code)?|p)\s*[-:#.]?\s*(\d{3,4})\b/i.exec(text)?.[1];
  const postal = tagged && ERLC_POSTALS[tagged] ? tagged : (text.match(/(?<![\d.,])\d{3,4}(?![\d.,])/g) ?? []).find((n) => ERLC_POSTALS[n]);
  const p = postal ? ERLC_POSTALS[postal] : undefined;
  return postal && p ? { postal, x: p[0], z: p[1] } : null;
}

/** Live-Position eines Spielers mit der PLZ, die ER:LC dazu meldet: [X, Z, PLZ]. */
export type PostalSample = [number, number, string];
export interface PostalCalibration { scale: number; originX: number; originY: number; n: number; postals: number; match: number }
/** PLZ-Beschriftungen in Pixeln eines Kartenbilds dieser Größe (offizielle Karte: 5355 px, Ursprung Bildmitte). */
const postalLabels = (width: number, height: number) => Object.entries(ERLC_POSTALS).map(([k, [x, z]]) => ({ k, px: ((x + ERLC_MAP_SIZE / 2) * width) / ERLC_MAP_SIZE, py: ((z + ERLC_MAP_SIZE / 2) * height) / ERLC_MAP_SIZE }));
/** Anteil der Spieler-Positionen, deren nächste PLZ-Beschriftung auf der Karte die von ER:LC gemeldete PLZ ist (0–1). */
export function postalMatchRate(m: Pick<CadMapConfig, 'width' | 'height' | 'originX' | 'originY' | 'scale'>, samples: PostalSample[]) {
  const labels = postalLabels(m.width, m.height);
  const known = samples.filter((s) => ERLC_POSTALS[s[2]]);
  if (!known.length) return 0;
  const hits = known.filter(([x, z, k]) => {
    const px = m.originX + x * m.scale, py = m.originY + z * m.scale;
    let best = labels[0]!, d = Infinity;
    for (const l of labels) { const dd = (l.px - px) ** 2 + (l.py - py) ** 2; if (dd < d) { d = dd; best = l; } }
    return best.k === k;
  });
  return hits.length / known.length;
}
/**
 * Kalibrierung aus Live-Spielerdaten: Spieler-Position ↔ Beschriftung ihrer PLZ (kleinste Quadrate, ein Maßstab für beide Achsen,
 * Ausreißer werden einmal verworfen). Nur mit genug Daten (mind. 20 Positionen in 6 PLZ, über die Karte verteilt) – sonst `null`.
 */
export function fitPostalCalibration(samples: PostalSample[], width = ERLC_MAP_SIZE, height = ERLC_MAP_SIZE): PostalCalibration | null {
  const labels = new Map(postalLabels(width, height).map((l) => [l.k, l]));
  const fit = (pts: { x: number; z: number; lx: number; ly: number }[]) => {
    const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, mz = pts.reduce((a, p) => a + p.z, 0) / n;
    const mlx = pts.reduce((a, p) => a + p.lx, 0) / n, mly = pts.reduce((a, p) => a + p.ly, 0) / n;
    const den = pts.reduce((a, p) => a + (p.x - mx) ** 2 + (p.z - mz) ** 2, 0);
    if (!den) return null;
    const scale = pts.reduce((a, p) => a + (p.x - mx) * (p.lx - mlx) + (p.z - mz) * (p.ly - mly), 0) / den;
    return { scale, originX: mlx - scale * mx, originY: mly - scale * mz };
  };
  let pts = samples.flatMap(([x, z, k]) => { const l = labels.get(k); return l && Number.isFinite(x) && Number.isFinite(z) ? [{ x, z, lx: l.px, ly: l.py, k }] : []; });
  const enough = (p: typeof pts) => p.length >= 20 && new Set(p.map((q) => q.k)).size >= 6 && Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x)) >= 1000 && Math.max(...p.map((q) => q.z)) - Math.min(...p.map((q) => q.z)) >= 1000;
  if (!enough(pts)) return null;
  let f = fit(pts);
  if (!f) return null;
  // Ausreißer (z. B. veraltete PLZ an der Grenze zweier Gebiete): weiter als das Dreifache der mittleren Abweichung
  const err = (p: (typeof pts)[number], c: NonNullable<typeof f>) => Math.hypot(c.originX + p.x * c.scale - p.lx, c.originY + p.z * c.scale - p.ly);
  const med = [...pts.map((p) => err(p, f!))].sort((a, b) => a - b)[Math.floor(pts.length / 2)]!;
  const kept = pts.filter((p) => err(p, f!) <= Math.max(3 * med, 150));
  if (enough(kept)) { pts = kept; f = fit(pts) ?? f; }
  if (!(f.scale > 0)) return null;
  const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  const out = { scale: r(f.scale, 4), originX: r(f.originX), originY: r(f.originY) };
  return { ...out, n: pts.length, postals: new Set(pts.map((p) => p.k)).size, match: postalMatchRate({ width, height, ...out }, samples) };
}

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
export const WANTED_HIT_STATUSES = ['NEW', 'REVIEW_REQUIRED', 'ACKNOWLEDGED', 'CONFIRMED', 'REJECTED', 'ENDED'] as const;
export type WantedHitStatus = (typeof WANTED_HIT_STATUSES)[number];
export const WANTED_HIT_STATUS_LABELS: Record<WantedHitStatus, string> = {
  NEW: 'Neu', REVIEW_REQUIRED: 'Manuelle Prüfung erforderlich', ACKNOWLEDGED: 'Zur Kenntnis genommen', CONFIRMED: 'Manuell bestätigt', REJECTED: 'Verworfen (nicht die Person)',
  ENDED: 'Beendet (nicht mehr im Spiel gesucht)',
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
