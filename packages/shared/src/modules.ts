/**
 * Modul-Katalog für den Multi-Server-Betrieb: jedes Modul kann je Discord-Server an- oder ausgeschaltet werden.
 * Die Zuordnung Recht → Modul läuft über das Präfix des Rechts (`cad.view` → Modul `cad`). Systemmodule sind immer an.
 * Abhängigkeiten nur dort, wo es fachlich wirklich eine gibt (MDT funktioniert ohne CAD).
 */
export interface ModuleDef { key: string; name: string; description: string; system?: boolean; dependsOn?: string[]; permissionPrefixes: string[] }

export const MODULES = [
  { key: 'core', name: 'Grundsystem', description: 'Dashboard, Benutzer, Rollen & Rechte, Einstellungen, Audit, Server', system: true, permissionPrefixes: ['dashboard', 'settings', 'users', 'roles', 'audit', 'studio', 'analytics', 'servers', 'modules'] },
  { key: 'cad', name: 'CAD-Leitstelle', description: 'Einsätze, Einheiten, Notrufe, Karte, Funk, Polizeifahrzeuge', permissionPrefixes: ['cad', 'fleet'] },
  { key: 'mdt', name: 'MDT', description: 'Personen, Fahrzeuge, Haftbefehle, Bußgelder', permissionPrefixes: ['persons', 'vehicles', 'wanted', 'tickets'] },
  { key: 'dispatch', name: 'Dispatch', description: 'Einsatzverwaltung und Einheiten-Board', permissionPrefixes: ['dispatch', 'incidents'] },
  { key: 'reports', name: 'Berichte', description: 'Einsatzberichte, Tages-/Wochenberichte', permissionPrefixes: ['reports', 'dutyreports'] },
  { key: 'shift_logs', name: 'Shift Logs', description: 'Dienststatus, Schichten, Dienstzeiten, Wochenranglisten', permissionPrefixes: ['team'] },
  { key: 'investigations', name: 'Beschwerden', description: 'Beschwerden', permissionPrefixes: ['complaints'] },
  { key: 'personnel', name: 'Personal', description: 'Personalakte, Beförderungen, Ausbildung, Abmeldungen, Dienstnummern', permissionPrefixes: ['personnel', 'promotion', 'transfer', 'training', 'exam', 'warning', 'awards', 'dienstnummer', 'leave'] },
  { key: 'applications', name: 'Bewerbungen', description: 'Bewerbungen, Qualifikationen, Academy, Team-Chance', permissionPrefixes: ['applications', 'qualifications', 'academy', 'teamchance'] },
  { key: 'support', name: 'Support-Tickets', description: 'Ticket-System für Discord', permissionPrefixes: ['ticket'] },
  { key: 'sek', name: 'SEK', description: 'Spezialeinsatzkommando', permissionPrefixes: ['sek'] },
  { key: 'message_builder', name: 'Discord Message Builder', description: 'Nachrichten und Embeds bauen, Vorlagen, Versand über den Bot, Versandhistorie', permissionPrefixes: ['messagebuilder'] },
  { key: 'communication', name: 'Kommunikation', description: 'Nachrichten, Funk-Codes, Funk-Whitelist', permissionPrefixes: ['communication', 'radio', 'radiowhitelist'] },
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

/**
 * Discord-Slash-Befehl → Modul. Der Bot registriert je Server nur Befehle aktivierter Module (Komfort). Maßgeblich bleibt
 * die Prüfung im Backend bei JEDER Ausführung – ein sichtbarer Befehl umgeht nie die Rechte- und Modulprüfung.
 * Nicht aufgeführte Befehle gehören zum Grundsystem.
 */
export const BOT_COMMAND_MODULES: Record<string, string> = {
  cad: 'cad',
  bericht: 'reports', dienstbericht: 'reports',
  person: 'mdt', kennzeichen: 'mdt', fahndungen: 'mdt', fahndung: 'mdt',
  shift: 'shift_logs', dienst: 'shift_logs', dienststunden: 'shift_logs', team: 'shift_logs', dienstpanel: 'shift_logs', teamliste: 'shift_logs',
  einheiten: 'dispatch', einheitstatus: 'dispatch', einsaetze: 'dispatch', einsatz: 'dispatch', einsatzinfo: 'dispatch', einsatzstatus: 'dispatch', einsatzzuweisen: 'dispatch',
  beschwerde: 'investigations',
  abmeldung: 'personnel', leave: 'personnel', ausbildung: 'personnel', verwarnen: 'personnel',
  teamchance: 'applications', bewerbung: 'applications', bewerbungspanel: 'applications', qualipanel: 'applications',
  support: 'support',
  funkcode: 'communication', funk: 'communication', funkantrag: 'communication', funkstatus: 'communication', funkfreigabe: 'communication',
};
/** Befehle, die auf einem Server mit diesen abgeschalteten Modulen registriert werden. */
export const commandsForServer = <T extends { name: string }>(all: T[], disabledModules: readonly string[]): T[] =>
  all.filter((c) => !disabledModules.includes(BOT_COMMAND_MODULES[c.name] ?? 'core'));
