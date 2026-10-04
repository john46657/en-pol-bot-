import { permissionRepository, prisma } from '@nexus/database';
import { saveType, startShift } from '@nexus/shifts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStreife } from '../src/commands/streife.js';

const G = 'streife-guild';
const [A, B] = ['9000000000000000b1', '9000000000000000b2'];
let typeId = '';

async function setup() {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Streife', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-ok', ['duty.view', 'duty.unit.join'].map(e), { name: 'Beamter' });
  await permissionRepository.setPermissionsForRole(G, 'role-none', [e('own.shift.view')], { name: 'Ohne' });
  typeId = (await saveType(G, { name: 'Streife' }, 'x')).id;
  for (const u of [A, B]) await startShift({ guildId: G, userId: u, typeId, memberRoleIds: [] });
}

function call(userId: string, roles: string[], sub: string, opts: Record<string, string> = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: { getSubcommand: () => sub, getString: (n: string, req?: boolean) => opts[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null), getUser: () => null },
    reply: vi.fn(async (o: any) => void replies.push(o)),
    replies,
  };
  return runStreife(i).then(() => JSON.stringify(replies[0]));
}

beforeEach(setup);
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('/streife', () => {
  it('bilden → beitreten → status → übersicht → verlassen', async () => {
    expect(await call(A, ['role-ok'], 'bilden', { rufname: 'Adam 1', fahrzeug: 'Streifenwagen' })).toContain('gebildet');
    const unit = await prisma.unit.findFirstOrThrow({ where: { guildId: G, activeKey: 'active' } });
    expect(await call(B, ['role-ok'], 'beitreten', { einheit: unit.id })).toContain('Adam 1');
    expect(await call(A, ['role-ok'], 'status', { status: 'BUSY', standort: 'Bank' })).toContain('Im Einsatz');
    const o = await call(B, ['role-ok'], 'übersicht');
    expect(o).toContain('Adam 1');
    expect(o).toContain('2 im Dienst');
    expect(o).toContain('1 im Einsatz');
    expect(await call(B, ['role-ok'], 'verlassen')).toContain('verlassen');
    expect(await call(B, ['role-ok'], 'verlassen')).toContain('in keiner Einheit');
  });

  it('ohne Schicht keine Streife; ohne Recht verständliche Meldung', async () => {
    await prisma.shift.updateMany({ where: { guildId: G, userId: A }, data: { status: 'ENDED', openKey: null, endedAt: new Date(), durationSeconds: 0 } });
    expect(await call(A, ['role-ok'], 'bilden', { rufname: 'Adam 1' })).toContain('nicht im Dienst');
    expect(await call(B, ['role-none'], 'übersicht')).toContain('Du benötigst');
    expect(await call(B, ['role-none'], 'bilden', { rufname: 'X 1' })).toContain('Du benötigst');
  });
});
