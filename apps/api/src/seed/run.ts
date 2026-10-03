import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { seedBase } from './seed-lib';

/** Idempotent: Permissions + Startrollen, erster Admin (nur wenn noch kein Benutzer existiert), Beispiel-Gesetz. */
async function main() {
  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    if (!(await prisma.user.findFirst())) {
      const password = process.env.ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');
      const admin = await prisma.user.create({ data: { username: 'admin', displayName: 'System Administrator', passwordHash: await hashPassword(password), settings: { create: {} } } });
      const role = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' } });
      await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
      console.log(`Initial admin created: username=admin${process.env.ADMIN_PASSWORD ? '' : ` password=${password} (change immediately; shown once)`}`);
    }
    await prisma.legalCode.upsert({ where: { code: 'TVO-1' }, create: { code: 'TVO-1', title: 'Geschwindigkeitsüberschreitung', category: 'Verkehr', penalty: { fine: 250 } }, update: {} });
  } finally { await prisma.$disconnect(); }
}
void main();
