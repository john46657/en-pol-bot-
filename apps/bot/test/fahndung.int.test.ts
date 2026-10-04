import { permissionRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFahndung } from '../src/commands/fahndung.js';

const G = 'fahndung-guild';
const [LEAD, A, B] = ['900000000000100001', '900000000000100002', '900000000000100003'];

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.wantedCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Fahndung', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-lead', ['wanted.view', 'wanted.create', 'wanted.edit', 'wanted.revoke'].map(e), { name: 'Leitung' });
  await permissionRepository.setPermissionsForRole(G, 'role-cop', ['wanted.view', 'wanted.create', 'wanted.edit'].map(e), { name: 'Beamter' });
});
afterAll(async () => {
  await prisma.wantedCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, str: Record<string, string> = {}, bool?: boolean, int: Record<string, number> = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: { getSubcommand: () => sub, getString: (n: string, req?: boolean) => str[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null), getBoolean: () => bool ?? null, getInteger: (n: string) => int[n] ?? null },
    reply: vi.fn(async (o: any) => void replies.push(o)),
    replies,
  };
  return runFahndung(i).then(() => JSON.stringify(replies[0]));
}

describe('/fahndung', () => {
  it('Lebenszyklus: Person + Fahrzeug erstellen, suchen, bearbeiten, Historie, aufheben', async () => {
    expect(await call(A, ['role-cop'], 'person', { name: 'Max Mustermann', grund: 'Raubüberfall', prioritaet: 'HIGH' })).toContain('F-0001');
    expect(await call(A, ['role-cop'], 'fahrzeug', { kennzeichen: 'LS-AB 123', grund: 'Fluchtfahrzeug', modell: 'Sultan' })).toContain('F-0002');
    expect(await call(A, ['role-cop'], 'person', { name: 'max mustermann', grund: 'nochmal' })).toContain('bereits die Fahndung F-0001');
    const found = await call(B, ['role-cop'], 'suchen', { suche: 'lsab123' });
    expect(found).toContain('F-0002');
    expect(found).not.toContain('Mustermann');
    expect(await call(B, ['role-cop'], 'bearbeiten', { nummer: 'F-0001', zuletzt: 'Flughafen' })).toContain('Flughafen');
    expect(await call(B, ['role-cop'], 'historie', { nummer: '1' })).toContain('updated');
    expect(await call(B, ['role-cop'], 'aufheben', { nummer: 'F-0001', grund: 'Festnahme' })).toContain('Du benötigst'); // nicht Ersteller, kein Recht
    expect(await call(A, ['role-cop'], 'aufheben', { nummer: 'F-0001', grund: 'Festnahme' })).toContain('aufgehoben'); // eigene
    expect(await call(LEAD, ['role-lead'], 'aufheben', { nummer: 'F-0002', grund: 'Fahrzeug sichergestellt' })).toContain('aufgehoben');
    expect(await call(B, ['role-cop'], 'liste')).toContain('Keine Fahndungen');
    expect(await call(B, ['role-cop'], 'liste', {}, true)).toContain('Mustermann');
    expect(await call(B, ['role-cop'], 'anzeigen', { nummer: 'F-0099' })).toContain('nicht gefunden');
  });
  it('Laufzeit: Standard 20 Minuten, eigene Dauer, abgelaufene Fahndung erscheint als abgelaufen', async () => {
    expect(await call(A, ['role-cop'], 'person', { name: 'Kurz Gesucht', grund: 'Testgrund' })).toContain('Läuft ab');
    const n = await prisma.wantedNotice.findFirstOrThrow({ where: { guildId: G, subjectName: 'Kurz Gesucht' } });
    expect(Math.round((n.expiresAt!.getTime() - Date.now()) / 60_000)).toBe(20);
    await call(A, ['role-cop'], 'person', { name: 'Lang Gesucht', grund: 'Testgrund' }, undefined, { dauer: 0 });
    expect((await prisma.wantedNotice.findFirstOrThrow({ where: { guildId: G, subjectName: 'Lang Gesucht' } })).expiresAt).toBeNull();
    await prisma.wantedNotice.update({ where: { id: n.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await call(B, ['role-cop'], 'liste')).not.toContain('Kurz Gesucht');
    expect(await call(B, ['role-cop'], 'anzeigen', { nummer: String(n.number) })).toContain('abgelaufen');
  });
  it('ohne Recht', async () => {
    expect(await call(B, [], 'liste')).toContain('Du benötigst');
    expect(await call(B, [], 'person', { name: 'X', grund: 'xxxx' })).toContain('Du benötigst');
    expect(await prisma.wantedNotice.count({ where: { guildId: G } })).toBe(0);
  });
});
