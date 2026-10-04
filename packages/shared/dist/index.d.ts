/** Zentraler Permission-Katalog. Einzige Quelle der Wahrheit für Backend und Frontend. */
declare const PERMISSION_CATALOG: {
    readonly dashboard: readonly ["view", "customize"];
    readonly team: readonly ["view", "manage"];
    readonly dispatch: readonly ["view", "create", "edit", "assign", "close", "manage"];
    readonly incidents: readonly ["view", "create", "edit", "close", "delete"];
    readonly persons: readonly ["view", "create", "edit", "archive", "merge"];
    readonly vehicles: readonly ["view", "create", "edit", "archive"];
    readonly reports: readonly ["view", "create", "edit", "submit", "review", "approve", "reject", "archive"];
    readonly tickets: readonly ["view", "create", "edit", "void"];
    readonly complaints: readonly ["view", "create", "assign", "investigate", "resolve", "close"];
    readonly investigations: readonly ["view", "create", "edit", "close"];
    readonly wanted: readonly ["view", "create", "edit", "activate", "clear"];
    readonly evidence: readonly ["view", "create", "transfer", "release"];
    readonly personnel: readonly ["view", "create", "edit", "promote", "discipline"];
    readonly applications: readonly ["view", "review", "decide"];
    readonly academy: readonly ["view", "manage"];
    readonly communication: readonly ["view", "send", "moderate"];
    readonly analytics: readonly ["view"];
    readonly audit: readonly ["view", "export"];
    readonly studio: readonly ["view", "manage"];
    readonly settings: readonly ["view", "manage"];
    readonly users: readonly ["view", "manage"];
    readonly roles: readonly ["view", "manage"];
};
type Catalog = typeof PERMISSION_CATALOG;
type PermissionKey = {
    [M in keyof Catalog]: `${M & string}.${Catalog[M][number]}`;
}[keyof Catalog];
declare const ALL_PERMISSIONS: readonly PermissionKey[];
declare const isPermissionKey: (v: string) => v is PermissionKey;
type Effect = 'ALLOW' | 'DENY';
interface PermissionGrant {
    permission: string;
    effect: Effect;
}
type ResolutionSource = 'USER_DENY' | 'USER_ALLOW' | 'ROLE_DENY' | 'ROLE_ALLOW' | 'DEFAULT_DENY';
interface Resolution {
    allowed: boolean;
    source: ResolutionSource;
}
interface PermissionContext {
    /** Explizite Einzel-Overrides des Benutzers. */
    userOverrides: readonly PermissionGrant[];
    /** Grants aus allen Rollen und Gruppen des Benutzers. */
    roleGrants: readonly PermissionGrant[];
}
/**
 * Zentrale Auflösung (Spezifikation §12):
 * 1. User DENY  2. User ALLOW  3. Role/Group DENY  4. Role/Group ALLOW  5. Default DENY
 * Ein Wildcard `module.*` im Grant gilt für alle Aktionen des Moduls; `*` für alles.
 */
declare function resolvePermission(ctx: PermissionContext, permission: string): Resolution;
declare function grantMatches(grant: string, permission: string): boolean;
declare const can: (ctx: PermissionContext, permission: string) => boolean;
/** Berechnet die effektive Menge erlaubter Katalog-Permissions (für Frontend-UI-Hinweise). */
declare function effectivePermissions(ctx: PermissionContext): PermissionKey[];

/** Zentrale Statusdefinitionen und erlaubte Übergänge. Nicht im Code verstreut hartcodieren. */
type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;
declare const DISPATCH_STATUSES: readonly ["NEW", "ACKNOWLEDGED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "PROCESSING", "CLEARING", "CLOSED", "CANCELLED"];
type DispatchStatus = (typeof DISPATCH_STATUSES)[number];
declare const DISPATCH_TRANSITIONS: TransitionMap<DispatchStatus>;
declare const PRIORITIES: readonly ["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"];
type Priority = (typeof PRIORITIES)[number];
declare const UNIT_STATUSES: readonly ["AVAILABLE", "BUSY", "EN_ROUTE", "ON_SCENE", "UNAVAILABLE", "OFF_DUTY"];
type UnitStatus = (typeof UNIT_STATUSES)[number];
declare const DUTY_STATUSES: readonly ["OFF_DUTY", "ON_DUTY", "BREAK", "TRAINING", "ADMINISTRATIVE"];
type DutyStatus = (typeof DUTY_STATUSES)[number];
declare const REPORT_TYPES: readonly ["INCIDENT", "PATROL", "TRAFFIC", "ARREST", "CITATION", "COLLISION", "INVESTIGATION", "GENERAL"];
type ReportType = (typeof REPORT_TYPES)[number];
declare const REPORT_STATUSES: readonly ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"];
type ReportStatus = (typeof REPORT_STATUSES)[number];
declare const REPORT_TRANSITIONS: TransitionMap<ReportStatus>;
declare const TICKET_STATUSES: readonly ["ISSUED", "PAID", "VOID"];
type TicketStatus = (typeof TICKET_STATUSES)[number];
declare const TICKET_TRANSITIONS: TransitionMap<TicketStatus>;
declare const COMPLAINT_STATUSES: readonly ["RECEIVED", "SCREENING", "ASSIGNED", "INVESTIGATION", "REVIEW", "RESOLVED", "CLOSED"];
type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
declare const COMPLAINT_TRANSITIONS: TransitionMap<ComplaintStatus>;
declare const INVESTIGATION_STATUSES: readonly ["OPEN", "ACTIVE", "SUSPENDED", "CLOSED", "ARCHIVED"];
type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];
declare const INVESTIGATION_TRANSITIONS: TransitionMap<InvestigationStatus>;
declare const WANTED_STATUSES: readonly ["ACTIVE", "CLEARED", "CANCELLED", "EXPIRED", "ARCHIVED"];
type WantedStatus = (typeof WANTED_STATUSES)[number];
declare const WANTED_TRANSITIONS: TransitionMap<WantedStatus>;
declare const EVIDENCE_CUSTODY_STATES: readonly ["COLLECTED", "STORED", "TRANSFERRED", "REVIEWED", "RELEASED", "ARCHIVED"];
type EvidenceCustodyState = (typeof EVIDENCE_CUSTODY_STATES)[number];
declare const EVIDENCE_TRANSITIONS: TransitionMap<EvidenceCustodyState>;
declare const APPLICATION_STATUSES: readonly ["SUBMITTED", "SCREENING", "INTERVIEW", "PENDING_DECISION", "ACCEPTED", "REJECTED", "WITHDRAWN"];
type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
declare const APPLICATION_TRANSITIONS: TransitionMap<ApplicationStatus>;
declare const ROBLOX_VERIFICATION_STATUSES: readonly ["UNVERIFIED", "VERIFIED", "FAILED", "MANUAL"];
type RobloxVerificationStatus = (typeof ROBLOX_VERIFICATION_STATUSES)[number];
declare class InvalidTransitionError extends Error {
    readonly from: string;
    readonly to: string;
    constructor(from: string, to: string);
}
declare const canTransition: <S extends string>(map: TransitionMap<S>, from: S, to: S) => boolean;
declare function assertTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): void;

/** Roblox-User-IDs sind positive Ganzzahlen (als String gespeichert, um Präzisionsverlust zu vermeiden). */
declare const isValidRobloxUserId: (v: string) => boolean;

export { ALL_PERMISSIONS, APPLICATION_STATUSES, APPLICATION_TRANSITIONS, type ApplicationStatus, COMPLAINT_STATUSES, COMPLAINT_TRANSITIONS, type ComplaintStatus, DISPATCH_STATUSES, DISPATCH_TRANSITIONS, DUTY_STATUSES, type DispatchStatus, type DutyStatus, EVIDENCE_CUSTODY_STATES, EVIDENCE_TRANSITIONS, type Effect, type EvidenceCustodyState, INVESTIGATION_STATUSES, INVESTIGATION_TRANSITIONS, InvalidTransitionError, type InvestigationStatus, PERMISSION_CATALOG, PRIORITIES, type PermissionContext, type PermissionGrant, type PermissionKey, type Priority, REPORT_STATUSES, REPORT_TRANSITIONS, REPORT_TYPES, ROBLOX_VERIFICATION_STATUSES, type ReportStatus, type ReportType, type Resolution, type ResolutionSource, type RobloxVerificationStatus, TICKET_STATUSES, TICKET_TRANSITIONS, type TicketStatus, type TransitionMap, UNIT_STATUSES, type UnitStatus, WANTED_STATUSES, WANTED_TRANSITIONS, type WantedStatus, assertTransition, can, canTransition, effectivePermissions, grantMatches, isPermissionKey, isValidRobloxUserId, resolvePermission };
