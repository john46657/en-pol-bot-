/**
 * Modul-Katalog für den Multi-Server-Betrieb: jedes Modul kann je Discord-Server an- oder ausgeschaltet werden.
 * Die Zuordnung Recht → Modul läuft über das Präfix des Rechts (`cad.view` → Modul `cad`). Systemmodule sind immer an.
 * Abhängigkeiten nur dort, wo es fachlich wirklich eine gibt (MDT funktioniert ohne CAD).
 */
export interface ModuleDef { key: string; name: string; description: string; system?: boolean; dependsOn?: string[]; permissionPrefixes: string[] }

export const MODULES = [
  { key: 'core', name: 'Grundsystem', description: 'Dashboard, Benutzer, Rollen & Rechte, Einstellungen, Audit, Server, Verbindungen', system: true, permissionPrefixes: ['dashboard', 'settings', 'users', 'roles', 'audit', 'studio', 'analytics', 'servers', 'modules', 'connections', 'sync'] },
  { key: 'cad', name: 'CAD-Leitstelle', description: 'Einsätze, Einheiten, Notrufe, Karte, Funk, Polizeifahrzeuge', permissionPrefixes: ['cad', 'fleet'] },
  { key: 'mdt', name: 'MDT', description: 'Personen, Fahrzeuge, Waffen, Haftbefehle, Bußgelder', permissionPrefixes: ['persons', 'vehicles', 'weapons', 'wanted', 'tickets'] },
  { key: 'dispatch', name: 'Dispatch', description: 'Einsatzverwaltung und Einheiten-Board', permissionPrefixes: ['dispatch', 'incidents'] },
  { key: 'reports', name: 'Berichte', description: 'Einsatzberichte, Tages-/Wochenberichte', permissionPrefixes: ['reports', 'dutyreports'] },
  { key: 'shift_logs', name: 'Shift Logs', description: 'Dienststatus, Schichten, Dienstzeiten, Wochenranglisten', permissionPrefixes: ['team'] },
  { key: 'investigations', name: 'Ermittlungen', description: 'Beschwerden, Ermittlungen, Beweismittel', permissionPrefixes: ['complaints', 'investigations', 'evidence'] },
  { key: 'personnel', name: 'Personal', description: 'Personalakte, Beförderungen, Ausbildung, Abmeldungen, Dienstnummern', permissionPrefixes: ['personnel', 'promotion', 'transfer', 'training', 'exam', 'warning', 'awards', 'dienstnummer', 'leave'] },
  { key: 'applications', name: 'Bewerbungen', description: 'Bewerbungen, Qualifikationen, Academy, Team-Chance', permissionPrefixes: ['applications', 'qualifications', 'academy', 'teamchance'] },
  { key: 'support', name: 'Support-Tickets', description: 'Ticket-System für Discord', permissionPrefixes: ['ticket'] },
  { key: 'sek', name: 'SEK', description: 'Spezialeinsatzkommando', permissionPrefixes: ['sek'] },
  { key: 'communication', name: 'Kommunikation', description: 'Nachrichten, Meldungen, Abstimmungen, Funk-Codes', permissionPrefixes: ['communication', 'announcements', 'polls', 'radio'] },
] as const satisfies readonly ModuleDef[];

export type ModuleKey = (typeof MODULES)[number]['key'];
export const MODULE_KEYS: readonly string[] = MODULES.map((m) => m.key);
export const moduleDef = (key: string): ModuleDef | undefined => (MODULES as readonly ModuleDef[]).find((m) => m.key === key);

/** Modul eines Rechts (`*`/unbekannt → core). */
export function moduleOfPermission(permission: string): string {
  const prefix = permission.split('.')[0] ?? '';
  return (MODULES as readonly ModuleDef[]).find((m) => m.permissionPrefixes.includes(prefix))?.key ?? 'core';
}

/** Abhängigkeitsprüfung: Fehlermeldung oder null. `enabled` = Zielzustand aller Module des Servers. */
export function moduleDependencyError(key: string, enabled: boolean, state: Record<string, boolean>): string | null {
  const def = moduleDef(key);
  if (!def) return 'Unbekanntes Modul.';
  if (def.system && !enabled) return `„${def.name}“ ist ein Systemmodul und kann nicht deaktiviert werden.`;
  if (enabled) {
    const missing = (def.dependsOn ?? []).filter((d) => state[d] === false);
    if (missing.length) return `„${def.name}“ braucht: ${missing.map((m) => moduleDef(m)?.name ?? m).join(', ')}.`;
  } else {
    const users = (MODULES as readonly ModuleDef[]).filter((m) => (m.dependsOn ?? []).includes(key) && state[m.key] !== false);
    if (users.length) return `„${def.name}“ wird noch gebraucht von: ${users.map((m) => m.name).join(', ')}.`;
  }
  return null;
}

/** Arten serverübergreifend freigebbarer Daten. `source` = woher die Ereignisse kommen (null = noch keine Quelle angebunden). */
export const SYNC_DATA_TYPES = [
  { key: 'reports', module: 'reports', label: 'Berichte (eingereicht/freigegeben)', source: 'reports' },
  { key: 'unit_status', module: 'shift_logs', label: 'Dienststatus der Beamten', source: 'duty' },
  { key: 'shift_statistics', module: 'shift_logs', label: 'Wochenstatistik (Shift Logs)', source: 'weekly-reset' },
  { key: 'team_overview', module: 'shift_logs', label: 'Teamübersicht (wer ist im Dienst)', source: 'duty' },
  { key: 'incidents', module: 'cad', label: 'Einsätze', source: null },
  { key: 'incident_status', module: 'cad', label: 'Einsatzstatus', source: null },
  { key: 'radio_messages', module: 'cad', label: 'Funksprüche', source: null },
] as const;
export type SyncDataType = (typeof SYNC_DATA_TYPES)[number]['key'];
export const SYNC_DIRECTIONS = ['A_TO_B', 'B_TO_A', 'BIDIRECTIONAL', 'NONE'] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

/** Fließen Daten von `from` nach `to` laut Freigabe (source→target mit Richtung)? */
export function policyAllowsFlow(p: { sourceServerId: string; targetServerId: string; direction: string; enabled: boolean }, from: string, to: string): boolean {
  if (!p.enabled || p.direction === 'NONE') return false;
  const forward = p.sourceServerId === from && p.targetServerId === to;
  const backward = p.sourceServerId === to && p.targetServerId === from;
  return (forward && (p.direction === 'A_TO_B' || p.direction === 'BIDIRECTIONAL')) || (backward && (p.direction === 'B_TO_A' || p.direction === 'BIDIRECTIONAL'));
}

/**
 * Discord-Slash-Befehl → Modul. Der Bot registriert je Server nur Befehle aktivierter Module (Komfort). Maßgeblich bleibt
 * die Prüfung im Backend bei JEDER Ausführung – ein sichtbarer Befehl umgeht nie die Rechte- und Modulprüfung.
 * Nicht aufgeführte Befehle gehören zum Grundsystem.
 */
export const BOT_COMMAND_MODULES: Record<string, string> = {
  cad: 'cad',
  bericht: 'reports', dienstbericht: 'reports',
  person: 'mdt', kennzeichen: 'mdt', fahndungen: 'mdt', fahndung: 'mdt',
  dienst: 'shift_logs', dienststunden: 'shift_logs', team: 'shift_logs', dienstpanel: 'shift_logs', teamliste: 'shift_logs',
  einheiten: 'dispatch', einheitstatus: 'dispatch', einsaetze: 'dispatch', einsatz: 'dispatch', einsatzinfo: 'dispatch', einsatzstatus: 'dispatch', einsatzzuweisen: 'dispatch',
  beschwerde: 'investigations', ermittlung: 'investigations', beweis: 'investigations',
  abmeldung: 'personnel', leave: 'personnel', ausbildung: 'personnel', verwarnen: 'personnel',
  teamchance: 'applications', bewerbung: 'applications', bewerbungspanel: 'applications', qualipanel: 'applications',
  support: 'support',
  funkcode: 'communication', funk: 'communication',
};
/** Befehle, die auf einem Server mit diesen abgeschalteten Modulen registriert werden. */
export const commandsForServer = <T extends { name: string }>(all: T[], disabledModules: readonly string[]): T[] =>
  all.filter((c) => !disabledModules.includes(BOT_COMMAND_MODULES[c.name] ?? 'core'));
