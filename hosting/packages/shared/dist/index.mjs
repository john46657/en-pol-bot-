// src/permissions.ts
var PERMISSION_CATALOG = {
  /** `dashboard.<bereich>.view`: Sichtbarkeit ganzer Bereiche im Menü und auf der Startseite (zusätzlich zur Modul-Permission). */
  dashboard: ["view", "customize", "tickets.view", "applications.view", "team.view", "offices.view", "voice.view", "radio.view", "teamchance.view", "logs.view", "settings.view"],
  team: ["view", "manage"],
  dispatch: ["view", "create", "edit", "assign", "close", "manage"],
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
  "dashboard.settings.view": ["settings.view", "roles.view", "users.view", "studio.view"]
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
var FORM_QUESTION_TYPES = { TEXT: "Text", CHOICE: "Multiple choice", ROLE: "Role select" };
var MAX_FORM_QUESTIONS = 50;
var MAX_FORM_OPTIONS = 25;
function normalizeField(f) {
  const type = f.type ?? "TEXT";
  return {
    key: f.key,
    label: f.label,
    required: f.required,
    type,
    minLength: type === "TEXT" ? Math.max(0, f.minLength ?? 0) : 0,
    maxLength: f.maxLength,
    options: type === "TEXT" ? [] : (f.options ?? []).slice(0, MAX_FORM_OPTIONS),
    multiple: type !== "TEXT" && !!f.multiple
  };
}
function freeFieldKey(used) {
  const set = new Set(used);
  for (let n = 1; ; n++) if (!set.has(`frage${n}`)) return `frage${n}`;
}
function checkAnswer(field, value) {
  const f = normalizeField(field);
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
  confirmation: "Bist du sicher, dass du dich bewerben m\xF6chtest?\n\nSobald du startest, schicke ich dir nacheinander **{questionCount} Fragen**. Du hast **{timeLimit}** Zeit, die Bewerbung abzuschlie\xDFen \u2013 sonst musst du neu starten. Abbrechen kannst du jederzeit \xFCber den Button.",
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
export {
  ALL_PERMISSIONS,
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  APPLICATION_VARIABLES,
  AREA_PERMISSIONS,
  CLAIM_MODES,
  CLOSE_REASON_MODES,
  CLOSE_REASON_SOURCES,
  COMPLAINT_STATUSES,
  COMPLAINT_TRANSITIONS,
  DEFAULT_APPLICATION_MESSAGES,
  DISPATCH_STATUSES,
  DISPATCH_TRANSITIONS,
  DUTY_STATUSES,
  EVIDENCE_CUSTODY_STATES,
  EVIDENCE_TRANSITIONS,
  FORM_QUESTION_TYPES,
  INVESTIGATION_STATUSES,
  INVESTIGATION_TRANSITIONS,
  InvalidTransitionError,
  MAX_FORM_OPTIONS,
  MAX_FORM_QUESTIONS,
  PERMISSION_CATALOG,
  PRIORITIES,
  QUESTION_TYPES,
  REPORT_STATUSES,
  REPORT_TRANSITIONS,
  REPORT_TYPES,
  ROBLOX_VERIFICATION_STATUSES,
  STATUS_KINDS,
  TICKET_ACTIONS,
  TICKET_ACTION_KEYS,
  TICKET_PLACEHOLDERS,
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
  UNIT_STATUSES,
  WANTED_STATUSES,
  WANTED_TRANSITIONS,
  areaGrantsFor,
  assertTransition,
  can,
  canDelegate,
  canTransition,
  checkAnswer,
  defaultTicketButtons,
  effectivePermissions,
  formatMinutes,
  freeFieldKey,
  grantMatches,
  isPermissionKey,
  isValidRobloxUserId,
  normalizeField,
  renderApplicationText,
  renderTicketText,
  resolvePermission,
  rolesMatch,
  ticketChannelName,
  ticketNumber
};
