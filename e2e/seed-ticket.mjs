import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Legt in der E2E-Datenbank `nexus_e2e` eine Ticket-Kategorie mit einem Ticket an und gibt die Ticketnummer aus (argv: guildId userId subject [channelId]). */
const { PrismaClient } = createRequire(`${process.cwd()}/packages/database/package.json`)(
  '@prisma/client',
);
const base = /^DATABASE_URL="?([^"\n]*)"?/m.exec(readFileSync('.env', 'utf8'))?.[1];
const url = new URL(base);
url.pathname = '/nexus_e2e';
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
const [guildId, userId, subject, channelId] = process.argv.slice(2);
const cat = await prisma.ticketCategory.create({ data: { guildId, name: `E2E ${Date.now()}` } });
const t = await prisma.ticket.create({
  data: {
    guildId,
    number: 8000 + Math.floor(Math.random() * 900),
    categoryId: cat.id,
    userId,
    subject,
    ...(channelId ? { channelId } : {}),
  },
});
process.stdout.write(String(t.number));
await prisma.$disconnect();
