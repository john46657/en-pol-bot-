import { permissionRepository, prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { createUnit, saveType, startShift } from '@nexus/shifts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFahrzeug } from '../src/commands/fahrzeug.js';
import { runStrafe } from '../src/commands/strafe.js';

const G = 'fleetbot-guild';
const [LEAD, A] = ['900000000000120001', '900000000000120002'];

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.penaltyCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Fleet', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-lead', ['fleet.view', 'fleet.report', 'fleet.manage', 'penalties.view', 'penalties.issue', 'penalties.revoke'].map(e), { name: 'Leitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-cop', ['fleet.view', 'fleet.report', 'penalties.view', 'penalties.issue'].map(e), { name: 'Beamter' });
  const type = await saveType(G, { name: 'Streife' }, 'x');
  const rank = await saveRank(G, { name: 'Kommissar', order: 1, isEntry: true }, 'x');
  await createRecord({ guildId: G, userId: A, rpName: 'Anna', actorId: 'x', rankId: rank.id });
  await startShift({ guildId: G, userId: A, typeId: type.id, memberRoleIds: [] });
  await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' });
});
afterAll(async () => {
  await prisma.penaltyCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function mk(run: (i: any) => Promise<void>) {
  return (userId: string, roles: string[], sub: string, opts: { str?: Record<string, string>; int?: Record<string, number>; user?: string } = {}) => {
    const replies: any[] = [];
    const i: any = {
      guild: { id: G },
      member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
      user: { id: userId },
      options: {
        getSubcommand: () => sub,
        getString: (n: string, req?: boolean) => opts.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null),
        getInteger: (n: string) => opts.int?.[n] ?? null,
        getUser: () => (opts.user ? { id: opts.user } : null),
      },
      reply: vi.fn(async (o: any) => void replies.push(o)),
      replies,
    };
    return run(i).then(() => JSON.stringify(replies[0]));
  };
}
const fz = mk(runFahrzeug);
const st = mk(runStrafe);

describe('/fahrzeug', () => {
  it('Fuhrpark-Ablauf: neu → zuweisen (eigene Einheit) → Schaden → Werkstatt → Reparatur', async () => {
    expect(await fz(LEAD, ['role-lead'], 'neu', { str: { kennzeichen: 'LS-PD 1', typ: 'Streifenwagen' } })).toContain('aufgenommen');
    expect(await fz(A, ['role-cop'], 'neu', { str: { kennzeichen: 'LS-PD 2', typ: 'x' } })).toContain('Du benötigst');
    expect(await fz(LEAD, ['role-lead'], 'zuweisen', { str: { kennzeichen: 'lspd1', einheit: (await prisma.unit.findFirstOrThrow({ where: { guildId: G } })).id }, user: A })).toContain('Im Dienst');
    expect(await fz(A, ['role-cop'], 'info', { str: { kennzeichen: 'LS-PD 1' } })).toContain('Adam 1');
    expect(await fz(A, ['role-cop'], 'schaden', { str: { kennzeichen: 'LS-PD 1', beschreibung: 'Motorschaden', stufe: 'MAJOR' } })).toContain('Werkstatt');
    expect(await fz(LEAD, ['role-lead'], 'reparatur', { str: { kennzeichen: 'LS-PD 1' } })).toContain('Verfügbar');
    expect(await fz(A, ['role-cop'], 'liste')).toContain('LS-PD 1');
    expect(await fz(LEAD, ['role-lead'], 'info', { str: { kennzeichen: 'XX 99' } })).toContain('Kein Fahrzeug');
  });
});

describe('/strafe', () => {
  it('ausstellen → Akte → Register → aufheben (Aussteller darf, Fremder nicht)', async () => {
    const out = await st(A, ['role-cop'], 'ausstellen', { str: { art: 'FINE', name: 'Max Mustermann', grund: 'Rotlicht' }, int: { betrag: 500 } });
    expect(out).toContain('S-0001');
    expect(out).toContain('Personalakte');
    expect(await st(A, ['role-cop'], 'ausstellen', { str: { art: 'FINE', name: 'Max Mustermann', grund: 'Rotlicht' } })).toContain('Betrag');
    await st(A, ['role-cop'], 'ausstellen', { str: { art: 'POINTS', name: 'max mustermann', grund: 'Raser' }, int: { punkte: 8 } });
    const reg = await st(LEAD, ['role-lead'], 'register', { str: { name: 'Max Mustermann' } });
    expect(reg).toContain('500 $');
    expect(reg).toContain('Grenze erreicht');
    expect(await st(LEAD, ['role-lead'], 'ausstellen', { str: { art: 'WARNING', name: 'Erika', grund: 'Lärm' } })).toContain('S-0003');
    expect(await st(A, ['role-cop'], 'aufheben', { str: { nummer: 'S-0003', grund: 'Irrtum' } })).toContain('Du benötigst'); // fremde Strafe
    expect(await st(A, ['role-cop'], 'aufheben', { str: { nummer: 'S-0001', grund: 'Eigener Fehler' } })).toContain('aufgehoben');
    expect(await st(LEAD, ['role-lead'], 'aufheben', { str: { nummer: 'S-0003', grund: 'Irrtum' } })).toContain('aufgehoben');
    expect(await st(A, ['role-cop'], 'liste', { str: { suche: 'mustermann' } })).toContain('S-0002');
  });
  it('ohne Recht', async () => {
    expect(await st(A, [], 'register', { str: { name: 'X' } })).toContain('Du benötigst');
    expect(await st(A, [], 'ausstellen', { str: { art: 'WARNING', name: 'X', grund: 'xxx' } })).toContain('Du benötigst');
    expect(await prisma.penalty.count({ where: { guildId: G } })).toBe(0);
  });
});
