import { describe, expect, it } from 'vitest';
import type { Client } from 'discord.js';
import { homeGuild, isHomeGuild, ownGuilds, setHomeGuild } from '../src/home';

describe('ein Discord-Server', () => {
  it('ohne bekannten Server: alle; danach nur noch der eigene', () => {
    const fake = { guilds: { cache: new Map([['111111111111111111', { id: '111111111111111111' }], ['222222222222222222', { id: '222222222222222222' }]]) } } as unknown as Client;
    expect(homeGuild()).toBeNull();
    expect(ownGuilds(fake)).toHaveLength(2);
    setHomeGuild('kein-server');
    expect(homeGuild()).toBeNull();
    setHomeGuild('222222222222222222');
    expect(isHomeGuild('222222222222222222')).toBe(true);
    expect(isHomeGuild('111111111111111111')).toBe(false);
    expect(ownGuilds(fake).map((g) => g.id)).toEqual(['222222222222222222']);
  });
});
