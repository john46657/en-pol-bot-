import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';
import {
  DiscordApiError,
  banGuildMember,
  getCurrentBotUserId,
  getGuild,
  getGuildMember,
  getGuildRoles,
  kickGuildMember,
  sendDirectMessage,
  timeoutGuildMember,
  unbanGuildMember,
} from '@nexus/discord';

/**
 * Moderation: Verwarnung, Timeout, Kick, Bann – jeweils als nummerierter Fall mit Grund (Pflicht), Moderator, Ergebnis und
 * Audit-Eintrag. Schutzregeln: nie gegen sich selbst, den Bot oder den Serverbesitzer; nur gegen Mitglieder, deren höchste Rolle
 * **unter** der eigenen steht (der Besitzer ist ausgenommen); für Timeout/Kick/Bann muss auch die Rolle des Bots höher stehen.
 * Die Discord-Aktion läuft zuerst – schlägt sie fehl, entsteht kein Fall, nur ein Audit-Eintrag mit Ergebnis „failed“.
 */
type Json = Prisma.InputJsonValue;
export const TYPES = ['WARN', 'TIMEOUT', 'KICK', 'BAN'] as const;
export type CaseType = (typeof TYPES)[number];
export const TYPE_LABEL: Record<CaseType, string> = { WARN: 'Verwarnung', TIMEOUT: 'Timeout', KICK: 'Kick', BAN: 'Bann' };
export const MAX_REASON = 300;
/** Discord erlaubt Timeouts von höchstens 28 Tagen. */
export const MAX_TIMEOUT_MIN = 28 * 24 * 60;
export const DELETE_DAYS_MAX = 7;

export class ModerationError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden' | 'discord', message: string) {
    super(message);
    this.name = 'ModerationError';
  }
}

/** Alles, was die Moderation von Discord braucht (austauschbar für Tests). */
export interface ModerationPort {
  ownerId(guildId: string): Promise<string>;
  botUserId(): Promise<string>;
  /** `null`, wenn der Benutzer nicht (mehr) auf dem Server ist. */
  memberRoleIds(guildId: string, userId: string): Promise<string[] | null>;
  rolePositions(guildId: string): Promise<Map<string, number>>;
  timeout(guildId: string, userId: string, until: Date | null, reason: string): Promise<void>;
  kick(guildId: string, userId: string, reason: string): Promise<void>;
  ban(guildId: string, userId: string, reason: string, deleteMessageSeconds: number): Promise<void>;
  unban(guildId: string, userId: string, reason: string): Promise<void>;
  /** Best effort: wirft, wenn die DMs des Benutzers geschlossen sind. */
  dm(userId: string, content: string): Promise<void>;
}

export function restModerationPort(token: string): ModerationPort {
  return {
    ownerId: async (g) => (await getGuild(token, g)).ownerId,
    botUserId: () => getCurrentBotUserId(token),
    memberRoleIds: async (g, u) => (await getGuildMember(token, g, u))?.roles ?? null,
    rolePositions: async (g) => new Map((await getGuildRoles(token, g)).map((r) => [r.id, r.position])),
    timeout: (g, u, until, reason) => timeoutGuildMember(token, g, u, until, reason),
    kick: (g, u, reason) => kickGuildMember(token, g, u, reason),
    ban: (g, u, reason, secs) => banGuildMember(token, g, u, reason, secs),
    unban: (g, u, reason) => unbanGuildMember(token, g, u, reason),
    dm: async (u, content) => void (await sendDirectMessage(token, u, { content })),
  };
}

export interface Actor {
  userId: string;
  roleIds: readonly string[];
}

const ID = /^\d{5,25}$/;
const top = (roleIds: readonly string[], pos: Map<string, number>) => Math.max(0, ...roleIds.map((r) => pos.get(r) ?? 0));

function checkReason(reason: string | undefined, what = 'Grund'): string {
  const r = reason?.trim();
  if (!r || r.length < 3) throw new ModerationError('invalid', `Bitte einen ${what} angeben.`);
  if (r.length > MAX_REASON) throw new ModerationError('invalid', `Der ${what} ist zu lang (max. ${MAX_REASON} Zeichen).`);
  return r;
}

/** Wirft `ModerationError`, wenn der Handelnde dieses Ziel nicht moderieren darf. Liefert, ob das Ziel Mitglied ist. */
export async function assertCanModerate(port: ModerationPort, guildId: string, actor: Actor, targetId: string, type: CaseType): Promise<boolean> {
  if (!ID.test(targetId)) throw new ModerationError('invalid', 'Ungültige Discord-Benutzer-ID.');
  if (targetId === actor.userId) throw new ModerationError('forbidden', 'Du kannst dich nicht selbst moderieren.');
  const [owner, bot] = await Promise.all([port.ownerId(guildId), port.botUserId()]);
  if (targetId === bot) throw new ModerationError('forbidden', 'Den Bot kannst du nicht moderieren.');
  if (targetId === owner) throw new ModerationError('forbidden', 'Der Serverbesitzer kann nicht moderiert werden.');
  const roles = await port.memberRoleIds(guildId, targetId);
  if (!roles) {
    if (type === 'TIMEOUT' || type === 'KICK') throw new ModerationError('invalid', 'Dieser Benutzer ist nicht auf dem Server.');
    return false;
  }
  const pos = await port.rolePositions(guildId);
  const targetTop = top(roles, pos);
  if (actor.userId !== owner && top(actor.roleIds, pos) <= targetTop) throw new ModerationError('forbidden', 'Du kannst nur Mitglieder moderieren, deren höchste Rolle unter deiner eigenen steht.');
  if (type !== 'WARN') {
    const botRoles = await port.memberRoleIds(guildId, bot);
    if (botRoles && top(botRoles, pos) <= targetTop) throw new ModerationError('forbidden', 'Die höchste Rolle des Bots steht nicht über der des Mitglieds – Discord würde die Aktion ablehnen.');
  }
  return true;
}

function discordMessage(e: unknown): string {
  if (e instanceof DiscordApiError) {
    if (e.status === 403) return 'Discord hat die Aktion abgelehnt: Dem Bot fehlt das Recht oder seine Rolle steht zu niedrig.';
    if (e.status === 404) return 'Discord kennt dieses Mitglied nicht (mehr).';
  }
  return 'Discord hat die Aktion nicht ausgeführt. Bitte später erneut versuchen.';
}

async function audit(guildId: string, actorId: string, action: string, id: string, before: unknown, after: unknown, reason: string, result: 'success' | 'failed' = 'success') {
  await auditRepository.createRaw({ data: { guildId, actorType: 'USER', actorId, action, resourceType: 'ModerationCase', resourceId: id, ...(before != null ? { before: before as Json } : {}), after: after as Json, reason, result } });
}

async function nextCase(guildId: string, data: Omit<Prisma.ModerationCaseUncheckedCreateInput, 'guildId' | 'number'>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const max = await prisma.moderationCase.aggregate({ where: { guildId }, _max: { number: true } });
    try {
      return await prisma.moderationCase.create({ data: { ...data, guildId, number: (max._max.number ?? 0) + 1 } });
    } catch (e) {
      if (!(e instanceof Error && /Unique constraint/i.test(e.message))) throw e;
    }
  }
  throw new ModerationError('conflict', 'Fallnummer konnte nicht vergeben werden – bitte erneut versuchen.');
}

export interface ModerateInput {
  guildId: string;
  type: string;
  userId: string;
  reason: string;
  /** Nur Timeout: Dauer in Minuten (1 bis 40320). */
  durationMin?: number | undefined;
  /** Nur Bann: Nachrichten der letzten Tage löschen (0–7). */
  deleteDays?: number | undefined;
  actor: Actor;
}

export async function moderate(i: ModerateInput, port: ModerationPort, now = new Date()) {
  const guildId = assertGuildId(i.guildId);
  if (!(TYPES as readonly string[]).includes(i.type)) throw new ModerationError('invalid', 'Unbekannte Maßnahme.');
  const type = i.type as CaseType;
  const reason = checkReason(i.reason);
  let durationMin: number | null = null;
  if (type === 'TIMEOUT') {
    if (!Number.isInteger(i.durationMin) || (i.durationMin as number) < 1 || (i.durationMin as number) > MAX_TIMEOUT_MIN) throw new ModerationError('invalid', `Ein Timeout dauert 1 Minute bis 28 Tage (${MAX_TIMEOUT_MIN} Minuten).`);
    durationMin = i.durationMin as number;
  }
  const deleteDays = type === 'BAN' ? i.deleteDays ?? 0 : 0;
  if (!Number.isInteger(deleteDays) || deleteDays < 0 || deleteDays > DELETE_DAYS_MAX) throw new ModerationError('invalid', `Nachrichten lassen sich für 0 bis ${DELETE_DAYS_MAX} Tage löschen.`);
  await assertCanModerate(port, guildId, i.actor, i.userId, type);
  await expireDue(guildId, now);
  if (type === 'BAN' && (await prisma.moderationCase.findFirst({ where: { guildId, userId: i.userId, type: 'BAN', status: 'ACTIVE' } })))
    throw new ModerationError('conflict', 'Dieser Benutzer ist bereits gebannt.');

  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { name: true } });
  const server = guild?.name ?? 'dem Server';
  const expiresAt = durationMin ? new Date(now.getTime() + durationMin * 60_000) : null;
  const dmText = {
    WARN: `⚠️ Verwarnung auf **${server}**\nGrund: ${reason}`,
    TIMEOUT: `⏳ Du wurdest auf **${server}** für ${durationMin} Minuten stummgeschaltet.\nGrund: ${reason}`,
    KICK: `👢 Du wurdest von **${server}** entfernt.\nGrund: ${reason}`,
    BAN: `⛔ Du wurdest von **${server}** gebannt.\nGrund: ${reason}`,
  }[type];
  const dm = () => port.dm(i.userId, dmText).then(() => true, () => false);

  // Kick/Bann: DM vorher (danach teilen Benutzer und Bot keinen Server mehr)
  let dmDelivered = type === 'KICK' || type === 'BAN' || type === 'WARN' ? await dm() : false;
  try {
    if (type === 'TIMEOUT') await port.timeout(guildId, i.userId, expiresAt, reason);
    else if (type === 'KICK') await port.kick(guildId, i.userId, reason);
    else if (type === 'BAN') await port.ban(guildId, i.userId, reason, deleteDays * 86_400);
  } catch (e) {
    await audit(guildId, i.actor.userId, `moderation.${type.toLowerCase()}`, 'failed', null, { type, userId: i.userId }, reason, 'failed');
    throw new ModerationError('discord', discordMessage(e));
  }
  if (type === 'TIMEOUT') dmDelivered = await dm();

  if (type === 'TIMEOUT')
    await prisma.moderationCase.updateMany({ where: { guildId, userId: i.userId, type: 'TIMEOUT', status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: now, revokedBy: i.actor.userId, revokeReason: 'Durch neuen Timeout ersetzt' } });
  const row = await nextCase(guildId, { type, userId: i.userId, moderatorId: i.actor.userId, reason, durationMin, expiresAt, status: type === 'KICK' ? 'DONE' : 'ACTIVE', dmDelivered });
  await audit(guildId, i.actor.userId, `moderation.${type.toLowerCase()}`, row.id, null, { number: row.number, type, userId: i.userId, durationMin, dmDelivered }, reason);
  return row;
}

/** Hebt Verwarnung, Timeout oder Bann auf (ein Kick lässt sich nicht zurücknehmen). */
export async function revoke(guildId: string, id: string, reason: string | undefined, actor: Actor, port: ModerationPort, now = new Date()) {
  const gid = assertGuildId(guildId);
  await expireDue(gid, now);
  const c = await prisma.moderationCase.findFirst({ where: { id, guildId: gid } });
  if (!c) throw new ModerationError('not-found', 'Fall nicht gefunden.');
  const why = checkReason(reason, 'Grund für das Aufheben');
  if (c.type === 'KICK') throw new ModerationError('invalid', 'Ein Kick lässt sich nicht aufheben.');
  if (c.status !== 'ACTIVE') throw new ModerationError('conflict', 'Dieser Fall ist bereits beendet.');
  if (c.userId === actor.userId) throw new ModerationError('forbidden', 'Du kannst Maßnahmen gegen dich selbst nicht aufheben.');
  try {
    if (c.type === 'TIMEOUT') await port.timeout(gid, c.userId, null, why).catch((e: unknown) => { if (!(e instanceof DiscordApiError && e.status === 404)) throw e; });
    else if (c.type === 'BAN') await port.unban(gid, c.userId, why);
  } catch (e) {
    await audit(gid, actor.userId, 'moderation.revoke', id, { status: 'ACTIVE' }, { type: c.type }, why, 'failed');
    throw new ModerationError('discord', discordMessage(e));
  }
  const u = await prisma.moderationCase.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedBy: actor.userId, revokeReason: why, revokedAt: now } });
  if (u.count === 0) throw new ModerationError('conflict', 'Dieser Fall ist bereits beendet.');
  await audit(gid, actor.userId, 'moderation.revoke', id, { status: 'ACTIVE' }, { status: 'REVOKED', number: c.number, type: c.type }, why);
  return prisma.moderationCase.findFirstOrThrow({ where: { id } });
}

/** Setzt abgelaufene Timeouts auf EXPIRED (Discord hebt sie selbst auf). */
export async function expireDue(guildId?: string, now = new Date()): Promise<{ expired: number }> {
  const r = await prisma.moderationCase.updateMany({ where: { type: 'TIMEOUT', status: 'ACTIVE', expiresAt: { lte: now }, ...(guildId ? { guildId: assertGuildId(guildId) } : {}) }, data: { status: 'EXPIRED' } });
  return { expired: r.count };
}

export interface ListFilter {
  guildId: string;
  userId?: string | undefined;
  type?: string | undefined;
  status?: string | undefined;
  limit?: number | undefined;
}
export async function listCases(f: ListFilter) {
  const guildId = assertGuildId(f.guildId);
  await expireDue(guildId);
  return prisma.moderationCase.findMany({
    where: {
      guildId,
      ...(f.userId ? { userId: f.userId } : {}),
      ...((TYPES as readonly string[]).includes(f.type ?? '') ? { type: f.type as CaseType } : {}),
      ...(['ACTIVE', 'EXPIRED', 'REVOKED', 'DONE'].includes(f.status ?? '') ? { status: f.status as string } : {}),
    },
    orderBy: { number: 'desc' },
    take: Math.min(Math.max(f.limit ?? 100, 1), 300),
  });
}

/** Zähler je Maßnahme für einen Benutzer (Verwarnungen zählen nur aktive). */
export async function userSummary(guildId: string, userId: string) {
  const rows = await listCases({ guildId, userId, limit: 300 });
  const count = (t: CaseType) => rows.filter((r) => r.type === t && (t === 'KICK' || r.status === 'ACTIVE' || t === 'TIMEOUT')).length;
  return { warns: rows.filter((r) => r.type === 'WARN' && r.status === 'ACTIVE').length, timeouts: count('TIMEOUT'), kicks: count('KICK'), banned: rows.some((r) => r.type === 'BAN' && r.status === 'ACTIVE'), cases: rows };
}
