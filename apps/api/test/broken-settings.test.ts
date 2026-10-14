import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

/** Gespeicherte Einstellungen in altem/kaputtem Format dürfen weder die API (500) noch das Dashboard (Absturz) stören. */
let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent;
const KEYS = ['org.name', 'theme.accent', 'theme.customAccents', 'studio.customFields', 'team.structure', 'team.rankOrder', 'application.form', 'qualifications.config', 'auth.discord', 'discord.channels'];
const BROKEN: Prisma.InputJsonValue[] = [{}, 'kaputt', [1, 'x'], 42];

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'broken_admin', ['System Administrator']);
  admin = (await login(app, 'broken_admin')).agent;
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: { in: KEYS } } });
  await app.close();
});

describe('kaputte gespeicherte Einstellungen', () => {
  for (const value of BROKEN) {
    it(`falls back to defaults for ${JSON.stringify(value)}`, async () => {
      for (const key of KEYS) await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      const s = await admin.get('/api/v1/admin/settings');
      expect(s.status).toBe(200);
      // für diese Schlüssel ist keiner der Testwerte gültig → weggelassen, das Dashboard nimmt die Standardwerte
      for (const key of ['team.structure', 'auth.discord', 'application.form']) expect(s.body.settings[key], key).toBeUndefined();
      const studio = await admin.get('/api/v1/studio/config');
      expect(studio.status).toBe(200);
      expect(typeof studio.body.org.name).toBe('string');
      expect(Array.isArray(studio.body.customFields.persons)).toBe(true);
      expect(Array.isArray(studio.body.theme.customAccents)).toBe(true);
      const form = await admin.get('/api/v1/applications/form');
      expect(Array.isArray(form.body)).toBe(true);
      expect(form.body.length).toBeGreaterThan(0);
      const setup = await admin.get('/api/v1/qualifications/config');
      expect(Array.isArray(setup.body.policeForm) && Array.isArray(setup.body.units)).toBe(true);
      const roster = await admin.get('/api/v1/team/roster');
      expect(roster.status).toBe(200);
      expect(Array.isArray(roster.body.structure.offices)).toBe(true);
    });
  }
});
