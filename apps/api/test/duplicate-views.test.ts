import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ownSpace } from '../src/server-links/server-links.service';
import { BackupService } from '../src/backup/backup.service';

/**
 * Nach der Rück-Umstellung auf getrennte Server standen Personalakten, Dienstnummern und freie Nummern doppelt in den Listen:
 * Reste früherer Umstellungen liegen in Bereichen ohne registrierten Server und erschienen unter „Alle Server“; ein kopierter
 * Nummernkreis erzeugte jede freie Nummer zweimal. Es wird nichts gelöscht – nur nicht mehr doppelt angezeigt.
 */
const HOME = '660000000000000001';
const ORPHAN = '7f3c2a10-0000-4000-8000-00000000abcd'; // z. B. md5('kept-apart:' || id)

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  const admin = await makeUser(prisma, 'dup_admin', ['System Administrator']);
  await registerServer(prisma, HOME, [admin.id]);
});
afterAll(async () => { await app.close(); });

describe('keine doppelten Einträge nach der Server-Umstellung', () => {
  it('„Alle Server“: Reste in verwaisten Bereichen erscheinen nicht in Listen, bleiben aber gespeichert und im Backup', async () => {
    const space = ownSpace(HOME);
    await prisma.person.create({ data: { serverId: space, robloxUsername: 'Ghost_gaming7542', robloxUserId: '777542' } });
    await prisma.person.create({ data: { serverId: ORPHAN, robloxUsername: 'Ghost_gaming7542', robloxUserId: '777542' } });
    const admin = (await login(app, 'dup_admin')).agent;
    const all = (await admin.get('/api/v1/persons').query({ q: 'Ghost_gaming' })).body.items;
    expect(all).toHaveLength(1);
    expect(all[0].serverId).toBe(space);
    const own = (await admin.get('/api/v1/persons').set('X-Guild-Id', HOME).query({ q: 'Ghost_gaming' })).body.items;
    expect(own).toHaveLength(1);
    // nichts gelöscht: der Rest ist noch da und im Backup enthalten
    expect(await prisma.person.count({ where: { robloxUsername: 'Ghost_gaming7542' } })).toBe(2);
    const backup = await app.get(BackupService).createData(null, 'test-duplikate');
    expect(backup.rows).toBeGreaterThan(0);
    const raw = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "Person" WHERE "serverId" = '${ORPHAN}'`);
    expect(Number(raw[0]!.n)).toBe(1);
  });

  it('doppelter Nummernkreis: jede Nummer nur einmal in der Liste, Kreis als Duplikat markiert', async () => {
    const admin = (await login(app, 'dup_admin')).agent;
    const g = { 'X-Guild-Id': HOME };
    const range = { name: 'EN Polizei', prefix: 'EP', suffix: '', start: 1, end: 20, padLength: 2, order: 'LOWEST_FREE', autoAssign: true, manual: true, reuse: true, releaseAs: 'FREE', department: 'Polizei', active: true };
    const a = await admin.post('/api/v1/dienstnummern/ranges').set(g).send(range);
    expect(a.status).toBe(201);
    // Kopie wie aus der Rück-Umstellung (die API selbst verhindert Überschneidungen)
    const copy = await prisma.serviceNumberRange.create({ data: { ...range, department: null, serverId: ownSpace(HOME), position: 2 } });
    await prisma.serviceNumber.create({ data: { serverId: ownSpace(HOME), rangeId: copy.id, value: 1, display: 'EP01', status: 'ACTIVE', assignedAt: new Date() } });
    const list: { display: string; status: string }[] = (await admin.get('/api/v1/dienstnummern').set(g).query({ limit: 1000 })).body;
    const displays = list.map((x) => x.display);
    expect(new Set(displays).size).toBe(displays.length);
    expect(list.filter((x) => x.display === 'EP01')).toEqual([expect.objectContaining({ status: 'ACTIVE' })]);
    expect(displays).toHaveLength(20);
    const ranges = (await admin.get('/api/v1/dienstnummern/ranges').set(g)).body as { id: string; duplicateOf: { id: string } | null }[];
    expect(ranges.find((r) => r.id === a.body.id)?.duplicateOf).toBeNull();
    expect(ranges.find((r) => r.id === copy.id)?.duplicateOf).toMatchObject({ id: a.body.id });
    expect(await prisma.serviceNumberRange.count()).toBe(2); // nichts automatisch geändert
  });
});
