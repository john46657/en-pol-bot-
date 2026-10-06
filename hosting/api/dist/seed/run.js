"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const password_1 = require("../auth/password");
const seed_lib_1 = require("./seed-lib");
/** Idempotent: Permissions + Startrollen, erster Admin (nur wenn noch kein Benutzer existiert), Beispiel-Gesetz. */
async function main() {
    const prisma = new client_1.PrismaClient();
    try {
        await (0, seed_lib_1.seedBase)(prisma);
        await (0, seed_lib_1.seedTickets)(prisma);
        if (!(await prisma.user.findFirst())) {
            const password = process.env.ADMIN_PASSWORD ?? (0, node_crypto_1.randomBytes)(12).toString('base64url');
            const admin = await prisma.user.create({ data: { username: 'admin', displayName: 'System Administrator', passwordHash: await (0, password_1.hashPassword)(password), settings: { create: {} } } });
            const role = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' } });
            await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
            console.log(`Initial admin created: username=admin${process.env.ADMIN_PASSWORD ? '' : ` password=${password} (change immediately; shown once)`}`);
        }
        // Notfall: Admin-Passwort aus ADMIN_PASSWORD neu setzen (Panel: ADMIN_PASSWORD_RESET=true, danach wieder entfernen)
        if (process.env.ADMIN_PASSWORD_RESET === 'true') {
            const pw = process.env.ADMIN_PASSWORD ?? '';
            const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
            if (pw.length < 12)
                console.log('ADMIN_PASSWORD_RESET ignored: set ADMIN_PASSWORD (at least 12 characters).');
            else if (!admin)
                console.log('ADMIN_PASSWORD_RESET ignored: there is no user "admin".');
            else {
                await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: await (0, password_1.hashPassword)(pw), active: true, failedLogins: 0, lockedUntil: null } });
                console.log('Admin password reset from ADMIN_PASSWORD (user "admin", unlocked). Remove ADMIN_PASSWORD_RESET now.');
            }
        }
        await prisma.legalCode.upsert({ where: { code: 'TVO-1' }, create: { code: 'TVO-1', title: 'Geschwindigkeitsüberschreitung', category: 'Verkehr', penalty: { fine: 250 } }, update: {} });
    }
    finally {
        await prisma.$disconnect();
    }
}
void main();
//# sourceMappingURL=run.js.map