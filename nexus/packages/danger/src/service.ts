import type { DiscordPort } from '@nexus/automation';
import { assertGuildId, auditRepository, guildRepository, prisma, type Prisma } from '@nexus/database';

/**
 * Gefahrenstatus: konfigurierbare Stufen (Standard 0–5 mit Name, Farbe, Emoji, Beschreibung, berechtigten Rollen),
 * aktuelle Stufe je Server, Verlauf. Jede Änderung (Stufe gesetzt, Konfiguration geändert) wird im Audit-Log
 * protokolliert; die Statusmeldung im Kanal „Gefahrenstatus“ wird bei jeder Änderung aktualisiert.
 */
type Json = Prisma.InputJsonValue;

export class DangerError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden', message: string) {
    super(message);
    this.name = 'DangerError';
  }
}

export const DEFAULT_LEVELS = [
  { level: 0, name: 'Normalbetrieb', color: '#9CA3AF', emoji: '⚪', description: 'Keine besondere Gefährdungslage.' },
  { level: 1, name: 'Erhöhte Aufmerksamkeit', color: '#22C55E', emoji: '🟢', description: 'Leicht erhöhte Aufmerksamkeit im Streifendienst.' },
  { level: 2, name: 'Erhöhte Gefahr', color: '#EAB308', emoji: '🟡', description: 'Gefahrenlage: verstärkte Präsenz, Meldungen beachten.' },
  { level: 3, name: 'Hohe Gefahr', color: '#F97316', emoji: '🟠', description: 'Hohe Gefahr: Einsatzbereitschaft erhöhen, Alleinstreifen vermeiden.' },
  { level: 4, name: 'Kritische Lage', color: '#EF4444', emoji: '🔴', description: 'Kritische Lage: nur noch dringende Einsätze, Führung informieren.' },
  { level: 5, name: 'Ausnahmezustand', color: '#7C3AED', emoji: '🟣', description: 'Ausnahmezustand: alle verfügbaren Kräfte, Anweisungen der Führung.' },
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^\d{5,25}$/;

/** Legt die Standardstufen an, falls der Server noch keine hat (idempotent, auch parallel). */
export async function ensureDefaults(guildId: string): Promise<void> {
  const gid = assertGuildId(guildId);
  if ((await prisma.dangerLevel.count({ where: { guildId: gid } })) > 0) return;
  await prisma.dangerLevel.createMany({ data: DEFAULT_LEVELS.map((l) => ({ guildId: gid, ...l })), skipDuplicates: true });
}

export async function listLevels(guildId: string) {
  await ensureDefaults(guildId);
  return prisma.dangerLevel.findMany({ where: { guildId: assertGuildId(guildId) }, orderBy: { level: 'asc' } });
}

export async function getCurrent(guildId: string) {
  const gid = assertGuildId(guildId);
  const levels = await listLevels(gid);
  const state = await prisma.dangerState.findUnique({ where: { guildId: gid } });
  const level = levels.find((l) => l.level === (state?.level ?? 0)) ?? levels[0]!;
  return { level, state, levels };
}

export interface LevelInput {
  level: number;
  name: string;
  color?: string | undefined;
  emoji?: string | undefined;
  description?: string | undefined;
  allowedRoleIds?: string[] | undefined;
}

function validate(i: LevelInput) {
  if (!Number.isInteger(i.level) || i.level < 0 || i.level > 20) throw new DangerError('invalid', 'Die Stufe muss eine ganze Zahl von 0 bis 20 sein.');
  const name = i.name.trim();
  if (!name || name.length > 40) throw new DangerError('invalid', 'Der Name fehlt oder ist zu lang (max. 40 Zeichen).');
  if (i.color && !HEX.test(i.color)) throw new DangerError('invalid', 'Die Farbe muss als #RRGGBB angegeben werden.');
  if ((i.emoji?.length ?? 0) > 16) throw new DangerError('invalid', 'Das Emoji ist zu lang.');
  if ((i.description?.length ?? 0) > 300) throw new DangerError('invalid', 'Die Beschreibung ist zu lang (max. 300 Zeichen).');
  const roles = [...new Set(i.allowedRoleIds ?? [])];
  if (roles.length > 20 || roles.some((r) => !ID.test(r))) throw new DangerError('invalid', 'Ungültige Rollenauswahl.');
  return { name, color: i.color ?? '#808080', emoji: i.emoji?.trim() || null, description: i.description?.trim() || null, allowedRoleIds: roles };
}

/** Stufe anlegen oder ändern (nur mit `danger.manage`). */
export async function saveLevel(guildId: string, input: LevelInput, actorId: string) {
  const gid = assertGuildId(guildId);
  await ensureDefaults(gid);
  const data = validate(input);
  const before = await prisma.dangerLevel.findUnique({ where: { guildId_level: { guildId: gid, level: input.level } } });
  const row = await prisma.dangerLevel.upsert({ where: { guildId_level: { guildId: gid, level: input.level } }, create: { guildId: gid, level: input.level, ...data }, update: data });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: before ? 'danger.level.updated' : 'danger.level.created', resourceType: 'DangerLevel', resourceId: row.id, ...(before ? { before: { level: before.level, name: before.name, color: before.color, emoji: before.emoji, description: before.description, allowedRoleIds: before.allowedRoleIds } as Json } : {}), after: { level: row.level, ...data } as Json, permission: 'danger.manage', result: 'success' } });
  return row;
}

export async function deleteLevel(guildId: string, level: number, actorId: string) {
  const gid = assertGuildId(guildId);
  const row = await prisma.dangerLevel.findUnique({ where: { guildId_level: { guildId: gid, level } } });
  if (!row) throw new DangerError('not-found', 'Diese Stufe gibt es nicht.');
  const state = await prisma.dangerState.findUnique({ where: { guildId: gid } });
  if ((state?.level ?? 0) === level) throw new DangerError('conflict', 'Die aktuell gesetzte Stufe lässt sich nicht löschen.');
  if ((await prisma.dangerLevel.count({ where: { guildId: gid } })) <= 2) throw new DangerError('conflict', 'Es müssen mindestens zwei Stufen bestehen bleiben.');
  await prisma.dangerLevel.delete({ where: { id: row.id } });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'danger.level.deleted', resourceType: 'DangerLevel', resourceId: row.id, before: { level: row.level, name: row.name } as Json, permission: 'danger.manage', result: 'success' } });
}

export interface SetLevelInput {
  guildId: string;
  level: number;
  actorId: string;
  /** Rollen des Handelnden (für die Rollenbeschränkung der Stufe). */
  roleIds: readonly string[];
  /** `danger.manage` bzw. Administrator: darf jede Stufe setzen. */
  override?: boolean | undefined;
  reason?: string | undefined;
  /** Zum Veröffentlichen der Statusmeldung (optional). */
  port?: DiscordPort | undefined;
}

export interface SetLevelResult {
  level: Awaited<ReturnType<typeof listLevels>>[number];
  from: number;
  published: 'edited' | 'posted' | 'none' | 'failed';
}

export async function setLevel(i: SetLevelInput): Promise<SetLevelResult> {
  const gid = assertGuildId(i.guildId);
  const { level: current, levels } = await getCurrent(gid);
  const target = levels.find((l) => l.level === i.level);
  if (!target) throw new DangerError('not-found', 'Diese Gefahrenstufe gibt es nicht.');
  if (target.allowedRoleIds.length > 0 && !i.override && !target.allowedRoleIds.some((r) => i.roleIds.includes(r)))
    throw new DangerError('forbidden', `Die Stufe „${target.name}“ dürfen nur bestimmte Rollen setzen.`);
  const reason = i.reason?.trim() || null;
  if (reason && reason.length > 300) throw new DangerError('invalid', 'Der Grund ist zu lang (max. 300 Zeichen).');
  if (current.level === target.level) throw new DangerError('conflict', `Die Stufe „${target.name}“ ist bereits aktiv.`);
  const row = await prisma.dangerState.upsert({ where: { guildId: gid }, create: { guildId: gid, level: target.level, setBy: i.actorId, reason }, update: { level: target.level, setBy: i.actorId, reason, setAt: new Date() } });
  await prisma.dangerEvent.create({ data: { guildId: gid, fromLevel: current.level, toLevel: target.level, actorId: i.actorId, reason } });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId: i.actorId, action: 'danger.level.set', resourceType: 'DangerState', resourceId: gid, before: { level: current.level, name: current.name } as Json, after: { level: target.level, name: target.name } as Json, reason, permission: 'danger.set', result: 'success' } });
  const published = i.port ? await publish(i.port, gid, target, row, i.actorId) : 'none';
  return { level: target, from: current.level, published };
}

type Level = Awaited<ReturnType<typeof listLevels>>[number];

export function statusMessage(level: Level, setBy: string | null, reason: string | null, at: Date) {
  const color = Number.parseInt(level.color.slice(1), 16);
  return {
    embeds: [{
      title: `${level.emoji ?? '⚠️'} Gefahrenstufe ${level.level} – ${level.name}`,
      description: level.description ?? undefined,
      color,
      fields: [...(reason ? [{ name: 'Grund', value: reason }] : []), ...(setBy ? [{ name: 'Gesetzt von', value: `<@${setBy}>`, inline: true }] : []), { name: 'Seit', value: `<t:${Math.floor(at.getTime() / 1000)}:f>`, inline: true }],
    }],
    allowed_mentions: { parse: [] },
  };
}

/** Aktualisiert die Statusmeldung im Kanal „danger-channel“ (bearbeitet die alte, sonst neu). Fehler brechen die Änderung nicht ab. */
async function publish(port: DiscordPort, guildId: string, level: Level, state: { channelId: string | null; messageId: string | null; setAt: Date; reason: string | null }, actorId: string): Promise<'edited' | 'posted' | 'none' | 'failed'> {
  const channelId = (await guildRepository.getSelections(guildId))['danger-channel'];
  if (!channelId) return 'none';
  const payload = statusMessage(level, actorId, state.reason, state.setAt) as never;
  try {
    if (state.channelId === channelId && state.messageId) {
      try {
        await port.editMessage(channelId, state.messageId, payload);
        return 'edited';
      } catch {
        /* Nachricht gelöscht → neu posten */
      }
    }
    const msg = await port.postMessage(channelId, payload);
    await prisma.dangerState.update({ where: { guildId }, data: { channelId, messageId: msg.id } });
    return 'posted';
  } catch {
    return 'failed';
  }
}

export const history = (guildId: string, limit = 50) => prisma.dangerEvent.findMany({ where: { guildId: assertGuildId(guildId) }, orderBy: { at: 'desc' }, take: Math.min(Math.max(limit, 1), 200) });
