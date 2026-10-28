import { Store } from '../src/store.js';
import { ApplicationService } from '../src/service.js';
import { defaultType } from '../src/defaults.js';
import { DmFlow } from '../src/discord/flow.js';
import { createApplyLink, createWebServer } from '../src/web/server.js';

export const G = '100000000000000001';
export const ADMIN = { id: '200000000000000001', name: 'Admin' };
export const SECRET = 'x'.repeat(40);
const silent = { info() {}, error() {} };

/** Discord-Attrappe: merkt sich alle Aufrufe. */
export function fakeDiscord() {
  const calls = [];
  let n = 1;
  const rec = (name) => async (...args) => { calls.push([name, ...args]); return undefined; };
  return {
    calls,
    members: { [ADMIN.id]: { roles: [], manageGuild: true } },
    guildName: async () => 'Testserver',
    sendDm: async (userId, payload) => { calls.push(['sendDm', userId, payload]); return { channelId: '1', messageId: String(n++) }; },
    sendDecisionDm: rec('sendDecisionDm'),
    applyRoles: rec('applyRoles'),
    postApplication: async (g, app, type) => { calls.push(['postApplication', app.number]); return type.channels.pending ? { channelId: type.channels.pending, messageId: String(n++) } : null; },
    updateApplicationMessage: rec('updateApplicationMessage'),
    postArchive: rec('postArchive'),
    postPanel: async (g, panel) => { calls.push(['postPanel', panel.id]); return { channelId: panel.channelId, messageId: String(n++) }; },
    createTicket: async () => ({ channelId: '9', existing: false }),
    guilds() { return [{ id: G, name: 'Testserver', icon: null }]; },
    async member(g, userId) { return this.members[userId] ?? null; },
    meta: async () => ({ id: G, name: 'Testserver', channels: [], categories: [], roles: [], botCanManageRoles: true }),
  };
}

export const roblox = { lookup: async (name) => (name === 'gibtsnicht' ? null : { id: '42', name, displayName: name, avatarUrl: null }) };

export function setup(typeOver = {}) {
  const store = new Store(null);
  const discord = fakeDiscord();
  const service = new ApplicationService({ store, discord, roblox, log: silent });
  const t = defaultType({ channels: { pending: '300000000000000001', accepted: '300000000000000002', denied: '' }, roles: { ...defaultType().roles, accepted: ['400000000000000001'], pending: ['400000000000000002'] }, ...typeOver });
  store.guild(G).types = [t];
  const flow = new DmFlow({ service, store, roblox, send: discord.sendDm, webLink: createApplyLink({ secret: SECRET, publicUrl: 'http://x' }), log: silent });
  return { store, discord, service, flow, type: t };
}

export const answers = ['Lena, 19', 'Ich möchte helfen, weil mir die Community am Herzen liegt.', 'Support', 'abends'];

/** Webserver auf freiem Port; `as(userId)` liefert fetch mit Login-Cookie. */
export async function web(ctx) {
  const app = createWebServer({ store: ctx.store, service: ctx.service, discord: ctx.discord, secret: SECRET, publicUrl: 'http://localhost', demoUser: ADMIN, log: silent });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, { redirect: 'manual' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const call = (path, { method = 'GET', body, auth = true, csrf = true } = {}) => fetch(`${base}${path}`, { method, headers: { ...(auth ? { cookie } : {}), ...(csrf ? { 'x-requested-with': 'bewerbungs-bot' } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { base, call, close: () => server.close() };
}
