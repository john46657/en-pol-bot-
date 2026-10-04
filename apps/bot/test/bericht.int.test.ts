import { permissionRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBericht } from '../src/commands/bericht.js';

const G = 'bericht-guild';
const [LEAD, A] = ['900000000000260001', '900000000000260002'];

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Bericht', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-view', [e('report.view')], { name: 'Ansicht' });
  await permissionRepository.setPermissionsForRole(G, 'role-mgr', ['report.view', 'report.manage'].map(e), { name: 'Leitung' });
  const type = await prisma.shiftType.create({ data: { guildId: G, name: 'Streife' } });
  const now = new Date();
  await prisma.shift.create({ data: { guildId: G, userId: A, typeId: type.id, startedAt: new Date(now.getTime() - 60_000), status: 'ENDED', endedAt: now, durationSeconds: 60 } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, o: { str?: Record<string, string>; bool?: boolean } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: { getSubcommand: () => sub, getString: (n: string) => o.str?.[n] ?? null, getBoolean: () => o.bool ?? null },
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async (x: any) => void replies.push(x)),
    reply: vi.fn(async (x: any) => void replies.push(x)),
    replies,
  };
  return runBericht(i).then(() => JSON.stringify(replies[0]));
}

describe('/bericht', () => {
  it('Tagesbericht mit den heutigen Zahlen, Liste; Wochenbericht', async () => {
    const day = await call(A, ['role-view'], 'tag');
    expect(day).toContain('Tagesbericht');
    expect(day).toContain('1 Schichten');
    expect(await call(A, ['role-view'], 'woche')).toContain('Wochenbericht');
    expect(await call(A, ['role-view'], 'liste')).toContain('Tag ab');
  });
  it('Rechte; Datum; Veröffentlichen ohne Kanal ehrlich', async () => {
    expect(await call(A, [], 'tag')).toContain('Du benötigst');
    expect(await call(A, ['role-view'], 'tag', { bool: true })).toContain('Du benötigst'); // veröffentlichen = manage
    expect(await call(LEAD, ['role-mgr'], 'tag', { str: { datum: 'gestern' } })).toContain('TT.MM.JJJJ');
    const out = await call(LEAD, ['role-mgr'], 'tag', { bool: true });
    expect(out).toContain('kein Berichts-Kanal');
  });
});
