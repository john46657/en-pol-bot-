import { z } from 'zod';

/** Zentraler Permission-Katalog. Einzige Quelle der Wahrheit für Backend und Frontend. */
declare const PERMISSION_CATALOG: {
    /** `dashboard.<bereich>.view`: Sichtbarkeit ganzer Bereiche im Menü und auf der Startseite (zusätzlich zur Modul-Permission). */
    readonly dashboard: readonly ["view", "customize", "tickets.view", "applications.view", "team.view", "offices.view", "voice.view", "radio.view", "teamchance.view", "logs.view", "settings.view", "cad.view"];
    readonly team: readonly ["view", "manage"];
    readonly dispatch: readonly ["view", "create", "edit", "assign", "close", "manage"];
    /** CAD-Leitstelle + ER:LC-Integration (deny-by-default; kritische ER:LC-Befehle brauchen ein eigenes Recht). */
    readonly cad: readonly ["view", "create_incident", "edit_incident", "close_incident", "assign_unit", "manage_units", "view_persons", "view_vehicles", "manage_map", "view_erlc", "manage_erlc", "erlc_command", "erlc_command_critical", "manage_cross_server", "view_logs", "manage_settings", "radio", "handover", "view_stats"];
    readonly incidents: readonly ["view", "create", "edit", "close", "delete"];
    readonly persons: readonly ["view", "create", "edit", "archive", "merge"];
    readonly vehicles: readonly ["view", "create", "edit", "archive"];
    /** Waffenregister im MDT */
    readonly weapons: readonly ["view", "create", "edit"];
    readonly reports: readonly ["view", "create", "edit", "submit", "review", "approve", "reject", "archive"];
    readonly tickets: readonly ["view", "create", "edit", "void"];
    readonly complaints: readonly ["view", "create", "assign", "investigate", "resolve", "close"];
    readonly investigations: readonly ["view", "create", "edit", "close"];
    readonly wanted: readonly ["view", "create", "edit", "activate", "clear"];
    readonly evidence: readonly ["view", "create", "transfer", "release"];
    /** view_sensitive: geschützte Daten (Verwarnungen, interne Notizen, Abwesenheitsgründe, Historie) */
    readonly personnel: readonly ["view", "view_sensitive", "create", "edit", "delete", "promote", "discipline"];
    /** Beförderungssystem */
    readonly promotion: readonly ["view", "create", "edit", "review", "approve", "reject", "execute", "manage_ranks", "manage_requirements", "view_history", "manage_settings", "manage"];
    /** Versetzungen zwischen Abteilungen */
    readonly transfer: readonly ["view", "create", "approve", "reject"];
    /** Ausbildungen und Zertifikate */
    readonly training: readonly ["view", "create", "manage"];
    /** Prüfungen */
    readonly exam: readonly ["view", "create", "manage", "grade"];
    readonly warning: readonly ["view", "create", "manage"];
    readonly awards: readonly ["view", "create", "manage"];
    /** Interne Meldungen mit Lesebestätigung */
    readonly announcements: readonly ["view", "create", "manage"];
    /** Interne Abstimmungen */
    readonly polls: readonly ["view", "create", "manage"];
    /** Dienstnummern-System */
    readonly dienstnummer: readonly ["view", "create", "assign", "edit", "release", "block", "history", "manage_ranges", "manage_settings"];
    readonly leave: readonly ["view", "request", "manage"];
    readonly applications: readonly ["view", "review", "decide", "auto_assign_dienstnummer"];
    readonly academy: readonly ["view", "manage"];
    readonly sek: readonly ["view", "report", "manage"];
    readonly qualifications: readonly ["view", "decide", "manage"];
    readonly ticket: readonly ["view", "create", "claim", "close", "reopen", "delete", "add_user", "remove_user", "change_status", "change_priority", "change_category", "rename", "move", "lock", "escalate", "transcript", "transcript_delete", "internal_notes", "rate", "manage", "settings"];
    /** Funk-Codes (Liste der Funkcodes, z. B. 10-4) */
    readonly radio: readonly ["view", "manage"];
    /** Team-Chance: Bewerbungsphase für das Team öffnen/schließen */
    readonly teamchance: readonly ["view", "manage"];
    /** Tages-/Wochenberichte nach Vorlagen (Dashboard + Discord) */
    readonly dutyreports: readonly ["view", "create", "view_all", "edit_all", "review", "manage"];
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
/** Bilder in Embeds dürfen `media:<id>` sein (hochgeladene Datei – der Bot lädt sie und hängt sie an). `reactions`: Emojis, die der Bot nach dem Senden setzt. */
interface MessageSpec {
    content?: string;
    embeds?: EmbedSpec[];
    buttons?: ComponentButton[];
    select?: ComponentSelect;
    mentionUsers?: string[];
    mentionRoles?: string[];
    reactions?: string[]; /** beim ersten Senden einen Thread mit diesem Namen starten */
    thread?: string;
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
 * Text, Auswahl (Multiple choice), Rollen-Auswahl oder Roblox-Benutzer (wird bei Roblox gesucht und geprüft).
 */
declare const FORM_QUESTION_TYPES: {
    readonly TEXT: "Text";
    readonly CHOICE: "Multiple choice";
    readonly ROLE: "Role select";
    readonly ROBLOX: "Roblox User";
};
/** Gültiger Roblox-Benutzername (3–20 Zeichen, Buchstaben/Ziffern/_). */
declare const ROBLOX_NAME: RegExp;
/** Fragen ohne Auswahl-Optionen (freie Eingabe). */
declare const isInputQuestion: (t: FormQuestionType | undefined) => t is "TEXT" | "ROBLOX" | undefined;
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
    readonly confirmation: "Bist du sicher, dass du dich bewerben möchtest?\n\nSobald du startest, schicke ich dir nacheinander **{questionCount} Fragen**. Du hast **{timeLimit}** Zeit, die Bewerbung abzuschließen – sonst musst du neu starten. Abbrechen kannst du jederzeit, indem du **abbrechen** schreibst.";
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
declare const CAD_EVENTS: readonly ["incident.created", "incident.status", "incident.assigned", "incident.closed", "incident.feedback", "incident.support", "call.received", "announcement", "radio", "handover"];
type CadEvent = (typeof CAD_EVENTS)[number];
declare const CAD_EVENT_LABELS: Record<CadEvent, string>;
/**
 * Rückmeldungen einer Einheit aus dem MDT bzw. Discord (`/cad rueckmeldung`). Sie landen in der Einsatzchronik;
 * `unitStatus` wird nur gesetzt, wenn es diesen Einheitenstatus in den CAD-Einstellungen gibt. Den Einsatz selbst ändern sie nie.
 */
declare const CAD_FEEDBACK: readonly [{
    readonly key: "accepted";
    readonly label: "Auftrag angenommen";
    readonly emoji: "✅";
    readonly unitStatus: "EN_ROUTE";
}, {
    readonly key: "en_route";
    readonly label: "Ausgerückt";
    readonly emoji: "🚓";
    readonly unitStatus: "EN_ROUTE";
}, {
    readonly key: "on_scene";
    readonly label: "Am Einsatzort";
    readonly emoji: "📍";
    readonly unitStatus: "ON_SCENE";
}, {
    readonly key: "support";
    readonly label: "Unterstützung benötigt";
    readonly emoji: "🆘";
}, {
    readonly key: "under_control";
    readonly label: "Einsatz unter Kontrolle";
    readonly emoji: "🛡️";
}, {
    readonly key: "completed";
    readonly label: "Einsatz abgeschlossen (Meldung)";
    readonly emoji: "🏁";
}];
type CadFeedbackKey = (typeof CAD_FEEDBACK)[number]['key'];
declare const CAD_FEEDBACK_KEYS: [CadFeedbackKey, ...CadFeedbackKey[]];
/** Datenarten, die eine Server-Verbindung senden darf, und Aktionen, die der verbundene Server zurück ausführen darf. */
declare const CAD_LINK_SEND_TYPES: readonly ["incidents", "incident_status", "unit_requests", "calls", "announcements", "radio"];
declare const CAD_LINK_ACTIONS: readonly ["status_report", "radio", "view_incidents", "dispatch"];
declare const CAD_LINK_LABELS: Record<string, string>;
/** Welche Datenart ein CAD-Ereignis bei verbundenen Servern ist. */
declare const CAD_EVENT_SEND_TYPE: Record<CadEvent, (typeof CAD_LINK_SEND_TYPES)[number]>;
declare const CAD_WIDGETS: readonly ["activeIncidents", "availableUnits", "activeCalls", "erlcStatus", "map", "units", "radio", "persons", "vehicles", "dutyActivity"];
declare const CAD_WIDGET_LABELS: Record<string, string>;
/** Offizielle ER:LC-Kartenbilder sind 5355 × 5355 px, Spielkoordinate (0,0) liegt in der Mitte. */
declare const ERLC_MAP_SIZE = 5355;
/** Mitgelieferte ER:LC-Karte (Stand 26.09.2026, 4096 px, als 5355 × 5355 dargestellt) – gilt ohne eigenes Kartenbild oder wenn es nicht lädt. */
declare const ERLC_BUILTIN_MAP = "/maps/erlc-map.webp";
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

/**
 * Studio-Workflows: „Wenn <Ereignis> (und Bedingungen) → Aktionen“.
 * Ereignisse sind Einträge im Audit-Protokoll (`action`), Bedingungen prüfen Felder des neuen Stands (`after`).
 */
interface WorkflowTrigger {
    key: string;
    label: string;
    fields: string[];
}
/** Vorschläge im Editor. Eigene Ereignisse (jede Audit-Aktion, auch mit `*` am Ende) sind erlaubt. */
declare const WORKFLOW_TRIGGERS: WorkflowTrigger[];
declare const WORKFLOW_OPS: readonly ["eq", "neq", "contains", "in", "exists", "not_exists"];
type WorkflowOp = (typeof WORKFLOW_OPS)[number];
declare const WORKFLOW_OP_LABELS: Record<WorkflowOp, string>;
interface WorkflowCondition {
    field: string;
    op: WorkflowOp;
    value?: string;
}
type WorkflowAction = {
    type: 'notify_permission';
    permission: string;
    title: string;
    body?: string;
} | {
    type: 'notify_role';
    roleId: string;
    title: string;
    body?: string;
} | {
    type: 'discord';
    channelIds: string[];
    pingRoleIds?: string[];
    title: string;
    text?: string;
    color?: string;
};
declare const WORKFLOW_ACTION_LABELS: Record<WorkflowAction['type'], string>;
/** Ereignis-Muster: genau oder mit `*` am Ende (z. B. `report.*`). */
declare const triggerMatches: (pattern: string, action: string) => boolean;
/** Feld lesen, auch verschachtelt (`unit.callsign`). */
declare function fieldValue(obj: unknown, path: string): unknown;
declare function conditionMatches(after: unknown, c: WorkflowCondition): boolean;
/** `{{feld}}` / `{{after.feld}}` / `{{action}}` / `{{actor}}` / `{{entityId}}` ersetzen. Werte werden gekürzt; Discord-Erwähnungen entschärft der Bot. */
declare function renderTemplate(tpl: string, ctx: {
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    actor?: string | null;
    after?: unknown;
}): string;

/** Deutsche Anzeigenamen für Status- und Prioritätswerte (Dashboard, Benachrichtigungen, Verlauf). */
declare const STATUS_LABEL: Record<string, string>;
declare const statusLabel: (status: string) => string;
/** Deutsche Anzeigenamen für Prioritäten. */
declare const PRIORITY_LABEL: Record<string, string>;

/** Willkommens- und Abschiedsnachrichten (je Discord-Server einstellbar, Admin → Welcome & Goodbye). */
/** Banner: hochgeladenes Bild (`imageMediaId`, der Bot hängt es an) oder Bild-URL (`image`, https). */
interface WelcomeMessageDef {
    enabled: boolean;
    channelId: string | null;
    title: string;
    message: string;
    color: string;
    showAvatar: boolean;
    pingUser: boolean;
    image: string;
    imageMediaId: string;
}
interface WelcomeConfig {
    welcome: WelcomeMessageDef;
    /** Direktnachricht an neue Mitglieder. */
    dm: {
        enabled: boolean;
        message: string;
    };
    /** Rollen, die neue Mitglieder automatisch bekommen (Bots ausgenommen). */
    autoRoleIds: string[];
    goodbye: WelcomeMessageDef;
}
declare const DEFAULT_WELCOME_CONFIG: WelcomeConfig;
/** Platzhalter für Titel und Texte (Anzeige im Dashboard). */
declare const WELCOME_VARIABLES: {
    readonly '{user}': "Erwähnung des Mitglieds (@Name)";
    readonly '{username}': "Benutzername";
    readonly '{displayName}': "Anzeigename auf dem Server";
    readonly '{server}': "Name des Servers";
    readonly '{memberCount}': "Anzahl Mitglieder (nach Beitritt/Austritt)";
    readonly '{accountAge}': "Alter des Discord-Kontos (z. B. „3 Tage“)";
};
interface WelcomeMember {
    id: string;
    username: string;
    displayName: string;
    server: string;
    memberCount: number;
    createdAt?: Date | string | null;
}
/** Alter des Discord-Kontos lesbar („heute“, „5 Tage“, „2 Jahre“). */
declare function accountAge(created: Date | string | null | undefined, now?: number): string;
/** Platzhalter ersetzen; unbekannte bleiben stehen. */
declare function renderWelcomeText(text: string, m: WelcomeMember, now?: number): string;
/** Farbe „#rrggbb“ → Zahl für Discord-Embeds. */
declare const hexColor: (c: string, fallback?: number) => number;

/** Sprach-Support wie bei GalaxyBot: Warteraum (Sprachkanal) → Support-Fall → Team übernimmt in einem eigenen Sprachkanal. */
interface SupportTime {
    days: number[];
    from: string;
    to: string;
}
interface VoiceSupportRoom {
    id: string;
    guildId: string;
    name: string;
    enabled: boolean;
    /** Sprachkanal, den man betritt, um einen Fall zu eröffnen. */
    waitingChannelId: string;
    /** Textkanal für „Ein neuer Support-Fall“. */
    notifyChannelId: string;
    /** Wird erwähnt und darf Fälle übernehmen. */
    teamRoleId: string;
    /** Zeichen vor dem Namen neuer Support-Kanäle (z. B. „🎧 “). */
    channelPrefix: string;
    /** Thread am Fall für Team-Notizen. */
    notes: boolean;
    /** Vorhandene Sprachkanäle nutzen statt neue anzulegen. */
    ownChannels: boolean;
    ownChannelIds: string[];
    /** Supportzeiten (Europe/Berlin); leer = immer geöffnet. */
    times: SupportTime[];
    rating: boolean;
    /** Wartemusik – Einstellung vorbereitet, spielt noch nicht. */
    music: {
        enabled: boolean;
        openTrack: string;
        closedTrack: string;
    };
    primary: boolean;
}
declare const WEEKDAYS: readonly ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
declare const MUSIC_TRACKS: {
    readonly '': "Track wählen";
    readonly lofi: "Lo-Fi";
    readonly piano: "Klavier";
    readonly elevator: "Fahrstuhlmusik";
    readonly custom: "Eigenes Audio";
};
declare const VOICE_CASE_STATUS: {
    readonly WAITING: "Wartet";
    readonly CLAIMED: "Übernommen";
    readonly DECLINED: "Abgelehnt";
    readonly ABANDONED: "Warteraum verlassen";
    readonly CLOSED: "Geschlossen";
};
declare const newVoiceRoom: (id: string, guildId?: string) => VoiceSupportRoom;
/** Wochentag (0 = Sonntag) und Minute des Tages in einer Zeitzone. */
declare function localTime(d: Date, timeZone?: string): {
    day: number;
    minute: number;
};
/** Ist der Support gerade geöffnet? Ohne Zeiten immer; „bis“ vor „von“ = über Mitternacht. */
declare function isSupportOpen(times: SupportTime[], d?: Date, timeZone?: string): boolean;

/** Roblox-Verifizierung wie bei RoVer: Code ins Roblox-Profil → Bot prüft → Rollen und Nickname. */
/** Gruppen-Bindung: Rang in einer Roblox-Gruppe (von–bis, 1–255) → Discord-Rollen. */
interface VerifyBind {
    id: string;
    groupId: string;
    minRank: number;
    maxRank: number;
    roleIds: string[];
}
interface VerifyPanel {
    channelId: string | null;
    title: string;
    message: string;
    color: string;
    buttonLabel: string;
}
interface VerifyConfig {
    enabled: boolean;
    /** Bekommt jeder Verifizierte. */
    verifiedRoleIds: string[];
    /** Bekommt, wer (noch) nicht verifiziert ist – fällt nach der Verifizierung weg. */
    unverifiedRoleIds: string[];
    /** Nickname-Vorlage; leer = Nickname nicht ändern. */
    nickname: string;
    /** Beim Beitritt: Verifizierte bekommen sofort Rollen + Nickname, alle anderen die „nicht verifiziert“-Rollen. */
    autoOnJoin: boolean;
    logChannelId: string | null;
    panel: VerifyPanel;
    binds: VerifyBind[];
}
declare const DEFAULT_VERIFY_CONFIG: VerifyConfig;
interface VerifyNickVars {
    robloxName: string;
    displayName: string;
    discordName: string;
    robloxId: string;
}
declare const VERIFY_NICK_VARS: Record<string, string>;
/** Nickname aus der Vorlage (Discord erlaubt höchstens 32 Zeichen). Leere Vorlage → null (nicht ändern). */
declare function renderVerifyNickname(tpl: string, v: VerifyNickVars): string | null;
/** Welche Bindungen passen zu den Gruppen-Rängen eines Roblox-Kontos? (Gruppen-ID → Rang) */
declare function matchingBinds(binds: VerifyBind[], ranks: Record<string, number>): VerifyBind[];
/** Rollen und Nickname für ein Mitglied: verifiziert (mit Gruppen-Rängen) oder nicht. */
declare function verifyActions(cfg: VerifyConfig, link: (VerifyNickVars & {
    ranks: Record<string, number>;
}) | null): {
    add: string[];
    remove: string[];
    nickname: string | null;
};

declare const staffSectionSchema: z.ZodObject<{
    roleId: z.ZodString;
    /** eigene Überschrift statt der Rollen-Erwähnung (leer = @Rolle) */
    label: z.ZodDefault<z.ZodString>;
    /** Trennlinie nach diesem Abschnitt */
    divider: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    label: string;
    roleId: string;
    divider: boolean;
}, {
    roleId: string;
    label?: string | undefined;
    divider?: boolean | undefined;
}>;
declare const staffListSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    guildId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    title: z.ZodDefault<z.ZodString>;
    intro: z.ZodDefault<z.ZodString>;
    color: z.ZodDefault<z.ZodString>;
    sections: z.ZodDefault<z.ZodArray<z.ZodObject<{
        roleId: z.ZodString;
        /** eigene Überschrift statt der Rollen-Erwähnung (leer = @Rolle) */
        label: z.ZodDefault<z.ZodString>;
        /** Trennlinie nach diesem Abschnitt */
        divider: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        roleId: string;
        divider: boolean;
    }, {
        roleId: string;
        label?: string | undefined;
        divider?: boolean | undefined;
    }>, "many">>;
    /** Text, wenn niemand die Rolle hat */
    emptyText: z.ZodDefault<z.ZodString>;
    dividerText: z.ZodDefault<z.ZodString>;
    /** Mitglieder als Erwähnung (@Name, wie im Screenshot) oder als Anzeigename */
    mention: z.ZodDefault<z.ZodBoolean>;
    /** wer mehrere Rollen der Liste hat, steht nur unter der obersten */
    onlyHighest: z.ZodDefault<z.ZodBoolean>;
    bullet: z.ZodDefault<z.ZodString>;
    footer: z.ZodDefault<z.ZodString>;
    timestamp: z.ZodDefault<z.ZodBoolean>;
    /** automatisch aktualisieren, sobald sich Rollen ändern */
    autoUpdate: z.ZodDefault<z.ZodBoolean>;
    image: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    id: string;
    name: string;
    guildId: string | null;
    channelId: string | null;
    intro: string;
    color: string;
    sections: {
        label: string;
        roleId: string;
        divider: boolean;
    }[];
    emptyText: string;
    dividerText: string;
    mention: boolean;
    onlyHighest: boolean;
    bullet: string;
    footer: string;
    timestamp: boolean;
    autoUpdate: boolean;
    image: string;
}, {
    id: string;
    name: string;
    title?: string | undefined;
    guildId?: string | null | undefined;
    channelId?: string | null | undefined;
    intro?: string | undefined;
    color?: string | undefined;
    sections?: {
        roleId: string;
        label?: string | undefined;
        divider?: boolean | undefined;
    }[] | undefined;
    emptyText?: string | undefined;
    dividerText?: string | undefined;
    mention?: boolean | undefined;
    onlyHighest?: boolean | undefined;
    bullet?: string | undefined;
    footer?: string | undefined;
    timestamp?: boolean | undefined;
    autoUpdate?: boolean | undefined;
    image?: string | undefined;
}>;
type StaffList = z.infer<typeof staffListSchema>;
interface StaffMember {
    id: string;
    name: string;
    roleIds: string[];
}
/** Staff-Liste als Discord-Nachricht (wird vom Bot und von der Vorschau im Dashboard gleich gerechnet). */
declare function renderStaffList(l: StaffList, members: StaffMember[], roleName?: (id: string) => string, now?: Date): MessageSpec;
declare const panelFieldSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodDefault<z.ZodString>;
    long: z.ZodDefault<z.ZodBoolean>;
    required: z.ZodDefault<z.ZodBoolean>;
    maxLength: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    label: string;
    required: boolean;
    maxLength: number;
    long: boolean;
    id: string;
    placeholder: string;
}, {
    label: string;
    id: string;
    required?: boolean | undefined;
    maxLength?: number | undefined;
    long?: boolean | undefined;
    placeholder?: string | undefined;
}>;
declare const formPanelSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    guildId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    active: z.ZodDefault<z.ZodBoolean>;
    /** Panel-Nachricht mit Button */
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    panelTitle: z.ZodDefault<z.ZodString>;
    panelText: z.ZodDefault<z.ZodString>;
    panelColor: z.ZodDefault<z.ZodString>;
    panelImage: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    buttonLabel: z.ZodDefault<z.ZodString>;
    buttonEmoji: z.ZodDefault<z.ZodString>;
    buttonStyle: z.ZodDefault<z.ZodEnum<["primary", "secondary", "success", "danger"]>>;
    /** Formular */
    modalTitle: z.ZodDefault<z.ZodString>;
    fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodDefault<z.ZodString>;
        long: z.ZodDefault<z.ZodBoolean>;
        required: z.ZodDefault<z.ZodBoolean>;
        maxLength: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        required: boolean;
        maxLength: number;
        long: boolean;
        id: string;
        placeholder: string;
    }, {
        label: string;
        id: string;
        required?: boolean | undefined;
        maxLength?: number | undefined;
        long?: boolean | undefined;
        placeholder?: string | undefined;
    }>, "many">>;
    /** Ergebnis-Nachricht */
    targetChannelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    template: z.ZodDefault<z.ZodString>;
    /** als Embed statt Text */
    asEmbed: z.ZodDefault<z.ZodBoolean>;
    embedTitle: z.ZodDefault<z.ZodString>;
    embedColor: z.ZodDefault<z.ZodString>;
    /** Nachricht mit Namen und Profilbild der Person posten (Webhook – der Bot braucht „Webhooks verwalten“) */
    asUser: z.ZodDefault<z.ZodBoolean>;
    reactions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** jede Person nur einmal (erneutes Absenden ersetzt die alte Nachricht) */
    onePerUser: z.ZodDefault<z.ZodBoolean>;
    confirmText: z.ZodDefault<z.ZodString>;
    /** Rollen, die man nach dem Absenden bekommt */
    grantRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    guildId: string | null;
    channelId: string | null;
    active: boolean;
    panelTitle: string;
    panelText: string;
    panelColor: string;
    panelImage: string;
    buttonLabel: string;
    buttonEmoji: string;
    buttonStyle: "danger" | "secondary" | "success" | "primary";
    modalTitle: string;
    fields: {
        label: string;
        required: boolean;
        maxLength: number;
        long: boolean;
        id: string;
        placeholder: string;
    }[];
    targetChannelId: string | null;
    template: string;
    asEmbed: boolean;
    embedTitle: string;
    embedColor: string;
    asUser: boolean;
    reactions: string[];
    pingRoleIds: string[];
    onePerUser: boolean;
    confirmText: string;
    grantRoleIds: string[];
}, {
    id: string;
    name: string;
    guildId?: string | null | undefined;
    channelId?: string | null | undefined;
    active?: boolean | undefined;
    panelTitle?: string | undefined;
    panelText?: string | undefined;
    panelColor?: string | undefined;
    panelImage?: string | undefined;
    buttonLabel?: string | undefined;
    buttonEmoji?: string | undefined;
    buttonStyle?: "danger" | "secondary" | "success" | "primary" | undefined;
    modalTitle?: string | undefined;
    fields?: {
        label: string;
        id: string;
        required?: boolean | undefined;
        maxLength?: number | undefined;
        long?: boolean | undefined;
        placeholder?: string | undefined;
    }[] | undefined;
    targetChannelId?: string | null | undefined;
    template?: string | undefined;
    asEmbed?: boolean | undefined;
    embedTitle?: string | undefined;
    embedColor?: string | undefined;
    asUser?: boolean | undefined;
    reactions?: string[] | undefined;
    pingRoleIds?: string[] | undefined;
    onePerUser?: boolean | undefined;
    confirmText?: string | undefined;
    grantRoleIds?: string[] | undefined;
}>;
type FormPanel = z.infer<typeof formPanelSchema>;
declare const FORM_PANEL_VARIABLES: readonly ["{user}", "{user.name}", "{datum}", "{zeit}"];
/** Platzhalter füllen: Formularfelder ({kürzel}) und {user}, {user.name}, {datum}, {zeit}. */
declare function renderPanelTemplate(tpl: string, values: Record<string, string>, user: {
    id: string;
    name: string;
}, now?: Date): string;
declare function formPanelMessage(p: FormPanel): MessageSpec;
declare function formPanelResult(p: FormPanel, values: Record<string, string>, user: {
    id: string;
    name: string;
    avatar?: string;
}, now?: Date): MessageSpec;
declare const infoOptionSchema: z.ZodObject<{
    id: z.ZodString;
    /** im Auswahlmenü */
    label: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    emoji: z.ZodDefault<z.ZodString>;
    /** Antwort (nur für die Person sichtbar) */
    title: z.ZodDefault<z.ZodString>;
    text: z.ZodDefault<z.ZodString>;
    image: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    color: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    label: string;
    text: string;
    title: string;
    description: string;
    id: string;
    color: string;
    image: string;
    emoji: string;
}, {
    label: string;
    id: string;
    text?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    color?: string | undefined;
    image?: string | undefined;
    emoji?: string | undefined;
}>;
declare const infoPanelSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    guildId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    title: z.ZodDefault<z.ZodString>;
    text: z.ZodDefault<z.ZodString>;
    color: z.ZodDefault<z.ZodString>;
    image: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    footer: z.ZodDefault<z.ZodString>;
    placeholder: z.ZodDefault<z.ZodString>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        /** im Auswahlmenü */
        label: z.ZodString;
        description: z.ZodDefault<z.ZodString>;
        emoji: z.ZodDefault<z.ZodString>;
        /** Antwort (nur für die Person sichtbar) */
        title: z.ZodDefault<z.ZodString>;
        text: z.ZodDefault<z.ZodString>;
        image: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        color: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        text: string;
        title: string;
        description: string;
        id: string;
        color: string;
        image: string;
        emoji: string;
    }, {
        label: string;
        id: string;
        text?: string | undefined;
        title?: string | undefined;
        description?: string | undefined;
        color?: string | undefined;
        image?: string | undefined;
        emoji?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    options: {
        label: string;
        text: string;
        title: string;
        description: string;
        id: string;
        color: string;
        image: string;
        emoji: string;
    }[];
    text: string;
    title: string;
    id: string;
    name: string;
    guildId: string | null;
    channelId: string | null;
    color: string;
    footer: string;
    image: string;
    placeholder: string;
}, {
    id: string;
    name: string;
    options?: {
        label: string;
        id: string;
        text?: string | undefined;
        title?: string | undefined;
        description?: string | undefined;
        color?: string | undefined;
        image?: string | undefined;
        emoji?: string | undefined;
    }[] | undefined;
    text?: string | undefined;
    title?: string | undefined;
    guildId?: string | null | undefined;
    channelId?: string | null | undefined;
    color?: string | undefined;
    footer?: string | undefined;
    image?: string | undefined;
    placeholder?: string | undefined;
}>;
type InfoPanel = z.infer<typeof infoPanelSchema>;
type InfoOption = z.infer<typeof infoOptionSchema>;
declare function infoPanelMessage(p: InfoPanel): MessageSpec;
/** Antwort auf eine Auswahl (nur für die Person sichtbar). */
declare function infoOptionEmbed(o: InfoOption): EmbedSpec;

declare const REPORT_FIELD_TYPES: readonly ["short", "long", "number", "select"];
declare const reportFieldSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<["short", "long", "number", "select"]>>;
    placeholder: z.ZodDefault<z.ZodString>;
    required: z.ZodDefault<z.ZodBoolean>;
    /** nur bei Auswahl */
    options: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    maxLength: z.ZodDefault<z.ZodNumber>;
    /** in Discord nebeneinander anzeigen */
    inline: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    options: string[];
    label: string;
    required: boolean;
    maxLength: number;
    type: "number" | "select" | "long" | "short";
    id: string;
    placeholder: string;
    inline: boolean;
}, {
    label: string;
    id: string;
    options?: string[] | undefined;
    required?: boolean | undefined;
    maxLength?: number | undefined;
    type?: "number" | "select" | "long" | "short" | undefined;
    placeholder?: string | undefined;
    inline?: boolean | undefined;
}>;
declare const reportTemplateSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    emoji: z.ZodDefault<z.ZodString>;
    description: z.ZodDefault<z.ZodString>;
    period: z.ZodDefault<z.ZodEnum<["DAILY", "WEEKLY", "FREE"]>>;
    active: z.ZodDefault<z.ZodBoolean>;
    guildId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    /** Kanal, in den jeder Bericht gepostet wird (leer = nur Dashboard) */
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    color: z.ZodDefault<z.ZodString>;
    fields: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        type: z.ZodDefault<z.ZodEnum<["short", "long", "number", "select"]>>;
        placeholder: z.ZodDefault<z.ZodString>;
        required: z.ZodDefault<z.ZodBoolean>;
        /** nur bei Auswahl */
        options: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        maxLength: z.ZodDefault<z.ZodNumber>;
        /** in Discord nebeneinander anzeigen */
        inline: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        options: string[];
        label: string;
        required: boolean;
        maxLength: number;
        type: "number" | "select" | "long" | "short";
        id: string;
        placeholder: string;
        inline: boolean;
    }, {
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        maxLength?: number | undefined;
        type?: "number" | "select" | "long" | "short" | undefined;
        placeholder?: string | undefined;
        inline?: boolean | undefined;
    }>, "many">;
    /** pro Person und Zeitraum nur ein Bericht (erneutes Ausfüllen bearbeitet den vorhandenen) */
    onePerPeriod: z.ZodDefault<z.ZodBoolean>;
    /** Verfasser darf nach dem Einreichen noch bearbeiten */
    authorCanEdit: z.ZodDefault<z.ZodBoolean>;
    /** Rollen, die beim neuen Bericht erwähnt werden */
    pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    guildId: string | null;
    channelId: string | null;
    color: string;
    active: boolean;
    fields: {
        options: string[];
        label: string;
        required: boolean;
        maxLength: number;
        type: "number" | "select" | "long" | "short";
        id: string;
        placeholder: string;
        inline: boolean;
    }[];
    pingRoleIds: string[];
    emoji: string;
    period: "DAILY" | "WEEKLY" | "FREE";
    onePerPeriod: boolean;
    authorCanEdit: boolean;
}, {
    id: string;
    name: string;
    fields: {
        label: string;
        id: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
        maxLength?: number | undefined;
        type?: "number" | "select" | "long" | "short" | undefined;
        placeholder?: string | undefined;
        inline?: boolean | undefined;
    }[];
    description?: string | undefined;
    guildId?: string | null | undefined;
    channelId?: string | null | undefined;
    color?: string | undefined;
    active?: boolean | undefined;
    pingRoleIds?: string[] | undefined;
    emoji?: string | undefined;
    period?: "DAILY" | "WEEKLY" | "FREE" | undefined;
    onePerPeriod?: boolean | undefined;
    authorCanEdit?: boolean | undefined;
}>;
type ReportTemplate = z.infer<typeof reportTemplateSchema>;
type ReportField = z.infer<typeof reportFieldSchema>;
declare const PERIOD_LABEL: Record<ReportTemplate['period'], string>;
/** Beginn des Zeitraums (Europe/Berlin-nah: lokale Mitternacht des Servers; Woche ab Montag). */
declare function periodStart(period: ReportTemplate['period'], d?: Date): Date;
/** ISO-Kalenderwoche */
declare function isoWeek(d: Date): number;
declare function periodLabel(period: ReportTemplate['period'], start: Date | string): string;
/** Felder, die automatisch mit der Dienstzeit gefüllt werden (Kürzel oder Beschriftung). */
declare const isDutyTimeField: (f: Pick<ReportField, "id" | "label" | "type">) => boolean;
/** Ende des Zeitraums (exklusiv). */
declare function periodEnd(period: ReportTemplate['period'], start: Date): Date;
interface DutySpan {
    status: string;
    startedAt: Date | string;
    endedAt: Date | string | null;
}
/**
 * Dienstzeit im Zeitraum aus den Dienst-Sitzungen: zusammenhängende Sitzungen bilden eine Schicht, Pausen zählen nicht mit.
 * Tag: „18:02–21:15 (3 h 13 min)“, mehrere Schichten mit Komma. Woche: „12 h 30 min in 4 Schichten“. Ohne Dienst: null.
 */
declare function dutyTimeText(period: ReportTemplate['period'], sessions: DutySpan[], from: Date, to: Date, timeZone?: string, now?: Date): string | null;
/** Werte prüfen/zuschneiden; liefert Fehlertext oder die bereinigten Werte. */
declare function cleanReportValues(t: ReportTemplate, input: Record<string, unknown>): {
    values: Record<string, string>;
} | {
    error: string;
};
interface ReportView {
    number: string;
    period: ReportTemplate['period'];
    periodStart: string | Date;
    values: Record<string, string>;
    authorName: string;
    authorDiscordId?: string | null;
    status: string;
    updatedAt: string | Date;
    edited: boolean;
    reviewerName?: string | null;
    reviewNote?: string | null;
}
declare const REPORT_STATUS_LABEL: Record<string, string>;
/** Bericht als Discord-Nachricht (mit „Bearbeiten“-Button). */
declare function reportMessage(t: ReportTemplate, r: ReportView, id: string): MessageSpec;

declare const hrStatusSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    emoji: z.ZodDefault<z.ZodString>;
    color: z.ZodDefault<z.ZodString>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    key: string;
    label: string;
    color: string;
    active: boolean;
    emoji: string;
}, {
    key: string;
    label: string;
    color?: string | undefined;
    active?: boolean | undefined;
    emoji?: string | undefined;
}>;
declare const departmentSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    color: z.ZodDefault<z.ZodString>;
    discordRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    dashboardRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    description: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    color: string;
    discordRoleIds: string[];
    dashboardRoleIds: string[];
}, {
    id: string;
    name: string;
    description?: string | undefined;
    color?: string | undefined;
    discordRoleIds?: string[] | undefined;
    dashboardRoleIds?: string[] | undefined;
}>;
declare const severitySchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    emoji: z.ZodDefault<z.ZodString>;
    color: z.ZodDefault<z.ZodString>;
    defaultDays: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    key: string;
    label: string;
    color: string;
    emoji: string;
    defaultDays: number;
}, {
    key: string;
    label: string;
    color?: string | undefined;
    emoji?: string | undefined;
    defaultDays?: number | undefined;
}>;
declare const awardDefSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    icon: z.ZodDefault<z.ZodString>;
    description: z.ZodDefault<z.ZodString>;
    color: z.ZodDefault<z.ZodString>;
    requirements: z.ZodDefault<z.ZodString>;
    public: z.ZodDefault<z.ZodBoolean>;
    discordRoleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    description: string;
    id: string;
    name: string;
    color: string;
    active: boolean;
    icon: string;
    requirements: string;
    public: boolean;
    discordRoleId: string | null;
}, {
    id: string;
    name: string;
    description?: string | undefined;
    color?: string | undefined;
    active?: boolean | undefined;
    icon?: string | undefined;
    requirements?: string | undefined;
    public?: boolean | undefined;
    discordRoleId?: string | null | undefined;
}>;
declare const absenceTypeSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    emoji: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    key: string;
    label: string;
    emoji: string;
}, {
    key: string;
    label: string;
    emoji?: string | undefined;
}>;
/** Bereiche der Personalakte: sichtbar ja/nein und ob sie geschützt sind (nur mit personnel.view_sensitive). */
declare const PROFILE_SECTIONS: readonly ["overview", "rank", "promotions", "trainings", "exams", "awards", "warnings", "absences", "transfers", "servicenumbers", "notes", "history"];
type ProfileSection = (typeof PROFILE_SECTIONS)[number];
declare const PROFILE_SECTION_LABEL: Record<ProfileSection, string>;
declare const PROFILE_FIELDS: readonly ["discordName", "discordId", "avatar", "robloxName", "robloxId", "rank", "department", "joinDate", "status", "serviceNumber", "callsign"];
declare const PROFILE_FIELD_LABEL: Record<(typeof PROFILE_FIELDS)[number], string>;
/** Benachrichtigung je Ereignis: Dashboard, Discord-Kanal, Direktnachricht; welche Dashboard-Rollen sie bekommen. */
declare const notifyRuleSchema: z.ZodObject<{
    dashboard: z.ZodDefault<z.ZodBoolean>;
    channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    dm: z.ZodDefault<z.ZodBoolean>;
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    dashboard: boolean;
    dm: boolean;
    roleIds: string[];
    channelId: string | null;
}, {
    dashboard?: boolean | undefined;
    dm?: boolean | undefined;
    roleIds?: string[] | undefined;
    channelId?: string | null | undefined;
}>;
declare const HR_EVENTS: readonly ["promotion.requested", "promotion.approved", "promotion.rejected", "promotion.executed", "transfer.requested", "transfer.approved", "transfer.rejected", "warning.created", "award.granted", "training.passed", "exam.passed"];
type HrEvent = (typeof HR_EVENTS)[number];
declare const HR_EVENT_LABEL: Record<HrEvent, string>;
declare const stageSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    roleIds: string[];
    id: string;
    name: string;
}, {
    id: string;
    name: string;
    roleIds?: string[] | undefined;
}>;
declare const REQUEST_STATUSES: readonly ["OPEN", "IN_REVIEW", "APPROVED", "REJECTED", "DEFERRED", "EXECUTED", "CANCELLED"];
type RequestStatus = (typeof REQUEST_STATUSES)[number];
declare const requestStatusDefSchema: z.ZodObject<{
    label: z.ZodString;
    emoji: z.ZodString;
}, "strip", z.ZodTypeAny, {
    label: string;
    emoji: string;
}, {
    label: string;
    emoji: string;
}>;
declare const hrConfigSchema: z.ZodObject<{
    statuses: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodDefault<z.ZodString>;
        color: z.ZodDefault<z.ZodString>;
        active: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        color: string;
        active: boolean;
        emoji: string;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        active?: boolean | undefined;
        emoji?: string | undefined;
    }>, "many">>;
    departments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        color: z.ZodDefault<z.ZodString>;
        discordRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        dashboardRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        description: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        id: string;
        name: string;
        color: string;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
    }, {
        id: string;
        name: string;
        description?: string | undefined;
        color?: string | undefined;
        discordRoleIds?: string[] | undefined;
        dashboardRoleIds?: string[] | undefined;
    }>, "many">>;
    absenceTypes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        emoji: string;
    }, {
        key: string;
        label: string;
        emoji?: string | undefined;
    }>, "many">>;
    warningSeverities: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodDefault<z.ZodString>;
        color: z.ZodDefault<z.ZodString>;
        defaultDays: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        color: string;
        emoji: string;
        defaultDays: number;
    }, {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        defaultDays?: number | undefined;
    }>, "many">>;
    warningCategories: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    awards: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        icon: z.ZodDefault<z.ZodString>;
        description: z.ZodDefault<z.ZodString>;
        color: z.ZodDefault<z.ZodString>;
        requirements: z.ZodDefault<z.ZodString>;
        public: z.ZodDefault<z.ZodBoolean>;
        discordRoleId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        active: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        id: string;
        name: string;
        color: string;
        active: boolean;
        icon: string;
        requirements: string;
        public: boolean;
        discordRoleId: string | null;
    }, {
        id: string;
        name: string;
        description?: string | undefined;
        color?: string | undefined;
        active?: boolean | undefined;
        icon?: string | undefined;
        requirements?: string | undefined;
        public?: boolean | undefined;
        discordRoleId?: string | null | undefined;
    }>, "many">>;
    /** Bereiche der Personalakte */
    sections: z.ZodDefault<z.ZodRecord<z.ZodEnum<["overview", "rank", "promotions", "trainings", "exams", "awards", "warnings", "absences", "transfers", "servicenumbers", "notes", "history"]>, z.ZodObject<{
        visible: z.ZodBoolean;
        sensitive: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        visible: boolean;
        sensitive: boolean;
    }, {
        visible: boolean;
        sensitive: boolean;
    }>>>;
    /** Felder der Übersicht/Akte */
    fields: z.ZodDefault<z.ZodRecord<z.ZodEnum<["discordName", "discordId", "avatar", "robloxName", "robloxId", "rank", "department", "joinDate", "status", "serviceNumber", "callsign"]>, z.ZodObject<{
        visible: z.ZodBoolean;
        sensitive: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        visible: boolean;
        sensitive: boolean;
    }, {
        visible: boolean;
        sensitive: boolean;
    }>>>;
    /** Abwesenheiten im Teamprofil anzeigen */
    showAbsenceInTeam: z.ZodDefault<z.ZodBoolean>;
    promotion: z.ZodDefault<z.ZodObject<{
        stages: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            roleIds: string[];
            id: string;
            name: string;
        }, {
            id: string;
            name: string;
            roleIds?: string[] | undefined;
        }>, "many">>;
        approvalsRequired: z.ZodDefault<z.ZodNumber>;
        requireReason: z.ZodDefault<z.ZodBoolean>;
        /** Antrag nur, wenn alle Voraussetzungen erfüllt sind */
        requireRequirements: z.ZodDefault<z.ZodBoolean>;
        /** nach letzter Genehmigung automatisch durchführen */
        autoExecute: z.ZodDefault<z.ZodBoolean>;
        discordRoles: z.ZodDefault<z.ZodBoolean>;
        dashboardRoles: z.ZodDefault<z.ZodBoolean>;
        announceChannelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        announceTemplate: z.ZodDefault<z.ZodString>;
        announceColor: z.ZodDefault<z.ZodString>;
        /** eigene Namen/Emojis für die Status */
        statusLabels: z.ZodDefault<z.ZodRecord<z.ZodEnum<["OPEN", "IN_REVIEW", "APPROVED", "REJECTED", "DEFERRED", "EXECUTED", "CANCELLED"]>, z.ZodObject<{
            label: z.ZodString;
            emoji: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            label: string;
            emoji: string;
        }, {
            label: string;
            emoji: string;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        stages: {
            roleIds: string[];
            id: string;
            name: string;
        }[];
        approvalsRequired: number;
        requireReason: boolean;
        requireRequirements: boolean;
        autoExecute: boolean;
        discordRoles: boolean;
        dashboardRoles: boolean;
        announceChannelId: string | null;
        announceTemplate: string;
        announceColor: string;
        statusLabels: Partial<Record<"CANCELLED" | "APPROVED" | "REJECTED" | "OPEN" | "IN_REVIEW" | "DEFERRED" | "EXECUTED", {
            label: string;
            emoji: string;
        }>>;
    }, {
        stages?: {
            id: string;
            name: string;
            roleIds?: string[] | undefined;
        }[] | undefined;
        approvalsRequired?: number | undefined;
        requireReason?: boolean | undefined;
        requireRequirements?: boolean | undefined;
        autoExecute?: boolean | undefined;
        discordRoles?: boolean | undefined;
        dashboardRoles?: boolean | undefined;
        announceChannelId?: string | null | undefined;
        announceTemplate?: string | undefined;
        announceColor?: string | undefined;
        statusLabels?: Partial<Record<"CANCELLED" | "APPROVED" | "REJECTED" | "OPEN" | "IN_REVIEW" | "DEFERRED" | "EXECUTED", {
            label: string;
            emoji: string;
        }>> | undefined;
    }>>;
    transfer: z.ZodDefault<z.ZodObject<{
        approvalsRequired: z.ZodDefault<z.ZodNumber>;
        stages: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            roleIds: string[];
            id: string;
            name: string;
        }, {
            id: string;
            name: string;
            roleIds?: string[] | undefined;
        }>, "many">>;
        discordRoles: z.ZodDefault<z.ZodBoolean>;
        dashboardRoles: z.ZodDefault<z.ZodBoolean>;
        autoExecute: z.ZodDefault<z.ZodBoolean>;
        announceChannelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        stages: {
            roleIds: string[];
            id: string;
            name: string;
        }[];
        approvalsRequired: number;
        autoExecute: boolean;
        discordRoles: boolean;
        dashboardRoles: boolean;
        announceChannelId: string | null;
    }, {
        stages?: {
            id: string;
            name: string;
            roleIds?: string[] | undefined;
        }[] | undefined;
        approvalsRequired?: number | undefined;
        autoExecute?: boolean | undefined;
        discordRoles?: boolean | undefined;
        dashboardRoles?: boolean | undefined;
        announceChannelId?: string | null | undefined;
    }>>;
    notifications: z.ZodDefault<z.ZodRecord<z.ZodEnum<["promotion.requested", "promotion.approved", "promotion.rejected", "promotion.executed", "transfer.requested", "transfer.approved", "transfer.rejected", "warning.created", "award.granted", "training.passed", "exam.passed"]>, z.ZodObject<{
        dashboard: z.ZodDefault<z.ZodBoolean>;
        channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        dm: z.ZodDefault<z.ZodBoolean>;
        roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        dashboard: boolean;
        dm: boolean;
        roleIds: string[];
        channelId: string | null;
    }, {
        dashboard?: boolean | undefined;
        dm?: boolean | undefined;
        roleIds?: string[] | undefined;
        channelId?: string | null | undefined;
    }>>>;
    /** Verwarnungen: Meldung in Discord mit Zähler und Folgen beim Erreichen der Grenze */
    warnings: z.ZodDefault<z.ZodObject<{
        /** Grenze aktiver Verwarnungen (z. B. 3 → „1/3“) */
        limit: z.ZodDefault<z.ZodNumber>;
        /** Kanal für jede neue Verwarnung (leer = nur Dashboard) */
        channelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        template: z.ZodDefault<z.ZodString>;
        /** Person per DM informieren */
        dm: z.ZodDefault<z.ZodBoolean>;
        atLimit: z.ZodDefault<z.ZodObject<{
            /** Dashboard-Rollen, die benachrichtigt werden (z. B. Leitung) */
            notifyRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            /** Discord-Rollen, die in der Meldung erwähnt werden */
            pingDiscordRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            /** Discord-Rollen, die entzogen werden */
            removeDiscordRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            /** Status der Personalakte setzen (z. B. SUSPENDED) – leer = nicht ändern */
            status: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            status: string | null;
            notifyRoleIds: string[];
            pingDiscordRoleIds: string[];
            removeDiscordRoleIds: string[];
        }, {
            status?: string | null | undefined;
            notifyRoleIds?: string[] | undefined;
            pingDiscordRoleIds?: string[] | undefined;
            removeDiscordRoleIds?: string[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        dm: boolean;
        channelId: string | null;
        template: string;
        limit: number;
        atLimit: {
            status: string | null;
            notifyRoleIds: string[];
            pingDiscordRoleIds: string[];
            removeDiscordRoleIds: string[];
        };
    }, {
        dm?: boolean | undefined;
        channelId?: string | null | undefined;
        template?: string | undefined;
        limit?: number | undefined;
        atLimit?: {
            status?: string | null | undefined;
            notifyRoleIds?: string[] | undefined;
            pingDiscordRoleIds?: string[] | undefined;
            removeDiscordRoleIds?: string[] | undefined;
        } | undefined;
    }>>;
    /** Zertifikate */
    certificate: z.ZodDefault<z.ZodObject<{
        organisation: z.ZodDefault<z.ZodString>;
        logo: z.ZodDefault<z.ZodString>;
        signature: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        organisation: string;
        logo: string;
        signature: string;
    }, {
        organisation?: string | undefined;
        logo?: string | undefined;
        signature?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    transfer: {
        stages: {
            roleIds: string[];
            id: string;
            name: string;
        }[];
        approvalsRequired: number;
        autoExecute: boolean;
        discordRoles: boolean;
        dashboardRoles: boolean;
        announceChannelId: string | null;
    };
    promotion: {
        stages: {
            roleIds: string[];
            id: string;
            name: string;
        }[];
        approvalsRequired: number;
        requireReason: boolean;
        requireRequirements: boolean;
        autoExecute: boolean;
        discordRoles: boolean;
        dashboardRoles: boolean;
        announceChannelId: string | null;
        announceTemplate: string;
        announceColor: string;
        statusLabels: Partial<Record<"CANCELLED" | "APPROVED" | "REJECTED" | "OPEN" | "IN_REVIEW" | "DEFERRED" | "EXECUTED", {
            label: string;
            emoji: string;
        }>>;
    };
    awards: {
        description: string;
        id: string;
        name: string;
        color: string;
        active: boolean;
        icon: string;
        requirements: string;
        public: boolean;
        discordRoleId: string | null;
    }[];
    sections: Partial<Record<"history" | "awards" | "rank" | "overview" | "promotions" | "trainings" | "exams" | "warnings" | "absences" | "transfers" | "servicenumbers" | "notes", {
        visible: boolean;
        sensitive: boolean;
    }>>;
    fields: Partial<Record<"status" | "rank" | "callsign" | "discordName" | "discordId" | "avatar" | "robloxName" | "robloxId" | "department" | "joinDate" | "serviceNumber", {
        visible: boolean;
        sensitive: boolean;
    }>>;
    warnings: {
        dm: boolean;
        channelId: string | null;
        template: string;
        limit: number;
        atLimit: {
            status: string | null;
            notifyRoleIds: string[];
            pingDiscordRoleIds: string[];
            removeDiscordRoleIds: string[];
        };
    };
    statuses: {
        key: string;
        label: string;
        color: string;
        active: boolean;
        emoji: string;
    }[];
    departments: {
        description: string;
        id: string;
        name: string;
        color: string;
        discordRoleIds: string[];
        dashboardRoleIds: string[];
    }[];
    absenceTypes: {
        key: string;
        label: string;
        emoji: string;
    }[];
    warningSeverities: {
        key: string;
        label: string;
        color: string;
        emoji: string;
        defaultDays: number;
    }[];
    warningCategories: string[];
    showAbsenceInTeam: boolean;
    notifications: Partial<Record<"promotion.requested" | "promotion.approved" | "promotion.rejected" | "promotion.executed" | "transfer.requested" | "transfer.approved" | "transfer.rejected" | "warning.created" | "award.granted" | "training.passed" | "exam.passed", {
        dashboard: boolean;
        dm: boolean;
        roleIds: string[];
        channelId: string | null;
    }>>;
    certificate: {
        organisation: string;
        logo: string;
        signature: string;
    };
}, {
    transfer?: {
        stages?: {
            id: string;
            name: string;
            roleIds?: string[] | undefined;
        }[] | undefined;
        approvalsRequired?: number | undefined;
        autoExecute?: boolean | undefined;
        discordRoles?: boolean | undefined;
        dashboardRoles?: boolean | undefined;
        announceChannelId?: string | null | undefined;
    } | undefined;
    promotion?: {
        stages?: {
            id: string;
            name: string;
            roleIds?: string[] | undefined;
        }[] | undefined;
        approvalsRequired?: number | undefined;
        requireReason?: boolean | undefined;
        requireRequirements?: boolean | undefined;
        autoExecute?: boolean | undefined;
        discordRoles?: boolean | undefined;
        dashboardRoles?: boolean | undefined;
        announceChannelId?: string | null | undefined;
        announceTemplate?: string | undefined;
        announceColor?: string | undefined;
        statusLabels?: Partial<Record<"CANCELLED" | "APPROVED" | "REJECTED" | "OPEN" | "IN_REVIEW" | "DEFERRED" | "EXECUTED", {
            label: string;
            emoji: string;
        }>> | undefined;
    } | undefined;
    awards?: {
        id: string;
        name: string;
        description?: string | undefined;
        color?: string | undefined;
        active?: boolean | undefined;
        icon?: string | undefined;
        requirements?: string | undefined;
        public?: boolean | undefined;
        discordRoleId?: string | null | undefined;
    }[] | undefined;
    sections?: Partial<Record<"history" | "awards" | "rank" | "overview" | "promotions" | "trainings" | "exams" | "warnings" | "absences" | "transfers" | "servicenumbers" | "notes", {
        visible: boolean;
        sensitive: boolean;
    }>> | undefined;
    fields?: Partial<Record<"status" | "rank" | "callsign" | "discordName" | "discordId" | "avatar" | "robloxName" | "robloxId" | "department" | "joinDate" | "serviceNumber", {
        visible: boolean;
        sensitive: boolean;
    }>> | undefined;
    warnings?: {
        dm?: boolean | undefined;
        channelId?: string | null | undefined;
        template?: string | undefined;
        limit?: number | undefined;
        atLimit?: {
            status?: string | null | undefined;
            notifyRoleIds?: string[] | undefined;
            pingDiscordRoleIds?: string[] | undefined;
            removeDiscordRoleIds?: string[] | undefined;
        } | undefined;
    } | undefined;
    statuses?: {
        key: string;
        label: string;
        color?: string | undefined;
        active?: boolean | undefined;
        emoji?: string | undefined;
    }[] | undefined;
    departments?: {
        id: string;
        name: string;
        description?: string | undefined;
        color?: string | undefined;
        discordRoleIds?: string[] | undefined;
        dashboardRoleIds?: string[] | undefined;
    }[] | undefined;
    absenceTypes?: {
        key: string;
        label: string;
        emoji?: string | undefined;
    }[] | undefined;
    warningSeverities?: {
        key: string;
        label: string;
        color?: string | undefined;
        emoji?: string | undefined;
        defaultDays?: number | undefined;
    }[] | undefined;
    warningCategories?: string[] | undefined;
    showAbsenceInTeam?: boolean | undefined;
    notifications?: Partial<Record<"promotion.requested" | "promotion.approved" | "promotion.rejected" | "promotion.executed" | "transfer.requested" | "transfer.approved" | "transfer.rejected" | "warning.created" | "award.granted" | "training.passed" | "exam.passed", {
        dashboard?: boolean | undefined;
        dm?: boolean | undefined;
        roleIds?: string[] | undefined;
        channelId?: string | null | undefined;
    }>> | undefined;
    certificate?: {
        organisation?: string | undefined;
        logo?: string | undefined;
        signature?: string | undefined;
    } | undefined;
}>;
type HrConfig = z.infer<typeof hrConfigSchema>;
declare const DEFAULT_HR_CONFIG: HrConfig;
/** Gespeicherte (evtl. ältere) Einstellungen mit den Standardwerten auffüllen. */
declare function withHrDefaults(v: unknown): HrConfig;
declare const REQUEST_STATUS_DEFAULT: Record<RequestStatus, {
    label: string;
    emoji: string;
}>;
declare const REQUIREMENT_TYPES: readonly ["MIN_DAYS_IN_RANK", "MIN_DUTY_HOURS", "MIN_INCIDENTS", "TRAINING", "EXAM", "DISCORD_ROLE", "RECOMMENDATION", "CUSTOM"];
type RequirementType = (typeof REQUIREMENT_TYPES)[number];
declare const REQUIREMENT_LABEL: Record<RequirementType, string>;
declare const requirementSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["MIN_DAYS_IN_RANK", "MIN_DUTY_HOURS", "MIN_INCIDENTS", "TRAINING", "EXAM", "DISCORD_ROLE", "RECOMMENDATION", "CUSTOM"]>;
    label: z.ZodDefault<z.ZodString>;
    value: z.ZodDefault<z.ZodNumber>;
    ref: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    label: string;
    type: "TRAINING" | "MIN_DAYS_IN_RANK" | "MIN_DUTY_HOURS" | "MIN_INCIDENTS" | "EXAM" | "DISCORD_ROLE" | "RECOMMENDATION" | "CUSTOM";
    value: number;
    id: string;
    ref: string | null;
}, {
    type: "TRAINING" | "MIN_DAYS_IN_RANK" | "MIN_DUTY_HOURS" | "MIN_INCIDENTS" | "EXAM" | "DISCORD_ROLE" | "RECOMMENDATION" | "CUSTOM";
    id: string;
    label?: string | undefined;
    value?: number | undefined;
    ref?: string | null | undefined;
}>;
type Requirement = z.infer<typeof requirementSchema>;
declare const rankSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    icon: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    color: z.ZodDefault<z.ZodString>;
    discordRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    dashboardRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    nextRankIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    approverRankIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    requirements: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<["MIN_DAYS_IN_RANK", "MIN_DUTY_HOURS", "MIN_INCIDENTS", "TRAINING", "EXAM", "DISCORD_ROLE", "RECOMMENDATION", "CUSTOM"]>;
        label: z.ZodDefault<z.ZodString>;
        value: z.ZodDefault<z.ZodNumber>;
        ref: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        type: "TRAINING" | "MIN_DAYS_IN_RANK" | "MIN_DUTY_HOURS" | "MIN_INCIDENTS" | "EXAM" | "DISCORD_ROLE" | "RECOMMENDATION" | "CUSTOM";
        value: number;
        id: string;
        ref: string | null;
    }, {
        type: "TRAINING" | "MIN_DAYS_IN_RANK" | "MIN_DUTY_HOURS" | "MIN_INCIDENTS" | "EXAM" | "DISCORD_ROLE" | "RECOMMENDATION" | "CUSTOM";
        id: string;
        label?: string | undefined;
        value?: number | undefined;
        ref?: string | null | undefined;
    }>, "many">>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    description: string | null;
    name: string;
    color: string;
    active: boolean;
    discordRoleIds: string[];
    dashboardRoleIds: string[];
    icon: string | null;
    requirements: {
        label: string;
        type: "TRAINING" | "MIN_DAYS_IN_RANK" | "MIN_DUTY_HOURS" | "MIN_INCIDENTS" | "EXAM" | "DISCORD_ROLE" | "RECOMMENDATION" | "CUSTOM";
        value: number;
        id: string;
        ref: string | null;
    }[];
    nextRankIds: string[];
    approverRankIds: string[];
    id?: string | undefined;
}, {
    name: string;
    description?: string | null | undefined;
    id?: string | undefined;
    color?: string | undefined;
    active?: boolean | undefined;
    discordRoleIds?: string[] | undefined;
    dashboardRoleIds?: string[] | undefined;
    icon?: string | null | undefined;
    requirements?: {
        type: "TRAINING" | "MIN_DAYS_IN_RANK" | "MIN_DUTY_HOURS" | "MIN_INCIDENTS" | "EXAM" | "DISCORD_ROLE" | "RECOMMENDATION" | "CUSTOM";
        id: string;
        label?: string | undefined;
        value?: number | undefined;
        ref?: string | null | undefined;
    }[] | undefined;
    nextRankIds?: string[] | undefined;
    approverRankIds?: string[] | undefined;
}>;
type RankInput = z.infer<typeof rankSchema>;
interface RequirementResult {
    id: string;
    type: RequirementType;
    label: string;
    met: boolean;
    current: string;
    needed: string;
    manual: boolean;
}
/** Ergebnis der automatischen Prüfung für den nächsten Rang. */
interface PromotionCheck {
    rankId: string;
    rankName: string;
    results: RequirementResult[];
    met: number;
    total: number;
    eligible: boolean;
}
declare const EXAM_QUESTION_TYPES: readonly ["SINGLE", "MULTI", "YESNO", "TEXT", "NUMBER"];
declare const EXAM_QUESTION_TYPE_LABEL: Record<(typeof EXAM_QUESTION_TYPES)[number], string>;
declare const questionSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["SINGLE", "MULTI", "YESNO", "TEXT", "NUMBER"]>;
    text: z.ZodString;
    options: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** richtige Antwort(en): Option-Index als Text, „ja“/„nein“, Zahl oder Stichworte (Freitext → manuell) */
    correct: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    points: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    options: string[];
    type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER";
    text: string;
    id: string;
    correct: string[];
    points: number;
}, {
    type: "YESNO" | "MULTI" | "TEXT" | "SINGLE" | "NUMBER";
    text: string;
    id: string;
    options?: string[] | undefined;
    correct?: string[] | undefined;
    points?: number | undefined;
}>;
type Question = z.infer<typeof questionSchema>;
/** Automatische Auswertung einer Antwort; `null` = muss manuell bewertet werden (Freitext ohne Musterlösung). */
declare function gradeAnswer(q: Question, a: unknown): number | null;
declare const DN_STATUSES: readonly ["ACTIVE", "RESERVED", "FREE", "BLOCKED", "FORMER"];
type DnStatus = (typeof DN_STATUSES)[number];
declare const DN_STATUS_LABEL: Record<DnStatus, {
    label: string;
    emoji: string;
}>;
declare const rangeSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    prefix: z.ZodDefault<z.ZodString>;
    suffix: z.ZodDefault<z.ZodString>;
    start: z.ZodNumber;
    end: z.ZodNumber;
    padLength: z.ZodDefault<z.ZodNumber>;
    order: z.ZodDefault<z.ZodEnum<["LOWEST_FREE", "SEQUENTIAL"]>>;
    autoAssign: z.ZodDefault<z.ZodBoolean>;
    manual: z.ZodDefault<z.ZodBoolean>;
    reuse: z.ZodDefault<z.ZodBoolean>;
    releaseAs: z.ZodDefault<z.ZodEnum<["FREE", "FORMER", "BLOCKED"]>>;
    department: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    active: boolean;
    department: string | null;
    prefix: string;
    suffix: string;
    start: number;
    end: number;
    padLength: number;
    order: "LOWEST_FREE" | "SEQUENTIAL";
    autoAssign: boolean;
    manual: boolean;
    reuse: boolean;
    releaseAs: "FREE" | "BLOCKED" | "FORMER";
}, {
    name: string;
    start: number;
    end: number;
    active?: boolean | undefined;
    department?: string | null | undefined;
    prefix?: string | undefined;
    suffix?: string | undefined;
    padLength?: number | undefined;
    order?: "LOWEST_FREE" | "SEQUENTIAL" | undefined;
    autoAssign?: boolean | undefined;
    manual?: boolean | undefined;
    reuse?: boolean | undefined;
    releaseAs?: "FREE" | "BLOCKED" | "FORMER" | undefined;
}>, {
    name: string;
    active: boolean;
    department: string | null;
    prefix: string;
    suffix: string;
    start: number;
    end: number;
    padLength: number;
    order: "LOWEST_FREE" | "SEQUENTIAL";
    autoAssign: boolean;
    manual: boolean;
    reuse: boolean;
    releaseAs: "FREE" | "BLOCKED" | "FORMER";
}, {
    name: string;
    start: number;
    end: number;
    active?: boolean | undefined;
    department?: string | null | undefined;
    prefix?: string | undefined;
    suffix?: string | undefined;
    padLength?: number | undefined;
    order?: "LOWEST_FREE" | "SEQUENTIAL" | undefined;
    autoAssign?: boolean | undefined;
    manual?: boolean | undefined;
    reuse?: boolean | undefined;
    releaseAs?: "FREE" | "BLOCKED" | "FORMER" | undefined;
}>, {
    name: string;
    active: boolean;
    department: string | null;
    prefix: string;
    suffix: string;
    start: number;
    end: number;
    padLength: number;
    order: "LOWEST_FREE" | "SEQUENTIAL";
    autoAssign: boolean;
    manual: boolean;
    reuse: boolean;
    releaseAs: "FREE" | "BLOCKED" | "FORMER";
}, {
    name: string;
    start: number;
    end: number;
    active?: boolean | undefined;
    department?: string | null | undefined;
    prefix?: string | undefined;
    suffix?: string | undefined;
    padLength?: number | undefined;
    order?: "LOWEST_FREE" | "SEQUENTIAL" | undefined;
    autoAssign?: boolean | undefined;
    manual?: boolean | undefined;
    reuse?: boolean | undefined;
    releaseAs?: "FREE" | "BLOCKED" | "FORMER" | undefined;
}>;
type RangeInput = z.infer<typeof rangeSchema>;
declare const formatServiceNumber: (r: {
    prefix: string;
    suffix: string;
    padLength: number;
}, value: number) => string;
declare const hireMappingSchema: z.ZodObject<{
    /** 'police' = Polizei-Bewerbung, sonst Name der Einheit (Qualifikation) */
    kind: z.ZodString;
    /** Nummernkreis (leer = keine automatische Dienstnummer) */
    rangeId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    department: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    rankId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    /** Personalakte anlegen */
    createProfile: z.ZodDefault<z.ZodBoolean>;
    /** zusätzliche Discord-Rollen */
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    roleIds: string[];
    kind: string;
    department: string | null;
    rangeId: string | null;
    rankId: string | null;
    createProfile: boolean;
}, {
    kind: string;
    roleIds?: string[] | undefined;
    department?: string | null | undefined;
    rangeId?: string | null | undefined;
    rankId?: string | null | undefined;
    createProfile?: boolean | undefined;
}>;
declare const dnSettingsSchema: z.ZodObject<{
    /** ACCEPT: direkt bei Annahme · COMPLETE: wenn die Person im Discord verknüpft/erreichbar ist (Einstellung abgeschlossen) · MANUAL: Bestätigung durch berechtigte Person */
    timing: z.ZodDefault<z.ZodEnum<["ACCEPT", "COMPLETE", "MANUAL"]>>;
    mappings: z.ZodDefault<z.ZodArray<z.ZodObject<{
        /** 'police' = Polizei-Bewerbung, sonst Name der Einheit (Qualifikation) */
        kind: z.ZodString;
        /** Nummernkreis (leer = keine automatische Dienstnummer) */
        rangeId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        department: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        rankId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        /** Personalakte anlegen */
        createProfile: z.ZodDefault<z.ZodBoolean>;
        /** zusätzliche Discord-Rollen */
        roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        roleIds: string[];
        kind: string;
        department: string | null;
        rangeId: string | null;
        rankId: string | null;
        createProfile: boolean;
    }, {
        kind: string;
        roleIds?: string[] | undefined;
        department?: string | null | undefined;
        rangeId?: string | null | undefined;
        rankId?: string | null | undefined;
        createProfile?: boolean | undefined;
    }>, "many">>;
    nickname: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        format: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        format: string;
    }, {
        enabled?: boolean | undefined;
        format?: string | undefined;
    }>>;
    dm: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        title: z.ZodDefault<z.ZodString>;
        template: z.ZodDefault<z.ZodString>;
        color: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        color: string;
        template: string;
        enabled: boolean;
    }, {
        title?: string | undefined;
        color?: string | undefined;
        template?: string | undefined;
        enabled?: boolean | undefined;
    }>>;
    rankRoles: z.ZodDefault<z.ZodBoolean>;
    departmentRoles: z.ZodDefault<z.ZodBoolean>;
    /** Wechsel der Nummer braucht eine zweite Person (Genehmiger) */
    changeNeedsApprover: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    dm: {
        title: string;
        color: string;
        template: string;
        enabled: boolean;
    };
    timing: "MANUAL" | "ACCEPT" | "COMPLETE";
    mappings: {
        roleIds: string[];
        kind: string;
        department: string | null;
        rangeId: string | null;
        rankId: string | null;
        createProfile: boolean;
    }[];
    nickname: {
        enabled: boolean;
        format: string;
    };
    rankRoles: boolean;
    departmentRoles: boolean;
    changeNeedsApprover: boolean;
}, {
    dm?: {
        title?: string | undefined;
        color?: string | undefined;
        template?: string | undefined;
        enabled?: boolean | undefined;
    } | undefined;
    timing?: "MANUAL" | "ACCEPT" | "COMPLETE" | undefined;
    mappings?: {
        kind: string;
        roleIds?: string[] | undefined;
        department?: string | null | undefined;
        rangeId?: string | null | undefined;
        rankId?: string | null | undefined;
        createProfile?: boolean | undefined;
    }[] | undefined;
    nickname?: {
        enabled?: boolean | undefined;
        format?: string | undefined;
    } | undefined;
    rankRoles?: boolean | undefined;
    departmentRoles?: boolean | undefined;
    changeNeedsApprover?: boolean | undefined;
}>;
type DnSettings = z.infer<typeof dnSettingsSchema>;
/** Platzhalter für die Verwarnungs-Meldung. */
declare const WARNING_VARIABLES: readonly ["{mitglied}", "{name}", "{grund}", "{schweregrad}", "{kategorie}", "{anzahl}", "{grenze}", "{durch}", "{datum}", "{ablauf}"];
declare const DN_VARIABLES: readonly ["{user}", "{name}", "{dienstnummer}", "{rang}", "{abteilung}", "{bewerbung}", "{datum}"];
/** Platzhalter füllen (DM, Nickname, Ankündigungen). Unbekannte Platzhalter bleiben stehen. */
declare function fillTemplate(tpl: string, vars: Record<string, string | null | undefined>): string;

/**
 * Logging (wie bei Xenon/Dyno): jede protokollierte Aktion im System kann in einen Discord-Kanal gemeldet werden –
 * je Kategorie ein Kanal, einzelne Typen mit eigenem Kanal oder ausgeschaltet. Im Dashboard steht alles im Audit-Log.
 */
declare const LOG_CATEGORIES: readonly [{
    readonly key: "einsaetze";
    readonly label: "Einsätze & Leitstelle";
    readonly emoji: "🚨";
    readonly modules: readonly ["cad", "dispatch", "incidents", "erlc", "radio"];
}, {
    readonly key: "akten";
    readonly label: "Akten & Ermittlungen";
    readonly emoji: "🗂️";
    readonly modules: readonly ["persons", "vehicles", "weapons", "wanted", "investigations", "evidence", "reports", "tickets", "complaints"];
}, {
    readonly key: "bewerbungen";
    readonly label: "Bewerbungen & Qualifikationen";
    readonly emoji: "📋";
    readonly modules: readonly ["applications", "qualifications"];
}, {
    readonly key: "personal";
    readonly label: "Personal & Ausbildung";
    readonly emoji: "👮";
    readonly modules: readonly ["personnel", "promotion", "dienstnummer", "training", "exam", "academy", "sek"];
}, {
    readonly key: "dienst";
    readonly label: "Dienst, Abmeldungen & Berichte";
    readonly emoji: "🕒";
    readonly modules: readonly ["team", "dutyreports", "leave"];
}, {
    readonly key: "kommunikation";
    readonly label: "Kommunikation & Discord";
    readonly emoji: "💬";
    readonly modules: readonly ["announcements", "polls", "communication", "discord"];
}, {
    readonly key: "rechte";
    readonly label: "Rechte, Konten & Anmeldung";
    readonly emoji: "🔐";
    readonly modules: readonly ["permissions", "users", "auth"];
}, {
    readonly key: "einstellungen";
    readonly label: "Einstellungen & System";
    readonly emoji: "⚙️";
    readonly modules: readonly ["settings", "studio", "teamchance", "media", "locks", "export"];
}];
type LogCategoryKey = (typeof LOG_CATEGORIES)[number]['key'] | 'sonstiges';
declare const logCategoryOf: (module: string) => LogCategoryKey;
/** Bekannte Aktionen → Bereich (aus den Audit-Einträgen der API; weitere kommen aus dem Audit-Log dazu). */
declare const LOG_TYPES: Record<string, string>;
/** Standardmäßig aus (würden den Kanal fluten). */
declare const LOG_DEFAULT_OFF: Set<string>;
/** Lesbarer Name einer Aktion, z. B. „cad.incident.create“ → „Einsatz angelegt“. */
declare function logTypeLabel(action: string): string;
declare const loggingConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    /** Kanal je Kategorie */
    categories: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    /** Abweichung je Typ: eigener Kanal oder 'off' (aus); fehlt = Kanal der Kategorie */
    types: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodLiteral<"off">, z.ZodLiteral<"on">]>>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    categories: Record<string, string>;
    types: Record<string, string>;
}, {
    enabled?: boolean | undefined;
    categories?: Record<string, string> | undefined;
    types?: Record<string, string> | undefined;
}>;
type LoggingConfig = z.infer<typeof loggingConfigSchema>;
/** Kanal für eine Aktion (oder null = nicht melden). */
declare function logChannelFor(cfg: LoggingConfig, module: string, action: string): string | null;

/** Rechte-Überschreibung eines Kanals: `id` = Rolle (im Backup) oder Mitglied. */
interface BackupOverwrite {
    id: string;
    type: 'role' | 'member';
    allow: string;
    deny: string;
}
interface BackupRole {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    mentionable: boolean;
    permissions: string;
    position: number;
}
/** `type`: text | voice | category | announcement | stage | forum */
interface BackupChannel {
    id: string;
    name: string;
    type: 'text' | 'voice' | 'category' | 'announcement' | 'stage' | 'forum';
    parentId: string | null;
    position: number;
    topic?: string | null;
    nsfw?: boolean;
    rateLimitPerUser?: number;
    bitrate?: number;
    userLimit?: number;
    overwrites: BackupOverwrite[];
}
interface BackupSettings {
    name: string;
    verificationLevel: number;
    defaultMessageNotifications: number;
    explicitContentFilter: number;
    afkChannelId: string | null;
    afkTimeout: number;
    systemChannelId: string | null;
}
/** Inhalt eines Discord-Server-Backups. */
interface DiscordBackupData {
    version: 1;
    guildId: string;
    everyonePermissions: string;
    roles: BackupRole[];
    channels: BackupChannel[];
    settings: BackupSettings;
}
declare const BACKUP_PARTS: readonly ["roles", "channels", "settings"];
type BackupPart = (typeof BACKUP_PARTS)[number];
declare const BACKUP_PART_LABEL: Record<BackupPart, string>;
/** Ergebnis einer Wiederherstellung (vom Bot gemeldet). */
interface BackupRestoreResult {
    created: number;
    updated: number;
    failed: number;
    errors: string[];
    parts: BackupPart[];
    at: string;
}
declare const backupConfigSchema: z.ZodObject<{
    /** Dashboard-Daten täglich automatisch sichern */
    dataAuto: z.ZodDefault<z.ZodBoolean>;
    /** Discord-Server täglich automatisch sichern */
    discordAuto: z.ZodDefault<z.ZodBoolean>;
    /** so viele automatische Backups behalten (je Art bzw. Server) */
    keep: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    dataAuto: boolean;
    discordAuto: boolean;
    keep: number;
}, {
    dataAuto?: boolean | undefined;
    discordAuto?: boolean | undefined;
    keep?: number | undefined;
}>;
type BackupConfig = z.infer<typeof backupConfigSchema>;

declare const mdtConfigSchema: z.ZodObject<{
    licenses: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
    }, {
        key: string;
        label: string;
    }>, "many">, {
        key: string;
        label: string;
    }[], {
        key: string;
        label: string;
    }[]>;
    flags: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
    } & {
        tone: z.ZodEnum<["danger", "warning", "info", "neutral"]>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        tone: "warning" | "danger" | "info" | "neutral";
    }, {
        key: string;
        label: string;
        tone: "warning" | "danger" | "info" | "neutral";
    }>, "many">, {
        key: string;
        label: string;
        tone: "warning" | "danger" | "info" | "neutral";
    }[], {
        key: string;
        label: string;
        tone: "warning" | "danger" | "info" | "neutral";
    }[]>;
    weaponTypes: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
    }, {
        key: string;
        label: string;
    }>, "many">, {
        key: string;
        label: string;
    }[], {
        key: string;
        label: string;
    }[]>;
    genders: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    licenses: {
        key: string;
        label: string;
    }[];
    flags: {
        key: string;
        label: string;
        tone: "warning" | "danger" | "info" | "neutral";
    }[];
    weaponTypes: {
        key: string;
        label: string;
    }[];
    genders: string[];
}, {
    licenses: {
        key: string;
        label: string;
    }[];
    flags: {
        key: string;
        label: string;
        tone: "warning" | "danger" | "info" | "neutral";
    }[];
    weaponTypes: {
        key: string;
        label: string;
    }[];
    genders: string[];
}>;
type MdtConfig = z.infer<typeof mdtConfigSchema>;
declare const DEFAULT_MDT_CONFIG: MdtConfig;
/** Status eines registrierten Gegenstands im Waffenregister. */
declare const WEAPON_STATUSES: readonly [{
    readonly key: "REGISTERED";
    readonly label: "Registriert";
    readonly tone: "success";
}, {
    readonly key: "STOLEN";
    readonly label: "Gestohlen";
    readonly tone: "danger";
}, {
    readonly key: "SEIZED";
    readonly label: "Beschlagnahmt";
    readonly tone: "warning";
}, {
    readonly key: "DESTROYED";
    readonly label: "Vernichtet";
    readonly tone: "neutral";
}];
type WeaponStatus = (typeof WEAPON_STATUSES)[number]['key'];
declare const WEAPON_STATUS_KEYS: [WeaponStatus, ...WeaponStatus[]];
/** Personalien einer Person im MDT (alle optional; Datum als YYYY-MM-DD). */
declare const personDetailsSchema: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    dateOfBirth: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    gender: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    job: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nationality: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    appearance: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        skinTone: z.ZodOptional<z.ZodString>;
        hairColor: z.ZodOptional<z.ZodString>;
        eyeColor: z.ZodOptional<z.ZodString>;
        height: z.ZodOptional<z.ZodString>;
        features: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        skinTone?: string | undefined;
        hairColor?: string | undefined;
        eyeColor?: string | undefined;
        height?: string | undefined;
        features?: string | undefined;
    }, {
        skinTone?: string | undefined;
        hairColor?: string | undefined;
        eyeColor?: string | undefined;
        height?: string | undefined;
        features?: string | undefined;
    }>>>;
    licenses: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    flags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    licenses?: string[] | undefined;
    flags?: string[] | undefined;
    fullName?: string | null | undefined;
    dateOfBirth?: string | null | undefined;
    gender?: string | null | undefined;
    phone?: string | null | undefined;
    job?: string | null | undefined;
    nationality?: string | null | undefined;
    address?: string | null | undefined;
    appearance?: {
        skinTone?: string | undefined;
        hairColor?: string | undefined;
        eyeColor?: string | undefined;
        height?: string | undefined;
        features?: string | undefined;
    } | null | undefined;
}, {
    licenses?: string[] | undefined;
    flags?: string[] | undefined;
    fullName?: string | null | undefined;
    dateOfBirth?: string | null | undefined;
    gender?: string | null | undefined;
    phone?: string | null | undefined;
    job?: string | null | undefined;
    nationality?: string | null | undefined;
    address?: string | null | undefined;
    appearance?: {
        skinTone?: string | undefined;
        hairColor?: string | undefined;
        eyeColor?: string | undefined;
        height?: string | undefined;
        features?: string | undefined;
    } | null | undefined;
}>;
type PersonDetails = z.infer<typeof personDetailsSchema>;
/** Alter in Jahren aus YYYY-MM-DD (oder null). */
declare function ageOf(dob: string | null | undefined, now?: Date): number | null;

export { ALL_PERMISSIONS, APPLICATION_STATUSES, APPLICATION_TRANSITIONS, APPLICATION_VARIABLES, AREA_PERMISSIONS, type AnswerCheck, type ApplicationStatus, type ApplicationVars, BACKUP_PARTS, BACKUP_PART_LABEL, type BackupChannel, type BackupConfig, type BackupOverwrite, type BackupPart, type BackupRestoreResult, type BackupRole, type BackupSettings, type ButtonStyleName, CAD_EVENTS, CAD_EVENT_LABELS, CAD_EVENT_SEND_TYPE, CAD_FEEDBACK, CAD_FEEDBACK_KEYS, CAD_LINK_ACTIONS, CAD_LINK_LABELS, CAD_LINK_SEND_TYPES, CAD_WIDGETS, CAD_WIDGET_LABELS, CLAIM_MODES, CLOSE_REASON_MODES, CLOSE_REASON_SOURCES, COMPLAINT_STATUSES, COMPLAINT_TRANSITIONS, type CadConfig, type CadEvent, type CadFeedbackKey, type CadField, type CadLayer, type CadMapConfig, type CadMarkerStyle, type CadOption, type CadRoute, type CadStatusOption, type CadUnitType, type ClaimMode, type CloseReasonMode, type CloseReasonSource, type ComplaintStatus, type ComponentButton, type ComponentSelect, DEFAULT_APPLICATION_MESSAGES, DEFAULT_CAD_CONFIG, DEFAULT_DANGER_CONFIG, DEFAULT_HR_CONFIG, DEFAULT_MDT_CONFIG, DEFAULT_VERIFY_CONFIG, DEFAULT_WELCOME_CONFIG, DISPATCH_STATUSES, DISPATCH_TRANSITIONS, DN_STATUSES, DN_STATUS_LABEL, DN_VARIABLES, DUTY_STATUSES, type DangerConfig, type DangerLevelDef, type DiscordBackupData, type DispatchStatus, type DnSettings, type DnStatus, type DutySpan, type DutyStatus, ERLC_BUILTIN_MAP, ERLC_DEFAULT_BLOCKED, ERLC_DEFAULT_CRITICAL, ERLC_FEATURES, ERLC_FEATURE_LABELS, ERLC_MAP_SIZE, ERLC_POLL_OPTIONS, ERLC_STATUSES, ERLC_STATUS_LABEL, EVIDENCE_CUSTODY_STATES, EVIDENCE_TRANSITIONS, EXAM_QUESTION_TYPES, EXAM_QUESTION_TYPE_LABEL, type Effect, type EmbedSpec, type ErlcFeature, type ErlcStatus, type EvidenceCustodyState, FORM_PANEL_VARIABLES, FORM_QUESTION_TYPES, type Field, type FormField, type FormOption, type FormPanel, type FormQuestionType, HR_EVENTS, HR_EVENT_LABEL, type HrConfig, type HrEvent, INVESTIGATION_STATUSES, INVESTIGATION_TRANSITIONS, type InfoOption, type InfoPanel, InvalidTransitionError, type InvestigationStatus, LEGACY_DANGER, LOG_CATEGORIES, LOG_DEFAULT_OFF, LOG_TYPES, type LogCategoryKey, type LoggingConfig, MAX_FORM_OPTIONS, MAX_FORM_QUESTIONS, MUSIC_TRACKS, type MdtConfig, type MessageSpec, PERIOD_LABEL, PERMISSION_CATALOG, PRIORITIES, PRIORITY_LABEL, PROFILE_FIELDS, PROFILE_FIELD_LABEL, PROFILE_SECTIONS, PROFILE_SECTION_LABEL, type PermissionContext, type PermissionGrant, type PermissionKey, type PersonDetails, type Priority, type ProfileSection, type PromotionCheck, QUESTION_TYPES, type Question, type QuestionType, REPORT_FIELD_TYPES, REPORT_STATUSES, REPORT_STATUS_LABEL, REPORT_TRANSITIONS, REPORT_TYPES, REQUEST_STATUSES, REQUEST_STATUS_DEFAULT, REQUIREMENT_LABEL, REQUIREMENT_TYPES, ROBLOX_NAME, ROBLOX_VERIFICATION_STATUSES, type RangeInput, type RankInput, type ReportField, type ReportStatus, type ReportTemplate, type ReportType, type ReportView, type RequestStatus, type Requirement, type RequirementResult, type RequirementType, type Resolution, type ResolutionSource, type RobloxVerificationStatus, STATUS_KINDS, STATUS_LABEL, type StaffList, type StaffMember, type StatusKind, type SupportTime, TICKET_ACTIONS, TICKET_ACTION_KEYS, TICKET_PLACEHOLDERS, TICKET_STATUSES, TICKET_TRANSITIONS, type TicketAction, type TicketButtonConfig, type TicketEffect, type TicketQuestion, type TicketStatus, type TicketVars, type TransitionMap, UNIT_STATUSES, type UnitStatus, VERIFY_NICK_VARS, VOICE_CASE_STATUS, type VerifyBind, type VerifyConfig, type VerifyNickVars, type VerifyPanel, type VoiceSupportRoom, WANTED_STATUSES, WANTED_TRANSITIONS, WARNING_VARIABLES, WEAPON_STATUSES, WEAPON_STATUS_KEYS, WEEKDAYS, WELCOME_VARIABLES, WORKFLOW_ACTION_LABELS, WORKFLOW_OPS, WORKFLOW_OP_LABELS, WORKFLOW_TRIGGERS, type WantedStatus, type WeaponStatus, type WelcomeConfig, type WelcomeMember, type WelcomeMessageDef, type WorkflowAction, type WorkflowCondition, type WorkflowOp, type WorkflowTrigger, absenceTypeSchema, accountAge, ageOf, areaGrantsFor, assertTransition, awardDefSchema, backupConfigSchema, can, canDelegate, canTransition, checkAnswer, cleanReportValues, conditionMatches, dangerLevelOf, defaultTicketButtons, departmentSchema, dnSettingsSchema, dutyTimeText, effectivePermissions, fieldValue, fillTemplate, formPanelMessage, formPanelResult, formPanelSchema, formatMinutes, formatServiceNumber, freeFieldKey, gameToPixel, gradeAnswer, grantMatches, hexColor, hireMappingSchema, hrConfigSchema, hrStatusSchema, infoOptionEmbed, infoOptionSchema, infoPanelMessage, infoPanelSchema, isDutyTimeField, isInputQuestion, isPermissionKey, isSupportOpen, isValidRobloxUserId, isoWeek, localTime, logCategoryOf, logChannelFor, logTypeLabel, loggingConfigSchema, matchingBinds, mdtConfigSchema, newVoiceRoom, normalizeField, notifyRuleSchema, panelFieldSchema, parsePlayer, periodEnd, periodLabel, periodStart, personDetailsSchema, pixelToGame, questionSchema, rangeSchema, rankSchema, renderApplicationText, renderPanelTemplate, renderStaffList, renderTemplate, renderTicketText, renderVerifyNickname, renderWelcomeText, reportFieldSchema, reportMessage, reportTemplateSchema, requestStatusDefSchema, requirementSchema, resolvePermission, rolesMatch, severitySchema, staffListSchema, staffSectionSchema, stageSchema, statusLabel, ticketChannelName, ticketNumber, triggerMatches, verifyActions, withHrDefaults };
