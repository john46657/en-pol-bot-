import { prisma } from '@nexus/database';
import { DiscordApiError } from '@nexus/discord';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModerationError, expireDue, listCases, moderate, revoke, userSummary, type ModerationPort } from '../src/index.js';

const G = 'moderation-guild';
const [OWNER, BOT, MOD, ADMINISH, USER, USER2, GONE] = ['900000000000400001', '900000000000400002', '900000000000400003', '900000000000400004', '900000000000400005', '900000000000400006', '900000000000400007'];
const R = { mod: 'r-mod', high: 'r-high', low: 'r-low', bot: 'r-bot' };
const POS: Record<string, number> = { [R.low]: 1, [R.mod]: 5, [R.bot]: 8, [R.high]: 9 };
const members: Record<string, string[]> = { [OWNER]: [R.high], [BOT]: [R.bot], [MOD]: [R.mod], [ADMINISH]: [R.high], [USER]: [R.low], [USER2]: [R.low] };

function fake(over: Partial<ModerationPort> = {}) {
  const calls: string[] = [];
  const port: ModerationPort = {
    ownerId: async () => OWNER,
    botUserId: async () => BOT,
    memberRoleIds: async (_g, u) => members[u] ?? null,
    rolePositions: async () => new Map(Object.entries(POS)),
    timeout: vi.fn(async (_g, u, until) => void calls.push(`timeout:${u}:${until ? 'set' : 'clear'}`)),
    kick: vi.fn(async (_g, u) => void calls.push(`kick:${u}`)),
    ban: vi.fn(async (_g, u, _r, s) => void calls.push(`ban:${u}:${s}`)),
    unban: vi.fn(async (_g, u) => void calls.push(`unban:${u}`)),
    dm: vi.fn(async (u) => void calls.push(`dm:${u}`)),
    ...over,
  };
  return { port, calls };
}
const mod = { userId: MOD, roleIds: [R.mod] };
const err = async (p: Promise<unknown>, code: string, text?: RegExp) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(ModerationError);
  expect((e as ModerationError).code).toBe(code);
  if (text) expect((e as ModerationError).message).toMatch(text);
};

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Moderation', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Schutzregeln', () => {
  it('nie gegen sich selbst, den Bot, den Besitzer oder Höherrangige', async () => {
    const { port, calls } = fake();
    await err(moderate({ guildId: G, type: 'WARN', userId: MOD, reason: 'Test', actor: mod }, port), 'forbidden', /selbst/);
    await err(moderate({ guildId: G, type: 'BAN', userId: BOT, reason: 'Test', actor: mod }, port), 'forbidden', /Bot/);
    await err(moderate({ guildId: G, type: 'BAN', userId: OWNER, reason: 'Test', actor: mod }, port), 'forbidden', /Serverbesitzer/);
    await err(moderate({ guildId: G, type: 'KICK', userId: ADMINISH, reason: 'Test', actor: mod }, port), 'forbidden', /unter deiner/);
    expect(calls).toEqual([]); // nichts an Discord gesendet
    expect(await prisma.moderationCase.count({ where: { guildId: G } })).toBe(0);
  });
  it('gleicher Rang genügt nicht; der Besitzer ist ausgenommen', async () => {
    const { port } = fake();
    await err(moderate({ guildId: G, type: 'WARN', userId: ADMINISH, reason: 'Test', actor: { userId: 'x', roleIds: [R.high] } }, port), 'forbidden');
    await expect(moderate({ guildId: G, type: 'WARN', userId: ADMINISH, reason: 'Test', actor: { userId: OWNER, roleIds: [] } }, port)).resolves.toMatchObject({ type: 'WARN' });
  });
  it('Bot-Rolle muss über dem Ziel stehen (Timeout/Kick/Bann), Verwarnung nicht', async () => {
    const low = { ...members, [BOT]: [R.low] };
    const { port } = fake({ memberRoleIds: async (_g, u) => low[u] ?? null });
    await err(moderate({ guildId: G, type: 'KICK', userId: USER, reason: 'Test', actor: mod }, port), 'forbidden', /Bots/);
    await expect(moderate({ guildId: G, type: 'WARN', userId: USER, reason: 'Test', actor: mod }, port)).resolves.toBeTruthy();
  });
  it('Timeout/Kick nur für Mitglieder; Bann auch für Nicht-Mitglieder', async () => {
    const { port, calls } = fake();
    await err(moderate({ guildId: G, type: 'KICK', userId: GONE, reason: 'Test', actor: mod }, port), 'invalid', /nicht auf dem Server/);
    await err(moderate({ guildId: G, type: 'TIMEOUT', userId: GONE, reason: 'Test', durationMin: 5, actor: mod }, port), 'invalid');
    await moderate({ guildId: G, type: 'BAN', userId: GONE, reason: 'Raid', actor: mod }, port);
    expect(calls).toContain(`ban:${GONE}:0`);
  });
});

describe('Eingaben', () => {
  it('Grund Pflicht, Timeout-Dauer 1 Minute bis 28 Tage, Löschtage 0–7', async () => {
    const { port } = fake();
    await err(moderate({ guildId: G, type: 'WARN', userId: USER, reason: ' ', actor: mod }, port), 'invalid', /Grund/);
    await err(moderate({ guildId: G, type: 'WARN', userId: USER, reason: 'x'.repeat(301), actor: mod }, port), 'invalid', /zu lang/);
    await err(moderate({ guildId: G, type: 'TIMEOUT', userId: USER, reason: 'Test', actor: mod }, port), 'invalid', /Timeout/);
    await err(moderate({ guildId: G, type: 'TIMEOUT', userId: USER, reason: 'Test', durationMin: 40321, actor: mod }, port), 'invalid');
    await err(moderate({ guildId: G, type: 'BAN', userId: USER, reason: 'Test', deleteDays: 8, actor: mod }, port), 'invalid');
    await err(moderate({ guildId: G, type: 'MUTE', userId: USER, reason: 'Test', actor: mod }, port), 'invalid', /Unbekannte/);
    await err(moderate({ guildId: G, type: 'WARN', userId: 'abc', reason: 'Test', actor: mod }, port), 'invalid');
  });
});

describe('Fälle', () => {
  it('Fallnummern laufen je Server fortlaufend; Verwarnung, Kick, Bann mit DM und Audit', async () => {
    const { port, calls } = fake();
    const w = await moderate({ guildId: G, type: 'WARN', userId: USER, reason: 'Spam', actor: mod }, port);
    const k = await moderate({ guildId: G, type: 'KICK', userId: USER2, reason: 'Beleidigung', actor: mod }, port);
    const b = await moderate({ guildId: G, type: 'BAN', userId: USER, reason: 'Wiederholt', deleteDays: 1, actor: mod }, port);
    expect([w.number, k.number, b.number]).toEqual([1, 2, 3]);
    expect(k.status).toBe('DONE');
    expect(b.status).toBe('ACTIVE');
    expect(calls).toEqual([`dm:${USER}`, `dm:${USER2}`, `kick:${USER2}`, `dm:${USER}`, `ban:${USER}:86400`]); // DM vor Kick/Bann
    expect(w.dmDelivered).toBe(true);
    const a = await prisma.auditLog.findMany({ where: { guildId: G, action: { startsWith: 'moderation.' } }, orderBy: { createdAt: 'asc' } });
    expect(a.map((x) => x.action)).toEqual(['moderation.warn', 'moderation.kick', 'moderation.ban']);
    expect(a[0]).toMatchObject({ actorId: MOD, reason: 'Spam', result: 'success' });
    await err(moderate({ guildId: G, type: 'BAN', userId: USER, reason: 'Nochmal', actor: mod }, port), 'conflict', /bereits gebannt/);
  });
  it('geschlossene DMs verhindern die Maßnahme nicht und werden festgehalten', async () => {
    const { port } = fake({ dm: async () => { throw new Error('DMs zu'); } });
    const c = await moderate({ guildId: G, type: 'WARN', userId: USER, reason: 'Test', actor: mod }, port);
    expect(c.dmDelivered).toBe(false);
  });
  it('Timeout: Dauer, Ende, neuer Timeout ersetzt den alten, Ablauf wird nachgezogen', async () => {
    const { port } = fake();
    const t0 = new Date('2026-10-05T12:00:00Z');
    const a = await moderate({ guildId: G, type: 'TIMEOUT', userId: USER, reason: 'Ruhe', durationMin: 60, actor: mod }, port, t0);
    expect(a.expiresAt?.toISOString()).toBe('2026-10-05T13:00:00.000Z');
    const b = await moderate({ guildId: G, type: 'TIMEOUT', userId: USER, reason: 'Länger', durationMin: 120, actor: mod }, port, t0);
    expect((await prisma.moderationCase.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('REVOKED');
    expect(b.status).toBe('ACTIVE');
    expect((await expireDue(G, new Date('2026-10-05T15:00:00Z'))).expired).toBe(1);
    expect((await listCases({ guildId: G, userId: USER, type: 'TIMEOUT' })).map((c) => c.status)).toEqual(['EXPIRED', 'REVOKED']);
  });
  it('Fehlschlag bei Discord: kein Fall, Audit „failed“, verständliche Meldung', async () => {
    const { port } = fake({ kick: async () => { throw new DiscordApiError(403, 'Missing Permissions'); } });
    await err(moderate({ guildId: G, type: 'KICK', userId: USER, reason: 'Test', actor: mod }, port), 'discord', /Rolle steht zu niedrig/);
    expect(await prisma.moderationCase.count({ where: { guildId: G } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'moderation.kick', result: 'failed' } })).toBe(1);
  });
});

describe('Aufheben', () => {
  it('Bann aufheben = Unban, Timeout aufheben = Timeout entfernen, Verwarnung zurücknehmen', async () => {
    const { port, calls } = fake();
    const b = await moderate({ guildId: G, type: 'BAN', userId: USER, reason: 'Test', actor: mod }, port);
    const t = await moderate({ guildId: G, type: 'TIMEOUT', userId: USER2, reason: 'Test', durationMin: 30, actor: mod }, port);
    const w = await moderate({ guildId: G, type: 'WARN', userId: USER2, reason: 'Test', actor: mod }, port);
    await err(revoke(G, b.id, '', mod, port), 'invalid', /Grund/);
    await revoke(G, b.id, 'Irrtum', mod, port);
    await revoke(G, t.id, 'Entschuldigt', mod, port);
    await revoke(G, w.id, 'Zu hart', mod, port);
    expect(calls).toContain(`unban:${USER}`);
    expect(calls).toContain(`timeout:${USER2}:clear`);
    expect((await prisma.moderationCase.findUniqueOrThrow({ where: { id: b.id } }))).toMatchObject({ status: 'REVOKED', revokedBy: MOD, revokeReason: 'Irrtum' });
    await err(revoke(G, b.id, 'Nochmal', mod, port), 'conflict', /bereits beendet/);
    expect((await userSummary(G, USER2)).warns).toBe(0);
  });
  it('Kick nicht aufhebbar, unbekannter Fall, nicht gegen sich selbst', async () => {
    const { port } = fake();
    const k = await moderate({ guildId: G, type: 'KICK', userId: USER, reason: 'Test', actor: mod }, port);
    await err(revoke(G, k.id, 'Doch nicht', mod, port), 'invalid', /Kick/);
    await err(revoke(G, 'gibtesnicht', 'Test', mod, port), 'not-found');
    const w = await moderate({ guildId: G, type: 'WARN', userId: USER, reason: 'Test', actor: { userId: OWNER, roleIds: [] } }, port);
    await err(revoke(G, w.id, 'Test', { userId: USER, roleIds: [] }, port), 'forbidden', /selbst/);
  });
  it('Discord-Fehler beim Unban lässt den Fall aktiv', async () => {
    const ok = fake();
    const b = await moderate({ guildId: G, type: 'BAN', userId: USER, reason: 'Test', actor: mod }, ok.port);
    const bad = fake({ unban: async () => { throw new DiscordApiError(403, 'x'); } });
    await err(revoke(G, b.id, 'Test', mod, bad.port), 'discord');
    expect((await prisma.moderationCase.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('ACTIVE');
  });
});

describe('Zusammenfassung', () => {
  it('zählt aktive Verwarnungen, Timeouts, Kicks und Bann', async () => {
    const { port } = fake();
    await moderate({ guildId: G, type: 'WARN', userId: USER, reason: 'Eins', actor: mod }, port);
    await moderate({ guildId: G, type: 'WARN', userId: USER, reason: 'Zwei', actor: mod }, port);
    await moderate({ guildId: G, type: 'BAN', userId: USER, reason: 'Drei', actor: mod }, port);
    expect(await userSummary(G, USER)).toMatchObject({ warns: 2, banned: true });
  });
});
