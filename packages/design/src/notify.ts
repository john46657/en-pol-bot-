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
  teamChange: { label: 'Teamänderung', icon: '👥', permission: 'personnel.view' },
  settingsChanged: { label: 'Systemeinstellungen geändert', icon: '⚙️', permission: 'config.view' },
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export const NOTIFICATION_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

/** Ordnet eine Audit-Aktion einer Benachrichtigungs-Art zu (oder `null`). */
export function notificationTypeOf(action: string): NotificationType | null {
  if (action === 'ticket.opened') return 'ticketNew';
  if (action === 'ticket.ping') return 'ticketWaiting';
  if (action === 'submission.submitted') return 'applicationNew';
  if (action === 'submission.accepted') return 'applicationAccepted';
  if (action === 'submission.denied') return 'applicationDenied';
  if (
    action.startsWith('personnel.') ||
    action === 'promotion.approved' ||
    action === 'role.change'
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
  ticketWaiting: { exact: ['ticket.ping'], prefix: [] },
  teamChange: { exact: ['promotion.approved', 'role.change'], prefix: ['personnel.'] },
  settingsChanged: { exact: [], prefix: ['settings.', 'permissions.', 'design.'] },
};
