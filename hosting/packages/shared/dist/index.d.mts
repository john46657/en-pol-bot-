/** Zentraler Permission-Katalog. Einzige Quelle der Wahrheit für Backend und Frontend. */
declare const PERMISSION_CATALOG: {
    /** `dashboard.<bereich>.view`: Sichtbarkeit ganzer Bereiche im Menü und auf der Startseite (zusätzlich zur Modul-Permission). */
    readonly dashboard: readonly ["view", "customize", "tickets.view", "applications.view", "team.view", "offices.view", "voice.view", "radio.view", "teamchance.view", "logs.view", "settings.view", "cad.view"];
    readonly team: readonly ["view", "manage"];
    readonly dispatch: readonly ["view", "create", "edit", "assign", "close", "manage"];
    /** CAD-Leitstelle + ER:LC-Integration (deny-by-default; kritische ER:LC-Befehle brauchen ein eigenes Recht). */
    readonly cad: readonly ["view", "create_incident", "edit_incident", "close_incident", "assign_unit", "manage_units", "view_persons", "view_vehicles", "manage_map", "view_erlc", "manage_erlc", "erlc_command", "erlc_command_critical", "manage_cross_server", "view_logs", "manage_settings", "radio"];
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
    readonly leave: readonly ["view", "request", "manage"];
    readonly applications: readonly ["view", "review", "decide"];
    readonly academy: readonly ["view", "manage"];
    readonly sek: readonly ["view", "report", "manage"];
    readonly qualifications: readonly ["view", "decide", "manage"];
    readonly ticket: readonly ["view", "create", "claim", "close", "reopen", "delete", "add_user", "remove_user", "change_status", "change_priority", "change_category", "rename", "move", "lock", "escalate", "transcript", "transcript_delete", "internal_notes", "rate", "manage", "settings"];
    /** Funk-Codes (Liste der Funkcodes, z. B. 10-4) */
    readonly radio: readonly ["view", "manage"];
    /** Team-Chance: Bewerbungsphase für das Team öffnen/schließen */
    readonly teamchance: readonly ["view", "manage"];
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
/**
 * Bereichs-Sichtbarkeit → Modul-Rechte, die zusammen mit dem Bereich vergeben werden (Startrollen, Migration).
 * Ein Menüpunkt erscheint nur mit Bereichs-Recht UND Modul-Recht; die API prüft immer das Modul-Recht.
 */
declare const AREA_PERMISSIONS: Record<string, readonly string[]>;
/** Bereichs-Rechte, die zu einer Grant-Liste passen (wer `ticket.view` hat, sieht auch den Ticket-Bereich). */
declare function areaGrantsFor(grants: readonly string[]): string[];
/**
 * Darf jemand mit `holder`-Rechten eine Berechtigung `grant` weitergeben? Nur was man selbst besitzt
 * (ein Wildcard nur, wenn man alle davon erfassten Rechte hat) – verhindert Rechteausweitung über den Rollen-Editor.
 */
declare function canDelegate(holder: PermissionContext, grant: string): boolean;

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
    /** Team fragt den Ersteller, ob das Ticket geschlossen werden kann (wie GalaxyBot „Close-Request“). */
    readonly close_request: {
        readonly label: "Schließen anfragen";
        readonly emoji: "❓";
        readonly style: "secondary";
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
    /** Beschreibung unter der Frage; Zeichenlimit für Text-Antworten (wie GalaxyBot). */
    description?: string;
    minLength?: number;
    maxLength?: number;
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

/**
 * Bewerbungsfragen (Polizei-Bewerbung und Qualifikationen) – wie bei Appy:
 * Text, Auswahl (Multiple choice) oder Rollen-Auswahl, jeweils mit Prüf-Einstellungen.
 */
declare const FORM_QUESTION_TYPES: {
    readonly TEXT: "Text";
    readonly CHOICE: "Multiple choice";
    readonly ROLE: "Role select";
};
type FormQuestionType = keyof typeof FORM_QUESTION_TYPES;
/** Auswahl-Option; bei Rollen-Auswahl mit der Discord-Rolle, die bei Annahme vergeben wird. */
interface FormOption {
    label: string;
    roleId?: string;
}
interface FormField {
    key: string;
    label: string;
    required: boolean;
    maxLength: number;
    type?: FormQuestionType;
    minLength?: number;
    options?: FormOption[];
    /** Auswahl: mehrere Optionen erlaubt (sonst genau eine). */
    multiple?: boolean;
}
/** Vollständig ausgefüllt (alte Formulare kennen nur Text). */
type Field = Required<Omit<FormField, 'options'>> & {
    options: FormOption[];
};
declare const MAX_FORM_QUESTIONS = 50;
declare const MAX_FORM_OPTIONS = 25;
declare function normalizeField(f: FormField): Field;
/** Freie Schlüssel `frage1`, `frage2` … (Antworten bleiben über Änderungen hinweg zugeordnet). */
declare function freeFieldKey(used: Iterable<string>): string;
type AnswerCheck = {
    ok: true;
    text: string;
    roleIds: string[];
} | {
    ok: false;
    error: string;
};
/**
 * Prüft eine Antwort gegen die Frage. Text: ein String; Auswahl/Rollen: die gewählten Beschriftungen.
 * Liefert den Anzeigetext (Auswahl mit „, “ verbunden) und die Rollen, die bei Annahme vergeben werden.
 */
declare function checkAnswer(field: FormField, value: string | string[] | null | undefined): AnswerCheck;
declare const APPLICATION_VARIABLES: {
    readonly '{applicationName}': "Name der Bewerbung (z. B. Polizeianwärter, Flugstaffel)";
    readonly '{user}': "Wer entschieden hat (Erwähnung)";
    readonly '{applicant}': "Der Bewerber (Erwähnung)";
    readonly '{number}': "Bewerbungsnummer";
    readonly '{reason}': "Grund (falls angegeben)";
    readonly '{questionCount}': "Anzahl der Fragen";
    readonly '{timeLimit}': "Zeitlimit, z. B. 3 Stunden";
};
type ApplicationVars = Partial<Record<keyof typeof APPLICATION_VARIABLES, string>>;
declare const DEFAULT_APPLICATION_MESSAGES: {
    readonly accepted: "🎉 Deine Bewerbung als `{applicationName}` ({number}) wurde von {user} **angenommen**!";
    readonly denied: "Deine Bewerbung als `{applicationName}` ({number}) wurde von {user} leider **abgelehnt**. Du kannst dich später gerne erneut bewerben.";
    readonly confirmation: "Bist du sicher, dass du dich bewerben möchtest?\n\nSobald du startest, schicke ich dir nacheinander **{questionCount} Fragen**. Du hast **{timeLimit}** Zeit, die Bewerbung abzuschließen – sonst musst du neu starten. Abbrechen kannst du jederzeit über den Button.";
    readonly completion: "✅ Deine Bewerbung **{number}** ist eingegangen! Das Team prüft sie – die Entscheidung bekommst du hier per Direktnachricht.";
};
/** Ersetzt bekannte Variablen; ein Grund wird angehängt, wenn der Text `{reason}` nicht selbst enthält. */
declare function renderApplicationText(text: string, vars: ApplicationVars, appendReason?: boolean): string;
declare const formatMinutes: (min: number) => string;
/** Rollen-Voraussetzung: „alle“ oder „mindestens eine“ der Rollen. */
declare const rolesMatch: (have: string[], ids: string[], mode: "ALL" | "ANY") => boolean;

/**
 * CAD-Leitstelle + ER:LC: Standardwerte der Konfiguration. Alles hier ist nur der Startzustand –
 * Administratoren ändern Prioritäten, Status, Einheitentypen, Layer, Marker, Karte und Discord-Ziele im Dashboard.
 */
interface CadOption {
    key: string;
    label: string;
    emoji?: string;
    color?: string;
    order?: number;
}
interface CadStatusOption extends CadOption {
    closed?: boolean;
}
interface CadUnitType extends CadOption {
    layer?: string;
}
interface CadLayer {
    key: string;
    label: string;
    builtin?: boolean;
    enabledByDefault?: boolean;
}
interface CadMarkerStyle {
    key: string;
    label: string;
    emoji: string;
    color: string;
}
interface CadMapConfig {
    /** Kartenbild (hochgeladene ER:LC-Map). Leer = noch keine Karte hinterlegt. */
    imageUrl?: string | null;
    width: number;
    height: number;
    /** Pixel des Spiel-Ursprungs (0,0) und Pixel pro Spieleinheit – zum Kalibrieren der Marker. */
    originX: number;
    originY: number;
    scale: number;
}
interface CadRoute {
    id: string;
    guildId: string;
    event: CadEvent;
    channelIds: string[];
    pingRoleIds: string[];
    enabled: boolean;
}
interface CadField {
    key: string;
    label: string;
    type: 'text' | 'number' | 'select';
    options?: string[];
}
interface CadConfig {
    /** Discord-Server der Leitstelle (Heimat der Einsätze). */
    homeGuildId?: string | null;
    incidentNumberPrefix: string;
    incidentTypes: CadOption[];
    priorities: CadOption[];
    incidentStatuses: CadStatusOption[];
    unitStatuses: CadOption[];
    unitTypes: CadUnitType[];
    layers: CadLayer[];
    markers: CadMarkerStyle[];
    map: CadMapConfig;
    routes: CadRoute[];
    /** Zusätzliche Felder für Funk-/Personenzuordnung (Teamübersicht). */
    memberFields: CadField[];
    /** Widgets der Leitstellen-Startseite (Standard für alle; jeder Benutzer kann seine eigene Ansicht anpassen). */
    widgets: string[];
}
declare const CAD_EVENTS: readonly ["incident.created", "incident.status", "incident.assigned", "incident.closed", "call.received", "announcement", "radio"];
type CadEvent = (typeof CAD_EVENTS)[number];
declare const CAD_EVENT_LABELS: Record<CadEvent, string>;
/** Datenarten, die eine Server-Verbindung senden darf, und Aktionen, die der verbundene Server zurück ausführen darf. */
declare const CAD_LINK_SEND_TYPES: readonly ["incidents", "incident_status", "unit_requests", "calls", "announcements", "radio"];
declare const CAD_LINK_ACTIONS: readonly ["status_report", "radio", "view_incidents"];
declare const CAD_LINK_LABELS: Record<string, string>;
/** Welche Datenart ein CAD-Ereignis bei verbundenen Servern ist. */
declare const CAD_EVENT_SEND_TYPE: Record<CadEvent, (typeof CAD_LINK_SEND_TYPES)[number]>;
declare const CAD_WIDGETS: readonly ["activeIncidents", "availableUnits", "erlcPlayers", "erlcQueue", "activeCalls", "staffOnline", "erlcStatus", "map", "units", "radio", "persons", "vehicles"];
declare const CAD_WIDGET_LABELS: Record<string, string>;
/** Offizielle ER:LC-Kartenbilder sind 5355 × 5355 px, Spielkoordinate (0,0) liegt in der Mitte. */
declare const ERLC_MAP_SIZE = 5355;
declare const DEFAULT_CAD_CONFIG: CadConfig;
/** Spielkoordinate (ER:LC: X nach rechts, Z nach unten, Ursprung Mitte) → Pixel im Kartenbild. */
declare const gameToPixel: (m: CadMapConfig, x: number, z: number) => {
    px: number;
    py: number;
};
declare const pixelToGame: (m: CadMapConfig, px: number, py: number) => {
    x: number;
    z: number;
};
declare const ERLC_FEATURES: readonly ["players", "staff", "queue", "vehicles", "emergencyCalls", "modCalls", "joinLogs", "killLogs", "commandLogs", "commands", "webhook"];
type ErlcFeature = (typeof ERLC_FEATURES)[number];
declare const ERLC_FEATURE_LABELS: Record<ErlcFeature, string>;
/** Update-Intervalle, die zu den API-Limits passen (ein Abruf liefert alle Daten auf einmal). */
declare const ERLC_POLL_OPTIONS: readonly [5, 10, 15, 30, 60];
declare const ERLC_STATUSES: readonly ["CONNECTED", "LIMITED", "OFFLINE", "ERROR", "UNKNOWN", "DISABLED"];
type ErlcStatus = (typeof ERLC_STATUSES)[number];
declare const ERLC_STATUS_LABEL: Record<ErlcStatus, string>;
/** Standard: Befehle, die nur mit `cad.erlc_command_critical` + Bestätigung laufen, und Befehle, die nie über das Dashboard laufen. */
declare const ERLC_DEFAULT_CRITICAL: string[];
declare const ERLC_DEFAULT_BLOCKED: string[];
/** „Name:123“ (ER:LC-Spielerangabe) → { name, id }. */
declare function parsePlayer(v: unknown): {
    name: string;
    id: string | null;
};

/**
 * Gefahrenstatus (Kriminalitätslage) – Stufen, Texte, Farben, Buttons und Pings sind im Dashboard einstellbar.
 * Standard wie im alten Bot: „Status 1“ bis „Status 4“.
 */
interface DangerLevelDef {
    key: string;
    name: string;
    title: string;
    text: string;
    emoji: string;
    color: string;
    buttonStyle: 'primary' | 'secondary' | 'success' | 'danger';
}
interface DangerConfig {
    panelTitle: string;
    panelText: string;
    buttonEmoji: string;
    levels: DangerLevelDef[];
    pingRoleIds: string[];
}
declare const DEFAULT_DANGER_CONFIG: DangerConfig;
/** Alte Stufen (Grün/Gelb/Rot) → Standard-Stufen, falls die Konfiguration sie nicht mehr kennt. */
declare const LEGACY_DANGER: Record<string, string>;
declare function dangerLevelOf(cfg: DangerConfig, key: string | null | undefined): DangerLevelDef;

export { ALL_PERMISSIONS, APPLICATION_STATUSES, APPLICATION_TRANSITIONS, APPLICATION_VARIABLES, AREA_PERMISSIONS, type AnswerCheck, type ApplicationStatus, type ApplicationVars, type ButtonStyleName, CAD_EVENTS, CAD_EVENT_LABELS, CAD_EVENT_SEND_TYPE, CAD_LINK_ACTIONS, CAD_LINK_LABELS, CAD_LINK_SEND_TYPES, CAD_WIDGETS, CAD_WIDGET_LABELS, CLAIM_MODES, CLOSE_REASON_MODES, CLOSE_REASON_SOURCES, COMPLAINT_STATUSES, COMPLAINT_TRANSITIONS, type CadConfig, type CadEvent, type CadField, type CadLayer, type CadMapConfig, type CadMarkerStyle, type CadOption, type CadRoute, type CadStatusOption, type CadUnitType, type ClaimMode, type CloseReasonMode, type CloseReasonSource, type ComplaintStatus, type ComponentButton, type ComponentSelect, DEFAULT_APPLICATION_MESSAGES, DEFAULT_CAD_CONFIG, DEFAULT_DANGER_CONFIG, DISPATCH_STATUSES, DISPATCH_TRANSITIONS, DUTY_STATUSES, type DangerConfig, type DangerLevelDef, type DispatchStatus, type DutyStatus, ERLC_DEFAULT_BLOCKED, ERLC_DEFAULT_CRITICAL, ERLC_FEATURES, ERLC_FEATURE_LABELS, ERLC_MAP_SIZE, ERLC_POLL_OPTIONS, ERLC_STATUSES, ERLC_STATUS_LABEL, EVIDENCE_CUSTODY_STATES, EVIDENCE_TRANSITIONS, type Effect, type EmbedSpec, type ErlcFeature, type ErlcStatus, type EvidenceCustodyState, FORM_QUESTION_TYPES, type Field, type FormField, type FormOption, type FormQuestionType, INVESTIGATION_STATUSES, INVESTIGATION_TRANSITIONS, InvalidTransitionError, type InvestigationStatus, LEGACY_DANGER, MAX_FORM_OPTIONS, MAX_FORM_QUESTIONS, type MessageSpec, PERMISSION_CATALOG, PRIORITIES, type PermissionContext, type PermissionGrant, type PermissionKey, type Priority, QUESTION_TYPES, type QuestionType, REPORT_STATUSES, REPORT_TRANSITIONS, REPORT_TYPES, ROBLOX_VERIFICATION_STATUSES, type ReportStatus, type ReportType, type Resolution, type ResolutionSource, type RobloxVerificationStatus, STATUS_KINDS, type StatusKind, TICKET_ACTIONS, TICKET_ACTION_KEYS, TICKET_PLACEHOLDERS, TICKET_STATUSES, TICKET_TRANSITIONS, type TicketAction, type TicketButtonConfig, type TicketEffect, type TicketQuestion, type TicketStatus, type TicketVars, type TransitionMap, UNIT_STATUSES, type UnitStatus, WANTED_STATUSES, WANTED_TRANSITIONS, type WantedStatus, areaGrantsFor, assertTransition, can, canDelegate, canTransition, checkAnswer, dangerLevelOf, defaultTicketButtons, effectivePermissions, formatMinutes, freeFieldKey, gameToPixel, grantMatches, isPermissionKey, isValidRobloxUserId, normalizeField, parsePlayer, pixelToGame, renderApplicationText, renderTicketText, resolvePermission, rolesMatch, ticketChannelName, ticketNumber };
