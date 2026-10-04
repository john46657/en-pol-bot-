import { ChannelType, PermissionFlagsBits, type Guild } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncRoles = vi.fn(async () => ({ synced: 0, removed: 0 }));
const syncChannels = vi.fn(async () => ({ synced: 0, removed: 0 }));
const upsertUser = vi.fn(async () => ({}));
vi.mock('@nexus/database', () => ({
  discordSyncRepository: { syncRoles, syncChannels },
  userRepository: { upsert: upsertUser },
}));

const {
  syncRoles: doRoles,
  syncChannels: doChannels,
  syncUsers,
} = await import('../src/sync/discord-sync.js');

function guild(memberCount = 2): Guild {
  const role = (id: string, name: string, position: number, managed = false) => ({
    id,
    name,
    position,
    managed,
    color: 1,
    mentionable: false,
    hoist: false,
    permissions: { bitfield: 8n },
  });
  return {
    id: 'G',
    memberCount,
    roles: {
      cache: new Map(
        [role('G', '@everyone', 0), role('r1', 'Polizei', 3), role('r2', 'Bot', 9, true)].map(
          (r) => [r.id, r],
        ),
      ),
    },
    channels: {
      cache: new Map(
        [
          {
            id: 'c1',
            name: 'chat',
            type: ChannelType.GuildText,
            parentId: null,
            rawPosition: 0,
            isThread: () => false,
          },
          {
            id: 'f',
            name: 'forum',
            type: ChannelType.GuildForum,
            parentId: null,
            rawPosition: 1,
            isThread: () => false,
          },
        ].map((c) => [c.id, c]),
      ),
    },
    members: {
      me: {
        permissions: { has: (p: bigint) => p === PermissionFlagsBits.ManageRoles },
        roles: { highest: { position: 5, name: 'NEXUS' } },
      },
      fetch: async () =>
        new Map([
          ['u1', { id: 'u1', user: { username: 'a', globalName: 'A', avatar: null, bot: false } }],
        ]),
    },
  } as unknown as Guild;
}

beforeEach(() => vi.clearAllMocks());

describe('Discord-Sync', () => {
  it('schreibt Rollen ohne @everyone inkl. Position und Permissions', async () => {
    await doRoles(guild());
    const [gid, roles] = syncRoles.mock.calls[0] as unknown as [
      string,
      { discordId: string; permissions: string }[],
    ];
    expect(gid).toBe('G');
    expect(roles.map((r) => r.discordId).sort()).toEqual(['r1', 'r2']);
    expect(roles[0]?.permissions).toBe('8');
  });
  it('schreibt nur Text-, Voice- und Kategorie-Kanäle', async () => {
    await doChannels(guild());
    const channels = (
      syncChannels.mock.calls[0] as unknown as [string, { discordId: string }[]]
    )[1];
    expect(channels.map((c) => c.discordId)).toEqual(['c1']);
  });
  it('synchronisiert Benutzer nur bei Servern unter dem Limit', async () => {
    expect(await syncUsers(guild(2))).toBe(1);
    expect(upsertUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', username: 'a' }));
    expect(await syncUsers(guild(5000))).toBe(0);
  });
});
