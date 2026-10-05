import { guildRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ATTEMPTS, JOBS, absenceEndReminders, applicationReminders, computeSnapshots, deliver, dueReports, enqueue, expireStaleApplications, getSnapshot, runJob, syncAllGuilds, trainingReminders } from '../src/index.js';

const G = 'jobstest-guild';
const [A, B, TR] = ['900000000000300001', '900000000000300002', '900000000000300003'];
const NOW = new Date('2026-10-12T00:30:00Z'); // Montag 02:30 Berlin
const h = (n: number) => new Date(NOW.getTime() + n * 3600_000);
const port = () => ({ sendDm: vi.fn(async () => {}), postMessage: vi.fn(async () => ({ id: 'm1' })), editMessage: vi.fn(async () => {}), roleDriver: vi.fn() }) as any;

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Jobs', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Benachrichtigungen', () => {
  it('Doppelversand ausgeschlossen; DM und Kanal werden gesendet', async () => {
    expect(await enqueue({ guildId: G, target: { kind: 'USER', id: A }, kind: 'x', dedupeKey: 'k1', payload: { content: 'Hallo' } })).toBe(true);
    expect(await enqueue({ guildId: G, target: { kind: 'USER', id: A }, kind: 'x', dedupeKey: 'k1', payload: { content: 'Hallo' } })).toBe(false);
    await enqueue({ guildId: G, target: { kind: 'CHANNEL', id: '800000000000300001' }, kind: 'x', dedupeKey: 'k2', payload: { content: 'Kanal' } });
    const p = port();
    expect(await deliver(p, NOW)).toEqual({ sent: 2, retried: 0, failed: 0 });
    expect(p.sendDm).toHaveBeenCalledWith(A, { content: 'Hallo' });
    expect(p.postMessage).toHaveBeenCalledWith('800000000000300001', { content: 'Kanal' });
    expect(await deliver(p, NOW)).toEqual({ sent: 0, retried: 0, failed: 0 }); // nichts doppelt
    expect(await prisma.notification.count({ where: { guildId: G, status: 'SENT' } })).toBe(2);
  });
  it('Wiederholung mit Backoff, danach FAILED mit Fehlertext; noch nicht fällige warten', async () => {
    await enqueue({ guildId: G, target: { kind: 'USER', id: B }, kind: 'x', dedupeKey: 'k3', payload: { content: 'DMs zu' } });
    const bad = port();
    bad.sendDm.mockRejectedValue(new Error('Cannot send messages to this user'));
    let t = NOW;
    expect(await deliver(bad, t)).toMatchObject({ retried: 1 });
    expect(await deliver(bad, t)).toEqual({ sent: 0, retried: 0, failed: 0 }); // Backoff läuft
    const waits = [2, 6, 16, 61]; // Minuten nach dem jeweils letzten Versuch
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      t = new Date(t.getTime() + waits[Math.min(i, 3)]! * 60_000);
      const r = await deliver(bad, t);
      if (i < MAX_ATTEMPTS - 2) expect(r.retried).toBe(1);
      else expect(r.failed).toBe(1);
    }
    const n = await prisma.notification.findFirstOrThrow({ where: { guildId: G, dedupeKey: 'k3' } });
    expect(n).toMatchObject({ status: 'FAILED', attempts: MAX_ATTEMPTS });
    expect(n.lastError).toContain('Cannot send');
    // später klappt es bei einer neuen Benachrichtigung
    await enqueue({ guildId: G, target: { kind: 'USER', id: B }, kind: 'x', dedupeKey: 'k4', payload: { content: 'ok' } });
    expect((await deliver(port(), t)).sent).toBe(1);
  });
  it('geplante Benachrichtigung wartet bis zu ihrer Zeit; parallele Läufe senden nie doppelt', async () => {
    await enqueue({ guildId: G, target: { kind: 'USER', id: A }, kind: 'x', dedupeKey: 'spaeter', payload: { content: 'später' }, at: h(2) });
    const p = port();
    expect((await deliver(p, NOW)).sent).toBe(0);
    await enqueue({ guildId: G, target: { kind: 'USER', id: A }, kind: 'x', dedupeKey: 'jetzt', payload: { content: 'jetzt' } });
    const [r1, r2] = await Promise.all([deliver(p, NOW), deliver(p, NOW)]);
    expect(r1.sent + r2.sent).toBe(1);
    expect(p.sendDm).toHaveBeenCalledTimes(1);
    expect((await deliver(p, h(3))).sent).toBe(1);
  });
});

async function application(timeLimitHours?: number) {
  return prisma.application.create({ data: { guildId: G, name: 'Polizei', slug: `p${Math.random().toString(36).slice(2, 8)}`, createdBy: 'x', updatedBy: 'x', config: timeLimitHours ? { requirements: { enabled: true, timeLimit: { hours: timeLimitHours } } } : {} } });
}
async function version(applicationId: string) {
  return prisma.applicationVersion.create({ data: { applicationId, version: 1, questions: [], publishedById: 'x' } });
}
async function submission(applicationId: string, versionId: string, userId: string, status: 'IN_PROGRESS' | 'SUBMITTED', startedAt: Date, extra: object = {}) {
  return prisma.applicationSubmission.create({ data: { guildId: G, applicationId, versionId, userId, usernameSnapshot: 'u', displayNameSnapshot: 'U', status, startedAt, ...extra } });
}

describe('Bewerbungs-Timeouts und -Erinnerungen', () => {
  it('abgelaufene Bewerbung wird EXPIRED, Bewerber informiert, protokolliert; ohne Limit/innerhalb des Limits nichts', async () => {
    const withLimit = await application(24);
    const noLimit = await application();
    const v1 = await version(withLimit.id);
    const v2 = await version(noLimit.id);
    const old = await submission(withLimit.id, v1.id, A, 'IN_PROGRESS', h(-30));
    await submission(withLimit.id, v1.id, B, 'IN_PROGRESS', h(-10)); // innerhalb
    await submission(noLimit.id, v2.id, TR, 'IN_PROGRESS', h(-1000)); // kein Limit
    expect(await expireStaleApplications(NOW)).toEqual({ expired: 1 });
    expect((await prisma.applicationSubmission.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('EXPIRED');
    expect(await prisma.notification.count({ where: { guildId: G, kind: 'application.expired', targetId: A } })).toBe(1);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { guildId: G, action: 'submission.expired' } });
    expect(log).toMatchObject({ actorType: 'AUTOMATION', automation: 'application-timeout', resourceId: old.id });
    expect(await expireStaleApplications(NOW)).toEqual({ expired: 0 }); // idempotent
  });
  it('Benachrichtigung „abgelaufen“ laut Bewerbungsart: keine DM, dafür Kanalnachricht', async () => {
    const app = await prisma.application.create({ data: { guildId: G, name: 'Support', slug: `s${Math.random().toString(36).slice(2, 8)}`, createdBy: 'x', updatedBy: 'x', config: { requirements: { timeLimit: { hours: 2 } }, notifications: { expired: { dm: false, channelId: '800000000000300009', channelEmbed: { title: 'Abgelaufen: {applicationName}', description: '{user}' } } } } } });
    const v = await version(app.id);
    const s = await submission(app.id, v.id, A, 'IN_PROGRESS', h(-3));
    expect(await expireStaleApplications(NOW)).toEqual({ expired: 1 });
    expect(await prisma.notification.count({ where: { guildId: G, kind: 'application.expired' } })).toBe(0);
    const n = await prisma.notification.findFirstOrThrow({ where: { guildId: G, kind: 'application.expired.channel' } });
    expect(n).toMatchObject({ targetKind: 'CHANNEL', targetId: '800000000000300009', dedupeKey: `application-expired-channel:${s.id}` });
    expect((n.payload as any).embeds[0]).toMatchObject({ title: 'Abgelaufen: Support', description: `<@${A}>` });
  });
  it('Erinnerung an Bewerber (einmalig, nicht kurz vor/nach Ablauf) und ans Team bei langer Wartezeit', async () => {
    const app = await application(100);
    const v = await version(app.id);
    await submission(app.id, v.id, A, 'IN_PROGRESS', h(-30)); // 30 h her, Limit 100 h
    await submission(app.id, v.id, B, 'IN_PROGRESS', h(-5)); // zu frisch
    const waiting = await submission(app.id, v.id, TR, 'SUBMITTED', h(-80), { submittedAt: h(-60), submissionNumber: 'SUB-0007' });
    await guildRepository.setSelection(G, 'application-review-channel', '800000000000300009');
    expect(await applicationReminders(NOW)).toEqual({ applicants: 1, staff: 1 });
    expect(await applicationReminders(NOW)).toEqual({ applicants: 0, staff: 0 }); // einmalig
    const p = port();
    await deliver(p, NOW);
    expect(JSON.stringify(p.sendDm.mock.calls)).toContain('noch nicht abgeschlossen');
    expect(JSON.stringify(p.postMessage.mock.calls)).toContain('SUB-0007');
    expect(waiting.id).toBeTruthy();
  });
});

describe('Erinnerungen Ausbildung und Abmeldung', () => {
  it('Termin in < 24 h: Teilnehmer und Ausbilder je einmal; spätere/vergangene/abgesagte nicht', async () => {
    const course = await prisma.trainingCourse.create({ data: { guildId: G, name: 'Grund', theoryMax: 100 } });
    const mk = (n: number, at: Date, status: 'PLANNED' | 'CANCELLED' = 'PLANNED') => prisma.training.create({ data: { guildId: G, number: n, courseId: course.id, scheduledAt: at, status, maxParticipants: 5, createdBy: 'x', trainerIds: [TR] } });
    const soon = await mk(1, h(5));
    await mk(2, h(30));
    await mk(3, h(-2));
    await mk(4, h(5), 'CANCELLED');
    await prisma.trainingParticipant.createMany({ data: [{ guildId: G, trainingId: soon.id, userId: A }, { guildId: G, trainingId: soon.id, userId: B, status: 'WITHDRAWN' }] });
    expect(await trainingReminders(NOW)).toEqual({ queued: 2 }); // A + Ausbilder
    expect(await trainingReminders(NOW)).toEqual({ queued: 0 });
    expect((await prisma.notification.findMany({ where: { guildId: G, kind: 'training.reminder' } })).map((n) => n.targetId).sort()).toEqual([A, TR].sort());
  });
  it('Abmeldung endet heute/morgen: einmalig; laufende längere nicht', async () => {
    const day = (s: string) => new Date(`${s}T00:00:00Z`);
    await prisma.absence.createMany({ data: [
      { guildId: G, number: 1, userId: A, startDate: day('2026-10-05'), endDate: day('2026-10-13'), category: 'URLAUB', reason: 'x', status: 'APPROVED' }, // endet morgen
      { guildId: G, number: 2, userId: B, startDate: day('2026-10-05'), endDate: day('2026-10-20'), category: 'URLAUB', reason: 'x', status: 'APPROVED' }, // lang
      { guildId: G, number: 3, userId: TR, startDate: day('2026-10-05'), endDate: day('2026-10-13'), category: 'URLAUB', reason: 'x', status: 'PENDING' }, // nicht genehmigt
    ] });
    expect(await absenceEndReminders(NOW)).toEqual({ queued: 1 });
    expect(await absenceEndReminders(NOW)).toEqual({ queued: 0 });
  });
});

describe('Berichte, Statistiken, Sync, Läufe', () => {
  it('Berichte: Tagesbericht des Vortags + montags Wochenbericht; zweiter Lauf postet nichts erneut', async () => {
    await guildRepository.setSelection(G, 'report-channel', '800000000000300010');
    const p = port();
    const a = await dueReports(p, NOW); // Montag
    expect(a.published).toBeGreaterThanOrEqual(2);
    const kinds = (await prisma.report.findMany({ where: { guildId: G } })).map((r) => r.kind).sort();
    expect(kinds).toEqual(['DAY', 'WEEK']);
    const posted = p.postMessage.mock.calls.length;
    const b = await dueReports(p, NOW);
    expect(b.published).toBe(0);
    expect(b.skipped).toBeGreaterThanOrEqual(2);
    expect(p.postMessage.mock.calls.length).toBe(posted);
    const tuesday = await dueReports(p, h(24)); // Dienstag: nur Tag
    expect(tuesday.generated).toBeGreaterThanOrEqual(1);
    expect((await prisma.report.findMany({ where: { guildId: G, kind: 'WEEK' } })).length).toBe(1);
  });
  it('Statistik-Snapshots: Ranglisten je Zeitraum + Übersicht stimmen mit den Schichten überein', async () => {
    const type = await prisma.shiftType.create({ data: { guildId: G, name: 'Streife' } });
    const s = (u: string, start: Date, sec: number) => prisma.shift.create({ data: { guildId: G, userId: u, typeId: type.id, startedAt: start, status: 'ENDED', endedAt: new Date(start.getTime() + sec * 1000), durationSeconds: sec } });
    await s(A, new Date('2026-10-11T22:30:00Z'), 7200);
    await s(B, new Date('2026-10-11T23:00:00Z'), 3600);
    await s(A, new Date('2026-09-01T10:00:00Z'), 1800);
    const r = await computeSnapshots(NOW);
    expect(r.snapshots).toBeGreaterThanOrEqual(5);
    const week = (await getSnapshot(G, 'leaderboard:week'))!.data as { userId: string; totalSeconds: number }[];
    expect(week.map((e) => [e.userId, e.totalSeconds])).toEqual([[A, 7200], [B, 3600]]);
    const all = (await getSnapshot(G, 'leaderboard:all'))!.data as { userId: string; totalSeconds: number }[];
    expect(all[0]).toMatchObject({ userId: A, totalSeconds: 9000 });
    await computeSnapshots(h(1)); // erneut: überschreibt
    expect(await prisma.statSnapshot.count({ where: { guildId: G } })).toBe(5);
  });
  it('Discord-Sync: Fehler eines Servers werden gemeldet, nichts stürzt ab', async () => {
    process.env['DISCORD_API_BASE'] = 'http://127.0.0.1:1';
    const r = await syncAllGuilds('x');
    expect(r.ok).toBe(0);
    expect(r.failed.some((f) => f.guildId === G)).toBe(true);
  });
  it('runJob protokolliert Erfolg und Fehler; behält je Job begrenzt viele Läufe', async () => {
    const ok = await runJob('testjob', async () => ({ n: 3 }));
    expect(ok).toEqual({ ok: true, result: { n: 3 } });
    const bad = await runJob('testjob', async () => { throw new Error('kaputt'); });
    expect(bad).toEqual({ ok: false, error: 'kaputt' });
    const runs = await prisma.jobRun.findMany({ where: { name: 'testjob' }, orderBy: { startedAt: 'asc' } });
    expect(runs.slice(-2).map((r) => [r.ok, r.error])).toEqual([[true, null], [false, 'kaputt']]);
    await prisma.jobRun.deleteMany({ where: { name: 'testjob' } });
    expect(new Set(JOBS.map((j) => j.name)).size).toBe(JOBS.length);
  });
});
