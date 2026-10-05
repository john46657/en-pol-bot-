/**
 * NEXUS Permission-Modell (§79).
 *
 * Permissions sind Strings der Form `<bereich>.<aktion>`. Frontend-Permissions
 * sind nur UI – die echte Prüfung passiert serverseitig (§114).
 */
/**
 * Katalog aller Permissions, nach Modulen gruppiert. Einzige Quelle der Wahrheit:
 * API, Bot und Dashboard leiten Prüfungen und Oberfläche daraus ab.
 *
 * Regel: `<modul>.manage` schließt alle anderen Permissions desselben Moduls ein
 * (`applications.manage` ⇒ `applications.*`, aber nichts aus anderen Modulen).
 */
export const PERMISSION_CATALOG = [
  {
    module: 'system',
    label: 'System',
    permissions: [
      ['system.view', 'System ansehen', 'SYSTEM_VIEW'],
      ['system.manage', 'System verwalten', 'SYSTEM_MANAGE'],
    ],
  },
  {
    module: 'config',
    label: 'Serverkonfiguration',
    permissions: [
      ['config.view', 'Serverkonfiguration ansehen', 'SERVER_CONFIG_VIEW'],
      ['config.edit', 'Serverkonfiguration ändern', 'SERVER_CONFIG_EDIT'],
    ],
  },
  {
    module: 'roles',
    label: 'Rollenzuordnung',
    permissions: [
      ['roles.view', 'Rollenzuordnung ansehen', 'ROLE_MAPPING_VIEW'],
      ['roles.edit', 'Rollenzuordnung ändern', 'ROLE_MAPPING_EDIT'],
    ],
  },
  {
    module: 'permissions',
    label: 'Berechtigungen',
    permissions: [
      ['permissions.view', 'Berechtigungen ansehen', 'PERMISSION_VIEW'],
      ['permissions.edit', 'Berechtigungen ändern', 'PERMISSION_EDIT'],
    ],
  },
  {
    module: 'modules',
    label: 'Module',
    permissions: [
      ['modules.view', 'Module ansehen', 'MODULE_VIEW'],
      ['modules.manage', 'Module aktivieren/deaktivieren', 'MODULE_MANAGE'],
    ],
  },
  {
    module: 'audit',
    label: 'Audit-Log',
    permissions: [
      ['audit.view', 'Audit-Log ansehen', 'AUDIT_VIEW'],
      ['audit.export', 'Audit-Log exportieren', 'AUDIT_EXPORT'],
    ],
  },
  {
    module: 'backup',
    label: 'Backup',
    permissions: [
      ['backup.create', 'Backup erstellen', 'BACKUP_CREATE'],
      ['backup.restore', 'Backup wiederherstellen', 'BACKUP_RESTORE'],
    ],
  },
  {
    module: 'dashboard',
    label: 'Dashboard',
    permissions: [
      ['dashboard.view', 'Dashboard ansehen (nur lesen, ohne weitere Rechte)'],
      ['dashboard.roles', 'Seiten „Rollen & Rechte“, Profile und Benutzer ansehen (nur lesen)'],
      ['dashboard.applications', 'Bewerbungs-Seiten ansehen (nur lesen)'],
      ['dashboard.tickets', 'Ticket-Seite ansehen (nur lesen)'],
      ['dashboard.logs', 'Audit-Log ansehen (nur lesen)'],
      ['dashboard.radio', 'Funk-Seite ansehen (nur lesen)'],
      ['dashboard.offices', 'Büro-Seite ansehen (nur lesen)'],
      ['dashboard.moderation', 'Moderations-Seite ansehen (nur lesen)'],
      ['dashboard.manage', 'Dashboard konfigurieren', 'DASHBOARD_MANAGE'],
    ],
  },
  {
    module: 'moderation',
    label: 'Moderation',
    permissions: [
      ['moderation.view', 'Moderationsfälle ansehen'],
      ['moderation.warn', 'Mitglieder verwarnen'],
      ['moderation.timeout', 'Mitglieder stummschalten (Timeout)'],
      ['moderation.kick', 'Mitglieder vom Server entfernen (Kick)'],
      ['moderation.ban', 'Benutzer bannen'],
      ['moderation.revoke', 'Verwarnungen, Timeouts und Banns aufheben'],
      ['moderation.manage', 'Alles im Bereich Moderation'],
    ],
  },
  {
    module: 'messages',
    label: 'Automatische Nachrichten',
    permissions: [
      ['messages.view', 'Automatische Nachrichten ansehen'],
      ['messages.manage', 'Automatische Nachrichten anlegen, ändern, senden'],
    ],
  },
  {
    module: 'logs',
    label: 'Logs',
    permissions: [
      ['logs.view', 'Logs ansehen (Audit-Log, Weiterleitungen)'],
      ['logs.manage', 'Log-Weiterleitung in Discord-Kanäle konfigurieren'],
    ],
  },
  {
    module: 'bot',
    label: 'Bot',
    permissions: [['bot.settings', 'Bot-Einstellungen ansehen (nur lesen; ändern mit „Serverkonfiguration ändern“)']],
  },
  {
    module: 'office',
    label: 'Büro',
    permissions: [
      ['office.view', 'Büro-Warteraum ansehen (Status, Wartende)'],
      ['office.manage', 'Büro-Warteraum verwalten'],
    ],
  },
  {
    module: 'personnel',
    label: 'Personal',
    permissions: [
      ['personnel.view', 'Personalakten ansehen', 'PERSONNEL_VIEW'],
      ['personnel.create', 'Personalakten anlegen', 'PERSONNEL_CREATE'],
      ['personnel.edit', 'Personalakten bearbeiten', 'PERSONNEL_EDIT'],
      ['personnel.archive', 'Personalakten archivieren', 'PERSONNEL_ARCHIVE'],
      ['personnel.state.edit', 'Teamstatus ändern (Pause, außer Dienst, suspendiert)'],
      ['personnel.rank.edit', 'Dienstgrad in der Akte ändern'],
      ['personnel.team.edit', 'Team in der Akte ändern'],
      ['personnel.number.edit', 'Dienstnummer vergeben'],
      ['personnel.award.manage', 'Auszeichnungen verwalten'],
      ['personnel.discipline.view', 'Disziplin ansehen'],
      ['personnel.discipline.manage', 'Disziplinarmaßnahmen verwalten'],
      ['personnel.note.view', 'Notizen in der Akte ansehen'],
      ['personnel.note.create', 'Notizen in der Akte schreiben'],
      ['personnel.history.view', 'Verlauf der Akte ansehen'],
      ['personnel.structure.manage', 'Dienstgrade, Teams und Dienstnummern-Format verwalten'],
      ['personnel.manage', 'Alles im Bereich Personal'],
    ],
  },
  {
    module: 'applications',
    label: 'Bewerbungen',
    permissions: [
      ['applications.view', 'Bewerbungsformulare ansehen'],
      ['applications.create', 'Formulare erstellen'],
      ['applications.edit', 'Formulare bearbeiten'],
      ['applications.delete', 'Formulare löschen'],
      ['applications.publish', 'Formulare veröffentlichen'],
      ['applications.manage', 'Alles im Bereich Bewerbungen'],
      ['applications.submissions.view', 'Einreichungen ansehen', 'APPLICATION_VIEW'],
      ['applications.submissions.review', 'Einreichungen prüfen'],
      ['applications.submissions.hold', 'Einreichungen zurückstellen und fortsetzen'],
      ['applications.submissions.accept', 'Einreichungen annehmen', 'APPLICATION_ACCEPT'],
      ['applications.submissions.deny', 'Einreichungen ablehnen', 'APPLICATION_REJECT'],
      ['applications.submissions.accept_reason', 'Einreichungen mit eigenem Grund annehmen'],
      ['applications.submissions.deny_reason', 'Einreichungen mit eigenem Grund ablehnen'],
      ['applications.submissions.withdraw', 'Einreichungen zurückziehen', 'APPLICATION_WITHDRAW'],
      ['applications.submissions.reassign', 'Zuständigkeit ändern (Bewerbungen anderer übernehmen/zuweisen, trotz Zuweisung entscheiden)'],
      ['applications.submissions.reopen', 'Einreichungen wieder öffnen', 'APPLICATION_REOPEN'],
      ['applications.submissions.export', 'Einreichungen exportieren'],
      ['applications.submissions.delete', 'Einreichungen löschen'],
      ['applications.ratings.view', 'Interne Bewertungen ansehen (nur Team)'],
      ['applications.ratings.edit', 'Bewerbungen intern bewerten'],
      ['applications.notes.create', 'Notizen schreiben'],
      ['applications.notes.edit', 'Notizen bearbeiten'],
      ['applications.analytics.view', 'Statistiken ansehen'],
      ['applications.settings.manage', 'Bewerbungs-Einstellungen verwalten'],
      ['applications.panels.manage', 'Panels verwalten'],
      ['applications.reviewers.assign', 'Bearbeiter zuweisen'],
    ],
  },
  {
    module: 'panels',
    label: 'Panels',
    permissions: [
      ['panels.view', 'Panels ansehen'],
      ['panels.manage', 'Panels erstellen, bearbeiten und senden'],
    ],
  },
  {
    module: 'promotions',
    label: 'Beförderungen',
    permissions: [
      ['promotions.view', 'Beförderungen ansehen', 'PROMOTION_VIEW'],
      ['promotions.create', 'Beförderungen beantragen', 'PROMOTION_CREATE'],
      ['promotions.approve', 'Beförderungen genehmigen', 'PROMOTION_APPROVE'],
      ['promotions.reject', 'Beförderungen ablehnen', 'PROMOTION_REJECT'],
      ['promotions.manage', 'Alles im Bereich Beförderungen'],
    ],
  },
  {
    module: 'team',
    label: 'Teams',
    permissions: [
      ['team.view', 'Teams ansehen', 'TEAM_VIEW'],
      ['team.edit', 'Teams bearbeiten', 'TEAM_EDIT'],
      ['team.member.view', 'Teammitglieder ansehen', 'TEAM_MEMBER_VIEW'],
      ['team.member.manage', 'Teammitglieder verwalten', 'TEAM_MEMBER_MANAGE'],
      ['team.manage', 'Alles im Bereich Teams'],
    ],
  },
  {
    module: 'training',
    label: 'Ausbildung',
    permissions: [
      ['training.view', 'Ausbildungen ansehen', 'TRAINING_VIEW'],
      ['training.create', 'Ausbildungen erstellen', 'TRAINING_CREATE'],
      ['training.edit', 'Ausbildungen bearbeiten', 'TRAINING_EDIT'],
      ['training.session.manage', 'Ausbildungseinheiten durchführen', 'TRAINING_SESSION_MANAGE'],
      ['training.trainer.manage', 'Ausbilder zuweisen', 'TRAINER_MANAGE'],
      ['training.manage', 'Ausbildungen verwalten', 'TRAINING_MANAGE'],
    ],
  },
  {
    module: 'exam',
    label: 'Prüfungen',
    permissions: [
      ['exam.create', 'Prüfungen erstellen', 'EXAM_CREATE'],
      ['exam.edit', 'Prüfungen bearbeiten', 'EXAM_EDIT'],
      ['exam.manage', 'Prüfungen verwalten und bewerten', 'EXAM_MANAGE'],
    ],
  },
  {
    module: 'qualification',
    label: 'Qualifikationen',
    permissions: [
      ['qualification.view', 'Qualifikationen ansehen', 'QUALIFICATION_VIEW'],
      ['qualification.manage', 'Qualifikationen vergeben', 'QUALIFICATION_MANAGE'],
    ],
  },
  {
    module: 'report',
    label: 'Berichte',
    permissions: [
      ['report.view', 'Berichte ansehen', 'REPORT_VIEW'],
      ['report.manage', 'Berichte verwalten', 'REPORT_MANAGE'],
    ],
  },
  {
    module: 'design',
    label: 'Dashboard-Design',
    permissions: [
      ['design.view', 'Dashboard-Design ansehen', 'DESIGN_VIEW'],
      ['design.edit', 'Dashboard-Design bearbeiten', 'DESIGN_EDIT'],
    ],
  },
  {
    module: 'absence',
    label: 'Abwesenheiten',
    permissions: [
      ['absence.view', 'Abwesenheiten ansehen', 'ABSENCE_VIEW'],
      ['absence.manage', 'Abwesenheiten verwalten', 'ABSENCE_MANAGE'],
    ],
  },
  {
    module: 'shifts',
    label: 'Shifts',
    permissions: [
      ['shifts.view', 'Shifts ansehen', 'SHIFT_VIEW'],
      ['shifts.start', 'Shift starten'],
      ['shifts.pause', 'Shift pausieren'],
      ['shifts.end', 'Shift beenden'],
      ['shifts.manage', 'Shifts verwalten', 'SHIFT_MANAGE'],
    ],
  },
  {
    module: 'duty',
    label: 'Dienst & Streifen',
    permissions: [
      ['duty.view', 'Dienstübersicht ansehen (Einheiten, Besetzung, Verfügbarkeit)'],
      ['duty.unit.join', 'Streife bilden, beitreten und eigenen Status setzen'],
      ['duty.unit.manage', 'Einheiten verwalten (zuteilen, Status ändern, auflösen)'],
    ],
  },
  {
    module: 'operations',
    label: 'Einsätze',
    permissions: [
      ['operations.view', 'Einsätze ansehen'],
      ['operations.create', 'Einsätze anlegen (anfordern)'],
      ['operations.manage', 'Einsätze verwalten (Einheiten zuweisen, Status, Abschluss)'],
    ],
  },
  {
    module: 'danger',
    label: 'Gefahrenstatus',
    permissions: [
      ['danger.view', 'Gefahrenstatus ansehen'],
      ['danger.set', 'Gefahrenstufe setzen'],
      ['danger.manage', 'Gefahrenstufen konfigurieren (Name, Farbe, Rollen)'],
    ],
  },
  {
    module: 'wanted',
    label: 'Fahndungen',
    permissions: [
      ['wanted.view', 'Fahndungen ansehen und suchen'],
      ['wanted.create', 'Fahndungen erstellen'],
      ['wanted.edit', 'Fahndungen bearbeiten'],
      ['wanted.revoke', 'Fahndungen aufheben'],
    ],
  },
  {
    module: 'restrictions',
    label: 'Sperren',
    permissions: [
      ['restrictions.view', 'Sperren ansehen'],
      ['restrictions.create', 'Sperren verhängen'],
      ['restrictions.revoke', 'Sperren aufheben'],
    ],
  },
  {
    module: 'fleet',
    label: 'Fahrzeuge',
    permissions: [
      ['fleet.view', 'Fuhrpark ansehen'],
      ['fleet.report', 'Fahrzeugschäden melden'],
      ['fleet.manage', 'Fuhrpark verwalten (anlegen, zuweisen, Status, Reparatur, ausmustern)'],
    ],
  },
  {
    module: 'penalties',
    label: 'Strafen',
    permissions: [
      ['penalties.view', 'Strafen und Strafenregister ansehen'],
      ['penalties.issue', 'Strafen ausstellen'],
      ['penalties.revoke', 'Strafen aufheben'],
    ],
  },
  {
    module: 'tickets',
    label: 'Tickets',
    permissions: [
      ['tickets.create', 'Tickets eröffnen'],
      ['tickets.view', 'Alle Tickets und das Archiv ansehen'],
      ['tickets.handle', 'Tickets bearbeiten (übernehmen, Priorität, schließen)'],
      ['tickets.claim', 'Tickets übernehmen, freigeben und Status setzen'],
      ['tickets.priority.edit', 'Ticket-Priorität ändern'],
      ['tickets.members.manage', 'Benutzer zu Tickets hinzufügen/entfernen'],
      ['tickets.close', 'Tickets schließen'],
      ['tickets.transcript.view', 'Ticket-Transkripte ansehen'],
      ['tickets.transcript.delete', 'Ticket-Transkripte löschen'],
      ['tickets.reopen', 'Geschlossene Tickets wieder öffnen'],
      ['tickets.delete', 'Geschlossene Tickets endgültig löschen'],
      ['tickets.categories.manage', 'Ticket-Kategorien, Fragen und Bearbeiter-Rollen verwalten'],
      ['tickets.settings.manage', 'Ticket-Einstellungen und Panels verwalten (Limits, Ping, Embeds)'],
      ['tickets.manage', 'Ticket-System verwalten (Kategorien, Panels, jedes Ticket)'],
    ],
  },
  {
    module: 'radio',
    label: 'Funk',
    permissions: [
      ['radio.view', 'Funk-Whitelist und Funkkanäle ansehen'],
      ['radio.whitelist.manage', 'Funk-Whitelist verwalten (hinzufügen, ändern, entfernen)'],
      ['radio.channel.manage', 'Funkkanäle einrichten'],
    ],
  },
  {
    module: 'sek',
    label: 'SEK',
    permissions: [
      ['sek.view', 'SEK-Bereich ansehen', 'SEK_VIEW'],
      ['sek.member.manage', 'SEK-Mitglieder verwalten', 'SEK_MEMBER_MANAGE'],
      ['sek.training.view', 'SEK-Ausbildung ansehen', 'SEK_TRAINING_VIEW'],
      ['sek.training.manage', 'SEK-Ausbildung verwalten', 'SEK_TRAINING_MANAGE'],
      ['sek.qualification.view', 'SEK-Qualifikationen ansehen', 'SEK_QUALIFICATION_VIEW'],
      ['sek.qualification.manage', 'SEK-Qualifikationen verwalten', 'SEK_QUALIFICATION_MANAGE'],
      ['sek.application.view', 'SEK-Bewerbungen ansehen', 'SEK_APPLICATION_VIEW'],
      ['sek.manage', 'Alles im SEK-Bereich'],
    ],
  },
  {
    module: 'own',
    label: 'Eigene Daten',
    permissions: [
      ['own.profile.view', 'Eigenes Profil ansehen', 'OWN_PROFILE_VIEW'],
      ['own.application.view', 'Eigene Bewerbung ansehen', 'OWN_APPLICATION_VIEW'],
      ['own.training.view', 'Eigene Ausbildungen ansehen', 'OWN_TRAINING_VIEW'],
      ['own.report.create', 'Eigene Berichte erstellen', 'OWN_REPORT_CREATE'],
      ['own.shift.view', 'Eigene Dienstzeiten ansehen', 'OWN_SHIFT_VIEW'],
      ['own.absence.create', 'Abwesenheit beantragen', 'OWN_ABSENCE_CREATE'],
      ['own.notifications.view', 'Eigene Benachrichtigungen verwalten', 'OWN_NOTIFICATIONS_VIEW'],
    ],
  },
] as const;

type CatalogEntry = (typeof PERMISSION_CATALOG)[number]['permissions'][number];
export type Permission = CatalogEntry[0];

export const PERMISSIONS: readonly Permission[] = PERMISSION_CATALOG.flatMap(
  (m) => m.permissions.map((p) => p[0]) as Permission[],
);

export type PermissionSet = ReadonlySet<Permission>;

/**
 * Sammelrechte: Ein Recht, das einzelne feinere Rechte einschließt (zusätzlich zu `<modul>.manage`). So bleiben
 * bestehende Zuordnungen (`tickets.handle`, `tickets.view`) gültig, während sich Einzelrechte getrennt vergeben lassen.
 * Schlüssel = feines Recht, Wert = Rechte, die es einschließen. Sperren gelten nur für ihren exakten Schlüssel.
 */
export const PERMISSION_IMPLIED_BY: Readonly<Record<string, readonly string[]>> = {
  // bisher prüften Dashboard und Bot das Büro über Bewerbungs- bzw. Personalrechte
  // „mit Grund“ ist eine eigene Aktion; wer bisher annehmen/ablehnen durfte, darf es weiterhin auch mit Grund
  'applications.submissions.hold': ['applications.submissions.review'],
  'applications.submissions.accept_reason': ['applications.submissions.accept'],
  'applications.submissions.deny_reason': ['applications.submissions.deny'],
  'office.view': ['applications.view', 'personnel.view', 'dashboard.offices'],
  // Seiten-Rechte des Dashboards: nur Ansehen; Ändern braucht weiterhin das Modulrecht
  'tickets.view': ['dashboard.tickets'],
  'applications.view': ['dashboard.applications'],
  'applications.submissions.view': ['dashboard.applications'],
  'audit.view': ['dashboard.logs', 'logs.view', 'logs.manage'],
  'logs.view': ['dashboard.logs', 'audit.view'],
  'radio.view': ['dashboard.radio'],
  'moderation.view': ['dashboard.moderation'],
  'permissions.view': ['dashboard.roles'],
  'roles.view': ['dashboard.roles'],
  'config.view': ['bot.settings'],
  'tickets.claim': ['tickets.handle'],
  'tickets.priority.edit': ['tickets.handle'],
  'tickets.members.manage': ['tickets.handle'],
  'tickets.close': ['tickets.handle'],
  'tickets.transcript.view': ['tickets.view', 'tickets.handle', 'dashboard.tickets'],
};

/** Anzeigename (Beschriftung) eines Schlüssels; unbekannte Schlüssel liefern `undefined`. */
export function permissionLabel(key: string): string | undefined {
  for (const m of PERMISSION_CATALOG) {
    for (const p of m.permissions) if (p[0] === key) return p[1];
  }
  return undefined;
}

/** Alias aus der Spezifikation (z. B. `APPLICATION_ACCEPT`) → Schlüssel und zurück. */
export function permissionAlias(key: string): string | undefined {
  for (const m of PERMISSION_CATALOG) {
    for (const p of m.permissions as readonly (readonly [string, string, string?])[]) {
      if (p[0] === key) return p[2];
    }
  }
  return undefined;
}
export function permissionFromAlias(alias: string): Permission | undefined {
  for (const m of PERMISSION_CATALOG) {
    for (const p of m.permissions as readonly (readonly [string, string, string?])[]) {
      if (p[2] === alias) return p[0] as Permission;
    }
  }
  return undefined;
}

/** Geltungsbereich einer Zuordnung. SERVER = überall auf dem Server, TEAM = nur Daten des eigenen Teams (oder eines bestimmten Teams), RECORD = ein einzelner Datensatz. */
export type PermissionScope = 'SERVER' | 'TEAM' | 'RECORD';
export type PermissionEffect = 'ALLOW' | 'DENY';
export interface PermissionEntry {
  key: Permission;
  effect: PermissionEffect;
  scope: PermissionScope;
  /** Team- bzw. Datensatz-ID bei expliziter Einschränkung; leer = „eigenes Team“ (TEAM) bzw. n/a (SERVER). */
  scopeRef?: string;
}
