import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { WeeklyResetService } from '../src/duty/weekly-reset';

// Woche mit der Winterzeit-Umstellung 2030: Mo 21.10. 00:00 MESZ bis Mo 28.10. 00:00 MEZ (169 Stunden)
const W1 = new Date('2030-10-20T22:00:00Z'), W2 = new Date('2030-10-27T23:00:00Z');
const H = 3_600_000;
const D = '650000000000000777', CH = '650000000000000888';
let app: INestApplication; let prisma: PrismaService; let svc: WeeklyResetService; let a: string; let b: string;
const posts = async () => (await prisma.discordOutbox.findMany({ where: { type: 'message.post' } })).filter((o) => String((o.payload as { stateKey?: string }).stateKey).startsWith('week-rank-2030'));

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  svc = app.get(WeeklyResetService);
  a = (await makeUser(prisma, 'wr_a', ['Police Member'])).id;
  b = (await makeUser(prisma, 'wr_b', ['Police Member'])).id;
  await makeUser(prisma, 'wr_admin', ['System Administrator']);
  await prisma.discordLink.create({ data: { userId: a, discordId: D } });
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['duty.weeklyReset', 'duty.weeklyReset.state'] } } });
  await app.close();
});

describe('automatischer Wochen-Reset (Montag 00:00 Europe/Berlin)', () => {
  it('Einstellungen dauerhaft; nur settings.manage darf sie ändern', async () => {
    const off = (await login(app, 'wr_a')).agent, admin = (await login(app, 'wr_admin')).agent;
    expect((await off.get('/api/v1/team/week/config')).body).toEqual({ scope: 'global', enabled: true, channelId: null, topN: 10, mention: true });
    expect((await off.put('/api/v1/team/week/config').send({ enabled: false })).status).toBe(403);
    expect((await admin.put('/api/v1/team/week/config').send({ enabled: true, channelId: CH, topN: 5, mention: true })).body).toMatchObject({ channelId: CH, topN: 5 });
    expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'duty.weeklyReset' } })).value).toMatchObject({ channelId: CH, topN: 5 });
  });

  it('archiviert die Woche, veröffentlicht die Rangliste einmal, setzt danach nur den Zähler zurück', async () => {
    await prisma.systemSetting.deleteMany({ where: { key: 'duty.weeklyReset.state' } });
    expect(await svc.tick(new Date(W1.getTime() + 2 * H), ['global'])).toEqual({ archived: [], posted: 0 }); // erster Start: Zähler ab dieser Woche
    const sessions = await prisma.dutySession.createManyAndReturn({ data: [
      { userId: a, status: 'ON_DUTY', startedAt: new Date(W1.getTime() + 10 * H), endedAt: new Date(W1.getTime() + 13 * H) },
      { userId: a, status: 'BREAK', startedAt: new Date(W1.getTime() + 13 * H), endedAt: new Date(W1.getTime() + 14 * H) },
      { userId: b, status: 'ON_DUTY', startedAt: new Date(W2.getTime() - 1 * H), endedAt: new Date(W2.getTime() + 2 * H) }, // über Mitternacht
    ] });
    expect((await svc.current(new Date(W2.getTime() - 60_000))).nextResetAt?.toISOString()).toBe(W2.toISOString());
    expect((await svc.tick(new Date(W2.getTime() - 60_000), ['global'])).archived).toEqual([]); // So 23:59 – noch nicht
    // zwei Instanzen gleichzeitig → genau ein Archiv, eine Discord-Nachricht
    const [r1, r2] = await Promise.all([svc.tick(new Date(W2.getTime() + 30_000), ['global']), svc.tick(new Date(W2.getTime() + 31_000), ['global'])]);
    expect([...r1.archived, ...r2.archived]).toEqual(['2030-10-21']);
    expect(r1.posted + r2.posted).toBe(1);
    const arch = await prisma.dutyWeekArchive.findUniqueOrThrow({ where: { scope_weekStart: { scope: 'global', weekStart: W1 } } });
    expect(arch).toMatchObject({ weekEnd: W2, weekKey: '2030-10-21', label: 'KW 43/2030 · 21.10.–27.10.2030', timezone: 'Europe/Berlin', discordChannelId: CH, catchUp: false });
    // (offene Schichten aus anderen Testdateien laufen ebenfalls mit – daher nur die eigenen Testbenutzer prüfen)
    const mine = (arch.ranking as { userId: string; minutes: number; breakMinutes: number }[]).filter((r) => r.userId === a || r.userId === b);
    expect(mine.map((r) => [r.userId, r.minutes, r.breakMinutes])).toEqual([[a, 180, 60], [b, 60, 0]]);
    expect((arch.sessions as { userId: string }[]).filter((x) => x.userId === a || x.userId === b)).toHaveLength(3);
    const p = await posts();
    expect(p).toHaveLength(1);
    expect(p[0]!.payload).toMatchObject({ channelId: CH, stateKey: 'week-rank-2030-10-21', forceNew: false });
    expect(JSON.stringify(p[0]!.payload)).toContain(`<@${D}>`);
    // Neustart / erneuter Lauf: nichts doppelt
    expect(await svc.tick(new Date(W2.getTime() + 5 * 60_000), ['global'])).toEqual({ archived: [], posted: 0 });
    expect(await posts()).toHaveLength(1);
    // Schichten bleiben unverändert erhalten; neue Woche zählt ab Montag 00:00
    expect(await prisma.dutySession.count({ where: { id: { in: sessions.map((s) => s.id) } } })).toBe(3);
    const cur = await svc.current(new Date(W2.getTime() + 3 * H));
    expect(cur.weekStart.toISOString()).toBe(W2.toISOString());
    expect(cur.nextResetAt?.toISOString()).toBe('2030-11-03T23:00:00.000Z');
    expect(cur.users.filter((u) => u.userId === a || u.userId === b).map((u) => [u.userId, u.minutes])).toEqual([[b, 120]]);
  });

  it('holt verpasste Resets nach einem Neustart nach – ältere Wochen still, nur die letzte in Discord', async () => {
    const r = await svc.tick(new Date('2030-11-20T12:00:00Z'), ['global']); // Bot war drei Wochenwechsel aus
    expect(r).toEqual({ archived: ['2030-10-28', '2030-11-04', '2030-11-11'], posted: 1 });
    const weeks = await prisma.dutyWeekArchive.findMany({ where: { weekKey: { in: r.archived } }, orderBy: { weekStart: 'asc' } });
    expect(weeks.map((w) => [w.discordChannelId, w.catchUp])).toEqual([[null, true], [null, true], [CH, true]]);
    expect((await posts()).map((o) => (o.payload as { stateKey: string }).stateKey).sort()).toEqual(['week-rank-2030-10-21', 'week-rank-2030-11-11']);
    expect((await svc.tick(new Date('2030-11-20T12:01:00Z'), ['global'])).archived).toEqual([]);
  });

  it('Wochenarchive sind unlöschbar und unveränderlich; Abruf im Dashboard', async () => {
    const arch = await prisma.dutyWeekArchive.findUniqueOrThrow({ where: { scope_weekStart: { scope: 'global', weekStart: W1 } } });
    await expect(prisma.dutyWeekArchive.delete({ where: { id: arch.id } })).rejects.toThrow();
    await expect(prisma.dutyWeekArchive.update({ where: { id: arch.id }, data: { totalMinutes: 0 } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE "DutyWeekArchive"')).rejects.toThrow();
    const off = (await login(app, 'wr_a')).agent, admin = (await login(app, 'wr_admin')).agent;
    const list = (await off.get('/api/v1/team/week/archives')).body as { id: string; weekKey: string }[];
    expect(list.map((x) => x.weekKey)).toEqual(expect.arrayContaining(['2030-10-21', '2030-11-11']));
    expect((await off.get(`/api/v1/team/week/archives/${arch.id}`)).status).toBe(403);
    expect((await admin.get(`/api/v1/team/week/archives/${arch.id}`)).body.sessions.filter((x: { userId: string }) => x.userId === a || x.userId === b)).toHaveLength(3);
    const week = (await off.get('/api/v1/team/week')).body;
    expect(week).toMatchObject({ enabled: true, timezone: 'Europe/Berlin', weekKey: '2030-11-18' });
    expect(week.nextResetAt).toBe('2030-11-24T23:00:00.000Z');
  });

  it('ausgeschaltet: kein Reset', async () => {
    const admin = (await login(app, 'wr_admin')).agent;
    await admin.put('/api/v1/team/week/config').send({ enabled: false, channelId: CH, topN: 5, mention: true });
    expect(await svc.tick(new Date('2030-12-20T12:00:00Z'), ['global'])).toEqual({ archived: [], posted: 0 });
    expect((await admin.get('/api/v1/team/week')).body).toMatchObject({ enabled: false, nextResetAt: null });
  });
});
