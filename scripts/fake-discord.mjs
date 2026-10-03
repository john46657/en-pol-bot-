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
};
const routes = {
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
  if (url === '/__messages') return json(200, Object.fromEntries(messages)); // nur für Tests
  const msg = url.match(/^\/api\/v10\/channels\/(\d+)\/messages(?:\/(\d+))?$/);
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
