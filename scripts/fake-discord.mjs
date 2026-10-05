#!/usr/bin/env node
/**
 * Minimaler Fake der Discord-REST-API für lokale Tests ohne Bot-Token.
 * Start: node scripts/fake-discord.mjs   → API mit DISCORD_API_BASE=http://localhost:4010 starten.
 * Server 900000000000000001: Bot-Rolle (Position 5, „Rollen verwalten“), eine Rolle darunter, eine darüber.
 */
import { createServer } from 'node:http';

const G = '900000000000000001';
const roles = [
  {
    id: G,
    name: '@everyone',
    color: 0,
    position: 0,
    permissions: String(1n << 10n),
    mentionable: false,
  },
  {
    id: '900000000000000100',
    name: 'Polizeileitung',
    color: 0,
    position: 3,
    permissions: '0',
    mentionable: true,
  },
  {
    id: '900000000000000101',
    name: 'Bot',
    color: 0,
    position: 5,
    permissions: String((1n << 28n) | (1n << 11n) | (1n << 14n)),
    mentionable: false,
  },
  {
    id: '900000000000000102',
    name: 'Server-Admin',
    color: 0,
    position: 9,
    permissions: '0',
    mentionable: false,
  },
  {
    id: '900000000000000103',
    name: 'Admins',
    color: 0,
    position: 7,
    permissions: String(1n << 3n),
    mentionable: false,
  },
];
const channels = [
  { id: '900000000000000200', name: 'Büro', type: 4, parent_id: null },
  { id: '900000000000000201', name: 'bewerbungen', type: 0, parent_id: '900000000000000200' },
  { id: '900000000000000202', name: 'Büro-Warteraum', type: 2, parent_id: '900000000000000200' },
  { id: '900000000000000203', name: 'forum', type: 15, parent_id: null },
];
const members = {
  '900000000000000010': [], // Besitzer
  '900000000000000020': [], // normales Mitglied
  '900000000000000030': ['900000000000000103'], // Administrator-Rolle
  '900000000000000040': ['900000000000000100'], // Polizeileitung
  '900000000000000050': ['900000000000000101'], // Rolle mit Sperre
  '900000000000000060': [], // Bewerber (Rollenvergabe testbar)
  '900000000000000070': [], // Bewerber mit gesperrten DMs
  // Moderations-Browsertests (werden dort verwarnt, stummgeschaltet, gekickt, gebannt)
  '900000000000000080': [],
  '900000000000000081': [],
  '900000000000000082': [],
  '900000000000000083': [],
};
const routes = {
  // Serverauswahl im Dashboard: der „angemeldete“ Benutzer ist Besitzer des Demo-Servers
  '/api/v10/users/@me/guilds': [{ id: G, name: 'NEXUS Demo-Server', icon: null, owner: true, permissions: String(1n << 3n) }],
  [`/api/v10/guilds/${G}`]: {
    id: G,
    name: 'NEXUS Demo-Server',
    icon: null,
    owner_id: '900000000000000010',
    permissions: '0',
  },
  [`/api/v10/guilds/${G}/roles`]: roles,
  [`/api/v10/guilds/${G}/channels`]: channels,
  [`/api/v10/guilds/${G}/members/@me`]: {
    user: { id: '1', username: 'nexus-bot', global_name: null },
    roles: ['900000000000000101'],
  },
};
const bans = new Set(); // Moderation: gebannte Benutzer (nur für Tests sichtbar)
const timeouts = new Map(); // userId -> ISO-Ende oder null
const kicked = [];
const messages = new Map(); // `${channelId}/${messageId}` -> payload
let nextId = 1000;
const readBody = (req) =>
  new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d ? JSON.parse(d) : {}));
  });
createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const list = url.match(new RegExp(`^/api/v10/guilds/${G}/members(/search)?$`));
  if (list) {
    const q = new URL(req.url, 'http://x').searchParams.get('query')?.toLowerCase();
    const rows = Object.entries(members)
      .filter(([id]) => !q || ('user' + id).includes(q))
      .map(([id, roles]) => ({
        user: { id, username: 'user' + id.slice(-2), global_name: null },
        roles,
      }));
    return json(200, rows);
  }
  if (url === '/__messages') return json(200, Object.fromEntries(messages)); // nur für Tests
  const dmCh = url === '/api/v10/users/@me/channels' && req.method === 'POST';
  if (dmCh) {
    const body = await readBody(req);
    if (String(body.recipient_id).endsWith('070'))
      return json(403, { message: 'Cannot send messages to this user' });
    return json(200, { id: `dm-${body.recipient_id}` });
  }
  const roleRoute = url.match(new RegExp(`^/api/v10/guilds/${G}/members/(\\d+)/roles/(\\d+)$`));
  if (roleRoute && (req.method === 'PUT' || req.method === 'DELETE')) {
    const [, uid, rid] = roleRoute;
    if (!members[uid]) return json(404, { message: 'Unknown Member' });
    if (rid === '900000000000000102') return json(403, { message: 'Missing Permissions' });
    members[uid] =
      req.method === 'PUT'
        ? [...new Set([...members[uid], rid])]
        : members[uid].filter((r) => r !== rid);
    return json(204);
  }
  if (url === '/__members') return json(200, members);
  if (url === '/__moderation') return json(200, { bans: [...bans], timeouts: Object.fromEntries(timeouts), kicked });
  if (url === '/api/v10/users/@me') return json(200, { id: '1', username: 'nexus-bot' });
  const memberRoute = url.match(new RegExp(`^/api/v10/guilds/${G}/members/(\\d+)$`));
  if (memberRoute && req.method === 'PATCH') {
    const [, uid] = memberRoute;
    if (!members[uid]) return json(404, { message: 'Unknown Member' });
    if (members[uid].includes('900000000000000103')) return json(403, { message: 'Missing Permissions' }); // Admin-Rolle: Discord verbietet es
    timeouts.set(uid, (await readBody(req)).communication_disabled_until ?? null);
    return json(200, { user: { id: uid }, roles: members[uid] });
  }
  if (memberRoute && req.method === 'DELETE') {
    const [, uid] = memberRoute;
    if (!members[uid]) return json(404, { message: 'Unknown Member' });
    delete members[uid];
    kicked.push(uid);
    return json(204);
  }
  const banRoute = url.match(new RegExp(`^/api/v10/guilds/${G}/bans/(\\d+)$`));
  if (banRoute && (req.method === 'PUT' || req.method === 'DELETE')) {
    const [, uid] = banRoute;
    if (req.method === 'PUT') {
      await readBody(req);
      bans.add(uid);
      delete members[uid];
      return json(204);
    }
    if (!bans.delete(uid)) return json(404, { message: 'Unknown Ban' });
    return json(204);
  }
  const msg = url.match(/^\/api\/v10\/channels\/([\w-]+)\/messages(?:\/(\d+))?$/);
  if (msg) {
    const [, channel, id] = msg;
    if (req.method === 'POST' && !id) {
      const newId = String(nextId++);
      messages.set(`${channel}/${newId}`, await readBody(req));
      return json(200, { id: newId });
    }
    if (req.method === 'PATCH' && id) {
      if (!messages.has(`${channel}/${id}`)) return json(404, { message: 'Unknown Message' });
      messages.set(`${channel}/${id}`, await readBody(req));
      return json(200, { id });
    }
    if (req.method === 'DELETE' && id) {
      messages.delete(`${channel}/${id}`);
      return json(204);
    }
  }
  const m = url.match(new RegExp(`^/api/v10/guilds/${G}/members/(\\d+)$`));
  const body = m
    ? members[m[1]]
      ? { user: { id: m[1], username: 'u' + m[1], global_name: null }, roles: members[m[1]] }
      : undefined
    : routes[url];
  res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body ?? { message: 'Unknown' }));
}).listen(4010, () => console.log('Fake-Discord auf :4010'));
