/**
 * Module des Bots (an-/abschaltbar je Server) mit ihren Slash-Befehlen, API-Pfaden (`/guilds/:id/<pfad>`) und
 * Dashboard-Menüpunkten. Grundfunktionen (Status, Diagnose, Rechte, Design, Logs …) gehören zu keinem Modul und
 * lassen sich nicht abschalten. Einzelne Befehle können zusätzlich abgeschaltet werden.
 */
export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  commands: readonly string[];
  apiPrefixes: readonly string[];
  navKeys: readonly string[];
}

export const MODULES: readonly ModuleDef[] = [
  { key: 'applications', label: 'Bewerbungen (Team-Chance)', description: 'Bewerbungsarten, Panels, Einreichungen, Auswertung', commands: ['panel'], apiPrefixes: ['applications', 'submissions', 'panels', 'analytics'], navKeys: ['applications', 'submissions'] },
  { key: 'tickets', label: 'Tickets', description: 'Ticket-Panel, Kategorien, Transkripte', commands: ['ticket'], apiPrefixes: ['tickets'], navKeys: ['tickets'] },
  { key: 'moderation', label: 'Moderation', description: 'Verwarnen, Timeout, Kick, Bann', commands: ['mod'], apiPrefixes: ['moderation'], navKeys: ['moderation'] },
  { key: 'personnel', label: 'Personal', description: 'Personalakten, Dienstgrade, Teams', commands: ['akte', 'personal', 'team'], apiPrefixes: ['personnel', 'personnel-structure'], navKeys: ['personnel', 'personnel-structure', 'team'] },
  { key: 'training', label: 'Ausbildung & Qualifikationen', description: 'Ausbildungen, Prüfungen, Qualifikationen', commands: ['ausbildung', 'qualifikation'], apiPrefixes: ['training', 'qualifications'], navKeys: ['training', 'qualifications'] },
  { key: 'promotions', label: 'Beförderungen', description: 'Beförderungsanträge und -regeln', commands: ['befoerderung'], apiPrefixes: ['promotions'], navKeys: ['promotions'] },
  { key: 'shifts', label: 'Schichten & Streifen', description: 'Dienstzeiten, Streifen, Einheiten', commands: ['schicht', 'streife'], apiPrefixes: ['shifts', 'duty'], navKeys: ['shifts', 'duty'] },
  { key: 'radio', label: 'Funk', description: 'Funk-Whitelist und Funkkanäle', commands: ['funk'], apiPrefixes: ['radio'], navKeys: ['radio'] },
  { key: 'office', label: 'Büro', description: 'Büro-Warteraum', commands: ['buero'], apiPrefixes: ['office'], navKeys: [] },
  { key: 'operations', label: 'Einsätze', description: 'Einsatzverwaltung', commands: ['einsatz'], apiPrefixes: ['operations'], navKeys: ['operations'] },
  { key: 'wanted', label: 'Fahndungen', description: 'Fahndungen mit Ablauf', commands: ['fahndung'], apiPrefixes: ['wanted'], navKeys: ['wanted'] },
  { key: 'danger', label: 'Gefahrenstatus', description: 'Gefahrenstufen', commands: ['gefahr'], apiPrefixes: ['danger'], navKeys: ['danger'] },
  { key: 'fleet', label: 'Fuhrpark', description: 'Fahrzeuge und Schäden', commands: ['fahrzeug'], apiPrefixes: ['fleet'], navKeys: ['fleet'] },
  { key: 'penalties', label: 'Strafen', description: 'Strafkatalog und Strafen', commands: ['strafe'], apiPrefixes: ['penalties'], navKeys: ['penalties'] },
  { key: 'restrictions', label: 'Sperren', description: 'Bewerbungs-, Ticket-, Fraktions- und Funksperren', commands: ['sperre'], apiPrefixes: ['restrictions'], navKeys: ['restrictions'] },
  { key: 'absences', label: 'Abmeldungen', description: 'Abwesenheiten', commands: ['abmeldung'], apiPrefixes: ['absences'], navKeys: ['absences'] },
  { key: 'reports', label: 'Berichte', description: 'Tages- und Wochenberichte', commands: ['bericht'], apiPrefixes: ['reports'], navKeys: ['reports'] },
  { key: 'sek', label: 'SEK', description: 'Spezialeinheit', commands: ['sek'], apiPrefixes: ['sek'], navKeys: ['sek'] },
];

/** Befehle, die immer verfügbar sind (Status, Diagnose, Server-Infos). */
export const CORE_COMMANDS: readonly string[] = ['nexus', 'server', 'health', 'diagnose'];

export interface ModuleState {
  /** Abgeschaltete Module (Schlüssel). */
  disabled: string[];
  /** Einzeln abgeschaltete Befehle (Name ohne „/“). */
  disabledCommands: string[];
}
export const EMPTY_STATE: ModuleState = { disabled: [], disabledCommands: [] };

const KEYS = new Set(MODULES.map((m) => m.key));
const ALL_COMMANDS = new Set(MODULES.flatMap((m) => m.commands));

/** Liest den gespeicherten Zustand tolerant (Unbekanntes und Grundbefehle werden ignoriert). */
export function normalizeState(raw: unknown): ModuleState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { disabled?: unknown; disabledCommands?: unknown };
  const list = (v: unknown, ok: Set<string>) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ok.has(x)))] : []);
  return { disabled: list(r.disabled, KEYS), disabledCommands: list(r.disabledCommands, ALL_COMMANDS) };
}

export const moduleOfCommand = (name: string): ModuleDef | undefined => MODULES.find((m) => m.commands.includes(name));
export const moduleOfApiSegment = (segment: string): ModuleDef | undefined => MODULES.find((m) => m.apiPrefixes.includes(segment));
export const moduleOfNav = (key: string): ModuleDef | undefined => MODULES.find((m) => m.navKeys.includes(key));
export const moduleByKey = (key: string): ModuleDef | undefined => MODULES.find((m) => m.key === key);

export const isModuleEnabled = (s: ModuleState, key: string): boolean => !s.disabled.includes(key);

/** Ist der Befehl nutzbar? Grundbefehle immer; sonst weder sein Modul noch er selbst abgeschaltet. */
export function commandBlock(s: ModuleState, name: string): { blocked: false } | { blocked: true; message: string } {
  if (CORE_COMMANDS.includes(name)) return { blocked: false };
  const m = moduleOfCommand(name);
  if (m && !isModuleEnabled(s, m.key)) return { blocked: true, message: `Das Modul „${m.label}“ ist auf diesem Server deaktiviert.` };
  if (s.disabledCommands.includes(name)) return { blocked: true, message: `Der Befehl /${name} ist auf diesem Server deaktiviert.` };
  return { blocked: false };
}
