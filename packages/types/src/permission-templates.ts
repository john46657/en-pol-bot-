import type { Permission, PermissionScope } from './permissions.js';

/**
 * Standardvorlagen für Berechtigungsprofile. Es sind **Daten, keine fest verdrahteten Rollen**:
 * Der Administrator wendet eine Vorlage an (es entsteht ein frei änderbares Profil), ordnet das Profil
 * einer beliebigen Discord-Rolle zu und kann alles anpassen. Rollennamen sind nur Vorschläge.
 * Die Leitstelle ist bewusst nicht Teil des Systems.
 */
export interface TemplateAllow {
  key: Permission;
  scope?: PermissionScope;
}
export interface PermissionTemplate {
  key: string;
  name: string;
  description: string;
  /** Übernimmt zuerst alle Rechte/Sperren der anderen Vorlage. */
  extends?: string;
  allow: (Permission | TemplateAllow)[];
  deny?: Permission[];
}

const T = (key: Permission): TemplateAllow => ({ key, scope: 'TEAM' });

export const PERMISSION_TEMPLATES: readonly PermissionTemplate[] = [
  {
    key: 'serverleitung',
    name: 'Serverleitung',
    description:
      'Höchster Verwaltungszugriff: System, Konfiguration, Rollen, Berechtigungen, Module, Audit, Backup, Dashboard.',
    allow: [
      'system.manage',
      'config.view',
      'config.edit',
      'roles.view',
      'roles.edit',
      'permissions.view',
      'permissions.edit',
      'modules.manage',
      'audit.view',
      'audit.export',
      'backup.create',
      'backup.restore',
      'dashboard.manage',
      'panels.manage',
    ],
  },
  {
    key: 'polizeileitung',
    name: 'Polizeileitung',
    description:
      'Verwaltet den Polizeibereich: Personal, Bewerbungen, Beförderungen, Teams, Ausbildung, Berichte.',
    allow: [
      'personnel.view',
      'personnel.edit',
      'personnel.archive',
      'personnel.rank.edit',
      'personnel.team.edit',
      'personnel.number.edit',
      'personnel.award.manage',
      'personnel.discipline.view',
      'personnel.discipline.manage',
      'personnel.note.view',
      'personnel.note.create',
      'personnel.history.view',
      'applications.submissions.view',
      'applications.submissions.accept',
      'applications.submissions.deny',
      'applications.submissions.withdraw',
      'applications.submissions.reopen',
      'promotions.view',
      'promotions.create',
      'promotions.approve',
      'promotions.reject',
      'team.view',
      'team.edit',
      'team.member.manage',
      'training.view',
      'training.manage',
      'report.view',
      'report.manage',
      'audit.view',
    ],
  },
  {
    key: 'stv-polizeileitung',
    name: 'Stellv. Polizeileitung',
    description:
      'Wie die Polizeileitung; kritische Rechte (Serverkonfiguration, Berechtigungen, Rollenzuordnung, Module) sind gesperrt.',
    extends: 'polizeileitung',
    allow: [],
    deny: ['config.edit', 'permissions.edit', 'roles.edit', 'modules.manage'],
  },
  {
    key: 'personalabteilung',
    name: 'Personalabteilung',
    description: 'Personal- und Bewerbungsprozesse; ändert keine Serverberechtigungen.',
    allow: [
      'applications.submissions.view',
      'applications.submissions.accept',
      'applications.submissions.deny',
      'applications.submissions.withdraw',
      'applications.submissions.reopen',
      'personnel.view',
      'personnel.create',
      'personnel.edit',
      'personnel.archive',
      'personnel.number.edit',
      'personnel.rank.edit',
      'personnel.team.edit',
      'personnel.note.view',
      'personnel.note.create',
      'personnel.history.view',
      'promotions.view',
      'promotions.create',
      'absence.view',
      'absence.manage',
    ],
    deny: ['config.edit', 'permissions.edit', 'roles.edit'],
  },
  {
    key: 'ausbildungsleitung',
    name: 'Ausbildungsleitung',
    description: 'Verwaltet Ausbildungen, Prüfungen, Qualifikationen und Ausbilder.',
    allow: [
      'training.view',
      'training.create',
      'training.edit',
      'training.manage',
      'exam.create',
      'exam.edit',
      'exam.manage',
      'qualification.view',
      'qualification.manage',
      'training.trainer.manage',
    ],
  },
  {
    key: 'ausbilder',
    name: 'Ausbilder',
    description:
      'Führt Ausbildungen durch. Mit Team-Einschränkung nur für zugewiesene Bereiche nutzbar.',
    allow: ['training.view', 'training.session.manage', 'exam.manage', 'qualification.view'],
    deny: [
      'personnel.archive',
      'promotions.approve',
      'applications.submissions.accept',
      'roles.edit',
      'config.edit',
    ],
  },
  {
    key: 'teamleitung',
    name: 'Teamleitung',
    description: 'Verwaltet das eigene Team (Rechte sind auf das eigene Team beschränkt).',
    allow: [
      T('team.view'),
      T('team.member.view'),
      T('team.member.manage'),
      T('personnel.view'),
      T('personnel.note.view'),
      T('personnel.note.create'),
      T('shifts.view'),
      T('shifts.manage'),
      T('report.view'),
      T('report.manage'),
      T('training.view'),
    ],
  },
  {
    key: 'stv-teamleitung',
    name: 'Stellv. Teamleitung',
    description:
      'Rechte der Teamleitung; Beförderungen und das Archivieren von Personalakten sind gesperrt.',
    extends: 'teamleitung',
    allow: [],
    deny: ['promotions.create', 'promotions.approve', 'personnel.archive'],
  },
  {
    key: 'sek-leitung',
    name: 'SEK-Leitung',
    description: 'Verwaltet den SEK-Bereich.',
    allow: [
      'sek.view',
      'sek.member.manage',
      'sek.training.manage',
      'sek.qualification.manage',
      'sek.application.view',
    ],
  },
  {
    key: 'sek-mitglied',
    name: 'SEK-Mitglied',
    description: 'Eingeschränkter Lesezugriff im SEK-Bereich.',
    allow: ['sek.view', 'sek.training.view', 'sek.qualification.view'],
  },
  {
    key: 'beamter',
    name: 'Beamter',
    description: 'Eigenes Profil, eigene Ausbildungen/Dienstzeiten/Berichte/Abwesenheiten.',
    allow: [
      'own.profile.view',
      'own.application.view',
      'own.training.view',
      'own.report.create',
      'own.shift.view',
      'shifts.start',
      'shifts.pause',
      'shifts.end',
      'own.absence.create',
      'own.notifications.view',
    ],
  },
  {
    key: 'polizeianwaerter',
    name: 'Polizeianwärter',
    description: 'Eingeschränkter Zugriff auf eigene Daten.',
    allow: [
      'own.profile.view',
      'own.training.view',
      'own.application.view',
      'own.report.create',
      'own.absence.create',
    ],
  },
];

/** Löst `extends` auf und liefert die vollständigen Einträge einer Vorlage. */
export function resolveTemplate(
  key: string,
  seen: ReadonlySet<string> = new Set(),
): { allow: TemplateAllow[]; deny: Permission[] } | undefined {
  const t = PERMISSION_TEMPLATES.find((x) => x.key === key);
  if (!t || seen.has(key)) return undefined;
  const base = t.extends ? resolveTemplate(t.extends, new Set([...seen, key])) : undefined;
  const norm = (a: Permission | TemplateAllow): TemplateAllow =>
    typeof a === 'string' ? { key: a } : a;
  const allow = new Map<string, TemplateAllow>();
  for (const a of [...(base?.allow ?? []), ...t.allow.map(norm)]) allow.set(a.key, a);
  const deny = [...new Set([...(base?.deny ?? []), ...(t.deny ?? [])])];
  return { allow: [...allow.values()], deny };
}
