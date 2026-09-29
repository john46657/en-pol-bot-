/**
 * Getypte Events des Application-Moduls (§57/§102).
 *
 * Andere NEXUS-Module können diese Events abonnieren (Event Bus).
 * Payloads sind serialisierbar (keine Class-Instanzen).
 */

export const APPLICATION_EVENTS = [
  'application.created',
  'application.updated',
  'application.published',
  'application.paused',
  'application.archived',
  'application.started',
  'application.question.answered',
  'application.question.failed',
  'application.paused_submission',
  'application.resumed',
  'application.submitted',
  'application.assigned',
  'application.accepted',
  'application.denied',
  'application.expired',
  'application.cancelled',
  'application.reopened',
  'application.deleted',
] as const;

export type ApplicationEventName = (typeof APPLICATION_EVENTS)[keyof typeof APPLICATION_EVENTS];

/** Automation-Trigger (§57/§58). */
export type AutomationTrigger = ApplicationEventName;

export interface ApplicationEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  name: ApplicationEventName;
  /** Event-Payload-Version (§104). */
  version: number;
  guildId: string;
  applicationId?: string;
  submissionId?: string;
  actorId?: string;
  occurredAt: string;
  data: T;
}

/** Automation-Aktion (§58: THEN-Zweig). */
export interface AutomationAction {
  id: string;
  type:
    | 'add_role'
    | 'remove_role'
    | 'send_message'
    | 'create_thread'
    | 'notify_role'
    | 'create_ticket'
    | 'send_webhook'
    | 'log_event';
  /** Variablen werden gerendert (§59). */
  config: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  applicationId?: string;
  guildId: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  /** Bedingungen im selben Format wie Question-Conditions (§13). */
  conditionGroupe?: unknown;
  actions: AutomationAction[];
}
