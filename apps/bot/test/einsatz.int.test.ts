import { permissionRepository, prisma } from '@nexus/database';
import { createRecord, saveRank } from '@nexus/personnel';
import { createUnit, saveType, startShift } from '@nexus/shifts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runEinsatz } from '../src/commands/einsatz.js';

const G = 'einsatz-guild';
const [LEAD, A, B] = ['900000000000080001', '900000000000080002', '900000000000080003'];
let unitId = '';

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.operationCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Einsatz', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-lead', ['operations.view', 'operations.create', 'operations.manage'].map(e), { name: 'Leitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-ok', ['operations.view', 'operations.create'].map(e), { name: 'Beamter' });
  const type = await saveType(G, { name: 'Streife' }, 'x');
  const rank = await saveRank(G, { name: 'Kommissar', order: 1, isEntry: true }, 'x');
  for (const u of [A, B]) {
    await createRecord({ guildId: G, userId: u, rpName: u === A ? 'Anna' : 'Bert', actorId: 'x', rankId: rank.id });
    await startShift({ guildId: G, userId: u, typeId: type.id, memberRoleIds: [] });
  }
  unitId = (await createUnit({ guildId: G, userId: A, callsign: 'Adam 1' })).id;
});
afterAll(async () => {
  await prisma.operationCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, opts: { str?: Record<string, string>; bool?: boolean; user?: string } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: {
      getSubcommand: () => sub,
      getString: (n: string, req?: boolean) => opts.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null),
      getBoolean: () => opts.bool ?? null,
      getUser: () => ({ id: opts.user }),
    },
    reply: vi.fn(async (o: any) => void replies.push(o)),
    replies,
  };
  return runEinsatz(i).then(() => JSON.stringify(replies[0]));
}

describe('/einsatz', () => {
  it('kompletter Einsatz: neu → zuweisen (eigene Einheit) → status → abschließen → Akte', async () => {
    expect(await call(B, ['role-ok'], 'neu', { str: { art: 'Raub', ort: 'Bank', prioritaet: 'URGENT' } })).toContain('E-0001');
    expect(await call(B, ['role-ok'], 'zuweisen', { str: { nummer: 'E-0001', einheit: unitId } })).toContain('Du benötigst'); // nicht in der Einheit
    expect(await call(A, ['role-ok'], 'zuweisen', { str: { nummer: 'E-0001', einheit: unitId } })).toContain('Adam 1');
    expect(await call(A, ['role-ok'], 'status', { str: { nummer: '1', status: 'ACTIVE' } })).toContain('Aktiv');
    expect(await call(A, ['role-ok'], 'status', { str: { nummer: '1', status: 'COMPLETED' } })).toContain('Abschlussbericht nötig');
    const done = await call(A, ['role-ok'], 'status', { str: { nummer: '1', status: 'COMPLETED', bericht: 'Täter gestellt, Beute sichergestellt.' } });
    expect(done).toContain('Personalakte');
    expect(await prisma.personnelEntry.count({ where: { guildId: G, kind: 'OPERATION' } })).toBe(1);
    expect(await call(B, ['role-ok'], 'info', { str: { nummer: 'E-0001' } })).toContain('Abschlussbericht');
    expect(await call(B, ['role-ok'], 'liste')).toContain('Keine Einsätze');
    expect(await call(B, ['role-ok'], 'liste', { bool: true })).toContain('Raub');
  });
  it('Rechte: ohne Recht nichts; Fremde dürfen den Status nicht ändern, Leitung schon', async () => {
    expect(await call(B, [], 'neu', { str: { art: 'x', ort: 'y' } })).toContain('Du benötigst');
    expect(await call(B, [], 'liste')).toContain('Du benötigst');
    await call(B, ['role-ok'], 'neu', { str: { art: 'Unfall', ort: 'A7' } });
    expect(await call(B, ['role-ok'], 'status', { str: { nummer: '1', status: 'ACTIVE' } })).toContain('Du benötigst');
    expect(await call(LEAD, ['role-lead'], 'zuweisen', { str: { nummer: '1', einheit: unitId } })).toContain('Adam 1');
    expect(await call(LEAD, ['role-lead'], 'status', { str: { nummer: '1', status: 'CANCELLED' } })).toContain('Abbruchgrund');
    expect(await call(LEAD, ['role-lead'], 'status', { str: { nummer: '1', status: 'CANCELLED', bericht: 'Fehlalarm' } })).toContain('Abgebrochen');
    expect(await call(LEAD, ['role-lead'], 'info', { str: { nummer: '99' } })).toContain('nicht gefunden');
  });
});
