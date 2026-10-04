import { discordSyncRepository, guildRepository, permissionRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBuero } from '../src/commands/buero.js';

const G = 'buero-guild';
const VOICE = '800000000000280001';
beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Büro', settings: { create: {} } } });
  await permissionRepository.setPermissionsForRole(G, 'role-p', [{ key: 'personnel.view', effect: 'ALLOW', scope: 'SERVER', scopeRef: '' }], { name: 'Personal' });
  await discordSyncRepository.syncChannels(G, [{ discordId: VOICE, name: '🔊 Büro-Warteraum', type: 2 }]);
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(roles: string[], sub: string, waiting: string[] = []) {
  const replies: any[] = [];
  const channel = { members: new Map(waiting.map((id) => [id, { id, user: { bot: false } }])) };
  const i: any = {
    guild: { id: G, channels: { cache: new Map([[VOICE, channel]]) } },
    member: { id: 'u', guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    options: { getSubcommand: () => sub },
    reply: vi.fn(async (x: any) => void replies.push(x)),
  };
  return runBuero(i).then(() => JSON.stringify(i.reply.mock.calls[0]![0]));
}

describe('/buero', () => {
  it('nicht konfiguriert, dann Status und Wartende (rein lesend)', async () => {
    expect(await call(['role-p'], 'status')).toContain('noch kein Büro-Warteraum');
    await guildRepository.setSelection(G, 'office-waiting-voice', VOICE);
    expect(await call(['role-p'], 'status')).toContain(VOICE);
    expect(await call(['role-p'], 'wartend', ['900000000000280009'])).toContain('900000000000280009');
    expect(await call(['role-p'], 'wartend')).toContain('Niemand wartet');
  });
  it('ohne Recht', async () => {
    expect(await call([], 'status')).toContain('Du benötigst');
  });
});
