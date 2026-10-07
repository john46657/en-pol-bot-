/** Lesbare Namen für die Rechte-Matrix (Schlüssel bleiben sichtbar für Profis). */
export const MODULE_LABELS: Record<string, string> = {
  dashboard: '🏠 Dashboard & Bereiche', team: '👥 Team', dispatch: '📡 Leitstelle', incidents: '🚨 Einsätze', persons: '🧑 Personen', vehicles: '🚗 Fahrzeuge',
  reports: '📄 Berichte', dutyreports: '🗓️ Tages-/Wochenberichte', tickets: '🧾 Strafzettel', complaints: '⚖️ Beschwerden', investigations: '🔍 Ermittlungen', wanted: '🚩 Fahndungen', evidence: '💼 Beweismittel',
  personnel: '🪪 Personal', promotion: '🎖️ Beförderungen', transfer: '🔀 Versetzungen', training: '🎓 Ausbildungen', exam: '📝 Prüfungen', warning: '⚠️ Verwarnungen', awards: '🏅 Auszeichnungen', announcements: '📢 Interne Meldungen', polls: '🗳️ Abstimmungen', dienstnummer: '🪪 Dienstnummern', leave: '🏖️ Abmeldungen', applications: '📝 Bewerbungen', academy: '🎓 Akademie', sek: '🎯 SEK', qualifications: '🏅 Qualifikationen',
  ticket: '🎫 Support-Tickets', communication: '💬 Kommunikation', analytics: '📊 Statistiken', audit: '📋 Audit-Logs', studio: '🛠️ Studio',
  settings: '⚙️ Bot-Einstellungen', users: '👤 Benutzer', roles: '🛡️ Rollen & Rechte',
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
  'tickets.view': 'Bereich Tickets', 'applications.view': 'Bereich Bewerbungen', 'team.view': 'Bereich Team', 'offices.view': 'Bereich Büros',
  'voice.view': 'Bereich Sprachkanäle', 'logs.view': 'Bereich Logs', 'settings.view': 'Bereich Einstellungen',
};

export const permLabel = (key: string) => {
  const i = key.indexOf('.');
  const mod = key.slice(0, i), act = key.slice(i + 1);
  return `${MODULE_LABELS[mod]?.replace(/^\S+\s/, '') ?? mod}: ${ACTION_LABELS[act] ?? act}`;
};
