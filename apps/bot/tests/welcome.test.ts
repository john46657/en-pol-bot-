import { describe, expect, it } from 'vitest';
import { DEFAULT_WELCOME_CONFIG, accountAge, renderWelcomeText, type WelcomeConfig } from '@enrp/shared';
import type { Api } from '../src/api';
import { createWelcome, welcomeEmbed, type MemberEvent, type WelcomeActions } from '../src/welcome';

const GUILD = '323456789012345678', USER = '123456789012345678', CH = '423456789012345678', ROLE = '523456789012345678';
const member = (p: Partial<MemberEvent> = {}): MemberEvent => ({ id: USER, guildId: GUILD, bot: false, username: 'max', displayName: 'Max', server: 'EN Polizei', memberCount: 42, createdAt: new Date(Date.now() - 3 * 86_400_000), avatar: 'https://cdn.example/a.png', ...p });

function setup(cfg: Partial<WelcomeConfig>) {
  const calls: string[] = [];
  const api: Api = {
    async asUser() { throw new Error('unused'); },
    async service(method, path, body) { calls.push(`${method} ${path} ${body ? JSON.stringify(body) : ''}`.trim()); return (method === 'GET' ? { ...DEFAULT_WELCOME_CONFIG, ...cfg } : {}) as never; },
  };
  const done: string[] = [];
  const actions: WelcomeActions = {
    async post(channelId, m) { done.push(`post ${channelId} ${m.content ?? ''} ${m.embed.title} | ${m.embed.description ?? ''}`); },
    async dm(userId, text) { done.push(`dm ${userId} ${text}`); },
    async addRoles(guildId, userId, ids) { done.push(`roles ${guildId} ${userId} ${ids.join(',')}`); },
  };
  return { w: createWelcome(api, actions, () => undefined), calls, done };
}

describe('welcome texts', () => {
  it('replaces placeholders and keeps unknown ones', () => {
    expect(renderWelcomeText('Hi {user} ({username}/{displayName}) auf {server}, #{memberCount}, {foo}', member())).toBe(`Hi <@${USER}> (max/Max) auf EN Polizei, #42, {foo}`);
    expect(accountAge(new Date(Date.now() - 3 * 86_400_000))).toBe('3 Tage');
    expect(accountAge(new Date())).toBe('heute erstellt');
    expect(accountAge(null)).toBe('—');
  });
  it('builds the embed with avatar and color', () => {
    const e = welcomeEmbed({ ...DEFAULT_WELCOME_CONFIG.welcome, color: '#ff0000', title: 'Hallo {username}' }, member());
    expect(e).toMatchObject({ title: 'Hallo max', color: 0xff0000, thumbnail: 'https://cdn.example/a.png' });
  });
});

describe('member join / leave', () => {
  it('posts the welcome message, sends the DM and gives the auto roles', async () => {
    const { w, done } = setup({ welcome: { ...DEFAULT_WELCOME_CONFIG.welcome, enabled: true, channelId: CH }, dm: { enabled: true, message: 'Willkommen {username}' }, autoRoleIds: [ROLE] });
    await w.joined(member());
    expect(done).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^post ${CH} <@${USER}> 👋 Willkommen auf EN Polizei!`)), `dm ${USER} Willkommen max`, `roles ${GUILD} ${USER} ${ROLE}`]));
  });
  it('test from the dashboard: sends the message even when switched off, but no roles', async () => {
    const { w, done } = setup({ welcome: { ...DEFAULT_WELCOME_CONFIG.welcome, enabled: false, channelId: CH }, dm: { enabled: false, message: 'Hallo {username}' }, autoRoleIds: [ROLE] });
    await w.test('welcome', member());
    await w.test('dm', member());
    expect(done).toEqual([expect.stringMatching(new RegExp(`^post ${CH} <@${USER}> 👋 Willkommen auf EN Polizei!`)), `dm ${USER} Hallo max`]);
    await expect(w.test('goodbye', member())).rejects.toThrow('Kein Kanal');
  });
  it('does nothing for bots or when everything is off', async () => {
    const a = setup({ autoRoleIds: [ROLE] });
    await a.w.joined(member({ bot: true }));
    expect(a.done).toEqual([]);
    const b = setup({});
    await b.w.joined(member());
    expect(b.done).toEqual([]);
  });
  it('on leave: goodbye message and reports to the system', async () => {
    const { w, done, calls } = setup({ goodbye: { ...DEFAULT_WELCOME_CONFIG.goodbye, enabled: true, channelId: CH } });
    await w.left(member({ memberCount: 41 }));
    expect(done).toEqual([`post ${CH}  Auf Wiedersehen | **max** hat den Server verlassen. Wir sind jetzt 41 Mitglieder.`]);
    expect(calls).toContain(`POST /bot/member-left {"guildId":"${GUILD}","discordId":"${USER}"}`);
  });
  it('caches the configuration briefly', async () => {
    const { w, calls } = setup({});
    await w.joined(member()); await w.joined(member());
    expect(calls.filter((c) => c.startsWith('GET')).length).toBe(1);
  });
});

describe('welcome banner', () => {
  it('uses an uploaded banner as attachment, otherwise the image URL', async () => {
    const ID = '11111111-2222-3333-4444-555555555555';
    const posted: { file?: { name: string; data: Buffer }; image?: string }[] = [];
    let loads = 0;
    const api: Api = {
      async asUser() { throw new Error('unused'); },
      async service(method, path) {
        if (path.startsWith('/bot/welcome/banner/')) { loads++; return { name: 'banner.png', mime: 'image/png', data: Buffer.from('PNG').toString('base64') } as never; }
        return { ...DEFAULT_WELCOME_CONFIG, welcome: { ...DEFAULT_WELCOME_CONFIG.welcome, enabled: true, channelId: CH, imageMediaId: ID }, goodbye: { ...DEFAULT_WELCOME_CONFIG.goodbye, enabled: true, channelId: CH, image: 'https://cdn.example/bye.png' } } as never;
      },
    };
    const w = createWelcome(api, { async post(_c, m) { posted.push({ file: m.file, image: m.embed.image }); }, async dm() {}, async addRoles() {} }, () => undefined);
    await w.joined(member()); await w.joined(member());
    await w.left(member());
    expect(posted[0]).toEqual({ file: { name: 'banner.png', data: Buffer.from('PNG') }, image: 'attachment://banner.png' });
    expect(loads).toBe(1); // Banner wird nur einmal geladen
    expect(posted[2]).toEqual({ file: undefined, image: 'https://cdn.example/bye.png' });
  });
});
