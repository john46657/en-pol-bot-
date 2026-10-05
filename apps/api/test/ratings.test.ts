import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { prisma } from '@nexus/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RatingsService, ratingFieldsOf } from '../src/modules/applications/services/ratings.service.js';

const G = 'ratings-guild';
const [A, B] = ['900000000000500001', '900000000000500002'];
const svc = new RatingsService();
let sub = '';
let draft = '';
let plain = '';

beforeAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Bewertung', settings: { create: {} } } });
  const rated = await prisma.application.create({
    data: { guildId: G, name: 'Moderation', slug: 'mod', createdBy: 'x', updatedBy: 'x', config: { rating: { fields: [{ id: 'kommunikation', label: 'Kommunikation', max: 5 }, { id: 'erfahrung', label: 'Erfahrung', max: 10 }] } } },
  });
  const unrated = await prisma.application.create({ data: { guildId: G, name: 'Support', slug: 'sup', createdBy: 'x', updatedBy: 'x', config: {} } });
  const versions = new Map<string, string>();
  const version = async (applicationId: string) => {
    if (!versions.has(applicationId)) versions.set(applicationId, (await prisma.applicationVersion.create({ data: { applicationId, version: 1, questions: [], publishedById: 'x' } })).id);
    return versions.get(applicationId)!;
  };
  const mk = async (applicationId: string, submitted: boolean) =>
    (await prisma.applicationSubmission.create({ data: { guildId: G, applicationId, versionId: await version(applicationId), userId: '900000000000500009', usernameSnapshot: 'u', displayNameSnapshot: 'U', status: submitted ? 'SUBMITTED' : 'STARTED', ...(submitted ? { submittedAt: new Date() } : {}) } })).id;
  sub = await mk(rated.id, true);
  draft = await mk(rated.id, false);
  plain = await mk(unrated.id, true);
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Interne Bewertung', () => {
  it('Felder kommen aus der Konfiguration; ohne Felder oder bei ungültiger Konfiguration ist die Bewertung aus', () => {
    expect(ratingFieldsOf({ rating: { fields: [{ id: 'a', label: 'A' }] } })).toEqual([{ id: 'a', label: 'A', max: 5 }]);
    expect(ratingFieldsOf({})).toEqual([]);
    expect(ratingFieldsOf({ rating: { fields: [{ id: 'A B', label: 'x' }] } })).toEqual([]);
  });

  it('jeder bewertet nur sich selbst; Mittelwerte je Feld und insgesamt (normiert)', async () => {
    await svc.setMine(G, sub, A, { kommunikation: 5, erfahrung: 8 });
    const r = await svc.setMine(G, sub, B, { kommunikation: 3, erfahrung: 6 });
    expect(r.mine).toEqual({ kommunikation: 3, erfahrung: 6 });
    expect(r.reviewers).toHaveLength(2);
    expect(r.averages).toEqual({ kommunikation: 4, erfahrung: 7 });
    expect(r.overallPercent).toBe(75); // (4/5 + 7/10) / 2 = 75 %
    expect((await svc.get(G, sub, A)).mine).toEqual({ kommunikation: 5, erfahrung: 8 });
  });

  it('Werte prüfen, einzelne Felder entfernen, Änderungen im Verlauf', async () => {
    await expect(svc.setMine(G, sub, A, { kommunikation: 6 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setMine(G, sub, A, { kommunikation: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setMine(G, sub, A, { kommunikation: 2.5 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setMine(G, sub, A, { unbekannt: 3 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setMine(G, sub, A, [1, 2] as never)).rejects.toBeInstanceOf(BadRequestException);
    const r = await svc.setMine(G, sub, A, { erfahrung: null });
    expect(r.mine).toEqual({ kommunikation: 5 });
    expect(r.averages['erfahrung']).toBe(6); // nur noch B
    const ev = await prisma.applicationAuditEvent.findMany({ where: { submissionId: sub, action: 'submission.rated' }, orderBy: { createdAt: 'asc' } });
    expect(ev.length).toBeGreaterThanOrEqual(3);
    expect(ev.at(-1)).toMatchObject({ actorId: A, before: { kommunikation: 5, erfahrung: 8 }, after: { kommunikation: 5 } });
  });

  it('nur eingereichte Bewerbungen, nur mit eingerichteten Feldern, nur im eigenen Server', async () => {
    await expect(svc.setMine(G, draft, A, { kommunikation: 3 })).rejects.toThrow(/erst nach dem Einreichen/);
    await expect(svc.setMine(G, plain, A, { kommunikation: 3 })).rejects.toThrow(/keine Bewertung eingerichtet/);
    expect((await svc.get(G, plain, A)).enabled).toBe(false);
    await expect(svc.get('anderer-server', sub, A)).rejects.toBeInstanceOf(NotFoundException);
  });
});
