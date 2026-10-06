import 'reflect-metadata';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/auth/password';
import { seedBase, seedTickets } from '../src/seed/seed-lib';

export const PASSWORD = 'correct-horse-battery-staple';

export async function createTestApp(override?: (b: TestingModuleBuilder) => TestingModuleBuilder) {
  process.env.NODE_ENV = 'test';
  process.env.ROBLOX_LOOKUP ??= 'off'; // nur test/roblox.test.ts fragt (gemockt) bei Roblox nach
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const mod = await (override ? override(builder) : builder).compile();
  const app: INestApplication = mod.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await seedBase(prisma);
  await seedTickets(prisma);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

export async function makeUser(prisma: PrismaService, username: string, roleNames: string[] = []) {
  const roles = await prisma.role.findMany({ where: { name: { in: roleNames } } });
  return prisma.user.create({
    data: { username, displayName: username, passwordHash: await hashPassword(PASSWORD), roles: { create: roles.map((r) => ({ roleId: r.id })) } },
  });
}

/** Meldet an und liefert einen Request-Agent mit Session-Cookie. */
export async function login(app: INestApplication, username: string, password = PASSWORD): Promise<{ agent: ReturnType<typeof request.agent>; res: request.Response }> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/v1/auth/login').send({ username, password });
  return { agent, res };
}
