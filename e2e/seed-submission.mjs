import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Legt in der E2E-Datenbank `nexus_e2e` eine eingereichte Bewerbung an und gibt deren ID aus (argv: guildId applicationId userId name). */
const { PrismaClient } = createRequire(`${process.cwd()}/packages/database/package.json`)(
  '@prisma/client',
);
const base = /^DATABASE_URL="?([^"\n]*)"?/m.exec(readFileSync('.env', 'utf8'))?.[1];
const url = new URL(base);
url.pathname = '/nexus_e2e';
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
const [guildId, applicationId, userId, name] = process.argv.slice(2);
const version =
  (await prisma.applicationVersion.findFirst({ where: { applicationId } })) ??
  (await prisma.applicationVersion.create({
    data: { applicationId, version: 1, questions: [], publishedById: userId },
  }));
const mk = (status, number) =>
  prisma.applicationSubmission.create({
    data: {
      guildId,
      applicationId,
      versionId: version.id,
      userId,
      usernameSnapshot: name,
      displayNameSnapshot: name,
      status,
      submittedAt: new Date(),
      submissionNumber: number,
    },
  });
await mk('DENIED', 'POL-00001');
const s = await mk('SUBMITTED', 'POL-00002');
process.stdout.write(s.id);
await prisma.$disconnect();
