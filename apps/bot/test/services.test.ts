import { ChannelType, PermissionFlagsBits, type Guild } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { channelService, guildInfoService, roleService } from '../src/services/index.js';
import { evaluatePermission } from '../src/services/permission.service.js';
import { buildEmbed } from '../src/core/embed-builder.js';

/** Minimale Guild-Attrappe mit den Feldern, die die Services lesen. */
function fakeGuild(opts: { manageRoles?: boolean; botPosition?: number } = {}): Guild {
  const role = (id: string, name: string, position: number, managed = false) => ({
    id,
    name,
    position,
    managed,
    color: 0,
    mentionable: false,
    hoist: false,
    permissions: { bitfield: 8n },
  });
  const roles = [
    role('G', '@everyone', 0),
    role('r1', 'Polizeileitung', 5),
    role('r2', 'Admin', 10),
    role('r3', 'Bot-Integration', 2, true),
  ];
  const botPos = opts.botPosition ?? 8;
  return {
    id: 'G',
    name: 'Test',
    ownerId: 'o',
    memberCount: 42,
    iconURL: () => null,
    roles: { cache: new Map(roles.map((r) => [r.id, r])) },
    channels: {
      cache: new Map(
        [
          {
            id: 'c1',
            name: 'chat',
            type: ChannelType.GuildText,
            parentId: 'cat',
            rawPosition: 1,
            isThread: () => false,
          },
          {
            id: 'c2',
            name: 'Büro-Warteraum',
            type: ChannelType.GuildVoice,
            parentId: 'cat',
            rawPosition: 2,
            isThread: () => false,
          },
          {
            id: 'cat',
            name: 'Büro',
            type: ChannelType.GuildCategory,
            parentId: null,
            rawPosition: 0,
            isThread: () => false,
          },
          {
            id: 't',
            name: 'thread',
            type: ChannelType.PublicThread,
            parentId: 'c1',
            rawPosition: 0,
            isThread: () => true,
          },
        ].map((c) => [c.id, c]),
      ),
    },
    members: {
      me: {
        permissions: {
          has: (p: bigint) => (opts.manageRoles ?? true) && p === PermissionFlagsBits.ManageRoles,
        },
        roles: { highest: { position: botPos, name: 'NEXUS' } },
      },
    },
  } as unknown as Guild;
}

describe('roleService (Rollenhierarchie)', () => {
  it('markiert Rollen unterhalb der Bot-Rolle als verwaltbar, andere mit Grund', () => {
    const byId = Object.fromEntries(roleService.list(fakeGuild()).map((r) => [r.id, r]));
    expect(byId['r1']?.botCanManage).toBe(true);
    expect(byId['r2']).toMatchObject({ botCanManage: false, botBlockedReason: 'hierarchy' });
    expect(byId['r3']).toMatchObject({ botCanManage: false, botBlockedReason: 'managed-role' });
    expect(byId['G']).toMatchObject({
      botCanManage: false,
      botBlockedReason: 'everyone',
      isEveryone: true,
    });
  });
  it('gleiche Position wie der Bot ist nicht verwaltbar', () => {
    const r = roleService.list(fakeGuild({ botPosition: 5 })).find((x) => x.id === 'r1');
    expect(r?.botBlockedReason).toBe('hierarchy');
  });
  it('ohne „Rollen verwalten“ ist keine Rolle verwaltbar', () => {
    const all = roleService.list(fakeGuild({ manageRoles: false }));
    expect(all.every((r) => !r.botCanManage && r.botBlockedReason === 'missing-manage-roles')).toBe(
      true,
    );
  });
  it('sortiert nach Position absteigend', () => {
    expect(roleService.list(fakeGuild()).map((r) => r.id)).toEqual(['r2', 'r1', 'r3', 'G']);
  });
});

describe('channelService', () => {
  it('klassifiziert Kanäle, filtert Threads und sortiert nach Position', () => {
    const g = fakeGuild();
    expect(channelService.list(g).map((c) => c.id)).toEqual(['cat', 'c1', 'c2']);
    expect(channelService.list(g, 'voice').map((c) => c.name)).toEqual(['Büro-Warteraum']);
    expect(channelService.list(g, 'category')).toHaveLength(1);
  });
});

describe('guildInfoService', () => {
  it('fasst Serverdaten zusammen', () => {
    expect(guildInfoService.get(fakeGuild())).toMatchObject({
      memberCount: 42,
      roleCount: 4,
      textChannels: 1,
      voiceChannels: 1,
      categories: 1,
      botHighestRole: 'NEXUS',
    });
  });
});

describe('permissionService', () => {
  it('Administrator darf immer, sonst nur mit zugeordnetem Key', () => {
    expect(evaluatePermission(true, [], 'x.manage')).toBe(true);
    expect(evaluatePermission(false, ['x.manage'], 'x.manage')).toBe(true);
    expect(evaluatePermission(false, ['x.view'], 'x.manage')).toBe(false);
  });
});

describe('buildEmbed', () => {
  it('kürzt auf Discord-Limits und begrenzt Felder', () => {
    const e = buildEmbed('error', {
      title: 'a'.repeat(300),
      description: 'b'.repeat(5000),
      fields: Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, value: 'v'.repeat(2000) })),
    }).toJSON();
    expect(e.title).toHaveLength(256);
    expect(e.description).toHaveLength(4096);
    expect(e.fields).toHaveLength(25);
    expect(e.fields?.[0]?.value).toHaveLength(1024);
    expect(e.color).toBe(0xed4245);
  });
});
