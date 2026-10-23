import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RemindersService } from '../src/reminders/reminders.service';

const TOKEN = 'test-bot-token-reminders-0123456789abcdef';
const ME = '730000000000000001', OTHER = '730000000000000002', CH = '730000000000000100';
let app: INestApplication; let prisma: PrismaService; let svc: RemindersService;
const http = () => request(app.getHttpServer());
const bot = { Authorization: `Bot ${TOKEN}` };
const outbox = () => prisma.discordOutbox.findMany({ where: { type: 'reminder.due' }, orderBy: { createdAt: 'asc' } });

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  svc = app.get(RemindersService);
});
afterAll(async () => {
  await prisma.reminder.deleteMany({ where: { discordId: { in: [ME, OTHER] } } });
  await prisma.discordOutbox.deleteMany({ where: { type: 'reminder.due' } });
  delete process.env.BOT_API_TOKEN;
  await app.close();
});

describe('Erinnerungen (/remind-me)', () => {
  it('validates input and only the bot may create reminders', async () => {
    expect((await http().post('/api/v1/bot/reminders').send({ discordId: ME, text: 'x', dm: true, delayMs: 600_000 })).status).toBe(401);
    expect((await http().post('/api/v1/bot/reminders').set(bot).send({ discordId: ME, text: '   ', dm: true, delayMs: 600_000 })).body.message).toMatch(/woran ich dich erinnern/);
    expect((await http().post('/api/v1/bot/reminders').set(bot).send({ discordId: ME, text: 'x', dm: true, delayMs: 1000 })).status).toBe(400);
    expect((await http().post('/api/v1/bot/reminders').set(bot).send({ discordId: ME, text: 'x', dm: 'True', delayMs: 600_000 })).status).toBe(400); // der Bot schickt immer einen echten Wahrheitswert
  });

  it('is stored, delivered exactly once when due, and not again after a restart', async () => {
    const r = await http().post('/api/v1/bot/reminders').set(bot).send({ discordId: ME, guildId: '730000000000000009', channelId: CH, text: 'Streife fahren', dm: false, delayMs: 600_000 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'PENDING', dm: false, duplicate: false });
    // doppelt abgeschickt → dieselbe Erinnerung
    const again = await http().post('/api/v1/bot/reminders').set(bot).send({ discordId: ME, guildId: '730000000000000009', channelId: CH, text: 'Streife fahren', dm: false, delayMs: 600_000 });
    expect(again.body).toMatchObject({ id: r.body.id, duplicate: true });
    expect((await http().get(`/api/v1/bot/reminders?discordId=${ME}`).set(bot)).body.map((x: { id: string }) => x.id)).toEqual([r.body.id]);

    expect((await svc.tick(new Date(Date.now() + 5 * 60_000))).sent).toBe(0); // noch nicht fällig
    const later = new Date(Date.now() + 11 * 60_000);
    // zwei Instanzen/Durchläufe gleichzeitig → trotzdem nur eine Zustellung
    const [a, b] = await Promise.all([svc.tick(later), svc.tick(later)]);
    expect(a.sent + b.sent).toBe(1);
    expect((await svc.tick(later)).sent).toBe(0); // „Neustart“: nichts doppelt
    const items = await outbox();
    expect(items).toHaveLength(1);
    expect(items[0]!.payload).toMatchObject({ id: r.body.id, discordId: ME, channelId: CH, dm: false, text: 'Streife fahren', fire: 1 });
    expect(items[0]!.payload).not.toHaveProperty('lateMinutes');
  });

  it('missed reminders (bot/API offline) are delivered once with a late note', async () => {
    const r = await svc.create({ discordId: ME, channelId: null, text: 'Verpasst', dm: false, delayMs: 60_000 }, new Date(Date.now() - 3 * 3_600_000));
    expect(r.dm).toBe(true); // ohne Kanal (Befehl in der DM) → DM
    await svc.tick();
    const p = (await outbox()).find((x) => (x.payload as { id: string }).id === r.id)!.payload as { lateMinutes?: number };
    expect(p.lateMinutes).toBeGreaterThanOrEqual(179);
    expect((await svc.tick()).sent).toBe(0);
  });

  it('snooze buttons: only the first click counts, only the owner may click', async () => {
    const r = await svc.create({ discordId: ME, channelId: CH, text: 'Pause', dm: true, delayMs: 60_000 }, new Date(Date.now() - 120_000));
    await svc.tick();
    const path = `/api/v1/bot/reminders/${r.id}/snooze`;
    expect((await http().post(path).set(bot).send({ discordId: OTHER, fire: 1, minutes: 10 })).body.message).toMatch(/nicht deine Erinnerung/);
    expect((await http().post(path).set(bot).send({ discordId: ME, fire: 1, minutes: 7 })).status).toBe(400);
    const [x, y] = await Promise.all([http().post(path).set(bot).send({ discordId: ME, fire: 1, minutes: 10 }), http().post(path).set(bot).send({ discordId: ME, fire: 1, minutes: 30 })]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect([x, y].find((z) => z.status === 409)!.body.message).toMatch(/bereits verschoben/);
    const row = await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.status).toBe('PENDING');
    expect(row.dueAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    // erneut fällig → neue Auslösung (fire 2); alter Button (fire 1) wirkt nicht mehr
    await svc.tick(new Date(Date.now() + 31 * 60_000));
    expect((await http().post(path).set(bot).send({ discordId: ME, fire: 1, minutes: 10 })).status).toBe(409);
    expect((await http().post(`/api/v1/bot/reminders/${r.id}/done`).set(bot).send({ discordId: ME, fire: 2 })).status).toBe(200);
    expect((await http().post(`/api/v1/bot/reminders/${r.id}/done`).set(bot).send({ discordId: ME, fire: 2 })).body.message).toMatch(/schon erledigt/);
  });

  it('cancel and limits', async () => {
    const r = await svc.create({ discordId: OTHER, channelId: CH, text: 'Weg damit', dm: false, delayMs: 3_600_000 });
    expect((await http().delete(`/api/v1/bot/reminders/${r.id}?discordId=${ME}`).set(bot)).status).toBe(403);
    expect((await http().delete(`/api/v1/bot/reminders/${r.id}?discordId=${OTHER}`).set(bot)).status).toBe(200);
    expect((await http().delete(`/api/v1/bot/reminders/${r.id}?discordId=${OTHER}`).set(bot)).status).toBe(409);
    for (let i = 0; i < 25; i++) await svc.create({ discordId: OTHER, channelId: CH, text: `Nr ${i}`, dm: false, delayMs: 3_600_000 + i * 60_000 });
    await expect(svc.create({ discordId: OTHER, channelId: CH, text: 'zu viel', dm: false, delayMs: 3_600_000 })).rejects.toThrow(/25 offene Erinnerungen/);
  });
});
