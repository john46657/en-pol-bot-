import { describe, expect, it } from 'vitest';
import { ChannelType } from 'discord.js';
import { guildInfo } from '../src/guilds';

const coll = <T extends { id: string }>(xs: T[]) => ({ values: () => xs.values() });
describe('server directory for the dashboard', () => {
  it('reports channels (text/category/voice) and real roles – without @everyone, bot roles and threads', () => {
    const g = {
      id: '1', name: 'EN Polizei', iconURL: () => 'https://cdn.discordapp.com/icons/1/a.png',
      channels: { cache: coll([
        { id: '10', name: 'tickets', type: ChannelType.GuildCategory, parentId: null, rawPosition: 0, isThread: () => false },
        { id: '11', name: 'support', type: ChannelType.GuildText, parentId: '10', rawPosition: 1, isThread: () => false },
        { id: '12', name: 'funk', type: ChannelType.GuildVoice, parentId: null, rawPosition: 2, isThread: () => false },
        { id: '13', name: 'faden', type: ChannelType.PublicThread, parentId: '11', rawPosition: 0, isThread: () => true },
      ]) },
      roles: { cache: coll([
        { id: '1', name: '@everyone', color: 0, position: 0, managed: false },
        { id: '20', name: 'Polizei', color: 0x3b82f6, position: 2, managed: false },
        { id: '21', name: 'EN Bot', color: 0, position: 3, managed: true },
      ]) },
    };
    expect(guildInfo(g as never)).toEqual({
      id: '1', name: 'EN Polizei', icon: 'https://cdn.discordapp.com/icons/1/a.png',
      channels: [{ id: '10', name: 'tickets', type: 'category', parentId: null, position: 0 }, { id: '11', name: 'support', type: 'text', parentId: '10', position: 1 }, { id: '12', name: 'funk', type: 'voice', parentId: null, position: 2 }],
      roles: [{ id: '20', name: 'Polizei', color: 0x3b82f6, position: 2 }],
    });
  });
});
