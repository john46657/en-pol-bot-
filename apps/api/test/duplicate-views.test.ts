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
  const officer = await makeUser(prisma, 'dup_officer', ['Police Member']);
  await registerServer(prisma, HOME, [admin.id, officer.id]);
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
    const backup = await app.get(BackupService).createData(null, 'manuell');
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

    // Button „Doppelte Nummernkreise zusammenführen“: nur mit Recht + Bestätigung, Backup vorab, nichts gelöscht
    const officer = (await login(app, 'dup_officer')).agent;
    expect((await officer.post('/api/v1/dienstnummern/ranges/merge-duplicates').set(g).send({ confirm: 'ZUSAMMENFÜHREN' })).status).toBe(403);
    const preview = (await admin.get('/api/v1/dienstnummern/ranges/duplicates').set(g)).body;
    expect(preview).toEqual([expect.objectContaining({ keep: expect.objectContaining({ id: copy.id, numbers: 1 }), merge: [expect.objectContaining({ id: a.body.id })] })]);
    expect((await admin.post('/api/v1/dienstnummern/ranges/merge-duplicates').set(g).send({})).status).toBe(400);
    const merged = await admin.post('/api/v1/dienstnummern/ranges/merge-duplicates').set(g).send({ confirm: 'ZUSAMMENFÜHREN' });
    expect(merged.status).toBe(200);
    expect(merged.body).toMatchObject({ merged: 1, moved: 0, kept: 0 });
    expect(merged.body.backup).toMatch(/^vor-zusammenfuehrung-/);
    const after = await prisma.serviceNumberRange.findMany({ orderBy: { createdAt: 'asc' } });
    expect(after).toHaveLength(2);
    expect(after.find((r) => r.id === a.body.id)).toMatchObject({ active: false, name: 'EN Polizei (zusammengeführt)' });
    expect(after.find((r) => r.id === copy.id)).toMatchObject({ active: true, department: 'Polizei' });
    const again: { display: string }[] = (await admin.get('/api/v1/dienstnummern').set(g).query({ limit: 1000 })).body;
    expect(again).toHaveLength(20);
    expect((await admin.get('/api/v1/dienstnummern/ranges/duplicates').set(g)).body).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'dienstnummer.range.merge', entityId: a.body.id } })).toBe(1);
  });

  it('Zusammenführen übernimmt Nummern und Automatik-Zuordnung in den bleibenden Kreis', async () => {
    const admin = (await login(app, 'dup_admin')).agent;
    const g = { 'X-Guild-Id': HOME };
    const base = { prefix: 'K', suffix: '', start: 1, end: 9, padLength: 0, order: 'LOWEST_FREE', autoAssign: true, manual: true, reuse: true, releaseAs: 'FREE', department: null, active: true, serverId: ownSpace(HOME) };
    const k1 = await prisma.serviceNumberRange.create({ data: { ...base, name: 'K1', position: 5 } });
    const k2 = await prisma.serviceNumberRange.create({ data: { ...base, name: 'K2', position: 6 } });
    await prisma.serviceNumber.createMany({ data: [
      { serverId: ownSpace(HOME), rangeId: k1.id, value: 1, display: 'K1', status: 'ACTIVE' }, { serverId: ownSpace(HOME), rangeId: k1.id, value: 2, display: 'K2', status: 'ACTIVE' },
      { serverId: ownSpace(HOME), rangeId: k2.id, value: 3, display: 'K3', status: 'ACTIVE' },
    ] });
    const s = (await admin.get('/api/v1/dienstnummern/settings').set(g)).body;
    expect((await admin.put('/api/v1/dienstnummern/settings').set(g).send({ ...s, mappings: [{ kind: 'police', rangeId: k2.id, department: 'Polizei', rankId: null, createProfile: true, roleIds: [] }] })).status).toBe(200);
    const r = await admin.post('/api/v1/dienstnummern/ranges/merge-duplicates').set(g).send({ confirm: 'ZUSAMMENFÜHREN' });
    expect(r.body).toMatchObject({ merged: 1, moved: 1, kept: 0 });
    expect(await prisma.serviceNumber.count({ where: { rangeId: k1.id } })).toBe(3);
    expect((await admin.get('/api/v1/dienstnummern/settings').set(g)).body.mappings[0].rangeId).toBe(k1.id);
  });

  it('Backup wiederherstellen unter „Alle Server“ klappt trotz ausgeblendeter Altbestände (und stellt sie mit her)', async () => {
    const admin = (await login(app, 'dup_admin')).agent;
    const made = await admin.post('/api/v1/backups/data').send({});
    expect(made.status).toBe(201);
    const res = await admin.post(`/api/v1/backups/data/${made.body.name}/restore`).send({ confirm: 'WIEDERHERSTELLEN' });
    expect(res.status).toBe(200);
    const raw = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "Person" WHERE "serverId" = '${ORPHAN}'`);
    expect(Number(raw[0]!.n)).toBe(1);
  });
});
