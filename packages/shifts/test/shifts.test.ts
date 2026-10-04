import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ShiftError,
  correctShift,
  deleteType,
  endShift,
  getOpenShift,
  listShifts,
  pauseShift,
  rawData,
  resumeShift,
  saveType,
  shiftStats,
  startShift,
  toCsv,
  usableTypes,
  watchOverlongShifts,
} from '../src/index.js';

const G = 'shifttest-guild';
const U1 = '900000000000010001';
const U2 = '900000000000010002';
const BOSS = '900000000000010999';
const ROLE = '900000000000020001';
const min = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

let typeId = '';
beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Schicht-Test', settings: { create: {} } } });
  typeId = (await saveType(G, { name: 'Streife', maxDurationMinutes: 60 }, BOSS)).id;
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

const expectErr = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toSatisfy((e) => e instanceof ShiftError && e.code === code);
};

describe('Typen', () => {
  it('Rollenanforderung filtert nutzbare Typen und blockiert Start', async () => {
    const sek = await saveType(G, { name: 'SEK', requiredRoleIds: [ROLE] }, BOSS);
    expect((await usableTypes(G, [])).map((t) => t.name)).toEqual(['Streife']);
    expect((await usableTypes(G, [ROLE])).map((t) => t.name).sort()).toEqual(['SEK', 'Streife']);
    await expectErr(startShift({ guildId: G, userId: U1, typeId: sek.id, memberRoleIds: [] }), 'forbidden');
    expect((await startShift({ guildId: G, userId: U1, typeId: sek.id, memberRoleIds: [ROLE] })).status).toBe('ACTIVE');
  });
  it('Validierung, Duplikate, Löschschutz', async () => {
    await expectErr(saveType(G, { name: ' ' }, BOSS), 'invalid');
    await expectErr(saveType(G, { name: 'Streife' }, BOSS), 'conflict');
    await expectErr(saveType(G, { name: 'X', maxDurationMinutes: 1 }, BOSS), 'invalid');
    await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] });
    await expectErr(deleteType(G, typeId, BOSS), 'conflict');
  });
  it('deaktivierter Typ lässt sich nicht starten', async () => {
    await saveType(G, { id: typeId, name: 'Streife', active: false }, BOSS);
    await expectErr(startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }), 'invalid');
  });
});

describe('Ablauf', () => {
  it('Start/Pause/Fortsetzen/Ende mit korrekter Nettodauer', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const s = await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    await pauseShift(G, U1, min(t0, 20));
    await expectErr(pauseShift(G, U1, min(t0, 21)), 'conflict');
    await resumeShift(G, U1, min(t0, 30));
    await expectErr(resumeShift(G, U1, min(t0, 31)), 'conflict');
    const done = await endShift(G, s.id, { actorId: U1 }, min(t0, 50));
    expect(done.status).toBe('ENDED');
    expect(done.pausedSeconds).toBe(600);
    expect(done.durationSeconds).toBe(40 * 60);
    expect(await getOpenShift(G, U1)).toBeNull();
    const ev = await prisma.shiftEvent.findMany({ where: { shiftId: s.id }, orderBy: { at: 'asc' } });
    expect(ev.map((e) => e.type)).toEqual(['start', 'pause', 'resume', 'end']);
  });
  it('Ende während Pause zählt Pause mit', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const s = await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    await pauseShift(G, U1, min(t0, 10));
    const done = await endShift(G, s.id, { actorId: U1 }, min(t0, 30));
    expect(done.durationSeconds).toBe(10 * 60);
  });
  it('nur eine offene Schicht – auch bei parallelem Start', async () => {
    const r = await Promise.allSettled(Array.from({ length: 5 }, () => startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] })));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.shift.count({ where: { guildId: G, userId: U1 } })).toBe(1);
  });
  it('paralleles Beenden: genau einer gewinnt; danach neue Schicht möglich', async () => {
    const s = await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] });
    const r = await Promise.allSettled([endShift(G, s.id, { actorId: U1 }), endShift(G, s.id, { actorId: U1 })]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] })).status).toBe('ACTIVE');
  });
  it('fremde Schicht beenden: nur als Führungskraft und mit Begründung', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const s = await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    await expectErr(endShift(G, s.id, { actorId: U2 }, min(t0, 5)), 'forbidden');
    await expectErr(endShift(G, s.id, { actorId: BOSS, supervisor: true }, min(t0, 5)), 'invalid');
    const done = await endShift(G, s.id, { actorId: BOSS, supervisor: true, endedAt: min(t0, 45), reason: 'Dienstende vergessen' }, min(t0, 300));
    expect(done.durationSeconds).toBe(45 * 60);
    expect(done.endedBy).toBe(BOSS);
    const audit = await prisma.auditLog.findFirst({ where: { guildId: G, action: 'shift.ended_by_supervisor' } });
    expect(audit?.reason).toBe('Dienstende vergessen');
  });
  it('Ende vor Beginn / in der Zukunft abgelehnt', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const s = await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    await expectErr(endShift(G, s.id, { actorId: BOSS, supervisor: true, endedAt: min(t0, -5), reason: 'test' }, min(t0, 10)), 'invalid');
    await expectErr(endShift(G, s.id, { actorId: BOSS, supervisor: true, endedAt: min(t0, 500), reason: 'test' }, min(t0, 10)), 'invalid');
  });
});

describe('Korrektur', () => {
  it('protokolliert Vorher/Nachher und berechnet Dauer neu', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const s = await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    await endShift(G, s.id, { actorId: U1 }, min(t0, 60));
    await expectErr(correctShift(G, s.id, { endedAt: min(t0, 30) }, '', BOSS), 'invalid');
    await expectErr(correctShift(G, s.id, {}, 'nix', BOSS), 'invalid');
    const c = await correctShift(G, s.id, { endedAt: min(t0, 30), pausedSeconds: 300 }, 'Falsch eingetragen', BOSS, 'shifts.manage');
    expect(c.durationSeconds).toBe(25 * 60);
    expect(c.endReason).toBe('corrected');
    const a = await prisma.auditLog.findFirst({ where: { guildId: G, action: 'shift.corrected' } });
    expect((a?.before as any).netSeconds).toBe(3600);
    expect((a?.after as any).netSeconds).toBe(1500);
    expect(a?.permission).toBe('shifts.manage');
  });
  it('laufende Schicht nicht korrigierbar; unmögliche Werte abgelehnt', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    const s = await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    await expectErr(correctShift(G, s.id, { pausedSeconds: 5 }, 'grund', BOSS), 'conflict');
    await endShift(G, s.id, { actorId: U1 }, min(t0, 10));
    await expectErr(correctShift(G, s.id, { pausedSeconds: 99999 }, 'grund', BOSS), 'invalid');
  });
});

describe('Historie, Statistik, Export', () => {
  it('Anzahl, Gesamt, Durchschnitt, Filter, Teamgrenze', async () => {
    const team = await prisma.team.create({ data: { guildId: G, name: 'Team A' } });
    await prisma.personnelRecord.create({ data: { guildId: G, userId: U1, rpName: 'Eins', teamId: team.id } });
    const base = new Date('2026-01-01T10:00:00Z');
    for (const [u, m] of [[U1, 30], [U1, 90], [U2, 60]] as const) {
      const s = await startShift({ guildId: G, userId: u, typeId, memberRoleIds: [] }, base);
      await endShift(G, s.id, { actorId: u }, min(base, m));
    }
    expect(await shiftStats({ guildId: G })).toMatchObject({ count: 3, totalSeconds: 180 * 60, averageSeconds: 60 * 60, running: 0 });
    expect(await shiftStats({ guildId: G, userId: U1 })).toMatchObject({ count: 2, totalSeconds: 120 * 60, averageSeconds: 60 * 60 });
    const scoped = await shiftStats({ guildId: G, restrictToTeams: [team.id] });
    expect(scoped.count).toBe(2);
    expect((await listShifts({ guildId: G, userId: U2, restrictToTeams: [team.id] })).items).toHaveLength(0);
    const page1 = await listShifts({ guildId: G, limit: 2 });
    expect(page1.items).toHaveLength(2);
    const page2 = await listShifts({ guildId: G, limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });
  it('CSV maskiert Formeln und Sonderzeichen', async () => {
    const odd = await saveType(G, { name: '=HYPERLINK("x")' }, BOSS);
    const s = await startShift({ guildId: G, userId: U1, typeId: odd.id, memberRoleIds: [] });
    await endShift(G, s.id, { actorId: U1 });
    const csv = toCsv(await rawData({ guildId: G }));
    expect(csv.split('\n')[0]).toContain('nettoSekunden');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('Überlange Schichten', () => {
  const port = (opts: { fail?: boolean } = {}) => {
    const posts: any[] = [];
    const dms: any[] = [];
    return {
      posts,
      dms,
      sendDm: async (u: string, p: any) => {
        if (opts.fail) throw new Error('dm closed');
        dms.push({ u, p });
      },
      postMessage: async (c: string, p: any) => {
        if (opts.fail) throw new Error('nope');
        posts.push({ c, p });
        return { id: '1' };
      },
      editMessage: async () => {},
      roleDriver: () => ({}) as never,
    };
  };
  it('markiert einmalig, benachrichtigt Kanal und Mitglied, beendet nichts', async () => {
    await prisma.guildSettings.update({ where: { guildId: G }, data: { data: { selections: { 'shift-alert-channel': '900000000000030001' } } } });
    const t0 = new Date('2026-01-01T10:00:00Z');
    const s = await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    const p = port();
    expect((await watchOverlongShifts(p as never, min(t0, 30))).flagged).toHaveLength(0);
    const r = await watchOverlongShifts(p as never, min(t0, 90));
    expect(r.flagged).toEqual([{ shiftId: s.id, userId: U1, notified: true, dmDelivered: true }]);
    expect(p.posts[0].p.content).toContain(`<@${U1}>`);
    expect(p.dms).toHaveLength(1);
    expect((await watchOverlongShifts(p as never, min(t0, 120))).flagged).toHaveLength(0);
    expect((await getOpenShift(G, U1))?.status).toBe('ACTIVE');
    const a = await prisma.auditLog.findFirst({ where: { guildId: G, action: 'shift.flagged_overlong' } });
    expect(a?.result).toBe('success');
  });
  it('meldet Fehlschlag ehrlich, wenn nichts zugestellt werden kann', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    const r = await watchOverlongShifts(port({ fail: true }) as never, min(t0, 90));
    expect(r.flagged[0]).toMatchObject({ notified: false, dmDelivered: false });
    const a = await prisma.auditLog.findFirst({ where: { guildId: G, action: 'shift.flagged_overlong' } });
    expect(a?.result).toBe('failed');
  });
  it('Überlänge zählt Wanduhrzeit – eine vergessene Pause verdeckt sie nicht', async () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, t0);
    await pauseShift(G, U1, min(t0, 5));
    const r = await watchOverlongShifts(port() as never, min(t0, 90));
    expect(r.checked).toBe(1);
    expect(r.flagged).toHaveLength(1);
  });
});

describe('Abmeldung sperrt den Dienstbeginn', () => {
  it('genehmigte laufende Abmeldung verhindert den Start; danach/ohne nicht', async () => {
    const now = new Date('2026-10-07T10:00:00Z');
    await prisma.absence.create({ data: { guildId: G, number: 1, userId: U1, startDate: new Date('2026-10-06T00:00:00Z'), endDate: new Date('2026-10-09T00:00:00Z'), category: 'URLAUB', reason: 'Urlaub', status: 'APPROVED' } });
    await expectErr(startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, now), 'conflict');
    await expect(startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, now)).rejects.toThrow(/abgemeldet/);
    await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, new Date('2026-10-10T10:00:00Z')); // nach Ende
    await startShift({ guildId: G, userId: U2, typeId, memberRoleIds: [] }, now); // andere Person
  });
  it('offene (nicht genehmigte) Abmeldung sperrt nicht', async () => {
    await prisma.absence.create({ data: { guildId: G, number: 2, userId: U1, startDate: new Date('2026-10-06T00:00:00Z'), endDate: new Date('2026-10-09T00:00:00Z'), category: 'URLAUB', reason: 'Urlaub', status: 'PENDING' } });
    await startShift({ guildId: G, userId: U1, typeId, memberRoleIds: [] }, new Date('2026-10-07T10:00:00Z'));
  });
});

describe('Teamzustand und Schichtstart (Phase 48)', () => {
  const start = (u = U1) => startShift({ guildId: G, userId: u, typeId, memberRoleIds: [] }, new Date('2026-10-07T10:00:00Z'));
  it('suspendiert oder geschlossen: keine Schicht; Pause/außer Dienst/aktiv: möglich', async () => {
    const rec = await prisma.personnelRecord.create({ data: { guildId: G, userId: U1, rpName: 'Eins' } });
    await prisma.personnelRecord.update({ where: { id: rec.id }, data: { teamState: 'SUSPENDED' } });
    await expect(start()).rejects.toMatchObject({ code: 'conflict' });
    await prisma.personnelRecord.update({ where: { id: rec.id }, data: { teamState: 'ACTIVE', status: 'ARCHIVED' } });
    await expect(start()).rejects.toMatchObject({ code: 'conflict' });
    expect(await prisma.shift.count({ where: { guildId: G } })).toBe(0);
    await prisma.personnelRecord.update({ where: { id: rec.id }, data: { status: 'ACTIVE', teamState: 'PAUSE' } });
    const s = await start();
    await endShift(G, s.id, { actorId: U1 }, new Date('2026-10-07T11:00:00Z'));
    await start(U2); // ohne Akte weiterhin möglich
  });
});
