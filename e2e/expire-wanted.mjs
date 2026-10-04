import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Setzt das Ende einer Fahndung in die Vergangenheit (wie nach Ablauf der Laufzeit) – nur für die E2E-Datenbank `nexus_e2e`. */
const { PrismaClient } = createRequire(`${process.cwd()}/packages/database/package.json`)(
  '@prisma/client',
);
const base = /^DATABASE_URL="?([^"\n]*)"?/m.exec(readFileSync('.env', 'utf8'))?.[1];
const url = new URL(base);
url.pathname = '/nexus_e2e';
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
await prisma.wantedNotice.update({
  where: { id: process.argv[2] },
  data: { expiresAt: new Date(Date.now() - 1000) },
});
await prisma.$disconnect();
