import { renderTemplate, assertTransition, roleActionsForTransition, durationToSeconds } from '@nexus/core';
import { guildRepository, prisma } from '@nexus/database';
import type { Prisma } from '@nexus/database';
import { OPEN_SUBMISSION_STATUSES, SubmissionStatus } from '@nexus/types';
import type { Question } from '@nexus/types';
import type { DiscordPort } from './discord-port.js';
import {
  answerBlocks,
  answerMessages,
  isFinal,
  reviewMessage,
  STATUS_LABEL,
  statusLabelsOf,
} from './review-format.js';
import { applyRoleChanges } from './role-changes.js';

/**
 * Bearbeitung von Bewerbungen (Phase 10) – eine gemeinsame Logik für Bot **und** Dashboard.
 *
 * Grundsätze:
 *  - Statuswechsel sind atomar (`updateMany` mit Statusbedingung): doppelte/gleichzeitige Entscheidungen
 *    und Entscheidungen nach dem Zurückziehen sind unmöglich.
 *  - Annahme = Pipeline aus einzeln schaltbaren Schritten; jeder Schritt meldet ehrlich `done`, `skipped`,
 *    `failed` oder `unavailable` (Modul noch nicht vorhanden) – nie ein vorgetäuschter Erfolg.
 *  - Ablehnung erzeugt keine Personalakte, keine Dienstnummer, keine Einstiegsrolle.
 *  - Jede Aktion landet im Audit-Log (wer, was, wann, Datensatz, Ergebnis).
 */

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

export interface DenyReason {
  id: string;
  label: string;
  text?: string;
}

export const DEFAULT_DENY_REASONS: readonly DenyReason[] = [
  {
    id: 'incomplete',
    label: 'Unvollständige Bewerbung',
    text: 'Deine Bewerbung war leider nicht vollständig genug.',
  },
  {
    id: 'requirements',
    label: 'Voraussetzungen nicht erfüllt',
    text: 'Du erfüllst die Voraussetzungen aktuell noch nicht.',
  },
  {
    id: 'quality',
    label: 'Qualität der Antworten',
    text: 'Die Qualität der Antworten hat uns nicht überzeugt.',
  },
  {
    id: 'capacity',
    label: 'Aktuell keine Kapazität',
    text: 'Aktuell können wir leider keine weiteren Bewerber aufnehmen.',
  },
  { id: 'other', label: 'Sonstiger Grund' },
];

interface ReviewConfig {
  onboarding?: OnboardingConfig;
  submissionChannelId?: string;
  reviewRoleIds?: string[];
  acceptPipeline?: Record<string, boolean>;
  denyReasons?: DenyReason[];
}

const readConfig = (json: unknown): { review: ReviewConfig; messages: Record<string, string> } => {
  const c = (json && typeof json === 'object' ? json : {}) as {
    review?: ReviewConfig;
    messages?: Record<string, string>;
  };
  return { review: c.review ?? {}, messages: c.messages ?? {} };
};

export const denyReasonsOf = (configJson: unknown): DenyReason[] => {
  const custom = readConfig(configJson).review.denyReasons;
  return custom?.length ? custom : [...DEFAULT_DENY_REASONS];
};

// ---------------------------------------------------------------------------
// Annahme-Pipeline
// ---------------------------------------------------------------------------

export type StepStatus = 'done' | 'skipped' | 'failed' | 'unavailable';
export interface StepResult {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string | undefined;
}

export interface PipelineContext {
  port: DiscordPort;
  guildId: string;
  submissionId: string;
  applicantId: string;
  applicationName: string;
  isTest: boolean;
  reviewerId: string;
  publicReason?: string | undefined;
  note?: string | undefined;
  reviewChannelId?: string | undefined;
  reviewMessageId?: string | undefined;
  roleActions: { add: string[]; remove: string[] };
  /** Einstellungen für neue Mitarbeiter aus der Bewerbung (`config.review.onboarding`). */
  onboarding: OnboardingConfig;
  /** Antworten des Bewerbers (Frage-ID → Wert), z. B. für den RP-Namen. */
  answers: Record<string, unknown>;
  displayName: string;
  messages: Record<string, string>;
  selections: Record<string, string>;
  /** Variablen für Textvorlagen. */
  variables: Record<string, unknown>;
}
/** Ein Schritt kann sich selbst als „übersprungen“ melden (z. B. keine Probezeit konfiguriert). */
export type StepHandler = (
  ctx: PipelineContext,
) => Promise<{ detail?: string; skipped?: boolean } | void>;

export interface OnboardingConfig {
  /** Einstiegsdienstgrad (sonst der als „Einstieg“ markierte). */
  rankId?: string | undefined;
  teamId?: string | undefined;
  probationDays?: number | undefined;
  /** Frage, deren Antwort der RP-Name ist (sonst der Discord-Anzeigename). */
  rpNameQuestionId?: string | undefined;
}

/** Reihenfolge laut Ablauf „Bewerbung angenommen“. */
export const ACCEPT_STEPS: readonly { key: string; label: string }[] = [
  { key: 'personnelRecord', label: 'Personalakte prüfen/erstellen' },
  { key: 'serviceNumber', label: 'Dienstnummer vergeben' },
  { key: 'startRank', label: 'Einstiegsdienstgrad setzen' },
  { key: 'roles', label: 'Einstiegsrolle vergeben' },
  { key: 'team', label: 'Team übernehmen/zuweisen' },
  { key: 'probation', label: 'Probezeit starten' },
  { key: 'notifyApplicant', label: 'Bewerber informieren' },
  { key: 'notifyLeadership', label: 'Leitung informieren' },
];

const handlers = new Map<string, StepHandler>();

/** Spätere Module (Personalakte, Dienstnummern, Teams …) hängen hier ihre Schritte ein. */
export function registerAcceptStep(key: string, handler: StepHandler): void {
  handlers.set(key, handler);
}

/** Schritte mit Verfügbarkeit – für Dashboard-Einstellungen und Berichte. */
export function describeAcceptPipeline(config?: Record<string, boolean>) {
  return ACCEPT_STEPS.map((s) => ({
    ...s,
    available: handlers.has(s.key),
    enabled: config?.[s.key] ?? true,
  }));
}

const textOr = (template: string | undefined, fallback: string, vars: Record<string, unknown>) =>
  renderTemplate(template ?? fallback, vars);

/**
 * Wartezeit nach einer Ablehnung (die längere aus „nach Ablehnung“ und „zwischen zwei Bewerbungen“) als Platzhalter
 * `{wartezeit}` („14 Tagen“) und `{wiederAb}` (Datum/Uhrzeit). Leer, wenn keine Wartezeit eingestellt ist.
 */
export function denyWaitVariables(config: unknown, now = new Date()): { wartezeit: string; wiederAb: string } {
  const req = (config as { requirements?: { cooldown?: unknown; denyCooldown?: unknown } } | null)?.requirements;
  const secs = Math.max(durationToSeconds(req?.denyCooldown as never), durationToSeconds(req?.cooldown as never));
  if (secs <= 0) return { wartezeit: '', wiederAb: '' };
  const days = Math.floor(secs / 86_400);
  const hours = Math.floor((secs % 86_400) / 3600);
  const minutes = Math.round((secs % 3600) / 60);
  const parts = [
    days ? `${days} ${days === 1 ? 'Tag' : 'Tagen'}` : '',
    hours ? `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}` : '',
    minutes ? `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}` : '',
  ].filter(Boolean);
  return {
    wartezeit: parts.length > 1 ? `${parts.slice(0, -1).join(', ')} und ${parts.at(-1)}` : (parts[0] ?? ''),
    wiederAb: new Date(now.getTime() + secs * 1000).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }),
  };
}

registerAcceptStep('roles', async (ctx) => {
  const { add, remove } = ctx.roleActions;
  if (add.length + remove.length === 0) return { detail: 'Keine Rollenregel konfiguriert.' };
  if (ctx.isTest) return { detail: 'Test-Bewerbung: Rollen unverändert.' };
  const result = await applyRoleChanges(
    {
      guildId: ctx.guildId,
      userId: ctx.applicantId,
      add,
      remove,
      trigger: 'Bewerbung angenommen',
      automation: 'application-accept',
      actorId: ctx.reviewerId,
      resourceType: 'ApplicationSubmission',
      resourceId: ctx.submissionId,
      permission: 'applications.submissions.accept',
    },
    ctx.port.roleDriver(ctx.guildId),
  );
  if (result.status !== 'success') throw new Error(result.message);
  return { detail: `${add.length} vergeben, ${remove.length} entzogen.` };
});

registerAcceptStep('notifyApplicant', async (ctx) => {
  const text = textOr(
    ctx.messages['accepted'],
    '🎉 Deine Bewerbung für **{applicationName}** wurde **angenommen**! Willkommen im Team.',
    ctx.variables,
  );
  await ctx.port.sendDm(ctx.applicantId, {
    content: [text, ctx.note ? `\n**Nachricht vom Team:** ${ctx.note}` : '']
      .join('')
      .slice(0, 1900),
  });
});

registerAcceptStep('notifyLeadership', async (ctx) => {
  if (!ctx.reviewChannelId) throw new Error('Kein Bearbeitungskanal konfiguriert.');
  await ctx.port.postMessage(ctx.reviewChannelId, {
    content: `🟢 Bewerbung von <@${ctx.applicantId}> (**${ctx.applicationName}**) wurde von <@${ctx.reviewerId}> angenommen.`,
    allowed_mentions: { parse: [] },
  } as never);
});

async function runPipeline(
  keys: readonly { key: string; label: string }[],
  ctx: PipelineContext,
  enabled: Record<string, boolean> | undefined,
): Promise<StepResult[]> {
  const out: StepResult[] = [];
  for (const step of keys) {
    if (enabled?.[step.key] === false) {
      out.push({ ...step, status: 'skipped', detail: 'Schritt ist deaktiviert.' });
      continue;
    }
    const handler = handlers.get(step.key);
    if (!handler) {
      out.push({
        ...step,
        status: 'unavailable',
        detail: 'Dafür fehlt das zugehörige Modul (noch nicht verfügbar).',
      });
      continue;
    }
    try {
      const r = await handler(ctx);
      out.push({ ...step, status: r?.skipped ? 'skipped' : 'done', detail: r?.detail });
    } catch (error) {
      out.push({
        ...step,
        status: 'failed',
        detail: error instanceof Error ? error.message : 'Unerwarteter Fehler.',
      });
    }
  }
  return out;
}

export const overallOf = (steps: StepResult[]): 'success' | 'partial' | 'failed' => {
  const failed = steps.filter((s) => s.status === 'failed').length;
  if (failed === 0) return 'success';
  return steps.some((s) => s.status === 'done') ? 'partial' : 'failed';
};

const ICON: Record<StepStatus, string> = {
  done: '✅',
  skipped: '⏭️',
  failed: '❌',
  unavailable: '⏳',
};
export const formatSteps = (steps: StepResult[]): string =>
  steps.map((s) => `${ICON[s.status]} ${s.label}${s.detail ? ` – ${s.detail}` : ''}`).join('\n');

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

type Json = Prisma.InputJsonValue;
const audit = (
  guildId: string,
  submissionId: string,
  applicationId: string,
  actorId: string | null,
  action: string,
  data: { before?: unknown; after?: unknown; metadata?: unknown } = {},
  actorType: 'USER' | 'SYSTEM' | 'BOT' | 'AUTOMATION' = 'USER',
) =>
  prisma.applicationAuditEvent.create({
    data: {
      guildId,
      submissionId,
      applicationId,
      actorType,
      ...(actorId ? { actorId } : {}),
      action,
      ...(data.before !== undefined ? { before: data.before as Json } : {}),
      ...(data.after !== undefined ? { after: data.after as Json } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata as Json } : {}),
    },
  });

async function load(submissionId: string, guildId?: string) {
  return prisma.applicationSubmission.findFirst({
    where: { id: submissionId, ...(guildId ? { guildId } : {}) },
    include: { application: { include: { roleRules: true } }, version: true },
  });
}
type Submission = NonNullable<Awaited<ReturnType<typeof load>>>;

const questionsOf = (json: unknown): Question[] => {
  const raw = Array.isArray(json) ? json : (json as { questions?: unknown } | null)?.questions;
  return Array.isArray(raw) ? (raw as Question[]) : [];
};

async function answersOf(submissionId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.applicationAnswer.findMany({ where: { submissionId } });
  return Object.fromEntries(rows.map((r) => [r.questionId, r.value]));
}

/** Kanal und Rollen für die Bearbeitung: Bewerbungs-Konfiguration vor Server-Auswahl (Dashboard). */
async function reviewTargets(s: Submission) {
  const cfg = readConfig(s.application.config).review;
  const selections = await guildRepository.getSelections(s.guildId);
  const roleIds = cfg.reviewRoleIds?.length
    ? cfg.reviewRoleIds
    : selections['application-review-role']
      ? [selections['application-review-role']]
      : [];
  return {
    channelId:
      s.submissionChannelId ?? cfg.submissionChannelId ?? selections['application-review-channel'],
    roleIds,
    selections,
  };
}

async function refreshReviewMessage(
  port: DiscordPort,
  s: Submission,
  status: string,
  decision?: { by: string; reason?: string | null; note?: string | null },
  dashboardUrl?: string,
): Promise<boolean> {
  const channelId = s.submissionChannelId;
  const messageId = s.submissionMessageId;
  if (!channelId || !messageId) return false;
  const answers = await answersOf(s.id);
  try {
    await port.editMessage(
      channelId,
      messageId,
      reviewMessage({
        submissionId: s.id,
        applicantId: s.userId,
        applicantName: s.displayNameSnapshot,
        applicationName: s.application.name,
        version: s.version.version,
        status,
        submittedAt: s.submittedAt,
        answerCount: Object.keys(answers).length,
        isTest: s.isTest,
        number: s.submissionNumber,
        statusLabels: statusLabelsOf(s.application.config),
        assigneeId: s.assigneeUserId,
        coReviewerIds: await coReviewerIds(s.id),
        decision,
        dashboardUrl,
      }) as never,
    );
    return true;
  } catch {
    return false;
  }
}

const vars = (s: Submission, extra: Record<string, unknown> = {}) => ({
  applicationId: s.applicationId,
  submissionId: s.id,
  applicationName: s.application.name,
  userId: s.userId,
  username: s.usernameSnapshot,
  displayName: s.displayNameSnapshot,
  userMention: `<@${s.userId}>`,
  guildId: s.guildId,
  ...extra,
});

// ---------------------------------------------------------------------------
// Nach dem Absenden: Bearbeiter benachrichtigen (Ablauf: SUBMITTED → Bearbeiter erhält Benachrichtigung)
// ---------------------------------------------------------------------------

export async function postSubmissionToReview(
  port: DiscordPort,
  submissionId: string,
  opts: { dashboardUrl?: string | undefined } = {},
): Promise<{
  ok: boolean;
  channelId?: string | undefined;
  messageId?: string | undefined;
  reason?: string | undefined;
}> {
  const s = await load(submissionId);
  if (!s) return { ok: false, reason: 'Bewerbung nicht gefunden.' };
  if (s.submissionMessageId)
    return {
      ok: true,
      channelId: s.submissionChannelId ?? undefined,
      messageId: s.submissionMessageId,
    };
  const targets = await reviewTargets(s);
  const fail = async (reason: string) => {
    await audit(
      s.guildId,
      s.id,
      s.applicationId,
      null,
      'review.notification_failed',
      { metadata: { reason } },
      'SYSTEM',
    );
    return { ok: false, reason };
  };
  if (!targets.channelId)
    return fail('Kein Bearbeitungskanal konfiguriert (Dashboard → Rollen & Kanäle).');
  const questions = questionsOf(s.version.questions);
  const answers = await answersOf(s.id);
  try {
    const main = await port.postMessage(
      targets.channelId,
      reviewMessage({
        submissionId: s.id,
        applicantId: s.userId,
        applicantName: s.displayNameSnapshot,
        applicationName: s.application.name,
        version: s.version.version,
        status: s.status,
        submittedAt: s.submittedAt,
        answerCount: Object.keys(answers).length,
        isTest: s.isTest,
        number: s.submissionNumber,
        statusLabels: statusLabelsOf(s.application.config),
        assigneeId: s.assigneeUserId,
        pingRoleIds: targets.roleIds,
        dashboardUrl: opts.dashboardUrl,
      }) as never,
    );
    await prisma.applicationSubmission.update({
      where: { id: s.id },
      data: { submissionChannelId: targets.channelId, submissionMessageId: main.id },
    });
    for (const m of answerMessages(questions, answers))
      await port.postMessage(targets.channelId, m);
    await audit(
      s.guildId,
      s.id,
      s.applicationId,
      null,
      'review.posted',
      { after: { channelId: targets.channelId, messageId: main.id } },
      'BOT',
    );
    return { ok: true, channelId: targets.channelId, messageId: main.id };
  } catch {
    return fail('Der Bot konnte nicht in den Bearbeitungskanal schreiben (Rechte prüfen).');
  }
}

// ---------------------------------------------------------------------------
// In Prüfung nehmen / Rückfrage / Gespräch
// ---------------------------------------------------------------------------

/** SUBMITTED → UNDER_REVIEW (atomar); bereits in Prüfung ist kein Fehler. */
async function takeUnderReview(s: Submission, reviewerId: string): Promise<void> {
  if (s.status !== SubmissionStatus.SUBMITTED) return;
  const r = await prisma.applicationSubmission.updateMany({
    where: { id: s.id, status: SubmissionStatus.SUBMITTED },
    data: { status: SubmissionStatus.UNDER_REVIEW, reviewerUserId: s.reviewerUserId ?? reviewerId },
  });
  if (r.count > 0) {
    await audit(s.guildId, s.id, s.applicationId, reviewerId, 'submission.under_review', {
      before: { status: s.status },
      after: { status: SubmissionStatus.UNDER_REVIEW },
    });
  }
}

const assignedElsewhere = (id: string) => `Diese Bewerbung wird bereits von <@${id}> bearbeitet.`;

/** Weitere Bearbeiter (neben dem Hauptbearbeiter `assigneeUserId`). */
export async function coReviewerIds(submissionId: string): Promise<string[]> {
  const rows = await prisma.applicationReviewer.findMany({ where: { submissionId, assigneeType: 'USER' }, orderBy: { assignedAt: 'asc' }, select: { assigneeId: true } });
  return [...new Set(rows.map((r) => r.assigneeId))];
}

/** Darf diese Person die Bewerbung bearbeiten? Niemand zugewiesen, Hauptbearbeiter oder weiterer Bearbeiter. */
async function mayAct(s: { id: string; assigneeUserId: string | null }, userId: string): Promise<boolean> {
  return !s.assigneeUserId || s.assigneeUserId === userId || (await coReviewerIds(s.id)).includes(userId);
}

const MAX_CO_REVIEWERS = 10;

/**
 * Weitere Bearbeiter hinzufügen/entfernen. Festlegen dürfen der Hauptbearbeiter und Führungskräfte (`canReassign`);
 * ohne Hauptbearbeiter wird die handelnde Person zuerst Hauptbearbeiter. Weitere Bearbeiter dürfen wie der
 * Hauptbearbeiter entscheiden und zurückstellen.
 */
export async function setCoReviewer(
  port: DiscordPort,
  input: { submissionId: string; guildId: string; actorId: string; userId: string; add: boolean; canReassign?: boolean | undefined },
): Promise<{ ok: true; coReviewerIds: string[] } | { ok: false; message: string }> {
  if (!/^\d{5,25}$/.test(input.userId)) return { ok: false, message: 'Ungültige Discord-ID.' };
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  if (isFinal(s.status)) return { ok: false, message: `Diese Bewerbung ist bereits abgeschlossen (${STATUS_LABEL[s.status]}).` };
  if (s.assigneeUserId && s.assigneeUserId !== input.actorId && !input.canReassign)
    return { ok: false, message: 'Nur der Hauptbearbeiter oder eine Führungskraft kann weitere Bearbeiter festlegen.' };
  const current = await coReviewerIds(s.id);
  if (input.add) {
    if (input.userId === s.assigneeUserId) return { ok: false, message: 'Diese Person ist bereits Hauptbearbeiter.' };
    if (current.includes(input.userId)) return { ok: false, message: 'Diese Person bearbeitet die Bewerbung bereits.' };
    if (current.length >= MAX_CO_REVIEWERS) return { ok: false, message: `Höchstens ${MAX_CO_REVIEWERS} weitere Bearbeiter.` };
    if (!s.assigneeUserId) {
      await prisma.applicationSubmission.updateMany({ where: { id: s.id, assigneeUserId: null }, data: { assigneeUserId: input.actorId, assignedAt: new Date() } });
      await takeUnderReview(s, input.actorId);
    }
    await prisma.applicationReviewer.create({ data: { submissionId: s.id, assigneeType: 'USER', assigneeId: input.userId, assignedById: input.actorId } });
  } else {
    const r = await prisma.applicationReviewer.deleteMany({ where: { submissionId: s.id, assigneeType: 'USER', assigneeId: input.userId } });
    if (r.count === 0) return { ok: false, message: 'Diese Person ist kein weiterer Bearbeiter.' };
  }
  await audit(s.guildId, s.id, s.applicationId, input.actorId, input.add ? 'submission.reviewer_added' : 'submission.reviewer_removed', {
    before: { coReviewers: current },
    after: { coReviewers: await coReviewerIds(s.id), userId: input.userId },
  });
  const fresh = (await load(s.id)) ?? s;
  await refreshReviewMessage(port, fresh, fresh.status);
  if (input.add)
    await port.sendDm(input.userId, { content: `👥 <@${input.actorId}> hat dich als Bearbeiter der Bewerbung **${s.application.name}**${s.submissionNumber ? ` (#${s.submissionNumber})` : ''} hinzugefügt.` }).catch(() => undefined);
  return { ok: true, coReviewerIds: await coReviewerIds(s.id) };
}

/**
 * Bewerbung weiterleiten: Der Hauptbearbeiter (oder eine Führungskraft) übergibt an eine andere Person, die neuer
 * Hauptbearbeiter wird; eine kurze Notiz ist möglich. War die Person weiterer Bearbeiter, wird sie dort entfernt.
 */
export async function forwardSubmission(
  port: DiscordPort,
  input: { submissionId: string; guildId: string; actorId: string; toUserId: string; note?: string | undefined; canReassign?: boolean | undefined },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!/^\d{5,25}$/.test(input.toUserId)) return { ok: false, message: 'Ungültige Discord-ID.' };
  const note = input.note?.trim() || undefined;
  if (note && note.length > 500) return { ok: false, message: 'Die Notiz ist zu lang (max. 500 Zeichen).' };
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  if (isFinal(s.status)) return { ok: false, message: `Diese Bewerbung ist bereits abgeschlossen (${STATUS_LABEL[s.status]}).` };
  if (s.assigneeUserId !== input.actorId && !input.canReassign)
    return { ok: false, message: 'Nur der Hauptbearbeiter oder eine Führungskraft kann die Bewerbung weiterleiten.' };
  if (input.toUserId === s.assigneeUserId) return { ok: false, message: 'Diese Person ist bereits Hauptbearbeiter.' };
  const r = await prisma.applicationSubmission.updateMany({
    where: { id: s.id, assigneeUserId: s.assigneeUserId, status: { in: [...OPEN_SUBMISSION_STATUSES] } },
    data: { assigneeUserId: input.toUserId, assignedAt: new Date() },
  });
  if (r.count === 0) return { ok: false, message: 'Die Bewerbung wurde gerade geändert – bitte erneut versuchen.' };
  await prisma.applicationReviewer.deleteMany({ where: { submissionId: s.id, assigneeType: 'USER', assigneeId: input.toUserId } });
  await takeUnderReview(s, input.actorId);
  await audit(s.guildId, s.id, s.applicationId, input.actorId, 'submission.forwarded', {
    before: { assigneeId: s.assigneeUserId },
    after: { assigneeId: input.toUserId, ...(note ? { note } : {}) },
  });
  const fresh = (await load(s.id)) ?? s;
  await refreshReviewMessage(port, fresh, fresh.status);
  await port
    .sendDm(input.toUserId, { content: `📨 <@${input.actorId}> hat dir die Bewerbung **${s.application.name}**${s.submissionNumber ? ` (#${s.submissionNumber})` : ''} weitergeleitet.${note ? `\n\nNotiz: ${note}` : ''}` })
    .catch(() => undefined);
  return { ok: true };
}

/**
 * Übernehmen / Freigeben / Zuweisen. Genau ein Bearbeiter: eine bereits übernommene Bewerbung kann nur eine Führungskraft
 * (`canReassign`) übernehmen oder neu zuweisen; freigeben dürfen der Bearbeiter selbst oder eine Führungskraft.
 * `assigneeId = null` gibt frei.
 */
export async function assignSubmission(
  port: DiscordPort,
  input: { submissionId: string; guildId: string; actorId: string; assigneeId: string | null; canReassign?: boolean | undefined },
): Promise<{ ok: true; assigneeId: string | null } | { ok: false; message: string }> {
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  if (isFinal(s.status))
    return { ok: false, message: `Diese Bewerbung ist bereits abgeschlossen (${STATUS_LABEL[s.status]}).` };
  const current = s.assigneeUserId;
  const next = input.assigneeId;
  if (next === current) return { ok: false, message: next ? 'Diese Person bearbeitet die Bewerbung bereits.' : 'Die Bewerbung ist niemandem zugewiesen.' };
  if (next === null) {
    if (current !== input.actorId && !input.canReassign)
      return { ok: false, message: 'Nur der Bearbeiter oder eine Führungskraft kann die Bewerbung freigeben.' };
  } else {
    if (current && current !== input.actorId && !input.canReassign) return { ok: false, message: assignedElsewhere(current) };
    if (next !== input.actorId && !input.canReassign)
      return { ok: false, message: 'Nur Führungskräfte können Bewerbungen anderen zuweisen.' };
    if (next !== input.actorId && !/^\d{5,25}$/.test(next)) return { ok: false, message: 'Ungültige Discord-ID.' };
  }
  const r = await prisma.applicationSubmission.updateMany({
    where: { id: s.id, assigneeUserId: current, status: { in: [...OPEN_SUBMISSION_STATUSES] } },
    data: { assigneeUserId: next, assignedAt: next ? new Date() : null },
  });
  if (r.count === 0) return { ok: false, message: 'Die Bewerbung wurde gerade geändert – bitte erneut versuchen.' };
  if (next) await takeUnderReview(s, input.actorId);
  await audit(s.guildId, s.id, s.applicationId, input.actorId, next ? 'submission.assigned' : 'submission.released', {
    before: { assigneeId: current },
    after: { assigneeId: next },
  });
  const fresh = (await load(s.id)) ?? s;
  await refreshReviewMessage(port, fresh, fresh.status);
  return { ok: true, assigneeId: next };
}

/**
 * Zurückstellen (offen → ON_HOLD) oder fortsetzen (ON_HOLD → UNDER_REVIEW). Wie bei Entscheidungen: ist die Bewerbung einer
 * anderen Person zugewiesen, darf nur eine Führungskraft (`canReassign`). Der Grund ist optional und steht im Verlauf.
 */
export async function holdSubmission(
  port: DiscordPort,
  input: { submissionId: string; guildId: string; actorId: string; hold: boolean; reason?: string | undefined; canReassign?: boolean | undefined },
): Promise<{ ok: true; status: SubmissionStatus } | { ok: false; message: string }> {
  const reason = input.reason?.trim() || undefined;
  if (reason && reason.length > 500) return { ok: false, message: 'Der Grund ist zu lang (max. 500 Zeichen).' };
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  if (!input.canReassign && !(await mayAct(s, input.actorId))) return { ok: false, message: assignedElsewhere(s.assigneeUserId!) };
  if (input.hold && s.status === SubmissionStatus.ON_HOLD) return { ok: false, message: 'Die Bewerbung ist bereits zurückgestellt.' };
  if (!input.hold && s.status !== SubmissionStatus.ON_HOLD) return { ok: false, message: 'Die Bewerbung ist nicht zurückgestellt.' };
  const target = input.hold ? SubmissionStatus.ON_HOLD : SubmissionStatus.UNDER_REVIEW;
  try {
    assertTransition(s.status, target);
  } catch {
    return { ok: false, message: `Diese Bewerbung lässt sich nicht ${input.hold ? 'zurückstellen' : 'fortsetzen'} (${STATUS_LABEL[s.status] ?? s.status}).` };
  }
  const r = await prisma.applicationSubmission.updateMany({
    where: { id: s.id, status: s.status },
    data: { status: target, ...(target === SubmissionStatus.UNDER_REVIEW ? { reviewerUserId: s.reviewerUserId ?? input.actorId } : {}) },
  });
  if (r.count === 0) return { ok: false, message: 'Die Bewerbung wurde gerade geändert – bitte erneut versuchen.' };
  await audit(s.guildId, s.id, s.applicationId, input.actorId, input.hold ? 'submission.on_hold' : 'submission.resumed', {
    before: { status: s.status },
    after: { status: target, ...(reason ? { reason } : {}) },
  });
  const fresh = (await load(s.id)) ?? s;
  await refreshReviewMessage(port, fresh, fresh.status);
  return { ok: true, status: target };
}

/**
 * Bewerbung durch das Team zurücknehmen (Status WITHDRAWN). Grund ist Pflicht; Bearbeiter und Grund werden protokolliert,
 * der Bewerber erhält eine Nachricht. Nur solange noch nicht entschieden wurde.
 */
export async function withdrawByStaff(
  port: DiscordPort,
  input: { submissionId: string; guildId: string; actorId: string; reason: string | undefined },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 3) return { ok: false, message: 'Bitte einen Grund für das Zurücknehmen angeben.' };
  if (reason.length > 1000) return { ok: false, message: 'Der Grund ist zu lang (max. 1000 Zeichen).' };
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  try {
    assertTransition(s.status, SubmissionStatus.WITHDRAWN);
  } catch {
    return { ok: false, message: `Diese Bewerbung lässt sich nicht mehr zurücknehmen (${STATUS_LABEL[s.status] ?? s.status}).` };
  }
  const r = await prisma.applicationSubmission.updateMany({
    where: { id: s.id, status: { in: [...OPEN_SUBMISSION_STATUSES] } },
    data: { status: SubmissionStatus.WITHDRAWN, internalReason: reason, reviewerUserId: input.actorId },
  });
  if (r.count === 0) return { ok: false, message: 'Die Bewerbung wurde in der Zwischenzeit entschieden.' };
  await audit(s.guildId, s.id, s.applicationId, input.actorId, 'submission.withdrawn_by_staff', {
    before: { status: s.status },
    after: { status: SubmissionStatus.WITHDRAWN, reason },
  });
  await refreshReviewMessage(port, s, SubmissionStatus.WITHDRAWN, { by: input.actorId, reason });
  await port
    .sendDm(s.userId, { content: `↩️ Deine Bewerbung **${s.application.name}** wurde vom Team zurückgenommen.\n\nGrund: ${reason}` })
    .catch(() => undefined);
  return { ok: true };
}

export async function startReview(
  port: DiscordPort,
  input: { submissionId: string; guildId: string; reviewerId: string },
) {
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false as const, message: 'Bewerbung nicht gefunden.' };
  if (isFinal(s.status))
    return {
      ok: false as const,
      message: `Diese Bewerbung ist bereits abgeschlossen (${STATUS_LABEL[s.status]}).`,
    };
  await takeUnderReview(s, input.reviewerId);
  const fresh = (await load(s.id)) ?? s;
  await refreshReviewMessage(port, fresh, fresh.status);
  return { ok: true as const, status: fresh.status };
}

async function contact(
  kind: 'clarification' | 'interview',
  port: DiscordPort,
  input: { submissionId: string; guildId: string; reviewerId: string; text: string },
) {
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false as const, message: 'Bewerbung nicht gefunden.' };
  if (isFinal(s.status)) {
    return {
      ok: false as const,
      message: `Diese Bewerbung ist bereits abgeschlossen (${STATUS_LABEL[s.status]}).`,
    };
  }
  await takeUnderReview(s, input.reviewerId);
  let delivered = true;
  try {
    await port.sendDm(s.userId, {
      content:
        kind === 'clarification'
          ? `🟡 **Rückfrage zu deiner Bewerbung „${s.application.name}“**\n\n${input.text}\n\n_Antworte einfach auf diese Nachricht – deine Antwort geht direkt an das Team._`
          : `🎙️ **Gespräch zu deiner Bewerbung „${s.application.name}“**\n\n${input.text}`,
    });
  } catch {
    delivered = false;
  }
  await prisma.applicationNote.create({
    data: {
      submissionId: s.id,
      authorId: input.reviewerId,
      content:
        `${kind === 'clarification' ? 'Rückfrage' : 'Gesprächseinladung'}: ${input.text}${delivered ? '' : ' (DM nicht zustellbar)'}`.slice(
          0,
          4000,
        ),
      mentions: [],
    },
  });
  await audit(
    s.guildId,
    s.id,
    s.applicationId,
    input.reviewerId,
    kind === 'clarification' ? 'clarification.asked' : 'interview.invited',
    {
      after: { text: input.text.slice(0, 500), delivered },
    },
  );
  const fresh = (await load(s.id)) ?? s;
  await refreshReviewMessage(port, fresh, fresh.status);
  return {
    ok: true as const,
    delivered,
    message: delivered
      ? 'Nachricht an den Bewerber gesendet.'
      : '⚠️ Der Bewerber hat Direktnachrichten deaktiviert – die Nachricht konnte nicht zugestellt werden (als Notiz gespeichert).',
  };
}

export const askClarification = (
  port: DiscordPort,
  input: { submissionId: string; guildId: string; reviewerId: string; question: string },
) => contact('clarification', port, { ...input, text: input.question });
export const inviteToInterview = (
  port: DiscordPort,
  input: { submissionId: string; guildId: string; reviewerId: string; message: string },
) => contact('interview', port, { ...input, text: input.message });

/** Antwort des Bewerbers auf eine offene Rückfrage (per DM) → Notiz + Hinweis an das Team. */
export async function recordClarificationReply(
  port: DiscordPort,
  input: { userId: string; text: string },
): Promise<{ handled: boolean; submissionId?: string }> {
  const candidates = await prisma.applicationSubmission.findMany({
    where: { userId: input.userId, status: { in: [SubmissionStatus.UNDER_REVIEW, SubmissionStatus.ON_HOLD] } },
    orderBy: { updatedAt: 'desc' },
    include: { application: { include: { roleRules: true } }, version: true },
  });
  for (const s of candidates) {
    const events = await prisma.applicationAuditEvent.findMany({
      where: {
        submissionId: s.id,
        action: { in: ['clarification.asked', 'clarification.answered'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    if (events[0]?.action !== 'clarification.asked') continue; // keine offene Rückfrage
    await prisma.applicationNote.create({
      data: {
        submissionId: s.id,
        authorId: input.userId,
        content: `Antwort des Bewerbers auf die Rückfrage: ${input.text}`.slice(0, 4000),
        mentions: [],
      },
    });
    await audit(s.guildId, s.id, s.applicationId, input.userId, 'clarification.answered', {
      after: { text: input.text.slice(0, 500) },
    });
    if (s.submissionChannelId) {
      await port
        .postMessage(s.submissionChannelId, {
          content: `💬 Antwort von <@${s.userId}> auf die Rückfrage (**${s.application.name}**):\n>>> ${input.text.slice(0, 1500)}`,
          allowed_mentions: { parse: [] },
        } as never)
        .catch(() => undefined);
    }
    return { handled: true, submissionId: s.id };
  }
  return { handled: false };
}

// ---------------------------------------------------------------------------
// Entscheidung (Annehmen / Ablehnen)
// ---------------------------------------------------------------------------

export interface DecisionInput {
  submissionId: string;
  guildId: string;
  reviewerId: string;
  decision: 'ACCEPTED' | 'DENIED';
  /** ID eines Ablehnungsgrunds aus der Konfiguration (nur Ablehnung). */
  reasonId?: string | undefined;
  /** Zusätzliche Nachricht an den Bewerber. */
  note?: string | undefined;
  internalReason?: string | undefined;
  dashboardUrl?: string | undefined;
  /** Darf trotz Zuweisung an eine andere Person entscheiden (Führungskraft, Recht „Zuständigkeit ändern“). */
  bypassAssignee?: boolean | undefined;
}

export type DecisionResult =
  | {
      ok: true;
      status: 'ACCEPTED' | 'DENIED';
      steps: StepResult[];
      overall: 'success' | 'partial' | 'failed';
      message: string;
    }
  | { ok: false; message: string };

export async function decideSubmission(
  port: DiscordPort,
  input: DecisionInput,
): Promise<DecisionResult> {
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  const target =
    input.decision === 'ACCEPTED' ? SubmissionStatus.ACCEPTED : SubmissionStatus.DENIED;
  const denied = (current: string) => ({
    ok: false as const,
    message: `Diese Bewerbung kann nicht mehr entschieden werden – Status: ${STATUS_LABEL[current] ?? current}.`,
  });
  try {
    assertTransition(s.status, target);
  } catch {
    return denied(s.status);
  }
  if (!input.bypassAssignee && !(await mayAct(s, input.reviewerId)))
    return { ok: false, message: assignedElsewhere(s.assigneeUserId!) };

  // Ablehnungsgrund auflösen
  let publicReason: string | undefined;
  let reasonLabel: string | undefined;
  if (target === SubmissionStatus.DENIED) {
    const reason = denyReasonsOf(s.application.config).find((r) => r.id === input.reasonId);
    if (input.reasonId && !reason) return { ok: false, message: 'Unbekannter Ablehnungsgrund.' };
    reasonLabel = reason?.label;
    publicReason = [reason?.text, input.note].filter(Boolean).join('\n\n') || undefined;
  } else {
    publicReason = input.note;
  }

  // Atomarer Statuswechsel – nur genau eine Entscheidung gewinnt
  const now = new Date();
  const claimed = await prisma.applicationSubmission.updateMany({
    where: {
      id: s.id,
      guildId: s.guildId,
      status: { in: [...OPEN_SUBMISSION_STATUSES] },
    },
    data: {
      status: target,
      reviewerUserId: input.reviewerId,
      ...(target === SubmissionStatus.ACCEPTED ? { acceptedAt: now } : { deniedAt: now }),
      ...(publicReason !== undefined ? { publicReason } : {}),
      ...(input.internalReason !== undefined ? { internalReason: input.internalReason } : {}),
    },
  });
  if (claimed.count === 0) {
    const current = (await load(s.id))?.status ?? s.status;
    return denied(current);
  }
  await audit(
    s.guildId,
    s.id,
    s.applicationId,
    input.reviewerId,
    target === SubmissionStatus.ACCEPTED ? 'submission.accepted' : 'submission.denied',
    {
      before: { status: s.status },
      after: {
        status: target,
        reason: reasonLabel,
        publicReason,
        internalReason: input.internalReason,
      },
    },
  );

  // Schritte
  const cfg = readConfig(s.application.config);
  const targets = await reviewTargets(s);
  const ruleActions = roleActionsForTransition(s.status, target, s.application.roleRules);
  const add = ruleActions.filter((a) => a.type === 'ADD').map((a) => a.roleId);
  const remove = ruleActions.filter((a) => a.type === 'REMOVE').map((a) => a.roleId);
  // Rückfall: kein Annahme-Regel konfiguriert → Rolle aus den Server-Einstellungen (Dashboard)
  if (
    target === SubmissionStatus.ACCEPTED &&
    add.length === 0 &&
    targets.selections['application-accepted-role']
  ) {
    add.push(targets.selections['application-accepted-role']);
  }
  const ctx: PipelineContext = {
    port,
    guildId: s.guildId,
    submissionId: s.id,
    applicantId: s.userId,
    applicationName: s.application.name,
    isTest: s.isTest,
    reviewerId: input.reviewerId,
    publicReason,
    note: input.note,
    reviewChannelId: s.submissionChannelId ?? targets.channelId,
    reviewMessageId: s.submissionMessageId ?? undefined,
    roleActions: { add, remove },
    onboarding: cfg.review.onboarding ?? {},
    answers: await answersOf(s.id),
    displayName: s.displayNameSnapshot,
    messages: cfg.messages,
    selections: targets.selections,
    variables: vars(s, { reviewer: `<@${input.reviewerId}>`, reason: publicReason ?? '' }),
  };

  let steps: StepResult[];
  if (target === SubmissionStatus.ACCEPTED) {
    steps = await runPipeline(ACCEPT_STEPS, ctx, cfg.review.acceptPipeline);
  } else {
    // Ablehnung: nur Rollen-Regeln für „abgelehnt“ (z. B. Wartende-Rolle entfernen) und Information – keine Personalakte,
    // keine Dienstnummer, keine Einstiegsrolle.
    steps = [];
    const denyRoles = await rolesStepForDenial(ctx);
    steps.push(denyRoles);
    try {
      const wait = denyWaitVariables(s.application.config, now);
      const template = cfg.messages['denied'] ?? '🔴 Deine Bewerbung für **{applicationName}** wurde leider **abgelehnt**.';
      // Wartezeit nennen: als Platzhalter im eigenen Text oder – falls der Text sie nicht erwähnt – automatisch am Ende
      const mentionsWait = /\{(wartezeit|wiederAb)\}/.test(template);
      await port.sendDm(s.userId, {
        content: textOr(template, template, { ...ctx.variables, ...wait })
          .concat(
            reasonLabel ? `\n\n**Grund:** ${reasonLabel}` : '',
            publicReason ? `\n${publicReason}` : '',
            wait.wartezeit && !mentionsWait ? `\n\nDu kannst dich nach ${wait.wartezeit} erneut bewerben (ab ${wait.wiederAb} Uhr).` : '',
          )
          .slice(0, 1900),
      });
      steps.push({ key: 'notifyApplicant', label: 'Bewerber informieren', status: 'done' });
    } catch {
      steps.push({
        key: 'notifyApplicant',
        label: 'Bewerber informieren',
        status: 'failed',
        detail: 'Direktnachricht nicht zustellbar (DMs deaktiviert?).',
      });
    }
  }
  // Ergebnis-Kanal: Annahmen (und – falls gewünscht – Ablehnungen) öffentlich bekannt geben; Testbewerbungen nicht
  const review = cfg.review as typeof cfg.review & { resultChannelId?: string; resultPostDenied?: boolean; resultAcceptedText?: string; resultDeniedText?: string };
  if (review.resultChannelId && !s.isTest && (target === SubmissionStatus.ACCEPTED || review.resultPostDenied)) {
    const accepted = target === SubmissionStatus.ACCEPTED;
    const template = (accepted ? review.resultAcceptedText : review.resultDeniedText) || (accepted ? '🎉 {user} wurde bei **{applicationName}** angenommen. Willkommen im Team!' : '❌ Die Bewerbung von {user} für **{applicationName}** wurde abgelehnt.');
    try {
      await port.postMessage(review.resultChannelId, {
        embeds: [{ description: textOr(template, template, ctx.variables).slice(0, 4000), color: accepted ? 0x57f287 : 0xed4245, timestamp: now.toISOString() }],
        allowed_mentions: { parse: [], users: [s.userId] },
      } as never);
      steps.push({ key: 'resultChannel', label: 'Ergebnis-Kanal', status: 'done' });
    } catch {
      steps.push({ key: 'resultChannel', label: 'Ergebnis-Kanal', status: 'failed', detail: 'Der Bot konnte nicht in den Ergebnis-Kanal schreiben (Rechte prüfen).' });
    }
  }
  const overall = overallOf(steps);
  await audit(
    s.guildId,
    s.id,
    s.applicationId,
    input.reviewerId,
    'submission.pipeline',
    { metadata: { decision: target, overall, steps } },
    'AUTOMATION',
  );

  const fresh = (await load(s.id)) ?? s;
  await refreshReviewMessage(
    port,
    fresh,
    target,
    { by: input.reviewerId, reason: reasonLabel ?? null, note: input.note ?? null },
    input.dashboardUrl,
  );
  if (overall !== 'success' && ctx.reviewChannelId) {
    await port
      .postMessage(ctx.reviewChannelId, {
        content: `⚠️ Entscheidung für <@${s.userId}> gespeichert, aber nicht alle Schritte sind gelungen:\n${formatSteps(steps.filter((x) => x.status === 'failed'))}`,
        allowed_mentions: { parse: [] },
      } as never)
      .catch(() => undefined);
  }

  return {
    ok: true,
    status: target,
    steps,
    overall,
    message:
      `${target === SubmissionStatus.ACCEPTED ? '✅ Angenommen' : '🔴 Abgelehnt'}${overall === 'success' ? '.' : overall === 'partial' ? ' – teilweise fehlgeschlagen.' : ' – Folgeschritte fehlgeschlagen.'}\n` +
      formatSteps(steps),
  };
}

async function rolesStepForDenial(ctx: PipelineContext): Promise<StepResult> {
  const base = { key: 'roles', label: 'Rollen anpassen' };
  const { add, remove } = ctx.roleActions;
  if (add.length + remove.length === 0)
    return { ...base, status: 'skipped', detail: 'Keine Rollenregel für Ablehnung.' };
  if (ctx.isTest) return { ...base, status: 'skipped', detail: 'Test-Bewerbung.' };
  const r = await applyRoleChanges(
    {
      guildId: ctx.guildId,
      userId: ctx.applicantId,
      add,
      remove,
      trigger: 'Bewerbung abgelehnt',
      automation: 'application-deny',
      actorId: ctx.reviewerId,
      resourceType: 'ApplicationSubmission',
      resourceId: ctx.submissionId,
      permission: 'applications.submissions.deny',
    },
    ctx.port.roleDriver(ctx.guildId),
  );
  return r.status === 'success'
    ? { ...base, status: 'done' }
    : { ...base, status: 'failed', detail: r.message };
}

// ---------------------------------------------------------------------------
// Zurückziehen durch den Bewerber
// ---------------------------------------------------------------------------

export async function withdrawSubmission(
  port: DiscordPort,
  input: { submissionId: string; userId: string; reason?: string | undefined },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const s = await load(input.submissionId);
  if (!s || s.userId !== input.userId) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  try {
    assertTransition(s.status, SubmissionStatus.WITHDRAWN);
  } catch {
    return {
      ok: false,
      message: `Diese Bewerbung lässt sich nicht mehr zurückziehen (${STATUS_LABEL[s.status] ?? s.status}).`,
    };
  }
  const r = await prisma.applicationSubmission.updateMany({
    where: {
      id: s.id,
      status: { in: [...OPEN_SUBMISSION_STATUSES] },
    },
    data: {
      status: SubmissionStatus.WITHDRAWN,
      ...(input.reason ? { publicReason: input.reason } : {}),
    },
  });
  if (r.count === 0)
    return {
      ok: false,
      message:
        'Die Bewerbung wurde in der Zwischenzeit entschieden und kann nicht mehr zurückgezogen werden.',
    };
  await audit(s.guildId, s.id, s.applicationId, input.userId, 'submission.withdrawn', {
    before: { status: s.status },
    after: { status: SubmissionStatus.WITHDRAWN, reason: input.reason },
  });
  await refreshReviewMessage(port, s, SubmissionStatus.WITHDRAWN, undefined);
  if (s.submissionChannelId) {
    await port
      .postMessage(s.submissionChannelId, {
        content: `↩️ <@${s.userId}> hat die Bewerbung **${s.application.name}** zurückgezogen.${input.reason ? `\nGrund: ${input.reason.slice(0, 1000)}` : ''}`,
        allowed_mentions: { parse: [] },
      } as never)
      .catch(() => undefined);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ansicht für das Team („Ansehen“)
// ---------------------------------------------------------------------------

/** Antworten einer Bewerbung als Textblöcke (≤ 1900 Zeichen je Nachricht) – setzt sie auf „In Prüfung“, wenn sie offen ist. */
export async function viewSubmission(
  port: DiscordPort,
  input: { submissionId: string; guildId: string; reviewerId: string },
): Promise<
  { ok: true; title: string; blocks: string[]; status: string } | { ok: false; message: string }
> {
  const s = await load(input.submissionId, input.guildId);
  if (!s) return { ok: false, message: 'Bewerbung nicht gefunden.' };
  if (!isFinal(s.status)) {
    await takeUnderReview(s, input.reviewerId);
    const fresh = (await load(s.id)) ?? s;
    await refreshReviewMessage(port, fresh, fresh.status);
  }
  const fresh = (await load(s.id)) ?? s;
  const answers = await answersOf(s.id);
  const notes = await prisma.applicationNote.findMany({
    where: { submissionId: s.id },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  const blocks = answerBlocks(questionsOf(s.version.questions), answers, 1800);
  if (notes.length) {
    blocks.push(
      '**Notizen**\n' +
        notes
          .map((n) => `• <@${n.authorId}>: ${n.content.slice(0, 300)}`)
          .join('\n')
          .slice(0, 1700),
    );
  }
  return {
    ok: true,
    title: `📖 ${s.displayNameSnapshot} – ${s.application.name} (${STATUS_LABEL[fresh.status] ?? fresh.status})`,
    blocks: blocks.length ? blocks : ['Keine Antworten vorhanden.'],
    status: fresh.status,
  };
}
