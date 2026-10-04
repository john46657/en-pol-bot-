import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Legt in der E2E-Datenbank `nexus_e2e` eine Personalakte an und gibt ihre ID aus (argv: guildId userId rpName). */
const { PrismaClient } = createRequire(`${process.cwd()}/packages/database/package.json`)(
  '@prisma/client',
);
const base = /^DATABASE_URL="?([^"\n]*)"?/m.exec(readFileSync('.env', 'utf8'))?.[1];
const url = new URL(base);
url.pathname = '/nexus_e2e';
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
const [guildId, userId, rpName] = process.argv.slice(2);
const r = await prisma.personnelRecord.create({ data: { guildId, userId, rpName } });
process.stdout.write(r.id);
await prisma.$disconnect();
