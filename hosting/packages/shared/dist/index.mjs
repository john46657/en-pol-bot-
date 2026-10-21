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
  /** Polizeifahrzeuge (Live aus ER:LC + Modellkatalog); edit = Status/Notizen/Tags/Kennung, assign = Einheit zuweisen */
  fleet: ["view", "view_details", "edit", "assign", "manage_catalog", "manage"],
  reports: ["view", "create", "edit", "submit", "review", "approve", "reject", "archive"],
  tickets: ["view", "create", "edit", "void"],
  complaints: ["view", "create", "assign", "investigate", "resolve", "close"],
  wanted: ["view", "create", "edit", "activate", "clear"],
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
  /** Dienstnummern-System */
  dienstnummer: ["view", "create", "assign", "edit", "release", "block", "history", "manage_ranges", "manage_settings"],
  leave: ["view", "request", "manage"],
  applications: ["view", "review", "decide", "delete", "auto_assign_dienstnummer"],
  academy: ["view", "manage"],
  sek: ["view", "report", "manage"],
  qualifications: ["view", "decide", "delete", "manage"],
  ticket: ["view", "create", "claim", "close", "reopen", "delete", "add_user", "remove_user", "change_status", "change_priority", "change_category", "rename", "move", "lock", "escalate", "transcript", "transcript_delete", "internal_notes", "rate", "manage", "settings", "assign", "archive", "change_department", "transcript_export", "transcript_manage", "departments", "audit", "bypass_limits"],
  /**
   * Funk-Whitelist für den externen Funkdienst: view = ansehen, grant = freischalten/verlängern/aktivieren, suspend = sperren
   * und entsperren, remove = Freigabe entziehen/archivieren, requests = Anträge bearbeiten, roles = Rollenregeln,
   * integration = Funkdienst-Anbindung (Zugangsdaten), logs = Änderungsprotokoll.
   */
  radiowhitelist: ["view", "grant", "suspend", "remove", "requests", "roles", "integration", "logs"],
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
  roles: ["view", "manage"],
  /** Multi-Server: Server-Stammdaten/Mitgliedschaften (Registrierung, Deaktivierung, Archivierung nur globale Systemadministratoren) */
  servers: ["view", "manage"],
  /** Module je Server an/aus und deren Einstellungen */
  modules: ["view", "manage"],
  /**
   * Discord Message Builder: view = Editor öffnen, create = Entwürfe/Nachrichten erstellen, templates_* = Vorlagen,
   * send = über den Bot senden, history = Versandhistorie, channels = erlaubte Kanäle festlegen, webhooks = Webhooks verwalten
   * und darüber senden, roles = Buttons/Menüs, die Discord-Rollen vergeben.
   */
  messagebuilder: ["view", "create", "templates_create", "templates_edit", "templates_delete", "send", "history", "channels", "webhooks", "roles"]
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
  const all = ctx.roleGrants.filter(matches);
  const top = Math.min(...all.map((g) => g.rank ?? 0));
  const role = all.filter((g) => (g.rank ?? 0) === top);
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
var WANTED_STATUSES = ["ACTIVE", "CLEARED", "CANCELLED", "EXPIRED", "ARCHIVED"];
var WANTED_TRANSITIONS = {
  ACTIVE: ["CLEARED", "CANCELLED", "EXPIRED"],
  CLEARED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  EXPIRED: ["ARCHIVED", "ACTIVE"],
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
var NO_TICKET_BUTTON = ["reopen", "priority", "escalate"];
var ticketButtonsOf = (buttons) => buttons.filter((b) => !NO_TICKET_BUTTON.includes(b.action));
var defaultTicketButtons = () => ["close", "close_request", "claim", "unclaim", "add_user", "remove_user", "transcript", "note", "delete"].map((action) => ({ action, label: TICKET_ACTIONS[action].label, emoji: TICKET_ACTIONS[action].emoji, style: TICKET_ACTIONS[action].style, enabled: true }));
var QUESTION_TYPES = {
  SHORT: "Kurze Antwort",
  LONG: "Lange Antwort",
  YESNO: "Ja/Nein",
  SELECT: "Auswahl",
  MULTI: "Mehrere Optionen",
  CHECKBOX: "Kontrollk\xE4stchen (Best\xE4tigung)",
  NUMBER: "Zahl",
  DATE: "Datum",
  FILE: "Anhang / Screenshot"
};
var CLAIM_MODES = { SINGLE: "Nur ein Bearbeiter", MULTI: "Mehrere Bearbeiter", PRIMARY: "Hauptbearbeiter + Helfer" };
var CLOSE_REASON_MODES = { NONE: "Kein Grund", OPTIONAL: "Grund optional", REQUIRED: "Grund erforderlich" };
var CLOSE_REASON_SOURCES = { PRESET: "Feste Gr\xFCnde", CUSTOM: "Eigener Grund", BOTH: "Beides" };
var STATUS_KINDS = { OPEN: "Offen (aktiv)", CLOSED: "Geschlossen", ARCHIVED: "Archiviert" };
var TICKET_PLACEHOLDERS = {
  "{user}": "Erw\xE4hnung des Ticket-Erstellers (@User)",
  "{username}": "Discord-Name des Erstellers",
  "{user_id}": "Discord-ID des Erstellers",
  "{ticket_id}": "Ticket-Nummer, z. B. 0042",
  "{ticket_ref}": "Dauerhafte Ticket-ID, z. B. EMD-000042",
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
var isInputQuestion = (t2) => !t2 || t2 === "TEXT" || t2 === "ROBLOX";
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
var CAD_EVENTS = ["incident.created", "incident.status", "incident.assigned", "incident.closed", "incident.feedback", "incident.support", "call.received", "announcement", "radio", "handover", "wanted.hit", "wanted.possible", "wanted.erlc"];
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
  handover: "Schicht\xFCbergabe",
  "wanted.hit": "Fahndungstreffer (Roblox-ID best\xE4tigt)",
  "wanted.possible": "M\xF6gliche Fahndungs\xFCbereinstimmung (nur Name \u2013 Pr\xFCfung n\xF6tig)",
  "wanted.erlc": "Im Spiel gesucht (ER:LC-Wanted-Sterne; ohne eigenen Kanal \u2192 Kanal \u201EFahndungstreffer\u201C)"
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
var ERLC_BUILTIN_MAP = "/maps/erlc-map-postals.webp";
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
    { key: "vehicles", label: "Polizeifahrzeuge (Position des Besitzers)", builtin: true, enabledByDefault: true },
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
  map: { width: ERLC_MAP_SIZE, height: ERLC_MAP_SIZE, originX: ERLC_MAP_SIZE / 2, originY: ERLC_MAP_SIZE / 2, scale: 1 },
  routes: [],
  memberFields: [],
  widgets: ["activeIncidents", "availableUnits", "activeCalls", "dutyActivity", "erlcStatus", "map", "radio"]
};
var ERLC_POSTALS = {
  "200": [-1498, 1635],
  "201": [-1170, 1666],
  "202": [-819, 1582],
  "203": [-1443, 1477],
  "204": [-1181, 1477],
  "205": [-837, 1396],
  "206": [-1249, 1343],
  "207": [-1106, 1343],
  "208": [-979, 1343],
  "209": [-1410, 1218],
  "210": [-1182, 1218],
  "211": [-980, 1218],
  "212": [-803, 1218],
  "213": [-1411, 1045],
  "214": [-1249, 1045],
  "215": [-1106, 1045],
  "216": [-978, 1045],
  "217": [-828, 1045],
  "218": [-568, 984],
  "219": [-1110, 925],
  "220": [-978, 925],
  "221": [-1411, 876],
  "222": [-1248, 924],
  "223": [-1102, 790],
  "224": [-978, 790],
  "225": [-772, 790],
  "226": [-532, 790],
  "227": [-1558, 738],
  "228": [-1404, 712],
  "229": [-1268, 766],
  "230": [-1048, 652],
  "231": [-827, 652],
  "300": [-214, 1342],
  "301": [10, 1380],
  "302": [435, 1343],
  "303": [856, 1257],
  "304": [-46, 1205],
  "305": [100, 1205],
  "306": [-46, 1010],
  "307": [120, 1064],
  "308": [671, 1064],
  "309": [119, 966],
  "310": [260, 966],
  "311": [404, 962],
  "312": [515, 979],
  "313": [649, 963],
  "314": [892, 959],
  "315": [-2, 824],
  "316": [186, 823],
  "317": [364, 824],
  "319": [514, 780],
  "320": [858, 817],
  "321": [26, 626],
  "322": [366, 640],
  "323": [514, 664],
  "324": [661, 664],
  "325": [858, 632],
  "326": [376, 488],
  "327": [607, 488],
  "400": [-1510, 476],
  "401": [-597, 532],
  "402": [-1713, 268],
  "403": [-1068, 399],
  "404": [-834, 399],
  "405": [-1392, 233],
  "406": [-1164, 233],
  "407": [-964, 233],
  "408": [-1421, 6],
  "409": [-1164, 62],
  "410": [-964, 62],
  "411": [-794, 62],
  "500": [-284, 50],
  "501": [296, 245],
  "502": [773, 186],
  "503": [630, -40],
  "504": [795, -464],
  "600": [-1502, -200],
  "601": [-841, -364],
  "602": [-1670, -609],
  "603": [-1111, -784],
  "604": [-1334, -946],
  "605": [-1500, -1111],
  "606": [-1795, -1294],
  "607": [-1602, -1294],
  "700": [196, -444],
  "701": [46, -612],
  "702": [260, -612],
  "703": [438, -652],
  "704": [145, -882],
  "705": [590, -896],
  "800": [-1588, -1510],
  "801": [-1391, -1458],
  "802": [-1216, -1552],
  "803": [-1674, -1752],
  "804": [-1492, -1674],
  "805": [-1236, -1684],
  "806": [-1438, -1794],
  "807": [-1164, -1802],
  "808": [-1339, -1926],
  "809": [-1084, -1950],
  "900": [-878, -1111],
  "901": [-364, -898],
  "902": [-444, -1145],
  "903": [-688, -1350],
  "904": [-844, -1636],
  "905": [-458, -1586],
  "906": [-734, -2062],
  "907": [-681, -2326],
  "908": [-395, -2338],
  "909": [-139, -2278],
  "1000": [3, -1528],
  "1001": [470, -1325],
  "1002": [896, -1287],
  "1003": [738, -1425],
  "1004": [878, -1424],
  "1005": [534, -1583],
  "1006": [738, -1558],
  "1007": [878, -1560],
  "1008": [738, -1694],
  "1009": [894, -1688],
  "1010": [807, -1940],
  "1011": [533, -2096],
  "1100": [1320, -1059],
  "1101": [1530, -1116],
  "1102": [1320, -1245],
  "1103": [1466, -1282],
  "1104": [1634, -1245],
  "1105": [1320, -1452],
  "1106": [1466, -1452],
  "1107": [1570, -1448],
  "1108": [1548, -1664],
  "1109": [1255, -1738],
  "1200": [1290, 958],
  "1201": [1482, 957],
  "1202": [1840, 821],
  "1203": [1152, 590],
  "1204": [1890, 605],
  "1205": [1344, 319],
  "1206": [1551, 143],
  "1207": [1850, 143],
  "1208": [983, -88],
  "1209": [1515, -374],
  "1210": [1084, -505],
  "1211": [1136, -788],
  "1212": [1407, -606],
  "1213": [1700, -671]
};
function postalPosition(text) {
  if (!text) return null;
  const tagged = /\b(?:plz|postal(?:\s*code)?|p)\s*[-:#.]?\s*(\d{3,4})\b/i.exec(text)?.[1];
  const postal = tagged && ERLC_POSTALS[tagged] ? tagged : (text.match(/(?<![\d.,])\d{3,4}(?![\d.,])/g) ?? []).find((n) => ERLC_POSTALS[n]);
  const p = postal ? ERLC_POSTALS[postal] : void 0;
  return postal && p ? { postal, x: p[0], z: p[1] } : null;
}
var postalLabels = (width, height) => Object.entries(ERLC_POSTALS).map(([k, [x, z10]]) => ({ k, px: (x + ERLC_MAP_SIZE / 2) * width / ERLC_MAP_SIZE, py: (z10 + ERLC_MAP_SIZE / 2) * height / ERLC_MAP_SIZE }));
function postalMatchRate(m, samples) {
  const labels = postalLabels(m.width, m.height);
  const known = samples.filter((s) => ERLC_POSTALS[s[2]]);
  if (!known.length) return 0;
  const hits = known.filter(([x, z10, k]) => {
    const px = m.originX + x * m.scale, py = m.originY + z10 * m.scale;
    let best = labels[0], d = Infinity;
    for (const l of labels) {
      const dd2 = (l.px - px) ** 2 + (l.py - py) ** 2;
      if (dd2 < d) {
        d = dd2;
        best = l;
      }
    }
    return best.k === k;
  });
  return hits.length / known.length;
}
function fitPostalCalibration(samples, width = ERLC_MAP_SIZE, height = ERLC_MAP_SIZE) {
  const labels = new Map(postalLabels(width, height).map((l) => [l.k, l]));
  const fit = (pts2) => {
    const n = pts2.length, mx = pts2.reduce((a, p) => a + p.x, 0) / n, mz = pts2.reduce((a, p) => a + p.z, 0) / n;
    const mlx = pts2.reduce((a, p) => a + p.lx, 0) / n, mly = pts2.reduce((a, p) => a + p.ly, 0) / n;
    const den = pts2.reduce((a, p) => a + (p.x - mx) ** 2 + (p.z - mz) ** 2, 0);
    if (!den) return null;
    const scale = pts2.reduce((a, p) => a + (p.x - mx) * (p.lx - mlx) + (p.z - mz) * (p.ly - mly), 0) / den;
    return { scale, originX: mlx - scale * mx, originY: mly - scale * mz };
  };
  let pts = samples.flatMap(([x, z10, k]) => {
    const l = labels.get(k);
    return l && Number.isFinite(x) && Number.isFinite(z10) ? [{ x, z: z10, lx: l.px, ly: l.py, k }] : [];
  });
  const enough = (p) => p.length >= 20 && new Set(p.map((q) => q.k)).size >= 6 && Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x)) >= 1e3 && Math.max(...p.map((q) => q.z)) - Math.min(...p.map((q) => q.z)) >= 1e3;
  if (!enough(pts)) return null;
  let f = fit(pts);
  if (!f) return null;
  const err = (p, c) => Math.hypot(c.originX + p.x * c.scale - p.lx, c.originY + p.z * c.scale - p.ly);
  const med = [...pts.map((p) => err(p, f))].sort((a, b) => a - b)[Math.floor(pts.length / 2)];
  const kept = pts.filter((p) => err(p, f) <= Math.max(3 * med, 150));
  if (enough(kept)) {
    pts = kept;
    f = fit(pts) ?? f;
  }
  if (!(f.scale > 0)) return null;
  const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  const out = { scale: r(f.scale, 4), originX: r(f.originX), originY: r(f.originY) };
  return { ...out, n: pts.length, postals: new Set(pts.map((p) => p.k)).size, match: postalMatchRate({ width, height, ...out }, samples) };
}
var gameToPixel = (m, x, z10) => ({ px: m.originX + x * m.scale, py: m.originY + z10 * m.scale });
var onErlcMap = (x, z10) => typeof x === "number" && typeof z10 === "number" && Number.isFinite(x) && Number.isFinite(z10) && Math.abs(x) <= ERLC_MAP_SIZE / 2 && Math.abs(z10) <= ERLC_MAP_SIZE / 2;
function poiForPlace(place, pois) {
  const norm2 = (v) => v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const p = place ? norm2(place) : "";
  if (p.length < 3) return null;
  const usable = pois.filter((o) => o.x !== null && o.z !== null && norm2(o.name).length >= 3);
  return usable.find((o) => norm2(o.name) === p) ?? usable.find((o) => p.includes(norm2(o.name)) || norm2(o.name).includes(p)) ?? null;
}
function fitCallCalibration(pairs) {
  let rest = pairs;
  for (; ; ) {
    const fit = fitExact(rest);
    if (fit || rest.length - 1 < Math.max(3, Math.ceil(pairs.length * 2 / 3))) return fit;
    const drop = rest.map((_, i) => i).sort((a, b) => outlierScore(rest, b) - outlierScore(rest, a))[0];
    rest = rest.filter((_, i) => i !== drop);
  }
}
function outlierScore(pairs, i) {
  const others = pairs.filter((_, j) => j !== i);
  const line = (from, to) => {
    const n = from.length, mf = from.reduce((a2, b) => a2 + b, 0) / n, mt = to.reduce((a2, b) => a2 + b, 0) / n;
    const sxx = from.reduce((a2, f) => a2 + (f - mf) ** 2, 0) || 1;
    const a = from.reduce((acc, f, k) => acc + (f - mf) * (to[k] - mt), 0) / sxx;
    return { a, b: mt - a * mf };
  };
  const lx = line(others.map((p2) => p2.px), others.map((p2) => p2.cx)), lz = line(others.map((p2) => p2.pz), others.map((p2) => p2.cz));
  const p = pairs[i];
  return Math.abs(lx.a * p.px + lx.b - p.cx) + Math.abs(lz.a * p.pz + lz.b - p.cz);
}
function fitExact(pairs) {
  if (pairs.length < 3) return null;
  const axis = (from, to) => {
    const n = from.length, mf = from.reduce((a2, b2) => a2 + b2, 0) / n, mt = to.reduce((a2, b2) => a2 + b2, 0) / n;
    const sxx = from.reduce((a2, f) => a2 + (f - mf) ** 2, 0);
    if (Math.max(...from) - Math.min(...from) < 100 || sxx === 0) return null;
    const a = from.reduce((acc, f, i) => acc + (f - mf) * (to[i] - mt), 0) / sxx, b = mt - a * mf;
    const worst = Math.max(...from.map((f, i) => Math.abs(a * f + b - to[i])));
    return worst <= 60 && a > 0 ? { a, b } : null;
  };
  const x = axis(pairs.map((p) => p.px), pairs.map((p) => p.cx)), z10 = axis(pairs.map((p) => p.pz), pairs.map((p) => p.cz));
  return x && z10 ? { ax: x.a, bx: x.b, az: z10.a, bz: z10.b, n: pairs.length } : null;
}
var applyCallCalibration = (c, x, z10) => ({ x: c.ax * x + c.bx, z: c.az * z10 + c.bz });
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
var WANTED_MATCH_TYPES = ["ROBLOX_ID", "NAME", "ALIAS", "NAME_ID_MISMATCH", "ERLC_WANTED"];
var WANTED_MATCH_LABELS = {
  ROBLOX_ID: "Roblox-ID stimmt \xFCberein",
  NAME: "Nur Roblox-Name stimmt \xFCberein",
  ALIAS: "Nur Alias stimmt \xFCberein",
  NAME_ID_MISMATCH: "Name gleich, Roblox-ID abweichend",
  ERLC_WANTED: "Im Spiel gesucht (ER:LC-Wanted-Sterne)"
};
var WANTED_HIT_STATUSES = ["NEW", "REVIEW_REQUIRED", "ACKNOWLEDGED", "CONFIRMED", "REJECTED", "ENDED"];
var WANTED_HIT_STATUS_LABELS = {
  NEW: "Neu",
  REVIEW_REQUIRED: "Manuelle Pr\xFCfung erforderlich",
  ACKNOWLEDGED: "Zur Kenntnis genommen",
  CONFIRMED: "Manuell best\xE4tigt",
  REJECTED: "Verworfen (nicht die Person)",
  ENDED: "Beendet (nicht mehr im Spiel gesucht)"
};
function matchWantedPlayer(player, subjects) {
  const lc = (v) => v.trim().toLowerCase();
  const name = lc(player.name);
  const out = [];
  for (const s of subjects) {
    if (player.id && s.robloxUserId && player.id === s.robloxUserId) {
      out.push({ wantedId: s.wantedId, personId: s.personId, matchType: "ROBLOX_ID", identified: true });
      continue;
    }
    if (!name) continue;
    const idsDiffer = !!player.id && !!s.robloxUserId && player.id !== s.robloxUserId;
    if (lc(s.robloxUsername) === name) out.push({ wantedId: s.wantedId, personId: s.personId, matchType: idsDiffer ? "NAME_ID_MISMATCH" : "NAME", identified: false });
    else if (s.aliases.some((a) => lc(a) === name)) out.push({ wantedId: s.wantedId, personId: s.personId, matchType: idsDiffer ? "NAME_ID_MISMATCH" : "ALIAS", identified: false });
  }
  return out;
}
var JOIN_LOG_TOLERANCE_MS = 6e4;
var playerKey = (p) => p.id ? `id:${p.id}` : `name:${p.name.trim().toLowerCase()}`;
function diffPresence(current, previous, joins = /* @__PURE__ */ new Map()) {
  const prev = new Map(previous.map((p) => [p.playerKey, p]));
  const seen = /* @__PURE__ */ new Set();
  const joined = [], stayed = [], rejoined = [];
  for (const p of current) {
    const k = playerKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    const row = prev.get(k);
    if (!row) joined.push(p);
    else if ((joins.get(k) ?? 0) > Math.max(row.lastSeenAt.getTime(), row.joinedAt.getTime() + JOIN_LOG_TOLERANCE_MS)) rejoined.push({ player: p, row });
    else stayed.push({ player: p, row });
  }
  const left = previous.filter((p) => !seen.has(p.playerKey));
  return { joined, stayed, rejoined, left };
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
function dangerLevelOf(cfg, key3) {
  return cfg.levels.find((l) => l.key === key3) ?? cfg.levels.find((l) => l.key === LEGACY_DANGER[key3 ?? ""]) ?? cfg.levels[0];
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
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key3) => {
    const base = { action: ctx.action, entityType: ctx.entityType ?? "", entityId: ctx.entityId ?? "", actor: ctx.actor ?? "System" };
    const v = key3 in base ? base[key3] : fieldValue(ctx.after, key3.startsWith("after.") ? key3.slice(6) : key3);
    const s = v === void 0 || v === null ? "\u2014" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return s.slice(0, 300);
  });
}

// src/labels.ts
var STATUS_LABEL = {
  SUSPECT: "Verd\xE4chtige Person",
  WITNESS: "Zeuge",
  VICTIM: "Opfer",
  PERSON_OF_INTEREST: "Relevante Person",
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
  const t2 = created ? new Date(created).getTime() : NaN;
  if (!Number.isFinite(t2)) return "\u2014";
  const days = Math.max(0, Math.floor((now - t2) / 864e5));
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
var newVoiceRoom = (id3, guildId = "") => ({
  id: id3,
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
  const get = (t2) => parts.find((p) => p.type === t2)?.value ?? "";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), minute: Number(get("hour")) * 60 + Number(get("minute")) };
}
function isSupportOpen(times, d = /* @__PURE__ */ new Date(), timeZone = "Europe/Berlin") {
  if (!times.length) return true;
  const { day, minute } = localTime(d, timeZone);
  return times.some((t2) => {
    const from = minutes(t2.from), to = minutes(t2.to);
    if (from <= to) return t2.days.includes(day) && minute >= from && minute < to;
    return t2.days.includes(day) && minute >= from || t2.days.includes((day + 6) % 7) && minute < to;
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
function renderStaffList(l, members, roleName = (id3) => `<@&${id3}>`, now = /* @__PURE__ */ new Date()) {
  const used = /* @__PURE__ */ new Set();
  const blocks = [];
  l.sections.forEach((s, i) => {
    let list2 = members.filter((m) => m.roleIds.includes(s.roleId));
    if (l.onlyHighest) {
      list2 = list2.filter((m) => !used.has(m.id));
      list2.forEach((m) => used.add(m.id));
    }
    list2.sort((a, b) => a.name.localeCompare(b.name, "de"));
    const head = s.label ? `**${s.label}**` : roleName(s.roleId);
    const lines = list2.length ? list2.map((m) => `${l.bullet} ${l.mention ? `<@${m.id}>` : m.name}`) : [`${l.bullet} ${l.emptyText || "/"}`];
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
  const embeds = texts.map((t2, i) => ({ color: c, ...i === 0 && l.title ? { title: l.title } : {}, description: t2.trim() || "\u200B" }));
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
  inline: z2.boolean().default(false),
  /** Trennlinie vor diesem Feld (nur Listen-Darstellung) */
  separator: z2.boolean().default(false)
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
  pingRoleIds: z2.array(sf2).max(10).default([]),
  /** Darstellung in Discord: FIELDS = Embed-Felder, LIST = „➣ **Feld:** Wert“-Liste mit Trennlinien */
  layout: z2.enum(["FIELDS", "LIST"]).default("FIELDS")
});
var PERIOD_LABEL = { DAILY: "Tagesbericht", WEEKLY: "Wochenbericht", FREE: "Bericht" };
function periodStart(period, d = /* @__PURE__ */ new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (period === "WEEKLY") x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7);
  return x;
}
var dd = (d) => d.toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
function isoWeek(d) {
  const t2 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t2.setUTCDate(t2.getUTCDate() + 4 - (t2.getUTCDay() || 7));
  return Math.ceil(((t2.getTime() - Date.UTC(t2.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
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
function policeReportFields() {
  const f = (id3, label, type, o = {}) => ({ id: id3, label, type, placeholder: "", required: false, options: [], maxLength: type === "number" ? 10 : type === "long" ? 1e3 : 100, inline: false, separator: false, ...o });
  return [
    f("roblox", "Roblox-Username", "short", { required: true }),
    f("dienstzeit", "Zeitraum", "short", { placeholder: "wird automatisch aus der Dienstzeit gef\xFCllt" }),
    f("verfolgungen", "Verfolgungen", "number", { separator: true }),
    f("dispatch", "Dispatch", "number"),
    f("geblitzt", "Geblitzt", "number", { separator: true }),
    f("verkehrskontrollen", "Verkehrskontrollen", "number"),
    f("festnahmen", "Festnahmen", "number", { separator: true }),
    f("geiselnahmen", "Geiselnahmen", "number"),
    f("notiz", "Notiz", "long", { separator: true })
  ];
}
var isRobloxField = (f) => f.type !== "select" && /roblox/i.test(`${f.id} ${f.label}`);
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
  const t2 = (ms) => new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone });
  const open = sessions.some((x) => !x.endedAt);
  return `${real.map((x, i) => `${t2(x.s)}\u2013${open && i === real.length - 1 && x.e >= Math.min(now.getTime(), to.getTime()) - 6e4 ? "jetzt" : t2(x.e)}`).join(", ")} (${fmtDur(total)})`;
}
function cleanReportValues(t2, input) {
  const values = {};
  for (const f of t2.fields) {
    const v = String(input[f.id] ?? "").trim().slice(0, f.maxLength);
    if (f.required && !v) return { error: `\u201E${f.label}\u201C fehlt.` };
    if (v && f.type === "number" && !/^-?\d+([.,]\d+)?$/.test(v)) return { error: `\u201E${f.label}\u201C muss eine Zahl sein.` };
    if (v && f.type === "select" && f.options.length && !f.options.includes(v)) return { error: `\u201E${f.label}\u201C: bitte eine der M\xF6glichkeiten w\xE4hlen (${f.options.join(", ")}).` };
    values[f.id] = v;
  }
  return { values };
}
var REPORT_STATUS_LABEL = { SUBMITTED: "\u{1F4E8} Eingereicht", REVIEWED: "\u2705 Gepr\xFCft", RETURNED: "\u21A9\uFE0F Zur Nachbesserung" };
var LINE_LONG = "\u23AF".repeat(20);
var LINE_SHORT = "\u23AF".repeat(12);
var statusLines = (r) => r.status !== "SUBMITTED" ? `
**${REPORT_STATUS_LABEL[r.status] ?? r.status}**${r.reviewerName ? ` von ${r.reviewerName}` : ""}${r.reviewNote ? `
> ${r.reviewNote.replace(/\n/g, "\n> ").slice(0, 900)}` : ""}` : "";
function listEmbed(t2, r) {
  const parts = [LINE_LONG, ""];
  t2.fields.forEach((f, i) => {
    if (f.separator && i > 0) parts.push("", LINE_SHORT, "");
    parts.push(`\u27A3 **${f.label}:** ${(r.values[f.id] ?? "").slice(0, 1e3)}`);
  });
  const status = statusLines(r);
  let description = parts.join("\n");
  if (description.length + status.length > 4096) description = `${description.slice(0, 4090 - status.length)}\u2026`;
  return {
    title: `${t2.emoji ? `${t2.emoji} ` : ""}${t2.name} ${r.authorName}`.slice(0, 256),
    description: `${description}${status ? `
${status}` : ""}`,
    color: parseInt(t2.color.slice(1), 16),
    footer: `${r.number} | ${r.authorName}${r.authorDiscordId ? ` ( ${r.authorDiscordId} )` : ""}${r.edited ? " \xB7 bearbeitet" : ""}`.slice(0, 2048),
    timestamp: new Date(r.updatedAt).toISOString()
  };
}
function reportMessage(t2, r, id3) {
  const embed = t2.layout === "LIST" ? listEmbed(t2, r) : fieldsEmbed(t2, r);
  embed.color = r.status === "REVIEWED" ? 2278750 : r.status === "RETURNED" ? 16096779 : embed.color;
  return { embeds: [embed], buttons: [
    { id: `drep:edit:${id3}`, label: "Bearbeiten", emoji: "\u270F\uFE0F", style: "secondary" },
    ...r.status !== "REVIEWED" ? [{ id: `drep:rev:${id3}`, label: "Gepr\xFCft", emoji: "\u2705", style: "success" }] : [],
    ...r.status !== "RETURNED" ? [{ id: `drep:ret:${id3}`, label: "Zur Nachbesserung", emoji: "\u21A9\uFE0F", style: "secondary" }] : []
  ] };
}
function fieldsEmbed(t2, r) {
  const fields = t2.fields.filter((f) => r.values[f.id]).map((f) => ({ name: f.label, value: r.values[f.id].slice(0, 1024), inline: f.inline }));
  return {
    title: `${t2.emoji ? `${t2.emoji} ` : ""}${t2.name} \u2013 ${periodLabel(t2.period, r.periodStart)}`.slice(0, 256),
    description: `**Verfasser:** ${r.authorDiscordId ? `<@${r.authorDiscordId}>` : r.authorName}${statusLines(r)}`,
    color: parseInt(t2.color.slice(1), 16),
    fields: fields.slice(0, 25),
    footer: `${r.number}${r.edited ? " \xB7 bearbeitet" : ""}`,
    timestamp: new Date(r.updatedAt).toISOString()
  };
}

// src/duty-week.ts
var WEEK_TIMEZONE = "Europe/Berlin";
function localParts(at, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(at).map((x) => [x.type, x.value]));
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second), wd };
}
function offsetMs(at, timeZone) {
  const l = localParts(at, timeZone);
  return Date.UTC(l.y, l.m - 1, l.d, l.h, l.min, l.s) - Math.floor(at.getTime() / 1e3) * 1e3;
}
function localMidnight(y, m, d, timeZone = WEEK_TIMEZONE) {
  const guess = Date.UTC(y, m - 1, d);
  let t2 = guess - offsetMs(new Date(guess), timeZone);
  t2 = guess - offsetMs(new Date(t2), timeZone);
  return new Date(t2);
}
function weekStartOf(at, timeZone = WEEK_TIMEZONE) {
  const l = localParts(at, timeZone);
  return localMidnight(l.y, l.m, l.d - (l.wd - 1), timeZone);
}
function nextWeekStart(weekStart, timeZone = WEEK_TIMEZONE) {
  const l = localParts(new Date(weekStart.getTime() + 84 * 36e5), timeZone);
  return localMidnight(l.y, l.m, l.d - (l.wd - 1) + 7, timeZone);
}
function weekIso(weekStart, timeZone = WEEK_TIMEZONE) {
  const l = localParts(new Date(weekStart.getTime() + 84 * 36e5), timeZone);
  const date = new Date(Date.UTC(l.y, l.m - 1, l.d));
  date.setUTCDate(date.getUTCDate() + 4 - l.wd);
  const year = date.getUTCFullYear();
  return { year, week: Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 864e5 + 1) / 7) };
}
function weekKey(weekStart, timeZone = WEEK_TIMEZONE) {
  const l = localParts(new Date(weekStart.getTime() + 84 * 36e5), timeZone);
  const mon = new Date(Date.UTC(l.y, l.m - 1, l.d - (l.wd - 1)));
  return mon.toISOString().slice(0, 10);
}
function weekLabel(weekStart, timeZone = WEEK_TIMEZONE) {
  const { year, week } = weekIso(weekStart, timeZone);
  const [y, m, d] = weekKey(weekStart, timeZone).split("-").map(Number);
  const f = (x, withYear = false) => x.toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", ...withYear ? { year: "numeric" } : {} });
  return `KW ${week}/${year} \xB7 ${f(new Date(Date.UTC(y, m - 1, d)))}\u2013${f(new Date(Date.UTC(y, m - 1, d + 6)), true)}`;
}
var WEEK_COUNTED_STATUSES = ["ON_DUTY", "TRAINING", "ADMINISTRATIVE"];
function weekTotals(sessions, from, to, now = /* @__PURE__ */ new Date()) {
  const rows = /* @__PURE__ */ new Map();
  const counted = new Set(WEEK_COUNTED_STATUSES);
  for (const s of sessions) {
    const a = Math.max(s.startedAt.getTime(), from.getTime());
    const b = Math.min((s.endedAt ?? now).getTime(), to.getTime());
    if (b <= a) continue;
    const r = rows.get(s.userId) ?? { userId: s.userId, minutes: 0, breakMinutes: 0, byStatus: {}, sessions: 0 };
    const min = (b - a) / 6e4;
    r.byStatus[s.status] = (r.byStatus[s.status] ?? 0) + min;
    if (counted.has(s.status)) r.minutes += min;
    if (s.status === "BREAK") r.breakMinutes += min;
    r.sessions++;
    rows.set(s.userId, r);
  }
  return [...rows.values()].map((r) => ({ ...r, minutes: Math.round(r.minutes), breakMinutes: Math.round(r.breakMinutes), byStatus: Object.fromEntries(Object.entries(r.byStatus).map(([k, v]) => [k, Math.round(v)])) })).filter((r) => r.minutes > 0 || r.breakMinutes > 0).sort((x, y) => y.minutes - x.minutes || y.sessions - x.sessions);
}

// src/modules.ts
var MODULES = [
  { key: "core", name: "Grundsystem", description: "Dashboard, Benutzer, Rollen & Rechte, Einstellungen, Audit, Server", system: true, permissionPrefixes: ["dashboard", "settings", "users", "roles", "audit", "studio", "analytics", "servers", "modules"] },
  { key: "cad", name: "CAD-Leitstelle", description: "Eins\xE4tze, Einheiten, Notrufe, Karte, Funk, Polizeifahrzeuge", permissionPrefixes: ["cad", "fleet"] },
  { key: "mdt", name: "MDT", description: "Personen, Fahrzeuge, Haftbefehle, Bu\xDFgelder", permissionPrefixes: ["persons", "vehicles", "wanted", "tickets"] },
  { key: "dispatch", name: "Dispatch", description: "Einsatzverwaltung und Einheiten-Board", permissionPrefixes: ["dispatch", "incidents"] },
  { key: "reports", name: "Berichte", description: "Einsatzberichte, Tages-/Wochenberichte", permissionPrefixes: ["reports", "dutyreports"] },
  { key: "shift_logs", name: "Shift Logs", description: "Dienststatus, Schichten, Dienstzeiten, Wochenranglisten", permissionPrefixes: ["team"] },
  { key: "investigations", name: "Beschwerden", description: "Beschwerden", permissionPrefixes: ["complaints"] },
  { key: "personnel", name: "Personal", description: "Personalakte, Bef\xF6rderungen, Ausbildung, Abmeldungen, Dienstnummern", permissionPrefixes: ["personnel", "promotion", "transfer", "training", "exam", "warning", "awards", "dienstnummer", "leave"] },
  { key: "applications", name: "Bewerbungen", description: "Bewerbungen, Qualifikationen, Academy, Team-Chance", permissionPrefixes: ["applications", "qualifications", "academy", "teamchance"] },
  { key: "support", name: "Support-Tickets", description: "Ticket-System f\xFCr Discord", permissionPrefixes: ["ticket"] },
  { key: "sek", name: "SEK", description: "Spezialeinsatzkommando", permissionPrefixes: ["sek"] },
  { key: "message_builder", name: "Discord Message Builder", description: "Nachrichten und Embeds bauen, Vorlagen, Versand \xFCber den Bot, Versandhistorie", permissionPrefixes: ["messagebuilder"] },
  { key: "communication", name: "Kommunikation", description: "Nachrichten, Funk-Codes, Funk-Whitelist", permissionPrefixes: ["communication", "radio", "radiowhitelist"] }
];
var MODULE_KEYS = MODULES.map((m) => m.key);
var moduleDef = (key3) => MODULES.find((m) => m.key === key3);
function moduleOfPermission(permission) {
  const prefix = permission.split(".")[0] ?? "";
  return MODULES.find((m) => m.permissionPrefixes.includes(prefix))?.key ?? "core";
}
function moduleDependencyError(key3, enabled, state) {
  const def = moduleDef(key3);
  if (!def) return "Unbekanntes Modul.";
  if (def.system && !enabled) return `\u201E${def.name}\u201C ist ein Systemmodul und kann nicht deaktiviert werden.`;
  if (enabled) {
    const missing = (def.dependsOn ?? []).filter((d) => state[d] === false);
    if (missing.length) return `\u201E${def.name}\u201C braucht: ${missing.map((m) => moduleDef(m)?.name ?? m).join(", ")}.`;
  } else {
    const users = MODULES.filter((m) => (m.dependsOn ?? []).includes(key3) && state[m.key] !== false);
    if (users.length) return `\u201E${def.name}\u201C wird noch gebraucht von: ${users.map((m) => m.name).join(", ")}.`;
  }
  return null;
}
var BOT_COMMAND_MODULES = {
  cad: "cad",
  bericht: "reports",
  dienstbericht: "reports",
  person: "mdt",
  kennzeichen: "mdt",
  fahndungen: "mdt",
  fahndung: "mdt",
  shift: "shift_logs",
  dienst: "shift_logs",
  dienststunden: "shift_logs",
  team: "shift_logs",
  dienstpanel: "shift_logs",
  teamliste: "shift_logs",
  einheiten: "dispatch",
  einheitstatus: "dispatch",
  einsaetze: "dispatch",
  einsatz: "dispatch",
  einsatzinfo: "dispatch",
  einsatzstatus: "dispatch",
  einsatzzuweisen: "dispatch",
  beschwerde: "investigations",
  abmeldung: "personnel",
  leave: "personnel",
  ausbildung: "personnel",
  verwarnen: "personnel",
  teamchance: "applications",
  bewerbung: "applications",
  bewerbungspanel: "applications",
  qualipanel: "applications",
  support: "support",
  funkcode: "communication",
  funk: "communication",
  funkantrag: "communication",
  funkstatus: "communication",
  funkfreigabe: "communication"
};
var commandsForServer = (all, disabledModules) => all.filter((c) => !disabledModules.includes(BOT_COMMAND_MODULES[c.name] ?? "core"));

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
var HR_EVENTS = ["promotion.requested", "promotion.approved", "promotion.rejected", "promotion.executed", "transfer.requested", "transfer.approved", "transfer.rejected", "warning.created", "award.granted", "training.passed", "exam.passed", "exam.submitted"];
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
  "exam.passed": "Pr\xFCfung bestanden",
  "exam.submitted": "Pr\xFCfung abgegeben (wartet auf Bewertung)"
};
var stageSchema = z3.object({ id: uuid, name: z3.string().trim().min(1).max(60), roleIds: z3.array(uuid).max(20).default([]) });
var REQUEST_STATUSES = ["OPEN", "IN_REVIEW", "APPROVED", "REJECTED", "DEFERRED", "EXECUTED", "CANCELLED"];
var requestStatusDefSchema = z3.object({ label: z3.string().max(40), emoji: z3.string().max(16) });
var WARNING_TEMPLATE = "Wer: {mitglied}\nGrund: {grund}\nVerwarnungen: {anzahl}/{grenze}";
var OLD_WARNING_TEMPLATE = "**Wer:** {mitglied}\n**Grund:** {grund}\n**Verwarnungen:** {anzahl}/{grenze}";
var hrConfigSchema = z3.object({
  statuses: z3.array(hrStatusSchema).max(30).default([]),
  departments: z3.array(departmentSchema).max(50).default([]),
  absenceTypes: z3.array(absenceTypeSchema).max(30).default([]),
  warningSeverities: z3.array(severitySchema).max(20).default([]),
  /** Später ergänzte Standardwerte, die schon einmal in gespeicherte Einstellungen übernommen wurden (Löschen bleibt dann gelöscht). */
  addedDefaults: z3.array(z3.string().max(40)).max(50).default([]),
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
    template: z3.string().max(1500).default(WARNING_TEMPLATE),
    /** Darstellung in Discord: einfacher Text („Wer: … / Grund: … / Verwarnungen: 1/3“) oder als Kasten (Embed) */
    style: z3.enum(["text", "embed"]).default("text"),
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
var PERMANENT_SEVERITY = { key: "PERMANENT", label: "Dauerhafter Vermerk", emoji: "\u26AB", color: "#475569", defaultDays: 0 };
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
    { key: "SEVERE", label: "Schwerwiegender Versto\xDF", emoji: "\u{1F534}", color: "#ef4444", defaultDays: 180 },
    PERMANENT_SEVERITY
  ],
  addedDefaults: ["severity.PERMANENT"],
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
    warningSeverities: !raw.warningSeverities ? DEFAULT_HR_CONFIG.warningSeverities : c.addedDefaults.includes("severity.PERMANENT") || c.warningSeverities.some((s) => s.key === PERMANENT_SEVERITY.key) || c.warningSeverities.length >= 20 ? c.warningSeverities : [...c.warningSeverities, PERMANENT_SEVERITY],
    addedDefaults: [.../* @__PURE__ */ new Set([...c.addedDefaults, "severity.PERMANENT"])],
    warningCategories: raw.warningCategories ? c.warningCategories : DEFAULT_HR_CONFIG.warningCategories,
    awards: raw.awards ? c.awards : DEFAULT_HR_CONFIG.awards,
    sections: { ...DEFAULT_HR_CONFIG.sections, ...c.sections },
    fields: { ...DEFAULT_HR_CONFIG.fields, ...c.fields },
    notifications: raw.notifications ? c.notifications : DEFAULT_HR_CONFIG.notifications,
    warnings: c.warnings.template === OLD_WARNING_TEMPLATE ? { ...c.warnings, template: WARNING_TEMPLATE } : c.warnings
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

// src/exams.ts
import { z as z4 } from "zod";
var EXAM_QUESTION_TYPES = ["SINGLE", "MULTI", "YESNO", "TEXT", "NUMBER", "ORDER", "MATCH", "GAP"];
var EXAM_QUESTION_TYPE_LABEL = {
  SINGLE: "Single Choice",
  MULTI: "Multiple Choice",
  YESNO: "Ja/Nein",
  TEXT: "Freitext",
  NUMBER: "Zahl",
  ORDER: "Reihenfolge",
  MATCH: "Zuordnung",
  GAP: "L\xFCckentext"
};
var EXAM_QUESTION_TYPE_HINT = {
  SINGLE: "Genau eine Antwort ist richtig.",
  MULTI: "Mehrere Antworten k\xF6nnen richtig sein.",
  YESNO: "Ja oder Nein.",
  TEXT: "Freie Antwort \u2013 automatisch \xFCber Stichworte oder durch einen Pr\xFCfer.",
  NUMBER: "Zahl, optional mit Toleranz.",
  ORDER: "Eintr\xE4ge in die richtige Reihenfolge bringen. Im Editor in der richtigen Reihenfolge eintragen \u2013 sie werden beim Versuch gemischt.",
  MATCH: "Jedem Begriff links das passende Gegenst\xFCck rechts zuordnen. Im Editor jeweils als richtiges Paar eintragen.",
  GAP: "L\xFCcken im Text mit {{Antwort}} markieren, Alternativen mit | trennen, z. B. \u201EInnerorts gilt {{50|f\xFCnfzig}} km/h\u201C."
};
var EXAM_SHUFFLE_TYPES = ["SINGLE", "MULTI", "ORDER", "MATCH"];
var questionSchema = z4.object({
  id: z4.string().min(1).max(40),
  type: z4.enum(EXAM_QUESTION_TYPES),
  text: z4.string().trim().min(1).max(2e3),
  /** Antwortmöglichkeiten (Choice), Einträge in richtiger Reihenfolge (ORDER) oder linke Seite (MATCH) */
  options: z4.array(z4.string().trim().min(1).max(200)).max(12).default([]),
  /** MATCH: rechte Seite – matches[i] gehört zu options[i] */
  matches: z4.array(z4.string().trim().min(1).max(200)).max(12).default([]),
  /** richtige Antwort(en): Option-Index als Text, „ja“/„nein“, Zahl oder Stichworte (Freitext ohne Stichworte → Prüfer) */
  correct: z4.array(z4.string().max(200)).max(12).default([]),
  points: z4.number().min(0).max(100).default(1),
  /** Teilpunkte (Multiple Choice, Freitext-Stichworte, Reihenfolge, Zuordnung, Lückentext) */
  partial: z4.boolean().default(false),
  /** NUMBER: erlaubte Abweichung */
  tolerance: z4.number().min(0).max(1e9).default(0),
  /** Erklärung, die nach der Bewertung (Einsicht mit Lösungen) angezeigt wird */
  explanation: z4.string().max(2e3).nullable().default(null),
  /** optionales Bild (nur https) */
  image: z4.string().max(500).regex(/^https:\/\//i, "Bild-Link muss mit https:// beginnen").nullable().default(null)
});
function parseQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q) => {
    const r = questionSchema.safeParse(q);
    return r.success ? [r.data] : [];
  });
}
var GAP = /\{\{([^{}]*)\}\}/g;
var gapAnswers = (text) => [...text.matchAll(GAP)].map((m) => (m[1] ?? "").split("|").map((s) => s.trim()).filter(Boolean));
var maskGaps = (text) => text.replace(GAP, "{{}}");
function splitGaps(text) {
  const out = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(GAP)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(n++);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
var norm = (x) => String(x ?? "").trim().toLowerCase().replace(/\s+/g, " ");
var num = (x) => {
  const s = String(x ?? "").trim().replace(",", ".");
  return s === "" ? NaN : Number(s);
};
var list = (a) => Array.isArray(a) ? a.map((x) => String(x ?? "")) : a == null || a === "" ? [] : [String(a)];
var round = (n) => Math.round(n * 100) / 100;
function isAnswered(q, a) {
  const l = list(a);
  if (q.type === "ORDER" || q.type === "MATCH") return l.length === q.options.length && l.every((x) => x !== "");
  if (q.type === "GAP") {
    const n = splitGaps(q.text).filter((s) => typeof s === "number").length;
    return l.filter((x) => x.trim()).length >= n && n > 0;
  }
  return l.some((x) => x.trim() !== "");
}
function gradeAnswer(q, a) {
  const pts = q.points;
  const partial = q.partial ?? false;
  const score = (hits, total) => total <= 0 ? 0 : partial ? round(pts * Math.max(0, Math.min(1, hits / total))) : hits >= total ? pts : 0;
  switch (q.type) {
    case "TEXT": {
      if (!q.correct.length) return null;
      const t2 = norm(a);
      return score(q.correct.filter((k) => t2.includes(norm(k))).length, q.correct.length);
    }
    case "NUMBER": {
      const n = num(Array.isArray(a) ? a[0] : a);
      const c = num(q.correct[0]);
      return !Number.isNaN(n) && !Number.isNaN(c) && Math.abs(n - c) <= (q.tolerance ?? 0) + 1e-9 ? pts : 0;
    }
    case "MULTI": {
      const got = new Set(list(a).map(norm));
      const want = new Set(q.correct.map(norm));
      const right = [...got].filter((x) => want.has(x)).length;
      const wrong = got.size - right;
      if (!partial) return wrong === 0 && right === want.size ? pts : 0;
      return score(right - wrong, want.size);
    }
    case "ORDER":
    case "MATCH": {
      const got = list(a);
      const n = q.options.length;
      return score(Array.from({ length: n }, (_, i) => got[i] === String(i)).filter(Boolean).length, n);
    }
    case "GAP": {
      const gaps = gapAnswers(q.text);
      const got = list(a);
      return score(gaps.filter((alts, i) => alts.map(norm).includes(norm(got[i]))).length, gaps.length);
    }
    default:
      return norm(Array.isArray(a) ? a[0] : a) === norm(q.correct[0]) ? pts : 0;
  }
}
function questionProblems(q, label) {
  const out = [];
  const opts = q.options ?? [];
  if (!q.text.trim()) out.push(`${label}: Text fehlt`);
  if (q.type === "SINGLE" || q.type === "MULTI") {
    if (opts.length < 2) out.push(`${label}: mindestens 2 Antworten`);
    if (opts.some((o) => !o.trim())) out.push(`${label}: leere Antwortm\xF6glichkeit`);
    const valid = q.correct.filter((c) => /^\d+$/.test(c) && Number(c) < opts.length);
    if (q.type === "SINGLE" && valid.length !== 1) out.push(`${label}: richtige Antwort w\xE4hlen`);
    if (q.type === "MULTI" && !valid.length) out.push(`${label}: mindestens eine richtige Antwort w\xE4hlen`);
  }
  if (q.type === "YESNO" && !["ja", "nein"].includes(norm(q.correct[0]))) out.push(`${label}: richtige Antwort w\xE4hlen`);
  if (q.type === "NUMBER" && Number.isNaN(num(q.correct[0]))) out.push(`${label}: richtige Zahl fehlt`);
  if (q.type === "ORDER") {
    if (opts.length < 2) out.push(`${label}: mindestens 2 Eintr\xE4ge`);
    if (opts.some((o) => !o.trim())) out.push(`${label}: leerer Eintrag`);
    if (new Set(opts.map(norm)).size !== opts.length) out.push(`${label}: Eintr\xE4ge m\xFCssen unterschiedlich sein`);
  }
  if (q.type === "MATCH") {
    if (opts.length < 2) out.push(`${label}: mindestens 2 Paare`);
    if (opts.some((o) => !o.trim()) || (q.matches ?? []).some((o) => !o.trim()) || (q.matches ?? []).length !== opts.length) out.push(`${label}: jedes Paar braucht beide Seiten`);
  }
  if (q.type === "GAP") {
    const gaps = gapAnswers(q.text);
    if (!gaps.length) out.push(`${label}: mindestens eine L\xFCcke {{\u2026}} im Text`);
    else if (gaps.some((g) => !g.length)) out.push(`${label}: leere L\xFCcke {{}} \u2013 Antwort eintragen`);
  }
  return out;
}
var EXAM_REVIEW_MODES = ["NONE", "ANSWERS", "SOLUTIONS"];
var EXAM_REVIEW_LABEL = { NONE: "Keine Einsicht", ANSWERS: "Eigene Antworten (richtig/falsch)", SOLUTIONS: "Antworten mit L\xF6sungen und Erkl\xE4rungen" };
var EXAM_LAYOUTS = ["PAGED", "LIST"];
var EXAM_LAYOUT_LABEL = { PAGED: "Eine Frage pro Seite", LIST: "Alle Fragen auf einer Seite" };
var EXAM_ATTEMPT_STATUSES = ["IN_PROGRESS", "SUBMITTED", "GRADED", "VOIDED"];
var EXAM_ATTEMPT_STATUS_LABEL = { IN_PROGRESS: "L\xE4uft", SUBMITTED: "Wartet auf Bewertung", GRADED: "Bewertet", VOIDED: "Annulliert" };
var isoDate = z4.string().datetime({ offset: true });
var examSchema = z4.object({
  title: z4.string().trim().min(1).max(120),
  description: z4.string().max(3e3).nullable().default(null),
  /** Hinweise auf der Startseite vor Beginn */
  instructions: z4.string().max(4e3).nullable().default(null),
  category: z4.string().trim().max(60).nullable().default(null),
  questions: z4.array(questionSchema).max(200).default([]),
  questionCount: z4.number().int().min(0).max(200).default(0),
  passPercent: z4.number().int().min(1).max(100).default(70),
  timeLimitMin: z4.number().int().min(1).max(600).nullable().default(null),
  maxAttempts: z4.number().int().min(1).max(50).default(3),
  retryHours: z4.number().int().min(0).max(24 * 90).default(24),
  autoGrade: z4.boolean().default(true),
  showResult: z4.boolean().default(true),
  reviewMode: z4.enum(EXAM_REVIEW_MODES).default("ANSWERS"),
  layout: z4.enum(EXAM_LAYOUTS).default("PAGED"),
  shuffleQuestions: z4.boolean().default(false),
  shuffleOptions: z4.boolean().default(false),
  examinerIds: z4.array(z4.string().uuid()).max(30).default([]),
  /** Dashboard-Rollen, die die Prüfung sehen/ablegen dürfen (leer = alle mit exam.view) */
  audienceRoleIds: z4.array(z4.string().uuid()).max(30).default([]),
  trainingId: z4.string().uuid().nullable().default(null),
  /** muss vorher bestanden sein */
  requiredExamId: z4.string().uuid().nullable().default(null),
  availableFrom: isoDate.nullable().default(null),
  availableUntil: isoDate.nullable().default(null),
  /** Prüfer bei Abgabe benachrichtigen, wenn manuell bewertet werden muss */
  notifyExaminers: z4.boolean().default(true),
  active: z4.boolean().default(true)
}).refine((e) => !e.availableFrom || !e.availableUntil || new Date(e.availableFrom) < new Date(e.availableUntil), { message: "\u201EVerf\xFCgbar bis\u201C muss nach \u201EVerf\xFCgbar ab\u201C liegen.", path: ["availableUntil"] });
function examProblems(e) {
  const out = [];
  if (!e.title.trim()) out.push("Titel fehlt");
  const ids = e.questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) out.push("Fragen-IDs m\xFCssen eindeutig sein");
  e.questions.forEach((q, i) => out.push(...questionProblems(q, `Frage ${i + 1}`)));
  if (e.questions.length && e.questions.reduce((n, q) => n + q.points, 0) <= 0) out.push("Die Fragen haben zusammen 0 Punkte");
  return out;
}
var EXAM_EXPORT_FORMAT = "enrp.exam";
var examExportSchema = z4.object({ format: z4.literal(EXAM_EXPORT_FORMAT), version: z4.literal(1), exam: z4.record(z4.unknown()) });

// src/logging.ts
import { z as z5 } from "zod";
var LOG_CATEGORIES = [
  { key: "einsaetze", label: "Eins\xE4tze & Leitstelle", emoji: "\u{1F6A8}", modules: ["cad", "dispatch", "incidents", "erlc", "radio", "fleet"] },
  { key: "akten", label: "Akten", emoji: "\u{1F5C2}\uFE0F", modules: ["persons", "vehicles", "wanted", "reports", "tickets", "complaints"] },
  { key: "bewerbungen", label: "Bewerbungen & Qualifikationen", emoji: "\u{1F4CB}", modules: ["applications", "qualifications"] },
  { key: "personal", label: "Personal & Ausbildung", emoji: "\u{1F46E}", modules: ["personnel", "promotion", "dienstnummer", "training", "exam", "academy", "sek"] },
  { key: "dienst", label: "Dienst, Abmeldungen & Berichte", emoji: "\u{1F552}", modules: ["team", "dutyreports", "leave"] },
  { key: "kommunikation", label: "Kommunikation & Discord", emoji: "\u{1F4AC}", modules: ["communication", "discord"] },
  { key: "rechte", label: "Rechte, Konten & Anmeldung", emoji: "\u{1F510}", modules: ["permissions", "users", "auth"] },
  { key: "einstellungen", label: "Einstellungen & System", emoji: "\u2699\uFE0F", modules: ["settings", "studio", "teamchance", "media", "locks", "export"] }
];
var logCategoryOf = (module) => LOG_CATEGORIES.find((c) => c.modules.includes(module))?.key ?? "sonstiges";
var LOG_TYPES = {
  "fleet.vehicle.incident": "fleet",
  "fleet.vehicle.update": "fleet",
  "fleet.model.delete": "fleet",
  "fleet.model.update": "fleet",
  "fleet.model.create": "fleet",
  "fleet.config": "fleet",
  "person.photo": "persons",
  "mdt.config": "settings",
  "academy.config": "academy",
  "academy.course.announce": "academy",
  "academy.course.create": "academy",
  "academy.enroll": "academy",
  "academy.grade": "academy",
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
  "exam.delete": "exam",
  "exam.grade": "exam",
  "exam.start": "exam",
  "export": "export",
  "incident.attach": "incidents",
  "incident.create": "incidents",
  "incident.update": "incidents",
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
var sf4 = z5.string().regex(/^\d{15,25}$/, "Discord-Kanal-ID");
var loggingConfigSchema = z5.object({
  enabled: z5.boolean().default(true),
  /** Kanal je Kategorie */
  categories: z5.record(z5.string().max(32), sf4).default({}),
  /** Abweichung je Typ: eigener Kanal oder 'off' (aus); fehlt = Kanal der Kategorie */
  types: z5.record(z5.string().max(80), z5.union([sf4, z5.literal("off"), z5.literal("on")])).default({})
});
function logChannelFor(cfg, module, action) {
  if (!cfg.enabled) return null;
  const t2 = cfg.types[action];
  if (t2 === "off") return null;
  if (t2 && t2 !== "on") return t2;
  if (!t2 && LOG_DEFAULT_OFF.has(action)) return null;
  return cfg.categories[logCategoryOf(module)] ?? null;
}

// src/backup.ts
import { z as z6 } from "zod";
var BACKUP_PARTS = ["roles", "channels", "settings"];
var BACKUP_PART_LABEL = { roles: "Rollen", channels: "Kategorien & Kan\xE4le (mit Rechten)", settings: "Servereinstellungen (Name, Verifizierung, AFK \u2026)" };
var backupConfigSchema = z6.object({
  /** Dashboard-Daten stündlich automatisch sichern */
  dataAuto: z6.boolean().default(true),
  /** Discord-Server täglich automatisch sichern */
  discordAuto: z6.boolean().default(false),
  /** Dashboard-Daten: so viele Tage (je ein Backup, die letzten 48 Stunden alle); Discord: so viele Backups je Server */
  keep: z6.number().int().min(1).max(60).default(14)
});

// src/mdt.ts
import { z as z7 } from "zod";
var option = z7.object({ key: z7.string().trim().min(1).max(32).regex(/^[A-Z0-9_]+$/, "Schl\xFCssel: nur A\u2013Z, 0\u20139 und _"), label: z7.string().trim().min(1).max(40) });
var unique = (xs) => new Set(xs.map((x) => x.key)).size === xs.length;
var mdtConfigSchema = z7.object({
  licenses: z7.array(option).max(30).refine(unique, "Schl\xFCssel doppelt"),
  flags: z7.array(option.extend({ tone: z7.enum(["danger", "warning", "info", "neutral"]) })).max(30).refine(unique, "Schl\xFCssel doppelt"),
  genders: z7.array(z7.string().trim().min(1).max(30)).max(10)
});
var DEFAULT_MDT_CONFIG = {
  licenses: [
    { key: "DRIVER", label: "F\xFChrerschein" },
    { key: "WEAPON", label: "Waffenschein" },
    { key: "BUSINESS", label: "Gewerbeschein" },
    { key: "PILOT", label: "Flugschein" },
    { key: "BOAT", label: "Bootsf\xFChrerschein" }
  ],
  flags: [
    { key: "DANGEROUS", label: "Gef\xE4hrlich", tone: "danger" },
    { key: "ARMED", label: "Bewaffnet", tone: "danger" },
    { key: "FLIGHT_RISK", label: "Fluchtgefahr", tone: "warning" },
    { key: "VIOLENT", label: "Gewaltbereit", tone: "warning" },
    { key: "GANG", label: "Bandenzugeh\xF6rigkeit", tone: "warning" }
  ],
  genders: ["M\xE4nnlich", "Weiblich", "Divers"]
};
var personDetailsSchema = z7.object({
  fullName: z7.string().trim().max(80).nullish(),
  dateOfBirth: z7.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-TT").nullish(),
  gender: z7.string().trim().max(30).nullish(),
  phone: z7.string().trim().max(30).nullish(),
  job: z7.string().trim().max(60).nullish(),
  nationality: z7.string().trim().max(60).nullish(),
  address: z7.string().trim().max(200).nullish(),
  appearance: z7.object({ skinTone: z7.string().max(40).optional(), hairColor: z7.string().max(40).optional(), eyeColor: z7.string().max(40).optional(), height: z7.string().max(20).optional(), features: z7.string().max(300).optional() }).nullish(),
  licenses: z7.array(z7.string().max(32)).max(30).optional(),
  flags: z7.array(z7.string().max(32)).max(30).optional()
});
function ageOf(dob, now = /* @__PURE__ */ new Date()) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const [y, m, d] = dob.slice(0, 10).split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || now.getUTCMonth() + 1 === m && now.getUTCDate() < d) age--;
  return age >= 0 && age < 150 ? age : null;
}

// src/fleet.ts
import { z as z8 } from "zod";
var key2 = z8.string().trim().min(1).max(32).regex(/^[A-Z0-9_]+$/, "Schl\xFCssel: nur A\u2013Z, 0\u20139 und _");
var unique2 = (xs) => new Set(xs.map((x) => x.key)).size === xs.length;
var fleetConfigSchema = z8.object({
  categories: z8.array(z8.object({ key: key2, label: z8.string().trim().min(1).max(40), icon: z8.string().trim().min(1).max(8) })).min(1).max(30).refine(unique2, "Schl\xFCssel doppelt"),
  internalStatuses: z8.array(z8.object({ key: key2, label: z8.string().trim().min(1).max(40), color: z8.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(1).max(20).refine(unique2, "Schl\xFCssel doppelt"),
  /** Mindestabstand zwischen zwei Abgleichen der Live-Fahrzeuge (Sekunden); der ER:LC-Abruf selbst läuft im eingestellten Server-Intervall. */
  syncSeconds: z8.number().int().min(5).max(600),
  /** Nicht mehr gemeldete Fahrzeuge ohne interne Daten nach so vielen Tagen löschen. */
  keepInactiveDays: z8.number().int().min(1).max(90)
});
var DEFAULT_FLEET_CONFIG = {
  categories: [
    { key: "PATROL", label: "Streifenwagen", icon: "\u{1F693}" },
    { key: "SUV", label: "SUV", icon: "\u{1F699}" },
    { key: "UNMARKED", label: "Zivilfahrzeug", icon: "\u{1F575}\uFE0F" },
    { key: "MOTORCYCLE", label: "Motorrad", icon: "\u{1F3CD}\uFE0F" },
    { key: "SPECIAL", label: "Sonderfahrzeug", icon: "\u{1F690}" },
    { key: "OTHER", label: "Sonstiges", icon: "\u{1F697}" }
  ],
  internalStatuses: [
    { key: "UNASSIGNED", label: "Nicht zugewiesen", color: "#64748b" },
    { key: "ASSIGNED", label: "Zugewiesen", color: "#3b82f6" },
    { key: "ON_MISSION", label: "Im Einsatz", color: "#f97316" },
    { key: "OUT_OF_SERVICE", label: "Au\xDFer Dienst", color: "#475569" }
  ],
  syncSeconds: 10,
  keepInactiveDays: 7
};
var DRIVER_STATES = {
  recognized: "Fahrer erkannt",
  ambiguous: "Fahrer nicht eindeutig erkennbar",
  none: "Kein Fahrer erkannt",
  unavailable: "Fahrerdaten nicht verf\xFCgbar"
};
var DRIVER_HINT = "ER:LC meldet nur, wer das Fahrzeug gespawnt hat (Besitzer) \u2013 nicht, wer gerade f\xE4hrt.";
var POSITION_HINT = "Position des Besitzers laut ER:LC \u2013 keine Fahrzeugposition (die API liefert keine).";
var fleetModelSchema = z8.object({
  name: z8.string().trim().min(1).max(80),
  /** Modellname genau so, wie ER:LC ihn meldet (z. B. „Falcon Interceptor Utility 2019“) – darüber werden Live-Fahrzeuge zugeordnet. */
  erlcName: z8.string().trim().min(1).max(120),
  category: key2,
  description: z8.string().trim().max(1e3).nullish(),
  internalCode: z8.string().trim().max(40).nullish(),
  active: z8.boolean().optional(),
  tags: z8.array(z8.string().trim().min(1).max(30)).max(20).optional(),
  department: z8.string().trim().max(60).nullish()
});
var fleetInternalSchema = z8.object({
  unitId: z8.string().uuid().nullish(),
  internalStatus: key2.optional(),
  internalCode: z8.string().trim().max(40).nullish(),
  notes: z8.string().trim().max(3e3).nullish(),
  tags: z8.array(z8.string().trim().min(1).max(30)).max(20).optional()
});

// src/message-builder.ts
import { z as z9 } from "zod";
var DISCORD_LIMITS = {
  content: 2e3,
  embedsPerMessage: 10,
  embedTotal: 6e3,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  actionRows: 5,
  buttonsPerRow: 5,
  buttonLabel: 80,
  customId: 100,
  linkUrl: 512,
  selectOptions: 25,
  selectPlaceholder: 150,
  optionLabel: 100,
  optionValue: 100,
  optionDescription: 100,
  webhookUsername: 80
};
var MB_LIMITS = { messagesPerGroup: 10, url: 2048, replyText: 2e3 };
var str = (max) => z9.string().max(max).default("");
var id2 = z9.string().min(1).max(64);
var MB_BUTTON_STYLES = ["primary", "secondary", "success", "danger"];
var mbActionSchema = z9.discriminatedUnion("type", [
  /** Antwort nur für die klickende Person sichtbar (ephemeral). */
  z9.object({ type: z9.literal("reply"), text: str(4e3) }),
  /** Discord-Rolle der klickenden Person geben bzw. wieder nehmen (Umschalter). */
  z9.object({ type: z9.literal("role"), roleId: str(32), mode: z9.enum(["toggle", "add", "remove"]).default("toggle") })
]);
var mbButtonSchema = z9.object({
  id: id2,
  /** link = öffnet eine URL (keine Interaktion nötig); action = führt eine definierte Aktion im Bot aus */
  kind: z9.enum(["link", "action"]).default("link"),
  label: str(500),
  emoji: str(100),
  style: z9.enum(MB_BUTTON_STYLES).default("primary"),
  url: str(4e3),
  disabled: z9.boolean().default(false),
  action: mbActionSchema.default({ type: "reply", text: "" })
});
var mbSelectOptionSchema = z9.object({ id: id2, label: str(500), description: str(500), emoji: str(100), action: mbActionSchema.default({ type: "reply", text: "" }) });
var mbRowSchema = z9.discriminatedUnion("type", [
  z9.object({ id: id2, type: z9.literal("buttons"), buttons: z9.array(mbButtonSchema).max(25).default([]) }),
  z9.object({ id: id2, type: z9.literal("select"), placeholder: str(500), disabled: z9.boolean().default(false), options: z9.array(mbSelectOptionSchema).max(50).default([]) })
]);
var mbFieldSchema = z9.object({ id: id2, name: str(2e3), value: str(4e3), inline: z9.boolean().default(false) });
var mbEmbedSchema = z9.object({
  id: id2,
  title: str(2e3),
  url: str(4e3),
  description: str(1e4),
  /** `#rrggbb` oder leer (= keine Farbe) */
  color: str(16),
  authorName: str(2e3),
  authorUrl: str(4e3),
  authorIconUrl: str(4e3),
  thumbnailUrl: str(4e3),
  imageUrl: str(4e3),
  footerText: str(4e3),
  footerIconUrl: str(4e3),
  /** none = ohne, send = Zeitpunkt des Versands, custom = `timestampAt` */
  timestamp: z9.enum(["none", "send", "custom"]).default("none"),
  timestampAt: str(64),
  fields: z9.array(mbFieldSchema).max(50).default([])
});
var mbMessageSchema = z9.object({
  id: id2,
  content: str(1e4),
  embeds: z9.array(mbEmbedSchema).max(20).default([]),
  rows: z9.array(mbRowSchema).max(10).default([]),
  /** Wer wirklich gepingt wird. @everyone/@here nur, wenn ausdrücklich eingeschaltet. */
  mentions: z9.object({ users: z9.boolean().default(true), roles: z9.boolean().default(false), everyone: z9.boolean().default(false) }).default({})
});
var mbDocumentDataSchema = z9.object({
  messages: z9.array(mbMessageSchema).max(MB_LIMITS.messagesPerGroup).default([]),
  /** Name/Profilbild nur beim Versand über einen Webhook (der Bot sendet immer als er selbst). */
  webhookProfile: z9.object({ username: str(200), avatarUrl: str(4e3) }).default({})
});
var counter = 0;
var mbId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
var emptyMbEmbed = () => mbEmbedSchema.parse({ id: mbId(), color: "#1e3a8a" });
var emptyMbMessage = () => mbMessageSchema.parse({ id: mbId() });
var emptyMbDocument = () => mbDocumentDataSchema.parse({ messages: [{ id: mbId(), content: "" }] });
function cloneWithNewIds(v) {
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, k === "id" && typeof val === "string" ? mbId() : walk(val)]));
    return x;
  };
  return walk(v);
}
var SNOWFLAKE = /^\d{15,25}$/;
var CUSTOM_EMOJI = /^<(a?):(\w{2,32}):(\d{15,25})>$/;
var UNICODE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)(?:[️‍\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{E0020}-\u{E007F}])*$/u;
var isValidEmoji = (e) => CUSTOM_EMOJI.test(e) || e.length <= 32 && UNICODE_EMOJI.test(e);
function isHttpUrl(u) {
  if (!/^https?:\/\//i.test(u) || /\s/.test(u)) return false;
  try {
    const x = new URL(u);
    return (x.protocol === "https:" || x.protocol === "http:") && !!x.hostname;
  } catch {
    return false;
  }
}
var HEX = /^#[0-9a-fA-F]{6}$/;
var len = (s) => [...s].length;
var embedChars = (e) => len(e.title) + len(e.description) + len(e.authorName) + len(e.footerText) + e.fields.reduce((n, f) => n + len(f.name) + len(f.value), 0);
function validateMbMessage(m, idx, o = {}) {
  const out = [];
  const base = `Nachricht ${idx + 1}`;
  const add = (level, where, path, message) => out.push({ level, where: where ? `${base} \u203A ${where}` : base, path: ["messages", idx, ...path], message });
  const url = (v, where, path, label, max = MB_LIMITS.url) => {
    if (!v) return;
    if (!isHttpUrl(v)) add("error", where, path, `${label}: keine g\xFCltige URL (muss mit https:// oder http:// beginnen).`);
    else if (v.length > max) add("error", where, path, `${label}: h\xF6chstens ${max} Zeichen.`);
    else if (v.startsWith("http://")) add("warning", where, path, `${label}: unverschl\xFCsselt (http). Discord zeigt Bilder \xFCber http oft nicht an.`);
  };
  if (len(m.content) > DISCORD_LIMITS.content) add("error", "Text", ["content"], `Text: ${len(m.content)}/${DISCORD_LIMITS.content} Zeichen.`);
  if (!m.content.trim() && !m.embeds.length && !m.rows.length) add("error", "", [], "Die Nachricht ist leer \u2013 Text, Embed oder Komponente n\xF6tig.");
  if (m.mentions.everyone && /@(everyone|here)/.test(m.content)) add("warning", "Text", ["content"], "@everyone/@here wird wirklich gepingt (der Bot braucht daf\xFCr das Recht \u201E@everyone erw\xE4hnen\u201C).");
  if (m.embeds.length > DISCORD_LIMITS.embedsPerMessage) add("error", "", ["embeds"], `H\xF6chstens ${DISCORD_LIMITS.embedsPerMessage} Embeds je Nachricht.`);
  let total = 0;
  m.embeds.forEach((e, ei) => {
    const w = `Embed ${ei + 1}`;
    const p = (...x) => ["embeds", ei, ...x];
    total += embedChars(e);
    const lim = (v, max, key3, label) => {
      if (len(v) > max) add("error", w, p(key3), `${label}: ${len(v)}/${max} Zeichen.`);
    };
    lim(e.title, DISCORD_LIMITS.title, "title", "Titel");
    lim(e.description, DISCORD_LIMITS.description, "description", "Beschreibung");
    lim(e.authorName, DISCORD_LIMITS.authorName, "authorName", "Autorname");
    lim(e.footerText, DISCORD_LIMITS.footerText, "footerText", "Fu\xDFzeile");
    if (e.color && !HEX.test(e.color)) add("error", w, p("color"), "Farbe: HEX-Wert wie #1e3a8a.");
    url(e.url, w, p("url"), "Titel-URL");
    if (e.url && !e.title) add("warning", w, p("url"), "Titel-URL ohne Titel wird in Discord nicht angezeigt.");
    url(e.authorUrl, w, p("authorUrl"), "Autor-URL");
    url(e.authorIconUrl, w, p("authorIconUrl"), "Autor-Icon");
    if ((e.authorUrl || e.authorIconUrl) && !e.authorName.trim()) add("error", w, p("authorName"), "Autor-URL/-Icon brauchen einen Autornamen.");
    url(e.thumbnailUrl, w, p("thumbnailUrl"), "Thumbnail");
    url(e.imageUrl, w, p("imageUrl"), "Bild");
    url(e.footerIconUrl, w, p("footerIconUrl"), "Fu\xDFzeilen-Icon");
    if (e.footerIconUrl && !e.footerText.trim()) add("error", w, p("footerText"), "Ein Fu\xDFzeilen-Icon braucht einen Fu\xDFzeilentext.");
    if (e.timestamp === "custom" && (!e.timestampAt || Number.isNaN(Date.parse(e.timestampAt)))) add("error", w, p("timestampAt"), "Zeitstempel: g\xFCltiges Datum w\xE4hlen.");
    if (e.fields.length > DISCORD_LIMITS.fields) add("error", w, p("fields"), `H\xF6chstens ${DISCORD_LIMITS.fields} Felder je Embed.`);
    e.fields.forEach((f, fi) => {
      const fw = `${w} \u203A Feld ${fi + 1}`;
      if (!f.name.trim()) add("error", fw, p("fields", fi, "name"), "Feldname fehlt (Discord verlangt Name und Wert).");
      if (!f.value.trim()) add("error", fw, p("fields", fi, "value"), "Feldwert fehlt (Discord verlangt Name und Wert).");
      if (len(f.name) > DISCORD_LIMITS.fieldName) add("error", fw, p("fields", fi, "name"), `Feldname: ${len(f.name)}/${DISCORD_LIMITS.fieldName} Zeichen.`);
      if (len(f.value) > DISCORD_LIMITS.fieldValue) add("error", fw, p("fields", fi, "value"), `Feldwert: ${len(f.value)}/${DISCORD_LIMITS.fieldValue} Zeichen.`);
    });
    const empty = !e.title.trim() && !e.description.trim() && !e.fields.length && !e.imageUrl && !e.thumbnailUrl && !e.authorName.trim() && !e.footerText.trim();
    if (empty) add("error", w, p(), "Das Embed ist leer \u2013 Titel, Beschreibung, Feld, Bild, Autor oder Fu\xDFzeile n\xF6tig.");
  });
  if (total > DISCORD_LIMITS.embedTotal) add("error", "Embeds", ["embeds"], `Alle Embeds zusammen: ${total}/${DISCORD_LIMITS.embedTotal} Zeichen.`);
  if (m.rows.length > DISCORD_LIMITS.actionRows) add("error", "Komponenten", ["rows"], `H\xF6chstens ${DISCORD_LIMITS.actionRows} Komponenten-Reihen je Nachricht.`);
  const action = (a, where, path) => {
    if (a.type === "reply") {
      if (!a.text.trim()) add("error", where, [...path, "text"], "Aktion \u201EAntwort\u201C: Antworttext fehlt.");
      else if (len(a.text) > MB_LIMITS.replyText) add("error", where, [...path, "text"], `Antworttext: ${len(a.text)}/${MB_LIMITS.replyText} Zeichen.`);
    } else {
      if (o.allowRoleActions === false) add("error", where, path, "Rollen-Aktionen darfst du nicht anlegen (Recht \u201ERollen-Buttons\u201C).");
      if (!SNOWFLAKE.test(a.roleId)) add("error", where, [...path, "roleId"], "Aktion \u201ERolle\u201C: Rolle w\xE4hlen.");
      else if (o.roleIds && !o.roleIds.includes(a.roleId)) add("error", where, [...path, "roleId"], "Diese Rolle gibt es auf dem Discord-Server nicht (mehr).");
    }
  };
  m.rows.forEach((r, ri) => {
    const w = `Reihe ${ri + 1}`;
    const p = (...x) => ["rows", ri, ...x];
    if (r.type === "buttons") {
      if (!r.buttons.length) add("error", w, p("buttons"), "Die Button-Reihe ist leer.");
      if (r.buttons.length > DISCORD_LIMITS.buttonsPerRow) add("error", w, p("buttons"), `H\xF6chstens ${DISCORD_LIMITS.buttonsPerRow} Buttons je Reihe.`);
      r.buttons.forEach((b, bi) => {
        const bw = `${w} \u203A Button ${bi + 1}`;
        if (!b.label.trim() && !b.emoji.trim()) add("error", bw, p("buttons", bi, "label"), "Button braucht eine Beschriftung oder ein Emoji.");
        if (len(b.label) > DISCORD_LIMITS.buttonLabel) add("error", bw, p("buttons", bi, "label"), `Beschriftung: ${len(b.label)}/${DISCORD_LIMITS.buttonLabel} Zeichen.`);
        if (b.emoji && !isValidEmoji(b.emoji.trim())) add("error", bw, p("buttons", bi, "emoji"), "Emoji: ein Unicode-Emoji (z. B. \u{1F693}) oder ein Server-Emoji wie <:name:123\u2026>.");
        if (b.kind === "link") {
          if (!b.url) add("error", bw, p("buttons", bi, "url"), "Link-Button braucht eine URL.");
          else url(b.url, bw, p("buttons", bi, "url"), "Link", DISCORD_LIMITS.linkUrl);
        } else {
          if (o.target === "webhook") add("error", bw, p("buttons", bi), "\xDCber einen Webhook sind nur Link-Buttons m\xF6glich \u2013 f\xFCr Aktions-Buttons \xFCber den Bot senden.");
          action(b.action, bw, p("buttons", bi, "action"));
        }
      });
    } else {
      if (o.target === "webhook") add("error", w, p(), "\xDCber einen Webhook sind keine Auswahlmen\xFCs m\xF6glich \u2013 \xFCber den Bot senden.");
      if (!r.options.length) add("error", w, p("options"), "Das Auswahlmen\xFC braucht mindestens eine Option.");
      if (r.options.length > DISCORD_LIMITS.selectOptions) add("error", w, p("options"), `H\xF6chstens ${DISCORD_LIMITS.selectOptions} Optionen.`);
      if (len(r.placeholder) > DISCORD_LIMITS.selectPlaceholder) add("error", w, p("placeholder"), `Platzhalter: ${len(r.placeholder)}/${DISCORD_LIMITS.selectPlaceholder} Zeichen.`);
      r.options.forEach((op, oi) => {
        const ow = `${w} \u203A Option ${oi + 1}`;
        if (!op.label.trim()) add("error", ow, p("options", oi, "label"), "Option braucht eine Beschriftung.");
        if (len(op.label) > DISCORD_LIMITS.optionLabel) add("error", ow, p("options", oi, "label"), `Beschriftung: ${len(op.label)}/${DISCORD_LIMITS.optionLabel} Zeichen.`);
        if (len(op.description) > DISCORD_LIMITS.optionDescription) add("error", ow, p("options", oi, "description"), `Beschreibung: ${len(op.description)}/${DISCORD_LIMITS.optionDescription} Zeichen.`);
        if (op.emoji && !isValidEmoji(op.emoji.trim())) add("error", ow, p("options", oi, "emoji"), "Emoji: ein Unicode-Emoji oder ein Server-Emoji wie <:name:123\u2026>.");
        action(op.action, ow, p("options", oi, "action"));
      });
    }
  });
  return out;
}
function validateMbDocument(d, o = {}) {
  const out = [];
  if (!d.messages.length) out.push({ level: "error", where: "Gruppe", path: ["messages"], message: "Keine Nachricht vorhanden." });
  if (d.messages.length > MB_LIMITS.messagesPerGroup) out.push({ level: "error", where: "Gruppe", path: ["messages"], message: `H\xF6chstens ${MB_LIMITS.messagesPerGroup} Nachrichten je Gruppe.` });
  d.messages.forEach((m, i) => out.push(...validateMbMessage(m, i, o)));
  if (o.target === "webhook") {
    const u = d.webhookProfile.username.trim();
    if (len(u) > DISCORD_LIMITS.webhookUsername) out.push({ level: "error", where: "Webhook-Profil", path: ["webhookProfile", "username"], message: `Name: h\xF6chstens ${DISCORD_LIMITS.webhookUsername} Zeichen.` });
    if (/clyde|discord/i.test(u)) out.push({ level: "error", where: "Webhook-Profil", path: ["webhookProfile", "username"], message: "Discord verbietet \u201Eclyde\u201C und \u201Ediscord\u201C im Webhook-Namen." });
    if (d.webhookProfile.avatarUrl && !isHttpUrl(d.webhookProfile.avatarUrl)) out.push({ level: "error", where: "Webhook-Profil", path: ["webhookProfile", "avatarUrl"], message: "Profilbild: keine g\xFCltige URL." });
  }
  return out;
}
var hasErrors = (issues) => issues.some((i) => i.level === "error");
function toPartialEmoji(e) {
  const t2 = e.trim();
  if (!t2) return void 0;
  const c = CUSTOM_EMOJI.exec(t2);
  return c ? { id: c[3], name: c[2], ...c[1] ? { animated: true } : {} } : { name: t2 };
}
var STYLE_NUM = { primary: 1, secondary: 2, success: 3, danger: 4 };
function toDiscordPayload(m, o = {}) {
  const now = o.now ?? /* @__PURE__ */ new Date();
  const embeds = m.embeds.map((e) => {
    const x = {};
    if (e.title) x.title = e.title;
    if (e.url) x.url = e.url;
    if (e.description) x.description = e.description;
    if (e.color && HEX.test(e.color)) x.color = parseInt(e.color.slice(1), 16);
    if (e.authorName) x.author = { name: e.authorName, ...e.authorUrl ? { url: e.authorUrl } : {}, ...e.authorIconUrl ? { icon_url: e.authorIconUrl } : {} };
    if (e.thumbnailUrl) x.thumbnail = { url: e.thumbnailUrl };
    if (e.imageUrl) x.image = { url: e.imageUrl };
    if (e.footerText) x.footer = { text: e.footerText, ...e.footerIconUrl ? { icon_url: e.footerIconUrl } : {} };
    if (e.timestamp === "send") x.timestamp = now.toISOString();
    if (e.timestamp === "custom" && e.timestampAt && !Number.isNaN(Date.parse(e.timestampAt))) x.timestamp = new Date(e.timestampAt).toISOString();
    if (e.fields.length) x.fields = e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline }));
    return x;
  });
  const components = [];
  for (const r of m.rows) {
    if (r.type === "buttons") {
      const buttons = r.buttons.flatMap((b) => {
        const emoji2 = toPartialEmoji(b.emoji);
        const common = { ...b.label ? { label: b.label } : {}, ...emoji2 ? { emoji: emoji2 } : {}, ...b.disabled ? { disabled: true } : {} };
        if (b.kind === "link") return b.url ? [{ type: 2, style: 5, url: b.url, ...common }] : [];
        const cid = o.customIdOf?.(b.id);
        return cid ? [{ type: 2, style: STYLE_NUM[b.style], custom_id: cid, ...common }] : [];
      });
      if (buttons.length) components.push({ type: 1, components: buttons });
    } else {
      const cid = o.customIdOf?.(r.id);
      if (!cid || !r.options.length) continue;
      components.push({ type: 1, components: [{
        type: 3,
        custom_id: cid,
        min_values: 1,
        max_values: 1,
        ...r.placeholder ? { placeholder: r.placeholder } : {},
        ...r.disabled ? { disabled: true } : {},
        options: r.options.map((op) => {
          const emoji2 = toPartialEmoji(op.emoji);
          return { label: op.label, value: op.id, ...op.description ? { description: op.description } : {}, ...emoji2 ? { emoji: emoji2 } : {} };
        })
      }] });
    }
  }
  const parse = [];
  if (m.mentions.users) parse.push("users");
  if (m.mentions.roles) parse.push("roles");
  if (m.mentions.everyone) parse.push("everyone");
  return { ...m.content ? { content: m.content } : {}, embeds, components, allowed_mentions: { parse } };
}
function mbSummary(m) {
  const buttons = m.rows.reduce((n, r) => n + (r.type === "buttons" ? r.buttons.length : 0), 0);
  const selects = m.rows.filter((r) => r.type === "select").length;
  const parts = [m.content.trim() ? "Text" : "", m.embeds.length ? `${m.embeds.length} Embed${m.embeds.length > 1 ? "s" : ""}` : "", buttons ? `${buttons} Button${buttons > 1 ? "s" : ""}` : "", selects ? `${selects} Auswahlmen\xFC${selects > 1 ? "s" : ""}` : ""].filter(Boolean);
  return parts.join(" \xB7 ") || "leer";
}
function interactiveComponents(m) {
  return m.rows.flatMap((r) => r.type === "buttons" ? r.buttons.filter((b) => b.kind === "action").map((b) => ({ componentId: b.id, kind: "button", action: b.action })) : [{ componentId: r.id, kind: "select", options: Object.fromEntries(r.options.map((op) => [op.id, op.action])) }]);
}
var MB_DEFAULT_CATEGORIES = ["Allgemein", "Polizei", "Leitstelle", "Dienstantritt", "Dienstende", "Einsatzmeldung", "Personalinformation", "Ank\xFCndigung", "Wartung", "Sonstiges"];
function missingBotPerms(p, d) {
  const miss = [];
  if (!p.view) miss.push("Kanal ansehen");
  if (!p.send) miss.push("Nachrichten senden");
  if (!p.embed && d.messages.some((m) => m.embeds.length)) miss.push("Links einbetten");
  if (p.mentionEveryone === false && d.messages.some((m) => m.mentions.everyone && /@(everyone|here)/.test(m.content))) miss.push("@everyone, @here und alle Rollen erw\xE4hnen");
  return miss;
}
var DISCORD_ERRORS = {
  10003: "Den Kanal gibt es nicht (mehr).",
  10008: "Die Nachricht gibt es nicht (mehr).",
  10015: "Den Webhook gibt es nicht mehr \u2013 in den Webhook-Einstellungen entfernen oder neu anlegen.",
  20016: "Langsamer Modus im Kanal aktiv \u2013 sp\xE4ter erneut senden.",
  40005: "Die Nachricht ist zu gro\xDF.",
  50001: "Der Bot hat keinen Zugriff auf diesen Kanal.",
  50006: "Discord lehnt eine leere Nachricht ab.",
  50008: "In diesen Kanaltyp kann nicht gesendet werden.",
  50013: "Dem Bot fehlen Rechte in diesem Kanal (z. B. \u201ENachrichten senden\u201C oder \u201ELinks einbetten\u201C).",
  50035: "Discord hat Inhalte als ung\xFCltig abgelehnt.",
  50109: "Ung\xFCltiges JSON."
};
function describeDiscordError(e) {
  const known = e.code !== void 0 ? DISCORD_ERRORS[e.code] : void 0;
  const detail = (e.message ?? "").replace(/https?:\/\/\S+/g, "[URL]").replace(/\s+/g, " ").trim().slice(0, 200);
  if (e.status === 429) return "Discord-Anfragelimit erreicht \u2013 bitte kurz warten und erneut senden.";
  if (known) return e.code === 50035 && detail ? `${known.slice(0, -1)} (${detail.replace(/\.$/, "")}).` : known;
  if (e.status === 401 || e.status === 403) return `Discord verweigert den Zugriff${detail ? ` (${detail})` : ""}.`;
  if (e.status && e.status >= 500) return "Discord ist gerade nicht erreichbar (Serverfehler) \u2013 sp\xE4ter erneut versuchen.";
  return detail || "Unbekannter Discord-Fehler.";
}

// src/radio-whitelist.ts
var RADIO_GRANT_STATUSES = ["PENDING", "ACTIVE", "DISABLED", "SUSPENDED", "EXPIRED", "REVOKED"];
var RADIO_GRANT_STATUS_LABEL = {
  PENDING: "Ausstehend",
  ACTIVE: "Aktiv",
  DISABLED: "Deaktiviert",
  SUSPENDED: "Gesperrt",
  EXPIRED: "Abgelaufen",
  REVOKED: "Entzogen (archiviert)"
};
var RADIO_GRANT_SOURCES = ["MANUAL", "ROLE", "REQUEST", "LEGACY"];
var RADIO_GRANT_SOURCE_LABEL = { MANUAL: "Manuell", ROLE: "Discord-Rolle", REQUEST: "Antrag", LEGACY: "\xDCbernommen" };
var t = (d) => d ? new Date(d).getTime() : null;
function effectiveRadioStatus(g, now = /* @__PURE__ */ new Date()) {
  const n = now.getTime();
  if (g.status === "SUSPENDED") {
    const until = t(g.suspendedUntil);
    if (until === null || until > n) return "SUSPENDED";
    return effectiveRadioStatus({ status: g.statusBeforeSuspend ?? "ACTIVE", expiresAt: g.expiresAt }, now);
  }
  if (g.status === "ACTIVE") {
    const e = t(g.expiresAt);
    if (e !== null && e <= n) return "EXPIRED";
  }
  return RADIO_GRANT_STATUSES.includes(g.status) ? g.status : "DISABLED";
}
var isRadioAuthorized = (g, now = /* @__PURE__ */ new Date()) => !!g && effectiveRadioStatus(g, now) === "ACTIVE";
var DEFAULT_RADIO_ROLE_RULES = { enabled: false, roleOnly: false, grantRoleIds: [], requiredRoleIds: [], onRoleGain: "ACTIVATE", onRoleLoss: "REVOKE", manualOnRoleLoss: "KEEP" };
var isRadioRoleOnly = (rules) => rules.enabled && !!rules.roleOnly && rules.grantRoleIds.length > 0;
function radioRoleSyncAction(rules, roleIds, grant, now = /* @__PURE__ */ new Date()) {
  if (!rules.enabled) return { kind: "none", why: "Rollenabgleich ist ausgeschaltet." };
  if (isRadioRoleOnly(rules)) return roleOnlyAction(rules, roleIds, grant, now);
  const has = (ids) => !!roleIds && ids.some((r) => roleIds.includes(r));
  const hasGrantRole = rules.grantRoleIds.length > 0 && has(rules.grantRoleIds);
  const required = rules.requiredRoleIds.length ? rules.requiredRoleIds : rules.grantRoleIds;
  const keeps = required.length === 0 ? roleIds !== null : has(required);
  const gainStatus = rules.onRoleGain === "PENDING" ? "PENDING" : "ACTIVE";
  if (!grant) return hasGrantRole && rules.onRoleGain !== "NONE" ? { kind: "create", status: gainStatus } : { kind: "none", why: "Keine Freigabe und keine berechtigende Rolle." };
  const status = effectiveRadioStatus(grant, now);
  if (status === "SUSPENDED") return { kind: "none", why: "Gesperrt \u2013 Sperren hebt nur eine F\xFChrungskraft auf." };
  if (grant.archived || status === "REVOKED" || status === "DISABLED") {
    if (grant.roleRevoked && hasGrantRole && keeps && rules.onRoleGain !== "NONE") return { kind: "reactivate", status: gainStatus };
    return { kind: "none", why: grant.roleRevoked ? "Berechtigende Rolle fehlt weiterhin." : "Manuell entzogen/deaktiviert \u2013 wird nicht automatisch wieder aktiv." };
  }
  if (keeps) return { kind: "none", why: "Erforderliche Rolle vorhanden." };
  const policy = grant.source === "ROLE" ? rules.onRoleLoss : rules.manualOnRoleLoss;
  if (policy === "REVOKE") return { kind: "revoke" };
  if (policy === "DISABLE") return { kind: "disable" };
  return { kind: "none", why: grant.source === "ROLE" ? "Regel: bei Rollenverlust nichts tun." : "Manuelle Freigabe bleibt laut Regel bestehen." };
}
function roleOnlyAction(rules, roleIds, grant, now) {
  const hasRole = !!roleIds && rules.grantRoleIds.some((r) => roleIds.includes(r));
  if (!grant) return hasRole ? { kind: "create", status: "ACTIVE" } : { kind: "none", why: "Keine Freigabe und keine berechtigende Rolle." };
  const status = effectiveRadioStatus(grant, now);
  if (status === "SUSPENDED") return { kind: "none", why: "Gesperrt \u2013 Sperren hebt nur eine F\xFChrungskraft auf." };
  const inactive = grant.archived || status === "REVOKED" || status === "DISABLED" || status === "PENDING" || status === "EXPIRED";
  if (hasRole) return inactive ? { kind: "reactivate", status: "ACTIVE" } : { kind: "none", why: "Berechtigende Rolle vorhanden." };
  return grant.archived || status === "REVOKED" ? { kind: "none", why: "Keine berechtigende Rolle." } : { kind: "revoke" };
}
var RADIO_CSV_COLUMNS = ["discord_id", "discord_name", "external_name", "status", "rank", "department", "expires_at", "reason"];
function csvCell(v) {
  let s = v === null || v === void 0 ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records = [];
  let cur = [], cell = "", quoted = false, line = 1, start = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === "\n") line++;
        cell += c;
      }
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      cur.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      cur.push(cell);
      records.push({ line: start, cells: cur });
      cur = [];
      cell = "";
      line++;
      start = line;
    } else cell += c;
  }
  if (cell !== "" || cur.length) {
    cur.push(cell);
    records.push({ line: start, cells: cur });
  }
  const nonEmpty = records.filter((r) => r.cells.some((x) => x.trim() !== ""));
  const header = (nonEmpty.shift()?.cells ?? []).map((h) => h.trim().toLowerCase());
  return { header, rows: nonEmpty.map((r) => ({ line: r.line, cells: Object.fromEntries(header.map((h, i) => [h, (r.cells[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "")])) })) };
}

// src/application-panels.ts
var POLICE_APPLICATION_KEY = "@polizei";
var clip = (s, max) => s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
var plain = (s) => s.replace(/[*_`~|>\\]/g, "\\$&").replace(/@(everyone|here)/g, "@\u200B$1");
var optionOf = (u) => ({
  label: clip(`${u.name}${u.enabled === false ? " (geschlossen)" : ""}`, 100),
  value: u.key,
  ...u.description ? { description: clip(plain(u.description).replace(/\*|_/g, ""), 100) } : {}
});
var section = (u) => `**__${plain(u.name)}:__**
${u.description}`;
var panelUnits = (units, kind) => units.filter((u) => (u.panel ?? "quali") === kind);
function qualiPanelParts(cfg) {
  const units = panelUnits(cfg.units, "quali");
  return {
    title: clip(cfg.title, 256),
    description: clip([cfg.intro, ...units.map(section)].filter(Boolean).join("\n\n"), 4e3),
    select: { id: "quali:pick", placeholder: "Triff eine Auswahl", options: units.slice(0, 25).map(optionOf) }
  };
}
function applyPanelParts(cfg) {
  const p = cfg.police ?? { title: "\u{1F4CB} Bewerbung bei EN Polizei", description: "" };
  const extra = panelUnits(cfg.units, "apply");
  const title = clip(p.title, 256);
  if (!extra.length) return { title, ...p.description ? { description: clip(p.description, 4e3) } : {}, button: { id: `quali:pick:${POLICE_APPLICATION_KEY}`, label: "Jetzt bewerben", emoji: "\u{1F4CB}", style: "primary" } };
  const police = { key: POLICE_APPLICATION_KEY, name: p.name || "Polizei", enabled: p.enabled };
  return {
    title,
    description: clip([p.description, ...extra.map(section)].filter(Boolean).join("\n\n"), 4e3),
    select: { id: "quali:pick", placeholder: "Wof\xFCr m\xF6chtest du dich bewerben?", options: [police, ...extra].slice(0, 25).map(optionOf) }
  };
}

// src/ai-check.ts
var AI_CHECK_LEVEL_LABEL = { LOW: "gering", MEDIUM: "mittel", HIGH: "hoch" };
var AI_CHECK_HINT = "Nur ein Hinweis, kein Beweis \u2013 im Zweifel im Gespr\xE4ch nachfragen.";
var GIVEAWAYS = [
  [/\bals (eine? )?(ki|künstliche intelligenz|sprachmodell|ai)\b/i, "\u201Eals KI/Sprachmodell\u201C"],
  [/\bas an ai\b|\blanguage model\b/i, "\u201Eas an AI\u201C"],
  [/\b(chat ?gpt|openai|gemini|copilot)\b/i, "nennt ChatGPT/KI-Dienst"],
  [/^\s*(gerne|natürlich|klar|sure|certainly)[!,.]?\s+(hier|here)\b/im, "Antwort beginnt wie eine Chat-Antwort (\u201EGerne! Hier \u2026\u201C)"],
  [/\bhier (ist|sind) (eine?|einige|ein paar|mögliche?)\b[^.\n]{0,40}\b(antwort|beispiel|vorschl|formulier|text)/i, "\u201EHier ist eine m\xF6gliche Antwort \u2026\u201C"],
  [/\[(dein|ihr|name|server|servername|your|platzhalter)[^\]]{0,30}\]/i, "Platzhalter wie \u201E[Dein Name]\u201C"]
];
var PHRASES = [
  /\bzusammenfassend\b/i,
  /\bdarüber hinaus\b/i,
  /\bdes weiteren\b/i,
  /\babschließend (lässt sich|möchte ich|kann man)\b/i,
  /\binsgesamt (lässt sich|kann man) sagen\b/i,
  /\bes ist (mir )?(besonders |sehr )?wichtig,? (zu|dass)\b/i,
  /\bvon (großer|zentraler|entscheidender) bedeutung\b/i,
  /\b(spielt|spielen) eine (entscheidende|wichtige|zentrale) rolle\b/i,
  /\bich bin (fest )?(davon )?überzeugt,? dass\b/i,
  /\bich freue mich (darauf|auf die möglichkeit)\b/i,
  /\bnicht nur\b[^.\n]{1,80}\bsondern auch\b/i,
  /\bin diesem zusammenhang\b/i,
  /\bim hinblick auf\b/i,
  /\bein (respektvoller|professioneller|konstruktiver) umgang\b/i,
  /\b(professionalität|teamfähigkeit|zuverlässigkeit) und (respekt|zuverlässigkeit|teamgeist|professionalität)\b/i,
  /\bimmersive?n? (erlebnis|erfahrung|rollenspiel)\b/i,
  /\b(sachlich|ruhig) und (respektvoll|sachlich|lösungsorientiert)\b/i,
  /\blösungsorientiert\b/i,
  /\bauf augenhöhe\b/i,
  /\bwertvolle[nrs]? (erfahrung|beitrag|mitglied|teil)/i,
  /\bmeine (fähigkeiten|kenntnisse) (einbringen|weiterentwickeln)\b/i,
  /\bkommunikation ist (der schlüssel|das a und o|entscheidend)\b/i,
  /\beinen positiven beitrag\b/i,
  /\bfurthermore\b/i,
  /\bin conclusion\b/i,
  /\bi am (truly )?passionate\b/i,
  /\bdelve\b/i,
  /\bit is (important|crucial|essential) to\b/i,
  /\bfoster(ing)?\b/i
];
var CASUAL = /\b(xd|lol|ka|idk|nen|hab|digga|bro|bissl|bisschen halt)\b|[😂🤣😅👍🙏😁😄]|:\)|:D/iu;
var sentences = (t2) => t2.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
function aiCheck(answers, durationSec) {
  const texts = answers.map((a) => String(a.answer ?? "").trim());
  const all = texts.join("\n\n");
  const chars = all.replace(/\s+/g, " ").length;
  const flagged = /* @__PURE__ */ new Set();
  const hits = [];
  const mark = (re) => texts.forEach((t2, i) => {
    if (re.test(t2)) flagged.add(i);
  });
  if (chars < 40) return { score: 0, level: "LOW", reasons: [], flagged: [] };
  for (const [re, label] of GIVEAWAYS) if (re.test(all)) {
    mark(re);
    hits.push({ points: 60, reason: `Eindeutige KI-Spur: ${label}` });
  }
  if (durationSec && durationSec > 0 && chars >= 300) {
    const cpm = Math.round(chars / durationSec * 60);
    const time = durationSec < 120 ? `${durationSec} s` : `${Math.round(durationSec / 60)} min`;
    if (cpm >= 600) hits.push({ points: 45, reason: `${chars} Zeichen in ${time} (\u2248 ${cpm} Zeichen/Min) \u2013 so schnell tippt niemand, wahrscheinlich hineinkopiert` });
    else if (cpm >= 360) hits.push({ points: 25, reason: `${chars} Zeichen in ${time} (\u2248 ${cpm} Zeichen/Min) \u2013 sehr schnell f\xFCr selbst getippten Text` });
  }
  const phraseHits = PHRASES.filter((re) => re.test(all));
  if (phraseHits.length) {
    phraseHits.forEach(mark);
    const examples = phraseHits.slice(0, 4).map((re) => `\u201E${all.match(re)[0]}\u201C`).join(", ");
    hits.push({ points: Math.min(48, phraseHits.length * 8), reason: `Typische KI-Formulierungen (${phraseHits.length}): ${examples}` });
  }
  if (/—/.test(all)) {
    mark(/—/);
    hits.push({ points: 12, reason: "Geviertstrich \u201E\u2014\u201C (kommt fast nur aus KI-Texten/Kopien)" });
  }
  if (/\*\*[^*\n]+\*\*|^#{1,4} /m.test(all)) {
    mark(/\*\*[^*\n]+\*\*|^#{1,4} /m);
    hits.push({ points: 12, reason: "Markdown-Formatierung (**fett**, \xDCberschriften)" });
  }
  if (/(^|\n)\s*([-•*]|\d+\.)\s+\S.*\n\s*([-•*]|\d+\.)\s+\S/.test(all)) hits.push({ points: 8, reason: "Aufz\xE4hlungen/Listen in den Antworten" });
  const filled = texts.filter((t2) => t2.length > 0);
  const avg = filled.reduce((n, t2) => n + t2.length, 0) / Math.max(1, filled.length);
  if (filled.length >= 3 && avg >= 400 && filled.every((t2) => t2.length >= 150)) hits.push({ points: 10, reason: `Alle Antworten auff\xE4llig lang und ausformuliert (\xD8 ${Math.round(avg)} Zeichen)` });
  const s = sentences(all);
  if (s.length >= 8) {
    const lens = s.map((x) => x.split(/\s+/).length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const cv = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length) / mean;
    if (cv < 0.35 && mean >= 12) hits.push({ points: 10, reason: "Sehr gleichf\xF6rmige, lange S\xE4tze" });
  }
  const long = filled.filter((t2) => t2.length >= 100);
  if (long.length >= 3 && long.every((t2) => /[.!?]$/.test(t2)) && s.length >= 6 && s.every((x) => /^[\p{Lu}„"(\d]/u.test(x))) hits.push({ points: 8, reason: "Durchgehend saubere Gro\xDF-/Kleinschreibung und Zeichensetzung" });
  let score = hits.reduce((n, h) => n + h.points, 0);
  if (CASUAL.test(all) || long.length && long.every((t2) => t2 === t2.toLowerCase())) score -= 15;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    level: score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW",
    reasons: hits.sort((a, b) => b.points - a.points).map((h) => h.reason),
    flagged: [...flagged].sort((a, b) => a - b)
  };
}

// src/ticket-premium.ts
var DEFAULT_TICKET_REF_PREFIX = "EMD";
var ticketRef = (n, prefix = DEFAULT_TICKET_REF_PREFIX, digits = 6) => `${prefix}-${String(n).padStart(digits, "0")}`;
function parseTicketRef(s) {
  const m = s.trim().match(/^(?:[A-Za-z]{2,8}-|#)?0*(\d{1,9})$/);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : null;
}
var FORM_FILE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"];
var FORM_MAX_FILE_BYTES = 8 * 1024 * 1024;
var YES_NO = ["Ja", "Nein"];
var TEXT_MAX = 4e3;
var asText = (v) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? v ? "Ja" : "" : v ?? "").trim();
var asList = (v) => [...new Set((Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).map((x) => x.trim()).filter(Boolean))];
var activeFields = (fields) => fields.filter((f) => f.enabled !== false);
var fieldOptions = (q) => q.type === "YESNO" ? [...YES_NO] : q.type === "CHECKBOX" ? ["Ja"] : q.options;
function parseFormDate(s) {
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/), iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!de && !iso) return null;
  const [d, mo, y] = de ? [Number(de[1]), Number(de[2]), Number(de[3])] : [Number(iso[3]), Number(iso[2]), Number(iso[1])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2200) return null;
  return `${String(d).padStart(2, "0")}.${String(mo).padStart(2, "0")}.${y}`;
}
function validateField(q, raw, files = [], o = {}) {
  const req = (empty) => empty ? q.required ? { error: "Pflichtfeld \u2013 bitte ausf\xFCllen." } : { skipped: true, value: "\u2014" } : null;
  switch (q.type) {
    case "SHORT":
    case "LONG": {
      const v = asText(raw);
      const r = req(!v);
      if (r) return r;
      if (q.minLength && v.length < q.minLength) return { error: `Die Antwort ist zu kurz (mindestens ${q.minLength} Zeichen, aktuell ${v.length}).` };
      const max = q.maxLength ?? TEXT_MAX;
      if (v.length > max) return { error: `Die Antwort ist zu lang (h\xF6chstens ${max} Zeichen, aktuell ${v.length}).` };
      return { value: v };
    }
    case "SELECT":
    case "YESNO": {
      const vs = asList(raw);
      const r = req(!vs.length);
      if (r) return r;
      if (vs.length > 1 || !fieldOptions(q).includes(vs[0])) return { error: "Ung\xFCltige Auswahl." };
      return { value: vs[0] };
    }
    case "MULTI": {
      const vs = asList(raw);
      const r = req(!vs.length);
      if (r) return r;
      if (vs.some((v) => !q.options.includes(v))) return { error: "Ung\xFCltige Auswahl." };
      return { value: vs.join(", ") };
    }
    case "CHECKBOX": {
      const on = raw === true || asList(raw).some((v) => ["ja", "true", "1", "on"].includes(v.toLowerCase()));
      if (!on && q.required) return { error: "Bitte best\xE4tigen." };
      return { value: on ? "Ja" : "Nein" };
    }
    case "NUMBER": {
      const v = asText(raw);
      const r = req(!v);
      if (r) return r;
      if (!/^-?\d{1,12}([.,]\d{1,6})?$/.test(v)) return { error: "Bitte eine Zahl eingeben (z. B. 12 oder 3,5)." };
      const n = Number(v.replace(",", "."));
      if (q.min !== void 0 && n < q.min) return { error: `Mindestens ${q.min}.` };
      if (q.max !== void 0 && n > q.max) return { error: `H\xF6chstens ${q.max}.` };
      return { value: String(n).replace(".", ",") };
    }
    case "DATE": {
      const v = asText(raw);
      const r = req(!v);
      if (r) return r;
      const d = parseFormDate(v);
      return d ? { value: d } : { error: "Bitte ein g\xFCltiges Datum im Format TT.MM.JJJJ eingeben." };
    }
    case "FILE": {
      const r = req(!files.length);
      if (r) return r;
      const max = Math.min(10, q.max ?? 1);
      if (files.length > max) return { error: `H\xF6chstens ${max} Datei(en).` };
      const limit = o.maxFileBytes ?? FORM_MAX_FILE_BYTES, types = o.allowedFileTypes ?? FORM_FILE_TYPES;
      for (const f of files) {
        if (f.size > limit) return { error: `\u201E${f.name}\u201C ist zu gro\xDF (h\xF6chstens ${Math.floor(limit / 1048576)} MB).` };
        if (!f.contentType || !types.includes(f.contentType.split(";")[0].trim())) return { error: `\u201E${f.name}\u201C: Dateityp nicht erlaubt (erlaubt: Bilder, PDF, Text).` };
      }
      return { value: files.map((f) => f.name).join(", "), files };
    }
  }
  return { error: "Unbekannter Feldtyp." };
}
function validateForm(fields, raw, files = {}, o = {}) {
  const errors = {};
  const answers = [];
  for (const q of activeFields(fields)) {
    if (o.only && !o.only.includes(q.id)) continue;
    const r = validateField(q, raw[q.id], files[q.id] ?? [], o);
    if (r.error) errors[q.id] = r.error;
    else answers.push({ questionId: q.id, label: q.label, type: q.type, value: r.value ?? "\u2014", ...r.files?.length ? { files: r.files } : {} });
  }
  return { ok: !Object.keys(errors).length, errors, answers };
}
var FORM_FIELDS_PER_MODAL = 5;
function planFormSteps(fields, perStep = FORM_FIELDS_PER_MODAL) {
  const ids = activeFields(fields).map((f) => f.id);
  const steps = [];
  for (let i = 0; i < ids.length; i += perStep) steps.push(ids.slice(i, i + perStep));
  return steps;
}
var clip2 = (s, n) => s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
function formModal(customId, title, fields, prefill = {}) {
  return { id: customId, title: clip2(title, 45), fields: fields.slice(0, FORM_FIELDS_PER_MODAL).map((q) => {
    const base = { id: q.id, label: clip2(q.label, 45), required: q.required, ...q.description ? { description: clip2(q.description, 100) } : {} };
    const pre = prefill[q.id];
    switch (q.type) {
      case "SHORT":
      case "LONG":
      case "NUMBER":
      case "DATE": {
        const placeholder = q.placeholder ?? (q.type === "NUMBER" ? "Zahl, z. B. 12" : q.type === "DATE" ? "TT.MM.JJJJ" : void 0);
        return {
          ...base,
          kind: q.type === "LONG" ? "paragraph" : "text",
          ...placeholder ? { placeholder: clip2(placeholder, 100) } : {},
          ...q.type === "DATE" ? { maxLength: 10 } : q.type === "NUMBER" ? { maxLength: 20 } : { maxLength: Math.min(TEXT_MAX, q.maxLength ?? TEXT_MAX), ...q.minLength ? { minLength: q.minLength } : {} },
          ...typeof pre === "string" && pre ? { value: pre } : {}
        };
      }
      case "FILE":
        return { ...base, kind: "file", minValues: q.required ? 1 : 0, maxValues: Math.min(10, q.max ?? 1) };
      default: {
        const chosen = new Set(Array.isArray(pre) ? pre : typeof pre === "string" ? [pre] : pre === true ? ["Ja"] : []);
        const options = fieldOptions(q).slice(0, 25).map((v) => ({ label: clip2(v, 100), value: clip2(v, 100), ...chosen.has(v) ? { default: true } : {} }));
        return { ...base, kind: "select", options, minValues: q.required ? 1 : 0, maxValues: q.type === "MULTI" ? options.length : 1, ...q.placeholder ? { placeholder: clip2(q.placeholder, 100) } : {} };
      }
    }
  }) };
}
var TICKET_STATUS_KEYS = {
  OPEN: "Offen",
  CLAIMED: "\xDCbernommen",
  IN_PROGRESS: "In Bearbeitung",
  WAITING_USER: "Wartet auf Nutzer",
  WAITING_INTERNAL: "Wartet auf interne R\xFCckmeldung",
  RESOLVED: "Gel\xF6st",
  ESCALATED: "Eskaliert",
  CLOSED: "Geschlossen",
  ARCHIVED: "Archiviert"
};
function checkStatusChange(from, to, via) {
  const f = from.kind, t2 = to.kind;
  switch (via) {
    case "close":
      return f === "OPEN" ? null : "Das Ticket ist bereits geschlossen.";
    case "reopen":
      return f !== "OPEN" ? t2 === "OPEN" ? null : "Wieder \xF6ffnen braucht einen offenen Status." : "Das Ticket ist bereits offen.";
    case "archive":
      return f === "ARCHIVED" ? "Das Ticket ist bereits archiviert." : f !== "CLOSED" ? "Nur geschlossene Tickets k\xF6nnen archiviert werden." : t2 === "ARCHIVED" ? null : "Kein Archiv-Status eingerichtet.";
    case "status":
      if (f === "OPEN") return t2 === "OPEN" ? null : t2 === "CLOSED" ? "Zum Schlie\xDFen bitte \u201ESchlie\xDFen\u201C benutzen (Grund, Transkript, Benachrichtigungen)." : "Nur geschlossene Tickets k\xF6nnen archiviert werden.";
      if (f === "CLOSED") return t2 === "OPEN" ? "Geschlossene Tickets bitte \xFCber \u201EWieder \xF6ffnen\u201C \xF6ffnen." : null;
      return "Archivierte Tickets k\xF6nnen nur \xFCber \u201EWieder \xF6ffnen\u201C (mit Archiv-Recht) ge\xE4ndert werden.";
  }
}
var statusPermission = (to) => to.kind === "ARCHIVED" ? "ticket.archive" : "ticket.change_status";
function slaState(t2, now = /* @__PURE__ */ new Date()) {
  const firstDueAt = t2.firstResponseMinutes ? new Date(t2.createdAt.getTime() + t2.firstResponseMinutes * 6e4) : null;
  const resolveDueAt = t2.resolutionMinutes ? new Date(t2.createdAt.getTime() + t2.resolutionMinutes * 6e4 + t2.waitingSeconds * 1e3) : null;
  const paused = !!t2.waitingSince;
  const open = !t2.closedAt;
  return {
    firstDueAt,
    resolveDueAt,
    paused,
    firstOverdue: !!firstDueAt && open && !t2.firstResponseAt && now > firstDueAt,
    resolveOverdue: !!resolveDueAt && open && !paused && now > resolveDueAt
  };
}
export {
  AI_CHECK_HINT,
  AI_CHECK_LEVEL_LABEL,
  ALL_PERMISSIONS,
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  APPLICATION_VARIABLES,
  AREA_PERMISSIONS,
  BACKUP_PARTS,
  BACKUP_PART_LABEL,
  BOT_COMMAND_MODULES,
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
  DEFAULT_FLEET_CONFIG,
  DEFAULT_HR_CONFIG,
  DEFAULT_MDT_CONFIG,
  DEFAULT_RADIO_ROLE_RULES,
  DEFAULT_TICKET_REF_PREFIX,
  DEFAULT_VERIFY_CONFIG,
  DEFAULT_WELCOME_CONFIG,
  DISCORD_LIMITS,
  DISPATCH_STATUSES,
  DISPATCH_TRANSITIONS,
  DN_STATUSES,
  DN_STATUS_LABEL,
  DN_VARIABLES,
  DRIVER_HINT,
  DRIVER_STATES,
  DUTY_STATUSES,
  ERLC_BUILTIN_MAP,
  ERLC_DEFAULT_BLOCKED,
  ERLC_DEFAULT_CRITICAL,
  ERLC_FEATURES,
  ERLC_FEATURE_LABELS,
  ERLC_MAP_SIZE,
  ERLC_POLL_OPTIONS,
  ERLC_POSTALS,
  ERLC_STATUSES,
  ERLC_STATUS_LABEL,
  EXAM_ATTEMPT_STATUSES,
  EXAM_ATTEMPT_STATUS_LABEL,
  EXAM_EXPORT_FORMAT,
  EXAM_LAYOUTS,
  EXAM_LAYOUT_LABEL,
  EXAM_QUESTION_TYPES,
  EXAM_QUESTION_TYPE_HINT,
  EXAM_QUESTION_TYPE_LABEL,
  EXAM_REVIEW_LABEL,
  EXAM_REVIEW_MODES,
  EXAM_SHUFFLE_TYPES,
  FORM_FIELDS_PER_MODAL,
  FORM_FILE_TYPES,
  FORM_MAX_FILE_BYTES,
  FORM_PANEL_VARIABLES,
  FORM_QUESTION_TYPES,
  HR_EVENTS,
  HR_EVENT_LABEL,
  InvalidTransitionError,
  JOIN_LOG_TOLERANCE_MS,
  LEGACY_DANGER,
  LOG_CATEGORIES,
  LOG_DEFAULT_OFF,
  LOG_TYPES,
  MAX_FORM_OPTIONS,
  MAX_FORM_QUESTIONS,
  MB_BUTTON_STYLES,
  MB_DEFAULT_CATEGORIES,
  MB_LIMITS,
  MODULES,
  MODULE_KEYS,
  MUSIC_TRACKS,
  NO_TICKET_BUTTON,
  PERIOD_LABEL,
  PERMISSION_CATALOG,
  POLICE_APPLICATION_KEY,
  POSITION_HINT,
  PRIORITIES,
  PRIORITY_LABEL,
  PROFILE_FIELDS,
  PROFILE_FIELD_LABEL,
  PROFILE_SECTIONS,
  PROFILE_SECTION_LABEL,
  QUESTION_TYPES,
  RADIO_CSV_COLUMNS,
  RADIO_GRANT_SOURCES,
  RADIO_GRANT_SOURCE_LABEL,
  RADIO_GRANT_STATUSES,
  RADIO_GRANT_STATUS_LABEL,
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
  TICKET_STATUS_KEYS,
  TICKET_TRANSITIONS,
  UNIT_STATUSES,
  VERIFY_NICK_VARS,
  VOICE_CASE_STATUS,
  WANTED_HIT_STATUSES,
  WANTED_HIT_STATUS_LABELS,
  WANTED_MATCH_LABELS,
  WANTED_MATCH_TYPES,
  WANTED_STATUSES,
  WANTED_TRANSITIONS,
  WARNING_TEMPLATE,
  WARNING_VARIABLES,
  WEEKDAYS,
  WEEK_COUNTED_STATUSES,
  WEEK_TIMEZONE,
  WELCOME_VARIABLES,
  WORKFLOW_ACTION_LABELS,
  WORKFLOW_OPS,
  WORKFLOW_OP_LABELS,
  WORKFLOW_TRIGGERS,
  YES_NO,
  absenceTypeSchema,
  accountAge,
  activeFields,
  ageOf,
  aiCheck,
  applyCallCalibration,
  applyPanelParts,
  areaGrantsFor,
  assertTransition,
  awardDefSchema,
  backupConfigSchema,
  can,
  canDelegate,
  canTransition,
  checkAnswer,
  checkStatusChange,
  cleanReportValues,
  cloneWithNewIds,
  commandsForServer,
  conditionMatches,
  csvCell,
  dangerLevelOf,
  defaultTicketButtons,
  departmentSchema,
  describeDiscordError,
  diffPresence,
  dnSettingsSchema,
  dutyTimeText,
  effectivePermissions,
  effectiveRadioStatus,
  embedChars,
  emptyMbDocument,
  emptyMbEmbed,
  emptyMbMessage,
  examExportSchema,
  examProblems,
  examSchema,
  fieldOptions,
  fieldValue,
  fillTemplate,
  fitCallCalibration,
  fitPostalCalibration,
  fleetConfigSchema,
  fleetInternalSchema,
  fleetModelSchema,
  formModal,
  formPanelMessage,
  formPanelResult,
  formPanelSchema,
  formatMinutes,
  formatServiceNumber,
  freeFieldKey,
  gameToPixel,
  gapAnswers,
  gradeAnswer,
  grantMatches,
  hasErrors,
  hexColor,
  hireMappingSchema,
  hrConfigSchema,
  hrStatusSchema,
  infoOptionEmbed,
  infoOptionSchema,
  infoPanelMessage,
  infoPanelSchema,
  interactiveComponents,
  isAnswered,
  isDutyTimeField,
  isHttpUrl,
  isInputQuestion,
  isPermissionKey,
  isRadioAuthorized,
  isRadioRoleOnly,
  isRobloxField,
  isSupportOpen,
  isValidEmoji,
  isValidRobloxUserId,
  isoWeek,
  localMidnight,
  localTime,
  logCategoryOf,
  logChannelFor,
  logTypeLabel,
  loggingConfigSchema,
  maskGaps,
  matchWantedPlayer,
  matchingBinds,
  mbActionSchema,
  mbButtonSchema,
  mbDocumentDataSchema,
  mbEmbedSchema,
  mbFieldSchema,
  mbId,
  mbMessageSchema,
  mbRowSchema,
  mbSelectOptionSchema,
  mbSummary,
  mdtConfigSchema,
  missingBotPerms,
  moduleDef,
  moduleDependencyError,
  moduleOfPermission,
  newVoiceRoom,
  nextWeekStart,
  normalizeField,
  notifyRuleSchema,
  onErlcMap,
  panelFieldSchema,
  panelUnits,
  parseCsv,
  parseFormDate,
  parsePlayer,
  parseQuestions,
  parseTicketRef,
  periodEnd,
  periodLabel,
  periodStart,
  personDetailsSchema,
  pixelToGame,
  planFormSteps,
  playerKey,
  poiForPlace,
  policeReportFields,
  postalMatchRate,
  postalPosition,
  qualiPanelParts,
  questionProblems,
  questionSchema,
  radioRoleSyncAction,
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
  slaState,
  splitGaps,
  staffListSchema,
  staffSectionSchema,
  stageSchema,
  statusLabel,
  statusPermission,
  ticketButtonsOf,
  ticketChannelName,
  ticketNumber,
  ticketRef,
  toDiscordPayload,
  toPartialEmoji,
  triggerMatches,
  validateField,
  validateForm,
  validateMbDocument,
  validateMbMessage,
  verifyActions,
  weekIso,
  weekKey,
  weekLabel,
  weekStartOf,
  weekTotals,
  withHrDefaults
};
