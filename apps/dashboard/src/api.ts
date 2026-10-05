export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
const BASE = `${API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Die Session liegt als httpOnly-Cookie (von der API gesetzt) – daher `credentials: include`. */
export async function api<T>(
  path: string,
  init?: { method: 'PUT' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...(init
        ? {
            method: init.method,
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nexus' },
            body: JSON.stringify(init.body ?? {}),
          }
        : {}),
    });
  } catch {
    throw new ApiError(0, 'Die API ist nicht erreichbar.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const msg = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(res.status, msg ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Me {
  id: string;
  username?: string;
  globalName?: string;
  avatar?: string | null;
}
export interface GuildSelectionEntry {
  id: string;
  name: string;
  icon: string | null;
  botPresent: boolean;
  canManage: boolean;
  permissions: string[];
}
export interface GuildOverview {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  applications: number;
  submissions: { total: number; pending: number; accepted: number; denied: number };
  health: { ok: boolean; message: string }[];
}

export const loginUrl = `${BASE}/auth/discord`;
export const inviteUrl = (guildId: string) =>
  `${BASE}/auth/discord/invite?guildId=${encodeURIComponent(guildId)}`;
export const guildIcon = (id: string, icon: string | null) =>
  icon ? `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=64` : null;
export const userAvatar = (me: Me) =>
  me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null;

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  manageable: boolean;
  dangerous?: boolean;
  blockedReason?: 'missing-manage-roles' | 'managed-role' | 'everyone' | 'hierarchy';
}
export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  kind: 'text' | 'voice' | 'category';
  parentId: string | null;
}
export interface SelectionSlot {
  key: string;
  kind: 'role' | 'text' | 'voice' | 'category';
  label: string;
  description: string;
  requiresManageable?: boolean;
  value: string | null;
}
export interface BotPermissions {
  ok: boolean;
  administrator: boolean;
  checks: { key: string; label: string; ok: boolean }[];
}
export const BLOCK_REASON: Record<string, string> = {
  'missing-manage-roles': 'Bot hat „Rollen verwalten“ nicht',
  'managed-role': 'Integrationsrolle',
  everyone: '@everyone',
  hierarchy: 'liegt über der Bot-Rolle',
};

// --- Panels -----------------------------------------------------------------
export type PanelButtonStyle = 'primary' | 'secondary' | 'success' | 'danger' | 'link';
export type PanelAction =
  { type: 'message'; content: string } | { type: 'role-toggle'; roleId: string };
export interface PanelButton {
  id: string;
  label: string;
  emoji?: string;
  style: PanelButtonStyle;
  url?: string;
  action?: PanelAction;
}
export interface PanelOption {
  id: string;
  label: string;
  description?: string;
  emoji?: string;
  action: PanelAction;
}
export interface PanelConfig {
  content?: string;
  embed: {
    title?: string;
    description?: string;
    color?: string;
    thumbnailUrl?: string;
    imageUrl?: string;
    footer?: string;
    fields?: { name: string; value: string; inline?: boolean }[];
  };
  buttons: PanelButton[];
  select?: { placeholder?: string; options: PanelOption[] };
}
export interface PanelRow {
  id: string;
  name: string;
  config: PanelConfig;
  channelId: string | null;
  messageId: string | null;
  lastSentAt: string | null;
  autoUpdate: boolean;
  updatedAt: string;
}

// --- Bewerbungen / Fragen-Builder -------------------------------------------
export interface ApplicationRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  enabled: boolean;
  updatedAt: string;
  _count?: { submissions: number };
}
export interface QuestionOption {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
}
export interface QuestionValidation {
  /** Regex-Quelltext (wird serverseitig geprüft). */
  pattern?: string;
  /** Eigene Fehlermeldung bei ungültiger Antwort. */
  errorMessage?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minSelections?: number;
  maxSelections?: number;
}
export interface BuilderQuestion {
  id: string;
  type: string;
  title: string;
  description?: string;
  required: boolean;
  enabled?: boolean;
  placeholder?: string;
  options?: QuestionOption[];
  validation?: QuestionValidation;
  order: number;
  visibleIf?: unknown;
}
export interface QuestionsResponse {
  questions: BuilderQuestion[];
  types: string[];
  publishedVersion: number | null;
  unpublishedChanges: boolean;
}
export const QUESTION_TYPE_LABEL: Record<string, string> = {
  TEXT: 'Text (kurz)',
  LONG_TEXT: 'Langtext',
  NUMBER: 'Zahl (ganz)',
  DECIMAL: 'Zahl (Dezimal)',
  YES_NO: 'Ja / Nein',
  SINGLE_SELECT: 'Auswahl',
  MULTI_SELECT: 'Mehrfachauswahl',
  DATE: 'Datum',
  TIME: 'Uhrzeit',
  DATETIME: 'Datum & Uhrzeit',
  RATING: 'Bewertung',
  SLIDER: 'Schieberegler',
  URL: 'Link',
  EMAIL: 'E-Mail',
  PHONE: 'Telefon',
  USERNAME: 'Discord-Name',
  DISCORD_USER: 'Discord-Benutzer',
  CONFIRMATION: 'Bestätigung',
  PARAGRAPH: 'Anzeige-Text',
  INFO: 'Hinweis',
};

// --- Berechtigungen (Profile, Sperren, Benutzer) -----------------------------
export type Effect = 'ALLOW' | 'DENY';
export type Scope = 'SERVER' | 'TEAM' | 'RECORD';
export interface CatalogModule {
  module: string;
  label: string;
  permissions: { key: string; label: string; alias: string | null }[];
}
export interface ProfileEntry {
  key: string;
  effect: Effect;
  scope: Scope;
  scopeRef: string;
}
export interface PermissionOverview {
  catalog: CatalogModule[];
  templates: {
    key: string;
    name: string;
    description: string;
    allowCount: number;
    denyCount: number;
  }[];
  profiles: { id: string; name: string }[];
  roles: {
    id: string;
    name: string;
    color: number;
    position: number;
    allow: string[];
    deny: string[];
    profileIds: string[];
  }[];
  orphaned: { roleId: string; name: string; permissions: string[]; deny: string[] }[];
}
export interface ProfileRow {
  id: string;
  name: string;
  description: string | null;
  templateKey: string | null;
  entries: ProfileEntry[];
  color: string | null;
  priority: number;
  enabled: boolean;
  roles: { id: string; name: string }[];
}
export interface NexusRoleRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  priority: number;
  enabled: boolean;
  discordRoleId: string | null;
  entries: ProfileEntry[];
  members: { id: string; userId: string; name: string | null; expiresAt: string | null }[];
}
export interface MemberRow {
  id: string;
  username: string;
  displayName: string;
  roles: { id: string; name: string }[];
  permissionCount: number;
  permissionTotal: number;
}
export interface GrantSourceInfo {
  kind: 'role' | 'profile' | 'user';
  roleName?: string;
  profileName?: string;
  note?: string;
}
export interface MemberAccess {
  user: { id: string; username: string; displayName: string };
  guildAdmin: boolean;
  roles: { id: string; name: string }[];
  permissions: {
    key: string;
    label: string;
    alias: string | null;
    module: string;
    moduleLabel: string;
    state: 'allowed' | 'limited' | 'denied' | 'none';
    viaDiscordAdmin: boolean;
    entries: {
      effect: Effect;
      scope: Scope;
      scopeRef: string;
      viaManage: boolean;
      source: GrantSourceInfo;
    }[];
  }[];
  counts: { allowed: number; limited: number; denied: number };
  overrides: {
    id: string;
    key: string;
    effect: Effect;
    scope: Scope;
    scopeRef: string;
    note: string | null;
    expiresAt: string | null;
  }[];
  recentActions: {
    id: string;
    action: string;
    resourceType: string | null;
    resourceId: string | null;
    result: string | null;
    createdAt: string;
  }[];
  pending: string[];
}

// --- Einreichungen ------------------------------------------------------------
export interface SubmissionRow {
  id: string;
  /** Menschenlesbare ID, z. B. POL-00152 (ab dem Einreichen). */
  submissionNumber: string | null;
  assigneeUserId: string | null;
  status: string;
  userId: string;
  usernameSnapshot: string;
  displayNameSnapshot: string;
  submittedAt: string | null;
  createdAt: string;
  isTest: boolean;
  application: { id: string; name: string; config?: { statusLabels?: StatusLabels } | null };
}
export interface StepResult {
  key: string;
  label: string;
  status: 'done' | 'skipped' | 'failed' | 'unavailable';
  detail?: string;
}
export interface DecisionResponse {
  ok: boolean;
  status: string;
  overall: 'success' | 'partial' | 'failed';
  message: string;
  steps: StepResult[];
}
export interface DenyReason {
  id: string;
  label: string;
  text?: string;
}
export interface SubmissionDetail extends SubmissionRow {
  publicReason: string | null;
  reviewerUserId: string | null;
  application: {
    id: string;
    name: string;
    config: { review?: { denyReasons?: DenyReason[] }; statusLabels?: StatusLabels } | null;
  };
  version: { version: number; questions: { questions?: BuilderQuestion[] } | BuilderQuestion[] };
  answers: { questionId: string; value: unknown }[];
  notes: { id: string; authorId: string; content: string; createdAt: string }[];
  /** Weitere Bearbeiter (neben `assigneeUserId`). */
  reviewers?: { assigneeType: string; assigneeId: string }[];
}
export interface ReviewOptions {
  steps: { key: string; label: string; available: boolean; enabled: boolean }[];
  defaultDenyReasons: DenyReason[];
}
export const STATUS_TEXT: Record<string, string> = {
  STARTED: 'Gestartet',
  IN_PROGRESS: 'In Bearbeitung',
  PAUSED: 'Pausiert',
  SUBMITTED: 'Offen',
  UNDER_REVIEW: 'In Prüfung',
  ON_HOLD: 'Zurückgestellt',
  ACCEPTED: 'Angenommen',
  DENIED: 'Abgelehnt',
  WITHDRAWN: 'Zurückgezogen',
  EXPIRED: 'Abgelaufen',
  CANCELLED: 'Abgebrochen',
  ARCHIVED: 'Archiviert',
};
/** Eigene Statusnamen/-farben einer Bewerbungsart (Team-Chance). */
export type StatusLabels = Partial<Record<string, { label?: string; color?: string }>>;
/** Name eines Status: eigener Name der Bewerbungsart, sonst Standard. */
export const statusText = (status: string, config?: { statusLabels?: StatusLabels } | null) =>
  config?.statusLabels?.[status]?.label ?? STATUS_TEXT[status] ?? status;
/** Eigene Farbe als Inline-Stil (Standardfarben kommen aus dem CSS). */
export const statusStyle = (status: string, config?: { statusLabels?: StatusLabels } | null) => {
  const c = config?.statusLabels?.[status]?.color;
  return c ? { background: c, color: '#fff' } : undefined;
};

// --- Personal ---------------------------------------------------------------------
export interface RankRow {
  id: string;
  name: string;
  shortName: string | null;
  order: number;
  isEntry: boolean;
  discordRoleId: string | null;
  icon: string | null;
  color: string | null;
  active: boolean;
  _count?: { records: number };
}
export interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  discordRoleId: string | null;
  leaderUserId: string | null;
  active: boolean;
  _count?: { records: number };
}
export interface PersonnelRow {
  id: string;
  userId: string;
  rpName: string;
  serviceNumber: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  teamState: 'ACTIVE' | 'PAUSE' | 'OFF_DUTY' | 'SUSPENDED';
  teamStateReason: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
  joinedAt: string;
  probationEndsAt: string | null;
  archivedReason: string | null;
  rank: RankRow | null;
  team: TeamRow | null;
}
export interface PersonnelEntryRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  occurredAt: string;
  createdBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}
export interface PersonnelEventRow {
  id: string;
  type: string;
  actorId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}
export interface PersonnelView {
  record: PersonnelRow;
  sections: string[];
  entries: PersonnelEntryRow[];
  events: PersonnelEventRow[];
  can: {
    edit: boolean;
    rank: boolean;
    team: boolean;
    number: boolean;
    archive: boolean;
    state: boolean;
    award: boolean;
    discipline: boolean;
    note: boolean;
  };
}
export interface MemberHit {
  id: string;
  username: string;
  displayName: string;
  hasRecord: boolean;
}
export interface NumberFormat {
  prefix: string;
  digits: number;
  next: number;
  assign: 'TRAINING' | 'ACCEPT' | 'OFF';
}

export interface ShiftTypeRow {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  requiredRoleIds: string[];
  maxDurationMinutes: number;
  active: boolean;
}
export interface ShiftRow {
  id: string;
  userId: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  startedAt: string;
  endedAt: string | null;
  pausedSeconds: number;
  durationSeconds: number | null;
  endReason: string | null;
  flaggedLongAt: string | null;
  type: ShiftTypeRow;
}
export interface ShiftStatsRow {
  count: number;
  totalSeconds: number;
  averageSeconds: number;
  running: number;
}
export interface ShiftPeriodRow extends ShiftStatsRow {
  period: 'day' | 'week' | 'month' | 'all';
}
export interface LeaderboardRow {
  rank: number;
  userId: string;
  count: number;
  totalSeconds: number;
  averageSeconds: number;
}

export type UnitStatusKey = 'AVAILABLE' | 'BUSY' | 'BREAK' | 'UNAVAILABLE';
export interface UnitRow {
  id: string;
  callsign: string;
  kind: string;
  status: UnitStatusKey;
  availability: UnitStatusKey;
  statusSince: string;
  vehicle: string | null;
  location: string | null;
  note: string | null;
  staffing: { active: number; paused: number; total: number };
  members: { userId: string; role: 'LEADER' | 'MEMBER'; onBreak: boolean }[];
}
export interface DutyOverviewData {
  units: UnitRow[];
  unassigned: { userId: string; type: string; since: string; paused: boolean }[];
  counts: { onDuty: number; onBreak: number; units: number; available: number; busy: number; unavailable: number };
}

export type RadioLevelKey = 'LISTEN' | 'SPEAK' | 'FULL';
export interface RadioAccessRow {
  id: string;
  userId: string;
  level: RadioLevelKey;
  special: boolean;
  reason: string | null;
  grantedBy: string;
  createdAt: string;
}
export interface RadioChannelRow {
  id: string;
  channelId: string;
  name: string;
  area: 'GENERAL' | 'SPECIAL';
  requiresDuty: boolean;
  active: boolean;
}

export type OpStatusKey = 'REQUESTED' | 'EN_ROUTE' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export interface OperationRow {
  id: string;
  number: number;
  kind: string;
  location: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  description: string | null;
  status: OpStatusKey;
  leaderId: string | null;
  report: string | null;
  outcome: string | null;
  createdAt: string;
  completedAt: string | null;
  units: { id: string; unitId: string; callsign: string }[];
  participants: { userId: string; isLeader: boolean; callsign: string | null }[];
}

export interface DangerLevelRow {
  id: string;
  level: number;
  name: string;
  color: string;
  emoji: string | null;
  description: string | null;
  allowedRoleIds: string[];
}
export interface DangerCurrent {
  level: DangerLevelRow;
  levels: DangerLevelRow[];
  state: { setBy: string; reason: string | null; setAt: string } | null;
}

export interface WantedRow {
  id: string;
  number: number;
  kind: 'PERSON' | 'VEHICLE';
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  expiresAt: string | null;
  subjectName: string | null;
  appearance: string | null;
  plate: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  ownerName: string | null;
  reason: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  lastSeen: string | null;
  notes: string | null;
  createdBy: string;
  revokeReason: string | null;
  createdAt: string;
}

export type VehicleStatusKey = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
export interface VehicleRow {
  id: string;
  plate: string;
  type: string;
  status: VehicleStatusKey;
  unitId: string | null;
  driverId: string | null;
  notes: string | null;
  damages: { id: string; description: string; severity: 'MINOR' | 'MAJOR' | 'TOTAL'; createdAt: string }[];
}
export interface PenaltyRow {
  id: string;
  number: number;
  kind: 'FINE' | 'WARNING' | 'POINTS' | 'LICENSE_REVOCATION' | 'VEHICLE_SEIZURE';
  status: 'ACTIVE' | 'REVOKED';
  subjectName: string;
  amount: number | null;
  points: number | null;
  durationDays: number | null;
  plate: string | null;
  reason: string;
  issuedBy: string;
  revokeReason: string | null;
  createdAt: string;
}
export interface PenaltyRegister {
  subjectName: string;
  finesTotal: number;
  warnings: number;
  points: number;
  pointsLimitReached: boolean;
  licenseRevokedUntil: string | null;
  seizedPlates: string[];
  penalties: PenaltyRow[];
}

export interface CourseRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  theoryMax: number;
  practiceMax: number;
  examMax: number;
  passPercent: number;
  grantRoleId: string | null;
  requiredRoleIds: string[];
  maxParticipants: number;
}
export interface TrainingRow {
  id: string;
  number: number;
  status: 'PLANNED' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
  scheduledAt: string;
  location: string | null;
  trainerIds: string[];
  maxParticipants: number;
  course: CourseRow;
  participants: { id: string; userId: string; status: 'ENROLLED' | 'PASSED' | 'FAILED' | 'WITHDRAWN' | 'REMOVED'; theoryPoints: number | null; practicePoints: number | null; examPoints: number | null; percent: number | null; roleResult: string | null }[];
}

export type RequirementRow =
  | { type: 'COURSE'; courseId: string }
  | { type: 'QUALIFICATION'; qualificationId: string }
  | { type: 'RANK'; rankId: string }
  | { type: 'SERVICE_DAYS'; days: number }
  | { type: 'SHIFT_HOURS'; hours: number }
  | { type: 'RANK_DAYS'; days: number }
  | { type: 'NO_DISCIPLINE'; days: number };
export interface QualificationRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  requirements: RequirementRow[];
  grantRoleId: string | null;
  autoGrant: boolean;
  validDays: number | null;
}
export interface QualificationCheck {
  eligible: boolean;
  checks: { label: string; met: boolean; detail: string }[];
}

export interface PromotionRow {
  id: string;
  number: number;
  userId: string;
  fromRankName: string | null;
  toRankId: string;
  toRankName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  requestedBy: string;
  reason: string | null;
  override: boolean;
  decidedBy: string | null;
  decisionReason: string | null;
  roleResult: string | null;
  checks: { label: string; met: boolean; detail: string }[] | null;
}
export interface PromotionCandidate {
  userId: string;
  rpName: string;
  fromRank: string | null;
  toRankId: string;
  toRank: string;
  hasOpenRequest: boolean;
}
export interface PromotionRuleRow {
  id: string;
  rankId: string;
  requirements: RequirementRow[];
}

export interface SekConfigRow {
  teamId: string | null;
  qualificationId: string | null;
  shiftTypeId: string | null;
  courseIds: string[];
  applicationId: string | null;
}
export interface SekMemberRow {
  userId: string;
  rpName: string;
  rank: string | null;
  hasQualification: boolean;
  onDuty: 'ON' | 'PAUSED' | 'OFF';
  squads: string[];
}
export interface SekSquadRow {
  id: string;
  name: string;
  leaderId: string | null;
  active: boolean;
  members: { userId: string; role: string }[];
}
export interface SekStats {
  members: { total: number; qualified: number; onDuty: number };
  shifts: { leaderboard: { rank: number; userId: string; totalSeconds: number; count: number }[] } | null;
  operations: Record<string, number>;
  trainings: { total: number; passed: number };
}

export interface TicketCategoryRow {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  discordCategoryId: string | null;
  staffRoleIds: string[];
  defaultPriority: string;
  maxOpenPerUser: number;
  active: boolean;
  color: number | null;
  maxOpenTotal: number;
  requiredRoleIds: string[];
  nameTemplate: string | null;
  formFields: { id: string; label: string; style: 'short' | 'paragraph'; type?: string; options?: string[]; required: boolean }[] | null;
  transcriptEnabled: boolean | null;
}
export interface TicketLoad {
  id: string;
  name: string;
  emoji: string | null;
  open: number;
  max: number;
  percent: number;
  level: 'low' | 'medium' | 'high' | 'full';
}
export interface TicketSettingsRow {
  panelChannelId: string | null;
  transcriptChannelId: string | null;
  applicationCategoryId: string | null;
  adminRoleIds: string[];
  nameTemplate: string;
  deleteAfterMinutes: number;
  color: number;
  panelTitle: string;
  panelDescription: string;
  selectPlaceholder: string;
  loadTitle: string;
  loadText: string;
  openTitle: string;
  openText: string;
  transcriptEnabled: boolean;
  dmTranscript: boolean;
  claimEnabled: boolean;
  claimExclusive: boolean;
  closeWithReason: boolean;
  confirmClose: boolean;
  loadEnabled: boolean;
  hideFullCategories: boolean;
}
export interface TicketRow {
  id: string;
  number: number;
  userId: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  claimedBy: string | null;
  channelId: string | null;
  closeReason: string | null;
  transcriptContent: boolean;
  submissionId?: string | null;
  deleteAt?: string | null;
  createdAt: string;
  closedAt: string | null;
  category: TicketCategoryRow;
}

export interface AbsenceRow {
  id: string;
  number: number;
  userId: string;
  startDate: string;
  endDate: string;
  category: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'ENDED';
  decisionReason: string | null;
}

export interface ReportRow {
  id: string;
  kind: 'DAY' | 'WEEK';
  periodStart: string;
  periodEnd: string;
  messageId: string | null;
  data: Record<string, unknown>;
}
