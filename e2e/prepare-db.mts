import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { rm } from 'node:fs/promises';

const { PrismaClient } = createRequire(`${process.cwd()}/packages/database/package.json`)(
  '@prisma/client',
) as typeof import('@prisma/client');

/** Wird vor dem API-Start ausgeführt (`pnpm exec tsx e2e/prepare-db.mts`). Der Browser-Test läuft gegen eine frische Datenbank `nexus_e2e` (nie gegen Dev-Daten). */
async function setup(): Promise<void> {
  const base = /^DATABASE_URL="?([^"\n]*)"?/m.exec(readFileSync('.env', 'utf8'))?.[1];
  if (!base) throw new Error('DATABASE_URL fehlt in .env');
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  await client.$executeRawUnsafe('DROP DATABASE IF EXISTS nexus_e2e WITH (FORCE)');
  await client.$executeRawUnsafe('CREATE DATABASE nexus_e2e');
  await client.$disconnect();
  const url = new URL(base);
  url.pathname = '/nexus_e2e';
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: `${process.cwd()}/packages/database`,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
  // Der Server-Datensatz entsteht sonst beim Beitritt des Bots – für den Test legen wir ihn an.
  const seed = new PrismaClient({ datasourceUrl: url.toString() });
  await seed.guild.create({
    data: { id: '900000000000000001', name: 'NEXUS Demo-Server', settings: { create: {} } },
  });
  // Testdaten für Suche und Benachrichtigungen: ein Ticket (mit Ereignis „Neues Ticket“) und ein Teammitglied
  const cat = await seed.ticketCategory.create({
    data: { guildId: '900000000000000001', name: 'Support' },
  });
  const ticket = await seed.ticket.create({
    data: {
      guildId: '900000000000000001',
      number: 4711,
      categoryId: cat.id,
      userId: '900000000000000020',
      subject: 'Einzigartiger Suchbegriff Zebra',
      status: 'OPEN',
    },
  });
  await seed.auditLog.create({
    data: {
      guildId: '900000000000000001',
      actorType: 'USER',
      action: 'ticket.opened',
      resourceType: 'Ticket',
      resourceId: ticket.id,
    },
  });
  await seed.personnelRecord.create({
    data: {
      guildId: '900000000000000001',
      userId: '900000000000000030',
      rpName: 'Hans Beispiel',
      serviceNumber: 'P-4242',
    },
  });
  await seed.$disconnect();
}

/** Leert Redis-Datenbank 15 (Ratenbegrenzung, Live-Zustand früherer Läufe) – per Roh-Protokoll, ohne zusätzliche Abhängigkeit. */
async function flushRedis(): Promise<void> {
  const base =
    /^REDIS_URL="?([^"\n]*)"?/m.exec(readFileSync('.env', 'utf8'))?.[1] ?? 'redis://localhost:6379';
  const u = new URL(base);
  await new Promise<void>((resolve, reject) => {
    const s = net.connect({ host: u.hostname, port: Number(u.port || 6379) }, () =>
      s.write('SELECT 15\r\nFLUSHDB\r\n'),
    );
    let n = 0;
    s.on('data', (d) => {
      n += d.toString().split('\r\n').filter(Boolean).length;
      if (n >= 2) {
        s.end();
        resolve();
      }
    });
    s.on('error', reject);
  });
}

await rm(`${process.cwd()}/test-results/uploads`, { recursive: true, force: true }); // Bilder früherer Läufe
await setup();
await flushRedis();
