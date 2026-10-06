import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { seedBase, seedTickets } from './seed-lib';

/** Idempotent: Permissions + Startrollen, erster Admin (nur wenn noch kein Benutzer existiert), Beispiel-Gesetz. */
async function main() {
  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    await seedTickets(prisma);
    if (!(await prisma.user.findFirst())) {
      const password = process.env.ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');
      const admin = await prisma.user.create({ data: { username: 'admin', displayName: 'System Administrator', passwordHash: await hashPassword(password), settings: { create: {} } } });
      const role = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' } });
      await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
      console.log(`Initial admin created: username=admin${process.env.ADMIN_PASSWORD ? '' : ` password=${password} (change immediately; shown once)`}`);
    }
    // Notfall: Admin-Passwort aus ADMIN_PASSWORD neu setzen (Panel: ADMIN_PASSWORD_RESET=true, danach wieder entfernen)
    if (process.env.ADMIN_PASSWORD_RESET === 'true') {
      const pw = process.env.ADMIN_PASSWORD ?? '';
      const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
      if (pw.length < 12) console.log('ADMIN_PASSWORD_RESET ignored: set ADMIN_PASSWORD (at least 12 characters).');
      else if (!admin) console.log('ADMIN_PASSWORD_RESET ignored: there is no user "admin".');
      else {
        await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(pw), active: true, failedLogins: 0, lockedUntil: null } });
        console.log('Admin password reset from ADMIN_PASSWORD (user "admin", unlocked). Remove ADMIN_PASSWORD_RESET now.');
      }
    }
    await prisma.legalCode.upsert({ where: { code: 'TVO-1' }, create: { code: 'TVO-1', title: 'Geschwindigkeitsüberschreitung', category: 'Verkehr', penalty: { fine: 250 } }, update: {} });
  } finally { await prisma.$disconnect(); }
}
void main();
