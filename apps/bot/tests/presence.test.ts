import { describe, expect, it } from 'vitest';
import { ChannelType } from 'discord.js';
import { teamMembers, voiceReport } from '../src/presence';

const coll = <T extends { id: string }>(xs: T[]) => ({ values: () => xs.values(), keys: () => xs.map((x) => x.id).values(), has: (id: string) => xs.some((x) => x.id === id) });
const member = (id: string, name: string, roles: string[], status?: string, voice: Record<string, boolean> = {}) => ({
  id, displayName: name, user: { username: name.toLowerCase(), bot: false }, guild: { id: 'g1' }, joinedAt: new Date('2026-01-01T00:00:00Z'),
  presence: status ? { status } : null, roles: { cache: coll(['g1', ...roles].map((r) => ({ id: r }))) },
  displayAvatarURL: () => `https://cdn.discordapp.com/${id}.png`, voice,
});

describe('team list and voice reports for the dashboard', () => {
  it('team list: only members with a team role, avatar/name/status, no voice data', () => {
    const g = { id: 'g1', members: { cache: coll([member('1', 'Max', ['team'], 'online'), member('2', 'Gast', [], 'online'), member('3', 'Leon', ['team'])]) } };
    const r = teamMembers([g as never], ['team'], true);
    expect(r).toEqual([
      { id: '1', guildId: 'g1', username: 'max', displayName: 'Max', avatar: 'https://cdn.discordapp.com/1.png', status: 'online', roleIds: ['team'], joinedAt: '2026-01-01T00:00:00.000Z' },
      expect.objectContaining({ id: '3', status: 'offline' }),
    ]);
    expect(JSON.stringify(r)).not.toMatch(/mute|deaf|stream|video/i);
    expect(teamMembers([g as never], ['team'], false)[0]!.status).toBe('unknown'); // ohne Presence-Intent
    expect(teamMembers([g as never], [], true)).toEqual([]); // keine Teamrollen eingestellt
  });

  it('voice: channels with people, microphone/headphone/camera/stream and time in channel', () => {
    const max = member('1', 'Max', [], undefined, { selfMute: true, selfDeaf: false, serverMute: false, serverDeaf: false, selfVideo: false, streaming: true });
    const ch = { id: '50', name: 'Funk 1', type: ChannelType.GuildVoice, parentId: '40', parent: { name: 'Einsatz' }, rawPosition: 3, members: coll([max]) };
    const text = { id: '51', name: 'chat', type: ChannelType.GuildText, members: coll([]) };
    const g = { id: 'g1', channels: { cache: coll([ch, text]) } };
    const r = voiceReport([g as never], new Map([['g1:1', Date.parse('2026-10-06T20:00:00Z')]]));
    expect(r).toEqual([{ id: '50', guildId: 'g1', name: 'Funk 1', parentId: '40', parentName: 'Einsatz', position: 3, members: [{ id: '1', displayName: 'Max', avatar: 'https://cdn.discordapp.com/1.png', selfMute: true, selfDeaf: false, serverMute: false, serverDeaf: false, video: false, streaming: true, since: '2026-10-06T20:00:00.000Z' }] }]);
  });
});
