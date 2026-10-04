import { prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketError, buildPanel, channelName, claim, closeTicket, deleteDueChannels, getSettings, loadLevel, loads, openTicket, percentOf, pingStaff, postPanel, refreshPanel, renderTranscriptHtml, saveCategory, saveSettings, transcriptFileName, type Actor, type TicketDiscord, type TranscriptMessage, _resetPanelCache } from '../src/index.js';

const G = 'ticketv2-guild';
const [U1, U2, STAFF, ADMIN, BOSS] = ['900000000000220001', '900000000000220002', '900000000000220003', '900000000000220004', '900000000000220005'];
const [ROLE, ADMROLE, NEEDROLE] = ['900000000000229001', '900000000000229002', '900000000000229003'];
const TR = '800000000000220009';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof TicketError && e.code === code);
const staff: Actor = { userId: STAFF, roleIds: [ROLE], manage: false, handle: true };
const adminViaRole: Actor = { userId: ADMIN, roleIds: [ADMROLE], manage: false, handle: false };
const user = (id: string): Actor => ({ userId: id, roleIds: [], manage: false, handle: false });

function fake(messages: TranscriptMessage[] = []) {
  let n = 0;
  const log: { channel: string; payload: any; file?: any }[] = [];
  const d = {
    log, created: [] as any[], deleted: [] as string[], access: [] as [string, string, boolean][], dms: [] as any[], edits: [] as any[],
    createChannel: vi.fn(async (i: any) => { d.created.push(i); return `80000000000022${String(++n).padStart(4, '0')}`; }),
    deleteChannel: vi.fn(async (c: string) => void d.deleted.push(c)),
    fetchMessages: vi.fn(async () => messages),
    send: vi.fn(async (channel: string, payload: any) => void log.push({ channel, payload })),
    sendDm: vi.fn(async (u: string, payload: any) => void d.dms.push({ u, payload })),
    setMemberAccess: vi.fn(async (c: string, u: string, a: boolean) => void d.access.push([c, u, a])),
    post: vi.fn(async (channel: string, payload: any) => { log.push({ channel, payload }); return 'panelmsg'; }),
    edit: vi.fn(async (channel: string, id: string, payload: any) => void d.edits.push({ channel, id, payload })),
    sendFile: vi.fn(async (channel: string, payload: any, file: any) => void log.push({ channel, payload, file })),
    sendDmFile: vi.fn(async (u: string, payload: any, file: any) => void d.dms.push({ u, payload, file })),
  };
  return d as typeof d & TicketDiscord;
}
const msg = (author: string, content: string, extra: Partial<TranscriptMessage> = {}): TranscriptMessage => ({ id: String(Math.random()).slice(2), authorId: author, author, bot: false, content, at: '2026-10-04T12:32:00.000Z', attachments: [], embeds: 0, ...extra });

let cat = '';
beforeEach(async () => {
  _resetPanelCache();
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'PrinceArmy', iconUrl: 'https://cdn.example/icon.png', settings: { create: {} } } });
  cat = (await saveCategory(G, { name: 'Shader', emoji: '🎨', description: 'Probleme mit dem Shader', staffRoleIds: [ROLE], maxOpenTotal: 4, color: 0x5865f2 }, 'boss')).id;
});
afterAll(async () => {
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Auslastung', () => {
  it('Stufen und Berechnung: offen / maximal × 100', () => {
    expect([0, 49, 50, 79, 80, 99, 100].map(loadLevel)).toEqual(['low', 'low', 'medium', 'medium', 'high', 'high', 'full']);
    expect(percentOf(1, 20)).toBe(5);
    expect(percentOf(3, 0)).toBe(100);
    expect(percentOf(30, 20)).toBe(100);
  });

  it('Panel zeigt Texte aus der Konfiguration, Kategorien mit Beschreibung, Auslastung und Select-Menü; füllt sich beim Öffnen/Schließen', async () => {
    await saveCategory(G, { name: 'Leitung', emoji: '🟣', description: 'Fragen für die Leitung', maxOpenTotal: 10 }, 'b');
    const d = fake();
    await openTicket({ guildId: G, userId: U1, username: 'John', categoryId: cat }, d);
    const p = (await buildPanel(G)) as any;
    expect(p.embeds[0].title).toBe('🔷 Ticket-Support');
    expect(p.embeds[0].description).toContain('Probleme mit dem Shader');
    expect(p.embeds[1].title).toBe('📊 Ticket Auslastung');
    expect(p.embeds[1].description).toContain('🟢 Shader: Verfügbar 1/4 (25%)');
    expect(p.embeds[1].description).toContain('🟢 Leitung: Verfügbar 0/10 (0%)');
    expect(p.components[0].components[0]).toMatchObject({ custom_id: 'nexus:ticket:pick', placeholder: '🔽 Wähle eine Kategorie ...' });
    expect(p.components[0].components[0].options.map((o: any) => o.label)).toEqual(['Shader', 'Leitung']);
    await saveSettings(G, { panelTitle: 'Mein Titel', loadEnabled: false }, 'b');
    const p2 = (await buildPanel(G)) as any;
    expect(p2.embeds).toHaveLength(1);
    expect(p2.embeds[0].title).toBe('Mein Titel');
  });

  it('volle Kategorie: Ticket wird abgelehnt (auch parallel nie über der Grenze); optional aus dem Menü ausgeblendet; Farbe wechselt', async () => {
    const d = fake();
    const results = await Promise.allSettled(Array.from({ length: 7 }, (_, i) => openTicket({ guildId: G, userId: `90000000000022${String(100 + i)}`, username: `u${i}`, categoryId: cat }, d)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.every((r) => r.reason instanceof TicketError && r.reason.code === 'conflict')).toBe(true);
    const [l] = await loads(G);
    expect(l).toMatchObject({ open: 4, max: 4, percent: 100, level: 'full' });
    let p = (await buildPanel(G)) as any;
    expect(p.embeds[1].description).toContain('🔴 Shader: Voll 4/4 (100%)');
    expect(p.components[0].components[0].options[0].description).toContain('🔴 Voll');
    await saveSettings(G, { hideFullCategories: true }, 'b');
    p = (await buildPanel(G)) as any;
    expect(p.components).toEqual([]);
  });

  it('Panel wird nur bei Änderung bearbeitet (keine unnötigen Discord-Aufrufe)', async () => {
    const d = fake();
    expect(await refreshPanel(G, d)).toBe('none'); // noch kein Panel
    await postPanel(G, '800000000000220100', d);
    expect((await getSettings(G)).panelMessageId).toBe('panelmsg');
    expect(await refreshPanel(G, d)).toBe('unchanged');
    await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat }, d);
    await new Promise((r) => setTimeout(r, 50));
    expect(d.edits).toHaveLength(1); // beim Öffnen automatisch aktualisiert
    expect(await refreshPanel(G, d)).toBe('unchanged');
    expect(d.edits).toHaveLength(1);
  });
});

describe('Ticket eröffnen (v2)', () => {
  it('ohne Betreff direkt nach der Kategorie; Kanalname aus Vorlage; Rechte: Ersteller + Team, Start-Embed mit 5 Buttons', async () => {
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'John Doe', categoryId: cat, roleIds: [] }, d);
    expect(t.subject).toBe('Shader');
    expect(d.created[0]).toMatchObject({ name: 'ticket-0001-john-doe', userIds: [U1], roleIds: [ROLE] });
    const start = d.log[0]!.payload;
    expect(start.embeds[0]).toMatchObject({ title: '🎫 Ticket geöffnet', color: 0x5865f2 });
    expect(start.embeds[0].description).toContain(`<@${U1}>`);
    expect(start.components[0].components.map((c: any) => c.label)).toEqual(['Ticket schließen', 'Schließen mit Grund', 'Claim / Übernehmen', 'Benachrichtigung', 'Informationen']);
    await saveSettings(G, { nameTemplate: 'support-{user}', claimEnabled: false, closeWithReason: false }, 'b');
    const t2 = await openTicket({ guildId: G, userId: U2, username: 'Eve', categoryId: cat }, d);
    expect(d.created[1].name).toBe('support-eve');
    expect(d.log.at(-1)!.payload.components[0].components.map((c: any) => c.label)).toEqual(['Ticket schließen', 'Benachrichtigung', 'Informationen']);
    expect(t2.id).not.toBe(t.id);
  });

  it('Kanalnamen sind immer gültig; Vorlage ohne Platzhalter wird abgelehnt', async () => {
    expect(channelName('ticket-{number}-{user}', { number: 1234, user: 'ÄÖü Bob!!', category: 'x' })).toBe('ticket-1234-aou-bob');
    expect(channelName('{user}', { number: 7, user: '###', category: 'x' })).toBe('user');
    await expect(saveSettings(G, { nameTemplate: 'ticket' }, 'b')).rejects.toThrow(/Vorlage/);
    await err(saveCategory(G, { name: 'Y', nameTemplate: 'fest' }, 'b'), 'invalid');
  });

  it('ein offenes Ticket je Kategorie („Du hast bereits ein offenes Ticket“) und benötigte Rollen', async () => {
    const d = fake();
    await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat }, d);
    await expect(openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat }, d)).rejects.toThrow('Du hast bereits ein offenes Ticket');
    const lead = (await saveCategory(G, { name: 'Leitung', requiredRoleIds: [NEEDROLE] }, 'b')).id;
    await err(openTicket({ guildId: G, userId: U2, username: 'b', categoryId: lead, roleIds: [] }, d), 'forbidden');
    expect((await openTicket({ guildId: G, userId: U2, username: 'b', categoryId: lead, roleIds: [NEEDROLE] }, d)).status).toBe('OPEN');
  });

  it('Formular: Antworten werden gespeichert und im Start-Embed gezeigt; max. 5 Felder', async () => {
    const f = (await saveCategory(G, { name: 'Bug', formFields: Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, label: `Frage ${i}`, style: 'short' as const, required: true })) }, 'b')).id;
    const row = await prisma.ticketCategory.findUniqueOrThrow({ where: { id: f } });
    expect((row.formFields as unknown[]).length).toBe(5);
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: f, formAnswers: [{ label: 'Frage 0', value: 'Shader flackert' }] }, d);
    expect(t.formAnswers).toEqual([{ label: 'Frage 0', value: 'Shader flackert' }]);
    expect(d.log[0]!.payload.embeds[0].fields.map((x: any) => x.value)).toContain('Shader flackert');
  });

  it('Ticket aus Bewerbung: „Bewerbungsgespräch“, Bewerbung zugeordnet, Button „View Applicants Application“', async () => {
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'bewerber', categoryId: cat, submission: { id: 'sub1', name: 'Flugstaffel' }, openedBy: STAFF }, d);
    expect(t.submissionId).toBe('sub1');
    const e = d.log[0]!.payload.embeds[0];
    expect(e.title).toBe('🎫 Bewerbungsgespräch');
    expect(e.description).toContain(`<@${U1}>`);
    expect(e.description).toContain('Flugstaffel');
    expect(d.log[0]!.payload.components[1].components[0].label).toBe('View Applicants Application');
  });
});

describe('Claim, Benachrichtigung', () => {
  it('Claim-Embed; Claim abschaltbar; „nur Bearbeiter“ sperrt andere Teammitglieder, Verwaltung und Admin-Rolle nicht', async () => {
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat }, d);
    await claim(G, t.id, staff, d);
    expect(d.log.at(-1)!.payload.embeds[0]).toMatchObject({ title: '🎫 Ticket übernommen', description: `Dieses Ticket wird aktuell von <@${STAFF}> bearbeitet.` });
    await saveSettings(G, { claimExclusive: true, adminRoleIds: [ADMROLE] }, 'b');
    const other: Actor = { userId: BOSS, roleIds: [ROLE], manage: false, handle: true };
    await err(closeTicket(G, t.id, 'x', other, d), 'forbidden');
    expect((await closeTicket(G, t.id, 'ok', adminViaRole, d)).ticket.status).toBe('CLOSED');
    await saveSettings(G, { claimEnabled: false }, 'b');
    const t2 = await openTicket({ guildId: G, userId: U2, username: 'b', categoryId: cat }, d);
    await err(claim(G, t2.id, staff, d), 'conflict');
  });

  it('Benachrichtigung: Ersteller darf, Fremde nicht, höchstens alle 5 Minuten; meldet den Bearbeiter', async () => {
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat }, d);
    const t0 = new Date('2026-10-04T12:00:00Z');
    await err(pingStaff(G, t.id, user(U2), d, t0), 'forbidden');
    await pingStaff(G, t.id, user(U1), d, t0);
    expect(d.log.at(-1)!.payload.content).toContain(`<@&${ROLE}>`);
    await err(pingStaff(G, t.id, user(U1), d, new Date(t0.getTime() + 60_000)), 'conflict');
    await claim(G, t.id, staff, d);
    await pingStaff(G, t.id, user(U1), d, new Date(t0.getTime() + 6 * 60_000));
    expect(d.log.at(-1)!.payload.content).toContain(`<@${STAFF}>`);
  });
});

describe('Schließen & Transcript', () => {
  it('Transcript-Kanal bekommt Embed + HTML-Datei; Ersteller verliert Zugriff, Team nicht; Kanal wird erst nach der Löschfrist entfernt', async () => {
    await saveSettings(G, { transcriptChannelId: TR, deleteAfterMinutes: 10 }, 'b');
    const d = fake([msg(U1, 'Hallo, ich habe ein Problem mit dem Shader.'), msg(STAFF, 'Was genau funktioniert bei dir nicht?')]);
    const t = await openTicket({ guildId: G, userId: U1, username: 'John', categoryId: cat }, d);
    const now = new Date('2026-10-04T12:00:00Z');
    const r = await closeTicket(G, t.id, 'Problem wurde gelöst.', staff, d, { now, names: { [U1]: 'John', [STAFF]: 'Supporter' } });
    expect(r).toMatchObject({ logged: true, dmDelivered: true, channelDeleted: false });
    expect(r.deleteAt).toEqual(new Date(now.getTime() + 10 * 60_000));
    const sent = d.log.find((l) => l.channel === TR)!;
    expect(sent.payload.embeds[0].title).toBe('📄 Ticket Transcript');
    expect(sent.payload.embeds[0].fields.find((f: any) => f.name === 'Grund').value).toBe('Problem wurde gelöst.');
    expect(sent.file.name).toBe('ticket-0001-john.html');
    expect(sent.file.content).toContain('Was genau funktioniert bei dir nicht?');
    expect(d.access).toEqual([[t.channelId, U1, false]]); // nur der Ersteller; das Team behält den Zugriff
    expect(d.deleted).toEqual([]);
    expect(d.log.find((l) => l.channel === t.channelId && l.payload.embeds?.[0]?.title === '🔒 Ticket geschlossen')!.payload.embeds[0].description).toContain('Problem wurde gelöst.');
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(stored.transcriptHtml).toContain('Problem wurde gelöst.');
    // vor Ablauf nichts, danach gelöscht und markiert
    expect(await deleteDueChannels(d, new Date(now.getTime() + 5 * 60_000))).toEqual({ deleted: 0, failed: 0 });
    expect(await deleteDueChannels(d, new Date(now.getTime() + 11 * 60_000))).toEqual({ deleted: 1, failed: 0 });
    expect(d.deleted).toEqual([t.channelId]);
    expect(await deleteDueChannels(d, new Date(now.getTime() + 12 * 60_000))).toEqual({ deleted: 0, failed: 0 });
  });

  it('DM-Transcript optional; Transcript pro Kategorie/Server abschaltbar; fehlgeschlagenes Löschen wird wiederholt, 404 gilt als gelöscht', async () => {
    await saveSettings(G, { transcriptChannelId: TR, dmTranscript: true }, 'b');
    const d = fake([msg(U1, 'x')]);
    const t = await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat }, d);
    await closeTicket(G, t.id, undefined, staff, d);
    expect(d.dms[0].file.name).toMatch(/\.html$/);
    await saveSettings(G, { transcriptEnabled: false }, 'b');
    const t2 = await openTicket({ guildId: G, userId: U2, username: 'b', categoryId: cat }, d);
    await closeTicket(G, t2.id, undefined, staff, d);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t2.id } })).transcriptHtml).toBeNull();
    const { DiscordApiError } = await import('@nexus/discord');
    const bad = fake();
    bad.deleteChannel = vi.fn(async () => { throw new Error('500'); });
    const later = new Date(Date.now() + 3600_000);
    expect(await deleteDueChannels(bad, later)).toMatchObject({ failed: 2 });
    bad.deleteChannel = vi.fn(async () => { throw new DiscordApiError(404, '/channels/x', 'Unknown Channel'); });
    expect(await deleteDueChannels(bad, later)).toEqual({ deleted: 2, failed: 0 });
  });
});

describe('HTML-Transcript', () => {
  const meta = { guildName: 'Prince<Army>', guildIconUrl: 'https://cdn.example/i.png', ticketName: 'ticket-0001', ticketId: 'abc', number: '#0001', category: 'Shader', creatorTag: 'John', creatorId: '1', createdAt: new Date('2026-10-04T12:00:00Z'), closedAt: new Date('2026-10-04T13:00:00Z'), closedBy: '2', claimedBy: null, reason: 'Fertig', names: { '2': 'Supporter' } };

  it('enthält Kopfdaten, Nachrichten mit Uhrzeit/Autor, Anhänge (Bilder inline), Links, Antworten und Systemaktionen', () => {
    const m1 = msg('John', 'Hallo, siehe https://example.org/x?a=1&b=2', { id: 'm1', attachments: [{ name: 'shot.png', url: 'https://cdn.example/shot.png' }, { name: 'log.txt', url: 'https://cdn.example/log.txt' }] });
    const m2 = msg('Supporter', 'Was genau?', { id: 'm2', replyTo: 'm1', bot: true });
    const html = renderTranscriptHtml({ ...meta, systemEvents: [{ at: '2026-10-04T12:33:00.000Z', text: 'Supporter hat das Ticket übernommen' }] }, [m1, m2]);
    for (const part of ['Prince&lt;Army&gt;', '#0001', 'Shader', 'Fertig', 'Supporter', '2 Nachrichten', '<img src="https://cdn.example/shot.png"', '📎 <a href="https://cdn.example/log.txt"', '<a href="https://example.org/x?a=1&amp;b=2"', '↩ John: Hallo', 'BOT', 'hat das Ticket übernommen', 'Content-Security-Policy']) expect(html, part).toContain(part);
  });

  it('maskiert Nutzerinhalte vollständig (kein Skript, keine javascript:-Links, keine Attribut-Ausbrüche)', () => {
    const evil = msg('<script>alert(1)</script>', '<img src=x onerror=alert(1)> javascript:alert(1) "><svg onload=1>', { id: '"><b>', attachments: [{ name: '"><script>x</script>.png', url: 'javascript:alert(1)' }, { name: 'a.png', url: 'https://x.example/a.png" onerror="alert(1)' }] });
    const html = renderTranscriptHtml({ ...meta, ticketName: '<b>x</b>' }, [evil]);
    expect(html).not.toMatch(/<script>alert|<svg onload|<img src=x|<b>x<\/b>/);
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('src="javascript:');
    expect(html).not.toMatch(/src="https:\/\/x\.example\/a\.png" onerror/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('Dateiname wie in der Vorlage', () => {
    expect(transcriptFileName({ number: 1234 }, 'John')).toBe('ticket-1234-john.html');
  });
});

describe('Einstellungen', () => {
  it('Standardwerte, Validierung, unbekannte Felder, Audit', async () => {
    const s = await getSettings(G);
    expect(s).toMatchObject({ claimEnabled: true, deleteAfterMinutes: 10, selectPlaceholder: '🔽 Wähle eine Kategorie ...', loadTitle: '📊 Ticket Auslastung' });
    await expect(saveSettings(G, { boese: 1 }, 'b')).rejects.toThrow(/Unbekannt/);
    await expect(saveSettings(G, { transcriptChannelId: 'abc' }, 'b')).rejects.toThrow(/Kanal/);
    await expect(saveSettings(G, { deleteAfterMinutes: -1 }, 'b')).rejects.toThrow(/Löschfrist/);
    await expect(saveSettings(G, { color: 0x1000000 }, 'b')).rejects.toThrow(/Farbe/);
    await expect(saveSettings(G, { adminRoleIds: ['x'] }, 'b')).rejects.toThrow(/Rollen/);
    await expect(saveSettings(G, { claimEnabled: 'ja' }, 'b')).rejects.toThrow(/an oder aus/);
    await saveSettings(G, { transcriptChannelId: TR, adminRoleIds: [ADMROLE], color: 0xff0000 }, 'boss');
    expect(await getSettings(G)).toMatchObject({ transcriptChannelId: TR, adminRoleIds: [ADMROLE], color: 0xff0000 });
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'ticket.settings.updated' } })).toBe(1);
  });
});
