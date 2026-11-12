import express from 'express';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { accessLevel, canDecide, visibleTypes } from '../access.js';
import { analytics } from '../analytics.js';
import { sanitizeConfig } from '../defaults.js';
import { formatMinutes, normalizeQuestion, renderText } from '../forms.js';
import { createSigner } from '../links.js';
import { AppError, isOpen } from '../service.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DAYS = 7;
const SNOW = /^\d{15,25}$/;

/** Einfache Begrenzung je IP (z. B. Formular absenden). */
function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(), key = req.ip;
    const h = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (h.length >= max) return res.status(429).json({ error: 'Zu viele Anfragen – bitte später erneut versuchen.' });
    h.push(now); hits.set(key, h);
    if (hits.size > 5000) hits.clear();
    next();
  };
}
const cookies = (req) => Object.fromEntries((req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

/**
 * Dashboard + API + Browser-Formular.
 * `discord` = Adapter (Server, Mitglieder, Kanäle, Rollen), `oauth` = { clientId, clientSecret } oder `demoUser` für den Demo-Modus.
 */
export function createWebServer({ store, service, discord, secret, publicUrl, oauth, demoUser, timeZone = 'Europe/Berlin', log = console }) {
  const app = express();
  const sessions = createSigner(secret, 'session');
  const states = createSigner(secret, 'oauth-state');
  const applyLinks = createSigner(secret, 'apply');
  const secure = publicUrl?.startsWith('https://');
  const setCookie = (res, name, value, maxAgeSec) => res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({ 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://cdn.discordapp.com https://*.rbxcdn.com; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://discord.com", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    next();
  });
  app.use(express.json({ limit: '512kb' }));
  // Schutz vor fremden Seiten: schreibende API-Aufrufe nur mit eigenem Header (setzt nur unser Frontend)
  app.use('/api', (req, res, next) => (req.method === 'GET' || req.get('x-requested-with') === 'bewerbungs-bot' ? next() : res.status(403).json({ error: 'Ungültige Anfrage.' })));

  app.use(express.static(path.join(here, 'public'), { index: false }));
  // Reine Module für das Frontend (KI-Checker, Fragetypen) – gleiche Logik wie im Bot
  app.get('/lib/ai-check.js', (req, res) => res.type('js').sendFile(path.join(here, '..', 'ai-check.js')));
  app.get('/lib/forms.js', (req, res) => res.type('js').sendFile(path.join(here, '..', 'forms.js')));
  app.get('/', (req, res) => res.sendFile(path.join(here, 'public', 'index.html')));
  app.get('/bewerbung/:token', (req, res) => res.sendFile(path.join(here, 'public', 'apply.html')));
  app.get('/health', (req, res) => res.json({ ok: true }));

  // ---------------- Anmeldung ----------------
  app.get('/login', limiter(30, 60_000), (req, res) => {
    if (demoUser) { setCookie(res, 'sid', sessions.encode({ ...demoUser, e: Date.now() + SESSION_DAYS * 86_400_000 }), SESSION_DAYS * 86_400); return res.redirect('/'); }
    const nonce = randomBytes(16).toString('hex');
    setCookie(res, 'oauth_nonce', nonce, 600);
    const state = states.encode({ n: nonce, e: Date.now() + 600_000 });
    const q = new URLSearchParams({ client_id: oauth.clientId, response_type: 'code', scope: 'identify', redirect_uri: `${publicUrl}/auth/callback`, state, prompt: 'none' });
    res.redirect(`https://discord.com/oauth2/authorize?${q}`);
  });
  app.get('/auth/callback', limiter(30, 60_000), async (req, res) => {
    const st = states.decode(String(req.query.state ?? ''));
    if (!st || st.n !== cookies(req).oauth_nonce || typeof req.query.code !== 'string') return res.status(400).send('Anmeldung fehlgeschlagen (ungültiger Status). <a href="/login">Erneut versuchen</a>');
    try {
      const tok = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: oauth.clientId, client_secret: oauth.clientSecret, grant_type: 'authorization_code', code: req.query.code, redirect_uri: `${publicUrl}/auth/callback` }) });
      if (!tok.ok) throw new Error(`Token: ${tok.status}`);
      const { access_token: at } = await tok.json();
      const me = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${at}` } });
      if (!me.ok) throw new Error(`Benutzer: ${me.status}`);
      const u = await me.json();
      const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null;
      setCookie(res, 'oauth_nonce', '', 0);
      setCookie(res, 'sid', sessions.encode({ id: u.id, name: u.global_name ?? u.username, avatar, e: Date.now() + SESSION_DAYS * 86_400_000 }), SESSION_DAYS * 86_400);
      res.redirect('/');
    } catch (e) {
      log.error('Login:', e.message);
      res.status(502).send('Anmeldung bei Discord fehlgeschlagen. <a href="/login">Erneut versuchen</a>');
    }
  });
  app.post('/api/logout', (req, res) => { setCookie(res, 'sid', '', 0); res.json({ ok: true }); });

  const user = (req) => sessions.decode(cookies(req).sid ?? '');
  const memberCache = new Map();
  async function memberOf(guildId, userId) {
    const k = `${guildId}:${userId}`, hit = memberCache.get(k);
    if (hit && hit.at > Date.now() - 30_000) return hit.value;
    const value = await discord.member(guildId, userId);
    memberCache.set(k, { at: Date.now(), value });
    return value;
  }
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
    if (e instanceof AppError) return res.status(e.status).json({ error: e.message });
    log.error('API:', e);
    res.status(500).json({ error: 'Interner Fehler.' });
  });

  app.get('/api/me', wrap(async (req, res) => {
    const u = user(req);
    if (!u) return res.json({ user: null, demo: !!demoUser });
    const guilds = [];
    for (const g of discord.guilds()) {
      const m = await memberOf(g.id, u.id);
      const level = accessLevel(store.guild(g.id), m);
      if (level) guilds.push({ ...g, level });
    }
    res.json({ user: { id: u.id, name: u.name, avatar: u.avatar }, guilds, demo: !!demoUser });
  }));

  // ---------------- Server-Bereich ----------------
  const g = express.Router({ mergeParams: true });
  app.use('/api/g/:guildId', wrap(async (req, res, next) => {
    const u = user(req);
    if (!u) return res.status(401).json({ error: 'Bitte anmelden.' });
    if (!SNOW.test(req.params.guildId) || !discord.guilds().some((x) => x.id === req.params.guildId)) return res.status(404).json({ error: 'Server nicht gefunden (ist der Bot dort?).' });
    const member = await memberOf(req.params.guildId, u.id);
    const cfg = store.guild(req.params.guildId);
    const level = accessLevel(cfg, member);
    if (!level) return res.status(403).json({ error: 'Kein Zugriff auf diesen Server.' });
    Object.assign(req, { u, member, cfg, level, visible: visibleTypes(cfg, member), gid: req.params.guildId, actor: { id: u.id, name: u.name } });
    next();
  }), g);
  const admin = (req, res, next) => (req.level === 'admin' ? next() : res.status(403).json({ error: 'Nur für Admins.' }));
  const canSee = (req, a) => !req.visible || req.visible.has(a.type);
  const appOf = (req) => { const a = service.get(req.gid, req.params.id); if (!canSee(req, a)) throw new AppError(404, 'Bewerbung nicht gefunden.'); return a; };

  g.get('/meta', wrap(async (req, res) => {
    const meta = await discord.meta(req.gid);
    res.json({ ...meta, level: req.level, me: req.u, types: req.cfg.types.filter((t) => !req.visible || req.visible.has(t.key)).map((t) => ({ key: t.key, name: t.name, enabled: t.enabled })) });
  }));

  g.get('/config', admin, (req, res) => res.json(req.cfg));
  g.put('/config', admin, wrap(async (req, res) => {
    const old = req.cfg;
    const r = sanitizeConfig(req.body, old);
    if (r.error) return res.status(400).json({ error: r.error });
    store.setGuild(req.gid, r.config);
    // gesendete Panels mitziehen, wenn sich Texte/Arten geändert haben
    const warnings = [];
    for (const p of r.config.panels.filter((x) => x.message && x.message.channelId === x.channelId)) {
      try { p.message = await discord.postPanel(req.gid, p, r.config.types, 'update'); } catch (e) { warnings.push(`Panel „${p.title}“ konnte nicht aktualisiert werden: ${e.message}`); }
    }
    store.touch();
    res.json({ config: r.config, warnings });
  }));
  g.post('/panels/:pid/send', admin, wrap(async (req, res) => {
    const p = req.cfg.panels.find((x) => x.id === req.params.pid);
    if (!p) throw new AppError(404, 'Panel nicht gefunden – erst speichern.');
    if (!p.channelId) throw new AppError(400, 'Wähle zuerst einen Kanal für das Panel.');
    try { p.message = await discord.postPanel(req.gid, p, req.cfg.types, req.body?.mode === 'new' ? 'new' : 'update'); } catch (e) { throw new AppError(502, `Senden fehlgeschlagen (Rechte des Bots im Kanal?): ${e.message}`); }
    store.touch();
    res.json({ message: p.message });
  }));

  // ---- Bewerbungen ----
  const filtered = (req) => {
    const { status = 'OPEN', type, q } = req.query;
    const s = String(q ?? '').trim().toLowerCase();
    return store.applications(req.gid).filter((a) => canSee(req, a)
      && (status === 'ALL' || (status === 'OPEN' ? isOpen(a) : a.status === status))
      && (!type || a.type === type)
      && (!s || a.number.toLowerCase().includes(s) || a.userName.toLowerCase().includes(s) || a.userId === s || (a.roblox?.name ?? '').toLowerCase().includes(s)));
  };
  g.get('/applications', (req, res) => {
    const rows = filtered(req).sort((a, b) => (req.query.order === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
    const page = Math.max(1, Number(req.query.page) || 1), size = 25;
    const counts = {};
    for (const a of store.applications(req.gid).filter((x) => canSee(req, x))) counts[isOpen(a) ? 'OPEN' : a.status] = (counts[isOpen(a) ? 'OPEN' : a.status] ?? 0) + 1;
    res.json({ items: rows.slice((page - 1) * size, page * size).map((a) => ({ ...a, canDecide: canDecide(req.cfg, service.typeOf(a), req.member) })), total: rows.length, page, pageSize: size, counts });
  });
  g.get('/applications.csv', admin, (req, res) => {
    const rows = filtered(req).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const qs = [...new Set(rows.flatMap((a) => a.answers.map((x) => x.question)))];
    const head = ['Nummer', 'Art', 'Status', 'Discord-ID', 'Name', 'Roblox', 'Eingereicht', 'Entschieden', 'Entschieden von', 'Grund', ...qs];
    const lines = rows.map((a) => [a.number, a.typeName, a.status, a.userId, a.userName, a.roblox?.name ?? '', a.createdAt, a.decidedAt ?? '', a.decidedBy?.name ?? '', a.reason ?? '', ...qs.map((q) => a.answers.find((x) => x.question === q)?.answer ?? '')].map(esc).join(';'));
    res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="bewerbungen.csv"').send(`﻿${[head.map(esc).join(';'), ...lines].join('\r\n')}`);
  });
  g.get('/applications/:id', wrap(async (req, res) => {
    const a = appOf(req);
    res.json({ ...a, canDecide: canDecide(req.cfg, service.typeOf(a), req.member), previous: service.history(req.gid, a.userId).filter((x) => x.id !== a.id && canSee(req, x)).map((x) => ({ id: x.id, number: x.number, typeName: x.typeName, status: x.status, createdAt: x.createdAt, reason: x.reason })) });
  }));
  g.post('/applications/:id/status', wrap(async (req, res) => {
    const a = appOf(req);
    if (!canDecide(req.cfg, service.typeOf(a), req.member)) throw new AppError(403, 'Für diese Bewerbungsart darfst du nicht entscheiden.');
    res.json(await service.setStatus(req.gid, a.id, String(req.body?.status), req.actor, String(req.body?.note ?? '').trim().slice(0, 1000) || undefined));
  }));
  g.post('/applications/:id/decide', wrap(async (req, res) => {
    const a = appOf(req);
    if (!canDecide(req.cfg, service.typeOf(a), req.member)) throw new AppError(403, 'Für diese Bewerbungsart darfst du nicht entscheiden.');
    const reason = String(req.body?.reason ?? '').trim().slice(0, 1000) || null;
    res.json(await service.decide(req.gid, a.id, { status: req.body?.status, reason, notifyReason: req.body?.notifyReason !== false, actor: req.actor }));
  }));
  g.post('/applications/:id/notes', wrap(async (req, res) => { const a = appOf(req); res.json(service.addNote(req.gid, a.id, req.actor, req.body?.text)); }));
  g.post('/applications/:id/ticket', wrap(async (req, res) => {
    const a = appOf(req);
    try { res.json(await service.openTicket(req.gid, a.id, req.u.id)); } catch (e) { if (e instanceof AppError) throw e; throw new AppError(502, `Ticket konnte nicht angelegt werden: ${e.message}`); }
  }));
  g.delete('/applications/:id', admin, wrap(async (req, res) => { const a = appOf(req); service.remove(req.gid, a.id); res.json({ ok: true }); }));
  g.get('/progress', (req, res) => res.json(store.progress(req.gid).filter((p) => !req.visible || req.visible.has(p.type))));

  // ---- Sperren ----
  g.get('/bans', (req, res) => res.json(store.bans(req.gid).filter((b) => req.query.all === '1' || (!b.liftedAt && (!b.expiresAt || Date.parse(b.expiresAt) > Date.now()))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  g.post('/bans', wrap(async (req, res) => res.json(await service.createBan(req.gid, req.actor, req.body ?? {}))));
  g.post('/bans/:id/lift', wrap(async (req, res) => res.json(service.liftBan(req.gid, req.params.id, req.actor))));

  // ---- Statistik ----
  g.get('/analytics', (req, res) => {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
    res.json(analytics(store.applications(req.gid).filter((a) => canSee(req, a)), { days, type: req.query.type || undefined, status: req.query.status || undefined, reviewer: req.query.reviewer || undefined, timeZone }));
  });

  // ---------------- Bewerbung im Browser (persönlicher Link) ----------------
  const claimsOf = (token) => {
    const c = applyLinks.decode(token, 0);
    if (!c) throw new AppError(404, 'Dieser Bewerbungslink ist ungültig.');
    if (c.e < Date.now()) throw new AppError(410, 'Dieser Bewerbungslink ist abgelaufen. Starte die Bewerbung im Discord neu.');
    return c;
  };
  app.get('/api/apply/:token', wrap(async (req, res) => {
    const c = claimsOf(req.params.token);
    const t = service.type(c.g, c.k);
    if (!t) throw new AppError(404, 'Diese Bewerbung gibt es nicht mehr.');
    if (!t.enabled) throw new AppError(409, `Bewerbungen für ${t.name} sind derzeit geschlossen.`);
    if (service.openApplication(c.g, c.u, t.key)) throw new AppError(409, 'Du hast hierfür bereits eine Bewerbung abgeschickt. Bitte warte auf die Entscheidung.');
    res.json({ name: t.name, description: t.description, userName: c.n, guildName: await discord.guildName(c.g).catch(() => ''), expiresAt: new Date(c.e).toISOString(), questions: t.questions.map(normalizeQuestion) });
  }));
  app.post('/api/apply/:token', limiter(10, 600_000), wrap(async (req, res) => {
    const c = claimsOf(req.params.token);
    const a = await service.submit({ guildId: c.g, typeKey: c.k, user: { id: c.u, name: c.n, avatar: c.a ?? null }, answers: req.body?.answers ?? {}, source: 'WEB', durationSec: Math.min(604_800, Math.round((Date.now() - c.t) / 1000)), joinedAt: c.j ?? null });
    const t = service.type(c.g, c.k);
    res.status(201).json({ number: a.number, message: renderText(t.messages.completion, { '{number}': a.number, '{applicationName}': t.name }) });
  }));

  app.use((req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));
  return app;
}

/** Link für die Bewerbungsart „Browser“ (vom Bot nach den Vorabprüfungen ausgestellt). */
export function createApplyLink({ secret, publicUrl }) {
  const signer = createSigner(secret, 'apply');
  return ({ guildId, type, user, joinedAt }) => {
    const now = Date.now(), e = now + type.timeLimitMinutes * 60_000;
    const token = signer.encode({ g: guildId, k: type.key, u: user.id, n: user.name, a: user.avatar ?? undefined, j: joinedAt ?? undefined, t: now, e });
    return { url: `${publicUrl}/bewerbung/${token}`, expiresAt: new Date(e).toISOString(), timeLimit: formatMinutes(type.timeLimitMinutes) };
  };
}
