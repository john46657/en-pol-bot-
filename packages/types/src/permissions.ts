/**
 * NEXUS Permission-Modell (§79).
 *
 * Permissions sind Strings der Form `<bereich>.<aktion>`. Frontend-Permissions
 * sind nur UI – die echte Prüfung passiert serverseitig (§114).
 */
export const PERMISSIONS = [
  'applications.view',
  'applications.create',
  'applications.edit',
  'applications.delete',
  'applications.publish',
  'applications.manage',
  'applications.submissions.view',
  'applications.submissions.review',
  'applications.submissions.accept',
  'applications.submissions.deny',
  'applications.submissions.export',
  'applications.submissions.delete',
  'applications.notes.create',
  'applications.notes.edit',
  'applications.analytics.view',
  'applications.settings.manage',
  'applications.panels.manage',
  'applications.reviewers.assign',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionSet = ReadonlySet<Permission>;
