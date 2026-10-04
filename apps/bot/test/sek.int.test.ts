import { permissionRepository, prisma } from '@nexus/database';
import { createRecord, saveRank, saveTeam } from '@nexus/personnel';
import { saveQualification } from '@nexus/qualifications';
import { saveConfig } from '@nexus/sek';
import { saveType } from '@nexus/shifts';
import { saveCourse } from '@nexus/training';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSek } from '../src/commands/sek.js';

const G = 'sekbot-guild';
const [LEAD, A] = ['900000000000200001', '900000000000200002'];

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.sekConfig.deleteMany({ where: { guildId: G } });
  await prisma.operationCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'SEK', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-lead', ['sek.view', 'sek.member.manage', 'sek.training.manage', 'sek.training.view'].map(e), { name: 'SEK-Leitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-mate', ['sek.view'].map(e), { name: 'SEK-Mitglied' });
  const rank = await saveRank(G, { name: 'Beamter', order: 1, isEntry: true }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: rank.id });
  const team = await saveTeam(G, { name: 'SEK' }, 'x');
  const course = await saveCourse(G, { name: 'SEK-Grundkurs', theoryMax: 100 }, 'x');
  const qual = await saveQualification(G, { name: 'SEK', requirements: [{ type: 'COURSE', courseId: course.id }] }, 'x');
  const type = await saveType(G, { name: 'SEK-Dienst' }, 'x');
  await saveConfig(G, { teamId: team.id, qualificationId: qual.id, shiftTypeId: type.id, courseIds: [course.id] }, 'x');
});
afterAll(async () => {
  await prisma.sekConfig.deleteMany({ where: { guildId: G } });
  await prisma.operationCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, o: { str?: Record<string, string>; user?: string; bool?: boolean } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: { getSubcommand: () => sub, getString: (n: string, req?: boolean) => o.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null), getUser: (n: string) => (o.user ? { id: o.user } : null), getBoolean: () => o.bool ?? null },
    reply: vi.fn(async (x: any) => void replies.push(x)),
    replies,
  };
  return runSek(i).then(() => JSON.stringify(replies[0]));
}

describe('/sek', () => {
  it('Aufnahme (Ausnahme) → Einsatzteam → SEK-Einsatz → Team zuordnen → Ausbildung → Statistik', async () => {
    expect(await call(LEAD, ['role-lead'], 'aufnehmen', { user: A })).toContain('Voraussetzungen nicht erfüllt');
    expect(await call(LEAD, ['role-lead'], 'aufnehmen', { user: A, bool: true, str: { grund: 'Quereinsteiger' } })).toContain('ist jetzt im SEK');
    expect(await call(A, ['role-mate'], 'mitglieder')).toContain('Anna');
    expect(await call(LEAD, ['role-lead'], 'team', { str: { name: 'Alpha' } })).toContain('Alpha');
    expect(await call(LEAD, ['role-lead'], 'team-mitglied', { str: { team: 'alpha', funktion: 'Scharfschütze' }, user: A })).toContain('eingetragen');
    expect(await call(LEAD, ['role-lead'], 'einsatz', { str: { art: 'Geiselnahme', ort: 'Bank' } })).toContain('E-0001');
    expect(await call(LEAD, ['role-lead'], 'einsatz-team', { str: { nummer: 'E-0001', team: 'Alpha' } })).toContain('Alpha');
    expect(await call(LEAD, ['role-lead'], 'ausbildung-neu', { str: { ausbildung: 'SEK-Grundkurs', termin: '15.12.2099 18:00' } })).toContain('T-0001');
    expect(await call(A, ['role-mate'], 'übersicht')).toContain('Einsatzteams');
    expect(await call(A, ['role-mate'], 'statistik')).toContain('SEK-Statistik');
  });
  it('Rechte: SEK-Mitglied darf nicht verwalten; Fremde sehen nichts', async () => {
    expect(await call(A, ['role-mate'], 'aufnehmen', { user: A, bool: true, str: { grund: 'x' } })).toContain('Du benötigst');
    expect(await call(A, ['role-mate'], 'funk')).toContain('Du benötigst');
    expect(await call(A, [], 'mitglieder')).toContain('Du benötigst');
    expect(await call(LEAD, ['role-lead'], 'ausbildung-neu', { str: { ausbildung: 'Gibtsnicht', termin: '15.12.2099 18:00' } })).toContain('keine SEK-Ausbildung');
  });
});
