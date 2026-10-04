import { permissionRepository, prisma } from '@nexus/database';
import { addEntry, createRecord, saveRank, saveTeam, setServiceNumber } from '@nexus/personnel';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAkte } from '../src/commands/akte.js';

const G = 'akte-guild';
const U = {
  owner: 'u-owner',
  lead: 'u-lead',
  mate: 'u-mate',
  other: 'u-other',
  nobody: 'u-nobody',
  self: 'u-self',
};
const num = (n: string) => `9000000000000000${n}`;
const ID = {
  lead: num('01'),
  mate: num('02'),
  other: num('03'),
  nobody: num('04'),
  staff: num('05'),
};

async function setup() {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Akte', settings: { create: {} } } });
  const rank = await saveRank(G, { name: 'Kommissar', order: 3 }, 'x');
  const t1 = await saveTeam(G, { name: 'Streife' }, 'x');
  const t2 = await saveTeam(G, { name: 'SEK' }, 'x');
  const mk = (userId: string, rpName: string, teamId: string) =>
    createRecord({ guildId: G, userId, rpName, actorId: 'x', rankId: rank.id, teamId });
  const lead = await mk(ID.lead, 'Lena Leitung', t1.id);
  const mate = await mk(ID.mate, 'Max Mitarbeiter', t1.id);
  const other = await mk(ID.other, 'Olga SEK', t2.id);
  await setServiceNumber(G, mate.id, 'EN-002', 'x');
  await addEntry(G, mate.id, { kind: 'AWARD', title: 'Beamter des Monats' }, 'x');
  await addEntry(G, mate.id, { kind: 'DISCIPLINE', title: 'Verwarnung Funk' }, 'x');
  const e = (key: string, scope: 'SERVER' | 'TEAM' = 'SERVER') => ({
    key,
    effect: 'ALLOW' as const,
    scope,
    scopeRef: '',
  });
  await permissionRepository.setPermissionsForRole(
    G,
    'role-lead',
    [e('personnel.view', 'TEAM'), e('personnel.note.view', 'TEAM')],
    { name: 'Teamleitung' },
  );
  await permissionRepository.setPermissionsForRole(
    G,
    'role-staff',
    [e('personnel.view'), e('personnel.discipline.view')],
    { name: 'Personal' },
  );
  await permissionRepository.setPermissionsForRole(G, 'role-own', [e('own.profile.view')], {
    name: 'Beamter',
  });
  return { lead, mate, other };
}

function call(userId: string, roleIds: string[], targetId?: string, admin = false) {
  const replies: any[] = [];
  const member = {
    id: userId,
    guild: { id: G, ownerId: admin ? userId : 'someone' },
    roles: { cache: new Map(roleIds.map((r) => [r, {}])) },
    permissions: { has: () => false },
  };
  const i: any = {
    guild: { id: G },
    member,
    user: { id: userId },
    options: { getUser: () => (targetId ? { id: targetId } : null) },
    reply: vi.fn(async (o: any) => {
      replies.push(o);
    }),
    replies,
  };
  return runAkte(i).then(() => i);
}
const text = (i: any) => JSON.stringify(i.replies[0]);

beforeEach(async () => {
  await setup();
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('/akte', () => {
  it('Personal sieht fremde Akten inkl. Disziplin', async () => {
    const i = await call(ID.staff, ['role-staff'], ID.mate);
    const t = text(i);
    expect(t).toContain('Max Mitarbeiter');
    expect(t).toContain('EN-002');
    expect(t).toContain('Kommissar');
    expect(t).toContain('Beamter des Monats');
    expect(t).toContain('Verwarnung Funk');
  });

  it('Teamleitung: eigenes Team ja (ohne Disziplin), fremdes Team verweigert mit verständlicher Meldung', async () => {
    const ok = await call(ID.lead, ['role-lead'], ID.mate);
    expect(text(ok)).toContain('Max Mitarbeiter');
    expect(text(ok)).not.toContain('Verwarnung Funk');
    const denied = await call(ID.lead, ['role-lead'], ID.other);
    expect(text(denied)).toContain('Du benötigst: Personalakten ansehen');
    expect(text(denied)).not.toContain('Olga');
  });

  it('Beamter: eigene Akte ja, fremde nein', async () => {
    const own = await call(ID.mate, ['role-own']);
    expect(text(own)).toContain('Max Mitarbeiter');
    expect(text(own)).not.toContain('Verwarnung');
    const foreign = await call(ID.mate, ['role-own'], ID.lead);
    expect(text(foreign)).toContain('Du benötigst');
  });

  it('ohne Rechte wird nicht verraten, ob es eine Akte gibt; eigene fehlende Akte wird freundlich gemeldet', async () => {
    const withNoRecord = await call(ID.nobody, [], ID.other);
    const withRecord = await call(ID.nobody, [], ID.mate);
    expect(text(withNoRecord)).toContain('Du benötigst');
    expect(text(withRecord)).toContain('Du benötigst');
    const self = await call(ID.nobody, ['role-own']);
    expect(text(self)).toContain('noch keine Personalakte');
  });

  it('Server-Besitzer/Administratoren sehen alles', async () => {
    const i = await call(num('06'), [], ID.other, true);
    expect(text(i)).toContain('Olga SEK');
  });
});
