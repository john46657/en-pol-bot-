import { permissionRepository, prisma } from '@nexus/database';
import { saveType } from '@nexus/shifts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSchicht } from '../src/commands/schicht.js';

const G = 'schicht-guild';
const U = '9000000000000000a1';

async function setup() {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Schicht', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-ok', ['shifts.start', 'shifts.pause', 'shifts.end', 'own.shift.view'].map(e), { name: 'Beamter' });
  await permissionRepository.setPermissionsForRole(G, 'role-view', [e('own.shift.view')], { name: 'Nur Ansicht' });
  return saveType(G, { name: 'Streife', requiredRoleIds: [] }, 'x');
}

function call(sub: string, roles: string[], typ?: string) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: U, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: U },
    options: { getSubcommand: () => sub, getString: () => typ },
    reply: vi.fn(async (o: any) => void replies.push(o)),
    replies,
  };
  return runSchicht(i).then(() => JSON.stringify(replies[0]));
}

let typeId = '';
beforeEach(async () => {
  typeId = (await setup()).id;
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('/schicht', () => {
  it('Ablauf: start → doppelter Start abgelehnt → pause → weiter → ende → status', async () => {
    expect(await call('start', ['role-ok'], typeId)).toContain('Schicht gestartet');
    expect(await call('start', ['role-ok'], typeId)).toContain('bereits eine laufende Schicht');
    expect(await call('pause', ['role-ok'])).toContain('Pause gestartet');
    expect(await call('weiter', ['role-ok'])).toContain('Weiter im Dienst');
    expect(await call('ende', ['role-ok'])).toContain('Schicht beendet');
    expect(await call('ende', ['role-ok'])).toContain('keine laufende Schicht');
    expect(await call('status', ['role-ok'])).toContain('1');
  });

  it('ohne Recht: verständliche Meldung, nichts wird gestartet', async () => {
    expect(await call('start', ['role-view'], typeId)).toContain('Du benötigst');
    expect(await prisma.shift.count({ where: { guildId: G } })).toBe(0);
    expect(await call('status', ['role-view'])).toContain('Keine laufende Schicht');
  });

  it('Rollenanforderung des Typs wird durchgesetzt', async () => {
    const t = await saveType(G, { name: 'SEK', requiredRoleIds: ['123456789'] }, 'x');
    expect(await call('start', ['role-ok'], t.id)).toContain('nötige Rolle');
  });
});
