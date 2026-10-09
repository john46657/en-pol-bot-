import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
// kleinstes gültiges PNG (1×1)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await prisma.systemSetting.deleteMany({ where: { key: 'mdt.config' } });
  await makeUser(prisma, 'mdt_admin', ['System Administrator']);
  await makeUser(prisma, 'mdt_officer', ['Police Member']);
  await makeUser(prisma, 'mdt_senior', ['Police Member', 'Senior Officer']);
});
afterAll(async () => { await prisma.systemSetting.deleteMany({ where: { key: 'mdt.config' } }); await app.close(); });

describe('Polizei-MDT', () => {
  let personId = '', version = 0;
  it('Bürgerakte: Personalien, Lizenzen und Merkmale pflegen; Suche nach Name und Telefon', async () => {
    const admin = (await login(app, 'mdt_admin')).agent;
    const p = await admin.post('/api/v1/persons').send({ robloxUsername: 'NoahKeller_RP', robloxUserId: '7790101' });
    expect(p.status).toBe(201);
    personId = p.body.person.id;
    version = p.body.person.version;
    const bad = await admin.patch(`/api/v1/mdt/citizens/${personId}`).send({ version, flags: ['GIBTSNICHT'] });
    expect(bad.status).toBe(400);
    const r = await admin.patch(`/api/v1/mdt/citizens/${personId}`).send({
      version, fullName: 'Noah Keller', dateOfBirth: '1996-11-02', gender: 'Männlich', phone: '555-0102', job: 'Arbeitslos', nationality: 'US',
      appearance: { hairColor: 'braun' }, licenses: ['DRIVER', 'WEAPON'], flags: ['DANGEROUS'],
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ fullName: 'Noah Keller', dateOfBirth: '1996-11-02', licenses: ['DRIVER', 'WEAPON'], flags: ['DANGEROUS'] });
    expect(r.body.age).toBeGreaterThanOrEqual(29);
    version = r.body.version;
    // alte Version → Konflikt
    expect((await admin.patch(`/api/v1/mdt/citizens/${personId}`).send({ version: version - 1, job: 'x' })).status).toBe(409);

    const officer = (await login(app, 'mdt_officer')).agent;
    for (const q of ['keller', '555-0102', 'NoahKeller']) {
      const s = await officer.get('/api/v1/mdt/citizens').query({ q });
      expect(s.status).toBe(200);
      expect(s.body.items.map((i: { id: string }) => i.id)).toContain(personId);
    }
    expect((await officer.get('/api/v1/mdt/citizens').query({ flag: 'DANGEROUS' })).body.items.map((i: { id: string }) => i.id)).toContain(personId);
    // ohne persons.edit keine Änderung
    expect((await officer.patch(`/api/v1/mdt/citizens/${personId}`).send({ version, job: 'x' })).status).toBe(403);
  });

  it('Profil: Haftbefehle, Fahrzeuge, Waffen und verknüpfte Akten mit Zählern', async () => {
    const admin = (await login(app, 'mdt_admin')).agent;
    expect((await admin.post('/api/v1/wanted').send({ personId, reason: 'Bewaffneter Raub', priority: 'HIGH' })).status).toBe(201);
    expect((await admin.post('/api/v1/vehicles').send({ plate: 'MDT 1', model: 'Falcon', ownerId: personId })).status).toBe(201);
    const w = await admin.post('/api/v1/mdt/weapons').send({ serial: 'ab-1234', type: 'PISTOL', model: 'Glock', ownerId: personId });
    expect(w.status).toBe(201);
    expect(w.body.serial).toBe('AB-1234');
    expect((await admin.post('/api/v1/mdt/weapons').send({ serial: ' Ab-1234 ', type: 'PISTOL' })).status).toBe(409);
    expect((await admin.post('/api/v1/mdt/weapons').send({ serial: 'XY-1', type: 'LASER' })).status).toBe(400);

    const r = await admin.get(`/api/v1/mdt/citizens/${personId}`);
    expect(r.status).toBe(200);
    expect(r.body.person).toMatchObject({ fullName: 'Noah Keller', activeWarrants: 1 });
    expect(r.body.counts).toMatchObject({ activeWarrants: 1, vehicles: 1, weapons: 1 });
    expect(r.body.weapons[0]).toMatchObject({ serial: 'AB-1234' });
    expect(r.body.warrants[0]).toMatchObject({ reason: 'Bewaffneter Raub' });
    expect(Array.isArray(r.body.incidents)).toBe(true);

    // Waffenregister: Suche nach Seriennummer und Besitzer; Status ändern (gestohlen)
    const officer = (await login(app, 'mdt_officer')).agent;
    expect((await officer.get('/api/v1/mdt/weapons').query({ q: 'ab-12' })).body.items.map((x: { serial: string }) => x.serial)).toContain('AB-1234');
    expect((await officer.get('/api/v1/mdt/weapons').query({ q: 'keller' })).body.total).toBeGreaterThanOrEqual(1);
    expect((await officer.patch(`/api/v1/mdt/weapons/${w.body.id}`).send({ version: 1, status: 'STOLEN' })).status).toBe(403);
    const senior = (await login(app, 'mdt_senior')).agent;
    expect((await senior.patch(`/api/v1/mdt/weapons/${w.body.id}`).send({ version: 1, status: 'STOLEN' })).body.status).toBe('STOLEN');

    // Fahrzeug-Liste und -Akte
    const v = await officer.get('/api/v1/mdt/vehicles').query({ q: 'mdt1' });
    expect(v.body.items[0]).toMatchObject({ plate: 'MDT1', owner: { fullName: 'Noah Keller' } });
    const vd = await officer.get(`/api/v1/mdt/vehicles/${v.body.items[0].id}`);
    expect(vd.body.vehicle.owner).toMatchObject({ id: personId });

    // Haftbefehle mit Person
    const wr = await admin.get('/api/v1/mdt/warrants');
    expect(wr.body.find((x: { personId: string }) => x.personId === personId)).toMatchObject({ person: { fullName: 'Noah Keller' } });
  });

  it('Foto: nur Bilder, ersetzt das bisherige; ist danach abrufbar', async () => {
    const admin = (await login(app, 'mdt_admin')).agent;
    expect((await admin.post(`/api/v1/mdt/citizens/${personId}/photo`).attach('file', Buffer.from('hallo'), { filename: 'a.txt', contentType: 'text/plain' })).status).toBe(400);
    const r = await admin.post(`/api/v1/mdt/citizens/${personId}/photo`).attach('file', PNG, { filename: 'foto.png', contentType: 'image/png' });
    expect(r.status).toBe(201);
    expect(r.body.photoUrl).toMatch(/^\/api\/v1\/media\//);
    const officer = (await login(app, 'mdt_officer')).agent;
    expect((await officer.get(r.body.photoUrl)).status).toBe(200);
    expect((await officer.get(`/api/v1/mdt/citizens/${personId}`)).body.person.photoUrl).toBe(r.body.photoUrl);
  });

  it('Einstellungen: nur settings.manage; eigene Lizenzen gelten sofort', async () => {
    const officer = (await login(app, 'mdt_officer')).agent;
    expect((await officer.get('/api/v1/mdt/config')).body.licenses.map((l: { key: string }) => l.key)).toContain('DRIVER');
    expect((await officer.put('/api/v1/mdt/config').send({ genders: ['x'] })).status).toBe(403);
    const admin = (await login(app, 'mdt_admin')).agent;
    expect((await admin.put('/api/v1/mdt/config').send({ licenses: [{ key: 'TAXI', label: 'Taxischein' }, { key: 'TAXI', label: 'doppelt' }] })).status).toBe(400);
    expect((await admin.put('/api/v1/mdt/config').send({ licenses: [{ key: 'DRIVER', label: 'Führerschein' }, { key: 'TAXI', label: 'Taxischein' }] })).status).toBe(200);
    const p = await admin.get(`/api/v1/mdt/citizens/${personId}`);
    expect((await admin.patch(`/api/v1/mdt/citizens/${personId}`).send({ version: p.body.person.version, licenses: ['TAXI'] })).body.licenses).toEqual(['TAXI']);
  });
});
