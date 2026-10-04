import type { DiscordPort } from '@nexus/automation';
import { assertGuildId, guildRepository, prisma, type Prisma } from '@nexus/database';
import { ShiftError } from './errors.js';
import { leaveUnit } from './units.js';
import { aggregate, computeDuration, formatSeconds, isOverlong, validateCorrection } from './time.js';

/**
 * Shift-System: Typen mit Rollenanforderung, Start/Pause/Fortsetzen/Ende, Korrekturen, Historie, Rohdaten und
 * Erkennung ungewöhnlich langer Schichten. Jede Zustandsänderung ist atomar (`updateMany` mit Statusbedingung) und
 * erzeugt ein Rohdaten-Ereignis; manuelle Änderungen landen zusätzlich im Audit-Log.
 */
type Json = Prisma.InputJsonValue;

const OPEN = ['ACTIVE', 'PAUSED'] as const;

async function event(shiftId: string, guildId: string, type: string, actorId: string | null, data?: unknown, at = new Date()) {
  await prisma.shiftEvent.create({ data: { shiftId, guildId, type, actorId, at, ...(data !== undefined ? { data: data as Json } : {}) } });
}

// --- Typen ---------------------------------------------------------------------------

export interface ShiftTypeInput {
  id?: string | undefined;
  name: string;
  description?: string | undefined;
  emoji?: string | undefined;
  requiredRoleIds?: string[] | undefined;
  maxDurationMinutes?: number | undefined;
  active?: boolean | undefined;
}

export const listTypes = (guildId: string, onlyActive = false) =>
  prisma.shiftType.findMany({ where: { guildId: assertGuildId(guildId), ...(onlyActive ? { active: true } : {}) }, orderBy: { name: 'asc' } });

export async function saveType(guildId: string, input: ShiftTypeInput, actorId: string) {
  const gid = assertGuildId(guildId);
  const name = input.name.trim();
  if (!name || name.length > 50) throw new ShiftError('invalid', 'Der Name des Shift-Typs fehlt oder ist zu lang (max. 50 Zeichen).');
  const roles = [...new Set(input.requiredRoleIds ?? [])];
  if (roles.some((r) => !/^\d{5,25}$/.test(r)) || roles.length > 20) throw new ShiftError('invalid', 'Ungültige Rollenauswahl.');
  const max = input.maxDurationMinutes ?? 480;
  if (!Number.isInteger(max) || max < 10 || max > 7 * 24 * 60) throw new ShiftError('invalid', 'Die Höchstdauer muss zwischen 10 Minuten und 7 Tagen liegen.');
  const data = { name, description: input.description?.trim() || null, emoji: input.emoji?.trim() || null, requiredRoleIds: roles, maxDurationMinutes: max, active: input.active ?? true };
  try {
    const type = input.id ? await prisma.shiftType.update({ where: { id: input.id, guildId: gid }, data }) : await prisma.shiftType.create({ data: { ...data, guildId: gid } });
    await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: input.id ? 'shift.type.updated' : 'shift.type.created', resourceType: 'ShiftType', resourceId: type.id, after: data as Json, permission: 'shifts.manage', result: 'success' } });
    return type;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new ShiftError('conflict', 'Einen Shift-Typ mit diesem Namen gibt es schon.');
    if (e instanceof Error && /No record was found|Record to update not found/i.test(e.message)) throw new ShiftError('not-found', 'Shift-Typ nicht gefunden.');
    throw e;
  }
}

export async function deleteType(guildId: string, id: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const type = await prisma.shiftType.findFirst({ where: { id, guildId: gid }, include: { _count: { select: { shifts: true } } } });
  if (!type) throw new ShiftError('not-found', 'Shift-Typ nicht gefunden.');
  if (type._count.shifts > 0) throw new ShiftError('conflict', `Zu diesem Typ gibt es ${type._count.shifts} Schicht(en) – bitte deaktivieren statt löschen.`);
  await prisma.shiftType.delete({ where: { id } });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'shift.type.deleted', resourceType: 'ShiftType', resourceId: id, before: { name: type.name } as Json, permission: 'shifts.manage', result: 'success' } });
}

/** Typen, die dieses Mitglied nutzen darf (Rollenanforderung erfüllt). */
export async function usableTypes(guildId: string, memberRoleIds: readonly string[]) {
  return (await listTypes(guildId, true)).filter((t) => t.requiredRoleIds.length === 0 || t.requiredRoleIds.some((r) => memberRoleIds.includes(r)));
}

// --- Schicht-Ablauf ----------------------------------------------------------------------

const withType = { type: true } as const;

export const getOpenShift = (guildId: string, userId: string) =>
  prisma.shift.findFirst({ where: { guildId: assertGuildId(guildId), userId, status: { in: [...OPEN] } }, include: withType });

export async function getShift(guildId: string, id: string) {
  const s = await prisma.shift.findFirst({ where: { id, guildId: assertGuildId(guildId) }, include: withType });
  if (!s) throw new ShiftError('not-found', 'Schicht nicht gefunden.');
  return s;
}

export async function startShift(input: { guildId: string; userId: string; typeId: string; memberRoleIds: readonly string[] }, now = new Date()) {
  const guildId = assertGuildId(input.guildId);
  const type = await prisma.shiftType.findFirst({ where: { id: input.typeId, guildId } });
  if (!type || !type.active) throw new ShiftError('invalid', 'Diesen Shift-Typ gibt es nicht oder er ist deaktiviert.');
  if (type.requiredRoleIds.length > 0 && !type.requiredRoleIds.some((r) => input.memberRoleIds.includes(r))) {
    throw new ShiftError('forbidden', `Für „${type.name}“ fehlt dir die nötige Rolle.`);
  }
  // Wer abgemeldet ist, startet keine Schicht (Abmeldungen, Phase 26) – vorzeitig zurückmelden hebt die Sperre auf.
  const today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}T00:00:00.000Z`);
  const absent = await prisma.absence.findFirst({ where: { guildId, userId: input.userId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } } });
  if (absent) throw new ShiftError('conflict', `Du bist bis ${absent.endDate.toLocaleDateString('de-DE', { timeZone: 'UTC' })} abgemeldet (${`A-${String(absent.number).padStart(4, '0')}`}). Melde dich mit \`/abmeldung zurueck\` zurück, um in den Dienst zu gehen.`);
  const record = await prisma.personnelRecord.findUnique({ where: { guildId_userId: { guildId, userId: input.userId } }, select: { id: true, status: true } });
  try {
    const shift = await prisma.shift.create({
      data: { guildId, userId: input.userId, typeId: type.id, recordId: record?.status === 'ACTIVE' ? record.id : null, status: 'ACTIVE', openKey: 'open', startedAt: now },
      include: withType,
    });
    await event(shift.id, guildId, 'start', input.userId, { typeId: type.id, type: type.name }, now);
    return shift;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) {
      const open = await getOpenShift(guildId, input.userId);
      throw new ShiftError('conflict', `Du hast bereits eine laufende Schicht${open ? ` (${open.type.name}, seit <t:${Math.floor(open.startedAt.getTime() / 1000)}:t>)` : ''}. Beende sie zuerst.`);
    }
    throw e;
  }
}

async function ownOpen(guildId: string, userId: string, status?: 'ACTIVE' | 'PAUSED') {
  const open = await getOpenShift(guildId, userId);
  if (!open) throw new ShiftError('conflict', 'Du hast keine laufende Schicht.');
  if (status && open.status !== status) {
    throw new ShiftError('conflict', status === 'ACTIVE' ? 'Deine Schicht ist pausiert – setze sie zuerst fort.' : 'Deine Schicht ist nicht pausiert.');
  }
  return open;
}

export async function pauseShift(guildId: string, userId: string, now = new Date()) {
  const open = await ownOpen(guildId, userId, 'ACTIVE');
  const r = await prisma.shift.updateMany({ where: { id: open.id, status: 'ACTIVE' }, data: { status: 'PAUSED', pausedAt: now } });
  if (r.count === 0) throw new ShiftError('conflict', 'Die Schicht wurde gerade geändert – bitte erneut versuchen.');
  await event(open.id, guildId, 'pause', userId, undefined, now);
  return getShift(guildId, open.id);
}

export async function resumeShift(guildId: string, userId: string, now = new Date()) {
  const open = await ownOpen(guildId, userId, 'PAUSED');
  const add = open.pausedAt ? Math.max(0, Math.floor((now.getTime() - open.pausedAt.getTime()) / 1000)) : 0;
  const r = await prisma.shift.updateMany({ where: { id: open.id, status: 'PAUSED' }, data: { status: 'ACTIVE', pausedAt: null, pausedSeconds: { increment: add } } });
  if (r.count === 0) throw new ShiftError('conflict', 'Die Schicht wurde gerade geändert – bitte erneut versuchen.');
  await event(open.id, guildId, 'resume', userId, { pausedSeconds: add }, now);
  return getShift(guildId, open.id);
}

export interface EndOptions {
  /** Handelnder: der Besitzer selbst oder eine Führungskraft. */
  actorId: string;
  /** Führungskraft beendet fremde Schicht (verlangt Begründung). */
  supervisor?: boolean;
  /** Nur Führungskraft: tatsächliches Ende (z. B. bei vergessenem Dienstende). */
  endedAt?: Date | undefined;
  reason?: string | undefined;
  permission?: string | undefined;
}

/** Beendet eine offene Schicht (atomar). Führungskräfte müssen eine Begründung angeben; sie wird protokolliert. */
export async function endShift(guildId: string, shiftId: string, o: EndOptions, now = new Date()) {
  const gid = assertGuildId(guildId);
  const shift = await getShift(gid, shiftId);
  if (shift.status === 'ENDED') throw new ShiftError('conflict', 'Diese Schicht ist bereits beendet.');
  const foreign = shift.userId !== o.actorId;
  if (foreign && !o.supervisor) throw new ShiftError('forbidden', 'Du kannst nur deine eigene Schicht beenden.');
  const reason = o.reason?.trim();
  if ((foreign || o.endedAt) && (!reason || reason.length < 3)) throw new ShiftError('invalid', 'Bitte eine kurze Begründung angeben (wird protokolliert).');
  const endedAt = o.endedAt ?? now;
  if (endedAt.getTime() > now.getTime() + 60_000) throw new ShiftError('invalid', 'Das Ende darf nicht in der Zukunft liegen.');
  if (endedAt.getTime() < shift.startedAt.getTime()) throw new ShiftError('invalid', 'Das Ende liegt vor dem Beginn der Schicht.');
  const d = computeDuration({ startedAt: shift.startedAt, endedAt, pausedAt: shift.pausedAt, pausedSeconds: shift.pausedSeconds });
  const r = await prisma.shift.updateMany({
    where: { id: shift.id, status: { in: [...OPEN] } },
    data: { status: 'ENDED', endedAt, pausedAt: null, pausedSeconds: d.pausedSeconds, durationSeconds: d.netSeconds, openKey: null, endedBy: o.actorId, endReason: foreign || o.endedAt ? 'supervisor' : 'manual' },
  });
  if (r.count === 0) throw new ShiftError('conflict', 'Die Schicht wurde gerade geändert oder beendet.');
  await event(shift.id, gid, 'end', o.actorId, { netSeconds: d.netSeconds, pausedSeconds: d.pausedSeconds, ...(reason ? { reason } : {}), ...(o.endedAt ? { requestedEnd: o.endedAt.toISOString() } : {}) }, now);
  await leaveUnit(gid, shift.userId, o.actorId, 'shift-ended');
  if (foreign || o.endedAt) {
    await prisma.auditLog.create({
      data: { guildId: gid, actorType: 'USER', actorId: o.actorId, action: 'shift.ended_by_supervisor', resourceType: 'Shift', resourceId: shift.id, before: { status: shift.status, userId: shift.userId } as Json, after: { endedAt: endedAt.toISOString(), netSeconds: d.netSeconds } as Json, reason: reason ?? null, result: 'success', ...(o.permission ? { permission: o.permission } : {}) },
    });
  }
  return getShift(gid, shift.id);
}

/** Korrigiert eine beendete Schicht (Beginn, Ende, Pausen). Begründung Pflicht, Vorher/Nachher im Protokoll. */
export async function correctShift(
  guildId: string,
  shiftId: string,
  patch: { startedAt?: Date | undefined; endedAt?: Date | undefined; pausedSeconds?: number | undefined },
  reason: string | undefined,
  actorId: string,
  permission?: string,
  now = new Date(),
) {
  const gid = assertGuildId(guildId);
  const shift = await getShift(gid, shiftId);
  if (shift.status !== 'ENDED' || !shift.endedAt) throw new ShiftError('conflict', 'Nur beendete Schichten lassen sich korrigieren – laufende bitte zuerst beenden.');
  const why = reason?.trim();
  if (!why || why.length < 3) throw new ShiftError('invalid', 'Bitte eine kurze Begründung angeben (wird protokolliert).');
  const next = { startedAt: patch.startedAt ?? shift.startedAt, endedAt: patch.endedAt ?? shift.endedAt, pausedSeconds: patch.pausedSeconds ?? shift.pausedSeconds };
  if (next.startedAt.getTime() === shift.startedAt.getTime() && next.endedAt.getTime() === shift.endedAt.getTime() && next.pausedSeconds === shift.pausedSeconds) {
    throw new ShiftError('invalid', 'Es wurde nichts geändert.');
  }
  const errors = validateCorrection(next, now);
  if (errors.length) throw new ShiftError('invalid', errors[0]!);
  const d = computeDuration({ ...next, pausedAt: null });
  const before = { startedAt: shift.startedAt.toISOString(), endedAt: shift.endedAt.toISOString(), pausedSeconds: shift.pausedSeconds, netSeconds: shift.durationSeconds };
  const after = { startedAt: next.startedAt.toISOString(), endedAt: next.endedAt.toISOString(), pausedSeconds: next.pausedSeconds, netSeconds: d.netSeconds };
  await prisma.shift.update({ where: { id: shift.id }, data: { startedAt: next.startedAt, endedAt: next.endedAt, pausedSeconds: next.pausedSeconds, durationSeconds: d.netSeconds, endReason: 'corrected' } });
  await event(shift.id, gid, 'correct', actorId, { before, after, reason: why }, now);
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'shift.corrected', resourceType: 'Shift', resourceId: shift.id, before: before as Json, after: after as Json, reason: why, result: 'success', ...(permission ? { permission } : {}) } });
  return getShift(gid, shift.id);
}

// --- Historie, Statistik, Rohdaten ------------------------------------------------------------

export interface ShiftFilter {
  guildId: string;
  userId?: string | undefined;
  typeId?: string | undefined;
  status?: 'ACTIVE' | 'PAUSED' | 'ENDED' | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  /** `null` = alle, sonst nur Schichten von Mitgliedern dieser Teams (TEAM-Bereich). */
  restrictToTeams?: string[] | null | undefined;
}

async function whereOf(f: ShiftFilter): Promise<Prisma.ShiftWhereInput> {
  const guildId = assertGuildId(f.guildId);
  let userIds: string[] | undefined;
  if (f.restrictToTeams) {
    const records = await prisma.personnelRecord.findMany({ where: { guildId, teamId: { in: f.restrictToTeams } }, select: { userId: true } });
    userIds = records.map((r) => r.userId);
  }
  return {
    guildId,
    ...(f.status ? { status: f.status } : {}),
    ...(f.typeId ? { typeId: f.typeId } : {}),
    ...(f.from || f.to ? { startedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
    ...(f.userId ? { userId: userIds && !userIds.includes(f.userId) ? '__none__' : f.userId } : userIds ? { userId: { in: userIds } } : {}),
  };
}

export async function listShifts(f: ShiftFilter & { limit?: number; cursor?: string | undefined }) {
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = await prisma.shift.findMany({
    where: await whereOf(f),
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    include: withType,
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

/** Anzahl, Gesamtdauer und Durchschnitt (beendete Schichten, Nettodauer) für den Filter. */
export async function shiftStats(f: ShiftFilter) {
  const rows = await prisma.shift.findMany({ where: { ...(await whereOf(f)), status: 'ENDED', durationSeconds: { not: null } }, select: { durationSeconds: true } });
  const stats = aggregate(rows.map((r) => r.durationSeconds ?? 0));
  const running = await prisma.shift.count({ where: { ...(await whereOf(f)), status: { in: [...OPEN] } } });
  return { ...stats, running };
}

/** Rohdaten: eine Zeile je Schicht inkl. Ereignisse. */
export async function rawData(f: ShiftFilter & { withEvents?: boolean }) {
  return prisma.shift.findMany({
    where: await whereOf(f),
    orderBy: { startedAt: 'asc' },
    include: { type: { select: { name: true } }, ...(f.withEvents ? { events: { orderBy: { at: 'asc' } } } : {}) },
    take: 50_000,
  });
}

const csvCell = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? '' : String(v);
  // Formelinjektion in Tabellenkalkulationen verhindern
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(rows: Awaited<ReturnType<typeof rawData>>): string {
  const head = ['id', 'userId', 'typ', 'status', 'beginn', 'ende', 'pausenSekunden', 'nettoSekunden', 'beendetVon', 'endeGrund'];
  const lines = rows.map((r) => [r.id, r.userId, r.type.name, r.status, r.startedAt, r.endedAt, r.pausedSeconds, r.durationSeconds, r.endedBy, r.endReason].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n');
}

// --- Ungewöhnlich lange Schichten (Hintergrundjob) ----------------------------------------------------

export interface WatchResult {
  checked: number;
  flagged: { shiftId: string; userId: string; notified: boolean; dmDelivered: boolean }[];
}

/**
 * Findet offene Schichten, die länger als der Höchstwert ihres Typs laufen, markiert sie (einmalig) und
 * benachrichtigt Führung (Kanal „Schicht-Hinweise“) und Mitglied (DM). Beendet **nichts** automatisch –
 * Korrektur erfolgt durch Vorgesetzte (Begründung wird protokolliert).
 */
export async function watchOverlongShifts(port: DiscordPort, now = new Date(), dashboardUrl?: string): Promise<WatchResult> {
  const open = await prisma.shift.findMany({ where: { status: { in: [...OPEN] }, flaggedLongAt: null }, include: withType });
  const result: WatchResult = { checked: open.length, flagged: [] };
  const channels = new Map<string, string | undefined>();
  for (const s of open) {
    if (!isOverlong(s, s.type.maxDurationMinutes, now)) continue;
    const claimed = await prisma.shift.updateMany({ where: { id: s.id, flaggedLongAt: null, status: { in: [...OPEN] } }, data: { flaggedLongAt: now } });
    if (claimed.count === 0) continue; // anderer Lauf war schneller
    const d = computeDuration(s, now);
    await event(s.id, s.guildId, 'flag', null, { reason: 'overlong', grossSeconds: d.grossSeconds, maxMinutes: s.type.maxDurationMinutes }, now);
    if (!channels.has(s.guildId)) channels.set(s.guildId, (await guildRepository.getSelections(s.guildId))['shift-alert-channel']);
    const channelId = channels.get(s.guildId);
    let notified = false;
    if (channelId) {
      notified = await port
        .postMessage(channelId, {
          content: `⏰ <@${s.userId}> ist seit **${formatSeconds(d.grossSeconds)}** im Dienst (${s.type.name}, erlaubt: ${formatSeconds(s.type.maxDurationMinutes * 60)}). Wurde das Dienstende vergessen? Eine Führungskraft kann die Schicht im Dashboard korrigieren.${dashboardUrl ? `\n${dashboardUrl}` : ''}`,
          allowed_mentions: { parse: [] },
        } as never)
        .then(() => true, () => false);
    }
    const dmDelivered = await port
      .sendDm(s.userId, { content: `⏰ Deine Schicht „${s.type.name}“ läuft seit ${formatSeconds(d.grossSeconds)}. Hast du vergessen, dich auszutragen? Beende sie mit \`/schicht ende\`.` })
      .then(() => true, () => false);
    await prisma.auditLog.create({ data: { guildId: s.guildId, actorType: 'AUTOMATION', action: 'shift.flagged_overlong', resourceType: 'Shift', resourceId: s.id, after: { userId: s.userId, grossSeconds: d.grossSeconds, notified, dmDelivered } as Json, automation: 'shift-watch', result: notified || dmDelivered ? 'success' : 'failed', reason: notified ? null : 'Kein Schicht-Hinweis-Kanal konfiguriert oder nicht erreichbar.' } });
    result.flagged.push({ shiftId: s.id, userId: s.userId, notified, dmDelivered });
  }
  return result;
}
