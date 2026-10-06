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
    readonly sek: readonly ["view", "report", "manage"];
    readonly qualifications: readonly ["view", "decide", "manage"];
    readonly ticket: readonly ["view", "create", "claim", "close", "reopen", "delete", "add_user", "remove_user", "change_status", "change_priority", "change_category", "rename", "move", "lock", "escalate", "transcript", "transcript_delete", "internal_notes", "rate", "manage", "settings"];
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

/**
 * Ticket-System: gemeinsame Kataloge (Aktionen, Fragetypen, Platzhalter) und Hilfsfunktionen.
 * Kategorien, Status, Prioritäten, Texte, Rollen usw. liegen ausschließlich in der Datenbank (Dashboard).
 */
/** Alle Ticket-Aktionen mit Standard-Button und benötigtem Recht. `state`: wann der Button am Ticket erscheint. */
declare const TICKET_ACTIONS: {
    readonly close: {
        readonly label: "Schließen";
        readonly emoji: "🔒";
        readonly style: "danger";
        readonly state: "open";
        readonly permission: "ticket.close";
    };
    readonly reopen: {
        readonly label: "Wieder öffnen";
        readonly emoji: "🔓";
        readonly style: "success";
        readonly state: "closed";
        readonly permission: "ticket.reopen";
    };
    readonly claim: {
        readonly label: "Übernehmen";
        readonly emoji: "👤";
        readonly style: "primary";
        readonly state: "open";
        readonly permission: "ticket.claim";
    };
    readonly unclaim: {
        readonly label: "Freigeben";
        readonly emoji: "↩️";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.claim";
    };
    readonly add_user: {
        readonly label: "Hinzufügen";
        readonly emoji: "➕";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.add_user";
    };
    readonly remove_user: {
        readonly label: "Entfernen";
        readonly emoji: "➖";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.remove_user";
    };
    readonly priority: {
        readonly label: "Priorität";
        readonly emoji: "🔔";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.change_priority";
    };
    readonly status: {
        readonly label: "Status";
        readonly emoji: "🏷️";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.change_status";
    };
    readonly category: {
        readonly label: "Kategorie";
        readonly emoji: "🗂️";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.change_category";
    };
    readonly rename: {
        readonly label: "Umbenennen";
        readonly emoji: "✏️";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.rename";
    };
    readonly move: {
        readonly label: "Verschieben";
        readonly emoji: "📁";
        readonly style: "secondary";
        readonly state: "both";
        readonly permission: "ticket.move";
    };
    readonly transcript: {
        readonly label: "Transcript";
        readonly emoji: "📋";
        readonly style: "secondary";
        readonly state: "both";
        readonly permission: "ticket.transcript";
    };
    readonly lock: {
        readonly label: "Sperren";
        readonly emoji: "⛔";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.lock";
    };
    readonly unlock: {
        readonly label: "Entsperren";
        readonly emoji: "✅";
        readonly style: "secondary";
        readonly state: "open";
        readonly permission: "ticket.lock";
    };
    readonly escalate: {
        readonly label: "Eskalieren";
        readonly emoji: "🟠";
        readonly style: "danger";
        readonly state: "open";
        readonly permission: "ticket.escalate";
    };
    readonly note: {
        readonly label: "Notiz";
        readonly emoji: "🗒️";
        readonly style: "secondary";
        readonly state: "both";
        readonly permission: "ticket.internal_notes";
    };
    readonly rating: {
        readonly label: "Bewertung";
        readonly emoji: "⭐";
        readonly style: "secondary";
        readonly state: "closed";
        readonly permission: "ticket.rate";
    };
    readonly delete: {
        readonly label: "Löschen";
        readonly emoji: "🗑️";
        readonly style: "danger";
        readonly state: "closed";
        readonly permission: "ticket.delete";
    };
};
type TicketAction = keyof typeof TICKET_ACTIONS;
declare const TICKET_ACTION_KEYS: TicketAction[];
type ButtonStyleName = 'primary' | 'secondary' | 'success' | 'danger';
/** Konfiguration eines Buttons am Ticket (pro Kategorie im Dashboard). */
interface TicketButtonConfig {
    action: TicketAction;
    label: string;
    emoji?: string;
    style: ButtonStyleName;
    enabled: boolean;
}
declare const defaultTicketButtons: () => TicketButtonConfig[];
declare const QUESTION_TYPES: {
    readonly SHORT: "Kurze Antwort";
    readonly LONG: "Lange Antwort";
    readonly YESNO: "Ja/Nein";
    readonly SELECT: "Auswahl";
    readonly MULTI: "Mehrere Optionen";
};
type QuestionType = keyof typeof QUESTION_TYPES;
interface TicketQuestion {
    id: string;
    label: string;
    type: QuestionType;
    required: boolean;
    options: string[];
    placeholder?: string;
}
declare const CLAIM_MODES: {
    readonly SINGLE: "Nur ein Bearbeiter";
    readonly MULTI: "Mehrere Bearbeiter";
    readonly PRIMARY: "Hauptbearbeiter + Helfer";
};
type ClaimMode = keyof typeof CLAIM_MODES;
declare const CLOSE_REASON_MODES: {
    readonly NONE: "Kein Grund";
    readonly OPTIONAL: "Grund optional";
    readonly REQUIRED: "Grund erforderlich";
};
type CloseReasonMode = keyof typeof CLOSE_REASON_MODES;
declare const CLOSE_REASON_SOURCES: {
    readonly PRESET: "Feste Gründe";
    readonly CUSTOM: "Eigener Grund";
    readonly BOTH: "Beides";
};
type CloseReasonSource = keyof typeof CLOSE_REASON_SOURCES;
declare const STATUS_KINDS: {
    readonly OPEN: "Offen (aktiv)";
    readonly CLOSED: "Geschlossen";
    readonly ARCHIVED: "Archiviert";
};
type StatusKind = keyof typeof STATUS_KINDS;
/** Platzhalter für alle Ticket-Texte (Dashboard zeigt diese Liste). */
declare const TICKET_PLACEHOLDERS: {
    readonly '{user}': "Erwähnung des Ticket-Erstellers (@User)";
    readonly '{username}': "Discord-Name des Erstellers";
    readonly '{user_id}': "Discord-ID des Erstellers";
    readonly '{ticket_id}': "Ticket-Nummer, z. B. 0042";
    readonly '{category}': "Name der Ticket-Kategorie";
    readonly '{staff}': "Bearbeiter (Erwähnungen) bzw. „niemand“";
    readonly '{status}': "Aktueller Status";
    readonly '{priority}': "Aktuelle Priorität";
    readonly '{reason}': "Schließungsgrund";
    readonly '{closed_by}': "Wer geschlossen hat";
    readonly '{created_at}': "Erstellt am (Datum + Uhrzeit)";
    readonly '{closed_at}': "Geschlossen am (Datum + Uhrzeit)";
    readonly '{channel}': "Ticket-Channel (#…)";
    readonly '{actor}': "Wer die Aktion ausgelöst hat (@…)";
};
type TicketVars = Partial<Record<keyof typeof TICKET_PLACEHOLDERS, string>>;
/** Ersetzt bekannte Platzhalter; unbekannte bleiben stehen (Tippfehler fallen so auf). */
declare function renderTicketText(text: string, vars: TicketVars): string;
/** Channel-Name aus dem Format der Kategorie (Discord: klein, a-z 0-9 - _, max. 100 Zeichen). */
declare function ticketChannelName(format: string, vars: TicketVars): string;
declare const ticketNumber: (n: number) => string;
interface EmbedSpec {
    title?: string;
    description?: string;
    color?: number;
    url?: string;
    thumbnail?: string;
    image?: string;
    footer?: string;
    footerIcon?: string;
    author?: string;
    authorIcon?: string;
    fields?: {
        name: string;
        value: string;
        inline?: boolean;
    }[];
    timestamp?: string;
}
interface ComponentButton {
    id: string;
    label: string;
    emoji?: string;
    style: ButtonStyleName;
    url?: string;
    disabled?: boolean;
}
interface ComponentSelect {
    id: string;
    placeholder: string;
    kind?: 'string' | 'user' | 'role';
    min?: number;
    max?: number;
    options?: {
        label: string;
        value: string;
        description?: string;
        emoji?: string;
    }[];
}
interface MessageSpec {
    content?: string;
    embeds?: EmbedSpec[];
    buttons?: ComponentButton[];
    select?: ComponentSelect;
    mentionUsers?: string[];
    mentionRoles?: string[];
}
type TicketEffect = {
    type: 'create';
    ticketId: string;
    guildId: string;
    name: string;
    parentId?: string | null;
    viewers: {
        id: string;
        kind: 'user' | 'role';
        send: boolean;
    }[];
    topic: string;
    messages: MessageSpec[];
    control: MessageSpec;
} | {
    type: 'access';
    channelId: string;
    targetId: string;
    kind: 'user' | 'role';
    view: boolean | null;
    send?: boolean;
} | {
    type: 'rename';
    channelId: string;
    name: string;
} | {
    type: 'move';
    channelId: string;
    parentId: string | null;
} | {
    type: 'post';
    channelId: string;
    message: MessageSpec;
} | {
    type: 'control';
    ticketId: string;
    channelId: string;
    messageId: string | null;
    message: MessageSpec;
} | {
    type: 'dm';
    userId: string;
    message: MessageSpec;
} | {
    type: 'transcript';
    transcriptId: string;
    channelIds: string[];
    userId?: string | null;
    filename: string;
    message?: MessageSpec;
} | {
    type: 'delete';
    channelId: string;
    delayMs: number;
} | {
    type: 'panel';
    panelId: string;
    channelId: string;
    messageId: string | null;
    message: MessageSpec;
};

export { ALL_PERMISSIONS, APPLICATION_STATUSES, APPLICATION_TRANSITIONS, type ApplicationStatus, type ButtonStyleName, CLAIM_MODES, CLOSE_REASON_MODES, CLOSE_REASON_SOURCES, COMPLAINT_STATUSES, COMPLAINT_TRANSITIONS, type ClaimMode, type CloseReasonMode, type CloseReasonSource, type ComplaintStatus, type ComponentButton, type ComponentSelect, DISPATCH_STATUSES, DISPATCH_TRANSITIONS, DUTY_STATUSES, type DispatchStatus, type DutyStatus, EVIDENCE_CUSTODY_STATES, EVIDENCE_TRANSITIONS, type Effect, type EmbedSpec, type EvidenceCustodyState, INVESTIGATION_STATUSES, INVESTIGATION_TRANSITIONS, InvalidTransitionError, type InvestigationStatus, type MessageSpec, PERMISSION_CATALOG, PRIORITIES, type PermissionContext, type PermissionGrant, type PermissionKey, type Priority, QUESTION_TYPES, type QuestionType, REPORT_STATUSES, REPORT_TRANSITIONS, REPORT_TYPES, ROBLOX_VERIFICATION_STATUSES, type ReportStatus, type ReportType, type Resolution, type ResolutionSource, type RobloxVerificationStatus, STATUS_KINDS, type StatusKind, TICKET_ACTIONS, TICKET_ACTION_KEYS, TICKET_PLACEHOLDERS, TICKET_STATUSES, TICKET_TRANSITIONS, type TicketAction, type TicketButtonConfig, type TicketEffect, type TicketQuestion, type TicketStatus, type TicketVars, type TransitionMap, UNIT_STATUSES, type UnitStatus, WANTED_STATUSES, WANTED_TRANSITIONS, type WantedStatus, assertTransition, can, canTransition, defaultTicketButtons, effectivePermissions, grantMatches, isPermissionKey, isValidRobloxUserId, renderTicketText, resolvePermission, ticketChannelName, ticketNumber };
