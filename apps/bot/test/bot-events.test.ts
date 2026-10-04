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

describe('Personal-Schritte der Annahme-Pipeline', () => {
  it('sind im Bot aktiv (nicht mehr „nicht verfügbar“)', async () => {
    const { describeAcceptPipeline } = await import('@nexus/automation');
    const steps = Object.fromEntries(describeAcceptPipeline().map((s) => [s.key, s.available]));
    expect(steps).toMatchObject({
      personnelRecord: true,
      serviceNumber: true,
      startRank: true,
      team: true,
      probation: true,
      roles: true,
    });
  });
});
