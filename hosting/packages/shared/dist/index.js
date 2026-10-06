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
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
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
  COMPLAINT_STATUSES: () => COMPLAINT_STATUSES,
  COMPLAINT_TRANSITIONS: () => COMPLAINT_TRANSITIONS,
  DISPATCH_STATUSES: () => DISPATCH_STATUSES,
  DISPATCH_TRANSITIONS: () => DISPATCH_TRANSITIONS,
  DUTY_STATUSES: () => DUTY_STATUSES,
  EVIDENCE_CUSTODY_STATES: () => EVIDENCE_CUSTODY_STATES,
  EVIDENCE_TRANSITIONS: () => EVIDENCE_TRANSITIONS,
  INVESTIGATION_STATUSES: () => INVESTIGATION_STATUSES,
  INVESTIGATION_TRANSITIONS: () => INVESTIGATION_TRANSITIONS,
  InvalidTransitionError: () => InvalidTransitionError,
  PERMISSION_CATALOG: () => PERMISSION_CATALOG,
  PRIORITIES: () => PRIORITIES,
  REPORT_STATUSES: () => REPORT_STATUSES,
  REPORT_TRANSITIONS: () => REPORT_TRANSITIONS,
  REPORT_TYPES: () => REPORT_TYPES,
  ROBLOX_VERIFICATION_STATUSES: () => ROBLOX_VERIFICATION_STATUSES,
  TICKET_STATUSES: () => TICKET_STATUSES,
  TICKET_TRANSITIONS: () => TICKET_TRANSITIONS,
  UNIT_STATUSES: () => UNIT_STATUSES,
  WANTED_STATUSES: () => WANTED_STATUSES,
  WANTED_TRANSITIONS: () => WANTED_TRANSITIONS,
  assertTransition: () => assertTransition,
  can: () => can,
  canTransition: () => canTransition,
  effectivePermissions: () => effectivePermissions,
  grantMatches: () => grantMatches,
  isPermissionKey: () => isPermissionKey,
  isValidRobloxUserId: () => isValidRobloxUserId,
  resolvePermission: () => resolvePermission
});
module.exports = __toCommonJS(index_exports);

// src/permissions.ts
var PERMISSION_CATALOG = {
  dashboard: ["view", "customize"],
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
  applications: ["view", "review", "decide"],
  academy: ["view", "manage"],
  sek: ["view", "report", "manage"],
  qualifications: ["view", "decide", "manage"],
  communication: ["view", "send", "moderate"],
  analytics: ["view"],
  audit: ["view", "export"],
  studio: ["view", "manage"],
  settings: ["view", "manage"],
  users: ["view", "manage"],
  roles: ["view", "manage"]
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ALL_PERMISSIONS,
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  COMPLAINT_STATUSES,
  COMPLAINT_TRANSITIONS,
  DISPATCH_STATUSES,
  DISPATCH_TRANSITIONS,
  DUTY_STATUSES,
  EVIDENCE_CUSTODY_STATES,
  EVIDENCE_TRANSITIONS,
  INVESTIGATION_STATUSES,
  INVESTIGATION_TRANSITIONS,
  InvalidTransitionError,
  PERMISSION_CATALOG,
  PRIORITIES,
  REPORT_STATUSES,
  REPORT_TRANSITIONS,
  REPORT_TYPES,
  ROBLOX_VERIFICATION_STATUSES,
  TICKET_STATUSES,
  TICKET_TRANSITIONS,
  UNIT_STATUSES,
  WANTED_STATUSES,
  WANTED_TRANSITIONS,
  assertTransition,
  can,
  canTransition,
  effectivePermissions,
  grantMatches,
  isPermissionKey,
  isValidRobloxUserId,
  resolvePermission
});
