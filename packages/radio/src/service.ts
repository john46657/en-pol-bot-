import { assertGuildId, guildRepository, prisma, type Prisma } from '@nexus/database';
import { decideAccess, type Access, type Area, type Level, type Reason } from './access.js';
import { RadioError } from './errors.js';

type Json = Prisma.InputJsonValue;
const LEVELS: Level[] = ['LISTEN', 'SPEAK', 'FULL'];
const ID = /^\d{5,25}$/;

async function event(guildId: string, userId: string, type: string, actorId: string | null, data?: unknown) {
  await prisma.radioEvent.create({ data: { guildId, userId, type, actorId, ...(data !== undefined ? { data: data as Json } : {}) } });
}
async function audit(guildId: string, actorId: string, action: string, resourceId: string, before: unknown, after: unknown, permission: string, reason?: string | null) {
  await prisma.auditLog.create({ data: { guildId, actorType: 'USER', actorId, action, resourceType: 'RadioAccess', resourceId, before: before as Json, after: after as Json, permission, result: 'success', reason: reason ?? null } });
}

// --- Whitelist -------------------------------------------------------------------------------

export interface WhitelistInput {
  guildId: string;
  userId: string;
  level: string;
  special?: boolean | undefined;
  reason?: string | undefined;
  actorId: string;
  permission?: string | undefined;
}

/** Fügt hinzu oder ändert (Stufe/Spezial). Jede Änderung landet im Verlauf und im Audit-Log. */
export async function setAccess(i: WhitelistInput) {
  const guildId = assertGuildId(i.guildId);
  if (!ID.test(i.userId)) throw new RadioError('invalid', 'Ungültige Discord-Benutzer-ID.');
  if (!LEVELS.includes(i.level as Level)) throw new RadioError('invalid', 'Unbekannte Funkstufe (Mithören, Sprechen oder Vollzugriff).');
  const reason = i.reason?.trim() || null;
  if (reason && reason.length > 200) throw new RadioError('invalid', 'Der Grund ist zu lang (max. 200 Zeichen).');
  const level = i.level as Level;
  const special = level === 'FULL' ? true : (i.special ?? false);
  const before = await prisma.radioAccess.findUnique({ where: { guildId_userId: { guildId, userId: i.userId } } });
  if (before && before.level === level && before.special === special) throw new RadioError('conflict', 'Das Mitglied hat bereits genau diese Freigabe.');
  const row = await prisma.radioAccess.upsert({
    where: { guildId_userId: { guildId, userId: i.userId } },
    create: { guildId, userId: i.userId, level, special, reason, grantedBy: i.actorId },
    update: { level, special, reason: reason ?? before?.reason ?? null, grantedBy: i.actorId },
  });
  const after = { level, special };
  await event(guildId, i.userId, before ? 'changed' : 'added', i.actorId, { before: before && { level: before.level, special: before.special }, after, reason });
  await audit(guildId, i.actorId, before ? 'radio.access.changed' : 'radio.access.added', row.id, before && { level: before.level, special: before.special }, after, i.permission ?? 'radio.whitelist.manage', reason);
  return row;
}

export async function removeAccess(guildId: string, userId: string, actorId: string, reason?: string, permission = 'radio.whitelist.manage') {
  const gid = assertGuildId(guildId);
  const before = await prisma.radioAccess.findUnique({ where: { guildId_userId: { guildId: gid, userId } } });
  if (!before) throw new RadioError('not-found', 'Dieses Mitglied steht nicht auf der Whitelist.');
  await prisma.radioAccess.delete({ where: { id: before.id } });
  await event(gid, userId, 'removed', actorId, { before: { level: before.level, special: before.special }, reason: reason?.trim() || null });
  await audit(gid, actorId, 'radio.access.removed', before.id, { level: before.level, special: before.special }, null, permission, reason?.trim());
}

export const getAccess = (guildId: string, userId: string) => prisma.radioAccess.findUnique({ where: { guildId_userId: { guildId: assertGuildId(guildId), userId } } });

export interface WhitelistFilter {
  guildId: string;
  userIds?: string[] | undefined;
  level?: string | undefined;
  special?: boolean | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

/** Suchen/Anzeigen. `userIds` ist das Ergebnis einer Namenssuche (z. B. über Discord oder Personalakten). */
export async function listAccess(f: WhitelistFilter) {
  const guildId = assertGuildId(f.guildId);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = await prisma.radioAccess.findMany({
    where: { guildId, ...(f.userIds ? { userId: { in: f.userIds } } : {}), ...(f.level && LEVELS.includes(f.level as Level) ? { level: f.level as Level } : {}), ...(f.special !== undefined ? { special: f.special } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

export const accessHistory = (guildId: string, userId: string) => prisma.radioEvent.findMany({ where: { guildId: assertGuildId(guildId), userId }, orderBy: { at: 'desc' }, take: 100 });

// --- Kanäle ---------------------------------------------------------------------------------

export const listChannels = (guildId: string) => prisma.radioChannel.findMany({ where: { guildId: assertGuildId(guildId) }, orderBy: [{ area: 'asc' }, { name: 'asc' }] });

export async function saveChannel(guildId: string, input: { channelId: string; name: string; area?: string | undefined; requiresDuty?: boolean | undefined; active?: boolean | undefined }, actorId: string) {
  const gid = assertGuildId(guildId);
  if (!ID.test(input.channelId)) throw new RadioError('invalid', 'Ungültiger Kanal.');
  const name = input.name.trim();
  if (!name || name.length > 50) throw new RadioError('invalid', 'Der Name fehlt oder ist zu lang (max. 50 Zeichen).');
  if (input.area && input.area !== 'GENERAL' && input.area !== 'SPECIAL') throw new RadioError('invalid', 'Unbekannter Funkbereich.');
  if ((await guildRepository.getSelections(gid))['office-waiting-voice'] === input.channelId) throw new RadioError('conflict', 'Dieser Kanal ist als Büro-Warteraum festgelegt – dort darf kein Funk durchgesetzt werden (Mitglieder würden getrennt).');
  const area = (input.area ?? 'GENERAL') as Area;
  const data = { name, area, requiresDuty: input.requiresDuty ?? false, active: input.active ?? true };
  const before = await prisma.radioChannel.findUnique({ where: { guildId_channelId: { guildId: gid, channelId: input.channelId } } });
  const row = await prisma.radioChannel.upsert({ where: { guildId_channelId: { guildId: gid, channelId: input.channelId } }, create: { guildId: gid, channelId: input.channelId, ...data }, update: data });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: before ? 'radio.channel.updated' : 'radio.channel.added', resourceType: 'RadioChannel', resourceId: row.id, ...(before ? { before: { name: before.name, area: before.area, requiresDuty: before.requiresDuty, active: before.active } as Json } : {}), after: data as Json, permission: 'radio.channel.manage', result: 'success' } });
  return row;
}

export async function removeChannel(guildId: string, channelId: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const row = await prisma.radioChannel.findUnique({ where: { guildId_channelId: { guildId: gid, channelId } } });
  if (!row) throw new RadioError('not-found', 'Dieser Funkkanal ist nicht eingerichtet.');
  await prisma.radioChannel.delete({ where: { id: row.id } });
  await prisma.auditLog.create({ data: { guildId: gid, actorType: 'USER', actorId, action: 'radio.channel.removed', resourceType: 'RadioChannel', resourceId: row.id, before: { name: row.name } as Json, permission: 'radio.channel.manage', result: 'success' } });
}

// --- Prüfung ----------------------------------------------------------------------------------

/** Hat das Mitglied eine laufende, nicht pausierte Schicht? */
export async function isOnDuty(guildId: string, userId: string): Promise<boolean> {
  return (await prisma.shift.count({ where: { guildId: assertGuildId(guildId), userId, status: 'ACTIVE' } })) > 0;
}

export interface ChannelCheck {
  channelId: string;
  name: string;
  area: Area;
  access: Access;
  reason: Reason;
}

/** Zugriff eines Mitglieds auf alle eingerichteten Funkkanäle. */
export async function checkMember(guildId: string, userId: string): Promise<{ entry: { level: Level; special: boolean } | null; channels: ChannelCheck[] }> {
  const gid = assertGuildId(guildId);
  const [entry, channels, onDuty] = await Promise.all([getAccess(gid, userId), listChannels(gid), isOnDuty(gid, userId)]);
  return {
    entry: entry ? { level: entry.level, special: entry.special } : null,
    channels: channels.map((c) => ({ channelId: c.channelId, name: c.name, area: c.area, ...decideAccess(entry, c, onDuty) })),
  };
}

/** Zugriff auf einen konkreten Sprachkanal; `null` = kein Funkkanal (dann greift Funk nicht ein). */
export async function checkChannel(guildId: string, userId: string, discordChannelId: string): Promise<(ChannelCheck & { onDuty: boolean }) | null> {
  const gid = assertGuildId(guildId);
  const channel = await prisma.radioChannel.findUnique({ where: { guildId_channelId: { guildId: gid, channelId: discordChannelId } } });
  if (!channel) return null;
  const [entry, onDuty] = await Promise.all([getAccess(gid, userId), isOnDuty(gid, userId)]);
  return { channelId: channel.channelId, name: channel.name, area: channel.area, onDuty, ...decideAccess(entry, channel, onDuty) };
}
