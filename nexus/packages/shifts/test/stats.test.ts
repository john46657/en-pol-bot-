import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { leaderboard, overview, periodRange, rankOf, saveType } from '../src/index.js';

const G = 'statstest-guild';
const [A, B, C] = ['900000000000030001', '900000000000030002', '900000000000030003'];
const NOW = new Date('2026-10-07T10:00:00Z'); // Mittwoch, 12:00 Berlin (MESZ)
let typeId = '';

const add = (userId: string, startedAt: string, netSeconds: number, status: 'ENDED' | 'ACTIVE' = 'ENDED') =>
  prisma.shift.create({
    data: { guildId: G, userId, typeId, startedAt: new Date(startedAt), status, openKey: status === 'ACTIVE' ? 'open' : null, ...(status === 'ENDED' ? { endedAt: new Date(new Date(startedAt).getTime() + netSeconds * 1000), durationSeconds: netSeconds } : {}) },
  });

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Stats', settings: { create: {} } } });
  typeId = (await saveType(G, { name: 'Streife' }, 'x')).id;
  await add(A, '2026-10-07T08:00:00Z', 3600); // heute
  await add(A, '2026-10-06T08:00:00Z', 7200); // diese Woche (Di)
  await add(A, '2026-10-01T08:00:00Z', 1800); // dieser Monat, andere Woche
  await add(A, '2026-09-30T22:30:00Z', 600); // = 01.10. 00:30 Berlin → Oktober (UTC noch September)
  await add(A, '2026-09-15T08:00:00Z', 5400); // Vormonat
  await add(B, '2026-10-07T07:00:00Z', 4000); // heute
  await add(B, '2026-10-07T09:00:00Z', 200, 'ACTIVE'); // läuft → zählt nicht
  await add(C, '2026-10-05T00:00:00Z', 900); // Mo 02:00 Berlin → Woche
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Zeiträume', () => {
  it('Tag/Woche/Monat in Berlin-Zeit (Woche ab Montag), auch über Zeitumstellung', () => {
    const d = periodRange('day', NOW);
    expect(d.from?.toISOString()).toBe('2026-10-06T22:00:00.000Z');
    expect(d.to?.toISOString()).toBe('2026-10-07T22:00:00.000Z');
    expect(periodRange('week', NOW).from?.toISOString()).toBe('2026-10-04T22:00:00.000Z');
    expect(periodRange('month', NOW).from?.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    // Winterzeit-Umstellung am 25.10.2026: Tag hat 25 Stunden
    const t = periodRange('day', new Date('2026-10-25T12:00:00Z'));
    expect((t.to!.getTime() - t.from!.getTime()) / 3600_000).toBe(25);
    expect(periodRange('all', NOW)).toEqual({ from: undefined, to: undefined });
  });
});

describe('Statistik stimmt mit den gespeicherten Schichten überein', () => {
  it('Übersicht Mitglied A', async () => {
    const o = Object.fromEntries((await overview({ guildId: G, now: NOW }, A)).map((p) => [p.period, p]));
    expect(o['day']).toMatchObject({ count: 1, totalSeconds: 3600, averageSeconds: 3600 });
    expect(o['week']).toMatchObject({ count: 2, totalSeconds: 10800, averageSeconds: 5400 });
    expect(o['month']).toMatchObject({ count: 4, totalSeconds: 13200 });
    expect(o['all']).toMatchObject({ count: 5, totalSeconds: 18600, averageSeconds: 3720 });
  });
  it('Server-Übersicht ohne laufende Schichten', async () => {
    const o = Object.fromEntries((await overview({ guildId: G, now: NOW })).map((p) => [p.period, p]));
    expect(o['day']).toMatchObject({ count: 2, totalSeconds: 7600 });
    expect(o['all']).toMatchObject({ count: 7, totalSeconds: 18600 + 4000 + 900 });
  });
  it('Leaderboard sortiert nach Gesamtzeit, Plätze und Durchschnitt', async () => {
    const lb = await leaderboard({ guildId: G, period: 'week', now: NOW });
    expect(lb.map((e) => [e.rank, e.userId, e.totalSeconds, e.count])).toEqual([
      [1, A, 10800, 2],
      [2, B, 4000, 1],
      [3, C, 900, 1],
    ]);
    expect(lb[0]!.userId).toBe(A);
    expect(lb[0]!.averageSeconds).toBe(5400);
  });
  it('Gleichstand: mehr Schichten zuerst; rankOf auch außerhalb der Top-N', async () => {
    expect(await rankOf({ guildId: G, period: 'all', now: NOW }, A)).toBe(1);
    expect(await rankOf({ guildId: G, period: 'day', now: NOW }, C)).toBeNull();
    expect(await rankOf({ guildId: G, period: 'day', now: NOW }, B)).toBe(1);
  });
  it('Team-Beschränkung filtert Mitglieder', async () => {
    const team = await prisma.team.create({ data: { guildId: G, name: 'T' } });
    await prisma.personnelRecord.create({ data: { guildId: G, userId: C, rpName: 'C', teamId: team.id } });
    const lb = await leaderboard({ guildId: G, period: 'all', now: NOW, restrictToTeams: [team.id] });
    expect(lb.map((e) => e.userId)).toEqual([C]);
  });
});
