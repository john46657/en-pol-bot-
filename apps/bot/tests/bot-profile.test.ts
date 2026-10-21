import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberAccess } from '../src/access';
import { byName } from '../src/commands';
import {
  _resetStatusCooldown, checkPresence, checkUsername, discordErrorText, imageType, restorePresence, toPresenceData,
  type BotProfileActions, type SavedPresence,
} from '../src/commands/bot-profile';
import type { BotRuntime, Ctx } from '../src/commands/types';
import { GuildConfigStore, memoryKeyValue } from '../src/guild-config';

const G = '111111111111111111', ADMIN = '900000000000000001', OWNER = '900000000000000005', USER = '900000000000000002';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = Buffer.from('GIF89a......', 'latin1');

/** Nachgebautes Discord: merkt sich, was der Bot geändert hat; Fehler lassen sich einschleusen. */
function fakeDiscord(o: { canNick?: boolean; image?: Buffer; fail?: Partial<Record<keyof BotProfileActions, unknown>>; saved?: SavedPresence | null } = {}) {
  const log: string[] = [];
  let stored: SavedPresence | null = o.saved ?? null;
  const maybeFail = (k: keyof BotProfileActions) => { if (o.fail?.[k]) throw o.fail[k]; };
  const p: BotProfileActions = {
    async isBotOwner(u) { return u === OWNER; },
    async canChangeNickname() { return o.canNick ?? true; },
    async setServerNick(g, nick) { maybeFail('setServerNick'); log.push(`nick ${g} ${nick}`); },
    async setGlobalName(n) { maybeFail('setGlobalName'); log.push(`username ${n}`); },
    async download() { maybeFail('download'); return o.image ?? PNG; },
    async setServerAvatar(g, img) { maybeFail('setServerAvatar'); log.push(`server-avatar ${g} ${img ? img.length : 'null'}`); },
    async setGlobalAvatar(img) { maybeFail('setGlobalAvatar'); log.push(`global-avatar ${img ? img.length : 'null'}`); },
    async setPresence(x) { maybeFail('setPresence'); log.push(`presence ${JSON.stringify(toPresenceData(x))}`); },
    async loadPresence() { return stored; },
    async savePresence(x) { maybeFail('savePresence'); stored = x; },
  };
  return { p, log, stored: () => stored };
}

const member = (userId: string, o: Partial<MemberAccess> = {}): MemberAccess => ({ userId, roleIds: [], isOwner: false, administrator: false, manageGuild: false, ...o });
function ctx(p: BotProfileActions, userId: string, opts: Record<string, string | boolean | undefined>, attachments?: Ctx['attachments']) {
  const store = new GuildConfigStore(memoryKeyValue(), 0);
  const members: Record<string, MemberAccess> = { [ADMIN]: member(ADMIN, { manageGuild: true }), [OWNER]: member(OWNER, { manageGuild: true }), [USER]: member(USER) };
  const runtime = { guildConfig: store, access: { member: async (_g: string, u: string) => members[u] ?? null, config: (g: string) => store.get(g) } } as unknown as BotRuntime;
  return { discordId: userId, guildId: G, api: {} as never, runtime, botProfile: p, opts, ...(attachments ? { attachments } : {}) } as Ctx;
}
const run = (c: Ctx) => byName('botprofil')!.run(c);
const msg = (r: { content?: string; embeds?: { title: string; description?: string }[] }) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''}`).join(' ') ?? ''}`;
const file = (o: Partial<{ url: string; name: string; contentType: string | null; size: number }> = {}) => ({ bild: { url: 'https://cdn.discordapp.com/attachments/1/2/a.png', name: 'a.png', contentType: 'image/png', size: 1000, ...o } });

beforeEach(() => _resetStatusCooldown());

describe('Befehl und Rechte', () => {
  it('genau drei Unterbefehle, innerhalb der Discord-Grenzen', () => {
    const d = byName('botprofil')!;
    expect(d.subcommands!.map((s) => s.name)).toEqual(['name', 'avatar', 'status']);
    for (const s of d.subcommands!) {
      expect(s.description.length).toBeLessThanOrEqual(100);
      for (const o of s.options ?? []) { expect(o.name).toMatch(/^[a-z0-9_-]{1,32}$/); expect(o.description.length).toBeLessThanOrEqual(100); expect((o.choices ?? []).length).toBeLessThanOrEqual(25); }
    }
  });
  it('normale Mitglieder dürfen nichts ändern – privat abgelehnt, Discord wird nicht aufgerufen', async () => {
    const { p, log } = fakeDiscord();
    for (const [sub, opts] of [['name', { name: 'X' }], ['avatar', {}], ['status', { text: 'X' }]] as const) {
      const r = await run(ctx(p, USER, { _sub: sub, ...opts }, file()));
      expect(r.content).toMatch(/^⛔/);
      expect(r.ephemeral).toBe(true);
    }
    expect(log).toEqual([]);
  });
  it('global (alle Server) und Status nur für den Bot-Inhaber', async () => {
    const { p, log } = fakeDiscord();
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'name', name: 'Neu', bereich: 'global' })))).toContain('nur dem Bot-Inhaber');
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'avatar', bereich: 'global' }, file())))).toContain('nur dem Bot-Inhaber');
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'status', text: 'Dienst' })))).toContain('nur der Bot-Inhaber');
    expect(log).toEqual([]);
  });
});

describe('1. Customise Bot Name', () => {
  it('je Server: setzt den Nickname, leer setzt zurück', async () => {
    const { p, log } = fakeDiscord();
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'name', name: '  Polizei Nord  ' })))).toContain('**Polizei Nord**');
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'name' })))).toContain('zurückgesetzt');
    expect(log).toEqual([`nick ${G} Polizei Nord`, `nick ${G} null`]);
  });
  it('fehlendes Recht „Nickname ändern“ wird verständlich gemeldet', async () => {
    const { p, log } = fakeDiscord({ canNick: false });
    const t = msg(await run(ctx(p, ADMIN, { _sub: 'name', name: 'X' })));
    expect(t).toContain('„Nickname ändern“');
    expect(t).toContain('Bot-Rolle');
    expect(log).toEqual([]);
  });
  it('zu langer Server-Name wird abgelehnt', async () => {
    const { p } = fakeDiscord();
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'name', name: 'x'.repeat(33) })))).toContain('höchstens 32');
  });
  it('global (Bot-Inhaber): Discord-Regeln für Namen und Rate-Limit', async () => {
    const { p, log } = fakeDiscord();
    expect(msg(await run(ctx(p, OWNER, { _sub: 'name', name: 'EN Polizei', bereich: 'global' })))).toContain('globale Name');
    expect(log).toEqual(['username EN Polizei']);
    expect(checkUsername('a').error).toMatch(/2–32/);
    expect(checkUsername('Discord Bot').error).toMatch(/discord/);
    expect(checkUsername('a@b').error).toBeTruthy();
    const limited = fakeDiscord({ fail: { setGlobalName: { status: 400, code: 50035, rawError: { errors: { username: { _errors: [{ code: 'USERNAME_RATE_LIMIT' }] } } } } } });
    expect(msg(await run(ctx(limited.p, OWNER, { _sub: 'name', name: 'Neu', bereich: 'global' })))).toContain('zu viele Änderungen');
  });
});

describe('2. Customise Bot Avatar', () => {
  it('je Server: PNG/JPG/GIF werden gesetzt; Reset ohne Bild', async () => {
    for (const img of [PNG, JPG, GIF]) {
      const { p, log } = fakeDiscord({ image: img });
      expect(msg(await run(ctx(p, ADMIN, { _sub: 'avatar' }, file())))).toContain('Profilbild des Bots auf diesem Server wurde geändert');
      expect(log).toEqual([`server-avatar ${G} ${img.length}`]);
    }
    const { p, log } = fakeDiscord();
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'avatar', zuruecksetzen: true })))).toContain('zurückgesetzt');
    expect(log).toEqual([`server-avatar ${G} null`]);
  });
  it('global für den Bot-Inhaber', async () => {
    const { p, log } = fakeDiscord();
    await run(ctx(p, OWNER, { _sub: 'avatar', bereich: 'global' }, file()));
    expect(log).toEqual([`global-avatar ${PNG.length}`]);
  });
  it('kein Bild, falscher Typ, getarnte Datei, zu groß → verständliche Meldung, nichts geändert', async () => {
    const { p, log } = fakeDiscord({ image: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'avatar' })))).toContain('Bild anhängen');
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'avatar' }, file({ contentType: 'image/svg+xml' }))))).toContain('PNG, JPG und GIF');
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'avatar' }, file({ size: 9 * 1024 * 1024 }))))).toContain('zu groß');
    expect(msg(await run(ctx(p, ADMIN, { _sub: 'avatar' }, file())))).toContain('geprüft wird der Inhalt'); // .png-Endung, aber SVG-Inhalt
    expect(log).toEqual([]);
    expect(imageType(PNG)).toBe('png'); expect(imageType(Buffer.from('RIFF....WEBP'))).toBeNull();
  });
  it('Fehler von Discord werden übersetzt (Rate-Limit, Berechtigung, abgelehnt, Störung)', async () => {
    const cases: [unknown, RegExp][] = [
      [{ status: 429 }, /zu viele Änderungen/], [{ status: 403, code: 50013 }, /Berechtigung/],
      [{ status: 400, code: 50035, rawError: { errors: { avatar: { _errors: [{ code: 'BINARY_TYPE_MAX_SIZE' }] } } } }, /Bild zu groß/],
      [{ status: 503 }, /gestört/],
    ];
    for (const [err, re] of cases) {
      const { p } = fakeDiscord({ fail: { setServerAvatar: err } });
      expect(msg(await run(ctx(p, ADMIN, { _sub: 'avatar' }, file())))).toMatch(re);
    }
    expect(discordErrorText(new Error('Bot MTIzNDU2Nzg5MDEyMzQ1Njc4OTAx boom'), 'die Änderung')).not.toContain('MTIz');
  });
});

describe('3. Customise Bot Status', () => {
  it('Status + Aktivität setzen, speichern und nach Neustart wiederherstellen', async () => {
    const { p, log, stored } = fakeDiscord();
    const r = await run(ctx(p, OWNER, { _sub: 'status', status: 'dnd', art: 'schaut', text: 'auf die Leitstelle' }));
    expect(msg(r)).toContain('Bitte nicht stören · Schaut auf die Leitstelle');
    expect(log).toEqual(['presence {"status":"dnd","activities":[{"name":"auf die Leitstelle","type":3}]}']);
    expect(stored()).toEqual({ status: 'dnd', activity: 'schaut', text: 'auf die Leitstelle', url: null });
    // „Neustart“: neuer Prozess liest den gespeicherten Status und setzt ihn
    const after = fakeDiscord({ saved: stored() });
    expect(await restorePresence(after.p)).toEqual(stored());
    expect(after.log).toHaveLength(1);
  });
  it('benutzerdefinierter Text (Standard, wenn nur ein Text angegeben ist) und Zurücksetzen', async () => {
    expect(toPresenceData(checkPresence({ text: 'Im Dienst' }).presence!)).toEqual({ status: 'online', activities: [{ name: 'Custom Status', type: 4, state: 'Im Dienst' }] });
    expect(toPresenceData(checkPresence({}).presence!)).toEqual({ status: 'online', activities: [] });
  });
  it('ungültige Eingaben werden abgelehnt', () => {
    expect(checkPresence({ activity: 'spielt' }).error).toMatch(/Text/);
    expect(checkPresence({ text: 'x'.repeat(129) }).error).toMatch(/128/);
    expect(checkPresence({ activity: 'streamt', text: 'Live' }).error).toMatch(/Twitch oder YouTube|Twitch- oder YouTube/);
    expect(checkPresence({ activity: 'streamt', text: 'Live', url: 'https://twitch.tv/enpolizei' }).presence?.url).toBe('https://twitch.tv/enpolizei');
    expect(checkPresence({ activity: 'spielt', text: 'X', url: 'https://twitch.tv/a' }).error).toMatch(/nur bei „Streamt“/);
    expect(checkPresence({ status: 'busy' }).error).toBeTruthy();
  });
  it('Discord-Limit: zweite Änderung kurz danach wird mit Wartezeit abgelehnt', async () => {
    const { p, log } = fakeDiscord();
    await run(ctx(p, OWNER, { _sub: 'status', text: 'A' }));
    expect(msg(await run(ctx(p, OWNER, { _sub: 'status', text: 'B' })))).toMatch(/Sekunden warten/);
    expect(log).toHaveLength(1);
  });
  it('Speichern fehlgeschlagen → Status gilt, Hinweis auf Neustart; kaputter gespeicherter Status wird ignoriert', async () => {
    const { p } = fakeDiscord({ fail: { savePresence: new Error('down') } });
    expect(msg(await run(ctx(p, OWNER, { _sub: 'status', text: 'A' })))).toContain('nach einem Neustart');
    const broken = fakeDiscord({ saved: { status: 'online', activity: 'spielt', text: null, url: null } });
    expect(await restorePresence(broken.p, () => undefined)).toBeNull();
    expect(broken.log).toEqual([]);
  });
});
