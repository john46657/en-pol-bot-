import { permissionRepository, prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { saveQualification } from '@nexus/qualifications';
import { saveCourse } from '@nexus/training';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runQualifikation } from '../src/commands/qualifikation.js';

const G = 'qualbot-guild';
const [LEAD, A] = ['900000000000160001', '900000000000160002'];

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Qual', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-lead', ['qualification.view', 'qualification.manage'].map(e), { name: 'Leitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-own', [e('own.training.view')], { name: 'Beamter' });
  const rank = await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: rank.id });
  const c = await saveCourse(G, { name: 'SEK-Grundkurs', theoryMax: 100 }, 'x');
  await saveQualification(G, { name: 'SEK', description: 'Spezialeinsatz', requirements: [{ type: 'COURSE', courseId: c.id }, { type: 'SERVICE_DAYS', days: 5 }] }, 'x');
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, o: { str?: Record<string, string>; bool?: boolean; user?: string } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: { getSubcommand: () => sub, getString: (n: string, req?: boolean) => o.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null), getBoolean: () => o.bool ?? null, getUser: (n: string, req?: boolean) => (o.user ? { id: o.user } : null) },
    reply: vi.fn(async (x: any) => void replies.push(x)),
    replies,
  };
  return runQualifikation(i).then(() => JSON.stringify(replies[0]));
}

describe('/qualifikation', () => {
  it('liste, prüfen (eigene), Vergabe nur mit Ausnahme, meine, entziehen', async () => {
    expect(await call(A, ['role-own'], 'liste')).toContain('Du benötigst'); // liste: qualification.view
    expect(await call(LEAD, ['role-lead'], 'liste')).toContain('SEK');
    const check = await call(A, ['role-own'], 'pruefen', { str: { qualifikation: 'sek' } });
    expect(check).toContain('noch nicht erfüllt');
    expect(check).toContain('SEK-Grundkurs');
    expect(await call(A, ['role-own'], 'pruefen', { str: { qualifikation: 'sek' }, user: LEAD })).toContain('Du benötigst'); // fremde Prüfung
    expect(await call(LEAD, ['role-lead'], 'vergeben', { str: { qualifikation: 'SEK' }, user: A })).toContain('Voraussetzungen nicht erfüllt');
    expect(await call(LEAD, ['role-lead'], 'vergeben', { str: { qualifikation: 'SEK', grund: 'Leitungsentscheid' }, user: A, bool: true })).toContain('Ausnahme protokolliert');
    expect(await call(A, ['role-own'], 'meine')).toContain('SEK');
    expect(await call(A, ['role-own'], 'vergeben', { str: { qualifikation: 'SEK' }, user: A })).toContain('Du benötigst');
    expect(await call(LEAD, ['role-lead'], 'entziehen', { str: { qualifikation: 'SEK', grund: 'Lizenz weg' }, user: A })).toContain('entzogen');
    expect(await call(A, ['role-own'], 'meine')).toContain('Noch keine');
    expect(await call(LEAD, ['role-lead'], 'info', { str: { qualifikation: 'gibtsnicht' } })).toContain('gibt es nicht');
  });
});
