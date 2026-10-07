import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { validateCustom } from '../src/studio/custom-fields';

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'st_admin', ['System Administrator']);
  await makeUser(prisma, 'st_off', ['Police Member']);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['studio.customFields', 'theme.accent', 'theme.customAccents'] } } }); // geteilte Test-DB
  await app.close();
});

const defs = { persons: [
  { key: 'dob', label: 'Date of birth', type: 'date', required: false },
  { key: 'height', label: 'Height (cm)', type: 'number', required: false },
  { key: 'license', label: 'License class', type: 'select', required: true, options: ['A', 'B', 'None'] },
], vehicles: [{ key: 'registration', label: 'Registration', type: 'text', required: false }] };

describe('custom field validation (unit)', () => {
  const d = [{ key: 'n', label: 'N', type: 'number' as const, required: true }];
  it('checks types, required and unknown keys', () => {
    expect(validateCustom(d, { n: '5' })).toEqual({ ok: true, value: { n: 5 } });
    expect(validateCustom(d, {})).toMatchObject({ ok: false });
    expect(validateCustom(d, { n: 'abc' })).toMatchObject({ ok: false });
    expect(validateCustom(d, { n: 1, evil: 'x' })).toMatchObject({ ok: false });
  });
  it('keeps existing values on partial update', () => {
    expect(validateCustom(d, {}, { n: 7 })).toEqual({ ok: true, value: { n: 7 } });
  });
});

describe('Studio configuration', () => {
  it('only settings.manage can change it; invalid definitions are rejected; changes are audited', async () => {
    const adm = (await login(app, 'st_admin')).agent;
    const off = (await login(app, 'st_off')).agent;
    expect((await off.put('/api/v1/admin/settings/studio.customFields').send({ value: defs })).status).toBe(403);
    expect((await adm.put('/api/v1/admin/settings/studio.customFields').send({ value: { persons: [defs.persons[0], defs.persons[0]], vehicles: [] } })).status).toBe(400); // duplicate key
    expect((await adm.put('/api/v1/admin/settings/studio.customFields').send({ value: { persons: [{ key: 'x', label: 'X', type: 'select', required: false }], vehicles: [] } })).status).toBe(400); // select w/o options
    expect((await adm.put('/api/v1/admin/settings/studio.customFields').send({ value: { persons: [{ key: 'Bad Key', label: 'X', type: 'text' }], vehicles: [] } })).status).toBe(400);
    expect((await adm.put('/api/v1/admin/settings/theme.accent').send({ value: 'hotpink' })).status).toBe(400);
    expect((await adm.put('/api/v1/admin/settings/studio.customFields').send({ value: defs })).status).toBe(200);
    // mehr Vorgaben und eigene Farben (#rrggbb), eigene Farbliste mit Namen
    expect((await adm.put('/api/v1/admin/settings/theme.accent').send({ value: 'pink' })).status).toBe(200);
    expect((await adm.put('/api/v1/admin/settings/theme.accent').send({ value: '#12ab9F' })).status).toBe(200);
    expect((await adm.put('/api/v1/admin/settings/theme.accent').send({ value: '#12ab9' })).status).toBe(400);
    expect((await adm.put('/api/v1/admin/settings/theme.customAccents').send({ value: [{ name: 'Polizei-Blau', hex: '#0b3d91' }] })).status).toBe(200);
    expect((await adm.put('/api/v1/admin/settings/theme.customAccents').send({ value: [{ name: 'X', hex: 'blau' }] })).status).toBe(400);
    expect((await off.put('/api/v1/admin/settings/theme.customAccents').send({ value: [] })).status).toBe(403);
    expect((await adm.put('/api/v1/admin/settings/theme.accent').send({ value: 'green' })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'studio.config.changed' } })).toBeGreaterThanOrEqual(2);
  });
  it('any signed-in user can read the (non-sensitive) config', async () => {
    const off = (await login(app, 'st_off')).agent;
    const c = (await off.get('/api/v1/studio/config')).body;
    expect(c.theme.accent).toBe('green');
    expect(c.theme.customAccents).toEqual([{ name: 'Polizei-Blau', hex: '#0b3d91' }]);
    expect(c.customFields.persons).toHaveLength(3);
    expect((await (await import('supertest')).default(app.getHttpServer()).get('/api/v1/studio/config')).status).toBe(401);
  });
});

describe('custom fields on records', () => {
  it('enforces required, types and unknown keys; stores values; partial updates keep existing ones', async () => {
    const off = (await login(app, 'st_off')).agent;
    const adm = (await login(app, 'st_admin')).agent;
    const miss = await off.post('/api/v1/persons').send({ robloxUsername: 'CF_Missing' });
    expect(miss.status).toBe(400);
    expect(JSON.stringify(miss.body.details)).toContain('License class');
    expect((await off.post('/api/v1/persons').send({ robloxUsername: 'CF_Bad', custom: { license: 'Z' } })).status).toBe(400);
    expect((await off.post('/api/v1/persons').send({ robloxUsername: 'CF_Bad', custom: { license: 'A', height: 'tall' } })).status).toBe(400);
    expect((await off.post('/api/v1/persons').send({ robloxUsername: 'CF_Bad', custom: { license: 'A', hacked: 1 } })).status).toBe(400);
    expect(await prisma.person.count({ where: { robloxUsername: { startsWith: 'CF_' } } })).toBe(0);

    const ok = await off.post('/api/v1/persons').send({ robloxUsername: 'CF_Ok', custom: { license: 'B', height: '181', dob: '1999-05-17' } });
    expect(ok.status).toBe(201);
    const p = ok.body.person;
    expect(p.custom).toEqual({ license: 'B', height: 181, dob: '1999-05-17' });
    const upd = await adm.patch(`/api/v1/persons/${p.id}`).send({ version: p.version, custom: { height: 190 } });
    expect(upd.status).toBe(200);
    expect(upd.body.custom).toEqual({ license: 'B', height: 190, dob: '1999-05-17' }); // license/dob preserved
  });
  it('vehicles use their own definitions', async () => {
    const off = (await login(app, 'st_off')).agent;
    const v = await off.post('/api/v1/vehicles').send({ plate: 'CF 001', custom: { registration: 'REG-1' } });
    expect(v.status).toBe(201);
    expect(v.body.custom).toEqual({ registration: 'REG-1' });
    expect((await off.post('/api/v1/vehicles').send({ plate: 'CF 002', custom: { license: 'A' } })).status).toBe(400); // person field on a vehicle
  });
});
