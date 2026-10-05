import { prisma } from '@nexus/database';
import { saveCategory, type TicketDiscord } from '@nexus/tickets';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openApplicationTicket } from '../src/applications/application-ticket.js';
import { setTicketDiscordForTests } from '../src/tickets/ticket-core.js';

const G = 'app-ticket-guild';
const APPLICANT = '900000000000700001';
let seq = 0;
const posts: { channel: string; payload: any }[] = [];
const discord: TicketDiscord = {
  createChannel: vi.fn(async () => `80000000000070${String(++seq).padStart(4, '0')}`),
  deleteChannel: vi.fn(async () => {}),
  fetchMessages: vi.fn(async () => []),
  send: vi.fn(async (channel, payload) => void posts.push({ channel, payload })),
  sendDm: vi.fn(async () => {}),
  setMemberAccess: vi.fn(async () => {}),
  post: vi.fn(async (channel, payload) => {
    posts.push({ channel, payload });
    return 'm1';
  }),
  edit: vi.fn(async () => {}),
  sendFile: vi.fn(async () => {}),
  sendDmFile: vi.fn(async () => {}),
};
const guild = (present = true) => ({ id: G, members: { fetch: vi.fn(async () => (present ? { displayName: 'Bewerber', roles: { cache: new Map() } } : Promise.reject(new Error('Unknown Member')))) } }) as never;

let general = '';
let apply = '';
async function submission(review: Record<string, unknown> = {}) {
  const app = await prisma.application.create({ data: { guildId: G, name: 'Moderation', slug: `mod-${++seq}`, status: 'PUBLISHED', enabled: true, config: { review } as never, createdBy: 'x', updatedBy: 'x' } });
  const v = await prisma.applicationVersion.create({ data: { applicationId: app.id, version: 1, questions: [], publishedById: 'x' } });
  return (await prisma.applicationSubmission.create({ data: { guildId: G, applicationId: app.id, versionId: v.id, userId: APPLICANT, usernameSnapshot: 'b', displayNameSnapshot: 'B', status: 'SUBMITTED', submittedAt: new Date() } })).id;
}

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Ticket', settings: { create: {} } } });
  general = (await saveCategory(G, { name: 'Allgemein' }, 'x')).id;
  apply = (await saveCategory(G, { name: 'Bewerbungen' }, 'x')).id;
  posts.length = 0;
  setTicketDiscordForTests(discord);
});
afterAll(async () => {
  setTicketDiscordForTests(null);
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Bewerbungsticket', () => {
  it('Kategorie der Bewerbungsart, kein doppeltes Ticket, Bearbeitungs-Knöpfe im Ticket', async () => {
    const id = await submission({ ticketCategoryId: apply });
    const r = await openApplicationTicket(guild(), id, 'mod-1');
    expect(r).toMatchObject({ ok: true, existing: false });
    const t = await prisma.ticket.findFirstOrThrow({ where: { guildId: G, submissionId: id } });
    expect(t.categoryId).toBe(apply);
    const ids = JSON.stringify(posts.map((p) => p.payload.components));
    for (const a of ['accept', 'deny', 'claim', 'note']) expect(ids).toContain(`nexus:review:${a}:${id}`);
    expect(await openApplicationTicket(guild(), id, 'mod-1')).toMatchObject({ ok: true, existing: true });
    expect(await prisma.ticket.count({ where: { guildId: G, submissionId: id } })).toBe(1);
  });

  it('ohne eigene Kategorie: erste aktive; Bewerber nicht mehr da: verständlicher Fehler', async () => {
    const id = await submission();
    await openApplicationTicket(guild(), id, 'mod-1');
    expect((await prisma.ticket.findFirstOrThrow({ where: { submissionId: id } })).categoryId).toBe(general);
    const gone = await submission();
    expect(await openApplicationTicket(guild(false), gone, 'mod-1')).toEqual({ ok: false, message: 'Der Bewerber ist nicht (mehr) auf dem Server.' });
    expect(await openApplicationTicket(guild(), 'gibtesnicht', 'mod-1')).toEqual({ ok: false, message: 'Bewerbung nicht gefunden.' });
  });
});
