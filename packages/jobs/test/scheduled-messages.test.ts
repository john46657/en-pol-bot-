import { guildRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { scheduledPayload, sendScheduledMessages } from '../src/index.js';

const G = 'sched-guild';
const CH = '800000000000320001';
const NOW = new Date('2026-10-05T16:00:30Z'); // Montag 18:00:30 Berlin
const mk = (data: Record<string, unknown>) => prisma.scheduledMessage.create({ data: { guildId: G, name: 'Test', channelId: CH, payload: { content: 'Hallo {wochentag}' }, scheduleType: 'daily', timeOfDay: '18:00', weekdays: [], nextRunAt: new Date('2026-10-05T16:00:00Z'), ...data } as never });

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Plan', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Automatische Nachrichten', () => {
  it('fällige Nachricht wird einmal in die Warteschlange gelegt, der nächste Termin berechnet', async () => {
    const m = await mk({});
    expect(await sendScheduledMessages(NOW)).toEqual({ queued: 1, skipped: 0 });
    const n = await prisma.notification.findFirstOrThrow({ where: { guildId: G, kind: 'scheduled.message' } });
    expect(n).toMatchObject({ targetKind: 'CHANNEL', targetId: CH });
    expect((n.payload as any).content).toBe('Hallo Montag');
    const after = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.nextRunAt?.toISOString()).toBe('2026-10-06T16:00:00.000Z'); // morgen 18:00 Berlin
    expect(after.lastRunAt?.toISOString()).toBe(NOW.toISOString());
    expect(await sendScheduledMessages(NOW)).toEqual({ queued: 0, skipped: 0 }); // nicht doppelt
  });
  it('einmalige Nachricht wird danach deaktiviert; abgeschaltetes Modul sendet nicht', async () => {
    const once = await mk({ scheduleType: 'once', runAt: new Date('2026-10-05T16:00:00Z'), timeOfDay: null });
    await sendScheduledMessages(NOW);
    expect(await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: once.id } })).toMatchObject({ enabled: false, nextRunAt: null });
    await guildRepository.setModuleState(G, { disabled: ['messages'], disabledCommands: [] });
    const daily = await mk({});
    expect(await sendScheduledMessages(NOW)).toEqual({ queued: 0, skipped: 1 });
    expect((await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: daily.id } })).nextRunAt?.toISOString()).toBe('2026-10-06T16:00:00.000Z');
  });
  it('Inhalt: Rollen-Erwähnung, Embed, nur https-Bilder und -Knöpfe', () => {
    const p = scheduledPayload({ content: 'Meeting um {uhrzeit}', mentionRoleIds: ['800000000000320009', 'kaputt'], embed: { title: 'Teammeeting', color: '#ff0000', imageUrl: 'http://x/y.png' }, buttons: [{ label: 'Infos', url: 'https://example.org' }] }, NOW);
    expect(p).toEqual({
      content: '<@&800000000000320009>\nMeeting um 18:00',
      embeds: [{ title: 'Teammeeting', color: 0xff0000 }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Infos', url: 'https://example.org' }] }],
      allowed_mentions: { parse: [], roles: ['800000000000320009'] },
    });
  });
});
