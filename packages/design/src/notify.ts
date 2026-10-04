/** Benachrichtigungs-Arten des Dashboards (Glocke im Header). Quelle ist das Audit-Log; jede Art braucht ein Recht. */
export const NOTIFICATION_TYPES = {
  ticketNew: { label: 'Neues Ticket', icon: '🎫', permission: 'tickets.view' },
  applicationNew: {
    label: 'Neue Bewerbung',
    icon: '📋',
    permission: 'applications.submissions.view',
  },
  applicationAccepted: {
    label: 'Bewerbung angenommen',
    icon: '🟢',
    permission: 'applications.submissions.view',
  },
  applicationDenied: {
    label: 'Bewerbung abgelehnt',
    icon: '🔴',
    permission: 'applications.submissions.view',
  },
  ticketWaiting: { label: 'Ticket wartet', icon: '⚠️', permission: 'tickets.view' },
  ticketAssigned: { label: 'Ticket übernommen/zugewiesen', icon: '🙋', permission: 'tickets.view' },
  ticketClosed: { label: 'Ticket geschlossen', icon: '🔒', permission: 'tickets.view' },
  trainingNew: { label: 'Neue Ausbildung', icon: '🎓', permission: 'training.view' },
  trainingCompleted: { label: 'Ausbildung abgeschlossen', icon: '🏅', permission: 'training.view' },
  wantedNew: { label: 'Neue Fahndung', icon: '📣', permission: 'wanted.view' },
  restrictionCreated: { label: 'Sperre erstellt', icon: '⛔', permission: 'restrictions.view' },
  restrictionExpired: { label: 'Sperre abgelaufen', icon: '✅', permission: 'restrictions.view' },
  roleChange: { label: 'Rollenänderung', icon: '🔁', permission: 'personnel.view' },
  memberLeft: { label: 'Mitglied hat den Server verlassen', icon: '🚪', permission: 'personnel.view' },
  teamChange: { label: 'Teamänderung', icon: '👥', permission: 'personnel.view' },
  settingsChanged: { label: 'Systemeinstellungen geändert', icon: '⚙️', permission: 'config.view' },
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;
/** Zielseite im Dashboard für Arten ohne eigenes Ticket/Bewerbung als Bezug. */
export const NOTIFICATION_PATH: Partial<Record<NotificationType, string>> = {
  trainingNew: '/training',
  trainingCompleted: '/training',
  wantedNew: '/wanted',
  restrictionCreated: '/restrictions',
  restrictionExpired: '/restrictions',
  roleChange: '/personnel',
  memberLeft: '/personnel',
  ticketAssigned: '/tickets',
  ticketClosed: '/tickets',
  ticketWaiting: '/tickets',
};
/** Kurztext, wenn kein Ticket/Bewerbungs-Bezug vorhanden ist. */
export const NOTIFICATION_TEXT: Partial<Record<NotificationType, string>> = {
  trainingNew: 'Eine Ausbildung wurde angelegt.',
  trainingCompleted: 'Eine Ausbildung wurde abgeschlossen.',
  wantedNew: 'Es gibt eine neue Fahndung.',
  restrictionCreated: 'Eine Sperre wurde verhängt.',
  restrictionExpired: 'Eine Sperre ist abgelaufen.',
  roleChange: 'Die Discord-Rollen eines Mitglieds wurden geändert.',
  memberLeft: 'Ein Mitglied hat den Discord-Server verlassen.',
};
export const NOTIFICATION_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

/** Ordnet eine Audit-Aktion einer Benachrichtigungs-Art zu (oder `null`). */
export function notificationTypeOf(action: string): NotificationType | null {
  if (action === 'ticket.opened') return 'ticketNew';
  if (action === 'ticket.ping' || action === 'ticket.waiting') return 'ticketWaiting';
  if (action === 'ticket.claimed') return 'ticketAssigned';
  if (action === 'ticket.closed') return 'ticketClosed';
  if (action === 'training.created') return 'trainingNew';
  if (action === 'training.finished' || action === 'training.passed') return 'trainingCompleted';
  if (action === 'wanted.created') return 'wantedNew';
  if (action === 'restriction.created') return 'restrictionCreated';
  if (action === 'restriction.expired') return 'restrictionExpired';
  if (action === 'role.change') return 'roleChange';
  if (action === 'member.left') return 'memberLeft';
  if (action === 'submission.submitted') return 'applicationNew';
  if (action === 'submission.accepted') return 'applicationAccepted';
  if (action === 'submission.denied') return 'applicationDenied';
  if (
    action.startsWith('personnel.') ||
    action === 'promotion.approved'
  )
    return 'teamChange';
  if (
    action.startsWith('settings.') ||
    action.startsWith('permissions.') ||
    (action.startsWith('design.') && !action.startsWith('design.asset.'))
  )
    return 'settingsChanged';
  return null;
}
/** Aktionen, die zu den gewählten Arten gehören – für die Datenbankabfrage. */
export const ACTIONS_OF: Record<NotificationType, { exact: string[]; prefix: string[] }> = {
  ticketNew: { exact: ['ticket.opened'], prefix: [] },
  applicationNew: { exact: ['submission.submitted'], prefix: [] },
  applicationAccepted: { exact: ['submission.accepted'], prefix: [] },
  applicationDenied: { exact: ['submission.denied'], prefix: [] },
  ticketWaiting: { exact: ['ticket.ping', 'ticket.waiting'], prefix: [] },
  ticketAssigned: { exact: ['ticket.claimed'], prefix: [] },
  ticketClosed: { exact: ['ticket.closed'], prefix: [] },
  trainingNew: { exact: ['training.created'], prefix: [] },
  trainingCompleted: { exact: ['training.finished', 'training.passed'], prefix: [] },
  wantedNew: { exact: ['wanted.created'], prefix: [] },
  restrictionCreated: { exact: ['restriction.created'], prefix: [] },
  restrictionExpired: { exact: ['restriction.expired'], prefix: [] },
  roleChange: { exact: ['role.change'], prefix: [] },
  memberLeft: { exact: ['member.left'], prefix: [] },
  teamChange: { exact: ['promotion.approved'], prefix: ['personnel.'] },
  settingsChanged: { exact: [], prefix: ['settings.', 'permissions.', 'design.'] },
};
