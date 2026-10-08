import { z } from 'zod';

/**
 * Logging (wie bei Xenon/Dyno): jede protokollierte Aktion im System kann in einen Discord-Kanal gemeldet werden –
 * je Kategorie ein Kanal, einzelne Typen mit eigenem Kanal oder ausgeschaltet. Im Dashboard steht alles im Audit-Log.
 */
export const LOG_CATEGORIES = [
  { key: 'einsaetze', label: 'Einsätze & Leitstelle', emoji: '🚨', modules: ['cad', 'dispatch', 'incidents', 'erlc', 'radio'] },
  { key: 'akten', label: 'Akten & Ermittlungen', emoji: '🗂️', modules: ['persons', 'vehicles', 'wanted', 'investigations', 'evidence', 'reports', 'tickets', 'complaints'] },
  { key: 'bewerbungen', label: 'Bewerbungen & Qualifikationen', emoji: '📋', modules: ['applications', 'qualifications'] },
  { key: 'personal', label: 'Personal & Ausbildung', emoji: '👮', modules: ['personnel', 'promotion', 'dienstnummer', 'training', 'exam', 'academy', 'sek'] },
  { key: 'dienst', label: 'Dienst, Abmeldungen & Berichte', emoji: '🕒', modules: ['team', 'dutyreports', 'leave'] },
  { key: 'kommunikation', label: 'Kommunikation & Discord', emoji: '💬', modules: ['announcements', 'polls', 'communication', 'discord'] },
  { key: 'rechte', label: 'Rechte, Konten & Anmeldung', emoji: '🔐', modules: ['permissions', 'users', 'auth'] },
  { key: 'einstellungen', label: 'Einstellungen & System', emoji: '⚙️', modules: ['settings', 'studio', 'teamchance', 'media', 'locks', 'export'] },
] as const;
export type LogCategoryKey = (typeof LOG_CATEGORIES)[number]['key'] | 'sonstiges';
export const logCategoryOf = (module: string): LogCategoryKey => (LOG_CATEGORIES.find((c) => (c.modules as readonly string[]).includes(module))?.key ?? 'sonstiges');

/** Bekannte Aktionen → Bereich (aus den Audit-Einträgen der API; weitere kommen aus dem Audit-Log dazu). */
export const LOG_TYPES: Record<string, string> = {
  'academy.config': 'academy',
  'academy.course.announce': 'academy',
  'academy.course.create': 'academy',
  'academy.enroll': 'academy',
  'academy.grade': 'academy',
  'announcement.delete': 'announcements',
  'application.accepted': 'applications',
  'application.rejected': 'applications',
  'application.submit': 'applications',
  'application.ticket': 'applications',
  'application.withdrawn': 'applications',
  'auth.discord.admin_granted': 'auth',
  'auth.logout': 'auth',
  'user.created.discord': 'auth',
  'cad.announcement': 'cad',
  'cad.incident.create': 'cad',
  'cad.incident.note': 'cad',
  'cad.incident.update': 'cad',
  'cad.link.delete': 'cad',
  'cad.member.delete': 'cad',
  'cad.radio': 'cad',
  'cad.unit.assign': 'cad',
  'cad.unit.clear': 'cad',
  'cad.unit.create': 'cad',
  'cad.unit.delete': 'cad',
  'cad.unit.status': 'cad',
  'cad.unit.update': 'cad',
  'complaint.create': 'complaints',
  'complaint.status': 'complaints',
  'dienstnummer.dm': 'dienstnummer',
  'dienstnummer.nickname': 'dienstnummer',
  'dienstnummer.pending': 'dienstnummer',
  'dienstnummer.range.delete': 'dienstnummer',
  'dienstnummer.settings': 'dienstnummer',
  'personnel.discord_roles': 'dienstnummer',
  'discord.bot_installed': 'discord',
  'discord.link': 'discord',
  'discord.link.code_created': 'discord',
  'discord.unlink': 'discord',
  'danger.config': 'dispatch',
  'danger.panel': 'dispatch',
  'danger.set': 'dispatch',
  'incident.assign': 'dispatch',
  'incident.status': 'dispatch',
  'unit.create': 'dispatch',
  'unit.members': 'dispatch',
  'unit.status': 'dispatch',
  'dutyreport.create': 'dutyreports',
  'dutyreport.delete': 'dutyreports',
  'dutyreport.edit': 'dutyreports',
  'dutyreport.return': 'dutyreports',
  'dutyreport.review': 'dutyreports',
  'dutyreport.template.delete': 'dutyreports',
  'dutyreport.unreview': 'dutyreports',
  'erlc.command': 'erlc',
  'erlc.server.create': 'erlc',
  'erlc.server.delete': 'erlc',
  'evidence.confirm': 'evidence',
  'evidence.create': 'evidence',
  'exam.delete': 'exam',
  'exam.grade': 'exam',
  'exam.start': 'exam',
  'export': 'export',
  'incident.attach': 'incidents',
  'incident.create': 'incidents',
  'incident.update': 'incidents',
  'investigation.create': 'investigations',
  'investigation.person.add': 'investigations',
  'investigation.status': 'investigations',
  'leave.config': 'leave',
  'leave.request': 'leave',
  'lock.takeover': 'locks',
  'media.upload': 'media',
  'auth.discord.access_revoked': 'permissions',
  'auth.discord.roles_synced': 'permissions',
  'role.create': 'permissions',
  'role.delete': 'permissions',
  'role.duplicate': 'permissions',
  'role.reorder': 'permissions',
  'user.override.add': 'permissions',
  'user.override.remove': 'permissions',
  'user.roles.set': 'permissions',
  'hr.config.update': 'personnel',
  'personnel.create': 'personnel',
  'personnel.create.application': 'personnel',
  'personnel.delete': 'personnel',
  'personnel.promote': 'personnel',
  'personnel.read': 'personnel',
  'personnel.update': 'personnel',
  'person.archive': 'persons',
  'person.create': 'persons',
  'person.merge': 'persons',
  'person.update': 'persons',
  'poll.delete': 'polls',
  'promotion.rank.create': 'promotion',
  'promotion.rank.delete': 'promotion',
  'promotion.rank.discord_roles': 'promotion',
  'promotion.rank.reorder': 'promotion',
  'promotion.requirement.check': 'promotion',
  'qualifications.application.accept': 'qualifications',
  'qualifications.application.reject': 'qualifications',
  'qualifications.application.submit': 'qualifications',
  'qualifications.application.withdraw': 'qualifications',
  'qualifications.config': 'qualifications',
  'qualifications.config.reset': 'qualifications',
  'radiocode.create': 'radio',
  'radiocode.defaults': 'radio',
  'radiocode.delete': 'radio',
  'radiocode.discord.config': 'radio',
  'radiocode.discord.send': 'radio',
  'radiocode.reorder': 'radio',
  'radiocode.update': 'radio',
  'report.create': 'reports',
  'report.edit': 'reports',
  'sek.member.add': 'sek',
  'sek.member.remove': 'sek',
  'sek.report.create': 'sek',
  'embed.delete': 'settings',
  'embed.send': 'settings',
  'formpanel.delete': 'settings',
  'formpanel.send': 'settings',
  'formpanel.submission.delete': 'settings',
  'legalcode.create': 'settings',
  'notification.system': 'settings',
  'retention.run': 'settings',
  'servers.links': 'settings',
  'servers.links.move': 'settings',
  'studio.config.changed': 'settings',
  'verification.config': 'settings',
  'verification.oauth': 'settings',
  'verification.panel': 'settings',
  'verification.removed': 'settings',
  'verification.verified': 'settings',
  'welcome.config': 'settings',
  'welcome.config.reset': 'settings',
  'studio.workflow.create': 'studio',
  'studio.workflow.delete': 'studio',
  'studio.workflow.update': 'studio',
  'duty.status': 'team',
  'duty.status.set_by_supervisor': 'team',
  'radio.add': 'team',
  'radio.remove': 'team',
  'shifts.config': 'team',
  'stafflist.delete': 'team',
  'stafflist.send': 'team',
  'ticket.create': 'tickets',
  'ticket.void': 'tickets',
  'voice_support.rooms': 'tickets',
  'training.delete': 'training',
  'training.progress': 'training',
  'user.create': 'users',
  'user.roblox.set': 'users',
  'vehicle.archive': 'vehicles',
  'vehicle.create': 'vehicles',
  'wanted.create': 'wanted',
};
/** Standardmäßig aus (würden den Kanal fluten). */
export const LOG_DEFAULT_OFF = new Set(['personnel.read', 'export', 'lock.takeover', 'promotion.requirement.check', 'auth.discord.roles_synced']);

const WORDS: Record<string, string> = {
  incident: 'Einsatz', unit: 'Einheit', radio: 'Funk', call: 'Notruf', member: 'Mitglied', link: 'Verbindung', map: 'Karte', zone: 'Zone', poi: 'POI', announcement: 'Ankündigung',
  application: 'Bewerbung', applications: 'Bewerbung', qualifications: 'Qualifikation', course: 'Kurs', person: 'Person', vehicle: 'Fahrzeug', wanted: 'Fahndung', investigation: 'Ermittlung',
  evidence: 'Beweismittel', report: 'Bericht', dutyreport: 'Tages-/Wochenbericht', ticket: 'Strafzettel', complaint: 'Beschwerde', personnel: 'Personalakte', promotion: 'Beförderung', rank: 'Rang',
  dienstnummer: 'Dienstnummer', range: 'Nummernkreis', training: 'Ausbildung', exam: 'Prüfung', academy: 'Akademie', sek: 'SEK', role: 'Rolle', user: 'Benutzer', roles: 'Rollen', override: 'Einzelrecht',
  auth: 'Anmeldung', discord: 'Discord', radiocode: 'Funk-Code', embed: 'Embed', formpanel: 'Formular-Panel', stafflist: 'Staff-Liste', welcome: 'Willkommen', verification: 'Verifizierung',
  studio: 'Studio', workflow: 'Workflow', settings: 'Einstellungen', servers: 'Server-Verbund', danger: 'Gefahrenstatus', erlc: 'ER:LC', server: 'Server', leave: 'Abmeldung', duty: 'Dienst', poll: 'Abstimmung',
  shifts: 'Schichten', template: 'Vorlage', config: 'Einstellungen', panel: 'Panel', legalcode: 'Tatbestand', media: 'Datei', notification: 'Systemhinweis', voice_support: 'Sprach-Support', hr: 'Personal',
  submission: 'Einsendung', requirement: 'Voraussetzung', note: 'Notiz', grade: 'Bewertung', enroll: 'Einschreibung', lock: 'Sperre', retention: 'Bereinigung',
};
const VERBS: Record<string, string> = {
  create: 'angelegt', created: 'angelegt', update: 'geändert', updated: 'geändert', edit: 'bearbeitet', delete: 'gelöscht', remove: 'entfernt', removed: 'entfernt', add: 'hinzugefügt', status: 'Status geändert',
  assign: 'zugewiesen', clear: 'gelöst', submit: 'eingereicht', accepted: 'angenommen', accept: 'angenommen', rejected: 'abgelehnt', reject: 'abgelehnt', withdrawn: 'zurückgezogen', withdraw: 'zurückgezogen',
  send: 'gesendet', announce: 'angekündigt', reorder: 'Reihenfolge geändert', duplicate: 'dupliziert', archive: 'archiviert', merge: 'zusammengeführt', promote: 'befördert', read: 'angesehen', start: 'gestartet',
  review: 'geprüft', return: 'zur Nachbesserung', unreview: 'Prüfung zurückgenommen', set: 'gesetzt', changed: 'geändert', reset: 'zurückgesetzt', confirm: 'bestätigt', void: 'storniert', upload: 'hochgeladen',
  request: 'beantragt', approve: 'genehmigt', deny: 'abgelehnt', logout: 'abgemeldet', verified: 'verifiziert', run: 'ausgeführt', move: 'verschoben', command: 'Befehl ausgeführt', grade: 'bewertet',
};
/** Lesbarer Name einer Aktion, z. B. „cad.incident.create“ → „Einsatz angelegt“. */
export function logTypeLabel(action: string): string {
  const parts = action.split('.');
  const last = parts[parts.length - 1]!;
  const verb = VERBS[last];
  const nouns = (verb ? parts.slice(0, -1) : parts).filter((p) => p !== 'cad' || parts.length === 1);
  const noun = [...new Set(nouns.map((p) => WORDS[p] ?? p))].slice(-2).join(' ');
  return verb ? `${noun} ${verb}` : noun || action;
}

const sf = z.string().regex(/^\d{15,25}$/, 'Discord-Kanal-ID');
export const loggingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Kanal je Kategorie */
  categories: z.record(z.string().max(32), sf).default({}),
  /** Abweichung je Typ: eigener Kanal oder 'off' (aus); fehlt = Kanal der Kategorie */
  types: z.record(z.string().max(80), z.union([sf, z.literal('off'), z.literal('on')])).default({}),
});
export type LoggingConfig = z.infer<typeof loggingConfigSchema>;

/** Kanal für eine Aktion (oder null = nicht melden). */
export function logChannelFor(cfg: LoggingConfig, module: string, action: string): string | null {
  if (!cfg.enabled) return null;
  const t = cfg.types[action];
  if (t === 'off') return null;
  if (t && t !== 'on') return t;
  if (!t && LOG_DEFAULT_OFF.has(action)) return null;
  return cfg.categories[logCategoryOf(module)] ?? null;
}
