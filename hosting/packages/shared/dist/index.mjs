// src/permissions.ts
var PERMISSION_CATALOG = {
  /** `dashboard.<bereich>.view`: Sichtbarkeit ganzer Bereiche im Menü und auf der Startseite (zusätzlich zur Modul-Permission). */
  dashboard: ["view", "customize", "tickets.view", "applications.view", "team.view", "offices.view", "voice.view", "radio.view", "teamchance.view", "logs.view", "settings.view", "cad.view"],
  team: ["view", "manage"],
  dispatch: ["view", "create", "edit", "assign", "close", "manage"],
  /** CAD-Leitstelle + ER:LC-Integration (deny-by-default; kritische ER:LC-Befehle brauchen ein eigenes Recht). */
  cad: ["view", "create_incident", "edit_incident", "close_incident", "assign_unit", "manage_units", "view_persons", "view_vehicles", "manage_map", "view_erlc", "manage_erlc", "erlc_command", "erlc_command_critical", "manage_cross_server", "view_logs", "manage_settings", "radio", "handover", "view_stats"],
  incidents: ["view", "create", "edit", "close", "delete"],
  persons: ["view", "create", "edit", "archive", "merge"],
  vehicles: ["view", "create", "edit", "archive"],
  reports: ["view", "create", "edit", "submit", "review", "approve", "reject", "archive"],
  tickets: ["view", "create", "edit", "void"],
  complaints: ["view", "create", "assign", "investigate", "resolve", "close"],
  investigations: ["view", "create", "edit", "close"],
  wanted: ["view", "create", "edit", "activate", "clear"],
  evidence: ["view", "create", "transfer", "release"],
  /** view_sensitive: geschützte Daten (Verwarnungen, interne Notizen, Abwesenheitsgründe, Historie) */
  personnel: ["view", "view_sensitive", "create", "edit", "delete", "promote", "discipline"],
  /** Beförderungssystem */
  promotion: ["view", "create", "edit", "review", "approve", "reject", "execute", "manage_ranks", "manage_requirements", "view_history", "manage_settings", "manage"],
  /** Versetzungen zwischen Abteilungen */
  transfer: ["view", "create", "approve", "reject"],
  /** Ausbildungen und Zertifikate */
  training: ["view", "create", "manage"],
  /** Prüfungen */
  exam: ["view", "create", "manage", "grade"],
  warning: ["view", "create", "manage"],
  awards: ["view", "create", "manage"],
  /** Interne Meldungen mit Lesebestätigung */
  announcements: ["view", "create", "manage"],
  /** Interne Abstimmungen */
  polls: ["view", "create", "manage"],
  /** Dienstnummern-System */
  dienstnummer: ["view", "create", "assign", "edit", "release", "block", "history", "manage_ranges", "manage_settings"],
  leave: ["view", "request", "manage"],
  applications: ["view", "review", "decide", "auto_assign_dienstnummer"],
  academy: ["view", "manage"],
  sek: ["view", "report", "manage"],
  qualifications: ["view", "decide", "manage"],
  ticket: ["view", "create", "claim", "close", "reopen", "delete", "add_user", "remove_user", "change_status", "change_priority", "change_category", "rename", "move", "lock", "escalate", "transcript", "transcript_delete", "internal_notes", "rate", "manage", "settings"],
  /** Funk-Codes (Liste der Funkcodes, z. B. 10-4) */
  radio: ["view", "manage"],
  /** Team-Chance: Bewerbungsphase für das Team öffnen/schließen */
  teamchance: ["view", "manage"],
  /** Tages-/Wochenberichte nach Vorlagen (Dashboard + Discord) */
  dutyreports: ["view", "create", "view_all", "edit_all", "review", "manage"],
  communication: ["view", "send", "moderate"],
  analytics: ["view"],
  audit: ["view", "export"],
  studio: ["view", "manage"],
  settings: ["view", "manage"],
  users: ["view", "manage"],
  roles: ["view", "manage"]
};
var ALL_PERMISSIONS = Object.entries(PERMISSION_CATALOG).flatMap(
  ([module, actions]) => actions.map((a) => `${module}.${a}`)
);
var PERMISSION_SET = new Set(ALL_PERMISSIONS);
var isPermissionKey = (v) => PERMISSION_SET.has(v);
function resolvePermission(ctx, permission) {
  const matches = (g) => grantMatches(g.permission, permission);
  const user = ctx.userOverrides.filter(matches);
  if (user.some((g) => g.effect === "DENY")) return { allowed: false, source: "USER_DENY" };
  if (user.some((g) => g.effect === "ALLOW")) return { allowed: true, source: "USER_ALLOW" };
  const role = ctx.roleGrants.filter(matches);
  if (role.some((g) => g.effect === "DENY")) return { allowed: false, source: "ROLE_DENY" };
  if (role.some((g) => g.effect === "ALLOW")) return { allowed: true, source: "ROLE_ALLOW" };
  return { allowed: false, source: "DEFAULT_DENY" };
}
function grantMatches(grant, permission) {
  if (grant === permission || grant === "*") return true;
  if (grant.endsWith(".*")) return permission.startsWith(grant.slice(0, -1));
  return false;
}
var can = (ctx, permission) => resolvePermission(ctx, permission).allowed;
function effectivePermissions(ctx) {
  return ALL_PERMISSIONS.filter((p) => can(ctx, p));
}
var AREA_PERMISSIONS = {
  "dashboard.tickets.view": ["ticket.view"],
  "dashboard.applications.view": ["applications.view"],
  "dashboard.team.view": ["team.view"],
  "dashboard.offices.view": ["team.view"],
  "dashboard.voice.view": ["team.view"],
  "dashboard.radio.view": ["radio.view"],
  "dashboard.teamchance.view": ["teamchance.view"],
  "dashboard.logs.view": ["audit.view"],
  "dashboard.settings.view": ["settings.view", "roles.view", "users.view", "studio.view"],
  "dashboard.cad.view": ["cad.view"]
};
function areaGrantsFor(grants) {
  return Object.entries(AREA_PERMISSIONS).filter(([, bases]) => bases.some((b) => grants.some((g) => grantMatches(g, b)))).map(([area]) => area);
}
function canDelegate(holder, grant) {
  const covered = ALL_PERMISSIONS.filter((p) => grantMatches(grant, p));
  if (!covered.length) return can(holder, grant);
  return covered.every((p) => can(holder, p)) && (grant !== "*" || can(holder, "*"));
}

// src/statuses.ts
var DISPATCH_STATUSES = ["NEW", "ACKNOWLEDGED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "PROCESSING", "CLEARING", "CLOSED", "CANCELLED"];
var DISPATCH_TRANSITIONS = {
  NEW: ["ACKNOWLEDGED", "ASSIGNED", "CANCELLED"],
  ACKNOWLEDGED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["EN_ROUTE", "ACKNOWLEDGED", "CANCELLED"],
  EN_ROUTE: ["ON_SCENE", "ASSIGNED", "CANCELLED"],
  ON_SCENE: ["PROCESSING", "CLEARING", "CANCELLED"],
  PROCESSING: ["CLEARING", "ON_SCENE"],
  CLEARING: ["CLOSED", "PROCESSING"],
  CLOSED: [],
  CANCELLED: []
};
var PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"];
var UNIT_STATUSES = ["AVAILABLE", "BUSY", "EN_ROUTE", "ON_SCENE", "UNAVAILABLE", "OFF_DUTY"];
var DUTY_STATUSES = ["OFF_DUTY", "ON_DUTY", "BREAK", "TRAINING", "ADMINISTRATIVE"];
var REPORT_TYPES = ["INCIDENT", "PATROL", "TRAFFIC", "ARREST", "CITATION", "COLLISION", "INVESTIGATION", "GENERAL"];
var REPORT_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"];
var REPORT_TRANSITIONS = {
  DRAFT: ["SUBMITTED", "ARCHIVED"],
  SUBMITTED: ["UNDER_REVIEW", "DRAFT"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["ARCHIVED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: []
};
var TICKET_STATUSES = ["ISSUED", "PAID", "VOID"];
var TICKET_TRANSITIONS = { ISSUED: ["PAID", "VOID"], PAID: [], VOID: [] };
var COMPLAINT_STATUSES = ["RECEIVED", "SCREENING", "ASSIGNED", "INVESTIGATION", "REVIEW", "RESOLVED", "CLOSED"];
var COMPLAINT_TRANSITIONS = {
  RECEIVED: ["SCREENING"],
  SCREENING: ["ASSIGNED", "CLOSED"],
  ASSIGNED: ["INVESTIGATION"],
  INVESTIGATION: ["REVIEW"],
  REVIEW: ["RESOLVED", "INVESTIGATION"],
  RESOLVED: ["CLOSED"],
  CLOSED: []
};
var INVESTIGATION_STATUSES = ["OPEN", "ACTIVE", "SUSPENDED", "CLOSED", "ARCHIVED"];
var INVESTIGATION_TRANSITIONS = {
  OPEN: ["ACTIVE", "CLOSED"],
  ACTIVE: ["SUSPENDED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "CLOSED"],
  CLOSED: ["ARCHIVED", "ACTIVE"],
  ARCHIVED: []
};
var WANTED_STATUSES = ["ACTIVE", "CLEARED", "CANCELLED", "EXPIRED", "ARCHIVED"];
var WANTED_TRANSITIONS = {
  ACTIVE: ["CLEARED", "CANCELLED", "EXPIRED"],
  CLEARED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  EXPIRED: ["ARCHIVED", "ACTIVE"],
  ARCHIVED: []
};
var EVIDENCE_CUSTODY_STATES = ["COLLECTED", "STORED", "TRANSFERRED", "REVIEWED", "RELEASED", "ARCHIVED"];
var EVIDENCE_TRANSITIONS = {
  COLLECTED: ["STORED", "TRANSFERRED"],
  STORED: ["TRANSFERRED", "REVIEWED", "RELEASED", "ARCHIVED"],
  TRANSFERRED: ["STORED", "REVIEWED", "RELEASED"],
  REVIEWED: ["STORED", "TRANSFERRED", "RELEASED", "ARCHIVED"],
  RELEASED: ["ARCHIVED"],
  ARCHIVED: []
};
var APPLICATION_STATUSES = ["SUBMITTED", "SCREENING", "INTERVIEW", "PENDING_DECISION", "ACCEPTED", "REJECTED", "WITHDRAWN"];
var APPLICATION_TRANSITIONS = {
  SUBMITTED: ["SCREENING", "WITHDRAWN", "REJECTED"],
  SCREENING: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["PENDING_DECISION", "REJECTED", "WITHDRAWN"],
  PENDING_DECISION: ["ACCEPTED", "REJECTED", "WITHDRAWN"],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: []
};
var ROBLOX_VERIFICATION_STATUSES = ["UNVERIFIED", "VERIFIED", "FAILED", "MANUAL"];
var InvalidTransitionError = class extends Error {
  constructor(from, to) {
    super(`Invalid status transition ${from} -> ${to}`);
    this.from = from;
    this.to = to;
    this.name = "InvalidTransitionError";
  }
  from;
  to;
};
var canTransition = (map, from, to) => map[from].includes(to);
function assertTransition(map, from, to) {
  if (!canTransition(map, from, to)) throw new InvalidTransitionError(from, to);
}

// src/roblox.ts
var isValidRobloxUserId = (v) => /^[1-9]\d{0,17}$/.test(v);

// src/tickets.ts
var TICKET_ACTIONS = {
  close: { label: "Schlie\xDFen", emoji: "\u{1F512}", style: "danger", state: "open", permission: "ticket.close" },
  /** Team fragt den Ersteller, ob das Ticket geschlossen werden kann (wie GalaxyBot „Close-Request“). */
  close_request: { label: "Schlie\xDFen anfragen", emoji: "\u2753", style: "secondary", state: "open", permission: "ticket.close" },
  reopen: { label: "Wieder \xF6ffnen", emoji: "\u{1F513}", style: "success", state: "closed", permission: "ticket.reopen" },
  claim: { label: "\xDCbernehmen", emoji: "\u{1F464}", style: "primary", state: "open", permission: "ticket.claim" },
  unclaim: { label: "Freigeben", emoji: "\u21A9\uFE0F", style: "secondary", state: "open", permission: "ticket.claim" },
  add_user: { label: "Hinzuf\xFCgen", emoji: "\u2795", style: "secondary", state: "open", permission: "ticket.add_user" },
  remove_user: { label: "Entfernen", emoji: "\u2796", style: "secondary", state: "open", permission: "ticket.remove_user" },
  priority: { label: "Priorit\xE4t", emoji: "\u{1F514}", style: "secondary", state: "open", permission: "ticket.change_priority" },
  status: { label: "Status", emoji: "\u{1F3F7}\uFE0F", style: "secondary", state: "open", permission: "ticket.change_status" },
  category: { label: "Kategorie", emoji: "\u{1F5C2}\uFE0F", style: "secondary", state: "open", permission: "ticket.change_category" },
  rename: { label: "Umbenennen", emoji: "\u270F\uFE0F", style: "secondary", state: "open", permission: "ticket.rename" },
  move: { label: "Verschieben", emoji: "\u{1F4C1}", style: "secondary", state: "both", permission: "ticket.move" },
  transcript: { label: "Transcript", emoji: "\u{1F4CB}", style: "secondary", state: "both", permission: "ticket.transcript" },
  lock: { label: "Sperren", emoji: "\u26D4", style: "secondary", state: "open", permission: "ticket.lock" },
  unlock: { label: "Entsperren", emoji: "\u2705", style: "secondary", state: "open", permission: "ticket.lock" },
  escalate: { label: "Eskalieren", emoji: "\u{1F7E0}", style: "danger", state: "open", permission: "ticket.escalate" },
  note: { label: "Notiz", emoji: "\u{1F5D2}\uFE0F", style: "secondary", state: "both", permission: "ticket.internal_notes" },
  rating: { label: "Bewertung", emoji: "\u2B50", style: "secondary", state: "closed", permission: "ticket.rate" },
  delete: { label: "L\xF6schen", emoji: "\u{1F5D1}\uFE0F", style: "danger", state: "closed", permission: "ticket.delete" }
};
var TICKET_ACTION_KEYS = Object.keys(TICKET_ACTIONS);
var defaultTicketButtons = () => ["close", "close_request", "claim", "unclaim", "add_user", "remove_user", "priority", "transcript", "escalate", "note", "reopen", "delete"].map((action) => ({ action, label: TICKET_ACTIONS[action].label, emoji: TICKET_ACTIONS[action].emoji, style: TICKET_ACTIONS[action].style, enabled: true }));
var QUESTION_TYPES = { SHORT: "Kurze Antwort", LONG: "Lange Antwort", YESNO: "Ja/Nein", SELECT: "Auswahl", MULTI: "Mehrere Optionen" };
var CLAIM_MODES = { SINGLE: "Nur ein Bearbeiter", MULTI: "Mehrere Bearbeiter", PRIMARY: "Hauptbearbeiter + Helfer" };
var CLOSE_REASON_MODES = { NONE: "Kein Grund", OPTIONAL: "Grund optional", REQUIRED: "Grund erforderlich" };
var CLOSE_REASON_SOURCES = { PRESET: "Feste Gr\xFCnde", CUSTOM: "Eigener Grund", BOTH: "Beides" };
var STATUS_KINDS = { OPEN: "Offen (aktiv)", CLOSED: "Geschlossen", ARCHIVED: "Archiviert" };
var TICKET_PLACEHOLDERS = {
  "{user}": "Erw\xE4hnung des Ticket-Erstellers (@User)",
  "{username}": "Discord-Name des Erstellers",
  "{user_id}": "Discord-ID des Erstellers",
  "{ticket_id}": "Ticket-Nummer, z. B. 0042",
  "{category}": "Name der Ticket-Kategorie",
  "{staff}": "Bearbeiter (Erw\xE4hnungen) bzw. \u201Eniemand\u201C",
  "{status}": "Aktueller Status",
  "{priority}": "Aktuelle Priorit\xE4t",
  "{reason}": "Schlie\xDFungsgrund",
  "{closed_by}": "Wer geschlossen hat",
  "{created_at}": "Erstellt am (Datum + Uhrzeit)",
  "{closed_at}": "Geschlossen am (Datum + Uhrzeit)",
  "{channel}": "Ticket-Channel (#\u2026)",
  "{actor}": "Wer die Aktion ausgel\xF6st hat (@\u2026)"
};
function renderTicketText(text, vars) {
  return text.replace(/\{[a-z_]+\}/g, (m) => m in vars ? vars[m] ?? "" : m);
}
function ticketChannelName(format, vars) {
  const raw = renderTicketText(format || "ticket-{ticket_id}", vars).toLowerCase();
  const clean = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return (clean || `ticket-${vars["{ticket_id}"] ?? ""}`).slice(0, 100);
}
var ticketNumber = (n) => String(n).padStart(4, "0");

// src/forms.ts
var FORM_QUESTION_TYPES = { TEXT: "Text", CHOICE: "Multiple choice", ROLE: "Role select", ROBLOX: "Roblox User" };
var ROBLOX_NAME = /^[A-Za-z0-9_]{3,20}$/;
var isInputQuestion = (t) => !t || t === "TEXT" || t === "ROBLOX";
var MAX_FORM_QUESTIONS = 50;
var MAX_FORM_OPTIONS = 25;
function normalizeField(f) {
  const type = f.type ?? "TEXT";
  const input = isInputQuestion(type);
  return {
    key: f.key,
    label: f.label,
    required: f.required,
    type,
    minLength: type === "TEXT" ? Math.max(0, f.minLength ?? 0) : 0,
    maxLength: type === "ROBLOX" ? 20 : f.maxLength,
    options: input ? [] : (f.options ?? []).slice(0, MAX_FORM_OPTIONS),
    multiple: !input && !!f.multiple
  };
}
function freeFieldKey(used) {
  const set = new Set(used);
  for (let n = 1; ; n++) if (!set.has(`frage${n}`)) return `frage${n}`;
}
function checkAnswer(field, value) {
  const f = normalizeField(field);
  if (f.type === "ROBLOX") {
    const v = (Array.isArray(value) ? value[0] ?? "" : value ?? "").trim().replace(/^@/, "");
    if (!v) return f.required ? { ok: false, error: `\u201E${f.label}\u201C ist eine Pflichtfrage.` } : { ok: true, text: "", roleIds: [] };
    if (!ROBLOX_NAME.test(v)) return { ok: false, error: `Bei \u201E${f.label}\u201C bitte einen g\xFCltigen Roblox-Benutzernamen angeben (3\u201320 Zeichen, Buchstaben, Ziffern, _).` };
    return { ok: true, text: v, roleIds: [] };
  }
  if (f.type === "TEXT") {
    const v = (Array.isArray(value) ? value.join("\n") : value ?? "").trim();
    if (!v) return f.required ? { ok: false, error: `\u201E${f.label}\u201C ist eine Pflichtfrage.` } : { ok: true, text: "", roleIds: [] };
    if (v.length < f.minLength) return { ok: false, error: `Die Antwort auf \u201E${f.label}\u201C ist zu kurz (mindestens ${f.minLength} Zeichen).` };
    if (v.length > f.maxLength) return { ok: false, error: `Die Antwort auf \u201E${f.label}\u201C ist zu lang (h\xF6chstens ${f.maxLength} Zeichen).` };
    return { ok: true, text: v, roleIds: [] };
  }
  const picked = [...new Set((Array.isArray(value) ? value : value ? [value] : []).map((x) => x.trim()).filter(Boolean))];
  if (!picked.length) return f.required ? { ok: false, error: `Bitte bei \u201E${f.label}\u201C etwas ausw\xE4hlen.` } : { ok: true, text: "", roleIds: [] };
  if (!f.multiple && picked.length > 1) return { ok: false, error: `Bei \u201E${f.label}\u201C ist nur eine Auswahl erlaubt.` };
  const opts = picked.map((p) => f.options.find((o) => o.label === p));
  if (opts.some((o) => !o)) return { ok: false, error: `Ung\xFCltige Auswahl bei \u201E${f.label}\u201C.` };
  return { ok: true, text: picked.join(", "), roleIds: f.type === "ROLE" ? opts.map((o) => o.roleId).filter((r) => !!r && /^\d{15,25}$/.test(r)) : [] };
}
var APPLICATION_VARIABLES = {
  "{applicationName}": "Name der Bewerbung (z. B. Polizeianw\xE4rter, Flugstaffel)",
  "{user}": "Wer entschieden hat (Erw\xE4hnung)",
  "{applicant}": "Der Bewerber (Erw\xE4hnung)",
  "{number}": "Bewerbungsnummer",
  "{reason}": "Grund (falls angegeben)",
  "{questionCount}": "Anzahl der Fragen",
  "{timeLimit}": "Zeitlimit, z. B. 3 Stunden"
};
var DEFAULT_APPLICATION_MESSAGES = {
  accepted: "\u{1F389} Deine Bewerbung als `{applicationName}` ({number}) wurde von {user} **angenommen**!",
  denied: "Deine Bewerbung als `{applicationName}` ({number}) wurde von {user} leider **abgelehnt**. Du kannst dich sp\xE4ter gerne erneut bewerben.",
  confirmation: "Bist du sicher, dass du dich bewerben m\xF6chtest?\n\nSobald du startest, schicke ich dir nacheinander **{questionCount} Fragen**. Du hast **{timeLimit}** Zeit, die Bewerbung abzuschlie\xDFen \u2013 sonst musst du neu starten. Abbrechen kannst du jederzeit, indem du **abbrechen** schreibst.",
  completion: "\u2705 Deine Bewerbung **{number}** ist eingegangen! Das Team pr\xFCft sie \u2013 die Entscheidung bekommst du hier per Direktnachricht."
};
function renderApplicationText(text, vars, appendReason = false) {
  const out = text.replace(/\{[a-zA-Z]+\}/g, (m) => m in vars ? vars[m] ?? "" : m);
  return appendReason && vars["{reason}"] && !text.includes("{reason}") ? `${out}

**Grund:** ${vars["{reason}"]}` : out;
}
var formatMinutes = (min) => {
  const d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = min % 60;
  return [d ? `${d} ${d === 1 ? "Tag" : "Tage"}` : "", h ? `${h} ${h === 1 ? "Stunde" : "Stunden"}` : "", m ? `${m} ${m === 1 ? "Minute" : "Minuten"}` : ""].filter(Boolean).join(" ") || "0 Minuten";
};
var rolesMatch = (have, ids, mode) => mode === "ALL" ? ids.every((r) => have.includes(r)) : ids.some((r) => have.includes(r));

// src/cad.ts
var CAD_EVENTS = ["incident.created", "incident.status", "incident.assigned", "incident.closed", "incident.feedback", "incident.support", "call.received", "announcement", "radio", "handover"];
var CAD_EVENT_LABELS = {
  "incident.created": "Neuer Einsatz",
  "incident.status": "Einsatzstatus ge\xE4ndert",
  "incident.assigned": "Einheit zugewiesen",
  "incident.closed": "Einsatz abgeschlossen",
  "incident.feedback": "R\xFCckmeldung einer Einheit (MDT)",
  "incident.support": "Unterst\xFCtzung ben\xF6tigt",
  "call.received": "Notruf eingegangen",
  announcement: "Wichtige Leitstellenmeldung",
  radio: "Funkmeldung",
  handover: "Schicht\xFCbergabe"
};
var CAD_FEEDBACK = [
  { key: "accepted", label: "Auftrag angenommen", emoji: "\u2705", unitStatus: "EN_ROUTE" },
  { key: "en_route", label: "Ausger\xFCckt", emoji: "\u{1F693}", unitStatus: "EN_ROUTE" },
  { key: "on_scene", label: "Am Einsatzort", emoji: "\u{1F4CD}", unitStatus: "ON_SCENE" },
  { key: "support", label: "Unterst\xFCtzung ben\xF6tigt", emoji: "\u{1F198}" },
  { key: "under_control", label: "Einsatz unter Kontrolle", emoji: "\u{1F6E1}\uFE0F" },
  { key: "completed", label: "Einsatz abgeschlossen (Meldung)", emoji: "\u{1F3C1}" }
];
var CAD_FEEDBACK_KEYS = CAD_FEEDBACK.map((f) => f.key);
var CAD_LINK_SEND_TYPES = ["incidents", "incident_status", "unit_requests", "calls", "announcements", "radio"];
var CAD_LINK_ACTIONS = ["status_report", "radio", "view_incidents", "dispatch"];
var CAD_LINK_LABELS = {
  incidents: "Eins\xE4tze senden",
  incident_status: "Einsatzstatus senden",
  unit_requests: "Einheiten anfordern",
  calls: "Notrufe senden",
  announcements: "Leitstellenmeldungen senden",
  radio: "Funkmeldungen senden",
  status_report: "Status zur\xFCckmelden",
  view_incidents: "Einsatzstatus sehen",
  dispatch: "Notrufe/Eins\xE4tze bearbeiten (\xDCbernehmen, Einsatz erstellen, Einheit zuweisen)"
};
var CAD_EVENT_SEND_TYPE = {
  "incident.created": "incidents",
  "incident.status": "incident_status",
  "incident.assigned": "unit_requests",
  "incident.closed": "incident_status",
  "incident.feedback": "incident_status",
  "incident.support": "incident_status",
  "call.received": "calls",
  announcement: "announcements",
  radio: "radio",
  handover: "announcements"
};
var CAD_WIDGETS = ["activeIncidents", "availableUnits", "activeCalls", "erlcStatus", "map", "units", "radio", "persons", "vehicles", "dutyActivity"];
var CAD_WIDGET_LABELS = {
  activeIncidents: "Aktive Eins\xE4tze",
  availableUnits: "Verf\xFCgbare Einheiten",
  activeCalls: "Aktive Notrufe",
  erlcStatus: "ER:LC-Status",
  map: "Einsatzkarte",
  units: "Einheiten",
  radio: "Letzte Funkmeldungen",
  persons: "Personen",
  vehicles: "Fahrzeuge",
  dutyActivity: "Aktivit\xE4t im Dienst"
};
var ERLC_MAP_SIZE = 5355;
var ERLC_BUILTIN_MAP = "/maps/erlc-map.webp";
var DEFAULT_CAD_CONFIG = {
  homeGuildId: null,
  incidentNumberPrefix: "E",
  incidentTypes: [
    { key: "ROBBERY", label: "Raub", emoji: "\u{1F4B0}" },
    { key: "SHOTS", label: "Schussabgabe", emoji: "\u{1F52B}" },
    { key: "TRAFFIC", label: "Verkehrsunfall", emoji: "\u{1F697}" },
    { key: "HOSTAGE", label: "Geiselnahme", emoji: "\u{1F9F7}" },
    { key: "PURSUIT", label: "Verfolgung", emoji: "\u{1F693}" },
    { key: "OTHER", label: "Sonstiges", emoji: "\u{1F4CB}" }
  ],
  priorities: [
    { key: "HIGH", label: "Hoch", emoji: "\u{1F534}", color: "#ef4444", order: 0 },
    { key: "MEDIUM", label: "Mittel", emoji: "\u{1F7E0}", color: "#f97316", order: 1 },
    { key: "LOW", label: "Niedrig", emoji: "\u{1F7E2}", color: "#22c55e", order: 2 }
  ],
  incidentStatuses: [
    { key: "NEW", label: "Neu", emoji: "\u{1F195}", color: "#3b82f6" },
    { key: "ACKNOWLEDGED", label: "Angenommen", emoji: "\u{1F4E5}", color: "#6366f1" },
    { key: "EN_ROUTE", label: "Einheiten unterwegs", emoji: "\u{1F693}", color: "#0ea5e9" },
    { key: "ON_SCENE", label: "Am Einsatzort", emoji: "\u{1F4CD}", color: "#f97316" },
    { key: "CRITICAL", label: "Kritisch", emoji: "\u{1F6A8}", color: "#ef4444" },
    { key: "UNDER_CONTROL", label: "Unter Kontrolle", emoji: "\u{1F6E1}\uFE0F", color: "#22c55e" },
    { key: "CLOSED", label: "Abgeschlossen", emoji: "\u2705", color: "#64748b", closed: true },
    { key: "CANCELLED", label: "Abgebrochen", emoji: "\u2716\uFE0F", color: "#64748b", closed: true }
  ],
  unitStatuses: [
    { key: "AVAILABLE", label: "Verf\xFCgbar", emoji: "\u{1F7E2}", color: "#22c55e" },
    { key: "PATROL", label: "Auf Streife", emoji: "\u{1F7E1}", color: "#eab308" },
    { key: "EN_ROUTE", label: "Unterwegs", emoji: "\u{1F535}", color: "#3b82f6" },
    { key: "ON_SCENE", label: "Am Einsatzort", emoji: "\u{1F7E0}", color: "#f97316" },
    { key: "BUSY", label: "Im Einsatz", emoji: "\u{1F534}", color: "#ef4444" },
    { key: "UNAVAILABLE", label: "Nicht verf\xFCgbar", emoji: "\u26AB", color: "#475569" },
    { key: "OFF_DUTY", label: "Au\xDFer Dienst", emoji: "\u26AA", color: "#94a3b8" }
  ],
  unitTypes: [
    { key: "SEK", label: "SEK", emoji: "\u{1F693}", color: "#1d4ed8", layer: "sek" },
    { key: "K9", label: "K9", emoji: "\u{1F415}", color: "#a16207", layer: "k9" },
    { key: "PATROL", label: "Streife", emoji: "\u{1F694}", color: "#0891b2", layer: "units" }
  ],
  layers: [
    { key: "incidents", label: "Eins\xE4tze", builtin: true, enabledByDefault: true },
    { key: "calls", label: "ER:LC Notrufe", builtin: true, enabledByDefault: true },
    { key: "sek", label: "SEK-Einheiten", builtin: true, enabledByDefault: true },
    { key: "k9", label: "K9-Einheiten", builtin: true, enabledByDefault: true },
    { key: "units", label: "Weitere Einheiten", builtin: true, enabledByDefault: true },
    { key: "vehicles", label: "Polizeifahrzeuge (GPS)", builtin: true, enabledByDefault: true },
    { key: "staff", label: "Staff", builtin: true, enabledByDefault: false },
    { key: "players", label: "Alle Spieler", builtin: true, enabledByDefault: false },
    { key: "pois", label: "Eigene POIs", builtin: true, enabledByDefault: true },
    { key: "zones", label: "Eigene Zonen", builtin: true, enabledByDefault: true },
    { key: "restricted", label: "Sperrbereiche", builtin: true, enabledByDefault: true }
  ],
  markers: [
    { key: "incident", label: "Einsatz", emoji: "\u{1F534}", color: "#ef4444" },
    { key: "call", label: "Emergency Call", emoji: "\u{1F6A8}", color: "#f43f5e" },
    { key: "unit", label: "Einheit", emoji: "\u{1F694}", color: "#0891b2" },
    { key: "vehicle", label: "Polizeifahrzeug", emoji: "\u{1F693}", color: "#2563eb" },
    { key: "staff", label: "Staff", emoji: "\u{1F46E}", color: "#f59e0b" },
    { key: "player", label: "Spieler", emoji: "\u2022", color: "#94a3b8" },
    { key: "poi", label: "POI", emoji: "\u{1F4CD}", color: "#10b981" }
  ],
  map: { imageUrl: null, width: ERLC_MAP_SIZE, height: ERLC_MAP_SIZE, originX: ERLC_MAP_SIZE / 2, originY: ERLC_MAP_SIZE / 2, scale: 1 },
  routes: [],
  memberFields: [],
  widgets: ["activeIncidents", "availableUnits", "activeCalls", "dutyActivity", "erlcStatus", "map", "radio"]
};
var gameToPixel = (m, x, z6) => ({ px: m.originX + x * m.scale, py: m.originY + z6 * m.scale });
var pixelToGame = (m, px, py) => ({ x: (px - m.originX) / m.scale, z: (py - m.originY) / m.scale });
var ERLC_FEATURES = ["players", "staff", "queue", "vehicles", "emergencyCalls", "modCalls", "joinLogs", "killLogs", "commandLogs", "commands", "webhook"];
var ERLC_FEATURE_LABELS = {
  players: "Spieler (inkl. Positionen)",
  staff: "Server-Team",
  queue: "Warteschlange",
  vehicles: "Fahrzeuge",
  emergencyCalls: "Notrufe",
  modCalls: "Mod-Rufe",
  joinLogs: "Beitritte",
  killLogs: "Kills",
  commandLogs: "Befehlsprotokoll",
  commands: "Befehle ausf\xFChren",
  webhook: "Ereignis-Webhook"
};
var ERLC_POLL_OPTIONS = [5, 10, 15, 30, 60];
var ERLC_STATUSES = ["CONNECTED", "LIMITED", "OFFLINE", "ERROR", "UNKNOWN", "DISABLED"];
var ERLC_STATUS_LABEL = { CONNECTED: "\u{1F7E2} Verbunden", LIMITED: "\u{1F7E1} Eingeschr\xE4nkt", OFFLINE: "\u{1F534} Offline", ERROR: "\u26A0\uFE0F Fehler", UNKNOWN: "\u26AA Noch nicht gepr\xFCft", DISABLED: "\u23F8\uFE0F Deaktiviert" };
var ERLC_DEFAULT_CRITICAL = [":ban", ":unban", ":kick", ":pban", ":tban", ":shutdown", ":kill", ":mod", ":unmod", ":admin", ":unadmin", ":prty", ":weather", ":time"];
var ERLC_DEFAULT_BLOCKED = [":shutdown"];
function parsePlayer(v) {
  const s = String(v ?? "");
  const i = s.lastIndexOf(":");
  return i > 0 && /^\d+$/.test(s.slice(i + 1)) ? { name: s.slice(0, i), id: s.slice(i + 1) } : { name: s, id: null };
}

// src/danger.ts
var DEFAULT_DANGER_CONFIG = {
  panelTitle: "Gefahrenstatus",
  panelText: "\u2022 Dr\xFCcke den entsprechenden Button, um Einheiten zu informieren, wie hoch aktuell die Kriminalit\xE4t in der Stadt ist!\n\n\u2022 Desto fr\xFCher mitgeteilt wird, desto besser k\xF6nnen sich alle Einheiten vorbereiten und schnell ausr\xFCcken!",
  buttonEmoji: "\u2757",
  pingRoleIds: [],
  levels: [
    {
      key: "STATUS_1",
      name: "Status 1",
      title: "Geringe Kriminalit\xE4t.",
      emoji: "\u{1F7E2}",
      color: "#2ecc71",
      buttonStyle: "danger",
      text: "## Die Stadt ist heute besonders ruhig. \u{1F343}\n\u2022 Bis auf kleinere Verst\xF6\xDFe wie im Stra\xDFenverkehr oder Ruhest\xF6rung gibt es nicht wirklich viel f\xFCr unsere Einsatzkr\xE4fte zu tun. \u{1F69A}\u{1F697}\u{1F693}\n\n\u2022 \u{1F5C3}\uFE0F Vielleicht ist es mal ein Tag, sich mehr um B\xFCroarbeit zu k\xFCmmern und unser Pr\xE4sidium auf den neuesten Stand zu bringen.\n\n\u2022 Entspannt euch, seid aber immer bereit! \u2757"
    },
    {
      key: "STATUS_2",
      name: "Status 2",
      title: "Mittlere Kriminalit\xE4t.",
      emoji: "\u{1F7E1}",
      color: "#f1c40f",
      buttonStyle: "danger",
      text: "## In der Stadt ist einiges los. \u{1F6A8}\n\u2022 Es kommt vermehrt zu Eins\xE4tzen \u2013 Diebst\xE4hle, Verfolgungen und Streitigkeiten nehmen zu.\n\n\u2022 Bleibt aufmerksam und haltet Funkkontakt mit der Leitstelle."
    },
    {
      key: "STATUS_3",
      name: "Status 3",
      title: "Hohe Kriminalit\xE4t.",
      emoji: "\u{1F7E0}",
      color: "#e67e22",
      buttonStyle: "danger",
      text: "## Die Lage ist angespannt! \u26A0\uFE0F\n\u2022 Schwere Straftaten und bewaffnete T\xE4ter sind unterwegs.\n\n\u2022 Nur mit Partner und Schutzausr\xFCstung ausr\xFCcken, Verst\xE4rkung fr\xFChzeitig anfordern."
    },
    {
      key: "STATUS_4",
      name: "Status 4",
      title: "Extreme Kriminalit\xE4t.",
      emoji: "\u{1F534}",
      color: "#e74c3c",
      buttonStyle: "danger",
      text: "## Ausnahmezustand! \u{1F694}\u{1F694}\u{1F694}\n\u2022 Akute Gefahrenlage in der Stadt \u2013 alle verf\xFCgbaren Einheiten werden ben\xF6tigt.\n\n\u2022 Eigensicherung geht vor! Anweisungen der Leitstelle sofort befolgen."
    }
  ]
};
var LEGACY_DANGER = { GREEN: "STATUS_1", YELLOW: "STATUS_2", RED: "STATUS_4" };
function dangerLevelOf(cfg, key2) {
  return cfg.levels.find((l) => l.key === key2) ?? cfg.levels.find((l) => l.key === LEGACY_DANGER[key2 ?? ""]) ?? cfg.levels[0];
}

// src/workflows.ts
var WORKFLOW_TRIGGERS = [
  { key: "incident.create", label: "Einsatz angelegt (MDT)", fields: ["number", "title", "priority", "location", "status"] },
  { key: "cad.incident.create", label: "CAD-Einsatz angelegt", fields: ["number", "title", "priority", "type", "location", "keyword"] },
  { key: "incident.status", label: "Einsatzstatus ge\xE4ndert", fields: ["number", "status", "priority"] },
  { key: "report.create", label: "Bericht angelegt", fields: ["title", "type", "status"] },
  { key: "report.submitted", label: "Bericht eingereicht", fields: ["title", "type", "status"] },
  { key: "report.approved", label: "Bericht genehmigt", fields: ["title", "type"] },
  { key: "report.rejected", label: "Bericht abgelehnt", fields: ["title", "type"] },
  { key: "complaint.create", label: "Beschwerde eingegangen", fields: ["title", "status"] },
  { key: "wanted.create", label: "Fahndung angelegt", fields: ["subject", "priority", "kind", "status"] },
  { key: "investigation.create", label: "Ermittlung er\xF6ffnet", fields: ["title", "status"] },
  { key: "evidence.create", label: "Beweismittel erfasst", fields: ["description", "status"] },
  { key: "person.create", label: "Personenakte angelegt", fields: ["robloxUsername", "status"] },
  { key: "ticket.create", label: "Strafzettel ausgestellt", fields: ["number", "status"] },
  { key: "application.submit", label: "Bewerbung eingegangen", fields: ["status"] },
  { key: "leave.request", label: "Abmeldung beantragt", fields: ["reason", "status"] },
  { key: "leave.approve", label: "Abmeldung angenommen", fields: ["reason"] },
  { key: "leave.deny", label: "Abmeldung abgelehnt", fields: ["reason"] },
  { key: "personnel.promote", label: "Bef\xF6rderung", fields: ["rank", "callsign"] },
  { key: "danger.set", label: "Gefahrenstatus ge\xE4ndert", fields: ["level"] },
  { key: "lock.takeover", label: "Bearbeitung \xFCbernommen", fields: [] },
  { key: "auth.2fa.reset", label: "Zwei-Faktor zur\xFCckgesetzt", fields: [] }
];
var WORKFLOW_OPS = ["eq", "neq", "contains", "in", "exists", "not_exists"];
var WORKFLOW_OP_LABELS = { eq: "ist", neq: "ist nicht", contains: "enth\xE4lt", in: "ist eins von (Komma)", exists: "ist gesetzt", not_exists: "ist leer" };
var WORKFLOW_ACTION_LABELS = {
  notify_permission: "\u{1F514} Benachrichtigung an alle mit Recht \u2026",
  notify_role: "\u{1F514} Benachrichtigung an Rolle \u2026",
  discord: "\u{1F4AC} Discord-Meldung in Kanal \u2026"
};
var triggerMatches = (pattern, action) => pattern.endsWith("*") ? action.startsWith(pattern.slice(0, -1)) : pattern === action;
function fieldValue(obj, path) {
  let cur = obj;
  for (const k of path.split(".")) {
    if (cur === null || typeof cur !== "object") return void 0;
    cur = cur[k];
  }
  return cur;
}
function conditionMatches(after, c) {
  const v = fieldValue(after, c.field);
  const s = v === void 0 || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  const want = (c.value ?? "").trim();
  switch (c.op) {
    case "eq":
      return s.toLowerCase() === want.toLowerCase();
    case "neq":
      return s.toLowerCase() !== want.toLowerCase();
    case "contains":
      return s.toLowerCase().includes(want.toLowerCase());
    case "in":
      return want.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).includes(s.toLowerCase());
    case "exists":
      return s !== "";
    case "not_exists":
      return s === "";
  }
}
function renderTemplate(tpl, ctx) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key2) => {
    const base = { action: ctx.action, entityType: ctx.entityType ?? "", entityId: ctx.entityId ?? "", actor: ctx.actor ?? "System" };
    const v = key2 in base ? base[key2] : fieldValue(ctx.after, key2.startsWith("after.") ? key2.slice(6) : key2);
    const s = v === void 0 || v === null ? "\u2014" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return s.slice(0, 300);
  });
}

// src/labels.ts
var STATUS_LABEL = {
  NEW: "Neu",
  ACKNOWLEDGED: "Best\xE4tigt",
  ASSIGNED: "Zugewiesen",
  EN_ROUTE: "Anfahrt",
  ON_SCENE: "Vor Ort",
  PROCESSING: "In Bearbeitung",
  CLEARING: "Abschluss",
  CLOSED: "Geschlossen",
  CANCELLED: "Abgebrochen",
  DRAFT: "Entwurf",
  SUBMITTED: "Eingereicht",
  UNDER_REVIEW: "In Pr\xFCfung",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
  ARCHIVED: "Archiviert",
  ISSUED: "Ausgestellt",
  PAID: "Bezahlt",
  VOID: "Ung\xFCltig",
  ACTIVE: "Aktiv",
  CLEARED: "Erledigt",
  EXPIRED: "Abgelaufen",
  OPEN: "Offen",
  SUSPENDED: "Ausgesetzt",
  RECEIVED: "Eingegangen",
  SCREENING: "Vorpr\xFCfung",
  INVESTIGATION: "Ermittlung",
  REVIEW: "Pr\xFCfung",
  RESOLVED: "Gel\xF6st",
  AVAILABLE: "Verf\xFCgbar",
  BUSY: "Besch\xE4ftigt",
  UNAVAILABLE: "Nicht verf\xFCgbar",
  OFF_DUTY: "Au\xDFer Dienst",
  ON_DUTY: "Im Dienst",
  BREAK: "Pause",
  TRAINING: "Ausbildung",
  ADMINISTRATIVE: "Verwaltung",
  COLLECTED: "Sichergestellt",
  STORED: "Eingelagert",
  TRANSFERRED: "\xDCbergeben",
  REVIEWED: "Gepr\xFCft",
  RELEASED: "Freigegeben",
  INTERVIEW: "Gespr\xE4ch",
  PENDING_DECISION: "Entscheidung ausstehend",
  ACCEPTED: "Angenommen",
  WITHDRAWN: "Zur\xFCckgezogen",
  PENDING: "Ausstehend",
  CONFIRMED: "Best\xE4tigt",
  ONLINE: "Online",
  OFFLINE: "Offline",
  UNKNOWN: "Unbekannt",
  ERROR: "Fehler",
  UNVERIFIED: "Nicht verifiziert",
  VERIFIED: "Verifiziert",
  FAILED: "Fehlgeschlagen",
  MANUAL: "Manuell",
  DENIED: "Abgelehnt",
  ENDED: "Beendet",
  CONNECTED: "Verbunden",
  LIMITED: "Eingeschr\xE4nkt",
  DISABLED: "Deaktiviert",
  CLAIMED: "\xDCbernommen",
  LOA: "Abgemeldet",
  RESIGNED: "Ausgetreten",
  TERMINATED: "Entlassen",
  PROMOTION: "Bef\xF6rderung",
  AWARD: "Auszeichnung",
  DISCIPLINE: "Disziplinarma\xDFnahme",
  NOTE: "Notiz",
  INCIDENT: "Einsatz",
  PATROL: "Streife",
  TRAFFIC: "Verkehr",
  ARREST: "Festnahme",
  CITATION: "Verwarnung",
  COLLISION: "Unfall",
  GENERAL: "Allgemein"
};
var statusLabel = (status) => STATUS_LABEL[status] ?? status.replace(/_/g, " ");
var PRIORITY_LABEL = { LOW: "Niedrig", MEDIUM: "Mittel", HIGH: "Hoch", URGENT: "Dringend", CRITICAL: "Kritisch" };

// src/welcome.ts
var DEFAULT_WELCOME_CONFIG = {
  welcome: {
    enabled: false,
    channelId: null,
    title: "\u{1F44B} Willkommen auf {server}!",
    color: "#3b82f6",
    showAvatar: true,
    pingUser: true,
    image: "",
    imageMediaId: "",
    message: "Hey {user}, sch\xF6n, dass du da bist! Du bist Mitglied **#{memberCount}**.\n\nLies dir bitte die Regeln durch. Bewerben kannst du dich jederzeit \xFCber das Bewerbungs-Panel."
  },
  dm: { enabled: false, message: "Willkommen auf **{server}**, {username}! Bei Fragen \xF6ffne einfach ein Support-Ticket." },
  autoRoleIds: [],
  goodbye: { enabled: false, channelId: null, title: "Auf Wiedersehen", color: "#64748b", showAvatar: true, pingUser: false, image: "", imageMediaId: "", message: "**{username}** hat den Server verlassen. Wir sind jetzt {memberCount} Mitglieder." }
};
var WELCOME_VARIABLES = {
  "{user}": "Erw\xE4hnung des Mitglieds (@Name)",
  "{username}": "Benutzername",
  "{displayName}": "Anzeigename auf dem Server",
  "{server}": "Name des Servers",
  "{memberCount}": "Anzahl Mitglieder (nach Beitritt/Austritt)",
  "{accountAge}": "Alter des Discord-Kontos (z. B. \u201E3 Tage\u201C)"
};
function accountAge(created, now = Date.now()) {
  const t = created ? new Date(created).getTime() : NaN;
  if (!Number.isFinite(t)) return "\u2014";
  const days = Math.max(0, Math.floor((now - t) / 864e5));
  if (days === 0) return "heute erstellt";
  if (days < 60) return `${days} ${days === 1 ? "Tag" : "Tage"}`;
  if (days < 730) return `${Math.floor(days / 30)} Monate`;
  return `${Math.floor(days / 365)} Jahre`;
}
function renderWelcomeText(text, m, now = Date.now()) {
  const vars = {
    "{user}": `<@${m.id}>`,
    "{username}": m.username,
    "{displayName}": m.displayName,
    "{server}": m.server,
    "{memberCount}": String(m.memberCount),
    "{accountAge}": accountAge(m.createdAt, now)
  };
  return text.replace(/\{[a-zA-Z]+\}/g, (k) => vars[k] ?? k);
}
var hexColor = (c, fallback = 3900150) => /^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : fallback;

// src/voice-support.ts
var WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
var MUSIC_TRACKS = { "": "Track w\xE4hlen", lofi: "Lo-Fi", piano: "Klavier", elevator: "Fahrstuhlmusik", custom: "Eigenes Audio" };
var VOICE_CASE_STATUS = { WAITING: "Wartet", CLAIMED: "\xDCbernommen", DECLINED: "Abgelehnt", ABANDONED: "Warteraum verlassen", CLOSED: "Geschlossen" };
var newVoiceRoom = (id2, guildId = "") => ({
  id: id2,
  guildId,
  name: "Support",
  enabled: true,
  waitingChannelId: "",
  notifyChannelId: "",
  teamRoleId: "",
  channelPrefix: "\u{1F3A7} ",
  notes: true,
  ownChannels: false,
  ownChannelIds: [],
  times: [],
  rating: false,
  music: { enabled: false, openTrack: "", closedTrack: "" },
  primary: false
});
var minutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
function localTime(d, timeZone = "Europe/Berlin") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), minute: Number(get("hour")) * 60 + Number(get("minute")) };
}
function isSupportOpen(times, d = /* @__PURE__ */ new Date(), timeZone = "Europe/Berlin") {
  if (!times.length) return true;
  const { day, minute } = localTime(d, timeZone);
  return times.some((t) => {
    const from = minutes(t.from), to = minutes(t.to);
    if (from <= to) return t.days.includes(day) && minute >= from && minute < to;
    return t.days.includes(day) && minute >= from || t.days.includes((day + 6) % 7) && minute < to;
  });
}

// src/verification.ts
var DEFAULT_VERIFY_CONFIG = {
  enabled: false,
  verifiedRoleIds: [],
  unverifiedRoleIds: [],
  nickname: "{roblox-name}",
  autoOnJoin: true,
  logChannelId: null,
  panel: { channelId: null, title: "\u2705 Roblox-Verifizierung", message: "Verkn\xFCpfe dein Roblox-Konto mit Discord, um Zugriff auf den Server zu bekommen.\n\nKlick auf **Verifizieren**, gib deinen Roblox-Namen ein und folge den Schritten.", color: "#22c55e", buttonLabel: "Verifizieren" },
  binds: []
};
var VERIFY_NICK_VARS = {
  "{roblox-name}": "Roblox-Benutzername",
  "{display-name}": "Roblox-Anzeigename",
  "{discord-name}": "Discord-Name",
  "{roblox-id}": "Roblox-ID"
};
function renderVerifyNickname(tpl, v) {
  if (!tpl.trim()) return null;
  const vars = { "{roblox-name}": v.robloxName, "{display-name}": v.displayName, "{discord-name}": v.discordName, "{roblox-id}": v.robloxId };
  const out = tpl.replace(/\{[a-z-]+\}/g, (k) => vars[k] ?? k).trim().slice(0, 32);
  return out || null;
}
function matchingBinds(binds, ranks) {
  return binds.filter((b) => {
    const r = ranks[b.groupId];
    return r !== void 0 && r >= b.minRank && r <= b.maxRank;
  });
}
function verifyActions(cfg, link) {
  const bindRoles = [...new Set(cfg.binds.flatMap((b) => b.roleIds))];
  if (!link) return { add: [...new Set(cfg.unverifiedRoleIds)], remove: [.../* @__PURE__ */ new Set([...cfg.verifiedRoleIds, ...bindRoles])].filter((r) => !cfg.unverifiedRoleIds.includes(r)), nickname: null };
  const add = [.../* @__PURE__ */ new Set([...cfg.verifiedRoleIds, ...matchingBinds(cfg.binds, link.ranks).flatMap((b) => b.roleIds)])];
  const remove = [.../* @__PURE__ */ new Set([...cfg.unverifiedRoleIds, ...bindRoles])].filter((r) => !add.includes(r));
  return { add, remove, nickname: renderVerifyNickname(cfg.nickname, link) };
}

// src/panels.ts
import { z } from "zod";
var sf = z.string().regex(/^\d{15,25}$/, "Discord-ID (15\u201325 Ziffern)");
var color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
var emoji = z.string().trim().max(64);
var imageRef = z.union([z.string().trim().max(500).regex(/^(https:\/\/\S+|media:[0-9a-f-]{36})$/, "Bild: https://-Link oder hochgeladene Datei"), z.literal("")]).default("");
var toInt = (hex) => parseInt(hex.slice(1), 16);
var staffSectionSchema = z.object({
  roleId: sf,
  /** eigene Überschrift statt der Rollen-Erwähnung (leer = @Rolle) */
  label: z.string().max(100).default(""),
  /** Trennlinie nach diesem Abschnitt */
  divider: z.boolean().default(true)
});
var staffListSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  channelId: sf.nullable().default(null),
  title: z.string().max(256).default("EN | Staff-Team"),
  intro: z.string().max(1e3).default(""),
  color: color.default("#2b2d31"),
  sections: z.array(staffSectionSchema).max(40).default([]),
  /** Text, wenn niemand die Rolle hat */
  emptyText: z.string().max(50).default("/"),
  dividerText: z.string().max(60).default("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"),
  /** Mitglieder als Erwähnung (@Name, wie im Screenshot) oder als Anzeigename */
  mention: z.boolean().default(true),
  /** wer mehrere Rollen der Liste hat, steht nur unter der obersten */
  onlyHighest: z.boolean().default(false),
  bullet: z.string().max(8).default("\u2022"),
  footer: z.string().max(200).default(""),
  timestamp: z.boolean().default(true),
  /** automatisch aktualisieren, sobald sich Rollen ändern */
  autoUpdate: z.boolean().default(true),
  image: imageRef
});
function renderStaffList(l, members, roleName = (id2) => `<@&${id2}>`, now = /* @__PURE__ */ new Date()) {
  const used = /* @__PURE__ */ new Set();
  const blocks = [];
  l.sections.forEach((s, i) => {
    let list = members.filter((m) => m.roleIds.includes(s.roleId));
    if (l.onlyHighest) {
      list = list.filter((m) => !used.has(m.id));
      list.forEach((m) => used.add(m.id));
    }
    list.sort((a, b) => a.name.localeCompare(b.name, "de"));
    const head = s.label ? `**${s.label}**` : roleName(s.roleId);
    const lines = list.length ? list.map((m) => `${l.bullet} ${l.mention ? `<@${m.id}>` : m.name}`) : [`${l.bullet} ${l.emptyText || "/"}`];
    blocks.push(`${head}
${lines.join("\n")}${s.divider && i < l.sections.length - 1 ? `

${l.dividerText}` : ""}`);
  });
  const texts = [];
  let cur = l.intro ? `${l.intro}

${l.dividerText}

` : "";
  for (const b of blocks) {
    if ((cur + b).length > 3900 && cur) {
      texts.push(cur);
      cur = "";
    }
    cur += `${b}

`;
  }
  texts.push(cur || (l.sections.length ? "" : "Noch keine Rollen eingetragen."));
  const c = toInt(l.color);
  const embeds = texts.map((t, i) => ({ color: c, ...i === 0 && l.title ? { title: l.title } : {}, description: t.trim() || "\u200B" }));
  const last = embeds.at(-1);
  if (l.image) last.image = l.image;
  if (l.footer) last.footer = l.footer;
  if (l.timestamp) last.timestamp = now.toISOString();
  return { embeds: embeds.slice(0, 10) };
}
var panelFieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,30}$/, "K\xFCrzel: a\u2013z, 0\u20139, _"),
  label: z.string().trim().min(1).max(45),
  placeholder: z.string().max(100).default(""),
  long: z.boolean().default(false),
  required: z.boolean().default(true),
  maxLength: z.number().int().min(1).max(4e3).default(200)
});
var formPanelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  active: z.boolean().default(true),
  /** Panel-Nachricht mit Button */
  channelId: sf.nullable().default(null),
  panelTitle: z.string().max(256).default("Funk- und Roblox-Daten"),
  panelText: z.string().max(4e3).default("Klicke unten auf den Button und trage deine Daten ein."),
  panelColor: color.default("#22c55e"),
  panelImage: imageRef,
  buttonLabel: z.string().trim().min(1).max(80).default("Daten eintragen"),
  buttonEmoji: emoji.default("\u{1F4DD}"),
  buttonStyle: z.enum(["primary", "secondary", "success", "danger"]).default("success"),
  /** Formular */
  modalTitle: z.string().trim().min(1).max(45).default("Deine Daten"),
  fields: z.array(panelFieldSchema).min(1).max(5).default([{ id: "zello", label: "Zello Funk", placeholder: "Zello-Name", long: false, required: true, maxLength: 100 }, { id: "roblox", label: "Roblox User", placeholder: "Roblox-Name", long: false, required: true, maxLength: 100 }]),
  /** Ergebnis-Nachricht */
  targetChannelId: sf.nullable().default(null),
  template: z.string().min(1).max(2e3).default("Zello Funk: {zello}\n\nRoblox User: {roblox}"),
  /** als Embed statt Text */
  asEmbed: z.boolean().default(false),
  embedTitle: z.string().max(256).default(""),
  embedColor: color.default("#3b82f6"),
  /** Nachricht mit Namen und Profilbild der Person posten (Webhook – der Bot braucht „Webhooks verwalten“) */
  asUser: z.boolean().default(true),
  reactions: z.array(emoji.min(1)).max(10).default(["\u2705"]),
  pingRoleIds: z.array(sf).max(10).default([]),
  /** jede Person nur einmal (erneutes Absenden ersetzt die alte Nachricht) */
  onePerUser: z.boolean().default(true),
  confirmText: z.string().max(500).default("\u2705 Danke! Deine Angaben wurden gepostet."),
  /** Rollen, die man nach dem Absenden bekommt */
  grantRoleIds: z.array(sf).max(10).default([])
});
var FORM_PANEL_VARIABLES = ["{user}", "{user.name}", "{datum}", "{zeit}"];
function renderPanelTemplate(tpl, values, user, now = /* @__PURE__ */ new Date()) {
  const vars = {
    ...values,
    user: `<@${user.id}>`,
    "user.name": user.name,
    datum: now.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }),
    zeit: now.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })
  };
  return tpl.replace(/\{([\w.]{1,40})\}/g, (m, k) => k in vars ? vars[k] : m).replace(/@(everyone|here)/g, "@\u200B$1");
}
function formPanelMessage(p) {
  return {
    embeds: [{ title: p.panelTitle || void 0, description: p.panelText || void 0, color: toInt(p.panelColor), ...p.panelImage ? { image: p.panelImage } : {} }],
    buttons: [{ id: `fpanel:${p.id}`, label: p.buttonLabel, ...p.buttonEmoji ? { emoji: p.buttonEmoji } : {}, style: p.buttonStyle }]
  };
}
function formPanelResult(p, values, user, now = /* @__PURE__ */ new Date()) {
  const text = renderPanelTemplate(p.template, values, user, now).slice(0, p.asEmbed ? 4e3 : 2e3);
  const ping = p.pingRoleIds.map((r) => `<@&${r}>`).join(" ");
  return {
    ...p.asEmbed ? { ...ping ? { content: ping } : {}, embeds: [{ ...p.embedTitle ? { title: renderPanelTemplate(p.embedTitle, values, user, now).slice(0, 256) } : {}, description: text, color: toInt(p.embedColor), ...p.asUser ? {} : { author: user.name, ...user.avatar ? { authorIcon: user.avatar } : {} } }] } : { content: `${ping ? `${ping}
` : ""}${text}`.slice(0, 2e3) },
    mentionRoles: p.pingRoleIds,
    reactions: p.reactions
  };
}
var httpsImage = z.union([z.string().trim().max(500).regex(/^https:\/\/\S+$/, "Bild: https://-Link"), z.literal("")]).default("");
var infoOptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/, "K\xFCrzel: a\u2013z, 0\u20139, _ und -"),
  /** im Auswahlmenü */
  label: z.string().trim().min(1).max(100),
  description: z.string().max(100).default(""),
  emoji: emoji.default(""),
  /** Antwort (nur für die Person sichtbar) */
  title: z.string().max(256).default(""),
  text: z.string().max(4e3).default(""),
  image: httpsImage,
  color: color.default("#3b82f6")
});
var infoPanelSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  channelId: sf.nullable().default(null),
  title: z.string().max(256).default("Aufgaben als Ausbilder"),
  text: z.string().max(4e3).default("Hier findest du alles Wichtige. W\xE4hle unten einen Punkt aus."),
  color: color.default("#1f2937"),
  image: imageRef,
  footer: z.string().max(200).default("Klicke auf \u201ETriff eine Auswahl\u201C, um mehr zu erfahren."),
  placeholder: z.string().trim().min(1).max(150).default("Triff eine Auswahl"),
  options: z.array(infoOptionSchema).min(1).max(25).default([
    { id: "aufgaben", label: "Aufgaben", description: "Siehe, welche Aufgaben du hast.", emoji: "\u{1F4C2}", title: "Aufgaben", text: "Beschreibe hier die Aufgaben." },
    { id: "doku", label: "Dokumentation", description: "Siehe, wie du dokumentieren musst.", emoji: "\u{1F4E8}", title: "Dokumentation", text: "Beschreibe hier, wie dokumentiert wird." }
  ])
});
function infoPanelMessage(p) {
  return {
    embeds: [{ title: p.title || void 0, description: p.text || void 0, color: toInt(p.color), ...p.image ? { image: p.image } : {}, ...p.footer ? { footer: p.footer } : {} }],
    select: { id: `ipnl:${p.id}`, placeholder: p.placeholder, options: p.options.map((o) => ({ label: o.label, value: o.id, ...o.description ? { description: o.description } : {}, ...o.emoji ? { emoji: o.emoji } : {} })) }
  };
}
function infoOptionEmbed(o) {
  return { title: (o.title || o.label).slice(0, 256), ...o.text ? { description: o.text } : {}, color: toInt(o.color), ...o.image ? { image: o.image } : {} };
}

// src/duty-reports.ts
import { z as z2 } from "zod";
var sf2 = z2.string().regex(/^\d{15,25}$/, "Discord-ID (15\u201325 Ziffern)");
var REPORT_FIELD_TYPES = ["short", "long", "number", "select"];
var reportFieldSchema = z2.object({
  id: z2.string().regex(/^[a-z0-9_]{1,30}$/, "K\xFCrzel: a\u2013z, 0\u20139, _"),
  label: z2.string().trim().min(1).max(45),
  type: z2.enum(REPORT_FIELD_TYPES).default("short"),
  placeholder: z2.string().max(100).default(""),
  required: z2.boolean().default(true),
  /** nur bei Auswahl */
  options: z2.array(z2.string().trim().min(1).max(100)).max(25).default([]),
  maxLength: z2.number().int().min(1).max(4e3).default(1e3),
  /** in Discord nebeneinander anzeigen */
  inline: z2.boolean().default(false)
});
var reportTemplateSchema = z2.object({
  id: z2.string().uuid(),
  name: z2.string().trim().min(1).max(60),
  emoji: z2.string().max(16).default("\u{1F4DD}"),
  description: z2.string().max(500).default(""),
  period: z2.enum(["DAILY", "WEEKLY", "FREE"]).default("DAILY"),
  active: z2.boolean().default(true),
  guildId: sf2.nullable().default(null),
  /** Kanal, in den jeder Bericht gepostet wird (leer = nur Dashboard) */
  channelId: sf2.nullable().default(null),
  color: z2.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
  fields: z2.array(reportFieldSchema).min(1).max(20),
  /** pro Person und Zeitraum nur ein Bericht (erneutes Ausfüllen bearbeitet den vorhandenen) */
  onePerPeriod: z2.boolean().default(true),
  /** Verfasser darf nach dem Einreichen noch bearbeiten */
  authorCanEdit: z2.boolean().default(true),
  /** Rollen, die beim neuen Bericht erwähnt werden */
  pingRoleIds: z2.array(sf2).max(10).default([])
});
var PERIOD_LABEL = { DAILY: "Tagesbericht", WEEKLY: "Wochenbericht", FREE: "Bericht" };
function periodStart(period, d = /* @__PURE__ */ new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (period === "WEEKLY") x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7);
  return x;
}
var dd = (d) => d.toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
function periodLabel(period, start) {
  const s = new Date(start);
  if (period === "WEEKLY") {
    const e = new Date(s);
    e.setUTCDate(e.getUTCDate() + 6);
    return `KW ${isoWeek(s)} (${dd(s).slice(0, 6)}\u2013${dd(e)})`;
  }
  return dd(s);
}
var isDutyTimeField = (f) => f.type !== "select" && /dienst ?zeit|dienststunden|arbeitszeit|dienstzeit/i.test(`${f.id} ${f.label}`);
function periodEnd(period, start) {
  const e = new Date(start);
  e.setUTCDate(e.getUTCDate() + (period === "WEEKLY" ? 7 : 1));
  return e;
}
var fmtDur = (ms) => {
  const m = Math.round(ms / 6e4);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
};
function dutyTimeText(period, sessions, from, to, timeZone = "Europe/Berlin", now = /* @__PURE__ */ new Date()) {
  const spans = sessions.map((x) => ({ status: x.status, s: Math.max(new Date(x.startedAt).getTime(), from.getTime()), e: Math.min(x.endedAt ? new Date(x.endedAt).getTime() : now.getTime(), to.getTime()) })).filter((x) => x.e > x.s && x.status !== "OFF_DUTY").sort((a, b) => a.s - b.s);
  const shifts = [];
  for (const x of spans) {
    const last = shifts[shifts.length - 1];
    const work = x.status === "BREAK" ? 0 : x.e - x.s;
    if (last && x.s - last.e <= 6e4) {
      last.e = Math.max(last.e, x.e);
      last.work += work;
    } else shifts.push({ s: x.s, e: x.e, work });
  }
  const real = shifts.filter((x) => x.work >= 6e4);
  if (!real.length) return null;
  const total = real.reduce((n, x) => n + x.work, 0);
  if (period === "WEEKLY") return `${fmtDur(total)} in ${real.length} ${real.length === 1 ? "Schicht" : "Schichten"}`;
  const t = (ms) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone });
  const open = sessions.some((x) => !x.endedAt);
  return `${real.map((x, i) => `${t(x.s)}\u2013${open && i === real.length - 1 && x.e >= Math.min(now.getTime(), to.getTime()) - 6e4 ? "jetzt" : t(x.e)}`).join(", ")} (${fmtDur(total)})`;
}
function cleanReportValues(t, input) {
  const values = {};
  for (const f of t.fields) {
    const v = String(input[f.id] ?? "").trim().slice(0, f.maxLength);
    if (f.required && !v) return { error: `\u201E${f.label}\u201C fehlt.` };
    if (v && f.type === "number" && !/^-?\d+([.,]\d+)?$/.test(v)) return { error: `\u201E${f.label}\u201C muss eine Zahl sein.` };
    if (v && f.type === "select" && f.options.length && !f.options.includes(v)) return { error: `\u201E${f.label}\u201C: bitte eine der M\xF6glichkeiten w\xE4hlen (${f.options.join(", ")}).` };
    values[f.id] = v;
  }
  return { values };
}
var REPORT_STATUS_LABEL = { SUBMITTED: "\u{1F4E8} Eingereicht", REVIEWED: "\u2705 Gepr\xFCft", RETURNED: "\u21A9\uFE0F Zur Nachbesserung" };
function reportMessage(t, r, id2) {
  const fields = t.fields.filter((f) => r.values[f.id]).map((f) => ({ name: f.label, value: r.values[f.id].slice(0, 1024), inline: f.inline }));
  const embed = {
    title: `${t.emoji ? `${t.emoji} ` : ""}${t.name} \u2013 ${periodLabel(t.period, r.periodStart)}`.slice(0, 256),
    description: `**Verfasser:** ${r.authorDiscordId ? `<@${r.authorDiscordId}>` : r.authorName}${r.status !== "SUBMITTED" ? `
**${REPORT_STATUS_LABEL[r.status] ?? r.status}**${r.reviewerName ? ` von ${r.reviewerName}` : ""}${r.reviewNote ? `
> ${r.reviewNote.replace(/\n/g, "\n> ").slice(0, 900)}` : ""}` : ""}`,
    color: parseInt(t.color.slice(1), 16),
    fields: fields.slice(0, 25),
    footer: `${r.number}${r.edited ? " \xB7 bearbeitet" : ""}`,
    timestamp: new Date(r.updatedAt).toISOString()
  };
  embed.color = r.status === "REVIEWED" ? 2278750 : r.status === "RETURNED" ? 16096779 : embed.color;
  return { embeds: [embed], buttons: [
    { id: `drep:edit:${id2}`, label: "Bearbeiten", emoji: "\u270F\uFE0F", style: "secondary" },
    ...r.status !== "REVIEWED" ? [{ id: `drep:rev:${id2}`, label: "Gepr\xFCft", emoji: "\u2705", style: "success" }] : [],
    ...r.status !== "RETURNED" ? [{ id: `drep:ret:${id2}`, label: "Zur Nachbesserung", emoji: "\u21A9\uFE0F", style: "secondary" }] : []
  ] };
}

// src/hr.ts
import { z as z3 } from "zod";
var sf3 = z3.string().regex(/^\d{15,25}$/, "Discord-ID (15\u201325 Ziffern)");
var color2 = z3.string().regex(/^#[0-9a-fA-F]{6}$/);
var key = z3.string().regex(/^[A-Z0-9_]{1,32}$/, "Schl\xFCssel: A\u2013Z, 0\u20139, _");
var uuid = z3.string().uuid();
var hrStatusSchema = z3.object({ key, label: z3.string().trim().min(1).max(40), emoji: z3.string().max(16).default(""), color: color2.default("#64748b"), active: z3.boolean().default(true) });
var departmentSchema = z3.object({ id: uuid, name: z3.string().trim().min(1).max(64), color: color2.default("#3b82f6"), discordRoleIds: z3.array(sf3).max(10).default([]), dashboardRoleIds: z3.array(uuid).max(10).default([]), description: z3.string().max(300).default("") });
var severitySchema = z3.object({ key, label: z3.string().trim().min(1).max(40), emoji: z3.string().max(16).default("\u26A0\uFE0F"), color: color2.default("#f59e0b"), defaultDays: z3.number().int().min(0).max(3650).default(30) });
var awardDefSchema = z3.object({
  id: uuid,
  name: z3.string().trim().min(1).max(60),
  icon: z3.string().max(16).default("\u{1F3C5}"),
  description: z3.string().max(500).default(""),
  color: color2.default("#eab308"),
  requirements: z3.string().max(500).default(""),
  public: z3.boolean().default(true),
  discordRoleId: sf3.nullable().default(null),
  active: z3.boolean().default(true)
});
var absenceTypeSchema = z3.object({ key, label: z3.string().trim().min(1).max(40), emoji: z3.string().max(16).default("") });
var PROFILE_SECTIONS = ["overview", "rank", "promotions", "trainings", "exams", "awards", "warnings", "absences", "transfers", "servicenumbers", "notes", "history"];
var PROFILE_SECTION_LABEL = {
  overview: "\xDCbersicht",
  rank: "Rang",
  promotions: "Bef\xF6rderungen",
  trainings: "Ausbildungen",
  exams: "Pr\xFCfungen",
  awards: "Auszeichnungen",
  warnings: "Verwarnungen",
  absences: "Abwesenheiten",
  transfers: "Versetzungen",
  servicenumbers: "Dienstnummern",
  notes: "Notizen",
  history: "Historie"
};
var PROFILE_FIELDS = ["discordName", "discordId", "avatar", "robloxName", "robloxId", "rank", "department", "joinDate", "status", "serviceNumber", "callsign"];
var PROFILE_FIELD_LABEL = {
  discordName: "Discord-Name",
  discordId: "Discord-ID",
  avatar: "Avatar",
  robloxName: "Roblox-Name",
  robloxId: "Roblox-ID",
  rank: "Rang",
  department: "Abteilung",
  joinDate: "Eintrittsdatum",
  status: "Status",
  serviceNumber: "Dienstnummer",
  callsign: "Rufname"
};
var notifyRuleSchema = z3.object({ dashboard: z3.boolean().default(true), channelId: sf3.nullable().default(null), dm: z3.boolean().default(false), roleIds: z3.array(uuid).max(20).default([]) });
var HR_EVENTS = ["promotion.requested", "promotion.approved", "promotion.rejected", "promotion.executed", "transfer.requested", "transfer.approved", "transfer.rejected", "warning.created", "award.granted", "training.passed", "exam.passed"];
var HR_EVENT_LABEL = {
  "promotion.requested": "Neuer Bef\xF6rderungsantrag",
  "promotion.approved": "Bef\xF6rderung genehmigt",
  "promotion.rejected": "Bef\xF6rderung abgelehnt",
  "promotion.executed": "Bef\xF6rderung durchgef\xFChrt",
  "transfer.requested": "Neuer Versetzungsantrag",
  "transfer.approved": "Versetzung genehmigt",
  "transfer.rejected": "Versetzung abgelehnt",
  "warning.created": "Verwarnung erstellt",
  "award.granted": "Auszeichnung verliehen",
  "training.passed": "Ausbildung bestanden",
  "exam.passed": "Pr\xFCfung bestanden"
};
var stageSchema = z3.object({ id: uuid, name: z3.string().trim().min(1).max(60), roleIds: z3.array(uuid).max(20).default([]) });
var REQUEST_STATUSES = ["OPEN", "IN_REVIEW", "APPROVED", "REJECTED", "DEFERRED", "EXECUTED", "CANCELLED"];
var requestStatusDefSchema = z3.object({ label: z3.string().max(40), emoji: z3.string().max(16) });
var hrConfigSchema = z3.object({
  statuses: z3.array(hrStatusSchema).max(30).default([]),
  departments: z3.array(departmentSchema).max(50).default([]),
  absenceTypes: z3.array(absenceTypeSchema).max(30).default([]),
  warningSeverities: z3.array(severitySchema).max(20).default([]),
  warningCategories: z3.array(z3.string().trim().min(1).max(60)).max(50).default([]),
  awards: z3.array(awardDefSchema).max(100).default([]),
  /** Bereiche der Personalakte */
  sections: z3.record(z3.enum(PROFILE_SECTIONS), z3.object({ visible: z3.boolean(), sensitive: z3.boolean() })).default({}),
  /** Felder der Übersicht/Akte */
  fields: z3.record(z3.enum(PROFILE_FIELDS), z3.object({ visible: z3.boolean(), sensitive: z3.boolean() })).default({}),
  /** Abwesenheiten im Teamprofil anzeigen */
  showAbsenceInTeam: z3.boolean().default(true),
  promotion: z3.object({
    stages: z3.array(stageSchema).max(10).default([]),
    approvalsRequired: z3.number().int().min(1).max(10).default(1),
    requireReason: z3.boolean().default(true),
    /** Antrag nur, wenn alle Voraussetzungen erfüllt sind */
    requireRequirements: z3.boolean().default(false),
    /** nach letzter Genehmigung automatisch durchführen */
    autoExecute: z3.boolean().default(false),
    discordRoles: z3.boolean().default(true),
    dashboardRoles: z3.boolean().default(false),
    announceChannelId: sf3.nullable().default(null),
    announceTemplate: z3.string().max(2e3).default("\u{1F396}\uFE0F **BEF\xD6RDERUNG**\n\n{mitglied} wurde bef\xF6rdert.\n\n**Alter Rang:** {alter_rang}\n**Neuer Rang:** {neuer_rang}\n\n**Begr\xFCndung:** {begruendung}\n\n**Bef\xF6rdert durch:** {durch}\n**Datum:** {datum}"),
    announceColor: color2.default("#eab308"),
    /** eigene Namen/Emojis für die Status */
    statusLabels: z3.record(z3.enum(REQUEST_STATUSES), requestStatusDefSchema).default({})
  }).default({}),
  transfer: z3.object({
    approvalsRequired: z3.number().int().min(1).max(10).default(1),
    stages: z3.array(stageSchema).max(10).default([]),
    discordRoles: z3.boolean().default(true),
    dashboardRoles: z3.boolean().default(false),
    autoExecute: z3.boolean().default(true),
    announceChannelId: sf3.nullable().default(null)
  }).default({}),
  notifications: z3.record(z3.enum(HR_EVENTS), notifyRuleSchema).default({}),
  /** Verwarnungen: Meldung in Discord mit Zähler und Folgen beim Erreichen der Grenze */
  warnings: z3.object({
    /** Grenze aktiver Verwarnungen (z. B. 3 → „1/3“) */
    limit: z3.number().int().min(1).max(20).default(3),
    /** Kanal für jede neue Verwarnung (leer = nur Dashboard) */
    channelId: sf3.nullable().default(null),
    template: z3.string().max(1500).default("**Wer:** {mitglied}\n**Grund:** {grund}\n**Verwarnungen:** {anzahl}/{grenze}"),
    /** Person per DM informieren */
    dm: z3.boolean().default(true),
    atLimit: z3.object({
      /** Dashboard-Rollen, die benachrichtigt werden (z. B. Leitung) */
      notifyRoleIds: z3.array(uuid).max(20).default([]),
      /** Discord-Rollen, die in der Meldung erwähnt werden */
      pingDiscordRoleIds: z3.array(sf3).max(10).default([]),
      /** Discord-Rollen, die entzogen werden */
      removeDiscordRoleIds: z3.array(sf3).max(25).default([]),
      /** Status der Personalakte setzen (z. B. SUSPENDED) – leer = nicht ändern */
      status: z3.string().max(32).nullable().default(null)
    }).default({})
  }).default({}),
  /** Zertifikate */
  certificate: z3.object({ organisation: z3.string().max(100).default("EN Polizei"), logo: z3.string().max(500).default(""), signature: z3.string().max(100).default("") }).default({})
});
var id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
var DEFAULT_HR_CONFIG = hrConfigSchema.parse({
  statuses: [
    { key: "ACTIVE", label: "Aktiv", emoji: "\u{1F7E2}", color: "#22c55e" },
    { key: "ABSENT", label: "Abwesend", emoji: "\u{1F7E1}", color: "#eab308" },
    { key: "TRAINING", label: "In Ausbildung", emoji: "\u{1F535}", color: "#3b82f6" },
    { key: "LOA", label: "Beurlaubt", emoji: "\u{1F7E0}", color: "#f97316" },
    { key: "SUSPENDED", label: "Suspendiert", emoji: "\u26D4", color: "#b91c1c" },
    { key: "INACTIVE", label: "Inaktiv", emoji: "\u{1F534}", color: "#ef4444" },
    { key: "RESIGNED", label: "Ausgetreten", emoji: "\u26AB", color: "#475569" },
    { key: "TERMINATED", label: "Entlassen", emoji: "\u26AB", color: "#334155" }
  ],
  departments: [{ id: id(1), name: "Polizei", color: "#3b82f6" }, { id: id(2), name: "Leitstelle", color: "#a855f7" }],
  absenceTypes: [{ key: "VACATION", label: "Urlaub", emoji: "\u{1F3D6}\uFE0F" }, { key: "SICK", label: "Krank", emoji: "\u{1F912}" }, { key: "PRIVATE", label: "Privat", emoji: "\u{1F3E0}" }, { key: "OTHER", label: "Sonstige", emoji: "\u{1F4CB}" }],
  warningSeverities: [
    { key: "WARNING", label: "Verwarnung", emoji: "\u{1F7E1}", color: "#eab308", defaultDays: 30 },
    { key: "REPRIMAND", label: "Abmahnung", emoji: "\u{1F7E0}", color: "#f97316", defaultDays: 60 },
    { key: "SEVERE", label: "Schwerwiegender Versto\xDF", emoji: "\u{1F534}", color: "#ef4444", defaultDays: 180 }
  ],
  warningCategories: ["Verhalten", "Dienstvergehen", "Funk", "Regelversto\xDF", "Sonstiges"],
  awards: [{ id: id(10), name: "Besondere Leistung", icon: "\u{1F3C5}", description: "F\xFCr au\xDFergew\xF6hnliche Leistungen.", color: "#eab308" }],
  sections: Object.fromEntries(PROFILE_SECTIONS.map((s) => [s, { visible: true, sensitive: ["warnings", "notes", "history"].includes(s) }])),
  fields: Object.fromEntries(PROFILE_FIELDS.map((f) => [f, { visible: true, sensitive: f === "discordId" || f === "robloxId" }])),
  notifications: {
    "promotion.requested": { dashboard: true },
    "promotion.approved": { dashboard: true },
    "promotion.rejected": { dashboard: true, dm: true },
    "promotion.executed": { dashboard: true, dm: true },
    "transfer.approved": { dashboard: true, dm: true },
    "award.granted": { dashboard: true, dm: true },
    "warning.created": { dashboard: true }
  }
});
function withHrDefaults(v) {
  const p = hrConfigSchema.safeParse(v ?? {});
  const c = p.success ? p.data : hrConfigSchema.parse({});
  const raw = v ?? {};
  return {
    ...c,
    statuses: raw.statuses ? c.statuses : DEFAULT_HR_CONFIG.statuses,
    departments: raw.departments ? c.departments : DEFAULT_HR_CONFIG.departments,
    absenceTypes: raw.absenceTypes ? c.absenceTypes : DEFAULT_HR_CONFIG.absenceTypes,
    warningSeverities: raw.warningSeverities ? c.warningSeverities : DEFAULT_HR_CONFIG.warningSeverities,
    warningCategories: raw.warningCategories ? c.warningCategories : DEFAULT_HR_CONFIG.warningCategories,
    awards: raw.awards ? c.awards : DEFAULT_HR_CONFIG.awards,
    sections: { ...DEFAULT_HR_CONFIG.sections, ...c.sections },
    fields: { ...DEFAULT_HR_CONFIG.fields, ...c.fields },
    notifications: raw.notifications ? c.notifications : DEFAULT_HR_CONFIG.notifications
  };
}
var REQUEST_STATUS_DEFAULT = {
  OPEN: { label: "Offen", emoji: "\u{1F7E1}" },
  IN_REVIEW: { label: "In Pr\xFCfung", emoji: "\u{1F535}" },
  APPROVED: { label: "Genehmigt", emoji: "\u{1F7E2}" },
  REJECTED: { label: "Abgelehnt", emoji: "\u{1F534}" },
  DEFERRED: { label: "Zur\xFCckgestellt", emoji: "\u26AB" },
  EXECUTED: { label: "Durchgef\xFChrt", emoji: "\u{1F396}\uFE0F" },
  CANCELLED: { label: "Abgebrochen", emoji: "\u2716\uFE0F" }
};
var REQUIREMENT_TYPES = ["MIN_DAYS_IN_RANK", "MIN_DUTY_HOURS", "MIN_INCIDENTS", "TRAINING", "EXAM", "DISCORD_ROLE", "RECOMMENDATION", "CUSTOM"];
var REQUIREMENT_LABEL = {
  MIN_DAYS_IN_RANK: "Mindestzeit im aktuellen Rang (Tage)",
  MIN_DUTY_HOURS: "Mindestanzahl Dienststunden",
  MIN_INCIDENTS: "Mindestanzahl Eins\xE4tze",
  TRAINING: "Bestimmte Ausbildung",
  EXAM: "Bestandene Pr\xFCfung",
  DISCORD_ROLE: "Bestimmte Discord-Rolle",
  RECOMMENDATION: "Empfehlung(en) eines Vorgesetzten",
  CUSTOM: "Frei definierte Voraussetzung (manuell abhaken)"
};
var requirementSchema = z3.object({ id: uuid, type: z3.enum(REQUIREMENT_TYPES), label: z3.string().max(120).default(""), value: z3.number().min(0).max(1e5).default(0), ref: z3.string().max(64).nullable().default(null) });
var rankSchema = z3.object({
  id: uuid.optional(),
  name: z3.string().trim().min(1).max(64),
  description: z3.string().max(500).nullable().default(null),
  icon: z3.string().max(16).nullable().default(null),
  color: color2.default("#64748b"),
  discordRoleIds: z3.array(sf3).max(10).default([]),
  dashboardRoleIds: z3.array(uuid).max(10).default([]),
  nextRankIds: z3.array(uuid).max(20).default([]),
  approverRankIds: z3.array(uuid).max(20).default([]),
  requirements: z3.array(requirementSchema).max(30).default([]),
  active: z3.boolean().default(true)
});
var EXAM_QUESTION_TYPES = ["SINGLE", "MULTI", "YESNO", "TEXT", "NUMBER"];
var EXAM_QUESTION_TYPE_LABEL = { SINGLE: "Single Choice", MULTI: "Multiple Choice", YESNO: "Ja/Nein", TEXT: "Freitext", NUMBER: "Zahl" };
var questionSchema = z3.object({
  id: z3.string().min(1).max(40),
  type: z3.enum(EXAM_QUESTION_TYPES),
  text: z3.string().trim().min(1).max(1e3),
  options: z3.array(z3.string().trim().min(1).max(200)).max(10).default([]),
  /** richtige Antwort(en): Option-Index als Text, „ja“/„nein“, Zahl oder Stichworte (Freitext → manuell) */
  correct: z3.array(z3.string().max(200)).max(10).default([]),
  points: z3.number().min(0).max(100).default(1)
});
function gradeAnswer(q, a) {
  const norm = (x) => String(x ?? "").trim().toLowerCase();
  if (q.type === "TEXT") {
    if (!q.correct.length) return null;
    const t = norm(a);
    return q.correct.every((k) => t.includes(norm(k))) ? q.points : 0;
  }
  if (q.type === "NUMBER") return Number(String(a).replace(",", ".")) === Number(String(q.correct[0] ?? "").replace(",", ".")) ? q.points : 0;
  if (q.type === "MULTI") {
    const got = new Set((Array.isArray(a) ? a : []).map(norm));
    const want = new Set(q.correct.map(norm));
    return got.size === want.size && [...want].every((x) => got.has(x)) ? q.points : 0;
  }
  return norm(Array.isArray(a) ? a[0] : a) === norm(q.correct[0]) ? q.points : 0;
}
var DN_STATUSES = ["ACTIVE", "RESERVED", "FREE", "BLOCKED", "FORMER"];
var DN_STATUS_LABEL = {
  ACTIVE: { label: "Aktiv", emoji: "\u{1F7E2}" },
  RESERVED: { label: "Reserviert", emoji: "\u{1F7E1}" },
  FREE: { label: "Frei", emoji: "\u26AA" },
  BLOCKED: { label: "Gesperrt", emoji: "\u{1F534}" },
  FORMER: { label: "Ehemalig", emoji: "\u26AB" }
};
var rangeSchema = z3.object({
  name: z3.string().trim().min(1).max(60),
  prefix: z3.string().max(10).default(""),
  suffix: z3.string().max(10).default(""),
  start: z3.number().int().min(0).max(9999999),
  end: z3.number().int().min(0).max(9999999),
  padLength: z3.number().int().min(0).max(10).default(0),
  order: z3.enum(["LOWEST_FREE", "SEQUENTIAL"]).default("LOWEST_FREE"),
  autoAssign: z3.boolean().default(true),
  manual: z3.boolean().default(true),
  reuse: z3.boolean().default(true),
  releaseAs: z3.enum(["FREE", "FORMER", "BLOCKED"]).default("FORMER"),
  department: z3.string().max(64).nullable().default(null),
  active: z3.boolean().default(true)
}).refine((r) => r.end >= r.start, { message: "Endnummer muss \u2265 Startnummer sein.", path: ["end"] }).refine((r) => r.end - r.start <= 1e5, { message: "H\xF6chstens 100 000 Nummern je Kreis.", path: ["end"] });
var formatServiceNumber = (r, value) => `${r.prefix}${String(value).padStart(r.padLength, "0")}${r.suffix}`;
var hireMappingSchema = z3.object({
  /** 'police' = Polizei-Bewerbung, sonst Name der Einheit (Qualifikation) */
  kind: z3.string().trim().min(1).max(64),
  /** Nummernkreis (leer = keine automatische Dienstnummer) */
  rangeId: uuid.nullable().default(null),
  department: z3.string().max(64).nullable().default(null),
  rankId: uuid.nullable().default(null),
  /** Personalakte anlegen */
  createProfile: z3.boolean().default(true),
  /** zusätzliche Discord-Rollen */
  roleIds: z3.array(sf3).max(10).default([])
});
var dnSettingsSchema = z3.object({
  /** ACCEPT: direkt bei Annahme · COMPLETE: wenn die Person im Discord verknüpft/erreichbar ist (Einstellung abgeschlossen) · MANUAL: Bestätigung durch berechtigte Person */
  timing: z3.enum(["ACCEPT", "COMPLETE", "MANUAL"]).default("ACCEPT"),
  mappings: z3.array(hireMappingSchema).max(50).default([{ kind: "police", rangeId: null, department: "Polizei", rankId: null, createProfile: true, roleIds: [] }]),
  nickname: z3.object({ enabled: z3.boolean().default(false), format: z3.string().max(60).default("[{dienstnummer}] {name}") }).default({}),
  dm: z3.object({ enabled: z3.boolean().default(true), title: z3.string().max(256).default("\u{1F389} BEWERBUNG ANGENOMMEN"), template: z3.string().max(3e3).default("Herzlichen Gl\xFCckwunsch {user}!\n\nDeine Bewerbung wurde angenommen.\n\n\u{1FAAA} **Dienstnummer:** {dienstnummer}\n\u{1F46E} **Rang:** {rang}\n\u{1F3E2} **Abteilung:** {abteilung}\n\nBitte merke dir deine Dienstnummer."), color: color2.default("#22c55e") }).default({}),
  rankRoles: z3.boolean().default(true),
  departmentRoles: z3.boolean().default(true),
  /** Wechsel der Nummer braucht eine zweite Person (Genehmiger) */
  changeNeedsApprover: z3.boolean().default(false)
});
var WARNING_VARIABLES = ["{mitglied}", "{name}", "{grund}", "{schweregrad}", "{kategorie}", "{anzahl}", "{grenze}", "{durch}", "{datum}", "{ablauf}"];
var DN_VARIABLES = ["{user}", "{name}", "{dienstnummer}", "{rang}", "{abteilung}", "{bewerbung}", "{datum}"];
function fillTemplate(tpl, vars) {
  return tpl.replace(/\{([\w.]{1,40})\}/g, (m, k) => vars[k] !== void 0 && vars[k] !== null ? String(vars[k]) : m).replace(/@(everyone|here)/g, "@\u200B$1");
}

// src/logging.ts
import { z as z4 } from "zod";
var LOG_CATEGORIES = [
  { key: "einsaetze", label: "Eins\xE4tze & Leitstelle", emoji: "\u{1F6A8}", modules: ["cad", "dispatch", "incidents", "erlc", "radio"] },
  { key: "akten", label: "Akten & Ermittlungen", emoji: "\u{1F5C2}\uFE0F", modules: ["persons", "vehicles", "wanted", "investigations", "evidence", "reports", "tickets", "complaints"] },
  { key: "bewerbungen", label: "Bewerbungen & Qualifikationen", emoji: "\u{1F4CB}", modules: ["applications", "qualifications"] },
  { key: "personal", label: "Personal & Ausbildung", emoji: "\u{1F46E}", modules: ["personnel", "promotion", "dienstnummer", "training", "exam", "academy", "sek"] },
  { key: "dienst", label: "Dienst, Abmeldungen & Berichte", emoji: "\u{1F552}", modules: ["team", "dutyreports", "leave"] },
  { key: "kommunikation", label: "Kommunikation & Discord", emoji: "\u{1F4AC}", modules: ["announcements", "polls", "communication", "discord"] },
  { key: "rechte", label: "Rechte, Konten & Anmeldung", emoji: "\u{1F510}", modules: ["permissions", "users", "auth"] },
  { key: "einstellungen", label: "Einstellungen & System", emoji: "\u2699\uFE0F", modules: ["settings", "studio", "teamchance", "media", "locks", "export"] }
];
var logCategoryOf = (module) => LOG_CATEGORIES.find((c) => c.modules.includes(module))?.key ?? "sonstiges";
var LOG_TYPES = {
  "academy.config": "academy",
  "academy.course.announce": "academy",
  "academy.course.create": "academy",
  "academy.enroll": "academy",
  "academy.grade": "academy",
  "announcement.delete": "announcements",
  "application.accepted": "applications",
  "application.rejected": "applications",
  "application.submit": "applications",
  "application.ticket": "applications",
  "application.withdrawn": "applications",
  "auth.discord.admin_granted": "auth",
  "auth.logout": "auth",
  "user.created.discord": "auth",
  "cad.announcement": "cad",
  "cad.handover.acknowledge": "cad",
  "cad.handover.create": "cad",
  "cad.incident.create": "cad",
  "cad.incident.note": "cad",
  "cad.incident.update": "cad",
  "cad.link.delete": "cad",
  "cad.member.delete": "cad",
  "cad.radio": "cad",
  "cad.unit.assign": "cad",
  "cad.unit.clear": "cad",
  "cad.unit.create": "cad",
  "cad.unit.delete": "cad",
  "cad.unit.feedback": "cad",
  "cad.unit.status": "cad",
  "cad.unit.update": "cad",
  "complaint.create": "complaints",
  "complaint.status": "complaints",
  "dienstnummer.dm": "dienstnummer",
  "dienstnummer.nickname": "dienstnummer",
  "dienstnummer.pending": "dienstnummer",
  "dienstnummer.range.delete": "dienstnummer",
  "dienstnummer.settings": "dienstnummer",
  "personnel.discord_roles": "dienstnummer",
  "discord.bot_installed": "discord",
  "discord.link": "discord",
  "discord.link.code_created": "discord",
  "discord.unlink": "discord",
  "danger.config": "dispatch",
  "danger.panel": "dispatch",
  "danger.set": "dispatch",
  "incident.assign": "dispatch",
  "incident.status": "dispatch",
  "unit.create": "dispatch",
  "unit.members": "dispatch",
  "unit.status": "dispatch",
  "dutyreport.create": "dutyreports",
  "dutyreport.delete": "dutyreports",
  "dutyreport.edit": "dutyreports",
  "dutyreport.return": "dutyreports",
  "dutyreport.review": "dutyreports",
  "dutyreport.template.delete": "dutyreports",
  "dutyreport.unreview": "dutyreports",
  "erlc.command": "erlc",
  "erlc.server.create": "erlc",
  "erlc.server.delete": "erlc",
  "evidence.confirm": "evidence",
  "evidence.create": "evidence",
  "exam.delete": "exam",
  "exam.grade": "exam",
  "exam.start": "exam",
  "export": "export",
  "incident.attach": "incidents",
  "incident.create": "incidents",
  "incident.update": "incidents",
  "investigation.create": "investigations",
  "investigation.person.add": "investigations",
  "investigation.status": "investigations",
  "leave.config": "leave",
  "leave.request": "leave",
  "lock.takeover": "locks",
  "media.upload": "media",
  "auth.discord.access_revoked": "permissions",
  "auth.discord.roles_synced": "permissions",
  "role.create": "permissions",
  "role.delete": "permissions",
  "role.duplicate": "permissions",
  "role.reorder": "permissions",
  "user.override.add": "permissions",
  "user.override.remove": "permissions",
  "user.roles.set": "permissions",
  "hr.config.update": "personnel",
  "personnel.create": "personnel",
  "personnel.create.application": "personnel",
  "personnel.delete": "personnel",
  "personnel.promote": "personnel",
  "personnel.read": "personnel",
  "personnel.update": "personnel",
  "person.archive": "persons",
  "person.create": "persons",
  "person.merge": "persons",
  "person.update": "persons",
  "poll.delete": "polls",
  "promotion.rank.create": "promotion",
  "promotion.rank.delete": "promotion",
  "promotion.rank.discord_roles": "promotion",
  "promotion.rank.reorder": "promotion",
  "promotion.requirement.check": "promotion",
  "qualifications.application.accept": "qualifications",
  "qualifications.application.reject": "qualifications",
  "qualifications.application.submit": "qualifications",
  "qualifications.application.withdraw": "qualifications",
  "qualifications.config": "qualifications",
  "qualifications.config.reset": "qualifications",
  "radiocode.create": "radio",
  "radiocode.defaults": "radio",
  "radiocode.delete": "radio",
  "radiocode.discord.config": "radio",
  "radiocode.discord.send": "radio",
  "radiocode.reorder": "radio",
  "radiocode.update": "radio",
  "report.create": "reports",
  "report.edit": "reports",
  "sek.member.add": "sek",
  "sek.member.remove": "sek",
  "sek.report.create": "sek",
  "embed.delete": "settings",
  "embed.send": "settings",
  "formpanel.delete": "settings",
  "formpanel.send": "settings",
  "formpanel.submission.delete": "settings",
  "legalcode.create": "settings",
  "notification.system": "settings",
  "retention.run": "settings",
  "servers.links": "settings",
  "servers.links.move": "settings",
  "studio.config.changed": "settings",
  "verification.config": "settings",
  "verification.oauth": "settings",
  "verification.panel": "settings",
  "verification.removed": "settings",
  "verification.verified": "settings",
  "welcome.config": "settings",
  "welcome.config.reset": "settings",
  "studio.workflow.create": "studio",
  "studio.workflow.delete": "studio",
  "studio.workflow.update": "studio",
  "duty.status": "team",
  "duty.status.set_by_supervisor": "team",
  "radio.add": "team",
  "radio.remove": "team",
  "shifts.config": "team",
  "stafflist.delete": "team",
  "stafflist.send": "team",
  "ticket.create": "tickets",
  "ticket.void": "tickets",
  "voice_support.rooms": "tickets",
  "training.delete": "training",
  "training.progress": "training",
  "user.create": "users",
  "user.roblox.set": "users",
  "vehicle.archive": "vehicles",
  "vehicle.create": "vehicles",
  "wanted.create": "wanted"
};
var LOG_DEFAULT_OFF = /* @__PURE__ */ new Set(["personnel.read", "export", "lock.takeover", "promotion.requirement.check", "auth.discord.roles_synced"]);
var WORDS = {
  incident: "Einsatz",
  unit: "Einheit",
  radio: "Funk",
  call: "Notruf",
  member: "Mitglied",
  link: "Verbindung",
  map: "Karte",
  zone: "Zone",
  poi: "POI",
  announcement: "Ank\xFCndigung",
  application: "Bewerbung",
  applications: "Bewerbung",
  qualifications: "Qualifikation",
  course: "Kurs",
  person: "Person",
  vehicle: "Fahrzeug",
  wanted: "Fahndung",
  investigation: "Ermittlung",
  evidence: "Beweismittel",
  report: "Bericht",
  dutyreport: "Tages-/Wochenbericht",
  ticket: "Strafzettel",
  complaint: "Beschwerde",
  personnel: "Personalakte",
  promotion: "Bef\xF6rderung",
  rank: "Rang",
  dienstnummer: "Dienstnummer",
  range: "Nummernkreis",
  training: "Ausbildung",
  exam: "Pr\xFCfung",
  academy: "Akademie",
  sek: "SEK",
  role: "Rolle",
  user: "Benutzer",
  roles: "Rollen",
  override: "Einzelrecht",
  auth: "Anmeldung",
  discord: "Discord",
  radiocode: "Funk-Code",
  embed: "Embed",
  formpanel: "Formular-Panel",
  stafflist: "Staff-Liste",
  welcome: "Willkommen",
  verification: "Verifizierung",
  studio: "Studio",
  workflow: "Workflow",
  settings: "Einstellungen",
  servers: "Server-Verbund",
  danger: "Gefahrenstatus",
  erlc: "ER:LC",
  server: "Server",
  leave: "Abmeldung",
  duty: "Dienst",
  poll: "Abstimmung",
  shifts: "Schichten",
  template: "Vorlage",
  config: "Einstellungen",
  panel: "Panel",
  legalcode: "Tatbestand",
  media: "Datei",
  notification: "Systemhinweis",
  voice_support: "Sprach-Support",
  hr: "Personal",
  submission: "Einsendung",
  requirement: "Voraussetzung",
  note: "Notiz",
  grade: "Bewertung",
  enroll: "Einschreibung",
  lock: "Sperre",
  retention: "Bereinigung"
};
var VERBS = {
  create: "angelegt",
  created: "angelegt",
  update: "ge\xE4ndert",
  updated: "ge\xE4ndert",
  edit: "bearbeitet",
  delete: "gel\xF6scht",
  remove: "entfernt",
  removed: "entfernt",
  add: "hinzugef\xFCgt",
  status: "Status ge\xE4ndert",
  assign: "zugewiesen",
  clear: "gel\xF6st",
  submit: "eingereicht",
  accepted: "angenommen",
  accept: "angenommen",
  rejected: "abgelehnt",
  reject: "abgelehnt",
  withdrawn: "zur\xFCckgezogen",
  withdraw: "zur\xFCckgezogen",
  send: "gesendet",
  announce: "angek\xFCndigt",
  reorder: "Reihenfolge ge\xE4ndert",
  duplicate: "dupliziert",
  archive: "archiviert",
  merge: "zusammengef\xFChrt",
  promote: "bef\xF6rdert",
  read: "angesehen",
  start: "gestartet",
  review: "gepr\xFCft",
  return: "zur Nachbesserung",
  unreview: "Pr\xFCfung zur\xFCckgenommen",
  set: "gesetzt",
  changed: "ge\xE4ndert",
  reset: "zur\xFCckgesetzt",
  confirm: "best\xE4tigt",
  void: "storniert",
  upload: "hochgeladen",
  request: "beantragt",
  approve: "genehmigt",
  deny: "abgelehnt",
  logout: "abgemeldet",
  verified: "verifiziert",
  run: "ausgef\xFChrt",
  move: "verschoben",
  command: "Befehl ausgef\xFChrt",
  grade: "bewertet"
};
function logTypeLabel(action) {
  const parts = action.split(".");
  const last = parts[parts.length - 1];
  const verb = VERBS[last];
  const nouns = (verb ? parts.slice(0, -1) : parts).filter((p) => p !== "cad" || parts.length === 1);
  const noun = [...new Set(nouns.map((p) => WORDS[p] ?? p))].slice(-2).join(" ");
  return verb ? `${noun} ${verb}` : noun || action;
}
var sf4 = z4.string().regex(/^\d{15,25}$/, "Discord-Kanal-ID");
var loggingConfigSchema = z4.object({
  enabled: z4.boolean().default(true),
  /** Kanal je Kategorie */
  categories: z4.record(z4.string().max(32), sf4).default({}),
  /** Abweichung je Typ: eigener Kanal oder 'off' (aus); fehlt = Kanal der Kategorie */
  types: z4.record(z4.string().max(80), z4.union([sf4, z4.literal("off"), z4.literal("on")])).default({})
});
function logChannelFor(cfg, module, action) {
  if (!cfg.enabled) return null;
  const t = cfg.types[action];
  if (t === "off") return null;
  if (t && t !== "on") return t;
  if (!t && LOG_DEFAULT_OFF.has(action)) return null;
  return cfg.categories[logCategoryOf(module)] ?? null;
}

// src/backup.ts
import { z as z5 } from "zod";
var BACKUP_PARTS = ["roles", "channels", "settings"];
var BACKUP_PART_LABEL = { roles: "Rollen", channels: "Kategorien & Kan\xE4le (mit Rechten)", settings: "Servereinstellungen (Name, Verifizierung, AFK \u2026)" };
var backupConfigSchema = z5.object({
  /** Dashboard-Daten täglich automatisch sichern */
  dataAuto: z5.boolean().default(true),
  /** Discord-Server täglich automatisch sichern */
  discordAuto: z5.boolean().default(false),
  /** so viele automatische Backups behalten (je Art bzw. Server) */
  keep: z5.number().int().min(1).max(60).default(14)
});
export {
  ALL_PERMISSIONS,
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  APPLICATION_VARIABLES,
  AREA_PERMISSIONS,
  BACKUP_PARTS,
  BACKUP_PART_LABEL,
  CAD_EVENTS,
  CAD_EVENT_LABELS,
  CAD_EVENT_SEND_TYPE,
  CAD_FEEDBACK,
  CAD_FEEDBACK_KEYS,
  CAD_LINK_ACTIONS,
  CAD_LINK_LABELS,
  CAD_LINK_SEND_TYPES,
  CAD_WIDGETS,
  CAD_WIDGET_LABELS,
  CLAIM_MODES,
  CLOSE_REASON_MODES,
  CLOSE_REASON_SOURCES,
  COMPLAINT_STATUSES,
  COMPLAINT_TRANSITIONS,
  DEFAULT_APPLICATION_MESSAGES,
  DEFAULT_CAD_CONFIG,
  DEFAULT_DANGER_CONFIG,
  DEFAULT_HR_CONFIG,
  DEFAULT_VERIFY_CONFIG,
  DEFAULT_WELCOME_CONFIG,
  DISPATCH_STATUSES,
  DISPATCH_TRANSITIONS,
  DN_STATUSES,
  DN_STATUS_LABEL,
  DN_VARIABLES,
  DUTY_STATUSES,
  ERLC_BUILTIN_MAP,
  ERLC_DEFAULT_BLOCKED,
  ERLC_DEFAULT_CRITICAL,
  ERLC_FEATURES,
  ERLC_FEATURE_LABELS,
  ERLC_MAP_SIZE,
  ERLC_POLL_OPTIONS,
  ERLC_STATUSES,
  ERLC_STATUS_LABEL,
  EVIDENCE_CUSTODY_STATES,
  EVIDENCE_TRANSITIONS,
  EXAM_QUESTION_TYPES,
  EXAM_QUESTION_TYPE_LABEL,
  FORM_PANEL_VARIABLES,
  FORM_QUESTION_TYPES,
  HR_EVENTS,
  HR_EVENT_LABEL,
  INVESTIGATION_STATUSES,
  INVESTIGATION_TRANSITIONS,
  InvalidTransitionError,
  LEGACY_DANGER,
  LOG_CATEGORIES,
  LOG_DEFAULT_OFF,
  LOG_TYPES,
  MAX_FORM_OPTIONS,
  MAX_FORM_QUESTIONS,
  MUSIC_TRACKS,
  PERIOD_LABEL,
  PERMISSION_CATALOG,
  PRIORITIES,
  PRIORITY_LABEL,
  PROFILE_FIELDS,
  PROFILE_FIELD_LABEL,
  PROFILE_SECTIONS,
  PROFILE_SECTION_LABEL,
  QUESTION_TYPES,
  REPORT_FIELD_TYPES,
  REPORT_STATUSES,
  REPORT_STATUS_LABEL,
  REPORT_TRANSITIONS,
  REPORT_TYPES,
  REQUEST_STATUSES,
  REQUEST_STATUS_DEFAULT,
  REQUIREMENT_LABEL,
  REQUIREMENT_TYPES,
  ROBLOX_NAME,
  ROBLOX_VERIFICATION_STATUSES,
  STATUS_KINDS,
  STATUS_LABEL,
  TICKET_ACTIONS,
  TICKET_ACTION_KEYS,
  TICKET_PLACEHOLDERS,
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
  UNIT_STATUSES,
  VERIFY_NICK_VARS,
  VOICE_CASE_STATUS,
  WANTED_STATUSES,
  WANTED_TRANSITIONS,
  WARNING_VARIABLES,
  WEEKDAYS,
  WELCOME_VARIABLES,
  WORKFLOW_ACTION_LABELS,
  WORKFLOW_OPS,
  WORKFLOW_OP_LABELS,
  WORKFLOW_TRIGGERS,
  absenceTypeSchema,
  accountAge,
  areaGrantsFor,
  assertTransition,
  awardDefSchema,
  backupConfigSchema,
  can,
  canDelegate,
  canTransition,
  checkAnswer,
  cleanReportValues,
  conditionMatches,
  dangerLevelOf,
  defaultTicketButtons,
  departmentSchema,
  dnSettingsSchema,
  dutyTimeText,
  effectivePermissions,
  fieldValue,
  fillTemplate,
  formPanelMessage,
  formPanelResult,
  formPanelSchema,
  formatMinutes,
  formatServiceNumber,
  freeFieldKey,
  gameToPixel,
  gradeAnswer,
  grantMatches,
  hexColor,
  hireMappingSchema,
  hrConfigSchema,
  hrStatusSchema,
  infoOptionEmbed,
  infoOptionSchema,
  infoPanelMessage,
  infoPanelSchema,
  isDutyTimeField,
  isInputQuestion,
  isPermissionKey,
  isSupportOpen,
  isValidRobloxUserId,
  isoWeek,
  localTime,
  logCategoryOf,
  logChannelFor,
  logTypeLabel,
  loggingConfigSchema,
  matchingBinds,
  newVoiceRoom,
  normalizeField,
  notifyRuleSchema,
  panelFieldSchema,
  parsePlayer,
  periodEnd,
  periodLabel,
  periodStart,
  pixelToGame,
  questionSchema,
  rangeSchema,
  rankSchema,
  renderApplicationText,
  renderPanelTemplate,
  renderStaffList,
  renderTemplate,
  renderTicketText,
  renderVerifyNickname,
  renderWelcomeText,
  reportFieldSchema,
  reportMessage,
  reportTemplateSchema,
  requestStatusDefSchema,
  requirementSchema,
  resolvePermission,
  rolesMatch,
  severitySchema,
  staffListSchema,
  staffSectionSchema,
  stageSchema,
  statusLabel,
  ticketChannelName,
  ticketNumber,
  triggerMatches,
  verifyActions,
  withHrDefaults
};
