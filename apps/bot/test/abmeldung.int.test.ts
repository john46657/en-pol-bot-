import { berlinToday, fmtDay } from '@nexus/absences';
import { permissionRepository, prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { saveType } from '@nexus/shifts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAbmeldung } from '../src/commands/abmeldung.js';
import { runSchicht } from '../src/commands/schicht.js';

const G = 'abmeldung-guild';
const [HEAD, A] = ['900000000000240001', '900000000000240002'];
const day = (n: number) => fmtDay(new Date(berlinToday().getTime() + n * 86_400_000));
let typeId = '';

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.absenceCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Abmeldung', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-head', ['absence.view', 'absence.manage'].map(e), { name: 'Leitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-own', ['own.absence.create', 'shifts.start', 'shifts.end', 'own.shift.view'].map(e), { name: 'Beamter' });
  const rank = await saveRank(G, { name: 'Beamter', order: 1, isEntry: true }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: rank.id });
  typeId = (await saveType(G, { name: 'Streife' }, 'x')).id;
});
afterAll(async () => {
  await prisma.absenceCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function mk(run: (i: any) => Promise<void>) {
  return (userId: string, roles: string[], sub: string, o: { str?: Record<string, string>; user?: string } = {}) => {
    const replies: any[] = [];
    const i: any = {
      guild: { id: G },
      member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
      user: { id: userId, username: 'u' },
      options: { getSubcommand: () => sub, getString: (n: string, req?: boolean) => o.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null), getUser: () => (o.user ? { id: o.user } : null) },
      reply: vi.fn(async (x: any) => void replies.push(x)),
      replies,
    };
    return run(i).then(() => JSON.stringify(replies[0]));
  };
}
const ab = mk(runAbmeldung);
const sch = mk(runSchicht);

describe('/abmeldung', () => {
  it('beantragen → genehmigen → Schichtstart gesperrt → zurückmelden → Schicht möglich; Akte', async () => {
    const out = await ab(A, ['role-own'], 'neu', { str: { von: day(0), bis: day(3), grund: 'Familienfeier' } });
    expect(out).toContain('A-0001');
    expect(await ab(A, ['role-own'], 'liste')).toContain('Du benötigst');
    expect(await ab(HEAD, ['role-head'], 'liste')).toContain('A-0001');
    expect(await ab(A, ['role-own'], 'genehmigen', { str: { nummer: 'A-0001' } })).toContain('Du benötigst');
    expect(await ab(HEAD, ['role-head'], 'genehmigen', { str: { nummer: '1' } })).toContain('genehmigt');
    expect(await prisma.personnelEntry.count({ where: { guildId: G, kind: 'ABSENCE' } })).toBe(1);
    expect(await ab(HEAD, ['role-head'], 'aktiv')).toContain(`<@${A}>`);
    expect(await sch(A, ['role-own'], 'start', { str: { typ: typeId } })).toContain('abgemeldet');
    expect(await ab(A, ['role-own'], 'zurueckziehen', { str: { nummer: '1' } })).toContain('läuft bereits');
    expect(await ab(A, ['role-own'], 'zurueck')).toContain('Willkommen zurück');
    expect(await sch(A, ['role-own'], 'start', { str: { typ: typeId } })).toContain('Schicht gestartet');
    expect(await ab(A, ['role-own'], 'meine')).toContain('vorzeitig beendet');
  });
  it('Validierung und Ablehnung', async () => {
    expect(await ab(A, ['role-own'], 'neu', { str: { von: 'morgen', bis: day(2), grund: 'xxx' } })).toContain('TT.MM.JJJJ');
    expect(await ab(A, ['role-own'], 'neu', { str: { von: day(5), bis: day(2), grund: 'Urlaub' } })).toContain('Ende liegt vor dem Beginn');
    await ab(A, ['role-own'], 'neu', { str: { von: day(5), bis: day(7), grund: 'Urlaub' } });
    expect(await ab(HEAD, ['role-head'], 'ablehnen', { str: { nummer: '1' } })).toContain('Bitte einen Ablehnungsgrund');
    expect(await ab(HEAD, ['role-head'], 'ablehnen', { str: { nummer: '1', grund: 'Personalmangel' } })).toContain('abgelehnt');
    expect(await ab(A, ['role-own'], 'historie')).toContain('abgelehnt');
    expect(await ab(HEAD, ['role-head'], 'historie', { user: A })).toContain('A-0001');
  });
});
