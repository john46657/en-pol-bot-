import { guildRepository, permissionRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMod } from '../src/commands/mod.js';

const G = 'mod-bot-guild';
const TARGET = '900000000000410001';
beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await guildRepository.upsert({ id: G, name: 'Mod' });
  await prisma.moderationCase.create({ data: { guildId: G, number: 1, type: 'WARN', userId: TARGET, moderatorId: '900000000000410009', reason: 'Spam im Chat' } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(roles: string[], sub: string, opts: Record<string, unknown> = {}) {
  const i: any = {
    guild: { id: G },
    member: { id: 'u', guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: 'u' },
    options: { getSubcommand: () => sub, getUser: () => ({ id: TARGET, username: 'ziel' }), getString: (k: string) => (opts[k] as string) ?? null, getInteger: () => null },
    reply: vi.fn(async () => undefined),
  };
  return runMod(i).then(() => JSON.stringify(i.reply.mock.calls[0]![0]));
}

describe('/mod', () => {
  it('ohne Recht: jede Maßnahme und die Akte werden abgelehnt, ohne Discord anzufassen', async () => {
    for (const sub of ['warn', 'timeout', 'kick', 'ban', 'aufheben', 'akte']) expect(await call(['r-none'], sub)).toContain('Du benötigst');
  });
  it('mit moderation.view: Akte zeigt Fälle; Verwarnen bleibt verboten', async () => {
    await permissionRepository.setPermissionsForRole(G, 'r-view', [{ key: 'moderation.view', effect: 'ALLOW', scope: 'SERVER', scopeRef: '' }], { name: 'Sicht' });
    const akte = await call(['r-view'], 'akte');
    expect(akte).toContain('Spam im Chat');
    expect(akte).toContain('Aktive Verwarnungen: **1**');
    expect(await call(['r-view'], 'warn', { grund: 'Test' })).toContain('Du benötigst');
  });
  it('eine Sperre auf moderation.view schlägt die Erlaubnis über moderation.manage', async () => {
    await permissionRepository.setPermissionsForRole(G, 'r-m', [{ key: 'moderation.manage', effect: 'ALLOW', scope: 'SERVER', scopeRef: '' }, { key: 'moderation.view', effect: 'DENY', scope: 'SERVER', scopeRef: '' }], { name: 'M' });
    expect(await call(['r-m'], 'akte')).toContain('Du benötigst');
  });
});
