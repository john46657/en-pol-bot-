import { discordSyncRepository, guildRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getWaitingRoom, isWaitingRoom } from '../src/index.js';

const G = 'officetest-guild';
const VOICE = '800000000000270001';
const TEXT = '800000000000270002';

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Büro', settings: { create: {} } } });
  await discordSyncRepository.syncChannels(G, [
    { discordId: VOICE, name: '🔊 Büro-Warteraum', type: 2, parentId: null, position: 1 },
    { discordId: TEXT, name: 'allgemein', type: 0, parentId: null, position: 0 },
  ]);
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Büro-Warteraum', () => {
  it('nicht konfiguriert', async () => {
    expect(await getWaitingRoom(G)).toMatchObject({ state: 'not-configured', channelId: null });
  });
  it('vorhandener Sprachkanal wird als Warteraum behandelt', async () => {
    await guildRepository.setSelection(G, 'office-waiting-voice', VOICE);
    expect(await getWaitingRoom(G)).toMatchObject({ state: 'ok', channelId: VOICE, name: '🔊 Büro-Warteraum' });
    expect(await isWaitingRoom(G, VOICE)).toBe(true);
    expect(await isWaitingRoom(G, TEXT)).toBe(false);
  });
  it('Textkanal, gelöschter Kanal und Funk-Konflikt werden benannt', async () => {
    await guildRepository.setSelection(G, 'office-waiting-voice', TEXT);
    expect((await getWaitingRoom(G)).state).toBe('not-voice');
    await guildRepository.setSelection(G, 'office-waiting-voice', '800000000000279999');
    expect((await getWaitingRoom(G)).state).toBe('channel-missing');
    await guildRepository.setSelection(G, 'office-waiting-voice', VOICE);
    await prisma.radioChannel.create({ data: { guildId: G, channelId: VOICE, name: 'Funk' } });
    const w = await getWaitingRoom(G);
    expect(w.state).toBe('conflict-radio');
    expect(w.message).toContain('Funk');
  });
  it('Änderung der Auswahl wirkt sofort; Entfernen → nicht konfiguriert', async () => {
    await guildRepository.setSelection(G, 'office-waiting-voice', VOICE);
    await guildRepository.setSelection(G, 'office-waiting-voice', null);
    expect((await getWaitingRoom(G)).state).toBe('not-configured');
  });
});
