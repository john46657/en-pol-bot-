/** Zentrale Statusdefinitionen und erlaubte Übergänge. Nicht im Code verstreut hartcodieren. */
export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export const DISPATCH_STATUSES = ['NEW','ACKNOWLEDGED','ASSIGNED','EN_ROUTE','ON_SCENE','PROCESSING','CLEARING','CLOSED','CANCELLED'] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];
export const DISPATCH_TRANSITIONS: TransitionMap<DispatchStatus> = {
  NEW: ['ACKNOWLEDGED', 'ASSIGNED', 'CANCELLED'],
  ACKNOWLEDGED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'ACKNOWLEDGED', 'CANCELLED'],
  EN_ROUTE: ['ON_SCENE', 'ASSIGNED', 'CANCELLED'],
  ON_SCENE: ['PROCESSING', 'CLEARING', 'CANCELLED'],
  PROCESSING: ['CLEARING', 'ON_SCENE'],
  CLEARING: ['CLOSED', 'PROCESSING'],
  CLOSED: [],
  CANCELLED: [],
};

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const UNIT_STATUSES = ['AVAILABLE','BUSY','EN_ROUTE','ON_SCENE','UNAVAILABLE','OFF_DUTY'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const DUTY_STATUSES = ['OFF_DUTY','ON_DUTY','BREAK','TRAINING','ADMINISTRATIVE'] as const;
export type DutyStatus = (typeof DUTY_STATUSES)[number];

export const REPORT_TYPES = ['INCIDENT','PATROL','TRAFFIC','ARREST','CITATION','COLLISION','INVESTIGATION','GENERAL'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_STATUSES = ['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','ARCHIVED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_TRANSITIONS: TransitionMap<ReportStatus> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['UNDER_REVIEW', 'DRAFT'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

export const TICKET_STATUSES = ['ISSUED','PAID','VOID'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_TRANSITIONS: TransitionMap<TicketStatus> = { ISSUED: ['PAID', 'VOID'], PAID: [], VOID: [] };

export const COMPLAINT_STATUSES = ['RECEIVED','SCREENING','ASSIGNED','INVESTIGATION','REVIEW','RESOLVED','CLOSED'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const COMPLAINT_TRANSITIONS: TransitionMap<ComplaintStatus> = {
  RECEIVED: ['SCREENING'],
  SCREENING: ['ASSIGNED', 'CLOSED'],
  ASSIGNED: ['INVESTIGATION'],
  INVESTIGATION: ['REVIEW'],
  REVIEW: ['RESOLVED', 'INVESTIGATION'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

export const INVESTIGATION_STATUSES = ['OPEN','ACTIVE','SUSPENDED','CLOSED','ARCHIVED'] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];
export const INVESTIGATION_TRANSITIONS: TransitionMap<InvestigationStatus> = {
  OPEN: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['SUSPENDED', 'CLOSED'],
  SUSPENDED: ['ACTIVE', 'CLOSED'],
  CLOSED: ['ARCHIVED', 'ACTIVE'],
  ARCHIVED: [],
};

export const WANTED_STATUSES = ['ACTIVE','CLEARED','CANCELLED','EXPIRED','ARCHIVED'] as const;
export type WantedStatus = (typeof WANTED_STATUSES)[number];
export const WANTED_TRANSITIONS: TransitionMap<WantedStatus> = {
  ACTIVE: ['CLEARED', 'CANCELLED', 'EXPIRED'],
  CLEARED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  EXPIRED: ['ARCHIVED', 'ACTIVE'],
  ARCHIVED: [],
};

export const EVIDENCE_CUSTODY_STATES = ['COLLECTED','STORED','TRANSFERRED','REVIEWED','RELEASED','ARCHIVED'] as const;
export type EvidenceCustodyState = (typeof EVIDENCE_CUSTODY_STATES)[number];
export const EVIDENCE_TRANSITIONS: TransitionMap<EvidenceCustodyState> = {
  COLLECTED: ['STORED', 'TRANSFERRED'],
  STORED: ['TRANSFERRED', 'REVIEWED', 'RELEASED', 'ARCHIVED'],
  TRANSFERRED: ['STORED', 'REVIEWED', 'RELEASED'],
  REVIEWED: ['STORED', 'TRANSFERRED', 'RELEASED', 'ARCHIVED'],
  RELEASED: ['ARCHIVED'],
  ARCHIVED: [],
};

export const APPLICATION_STATUSES = ['SUBMITTED','SCREENING','INTERVIEW','PENDING_DECISION','ACCEPTED','REJECTED','WITHDRAWN'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_TRANSITIONS: TransitionMap<ApplicationStatus> = {
  SUBMITTED: ['SCREENING', 'WITHDRAWN', 'REJECTED'],
  SCREENING: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['PENDING_DECISION', 'REJECTED', 'WITHDRAWN'],
  PENDING_DECISION: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export const ROBLOX_VERIFICATION_STATUSES = ['UNVERIFIED','VERIFIED','FAILED','MANUAL'] as const;
export type RobloxVerificationStatus = (typeof ROBLOX_VERIFICATION_STATUSES)[number];

export class InvalidTransitionError extends Error {
  constructor(public readonly from: string, public readonly to: string) {
    super(`Invalid status transition ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export const canTransition = <S extends string>(map: TransitionMap<S>, from: S, to: S): boolean =>
  map[from].includes(to);

export function assertTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): void {
  if (!canTransition(map, from, to)) throw new InvalidTransitionError(from, to);
}
