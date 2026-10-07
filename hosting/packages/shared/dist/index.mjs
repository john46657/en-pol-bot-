// src/permissions.ts
var PERMISSION_CATALOG = {
  /** `dashboard.<bereich>.view`: Sichtbarkeit ganzer Bereiche im Menü und auf der Startseite (zusätzlich zur Modul-Permission). */
  dashboard: ["view", "customize", "tickets.view", "applications.view", "team.view", "offices.view", "voice.view", "radio.view", "teamchance.view", "logs.view", "settings.view", "cad.view"],
  team: ["view", "manage"],
  dispatch: ["view", "create", "edit", "assign", "close", "manage"],
  /** CAD-Leitstelle + ER:LC-Integration (deny-by-default; kritische ER:LC-Befehle brauchen ein eigenes Recht). */
  cad: ["view", "create_incident", "edit_incident", "close_incident", "assign_unit", "manage_units", "view_persons", "view_vehicles", "manage_map", "view_erlc", "manage_erlc", "erlc_command", "erlc_command_critical", "manage_cross_server", "view_logs", "manage_settings", "radio"],
  incidents: ["view", "create", "edit", "close", "delete"],
  persons: ["view", "create", "edit", "archive", "merge"],
  vehicles: ["view", "create", "edit", "archive"],
  reports: ["view", "create", "edit", "submit", "review", "approve", "reject", "archive"],
  tickets: ["view", "create", "edit", "void"],
  complaints: ["view", "create", "assign", "investigate", "resolve", "close"],
  investigations: ["view", "create", "edit", "close"],
  wanted: ["view", "create", "edit", "activate", "clear"],
  evidence: ["view", "create", "transfer", "release"],
  personnel: ["view", "create", "edit", "promote", "discipline"],
  leave: ["view", "request", "manage"],
  applications: ["view", "review", "decide"],
  academy: ["view", "manage"],
  sek: ["view", "report", "manage"],
  qualifications: ["view", "decide", "manage"],
  ticket: ["view", "create", "claim", "close", "reopen", "delete", "add_user", "remove_user", "change_status", "change_priority", "change_category", "rename", "move", "lock", "escalate", "transcript", "transcript_delete", "internal_notes", "rate", "manage", "settings"],
  /** Funk-Codes (Liste der Funkcodes, z. B. 10-4) */
  radio: ["view", "manage"],
  /** Team-Chance: Bewerbungsphase für das Team öffnen/schließen */
  teamchance: ["view", "manage"],
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
var CAD_EVENTS = ["incident.created", "incident.status", "incident.assigned", "incident.closed", "call.received", "announcement", "radio"];
var CAD_EVENT_LABELS = {
  "incident.created": "Neuer Einsatz",
  "incident.status": "Einsatzstatus ge\xE4ndert",
  "incident.assigned": "Einheit zugewiesen",
  "incident.closed": "Einsatz abgeschlossen",
  "call.received": "Notruf eingegangen",
  announcement: "Wichtige Leitstellenmeldung",
  radio: "Funkmeldung"
};
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
  "call.received": "calls",
  announcement: "announcements",
  radio: "radio"
};
var CAD_WIDGETS = ["activeIncidents", "availableUnits", "erlcPlayers", "erlcQueue", "activeCalls", "staffOnline", "erlcStatus", "map", "units", "radio", "persons", "vehicles"];
var CAD_WIDGET_LABELS = {
  activeIncidents: "Aktive Eins\xE4tze",
  availableUnits: "Verf\xFCgbare Einheiten",
  erlcPlayers: "ER:LC-Spieler",
  erlcQueue: "Warteschlange",
  activeCalls: "Aktive Notrufe",
  staffOnline: "Server-Team online",
  erlcStatus: "ER:LC-Status",
  map: "Einsatzkarte",
  units: "Einheiten",
  radio: "Letzte Funkmeldungen",
  persons: "Personen",
  vehicles: "Fahrzeuge"
};
var ERLC_MAP_SIZE = 5355;
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
    { key: "vehicles", label: "Fahrzeuge", builtin: true, enabledByDefault: false },
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
    { key: "vehicle", label: "Fahrzeug", emoji: "\u{1F697}", color: "#a855f7" },
    { key: "staff", label: "Staff", emoji: "\u{1F46E}", color: "#f59e0b" },
    { key: "player", label: "Spieler", emoji: "\u2022", color: "#94a3b8" },
    { key: "poi", label: "POI", emoji: "\u{1F4CD}", color: "#10b981" }
  ],
  map: { imageUrl: null, width: ERLC_MAP_SIZE, height: ERLC_MAP_SIZE, originX: ERLC_MAP_SIZE / 2, originY: ERLC_MAP_SIZE / 2, scale: 1 },
  routes: [],
  memberFields: [],
  widgets: ["activeIncidents", "availableUnits", "activeCalls", "erlcStatus", "erlcPlayers", "erlcQueue", "staffOnline", "map", "radio"]
};
var gameToPixel = (m, x, z) => ({ px: m.originX + x * m.scale, py: m.originY + z * m.scale });
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
function dangerLevelOf(cfg, key) {
  return cfg.levels.find((l) => l.key === key) ?? cfg.levels.find((l) => l.key === LEGACY_DANGER[key ?? ""]) ?? cfg.levels[0];
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
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    const base = { action: ctx.action, entityType: ctx.entityType ?? "", entityId: ctx.entityId ?? "", actor: ctx.actor ?? "System" };
    const v = key in base ? base[key] : fieldValue(ctx.after, key.startsWith("after.") ? key.slice(6) : key);
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
    message: "Hey {user}, sch\xF6n, dass du da bist! Du bist Mitglied **#{memberCount}**.\n\nLies dir bitte die Regeln durch. Bewerben kannst du dich jederzeit \xFCber das Bewerbungs-Panel."
  },
  dm: { enabled: false, message: "Willkommen auf **{server}**, {username}! Bei Fragen \xF6ffne einfach ein Support-Ticket." },
  autoRoleIds: [],
  goodbye: { enabled: false, channelId: null, title: "Auf Wiedersehen", color: "#64748b", showAvatar: true, pingUser: false, message: "**{username}** hat den Server verlassen. Wir sind jetzt {memberCount} Mitglieder." }
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
export {
  ALL_PERMISSIONS,
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  APPLICATION_VARIABLES,
  AREA_PERMISSIONS,
  CAD_EVENTS,
  CAD_EVENT_LABELS,
  CAD_EVENT_SEND_TYPE,
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
  DEFAULT_WELCOME_CONFIG,
  DISPATCH_STATUSES,
  DISPATCH_TRANSITIONS,
  DUTY_STATUSES,
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
  FORM_QUESTION_TYPES,
  INVESTIGATION_STATUSES,
  INVESTIGATION_TRANSITIONS,
  InvalidTransitionError,
  LEGACY_DANGER,
  MAX_FORM_OPTIONS,
  MAX_FORM_QUESTIONS,
  PERMISSION_CATALOG,
  PRIORITIES,
  PRIORITY_LABEL,
  QUESTION_TYPES,
  REPORT_STATUSES,
  REPORT_TRANSITIONS,
  REPORT_TYPES,
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
  WANTED_STATUSES,
  WANTED_TRANSITIONS,
  WELCOME_VARIABLES,
  WORKFLOW_ACTION_LABELS,
  WORKFLOW_OPS,
  WORKFLOW_OP_LABELS,
  WORKFLOW_TRIGGERS,
  accountAge,
  areaGrantsFor,
  assertTransition,
  can,
  canDelegate,
  canTransition,
  checkAnswer,
  conditionMatches,
  dangerLevelOf,
  defaultTicketButtons,
  effectivePermissions,
  fieldValue,
  formatMinutes,
  freeFieldKey,
  gameToPixel,
  grantMatches,
  hexColor,
  isInputQuestion,
  isPermissionKey,
  isValidRobloxUserId,
  normalizeField,
  parsePlayer,
  pixelToGame,
  renderApplicationText,
  renderTemplate,
  renderTicketText,
  renderWelcomeText,
  resolvePermission,
  rolesMatch,
  statusLabel,
  ticketChannelName,
  ticketNumber,
  triggerMatches
};
