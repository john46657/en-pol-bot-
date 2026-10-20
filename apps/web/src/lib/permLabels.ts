import { PERMISSION_CATALOG } from '@enrp/shared';

/** Bereiche, die im Rollen-/Rechte-Editor nicht angeboten werden (werden auf diesem Server nicht genutzt). */
export const HIDDEN_PERMISSION_MODULES: readonly string[] = ['investigations', 'evidence', 'weapons', 'connections'];
/** Rechte-Katalog für Editoren (Rollen, Matrix, Benutzer-Ausnahmen) – ohne ausgeblendete Bereiche. */
export const EDITOR_CATALOG = Object.fromEntries(Object.entries(PERMISSION_CATALOG).filter(([m]) => !HIDDEN_PERMISSION_MODULES.includes(m))) as Record<string, readonly string[]>;

/** Lesbare Namen für die Rechte-Matrix (Schlüssel bleiben sichtbar für Profis). */
export const MODULE_LABELS: Record<string, string> = {
  dashboard: '🏠 Dashboard & Bereiche', team: '👥 Team', dispatch: '📡 Leitstelle', cad: '🗺️ CAD-Leitstelle', incidents: '🚨 Einsätze', persons: '🧑 Personen', vehicles: '🚗 Fahrzeuge',
  reports: '📄 Berichte', dutyreports: '🗓️ Tages-/Wochenberichte', tickets: '🧾 Strafzettel', complaints: '⚖️ Beschwerden', investigations: '🔍 Ermittlungen', wanted: '🚩 Fahndungen', evidence: '💼 Beweismittel',
  personnel: '🪪 Personal', promotion: '🎖️ Beförderungen', transfer: '🔀 Versetzungen', training: '🎓 Ausbildungen', exam: '📝 Prüfungen', warning: '⚠️ Verwarnungen', awards: '🏅 Auszeichnungen', dienstnummer: '🪪 Dienstnummern', leave: '🏖️ Abmeldungen', applications: '📝 Bewerbungen', academy: '🎓 Akademie', sek: '🎯 SEK', qualifications: '🏅 Qualifikationen',
  ticket: '🎫 Support-Tickets', communication: '💬 Kommunikation', analytics: '📊 Statistiken', audit: '📋 Audit-Logs', studio: '🛠️ Studio',
  settings: '⚙️ Bot-Einstellungen', users: '👤 Benutzer', roles: '🛡️ Rollen & Rechte',
  fleet: '🚓 Polizeifahrzeuge', weapons: '🔫 Waffenregister', radio: '📻 Funk-Codes', teamchance: '📣 Team-Chance', servers: '🖥️ Server', modules: '🧩 Module',
  messagebuilder: '✉️ Message Builder', connections: '🔗 Serververbindungen', sync: '🔄 Synchronisierung',
  radiowhitelist: '🎙️ Funk-Whitelist',
};

export const ACTION_LABELS: Record<string, string> = {
  view_all: 'alle ansehen', edit_all: 'alle bearbeiten', view_sensitive: 'geschützte Daten sehen', execute: 'durchführen', manage_ranks: 'Ränge verwalten',
  manage_requirements: 'Voraussetzungen verwalten', view_history: 'Historie sehen', manage_settings: 'Einstellungen verwalten', grade: 'bewerten', block: 'sperren',
  history: 'Historie', manage_ranges: 'Nummernkreise verwalten', auto_assign_dienstnummer: 'Dienstnummer automatisch vergeben',
  view: 'ansehen', create: 'erstellen', edit: 'bearbeiten', delete: 'löschen', manage: 'verwalten', customize: 'anpassen', close: 'schließen', reopen: 'wieder öffnen',
  claim: 'übernehmen', add_user: 'Benutzer hinzufügen', remove_user: 'Benutzer entfernen', change_status: 'Status ändern', change_priority: 'Priorität ändern',
  change_category: 'Kategorie ändern', rename: 'umbenennen', move: 'verschieben', lock: 'sperren', escalate: 'eskalieren', transcript: 'Transkript ansehen',
  transcript_delete: 'Transkript löschen', internal_notes: 'interne Notizen', rate: 'bewerten', settings: 'Einstellungen', review: 'prüfen', decide: 'entscheiden',
  assign: 'zuweisen', archive: 'archivieren', merge: 'zusammenführen', submit: 'einreichen', approve: 'genehmigen', reject: 'ablehnen', void: 'stornieren',
  investigate: 'ermitteln', resolve: 'abschließen', activate: 'aktivieren', clear: 'aufheben', transfer: 'übergeben', release: 'freigeben', promote: 'befördern',
  discipline: 'Disziplinarmaßnahmen', request: 'beantragen', report: 'melden', send: 'senden', moderate: 'moderieren', export: 'exportieren',
  handover: 'Schichtübergabe erstellen/bestätigen', view_stats: 'Statistik ansehen',
  'tickets.view': 'Bereich Tickets', 'applications.view': 'Bereich Bewerbungen', 'team.view': 'Bereich Team', 'offices.view': 'Bereich Büros',
  'voice.view': 'Bereich Sprachkanäle', 'logs.view': 'Bereich Logs', 'settings.view': 'Bereich Einstellungen',
  'radio.view': 'Bereich Funk-Codes', 'teamchance.view': 'Bereich Team-Chance', 'cad.view': 'Bereich CAD-Leitstelle',
  create_incident: 'Einsätze anlegen', edit_incident: 'Einsätze bearbeiten', close_incident: 'Einsätze schließen', assign_unit: 'Einheiten zuweisen', manage_units: 'Einheiten verwalten',
  view_persons: 'Personen abfragen', view_vehicles: 'Fahrzeuge abfragen', manage_map: 'Karte verwalten', view_erlc: 'ER:LC live ansehen', manage_erlc: 'ER:LC verwalten',
  erlc_command: 'ER:LC-Befehle senden', erlc_command_critical: 'kritische ER:LC-Befehle', manage_cross_server: 'Cross-Server verwalten', view_logs: 'Protokolle ansehen', radio: 'Funk-Chronik',
  view_details: 'Details ansehen', manage_catalog: 'Katalog verwalten', templates_create: 'Vorlagen erstellen', templates_edit: 'Vorlagen bearbeiten', templates_delete: 'Vorlagen löschen',
  channels: 'Kanäle wählen', webhooks: 'Webhooks verwalten', retry: 'erneut versuchen',
  grant: 'freischalten/verlängern', suspend: 'sperren/entsperren', remove: 'entziehen/entfernen', requests: 'Anträge bearbeiten', roles: 'Rollen(-regeln) bearbeiten',
  integration: 'Integration/Zugangsdaten', logs: 'Änderungsprotokoll ansehen',
};

export const permLabel = (key: string) => {
  const i = key.indexOf('.');
  const mod = key.slice(0, i), act = key.slice(i + 1);
  return `${MODULE_LABELS[mod]?.replace(/^\S+\s/, '') ?? mod}: ${ACTION_LABELS[act] ?? act}`;
};
