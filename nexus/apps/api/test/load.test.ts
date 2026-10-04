import { describe, expect, it } from 'vitest';

/**
 * Lasttest gegen die Testdatenbank – nur mit `LOAD=1 pnpm --filter @nexus/api exec vitest run test/load.test.ts`
 * (dauert einige Sekunden, legt ~150 000 Zeilen an und räumt wieder auf). Die Grenzwerte sind bewusst großzügig;
 * sie sollen Rückschritte um Größenordnungen (Full-Scan, Laden aller Zeilen) erkennen, keine Millisekunden vergleichen.
 */
const { prisma } = await import('@nexus/database');
const { auditRepository } = await import('@nexus/database');
const { leaderboard, listShifts, overview, shiftStats, startShift, dutyOverview, saveType } = await import('@nexus/shifts');

const BIG = '900000000000340001';
const SMALL = (i: number) => `90000000000035${String(i).padStart(4, '0')}`;
const SMALL_COUNT = 200;
const timings: Record<string, number> = {};
async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  try { return await fn(); } finally { timings[name] = Math.round(performance.now() - t); }
}

describe.skipIf(!process.env['LOAD'])('Last: großer Server + viele Server', () => {
  it('seedet Daten', async () => {
    await cleanup();
    await prisma.guild.create({ data: { id: BIG, name: 'Groß', settings: { create: {} } } });
    for (let i = 0; i < SMALL_COUNT; i++) await prisma.guild.create({ data: { id: SMALL(i), name: `Klein ${i}`, settings: { create: {} } } });
    const type = await saveType(BIG, { name: 'Streife' }, 'x');
    await prisma.$executeRawUnsafe(`
      INSERT INTO shifts (id, "guildId", "userId", "typeId", status, "startedAt", "endedAt", "durationSeconds", "pausedSeconds", "createdAt", "updatedAt")
      SELECT 'ls' || g, '${BIG}', '9000000000003' || lpad((g % 2000)::text, 5, '0'), '${type.id}', 'ENDED',
             now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval + interval '45 minutes', 2700, 0, now(), now()
      FROM generate_series(1, 100000) g`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO audit_logs (id, "guildId", "actorType", "actorId", action, "resourceType", "resourceId", "createdAt")
      SELECT 'la' || g, '${BIG}', 'USER', 'u' || (g % 500), (ARRAY['shift.started','shift.ended','promotion.approved','submission.accepted'])[1 + g % 4], 'Shift', 'ls' || g,
             now() - (g || ' seconds')::interval
      FROM generate_series(1, 50000) g`);
    // viele kleine Server mit je 100 Schichten
    const smallType = await prisma.shiftType.create({ data: { guildId: SMALL(0), name: 'Streife' } });
    await prisma.$executeRawUnsafe(`
      INSERT INTO shifts (id, "guildId", "userId", "typeId", status, "startedAt", "endedAt", "durationSeconds", "pausedSeconds", "createdAt", "updatedAt")
      SELECT 'sm' || g, '${SMALL(0)}', 'u' || (g % 20), '${smallType.id}', 'ENDED', now() - (g || ' hours')::interval, now() - (g || ' hours')::interval + interval '30 minutes', 1800, 0, now(), now()
      FROM generate_series(1, 100) g`);
    expect(await prisma.shift.count({ where: { guildId: BIG } })).toBe(100000);
  }, 300_000);

  it('Lesezugriffe auf dem großen Server bleiben schnell', async () => {
    const page = await timed('Schichtliste (50)', () => listShifts({ guildId: BIG, limit: 50 }));
    expect(page.items).toHaveLength(50);
    await timed('Schichtliste Seite 2 (Cursor)', () => listShifts({ guildId: BIG, limit: 50, cursor: page.nextCursor ?? undefined }));
    await timed('Schichtstatistik (gesamt)', () => shiftStats({ guildId: BIG }));
    await timed('Übersicht Tag/Woche/Monat/Gesamt', () => overview({ guildId: BIG }));
    await timed('Bestenliste (gesamt)', () => leaderboard({ guildId: BIG, period: 'all', limit: 20 }));
    await timed('Dienstübersicht', () => dutyOverview(BIG));
    await timed('Audit-Seite (50)', () => auditRepository.list(BIG, { limit: 51 }));
    await timed('Audit nach Aktion', () => auditRepository.list(BIG, { limit: 51, action: 'promotion.approved' }));
    await timed('Server-Übersicht aller 201 Server', () => prisma.guild.findMany({ where: { leftAt: null }, select: { id: true } }));
    console.table(timings);
    for (const [name, ms] of Object.entries(timings)) expect(ms, `${name}: ${ms} ms`).toBeLessThan(2500);
  }, 120_000);

  it('viele gleichzeitige Schichten: 300 Starts parallel, ein Benutzer startet 20× gleichzeitig → genau eine Schicht', async () => {
    const type = await prisma.shiftType.findFirstOrThrow({ where: { guildId: BIG } });
    const t = performance.now();
    const results = await Promise.allSettled(Array.from({ length: 300 }, (_, i) => startShift({ guildId: BIG, userId: `9000000000004${String(i).padStart(5, '0')}`, typeId: type.id, memberRoleIds: [] })));
    timings['300 parallele Starts'] = Math.round(performance.now() - t);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(300);
    const same = await Promise.allSettled(Array.from({ length: 20 }, () => startShift({ guildId: BIG, userId: '900000000000499999', typeId: type.id, memberRoleIds: [] })));
    expect(same.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.shift.count({ where: { guildId: BIG, userId: '900000000000499999', status: 'ACTIVE' } })).toBe(1);
    const duty = await timed('Dienstübersicht mit 301 aktiven', () => dutyOverview(BIG));
    expect(duty.shifts?.length ?? 301).toBeGreaterThanOrEqual(300);
    console.log('parallele Starts', timings['300 parallele Starts'], 'ms');
  }, 120_000);

  it('räumt auf', async () => { await cleanup(); }, 120_000);
});

async function cleanup() {
  await prisma.guild.deleteMany({ where: { id: { in: [BIG, ...Array.from({ length: SMALL_COUNT }, (_, i) => SMALL(i))] } } });
}
