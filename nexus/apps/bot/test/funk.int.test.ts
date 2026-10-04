import { permissionRepository, prisma } from '@nexus/database';
import { saveChannel, setAccess } from '@nexus/radio';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runFunk } from '../src/commands/funk.js';
import { enforceMember, type VoiceMemberLike } from '../src/radio/enforce.js';

const G = 'funk-guild';
const [LEAD, A, B] = ['900000000000060001', '900000000000060002', '900000000000060003'];
const CH = { gen: '800000000000060001', spec: '800000000000060002' };

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Funk', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-lead', ['radio.view', 'radio.whitelist.manage'].map(e), { name: 'Leitung' });
  await saveChannel(G, { channelId: CH.gen, name: 'Funk 1' }, 'x');
  await saveChannel(G, { channelId: CH.spec, name: 'SEK-Funk', area: 'SPECIAL' }, 'x');
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, opts: { str?: Record<string, string>; user?: string; bool?: boolean } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G, members: { search: async () => new Map([[A, {}]]) } },
    member: { id: userId, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId, username: 'u' },
    options: {
      getSubcommand: () => sub,
      getString: (n: string, req?: boolean) => opts.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null),
      getUser: () => (opts.user ? { id: opts.user, username: 'ziel' } : null),
      getBoolean: () => opts.bool ?? null,
    },
    reply: vi.fn(async (o: any) => void replies.push(o)),
    replies,
  };
  return runFunk(i).then(() => JSON.stringify(replies[0]));
}

describe('/funk', () => {
  it('Leitung: hinzufügen, ändern, suchen, anzeigen, entfernen', async () => {
    expect(await call(LEAD, ['role-lead'], 'hinzufügen', { user: A, str: { stufe: 'SPEAK' } })).toContain('Sprechen');
    expect(await call(LEAD, ['role-lead'], 'hinzufügen', { user: A, str: { stufe: 'SPEAK' }, bool: true })).toContain('Spezialfunk');
    expect(await call(LEAD, ['role-lead'], 'hinzufügen', { user: A, str: { stufe: 'SPEAK' }, bool: true })).toContain('bereits genau diese');
    expect(await call(LEAD, ['role-lead'], 'suchen', { str: { name: 'ziel' } })).toContain(A);
    expect(await call(LEAD, ['role-lead'], 'liste')).toContain(A);
    expect(await call(LEAD, ['role-lead'], 'anzeigen', { user: A })).toContain('SEK-Funk');
    expect(await call(LEAD, ['role-lead'], 'entfernen', { user: A })).toContain('entfernt');
    expect(await call(LEAD, ['role-lead'], 'entfernen', { user: A })).toContain('nicht auf der Whitelist');
  });
  it('ohne Recht: nichts verwaltbar, fremder Zugriff nicht einsehbar, eigener schon', async () => {
    expect(await call(B, [], 'hinzufügen', { user: B, str: { stufe: 'FULL' } })).toContain('Du benötigst');
    expect(await prisma.radioAccess.count({ where: { guildId: G } })).toBe(0);
    expect(await call(B, [], 'liste')).toContain('Du benötigst');
    expect(await call(B, [], 'anzeigen', { user: A })).toContain('Du benötigst');
    expect(await call(B, [], 'anzeigen')).toContain('Nicht auf der Whitelist');
  });
});

describe('Durchsetzung im Sprachkanal', () => {
  const fake = (userId: string, channelId: string | null) => {
    const m = {
      id: userId,
      guild: { id: G },
      voice: { channelId, serverMute: false as boolean | null, disconnect: vi.fn(async () => {}), setMute: vi.fn(async (v: boolean) => { m.voice.serverMute = v; }) },
      send: vi.fn(async () => {}),
    };
    return m as typeof m & VoiceMemberLike;
  };
  it('trennt ohne Whitelist, schaltet bei „Mithören“ stumm und danach wieder frei', async () => {
    const stranger = fake(B, CH.gen);
    expect(await enforceMember(stranger)).toBe('disconnected');
    expect(stranger.voice.disconnect).toHaveBeenCalled();
    expect(stranger.send).toHaveBeenCalled();

    await setAccess({ guildId: G, userId: A, level: 'LISTEN', actorId: 'x' });
    const listener = fake(A, CH.gen);
    expect(await enforceMember(listener)).toBe('muted');
    expect(listener.voice.setMute).toHaveBeenCalledWith(true, expect.any(String));
    expect(await enforceMember(listener)).toBe('allowed'); // schon stumm: nichts doppelt
    await setAccess({ guildId: G, userId: A, level: 'SPEAK', actorId: 'x' });
    expect(await enforceMember(listener)).toBe('unmuted');
    expect(listener.voice.serverMute).toBe(false);
  });
  it('Spezialfunk ohne Freigabe: getrennt; mit Freigabe erlaubt; fremde Kanäle unberührt', async () => {
    await setAccess({ guildId: G, userId: A, level: 'SPEAK', actorId: 'x' });
    expect(await enforceMember(fake(A, CH.spec))).toBe('disconnected');
    await setAccess({ guildId: G, userId: A, level: 'SPEAK', special: true, actorId: 'x' });
    expect(await enforceMember(fake(A, CH.spec))).toBe('allowed');
    const other = fake(B, '800000000000069999');
    expect(await enforceMember(other)).toBe('ignored');
    expect(other.voice.disconnect).not.toHaveBeenCalled();
    expect(await enforceMember(fake(B, null))).toBe('ignored');
  });
});
