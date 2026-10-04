import { permissionRepository, prisma } from '@nexus/database';
import { saveLevel } from '@nexus/danger';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGefahr } from '../src/commands/gefahr.js';

const G = 'gefahr-guild';
const ROLE = '900000000000090101';

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.dangerState.deleteMany({ where: { guildId: G } });
  await prisma.dangerEvent.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Gefahr', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-set', ['danger.view', 'danger.set'].map(e), { name: 'Führung' });
  await permissionRepository.setPermissionsForRole(G, 'role-view', [e('danger.view')], { name: 'Beamter' });
  await permissionRepository.setPermissionsForRole(G, 'role-mgr', ['danger.view', 'danger.set', 'danger.manage'].map(e), { name: 'Admin' });
  await saveLevel(G, { level: 5, name: 'Ausnahmezustand', allowedRoleIds: [ROLE] }, 'x');
});
afterAll(async () => {
  await prisma.dangerState.deleteMany({ where: { guildId: G } });
  await prisma.dangerEvent.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(roles: string[], sub: string, str: Record<string, string> = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: '900000000000090999', guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: '900000000000090999' },
    options: { getSubcommand: () => sub, getString: (n: string, req?: boolean) => str[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null) },
    reply: vi.fn(async (o: any) => void replies.push(o)),
    replies,
  };
  return runGefahr(i).then(() => JSON.stringify(replies[0]));
}

describe('/gefahr', () => {
  it('anzeigen, setzen, Verlauf', async () => {
    expect(await call(['role-view'], 'anzeigen')).toContain('Normalbetrieb');
    expect(await call(['role-set'], 'setzen', { stufe: '3', grund: 'Bankraub' })).toContain('Hohe Gefahr');
    expect(await call(['role-view'], 'anzeigen')).toContain('Bankraub');
    expect(await call(['role-set'], 'setzen', { stufe: '3' })).toContain('bereits aktiv');
    expect(await call(['role-view'], 'verlauf')).toContain('Bankraub');
  });
  it('Recht und Rollenbeschränkung', async () => {
    expect(await call(['role-view'], 'setzen', { stufe: '2' })).toContain('Du benötigst');
    expect(await call([], 'anzeigen')).toContain('Du benötigst');
    expect(await call(['role-set'], 'setzen', { stufe: '5' })).toContain('nur bestimmte Rollen');
    expect(await call(['role-set', ROLE], 'setzen', { stufe: '5' })).toContain('Ausnahmezustand');
    expect(await call(['role-mgr'], 'setzen', { stufe: '1' })).toContain('Erhöhte Aufmerksamkeit');
  });
});
