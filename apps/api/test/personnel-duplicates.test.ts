import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { setArchiveFilter } from '../src/prisma/archive-scope';

let app: INestApplication; let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'dup_admin', ['System Administrator']);
});
afterAll(async () => {
  setArchiveFilter(false);
  await prisma.personnel.deleteMany({ where: { user: { username: { startsWith: 'dup_' } } } });
  await app.close();
});

describe('Personalakten aus mehreren früheren Server-Bereichen', () => {
  it('jede Person steht nur einmal in Personal-Übersicht und Teamliste – auch wenn Archiv-Doppel (noch) nicht ausgeblendet sind', async () => {
    const u = await makeUser(prisma, 'dup_john');
    // Bestand und eine Akte aus einem anderen früheren Server (z. B. Umstellung verschoben oder fehlgeschlagen)
    const current = await prisma.personnel.create({ data: { userId: u.id, team: 'Polizei', serviceNumber: 'EP14' } });
    await prisma.personnel.create({ data: { userId: u.id, serverId: randomUUID(), serviceNumber: 'EP14' } });
    setArchiveFilter(false);
    const admin = (await login(app, 'dup_admin')).agent;

    const people = (await admin.get('/api/v1/hr/people')).body as { rows: { id: string; userId: string }[] };
    expect(people.rows.filter((r) => r.userId === u.id)).toEqual([expect.objectContaining({ id: current.id })]);
    const roster = (await admin.get('/api/v1/team/roster')).body as { members: { userId: string | null }[] };
    expect(roster.members.filter((m) => m.userId === u.id).length).toBe(1);
  });
});
