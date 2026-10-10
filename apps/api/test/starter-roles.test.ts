import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers';
import { seedBase } from '../src/seed/seed-lib';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
afterAll(async () => {
  // Startrolle für die anderen Tests wiederherstellen
  const mark = await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'roles.starterSeeded' } });
  await prisma.systemSetting.update({ where: { key: 'roles.starterSeeded' }, data: { value: (mark.value as string[]).filter((n) => n !== 'Investigator') } });
  await seedBase(prisma);
  await app.close();
});

describe('Startrollen', () => {
  it('a deleted starter role does not come back on the next start; System Administrator always does', async () => {
    await prisma.role.delete({ where: { name: 'Investigator' } });
    await prisma.role.delete({ where: { name: 'System Administrator' } });
    await seedBase(prisma); // = Serverstart
    expect(await prisma.role.findUnique({ where: { name: 'Investigator' } })).toBeNull();
    const sa = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' }, include: { permissions: true } });
    expect(sa.permissions.map((p) => p.permissionKey)).toEqual(['*']);
  });

  it('installs from before the marker keep their deleted roles deleted', async () => {
    await prisma.systemSetting.delete({ where: { key: 'roles.starterSeeded' } });
    await seedBase(prisma);
    expect(await prisma.role.findUnique({ where: { name: 'Investigator' } })).toBeNull();
  });
});
