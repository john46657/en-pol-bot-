import { describe, expect, it } from 'vitest';
import { ChannelType, Collection, OverwriteType, PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { DiscordBackupData } from '@enrp/shared';
import { restoreGuild } from '../src/backup';

/** Minimaler Server: merkt sich, was angelegt/geändert wurde. */
function fakeGuild() {
  const log: string[] = [];
  let n = 100;
  const roles = new Collection<string, Record<string, unknown>>();
  const channels = new Collection<string, Record<string, unknown>>();
  const role = (id: string, name: string, position: number, managed = false) => roles.set(id, { id, name, position, managed, edit: async (o: { name: string }) => { log.push(`edit role ${o.name}`); } });
  role('900', '@everyone', 0); role('901', 'Polizei', 2); role('999', 'Bot', 10);
  const everyone = roles.get('900')!;
  everyone.setPermissions = async () => { log.push('everyone'); };
  channels.set('950', { id: '950', name: 'allgemein', type: ChannelType.GuildText, parentId: null, isThread: () => false, edit: async () => { log.push('edit #allgemein'); } });
  const guild = {
    id: '900', maximumBitrate: 96000,
    members: { me: { permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: roles.get('999') } }, fetchMe: async () => null },
    roles: {
      cache: roles, everyone, fetch: async () => roles,
      create: async (o: { name: string }) => { const id = String(n++); role(id, o.name, 1); log.push(`create role ${o.name}`); return roles.get(id); },
      setPositions: async () => { log.push('positions'); },
    },
    channels: {
      cache: channels, fetch: async () => channels,
      create: async (o: { name: string; type: ChannelType; parent: string | null; permissionOverwrites: { id: string; type: OverwriteType }[] }) => {
        const id = String(n++); channels.set(id, { id, name: o.name, type: o.type, parentId: o.parent, isThread: () => false });
        log.push(`create #${o.name} in ${o.parent ?? '-'} ow ${o.permissionOverwrites.map((x) => x.id).join(',')}`); return channels.get(id);
      },
    },
    edit: async () => { log.push('settings'); },
  };
  return { guild: guild as unknown as Guild, log };
}

const data: DiscordBackupData = {
  version: 1, guildId: '1', everyonePermissions: '0',
  roles: [{ id: '2', name: 'Polizei', color: 1, hoist: false, mentionable: false, permissions: '0', position: 2 }, { id: '3', name: 'SEK', color: 2, hoist: true, mentionable: false, permissions: '0', position: 3 }],
  channels: [
    { id: '10', name: 'Leitstelle', type: 'category', parentId: null, position: 0, overwrites: [] },
    { id: '11', name: 'funk', type: 'text', parentId: '10', position: 1, overwrites: [{ id: '3', type: 'role', allow: '1024', deny: '0' }, { id: '1', type: 'role', allow: '0', deny: '1024' }] },
    { id: '12', name: 'allgemein', type: 'text', parentId: null, position: 2, overwrites: [] },
  ],
  settings: { name: 'EN', verificationLevel: 1, defaultMessageNotifications: 1, explicitContentFilter: 0, afkChannelId: null, afkTimeout: 300, systemChannelId: '12' },
};

describe('Discord-Backup wiederherstellen', () => {
  it('adapts existing roles/channels by name, creates missing ones with mapped roles and parents, deletes nothing', async () => {
    const { guild, log } = fakeGuild();
    const r = await restoreGuild(guild, data, ['roles', 'channels', 'settings']);
    expect(log).toContain('edit role Polizei');
    expect(log).toContain('create role SEK');
    const sek = log.find((l) => l.startsWith('create role SEK')) && [...(guild.roles.cache as unknown as Collection<string, { id: string; name: string }>).values()].find((x) => x.name === 'SEK')!.id;
    const cat = log.find((l) => l.startsWith('create #Leitstelle'));
    expect(cat).toBeDefined();
    const catId = [...(guild.channels.cache as unknown as Collection<string, { id: string; name: string }>).values()].find((x) => x.name === 'Leitstelle')!.id;
    expect(log).toContain(`create #funk in ${catId} ow ${sek},900`); // Rolle umgeschrieben, @everyone → Ziel-Server
    expect(log).toContain('edit #allgemein');
    expect(log).toContain('settings');
    expect(r).toMatchObject({ created: 3, failed: 0 });
  });
  it('only the chosen parts', async () => {
    const { guild, log } = fakeGuild();
    await restoreGuild(guild, data, ['settings']);
    expect(log.filter((l) => l.startsWith('create'))).toEqual([]);
  });
});
