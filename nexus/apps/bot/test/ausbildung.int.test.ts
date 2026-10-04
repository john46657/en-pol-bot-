import { permissionRepository, prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { saveCourse } from '@nexus/training';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAusbildung } from '../src/commands/ausbildung.js';

const G = 'ausbildung-guild';
const [TR, A, B] = ['900000000000140001', '900000000000140002', '900000000000140003'];

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.trainingCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Ausbildung', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-trainer', ['training.view', 'training.create', 'training.session.manage', 'exam.manage'].map(e), { name: 'Ausbilder' });
  await permissionRepository.setPermissionsForRole(G, 'role-own', [e('own.training.view')], { name: 'Beamter' });
  const rank = await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: rank.id });
  await saveCourse(G, { name: 'Grundausbildung', theoryMax: 50, practiceMax: 50, passPercent: 60, maxParticipants: 5 }, 'x');
});
afterAll(async () => {
  await prisma.trainingCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, o: { str?: Record<string, string>; int?: Record<string, number>; user?: string } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: {
      getSubcommand: () => sub,
      getString: (n: string, req?: boolean) => o.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null),
      getInteger: (n: string) => o.int?.[n] ?? null,
      getUser: () => ({ id: o.user }),
    },
    reply: vi.fn(async (x: any) => void replies.push(x)),
    replies,
  };
  return runAusbildung(i).then(() => JSON.stringify(replies[0]));
}

describe('/ausbildung', () => {
  it('Termin → Anmeldung → Start → Bewertung → bestanden → Akte → Ende', async () => {
    expect(await call(TR, ['role-trainer'], 'neu', { str: { ausbildung: 'grundausbildung', termin: '15.12.2099 18:00' } })).toContain('T-0001');
    expect(await call(A, ['role-own'], 'liste')).toContain('Grundausbildung');
    expect(await call(A, ['role-own'], 'anmelden', { str: { nummer: 'T-0001' } })).toContain('Angemeldet');
    expect(await call(A, ['role-own'], 'anmelden', { str: { nummer: '1' } })).toContain('Bereits angemeldet');
    expect(await call(A, ['role-own'], 'info', { str: { nummer: '1' } })).toContain('Teile / Bestehen');
    expect(await call(TR, ['role-trainer'], 'start', { str: { nummer: '1' } })).toContain('Läuft');
    expect(await call(TR, ['role-trainer'], 'bewerten', { str: { nummer: '1', teil: 'THEORY' }, int: { punkte: 40 }, user: A })).toContain('noch offen: Praxis');
    expect(await call(TR, ['role-trainer'], 'bewerten', { str: { nummer: '1', teil: 'PRACTICE' }, int: { punkte: 35 }, user: A })).toContain('bestanden');
    expect(await prisma.personnelEntry.count({ where: { guildId: G, kind: 'TRAINING' } })).toBe(1);
    expect(await call(A, ['role-own'], 'meine')).toContain('Grundausbildung (75 %)');
    expect(await call(TR, ['role-trainer'], 'ende', { str: { nummer: '1' } })).toContain('Beendet');
  });
  it('Rechte: Beamter darf nicht bewerten/anlegen; Fremder Ausbilder darf nicht bewerten; ohne Recht nichts', async () => {
    await call(TR, ['role-trainer'], 'neu', { str: { ausbildung: 'Grundausbildung', termin: '15.12.2099 18:00' } });
    expect(await call(A, ['role-own'], 'neu', { str: { ausbildung: 'Grundausbildung', termin: '15.12.2099 18:00' } })).toContain('Du benötigst');
    await call(A, ['role-own'], 'anmelden', { str: { nummer: '1' } });
    await call(TR, ['role-trainer'], 'start', { str: { nummer: '1' } });
    expect(await call(A, ['role-own'], 'bewerten', { str: { nummer: '1', teil: 'THEORY' }, int: { punkte: 50 }, user: A })).toContain('Du benötigst');
    expect(await call(B, ['role-trainer'], 'bewerten', { str: { nummer: '1', teil: 'THEORY' }, int: { punkte: 50 }, user: A })).toContain('Nur die Ausbilder');
    expect(await call(B, [], 'liste')).toContain('Du benötigst');
    expect(await call(TR, ['role-trainer'], 'neu', { str: { ausbildung: 'Grundausbildung', termin: 'bald' } })).toContain('TT.MM.JJJJ');
  });
});
