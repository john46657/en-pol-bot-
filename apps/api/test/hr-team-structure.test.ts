import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'hrstruct_admin', ['System Administrator']);
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['team.structure', 'hr.config'] } } });
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['team.structure', 'hr.config'] } } });
  await app.close();
});

describe('Abteilungen → Teamstruktur', () => {
  it('legt die Teamstruktur vollständig an (Büros als leere Liste), damit die Einstellungsseite sie anzeigen und speichern kann', async () => {
    const admin = (await login(app, 'hrstruct_admin')).agent;
    const cfg = (await admin.get('/api/v1/hr/config')).body;
    expect((await admin.put('/api/v1/hr/config').send(cfg)).status).toBe(200);
    const st = (await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'team.structure' } })).value as { teams: string[]; offices: string[] };
    expect(st.offices).toEqual([]);
    expect(Array.isArray(st.teams)).toBe(true);
    // Speichern über die Einstellungsseite (Schema verlangt beide Listen) klappt danach
    expect((await admin.put('/api/v1/admin/settings/team.structure').send({ value: { ...st, teams: [...st.teams, 'Testteam'] } })).status).toBe(200);
  });
});
