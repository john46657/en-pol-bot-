import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService; let pid: string; let tid: string;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'tm_admin', ['System Administrator']);
  const u = await makeUser(prisma, 'tm_rekrut', ['Police Member']);
  pid = (await prisma.personnel.create({ data: { userId: u.id, rank: 'Anwärter-M' } })).id;
});
afterAll(async () => {
  if (tid) await prisma.hrTraining.deleteMany({ where: { id: tid } });
  await prisma.personnel.deleteMany({ where: { id: pid } });
  await app.close();
});

describe('Ausbildung: Modul-Checkliste pro Rekrut', () => {
  it('progress follows ticked modules, „bestanden“ only with all modules, removed modules stop counting', async () => {
    const admin = (await login(app, 'tm_admin')).agent;
    expect((await admin.post('/api/v1/hr/trainings').send({ name: 'Grundausbildung M', modules: ['Funk', 'Funk'] })).status).toBe(400); // doppelt
    const t = await admin.post('/api/v1/hr/trainings').send({ name: 'Grundausbildung M', modules: ['Funk', 'Recht', 'Fahren', 'Schießen'] });
    expect(t.status).toBe(201);
    tid = t.body.id;
    expect(t.body.modules).toEqual(['Funk', 'Recht', 'Fahren', 'Schießen']);

    // unbekannte Module werden ignoriert, Fortschritt kommt aus der Checkliste (nicht aus „progress“)
    const p1 = await admin.put('/api/v1/hr/training-progress').send({ trainingId: tid, personnelId: pid, status: 'IN_PROGRESS', progress: 90, doneModules: ['Recht', 'Funk', 'Gibt es nicht'] });
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ progress: 50, doneModules: ['Funk', 'Recht'] });

    // Status ändern ohne Checkliste lässt die Haken stehen
    expect((await admin.put('/api/v1/hr/training-progress').send({ trainingId: tid, personnelId: pid, status: 'IN_PROGRESS' })).body).toMatchObject({ progress: 50, doneModules: ['Funk', 'Recht'] });

    const early = await admin.put('/api/v1/hr/training-progress').send({ trainingId: tid, personnelId: pid, status: 'PASSED' });
    expect(early.status).toBe(409);
    expect(JSON.stringify(early.body)).toContain('2/4');

    // Modul entfernt → Fortschritt der laufenden Ausbildung neu berechnet
    expect((await admin.put(`/api/v1/hr/trainings/${tid}`).send({ name: 'Grundausbildung M', modules: ['Funk', 'Fahren'] })).status).toBe(200);
    expect((await admin.get(`/api/v1/hr/trainings/${tid}/progress`)).body[0]).toMatchObject({ progress: 50, doneModules: ['Funk'] });

    expect((await admin.put('/api/v1/hr/training-progress').send({ trainingId: tid, personnelId: pid, status: 'IN_PROGRESS', doneModules: ['Funk', 'Fahren'] })).body.progress).toBe(100);
    const done = await admin.put('/api/v1/hr/training-progress').send({ trainingId: tid, personnelId: pid, status: 'PASSED' });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'PASSED', progress: 100 });
  });
});
