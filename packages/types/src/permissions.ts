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
    module: 'applications',
    label: 'Bewerbungen',
    permissions: [
      ['applications.view', 'Bewerbungsformulare ansehen'],
      ['applications.create', 'Formulare erstellen'],
      ['applications.edit', 'Formulare bearbeiten'],
      ['applications.delete', 'Formulare löschen'],
      ['applications.publish', 'Formulare veröffentlichen'],
      ['applications.manage', 'Alles im Bereich Bewerbungen'],
      ['applications.submissions.view', 'Einreichungen ansehen'],
      ['applications.submissions.review', 'Einreichungen prüfen'],
      ['applications.submissions.accept', 'Einreichungen annehmen'],
      ['applications.submissions.deny', 'Einreichungen ablehnen'],
      ['applications.submissions.export', 'Einreichungen exportieren'],
      ['applications.submissions.delete', 'Einreichungen löschen'],
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
    module: 'training',
    label: 'Ausbildung',
    permissions: [
      ['training.view', 'Ausbildungen ansehen'],
      ['training.manage', 'Ausbildungen verwalten'],
    ],
  },
  {
    module: 'promotions',
    label: 'Beförderungen',
    permissions: [
      ['promotions.create', 'Beförderungen beantragen'],
      ['promotions.approve', 'Beförderungen genehmigen'],
      ['promotions.manage', 'Alles im Bereich Beförderungen'],
    ],
  },
  {
    module: 'shifts',
    label: 'Shifts',
    permissions: [
      ['shifts.start', 'Shift starten'],
      ['shifts.pause', 'Shift pausieren'],
      ['shifts.end', 'Shift beenden'],
      ['shifts.manage', 'Alles im Bereich Shifts'],
    ],
  },
  {
    module: 'dispatch',
    label: 'Leitstelle',
    permissions: [
      ['dispatch.view', 'Leitstelle ansehen'],
      ['dispatch.manage', 'Leitstelle verwalten'],
    ],
  },
  {
    module: 'sek',
    label: 'SEK',
    permissions: [
      ['sek.view', 'SEK-Bereich ansehen'],
      ['sek.manage', 'SEK-Bereich verwalten'],
    ],
  },
] as const;

type CatalogEntry = (typeof PERMISSION_CATALOG)[number]['permissions'][number];
export type Permission = CatalogEntry[0];

export const PERMISSIONS: readonly Permission[] = PERMISSION_CATALOG.flatMap(
  (m) => m.permissions.map((p) => p[0]) as Permission[],
);

export type PermissionSet = ReadonlySet<Permission>;
