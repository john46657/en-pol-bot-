"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key3 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key3) && key3 !== except)
        __defProp(to, key3, { get: () => from[key3], enumerable: !(desc = __getOwnPropDesc(from, key3)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ALL_PERMISSIONS: () => ALL_PERMISSIONS,
  APPLICATION_STATUSES: () => APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS: () => APPLICATION_TRANSITIONS,
  APPLICATION_VARIABLES: () => APPLICATION_VARIABLES,
  AREA_PERMISSIONS: () => AREA_PERMISSIONS,
  BACKUP_PARTS: () => BACKUP_PARTS,
  BACKUP_PART_LABEL: () => BACKUP_PART_LABEL,
  BOT_COMMAND_MODULES: () => BOT_COMMAND_MODULES,
  CAD_EVENTS: () => CAD_EVENTS,
  CAD_EVENT_LABELS: () => CAD_EVENT_LABELS,
  CAD_EVENT_SEND_TYPE: () => CAD_EVENT_SEND_TYPE,
  CAD_FEEDBACK: () => CAD_FEEDBACK,
  CAD_FEEDBACK_KEYS: () => CAD_FEEDBACK_KEYS,
  CAD_LINK_ACTIONS: () => CAD_LINK_ACTIONS,
  CAD_LINK_LABELS: () => CAD_LINK_LABELS,
  CAD_LINK_SEND_TYPES: () => CAD_LINK_SEND_TYPES,
  CAD_WIDGETS: () => CAD_WIDGETS,
  CAD_WIDGET_LABELS: () => CAD_WIDGET_LABELS,
  CLAIM_MODES: () => CLAIM_MODES,
  CLOSE_REASON_MODES: () => CLOSE_REASON_MODES,
  CLOSE_REASON_SOURCES: () => CLOSE_REASON_SOURCES,
  COMPLAINT_STATUSES: () => COMPLAINT_STATUSES,
  COMPLAINT_TRANSITIONS: () => COMPLAINT_TRANSITIONS,
  DEFAULT_APPLICATION_MESSAGES: () => DEFAULT_APPLICATION_MESSAGES,
  DEFAULT_CAD_CONFIG: () => DEFAULT_CAD_CONFIG,
  DEFAULT_DANGER_CONFIG: () => DEFAULT_DANGER_CONFIG,
  DEFAULT_FLEET_CONFIG: () => DEFAULT_FLEET_CONFIG,
  DEFAULT_HR_CONFIG: () => DEFAULT_HR_CONFIG,
  DEFAULT_MDT_CONFIG: () => DEFAULT_MDT_CONFIG,
  DEFAULT_RADIO_ROLE_RULES: () => DEFAULT_RADIO_ROLE_RULES,
  DEFAULT_VERIFY_CONFIG: () => DEFAULT_VERIFY_CONFIG,
  DEFAULT_WELCOME_CONFIG: () => DEFAULT_WELCOME_CONFIG,
  DISCORD_LIMITS: () => DISCORD_LIMITS,
  DISPATCH_STATUSES: () => DISPATCH_STATUSES,
  DISPATCH_TRANSITIONS: () => DISPATCH_TRANSITIONS,
  DN_STATUSES: () => DN_STATUSES,
  DN_STATUS_LABEL: () => DN_STATUS_LABEL,
  DN_VARIABLES: () => DN_VARIABLES,
  DRIVER_HINT: () => DRIVER_HINT,
  DRIVER_STATES: () => DRIVER_STATES,
  DUTY_STATUSES: () => DUTY_STATUSES,
  ERLC_BUILTIN_MAP: () => ERLC_BUILTIN_MAP,
  ERLC_DEFAULT_BLOCKED: () => ERLC_DEFAULT_BLOCKED,
  ERLC_DEFAULT_CRITICAL: () => ERLC_DEFAULT_CRITICAL,
  ERLC_FEATURES: () => ERLC_FEATURES,
  ERLC_FEATURE_LABELS: () => ERLC_FEATURE_LABELS,
  ERLC_MAP_SIZE: () => ERLC_MAP_SIZE,
  ERLC_POLL_OPTIONS: () => ERLC_POLL_OPTIONS,
  ERLC_STATUSES: () => ERLC_STATUSES,
  ERLC_STATUS_LABEL: () => ERLC_STATUS_LABEL,
  EVIDENCE_CUSTODY_STATES: () => EVIDENCE_CUSTODY_STATES,
  EVIDENCE_TRANSITIONS: () => EVIDENCE_TRANSITIONS,
  EXAM_ATTEMPT_STATUSES: () => EXAM_ATTEMPT_STATUSES,
  EXAM_ATTEMPT_STATUS_LABEL: () => EXAM_ATTEMPT_STATUS_LABEL,
  EXAM_EXPORT_FORMAT: () => EXAM_EXPORT_FORMAT,
  EXAM_LAYOUTS: () => EXAM_LAYOUTS,
  EXAM_LAYOUT_LABEL: () => EXAM_LAYOUT_LABEL,
  EXAM_QUESTION_TYPES: () => EXAM_QUESTION_TYPES,
  EXAM_QUESTION_TYPE_HINT: () => EXAM_QUESTION_TYPE_HINT,
  EXAM_QUESTION_TYPE_LABEL: () => EXAM_QUESTION_TYPE_LABEL,
  EXAM_REVIEW_LABEL: () => EXAM_REVIEW_LABEL,
  EXAM_REVIEW_MODES: () => EXAM_REVIEW_MODES,
  EXAM_SHUFFLE_TYPES: () => EXAM_SHUFFLE_TYPES,
  FORM_PANEL_VARIABLES: () => FORM_PANEL_VARIABLES,
  FORM_QUESTION_TYPES: () => FORM_QUESTION_TYPES,
  HR_EVENTS: () => HR_EVENTS,
  HR_EVENT_LABEL: () => HR_EVENT_LABEL,
  INVESTIGATION_STATUSES: () => INVESTIGATION_STATUSES,
  INVESTIGATION_TRANSITIONS: () => INVESTIGATION_TRANSITIONS,
  InvalidTransitionError: () => InvalidTransitionError,
  JOIN_LOG_TOLERANCE_MS: () => JOIN_LOG_TOLERANCE_MS,
  LEGACY_DANGER: () => LEGACY_DANGER,
  LOG_CATEGORIES: () => LOG_CATEGORIES,
  LOG_DEFAULT_OFF: () => LOG_DEFAULT_OFF,
  LOG_TYPES: () => LOG_TYPES,
  MAX_FORM_OPTIONS: () => MAX_FORM_OPTIONS,
  MAX_FORM_QUESTIONS: () => MAX_FORM_QUESTIONS,
  MB_BUTTON_STYLES: () => MB_BUTTON_STYLES,
  MB_DEFAULT_CATEGORIES: () => MB_DEFAULT_CATEGORIES,
  MB_LIMITS: () => MB_LIMITS,
  MODULES: () => MODULES,
  MODULE_KEYS: () => MODULE_KEYS,
  MUSIC_TRACKS: () => MUSIC_TRACKS,
  PERIOD_LABEL: () => PERIOD_LABEL,
  PERMISSION_CATALOG: () => PERMISSION_CATALOG,
  POSITION_HINT: () => POSITION_HINT,
  PRIORITIES: () => PRIORITIES,
  PRIORITY_LABEL: () => PRIORITY_LABEL,
  PROFILE_FIELDS: () => PROFILE_FIELDS,
  PROFILE_FIELD_LABEL: () => PROFILE_FIELD_LABEL,
  PROFILE_SECTIONS: () => PROFILE_SECTIONS,
  PROFILE_SECTION_LABEL: () => PROFILE_SECTION_LABEL,
  QUESTION_TYPES: () => QUESTION_TYPES,
  RADIO_CSV_COLUMNS: () => RADIO_CSV_COLUMNS,
  RADIO_GRANT_SOURCES: () => RADIO_GRANT_SOURCES,
  RADIO_GRANT_SOURCE_LABEL: () => RADIO_GRANT_SOURCE_LABEL,
  RADIO_GRANT_STATUSES: () => RADIO_GRANT_STATUSES,
  RADIO_GRANT_STATUS_LABEL: () => RADIO_GRANT_STATUS_LABEL,
  REPORT_FIELD_TYPES: () => REPORT_FIELD_TYPES,
  REPORT_STATUSES: () => REPORT_STATUSES,
  REPORT_STATUS_LABEL: () => REPORT_STATUS_LABEL,
  REPORT_TRANSITIONS: () => REPORT_TRANSITIONS,
  REPORT_TYPES: () => REPORT_TYPES,
  REQUEST_STATUSES: () => REQUEST_STATUSES,
  REQUEST_STATUS_DEFAULT: () => REQUEST_STATUS_DEFAULT,
  REQUIREMENT_LABEL: () => REQUIREMENT_LABEL,
  REQUIREMENT_TYPES: () => REQUIREMENT_TYPES,
  ROBLOX_NAME: () => ROBLOX_NAME,
  ROBLOX_VERIFICATION_STATUSES: () => ROBLOX_VERIFICATION_STATUSES,
  STATUS_KINDS: () => STATUS_KINDS,
  STATUS_LABEL: () => STATUS_LABEL,
  SYNC_DATA_TYPES: () => SYNC_DATA_TYPES,
  SYNC_DIRECTIONS: () => SYNC_DIRECTIONS,
  TICKET_ACTIONS: () => TICKET_ACTIONS,
  TICKET_ACTION_KEYS: () => TICKET_ACTION_KEYS,
  TICKET_PLACEHOLDERS: () => TICKET_PLACEHOLDERS,
  TICKET_STATUSES: () => TICKET_STATUSES,
  TICKET_TRANSITIONS: () => TICKET_TRANSITIONS,
  UNIT_STATUSES: () => UNIT_STATUSES,
  VERIFY_NICK_VARS: () => VERIFY_NICK_VARS,
  VOICE_CASE_STATUS: () => VOICE_CASE_STATUS,
  WANTED_HIT_STATUSES: () => WANTED_HIT_STATUSES,
  WANTED_HIT_STATUS_LABELS: () => WANTED_HIT_STATUS_LABELS,
  WANTED_MATCH_LABELS: () => WANTED_MATCH_LABELS,
  WANTED_MATCH_TYPES: () => WANTED_MATCH_TYPES,
  WANTED_STATUSES: () => WANTED_STATUSES,
  WANTED_TRANSITIONS: () => WANTED_TRANSITIONS,
  WARNING_VARIABLES: () => WARNING_VARIABLES,
  WEAPON_STATUSES: () => WEAPON_STATUSES,
  WEAPON_STATUS_KEYS: () => WEAPON_STATUS_KEYS,
  WEEKDAYS: () => WEEKDAYS,
  WEEK_COUNTED_STATUSES: () => WEEK_COUNTED_STATUSES,
  WEEK_TIMEZONE: () => WEEK_TIMEZONE,
  WELCOME_VARIABLES: () => WELCOME_VARIABLES,
  WORKFLOW_ACTION_LABELS: () => WORKFLOW_ACTION_LABELS,
  WORKFLOW_OPS: () => WORKFLOW_OPS,
  WORKFLOW_OP_LABELS: () => WORKFLOW_OP_LABELS,
  WORKFLOW_TRIGGERS: () => WORKFLOW_TRIGGERS,
  absenceTypeSchema: () => absenceTypeSchema,
  accountAge: () => accountAge,
  ageOf: () => ageOf,
  applyCallCalibration: () => applyCallCalibration,
  areaGrantsFor: () => areaGrantsFor,
  assertTransition: () => assertTransition,
  awardDefSchema: () => awardDefSchema,
  backupConfigSchema: () => backupConfigSchema,
  can: () => can,
  canDelegate: () => canDelegate,
  canTransition: () => canTransition,
  checkAnswer: () => checkAnswer,
  cleanReportValues: () => cleanReportValues,
  cloneWithNewIds: () => cloneWithNewIds,
  commandsForServer: () => commandsForServer,
  conditionMatches: () => conditionMatches,
  csvCell: () => csvCell,
  dangerLevelOf: () => dangerLevelOf,
  defaultTicketButtons: () => defaultTicketButtons,
  departmentSchema: () => departmentSchema,
  describeDiscordError: () => describeDiscordError,
  diffPresence: () => diffPresence,
  dnSettingsSchema: () => dnSettingsSchema,
  dutyTimeText: () => dutyTimeText,
  effectivePermissions: () => effectivePermissions,
  effectiveRadioStatus: () => effectiveRadioStatus,
  embedChars: () => embedChars,
  emptyMbDocument: () => emptyMbDocument,
  emptyMbEmbed: () => emptyMbEmbed,
  emptyMbMessage: () => emptyMbMessage,
  examExportSchema: () => examExportSchema,
  examProblems: () => examProblems,
  examSchema: () => examSchema,
  fieldValue: () => fieldValue,
  fillTemplate: () => fillTemplate,
  fitCallCalibration: () => fitCallCalibration,
  fleetConfigSchema: () => fleetConfigSchema,
  fleetInternalSchema: () => fleetInternalSchema,
  fleetModelSchema: () => fleetModelSchema,
  formPanelMessage: () => formPanelMessage,
  formPanelResult: () => formPanelResult,
  formPanelSchema: () => formPanelSchema,
  formatMinutes: () => formatMinutes,
  formatServiceNumber: () => formatServiceNumber,
  freeFieldKey: () => freeFieldKey,
  gameToPixel: () => gameToPixel,
  gapAnswers: () => gapAnswers,
  gradeAnswer: () => gradeAnswer,
  grantMatches: () => grantMatches,
  hasErrors: () => hasErrors,
  hexColor: () => hexColor,
  hireMappingSchema: () => hireMappingSchema,
  hrConfigSchema: () => hrConfigSchema,
  hrStatusSchema: () => hrStatusSchema,
  infoOptionEmbed: () => infoOptionEmbed,
  infoOptionSchema: () => infoOptionSchema,
  infoPanelMessage: () => infoPanelMessage,
  infoPanelSchema: () => infoPanelSchema,
  interactiveComponents: () => interactiveComponents,
  isAnswered: () => isAnswered,
  isDutyTimeField: () => isDutyTimeField,
  isHttpUrl: () => isHttpUrl,
  isInputQuestion: () => isInputQuestion,
  isPermissionKey: () => isPermissionKey,
  isRadioAuthorized: () => isRadioAuthorized,
  isRobloxField: () => isRobloxField,
  isSupportOpen: () => isSupportOpen,
  isValidEmoji: () => isValidEmoji,
  isValidRobloxUserId: () => isValidRobloxUserId,
  isoWeek: () => isoWeek,
  localMidnight: () => localMidnight,
  localTime: () => localTime,
  logCategoryOf: () => logCategoryOf,
  logChannelFor: () => logChannelFor,
  logTypeLabel: () => logTypeLabel,
  loggingConfigSchema: () => loggingConfigSchema,
  maskGaps: () => maskGaps,
  matchWantedPlayer: () => matchWantedPlayer,
  matchingBinds: () => matchingBinds,
  mbActionSchema: () => mbActionSchema,
  mbButtonSchema: () => mbButtonSchema,
  mbDocumentDataSchema: () => mbDocumentDataSchema,
  mbEmbedSchema: () => mbEmbedSchema,
  mbFieldSchema: () => mbFieldSchema,
  mbId: () => mbId,
  mbMessageSchema: () => mbMessageSchema,
  mbRowSchema: () => mbRowSchema,
  mbSelectOptionSchema: () => mbSelectOptionSchema,
  mbSummary: () => mbSummary,
  mdtConfigSchema: () => mdtConfigSchema,
  missingBotPerms: () => missingBotPerms,
  moduleDef: () => moduleDef,
  moduleDependencyError: () => moduleDependencyError,
  moduleOfPermission: () => moduleOfPermission,
  newVoiceRoom: () => newVoiceRoom,
  nextWeekStart: () => nextWeekStart,
  normalizeField: () => normalizeField,
  notifyRuleSchema: () => notifyRuleSchema,
  onErlcMap: () => onErlcMap,
  panelFieldSchema: () => panelFieldSchema,
  parseCsv: () => parseCsv,
  parsePlayer: () => parsePlayer,
  parseQuestions: () => parseQuestions,
  periodEnd: () => periodEnd,
  periodLabel: () => periodLabel,
  periodStart: () => periodStart,
  personDetailsSchema: () => personDetailsSchema,
  pixelToGame: () => pixelToGame,
  playerKey: () => playerKey,
  poiForPlace: () => poiForPlace,
  policeReportFields: () => policeReportFields,
  policyAllowsFlow: () => policyAllowsFlow,
  questionProblems: () => questionProblems,
  questionSchema: () => questionSchema,
  radioRoleSyncAction: () => radioRoleSyncAction,
  rangeSchema: () => rangeSchema,
  rankSchema: () => rankSchema,
  renderApplicationText: () => renderApplicationText,
  renderPanelTemplate: () => renderPanelTemplate,
  renderStaffList: () => renderStaffList,
  renderTemplate: () => renderTemplate,
  renderTicketText: () => renderTicketText,
  renderVerifyNickname: () => renderVerifyNickname,
  renderWelcomeText: () => renderWelcomeText,
  reportFieldSchema: () => reportFieldSchema,
  reportMessage: () => reportMessage,
  reportTemplateSchema: () => reportTemplateSchema,
  requestStatusDefSchema: () => requestStatusDefSchema,
  requirementSchema: () => requirementSchema,
  resolvePermission: () => resolvePermission,
  rolesMatch: () => rolesMatch,
  severitySchema: () => severitySchema,
  splitGaps: () => splitGaps,
  staffListSchema: () => staffListSchema,
  staffSectionSchema: () => staffSectionSchema,
  stageSchema: () => stageSchema,
  statusLabel: () => statusLabel,
  ticketChannelName: () => ticketChannelName,
  ticketNumber: () => ticketNumber,
  toDiscordPayload: () => toDiscordPayload,
  toPartialEmoji: () => toPartialEmoji,
  triggerMatches: () => triggerMatches,
  validateMbDocument: () => validateMbDocument,
  validateMbMessage: () => validateMbMessage,
  verifyActions: () => verifyActions,
  weekIso: () => weekIso,
  weekKey: () => weekKey,
  weekLabel: () => weekLabel,
  weekStartOf: () => weekStartOf,
  weekTotals: () => weekTotals,
  withHrDefaults: () => withHrDefaults
});
module.exports = __toCommonJS(index_exports);

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
  /** Waffenregister im MDT */
  weapons: ["view", "create", "edit"],
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
  /** Dienstnummern-System */
  dienstnummer: ["view", "create", "assign", "edit", "release", "block", "history", "manage_ranges", "manage_settings"],
  leave: ["view", "request", "manage"],
  applications: ["view", "review", "decide", "delete", "auto_assign_dienstnummer"],
  academy: ["view", "manage"],
  sek: ["view", "report", "manage"],
  qualifications: ["view", "decide", "delete", "manage"],
  ticket: ["view", "create", "claim", "close", "reopen", "delete", "add_user", "remove_user", "change_status", "change_priority", "change_category", "rename", "move", "lock", "escalate", "transcript", "transcript_delete", "internal_notes", "rate", "manage", "settings"],
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
  messagebuilder: ["view", "create", "templates_create", "templates_edit", "templates_delete", "send", "history", "channels", "webhooks", "roles"],
  /** Serververbindungen und Datenfreigaben (wirksam nur mit dem Recht auf JEDEM beteiligten Server) */
  connections: ["view", "manage"],
  /** Synchronisierungsereignisse einsehen bzw. fehlgeschlagene erneut anstoßen */
  sync: ["view", "retry"]
};
var ALL_PERMISSIONS = Object.entries(PERMISSION_CATALOG).flatMap(
  ([module2, actions]) => actions.map((a) => `${module2}.${a}`)
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
  map: { imageUrl: null, width: ERLC_MAP_SIZE, height: ERLC_MAP_SIZE, originX: ERLC_MAP_SIZE / 2, originY: ERLC_MAP_SIZE / 2, scale: 1 },
  routes: [],
  memberFields: [],
  widgets: ["activeIncidents", "availableUnits", "activeCalls", "dutyActivity", "erlcStatus", "map", "radio"]
};
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
var import_zod = require("zod");
var sf = import_zod.z.string().regex(/^\d{15,25}$/, "Discord-ID (15\u201325 Ziffern)");
var color = import_zod.z.string().regex(/^#[0-9a-fA-F]{6}$/);
var emoji = import_zod.z.string().trim().max(64);
var imageRef = import_zod.z.union([import_zod.z.string().trim().max(500).regex(/^(https:\/\/\S+|media:[0-9a-f-]{36})$/, "Bild: https://-Link oder hochgeladene Datei"), import_zod.z.literal("")]).default("");
var toInt = (hex) => parseInt(hex.slice(1), 16);
var staffSectionSchema = import_zod.z.object({
  roleId: sf,
  /** eigene Überschrift statt der Rollen-Erwähnung (leer = @Rolle) */
  label: import_zod.z.string().max(100).default(""),
  /** Trennlinie nach diesem Abschnitt */
  divider: import_zod.z.boolean().default(true)
});
var staffListSchema = import_zod.z.object({
  id: import_zod.z.string().uuid(),
  name: import_zod.z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  channelId: sf.nullable().default(null),
  title: import_zod.z.string().max(256).default("EN | Staff-Team"),
  intro: import_zod.z.string().max(1e3).default(""),
  color: color.default("#2b2d31"),
  sections: import_zod.z.array(staffSectionSchema).max(40).default([]),
  /** Text, wenn niemand die Rolle hat */
  emptyText: import_zod.z.string().max(50).default("/"),
  dividerText: import_zod.z.string().max(60).default("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"),
  /** Mitglieder als Erwähnung (@Name, wie im Screenshot) oder als Anzeigename */
  mention: import_zod.z.boolean().default(true),
  /** wer mehrere Rollen der Liste hat, steht nur unter der obersten */
  onlyHighest: import_zod.z.boolean().default(false),
  bullet: import_zod.z.string().max(8).default("\u2022"),
  footer: import_zod.z.string().max(200).default(""),
  timestamp: import_zod.z.boolean().default(true),
  /** automatisch aktualisieren, sobald sich Rollen ändern */
  autoUpdate: import_zod.z.boolean().default(true),
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
var panelFieldSchema = import_zod.z.object({
  id: import_zod.z.string().regex(/^[a-z0-9_]{1,30}$/, "K\xFCrzel: a\u2013z, 0\u20139, _"),
  label: import_zod.z.string().trim().min(1).max(45),
  placeholder: import_zod.z.string().max(100).default(""),
  long: import_zod.z.boolean().default(false),
  required: import_zod.z.boolean().default(true),
  maxLength: import_zod.z.number().int().min(1).max(4e3).default(200)
});
var formPanelSchema = import_zod.z.object({
  id: import_zod.z.string().uuid(),
  name: import_zod.z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  active: import_zod.z.boolean().default(true),
  /** Panel-Nachricht mit Button */
  channelId: sf.nullable().default(null),
  panelTitle: import_zod.z.string().max(256).default("Funk- und Roblox-Daten"),
  panelText: import_zod.z.string().max(4e3).default("Klicke unten auf den Button und trage deine Daten ein."),
  panelColor: color.default("#22c55e"),
  panelImage: imageRef,
  buttonLabel: import_zod.z.string().trim().min(1).max(80).default("Daten eintragen"),
  buttonEmoji: emoji.default("\u{1F4DD}"),
  buttonStyle: import_zod.z.enum(["primary", "secondary", "success", "danger"]).default("success"),
  /** Formular */
  modalTitle: import_zod.z.string().trim().min(1).max(45).default("Deine Daten"),
  fields: import_zod.z.array(panelFieldSchema).min(1).max(5).default([{ id: "zello", label: "Zello Funk", placeholder: "Zello-Name", long: false, required: true, maxLength: 100 }, { id: "roblox", label: "Roblox User", placeholder: "Roblox-Name", long: false, required: true, maxLength: 100 }]),
  /** Ergebnis-Nachricht */
  targetChannelId: sf.nullable().default(null),
  template: import_zod.z.string().min(1).max(2e3).default("Zello Funk: {zello}\n\nRoblox User: {roblox}"),
  /** als Embed statt Text */
  asEmbed: import_zod.z.boolean().default(false),
  embedTitle: import_zod.z.string().max(256).default(""),
  embedColor: color.default("#3b82f6"),
  /** Nachricht mit Namen und Profilbild der Person posten (Webhook – der Bot braucht „Webhooks verwalten“) */
  asUser: import_zod.z.boolean().default(true),
  reactions: import_zod.z.array(emoji.min(1)).max(10).default(["\u2705"]),
  pingRoleIds: import_zod.z.array(sf).max(10).default([]),
  /** jede Person nur einmal (erneutes Absenden ersetzt die alte Nachricht) */
  onePerUser: import_zod.z.boolean().default(true),
  confirmText: import_zod.z.string().max(500).default("\u2705 Danke! Deine Angaben wurden gepostet."),
  /** Rollen, die man nach dem Absenden bekommt */
  grantRoleIds: import_zod.z.array(sf).max(10).default([])
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
var httpsImage = import_zod.z.union([import_zod.z.string().trim().max(500).regex(/^https:\/\/\S+$/, "Bild: https://-Link"), import_zod.z.literal("")]).default("");
var infoOptionSchema = import_zod.z.object({
  id: import_zod.z.string().regex(/^[a-z0-9_-]{1,40}$/, "K\xFCrzel: a\u2013z, 0\u20139, _ und -"),
  /** im Auswahlmenü */
  label: import_zod.z.string().trim().min(1).max(100),
  description: import_zod.z.string().max(100).default(""),
  emoji: emoji.default(""),
  /** Antwort (nur für die Person sichtbar) */
  title: import_zod.z.string().max(256).default(""),
  text: import_zod.z.string().max(4e3).default(""),
  image: httpsImage,
  color: color.default("#3b82f6")
});
var infoPanelSchema = import_zod.z.object({
  id: import_zod.z.string().uuid(),
  name: import_zod.z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  channelId: sf.nullable().default(null),
  title: import_zod.z.string().max(256).default("Aufgaben als Ausbilder"),
  text: import_zod.z.string().max(4e3).default("Hier findest du alles Wichtige. W\xE4hle unten einen Punkt aus."),
  color: color.default("#1f2937"),
  image: imageRef,
  footer: import_zod.z.string().max(200).default("Klicke auf \u201ETriff eine Auswahl\u201C, um mehr zu erfahren."),
  placeholder: import_zod.z.string().trim().min(1).max(150).default("Triff eine Auswahl"),
  options: import_zod.z.array(infoOptionSchema).min(1).max(25).default([
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
var import_zod2 = require("zod");
var sf2 = import_zod2.z.string().regex(/^\d{15,25}$/, "Discord-ID (15\u201325 Ziffern)");
var REPORT_FIELD_TYPES = ["short", "long", "number", "select"];
var reportFieldSchema = import_zod2.z.object({
  id: import_zod2.z.string().regex(/^[a-z0-9_]{1,30}$/, "K\xFCrzel: a\u2013z, 0\u20139, _"),
  label: import_zod2.z.string().trim().min(1).max(45),
  type: import_zod2.z.enum(REPORT_FIELD_TYPES).default("short"),
  placeholder: import_zod2.z.string().max(100).default(""),
  required: import_zod2.z.boolean().default(true),
  /** nur bei Auswahl */
  options: import_zod2.z.array(import_zod2.z.string().trim().min(1).max(100)).max(25).default([]),
  maxLength: import_zod2.z.number().int().min(1).max(4e3).default(1e3),
  /** in Discord nebeneinander anzeigen */
  inline: import_zod2.z.boolean().default(false),
  /** Trennlinie vor diesem Feld (nur Listen-Darstellung) */
  separator: import_zod2.z.boolean().default(false)
});
var reportTemplateSchema = import_zod2.z.object({
  id: import_zod2.z.string().uuid(),
  name: import_zod2.z.string().trim().min(1).max(60),
  emoji: import_zod2.z.string().max(16).default("\u{1F4DD}"),
  description: import_zod2.z.string().max(500).default(""),
  period: import_zod2.z.enum(["DAILY", "WEEKLY", "FREE"]).default("DAILY"),
  active: import_zod2.z.boolean().default(true),
  guildId: sf2.nullable().default(null),
  /** Kanal, in den jeder Bericht gepostet wird (leer = nur Dashboard) */
  channelId: sf2.nullable().default(null),
  color: import_zod2.z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3b82f6"),
  fields: import_zod2.z.array(reportFieldSchema).min(1).max(20),
  /** pro Person und Zeitraum nur ein Bericht (erneutes Ausfüllen bearbeitet den vorhandenen) */
  onePerPeriod: import_zod2.z.boolean().default(true),
  /** Verfasser darf nach dem Einreichen noch bearbeiten */
  authorCanEdit: import_zod2.z.boolean().default(true),
  /** Rollen, die beim neuen Bericht erwähnt werden */
  pingRoleIds: import_zod2.z.array(sf2).max(10).default([]),
  /** Darstellung in Discord: FIELDS = Embed-Felder, LIST = „➣ **Feld:** Wert“-Liste mit Trennlinien */
  layout: import_zod2.z.enum(["FIELDS", "LIST"]).default("FIELDS")
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
  { key: "core", name: "Grundsystem", description: "Dashboard, Benutzer, Rollen & Rechte, Einstellungen, Audit, Server, Verbindungen", system: true, permissionPrefixes: ["dashboard", "settings", "users", "roles", "audit", "studio", "analytics", "servers", "modules", "connections", "sync"] },
  { key: "cad", name: "CAD-Leitstelle", description: "Eins\xE4tze, Einheiten, Notrufe, Karte, Funk, Polizeifahrzeuge", permissionPrefixes: ["cad", "fleet"] },
  { key: "mdt", name: "MDT", description: "Personen, Fahrzeuge, Waffen, Haftbefehle, Bu\xDFgelder", permissionPrefixes: ["persons", "vehicles", "weapons", "wanted", "tickets"] },
  { key: "dispatch", name: "Dispatch", description: "Einsatzverwaltung und Einheiten-Board", permissionPrefixes: ["dispatch", "incidents"] },
  { key: "reports", name: "Berichte", description: "Einsatzberichte, Tages-/Wochenberichte", permissionPrefixes: ["reports", "dutyreports"] },
  { key: "shift_logs", name: "Shift Logs", description: "Dienststatus, Schichten, Dienstzeiten, Wochenranglisten", permissionPrefixes: ["team"] },
  { key: "investigations", name: "Ermittlungen", description: "Beschwerden, Ermittlungen, Beweismittel", permissionPrefixes: ["complaints", "investigations", "evidence"] },
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
var SYNC_DATA_TYPES = [
  { key: "reports", module: "reports", label: "Berichte (eingereicht/freigegeben)", source: "reports" },
  { key: "unit_status", module: "shift_logs", label: "Dienststatus der Beamten", source: "duty" },
  { key: "shift_statistics", module: "shift_logs", label: "Wochenstatistik (Shift Logs)", source: "weekly-reset" },
  { key: "team_overview", module: "shift_logs", label: "Team\xFCbersicht (wer ist im Dienst)", source: "duty" },
  { key: "incidents", module: "cad", label: "Eins\xE4tze", source: null },
  { key: "incident_status", module: "cad", label: "Einsatzstatus", source: null },
  { key: "radio_messages", module: "cad", label: "Funkspr\xFCche", source: null }
];
var SYNC_DIRECTIONS = ["A_TO_B", "B_TO_A", "BIDIRECTIONAL", "NONE"];
function policyAllowsFlow(p, from, to) {
  if (!p.enabled || p.direction === "NONE") return false;
  const forward = p.sourceServerId === from && p.targetServerId === to;
  const backward = p.sourceServerId === to && p.targetServerId === from;
  return forward && (p.direction === "A_TO_B" || p.direction === "BIDIRECTIONAL") || backward && (p.direction === "B_TO_A" || p.direction === "BIDIRECTIONAL");
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
  ermittlung: "investigations",
  beweis: "investigations",
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
var import_zod3 = require("zod");
var sf3 = import_zod3.z.string().regex(/^\d{15,25}$/, "Discord-ID (15\u201325 Ziffern)");
var color2 = import_zod3.z.string().regex(/^#[0-9a-fA-F]{6}$/);
var key = import_zod3.z.string().regex(/^[A-Z0-9_]{1,32}$/, "Schl\xFCssel: A\u2013Z, 0\u20139, _");
var uuid = import_zod3.z.string().uuid();
var hrStatusSchema = import_zod3.z.object({ key, label: import_zod3.z.string().trim().min(1).max(40), emoji: import_zod3.z.string().max(16).default(""), color: color2.default("#64748b"), active: import_zod3.z.boolean().default(true) });
var departmentSchema = import_zod3.z.object({ id: uuid, name: import_zod3.z.string().trim().min(1).max(64), color: color2.default("#3b82f6"), discordRoleIds: import_zod3.z.array(sf3).max(10).default([]), dashboardRoleIds: import_zod3.z.array(uuid).max(10).default([]), description: import_zod3.z.string().max(300).default("") });
var severitySchema = import_zod3.z.object({ key, label: import_zod3.z.string().trim().min(1).max(40), emoji: import_zod3.z.string().max(16).default("\u26A0\uFE0F"), color: color2.default("#f59e0b"), defaultDays: import_zod3.z.number().int().min(0).max(3650).default(30) });
var awardDefSchema = import_zod3.z.object({
  id: uuid,
  name: import_zod3.z.string().trim().min(1).max(60),
  icon: import_zod3.z.string().max(16).default("\u{1F3C5}"),
  description: import_zod3.z.string().max(500).default(""),
  color: color2.default("#eab308"),
  requirements: import_zod3.z.string().max(500).default(""),
  public: import_zod3.z.boolean().default(true),
  discordRoleId: sf3.nullable().default(null),
  active: import_zod3.z.boolean().default(true)
});
var absenceTypeSchema = import_zod3.z.object({ key, label: import_zod3.z.string().trim().min(1).max(40), emoji: import_zod3.z.string().max(16).default("") });
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
var notifyRuleSchema = import_zod3.z.object({ dashboard: import_zod3.z.boolean().default(true), channelId: sf3.nullable().default(null), dm: import_zod3.z.boolean().default(false), roleIds: import_zod3.z.array(uuid).max(20).default([]) });
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
var stageSchema = import_zod3.z.object({ id: uuid, name: import_zod3.z.string().trim().min(1).max(60), roleIds: import_zod3.z.array(uuid).max(20).default([]) });
var REQUEST_STATUSES = ["OPEN", "IN_REVIEW", "APPROVED", "REJECTED", "DEFERRED", "EXECUTED", "CANCELLED"];
var requestStatusDefSchema = import_zod3.z.object({ label: import_zod3.z.string().max(40), emoji: import_zod3.z.string().max(16) });
var hrConfigSchema = import_zod3.z.object({
  statuses: import_zod3.z.array(hrStatusSchema).max(30).default([]),
  departments: import_zod3.z.array(departmentSchema).max(50).default([]),
  absenceTypes: import_zod3.z.array(absenceTypeSchema).max(30).default([]),
  warningSeverities: import_zod3.z.array(severitySchema).max(20).default([]),
  warningCategories: import_zod3.z.array(import_zod3.z.string().trim().min(1).max(60)).max(50).default([]),
  awards: import_zod3.z.array(awardDefSchema).max(100).default([]),
  /** Bereiche der Personalakte */
  sections: import_zod3.z.record(import_zod3.z.enum(PROFILE_SECTIONS), import_zod3.z.object({ visible: import_zod3.z.boolean(), sensitive: import_zod3.z.boolean() })).default({}),
  /** Felder der Übersicht/Akte */
  fields: import_zod3.z.record(import_zod3.z.enum(PROFILE_FIELDS), import_zod3.z.object({ visible: import_zod3.z.boolean(), sensitive: import_zod3.z.boolean() })).default({}),
  /** Abwesenheiten im Teamprofil anzeigen */
  showAbsenceInTeam: import_zod3.z.boolean().default(true),
  promotion: import_zod3.z.object({
    stages: import_zod3.z.array(stageSchema).max(10).default([]),
    approvalsRequired: import_zod3.z.number().int().min(1).max(10).default(1),
    requireReason: import_zod3.z.boolean().default(true),
    /** Antrag nur, wenn alle Voraussetzungen erfüllt sind */
    requireRequirements: import_zod3.z.boolean().default(false),
    /** nach letzter Genehmigung automatisch durchführen */
    autoExecute: import_zod3.z.boolean().default(false),
    discordRoles: import_zod3.z.boolean().default(true),
    dashboardRoles: import_zod3.z.boolean().default(false),
    announceChannelId: sf3.nullable().default(null),
    announceTemplate: import_zod3.z.string().max(2e3).default("\u{1F396}\uFE0F **BEF\xD6RDERUNG**\n\n{mitglied} wurde bef\xF6rdert.\n\n**Alter Rang:** {alter_rang}\n**Neuer Rang:** {neuer_rang}\n\n**Begr\xFCndung:** {begruendung}\n\n**Bef\xF6rdert durch:** {durch}\n**Datum:** {datum}"),
    announceColor: color2.default("#eab308"),
    /** eigene Namen/Emojis für die Status */
    statusLabels: import_zod3.z.record(import_zod3.z.enum(REQUEST_STATUSES), requestStatusDefSchema).default({})
  }).default({}),
  transfer: import_zod3.z.object({
    approvalsRequired: import_zod3.z.number().int().min(1).max(10).default(1),
    stages: import_zod3.z.array(stageSchema).max(10).default([]),
    discordRoles: import_zod3.z.boolean().default(true),
    dashboardRoles: import_zod3.z.boolean().default(false),
    autoExecute: import_zod3.z.boolean().default(true),
    announceChannelId: sf3.nullable().default(null)
  }).default({}),
  notifications: import_zod3.z.record(import_zod3.z.enum(HR_EVENTS), notifyRuleSchema).default({}),
  /** Verwarnungen: Meldung in Discord mit Zähler und Folgen beim Erreichen der Grenze */
  warnings: import_zod3.z.object({
    /** Grenze aktiver Verwarnungen (z. B. 3 → „1/3“) */
    limit: import_zod3.z.number().int().min(1).max(20).default(3),
    /** Kanal für jede neue Verwarnung (leer = nur Dashboard) */
    channelId: sf3.nullable().default(null),
    template: import_zod3.z.string().max(1500).default("**Wer:** {mitglied}\n**Grund:** {grund}\n**Verwarnungen:** {anzahl}/{grenze}"),
    /** Person per DM informieren */
    dm: import_zod3.z.boolean().default(true),
    atLimit: import_zod3.z.object({
      /** Dashboard-Rollen, die benachrichtigt werden (z. B. Leitung) */
      notifyRoleIds: import_zod3.z.array(uuid).max(20).default([]),
      /** Discord-Rollen, die in der Meldung erwähnt werden */
      pingDiscordRoleIds: import_zod3.z.array(sf3).max(10).default([]),
      /** Discord-Rollen, die entzogen werden */
      removeDiscordRoleIds: import_zod3.z.array(sf3).max(25).default([]),
      /** Status der Personalakte setzen (z. B. SUSPENDED) – leer = nicht ändern */
      status: import_zod3.z.string().max(32).nullable().default(null)
    }).default({})
  }).default({}),
  /** Zertifikate */
  certificate: import_zod3.z.object({ organisation: import_zod3.z.string().max(100).default("EN Polizei"), logo: import_zod3.z.string().max(500).default(""), signature: import_zod3.z.string().max(100).default("") }).default({})
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
var requirementSchema = import_zod3.z.object({ id: uuid, type: import_zod3.z.enum(REQUIREMENT_TYPES), label: import_zod3.z.string().max(120).default(""), value: import_zod3.z.number().min(0).max(1e5).default(0), ref: import_zod3.z.string().max(64).nullable().default(null) });
var rankSchema = import_zod3.z.object({
  id: uuid.optional(),
  name: import_zod3.z.string().trim().min(1).max(64),
  description: import_zod3.z.string().max(500).nullable().default(null),
  icon: import_zod3.z.string().max(16).nullable().default(null),
  color: color2.default("#64748b"),
  discordRoleIds: import_zod3.z.array(sf3).max(10).default([]),
  dashboardRoleIds: import_zod3.z.array(uuid).max(10).default([]),
  nextRankIds: import_zod3.z.array(uuid).max(20).default([]),
  approverRankIds: import_zod3.z.array(uuid).max(20).default([]),
  requirements: import_zod3.z.array(requirementSchema).max(30).default([]),
  active: import_zod3.z.boolean().default(true)
});
var DN_STATUSES = ["ACTIVE", "RESERVED", "FREE", "BLOCKED", "FORMER"];
var DN_STATUS_LABEL = {
  ACTIVE: { label: "Aktiv", emoji: "\u{1F7E2}" },
  RESERVED: { label: "Reserviert", emoji: "\u{1F7E1}" },
  FREE: { label: "Frei", emoji: "\u26AA" },
  BLOCKED: { label: "Gesperrt", emoji: "\u{1F534}" },
  FORMER: { label: "Ehemalig", emoji: "\u26AB" }
};
var rangeSchema = import_zod3.z.object({
  name: import_zod3.z.string().trim().min(1).max(60),
  prefix: import_zod3.z.string().max(10).default(""),
  suffix: import_zod3.z.string().max(10).default(""),
  start: import_zod3.z.number().int().min(0).max(9999999),
  end: import_zod3.z.number().int().min(0).max(9999999),
  padLength: import_zod3.z.number().int().min(0).max(10).default(0),
  order: import_zod3.z.enum(["LOWEST_FREE", "SEQUENTIAL"]).default("LOWEST_FREE"),
  autoAssign: import_zod3.z.boolean().default(true),
  manual: import_zod3.z.boolean().default(true),
  reuse: import_zod3.z.boolean().default(true),
  releaseAs: import_zod3.z.enum(["FREE", "FORMER", "BLOCKED"]).default("FORMER"),
  department: import_zod3.z.string().max(64).nullable().default(null),
  active: import_zod3.z.boolean().default(true)
}).refine((r) => r.end >= r.start, { message: "Endnummer muss \u2265 Startnummer sein.", path: ["end"] }).refine((r) => r.end - r.start <= 1e5, { message: "H\xF6chstens 100 000 Nummern je Kreis.", path: ["end"] });
var formatServiceNumber = (r, value) => `${r.prefix}${String(value).padStart(r.padLength, "0")}${r.suffix}`;
var hireMappingSchema = import_zod3.z.object({
  /** 'police' = Polizei-Bewerbung, sonst Name der Einheit (Qualifikation) */
  kind: import_zod3.z.string().trim().min(1).max(64),
  /** Nummernkreis (leer = keine automatische Dienstnummer) */
  rangeId: uuid.nullable().default(null),
  department: import_zod3.z.string().max(64).nullable().default(null),
  rankId: uuid.nullable().default(null),
  /** Personalakte anlegen */
  createProfile: import_zod3.z.boolean().default(true),
  /** zusätzliche Discord-Rollen */
  roleIds: import_zod3.z.array(sf3).max(10).default([])
});
var dnSettingsSchema = import_zod3.z.object({
  /** ACCEPT: direkt bei Annahme · COMPLETE: wenn die Person im Discord verknüpft/erreichbar ist (Einstellung abgeschlossen) · MANUAL: Bestätigung durch berechtigte Person */
  timing: import_zod3.z.enum(["ACCEPT", "COMPLETE", "MANUAL"]).default("ACCEPT"),
  mappings: import_zod3.z.array(hireMappingSchema).max(50).default([{ kind: "police", rangeId: null, department: "Polizei", rankId: null, createProfile: true, roleIds: [] }]),
  nickname: import_zod3.z.object({ enabled: import_zod3.z.boolean().default(false), format: import_zod3.z.string().max(60).default("[{dienstnummer}] {name}") }).default({}),
  dm: import_zod3.z.object({ enabled: import_zod3.z.boolean().default(true), title: import_zod3.z.string().max(256).default("\u{1F389} BEWERBUNG ANGENOMMEN"), template: import_zod3.z.string().max(3e3).default("Herzlichen Gl\xFCckwunsch {user}!\n\nDeine Bewerbung wurde angenommen.\n\n\u{1FAAA} **Dienstnummer:** {dienstnummer}\n\u{1F46E} **Rang:** {rang}\n\u{1F3E2} **Abteilung:** {abteilung}\n\nBitte merke dir deine Dienstnummer."), color: color2.default("#22c55e") }).default({}),
  rankRoles: import_zod3.z.boolean().default(true),
  departmentRoles: import_zod3.z.boolean().default(true),
  /** Wechsel der Nummer braucht eine zweite Person (Genehmiger) */
  changeNeedsApprover: import_zod3.z.boolean().default(false)
});
var WARNING_VARIABLES = ["{mitglied}", "{name}", "{grund}", "{schweregrad}", "{kategorie}", "{anzahl}", "{grenze}", "{durch}", "{datum}", "{ablauf}"];
var DN_VARIABLES = ["{user}", "{name}", "{dienstnummer}", "{rang}", "{abteilung}", "{bewerbung}", "{datum}"];
function fillTemplate(tpl, vars) {
  return tpl.replace(/\{([\w.]{1,40})\}/g, (m, k) => vars[k] !== void 0 && vars[k] !== null ? String(vars[k]) : m).replace(/@(everyone|here)/g, "@\u200B$1");
}

// src/exams.ts
var import_zod4 = require("zod");
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
var questionSchema = import_zod4.z.object({
  id: import_zod4.z.string().min(1).max(40),
  type: import_zod4.z.enum(EXAM_QUESTION_TYPES),
  text: import_zod4.z.string().trim().min(1).max(2e3),
  /** Antwortmöglichkeiten (Choice), Einträge in richtiger Reihenfolge (ORDER) oder linke Seite (MATCH) */
  options: import_zod4.z.array(import_zod4.z.string().trim().min(1).max(200)).max(12).default([]),
  /** MATCH: rechte Seite – matches[i] gehört zu options[i] */
  matches: import_zod4.z.array(import_zod4.z.string().trim().min(1).max(200)).max(12).default([]),
  /** richtige Antwort(en): Option-Index als Text, „ja“/„nein“, Zahl oder Stichworte (Freitext ohne Stichworte → Prüfer) */
  correct: import_zod4.z.array(import_zod4.z.string().max(200)).max(12).default([]),
  points: import_zod4.z.number().min(0).max(100).default(1),
  /** Teilpunkte (Multiple Choice, Freitext-Stichworte, Reihenfolge, Zuordnung, Lückentext) */
  partial: import_zod4.z.boolean().default(false),
  /** NUMBER: erlaubte Abweichung */
  tolerance: import_zod4.z.number().min(0).max(1e9).default(0),
  /** Erklärung, die nach der Bewertung (Einsicht mit Lösungen) angezeigt wird */
  explanation: import_zod4.z.string().max(2e3).nullable().default(null),
  /** optionales Bild (nur https) */
  image: import_zod4.z.string().max(500).regex(/^https:\/\//i, "Bild-Link muss mit https:// beginnen").nullable().default(null)
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
var isoDate = import_zod4.z.string().datetime({ offset: true });
var examSchema = import_zod4.z.object({
  title: import_zod4.z.string().trim().min(1).max(120),
  description: import_zod4.z.string().max(3e3).nullable().default(null),
  /** Hinweise auf der Startseite vor Beginn */
  instructions: import_zod4.z.string().max(4e3).nullable().default(null),
  category: import_zod4.z.string().trim().max(60).nullable().default(null),
  questions: import_zod4.z.array(questionSchema).max(200).default([]),
  questionCount: import_zod4.z.number().int().min(0).max(200).default(0),
  passPercent: import_zod4.z.number().int().min(1).max(100).default(70),
  timeLimitMin: import_zod4.z.number().int().min(1).max(600).nullable().default(null),
  maxAttempts: import_zod4.z.number().int().min(1).max(50).default(3),
  retryHours: import_zod4.z.number().int().min(0).max(24 * 90).default(24),
  autoGrade: import_zod4.z.boolean().default(true),
  showResult: import_zod4.z.boolean().default(true),
  reviewMode: import_zod4.z.enum(EXAM_REVIEW_MODES).default("ANSWERS"),
  layout: import_zod4.z.enum(EXAM_LAYOUTS).default("PAGED"),
  shuffleQuestions: import_zod4.z.boolean().default(false),
  shuffleOptions: import_zod4.z.boolean().default(false),
  examinerIds: import_zod4.z.array(import_zod4.z.string().uuid()).max(30).default([]),
  /** Dashboard-Rollen, die die Prüfung sehen/ablegen dürfen (leer = alle mit exam.view) */
  audienceRoleIds: import_zod4.z.array(import_zod4.z.string().uuid()).max(30).default([]),
  trainingId: import_zod4.z.string().uuid().nullable().default(null),
  /** muss vorher bestanden sein */
  requiredExamId: import_zod4.z.string().uuid().nullable().default(null),
  availableFrom: isoDate.nullable().default(null),
  availableUntil: isoDate.nullable().default(null),
  /** Prüfer bei Abgabe benachrichtigen, wenn manuell bewertet werden muss */
  notifyExaminers: import_zod4.z.boolean().default(true),
  active: import_zod4.z.boolean().default(true)
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
var examExportSchema = import_zod4.z.object({ format: import_zod4.z.literal(EXAM_EXPORT_FORMAT), version: import_zod4.z.literal(1), exam: import_zod4.z.record(import_zod4.z.unknown()) });

// src/logging.ts
var import_zod5 = require("zod");
var LOG_CATEGORIES = [
  { key: "einsaetze", label: "Eins\xE4tze & Leitstelle", emoji: "\u{1F6A8}", modules: ["cad", "dispatch", "incidents", "erlc", "radio", "fleet"] },
  { key: "akten", label: "Akten & Ermittlungen", emoji: "\u{1F5C2}\uFE0F", modules: ["persons", "vehicles", "weapons", "wanted", "investigations", "evidence", "reports", "tickets", "complaints"] },
  { key: "bewerbungen", label: "Bewerbungen & Qualifikationen", emoji: "\u{1F4CB}", modules: ["applications", "qualifications"] },
  { key: "personal", label: "Personal & Ausbildung", emoji: "\u{1F46E}", modules: ["personnel", "promotion", "dienstnummer", "training", "exam", "academy", "sek"] },
  { key: "dienst", label: "Dienst, Abmeldungen & Berichte", emoji: "\u{1F552}", modules: ["team", "dutyreports", "leave"] },
  { key: "kommunikation", label: "Kommunikation & Discord", emoji: "\u{1F4AC}", modules: ["communication", "discord"] },
  { key: "rechte", label: "Rechte, Konten & Anmeldung", emoji: "\u{1F510}", modules: ["permissions", "users", "auth"] },
  { key: "einstellungen", label: "Einstellungen & System", emoji: "\u2699\uFE0F", modules: ["settings", "studio", "teamchance", "media", "locks", "export"] }
];
var logCategoryOf = (module2) => LOG_CATEGORIES.find((c) => c.modules.includes(module2))?.key ?? "sonstiges";
var LOG_TYPES = {
  "fleet.vehicle.incident": "fleet",
  "fleet.vehicle.update": "fleet",
  "fleet.model.delete": "fleet",
  "fleet.model.update": "fleet",
  "fleet.model.create": "fleet",
  "fleet.config": "fleet",
  "weapon.update": "weapons",
  "weapon.create": "weapons",
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
var sf4 = import_zod5.z.string().regex(/^\d{15,25}$/, "Discord-Kanal-ID");
var loggingConfigSchema = import_zod5.z.object({
  enabled: import_zod5.z.boolean().default(true),
  /** Kanal je Kategorie */
  categories: import_zod5.z.record(import_zod5.z.string().max(32), sf4).default({}),
  /** Abweichung je Typ: eigener Kanal oder 'off' (aus); fehlt = Kanal der Kategorie */
  types: import_zod5.z.record(import_zod5.z.string().max(80), import_zod5.z.union([sf4, import_zod5.z.literal("off"), import_zod5.z.literal("on")])).default({})
});
function logChannelFor(cfg, module2, action) {
  if (!cfg.enabled) return null;
  const t2 = cfg.types[action];
  if (t2 === "off") return null;
  if (t2 && t2 !== "on") return t2;
  if (!t2 && LOG_DEFAULT_OFF.has(action)) return null;
  return cfg.categories[logCategoryOf(module2)] ?? null;
}

// src/backup.ts
var import_zod6 = require("zod");
var BACKUP_PARTS = ["roles", "channels", "settings"];
var BACKUP_PART_LABEL = { roles: "Rollen", channels: "Kategorien & Kan\xE4le (mit Rechten)", settings: "Servereinstellungen (Name, Verifizierung, AFK \u2026)" };
var backupConfigSchema = import_zod6.z.object({
  /** Dashboard-Daten stündlich automatisch sichern */
  dataAuto: import_zod6.z.boolean().default(true),
  /** Discord-Server täglich automatisch sichern */
  discordAuto: import_zod6.z.boolean().default(false),
  /** Dashboard-Daten: so viele Tage (je ein Backup, die letzten 48 Stunden alle); Discord: so viele Backups je Server */
  keep: import_zod6.z.number().int().min(1).max(60).default(14)
});

// src/mdt.ts
var import_zod7 = require("zod");
var option = import_zod7.z.object({ key: import_zod7.z.string().trim().min(1).max(32).regex(/^[A-Z0-9_]+$/, "Schl\xFCssel: nur A\u2013Z, 0\u20139 und _"), label: import_zod7.z.string().trim().min(1).max(40) });
var unique = (xs) => new Set(xs.map((x) => x.key)).size === xs.length;
var mdtConfigSchema = import_zod7.z.object({
  licenses: import_zod7.z.array(option).max(30).refine(unique, "Schl\xFCssel doppelt"),
  flags: import_zod7.z.array(option.extend({ tone: import_zod7.z.enum(["danger", "warning", "info", "neutral"]) })).max(30).refine(unique, "Schl\xFCssel doppelt"),
  weaponTypes: import_zod7.z.array(option).max(40).refine(unique, "Schl\xFCssel doppelt"),
  genders: import_zod7.z.array(import_zod7.z.string().trim().min(1).max(30)).max(10)
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
  weaponTypes: [
    { key: "PISTOL", label: "Pistole" },
    { key: "RIFLE", label: "Gewehr" },
    { key: "SHOTGUN", label: "Schrotflinte" },
    { key: "SMG", label: "Maschinenpistole" },
    { key: "TASER", label: "Taser" },
    { key: "KNIFE", label: "Messer" },
    { key: "OTHER", label: "Sonstige" }
  ],
  genders: ["M\xE4nnlich", "Weiblich", "Divers"]
};
var WEAPON_STATUSES = [
  { key: "REGISTERED", label: "Registriert", tone: "success" },
  { key: "STOLEN", label: "Gestohlen", tone: "danger" },
  { key: "SEIZED", label: "Beschlagnahmt", tone: "warning" },
  { key: "DESTROYED", label: "Vernichtet", tone: "neutral" }
];
var WEAPON_STATUS_KEYS = WEAPON_STATUSES.map((s) => s.key);
var personDetailsSchema = import_zod7.z.object({
  fullName: import_zod7.z.string().trim().max(80).nullish(),
  dateOfBirth: import_zod7.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-TT").nullish(),
  gender: import_zod7.z.string().trim().max(30).nullish(),
  phone: import_zod7.z.string().trim().max(30).nullish(),
  job: import_zod7.z.string().trim().max(60).nullish(),
  nationality: import_zod7.z.string().trim().max(60).nullish(),
  address: import_zod7.z.string().trim().max(200).nullish(),
  appearance: import_zod7.z.object({ skinTone: import_zod7.z.string().max(40).optional(), hairColor: import_zod7.z.string().max(40).optional(), eyeColor: import_zod7.z.string().max(40).optional(), height: import_zod7.z.string().max(20).optional(), features: import_zod7.z.string().max(300).optional() }).nullish(),
  licenses: import_zod7.z.array(import_zod7.z.string().max(32)).max(30).optional(),
  flags: import_zod7.z.array(import_zod7.z.string().max(32)).max(30).optional()
});
function ageOf(dob, now = /* @__PURE__ */ new Date()) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const [y, m, d] = dob.slice(0, 10).split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || now.getUTCMonth() + 1 === m && now.getUTCDate() < d) age--;
  return age >= 0 && age < 150 ? age : null;
}

// src/fleet.ts
var import_zod8 = require("zod");
var key2 = import_zod8.z.string().trim().min(1).max(32).regex(/^[A-Z0-9_]+$/, "Schl\xFCssel: nur A\u2013Z, 0\u20139 und _");
var unique2 = (xs) => new Set(xs.map((x) => x.key)).size === xs.length;
var fleetConfigSchema = import_zod8.z.object({
  categories: import_zod8.z.array(import_zod8.z.object({ key: key2, label: import_zod8.z.string().trim().min(1).max(40), icon: import_zod8.z.string().trim().min(1).max(8) })).min(1).max(30).refine(unique2, "Schl\xFCssel doppelt"),
  internalStatuses: import_zod8.z.array(import_zod8.z.object({ key: key2, label: import_zod8.z.string().trim().min(1).max(40), color: import_zod8.z.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(1).max(20).refine(unique2, "Schl\xFCssel doppelt"),
  /** Mindestabstand zwischen zwei Abgleichen der Live-Fahrzeuge (Sekunden); der ER:LC-Abruf selbst läuft im eingestellten Server-Intervall. */
  syncSeconds: import_zod8.z.number().int().min(5).max(600),
  /** Nicht mehr gemeldete Fahrzeuge ohne interne Daten nach so vielen Tagen löschen. */
  keepInactiveDays: import_zod8.z.number().int().min(1).max(90)
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
var fleetModelSchema = import_zod8.z.object({
  name: import_zod8.z.string().trim().min(1).max(80),
  /** Modellname genau so, wie ER:LC ihn meldet (z. B. „Falcon Interceptor Utility 2019“) – darüber werden Live-Fahrzeuge zugeordnet. */
  erlcName: import_zod8.z.string().trim().min(1).max(120),
  category: key2,
  description: import_zod8.z.string().trim().max(1e3).nullish(),
  internalCode: import_zod8.z.string().trim().max(40).nullish(),
  active: import_zod8.z.boolean().optional(),
  tags: import_zod8.z.array(import_zod8.z.string().trim().min(1).max(30)).max(20).optional(),
  department: import_zod8.z.string().trim().max(60).nullish()
});
var fleetInternalSchema = import_zod8.z.object({
  unitId: import_zod8.z.string().uuid().nullish(),
  internalStatus: key2.optional(),
  internalCode: import_zod8.z.string().trim().max(40).nullish(),
  notes: import_zod8.z.string().trim().max(3e3).nullish(),
  tags: import_zod8.z.array(import_zod8.z.string().trim().min(1).max(30)).max(20).optional()
});

// src/message-builder.ts
var import_zod9 = require("zod");
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
var str = (max) => import_zod9.z.string().max(max).default("");
var id2 = import_zod9.z.string().min(1).max(64);
var MB_BUTTON_STYLES = ["primary", "secondary", "success", "danger"];
var mbActionSchema = import_zod9.z.discriminatedUnion("type", [
  /** Antwort nur für die klickende Person sichtbar (ephemeral). */
  import_zod9.z.object({ type: import_zod9.z.literal("reply"), text: str(4e3) }),
  /** Discord-Rolle der klickenden Person geben bzw. wieder nehmen (Umschalter). */
  import_zod9.z.object({ type: import_zod9.z.literal("role"), roleId: str(32), mode: import_zod9.z.enum(["toggle", "add", "remove"]).default("toggle") })
]);
var mbButtonSchema = import_zod9.z.object({
  id: id2,
  /** link = öffnet eine URL (keine Interaktion nötig); action = führt eine definierte Aktion im Bot aus */
  kind: import_zod9.z.enum(["link", "action"]).default("link"),
  label: str(500),
  emoji: str(100),
  style: import_zod9.z.enum(MB_BUTTON_STYLES).default("primary"),
  url: str(4e3),
  disabled: import_zod9.z.boolean().default(false),
  action: mbActionSchema.default({ type: "reply", text: "" })
});
var mbSelectOptionSchema = import_zod9.z.object({ id: id2, label: str(500), description: str(500), emoji: str(100), action: mbActionSchema.default({ type: "reply", text: "" }) });
var mbRowSchema = import_zod9.z.discriminatedUnion("type", [
  import_zod9.z.object({ id: id2, type: import_zod9.z.literal("buttons"), buttons: import_zod9.z.array(mbButtonSchema).max(25).default([]) }),
  import_zod9.z.object({ id: id2, type: import_zod9.z.literal("select"), placeholder: str(500), disabled: import_zod9.z.boolean().default(false), options: import_zod9.z.array(mbSelectOptionSchema).max(50).default([]) })
]);
var mbFieldSchema = import_zod9.z.object({ id: id2, name: str(2e3), value: str(4e3), inline: import_zod9.z.boolean().default(false) });
var mbEmbedSchema = import_zod9.z.object({
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
  timestamp: import_zod9.z.enum(["none", "send", "custom"]).default("none"),
  timestampAt: str(64),
  fields: import_zod9.z.array(mbFieldSchema).max(50).default([])
});
var mbMessageSchema = import_zod9.z.object({
  id: id2,
  content: str(1e4),
  embeds: import_zod9.z.array(mbEmbedSchema).max(20).default([]),
  rows: import_zod9.z.array(mbRowSchema).max(10).default([]),
  /** Wer wirklich gepingt wird. @everyone/@here nur, wenn ausdrücklich eingeschaltet. */
  mentions: import_zod9.z.object({ users: import_zod9.z.boolean().default(true), roles: import_zod9.z.boolean().default(false), everyone: import_zod9.z.boolean().default(false) }).default({})
});
var mbDocumentDataSchema = import_zod9.z.object({
  messages: import_zod9.z.array(mbMessageSchema).max(MB_LIMITS.messagesPerGroup).default([]),
  /** Name/Profilbild nur beim Versand über einen Webhook (der Bot sendet immer als er selbst). */
  webhookProfile: import_zod9.z.object({ username: str(200), avatarUrl: str(4e3) }).default({})
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
var DEFAULT_RADIO_ROLE_RULES = { enabled: false, grantRoleIds: [], requiredRoleIds: [], onRoleGain: "ACTIVATE", onRoleLoss: "REVOKE", manualOnRoleLoss: "KEEP" };
function radioRoleSyncAction(rules, roleIds, grant, now = /* @__PURE__ */ new Date()) {
  if (!rules.enabled) return { kind: "none", why: "Rollenabgleich ist ausgeschaltet." };
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
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
  ERLC_STATUSES,
  ERLC_STATUS_LABEL,
  EVIDENCE_CUSTODY_STATES,
  EVIDENCE_TRANSITIONS,
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
  FORM_PANEL_VARIABLES,
  FORM_QUESTION_TYPES,
  HR_EVENTS,
  HR_EVENT_LABEL,
  INVESTIGATION_STATUSES,
  INVESTIGATION_TRANSITIONS,
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
  PERIOD_LABEL,
  PERMISSION_CATALOG,
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
  SYNC_DATA_TYPES,
  SYNC_DIRECTIONS,
  TICKET_ACTIONS,
  TICKET_ACTION_KEYS,
  TICKET_PLACEHOLDERS,
  TICKET_STATUSES,
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
  WARNING_VARIABLES,
  WEAPON_STATUSES,
  WEAPON_STATUS_KEYS,
  WEEKDAYS,
  WEEK_COUNTED_STATUSES,
  WEEK_TIMEZONE,
  WELCOME_VARIABLES,
  WORKFLOW_ACTION_LABELS,
  WORKFLOW_OPS,
  WORKFLOW_OP_LABELS,
  WORKFLOW_TRIGGERS,
  absenceTypeSchema,
  accountAge,
  ageOf,
  applyCallCalibration,
  areaGrantsFor,
  assertTransition,
  awardDefSchema,
  backupConfigSchema,
  can,
  canDelegate,
  canTransition,
  checkAnswer,
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
  fieldValue,
  fillTemplate,
  fitCallCalibration,
  fleetConfigSchema,
  fleetInternalSchema,
  fleetModelSchema,
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
  parseCsv,
  parsePlayer,
  parseQuestions,
  periodEnd,
  periodLabel,
  periodStart,
  personDetailsSchema,
  pixelToGame,
  playerKey,
  poiForPlace,
  policeReportFields,
  policyAllowsFlow,
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
  splitGaps,
  staffListSchema,
  staffSectionSchema,
  stageSchema,
  statusLabel,
  ticketChannelName,
  ticketNumber,
  toDiscordPayload,
  toPartialEmoji,
  triggerMatches,
  validateMbDocument,
  validateMbMessage,
  verifyActions,
  weekIso,
  weekKey,
  weekLabel,
  weekStartOf,
  weekTotals,
  withHrDefaults
});
