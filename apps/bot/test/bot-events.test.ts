import { Events } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { createClient } from '../src/bot.js';

describe('Bot-Ereignisse sind angebunden', () => {
  const client = createClient();
  it.each([
    Events.ClientReady,
    Events.GuildCreate,
    Events.GuildUpdate,
    Events.GuildDelete,
    Events.GuildRoleCreate,
    Events.GuildRoleUpdate,
    Events.GuildRoleDelete,
    Events.ChannelCreate,
    Events.ChannelUpdate,
    Events.ChannelDelete,
    Events.GuildMemberAdd,
    Events.GuildMemberRemove,
    Events.InteractionCreate,
    Events.MessageCreate,
  ])('%s hat einen Handler', (event) => {
    expect(client.listenerCount(event)).toBeGreaterThan(0);
  });
});
