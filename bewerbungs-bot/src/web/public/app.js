import { aiCheck, AI_LEVEL_LABEL, AI_HINT } from '/lib/ai-check.js';
import { QUESTION_TYPES, VARIABLES, DEFAULT_MESSAGES, freeKey, isInputQuestion, possessive } from '/lib/forms.js';

// ---------------- Hilfen ----------------
/** Element bauen: h('div', { class: 'x', onclick }, 'Text', kind, …) */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const $app = document.getElementById('app');
const STATUS = { OPEN: 'Offen', REVIEW: 'In Prüfung', INTERVIEW: 'Gespräch', ACCEPTED: 'Angenommen', REJECTED: 'Abgelehnt', WITHDRAWN: 'Zurückgezogen' };
const OPEN = ['OPEN', 'REVIEW', 'INTERVIEW'];
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '—');
const dur = (s) => (s == null ? '' : s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);
const mins = (m) => (m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} Tage`);
const avatar = (url, name, cls = 'avatar') => (url ? h('img', { class: cls, src: url, alt: '' }) : h('span', { class: cls }, (name ?? '?').slice(0, 1).toUpperCase()));
const badge = (status) => h('span', { class: `badge b-${status}` }, STATUS[status] ?? status);

class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: { 'x-requested-with': 'bewerbungs-bot', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Fehler ${res.status}`);
  return data;
}
function toast(text, kind = 'success') {
  const el = h('div', { class: kind, role: 'status' }, text);
  el.classList.add('toast');
  Object.assign(el.style, { position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 50, maxWidth: '420px', boxShadow: '0 4px 16px rgba(0,0,0,.2)' });
  document.body.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3500);
}
const errBox = (e) => h('div', { class: 'error' }, e instanceof Error ? e.message : String(e));

// ---------------- Zustand & Routing ----------------
const state = { me: null, guilds: [], meta: null, gid: null };
const go = (hash) => { location.hash = hash; };
window.addEventListener('hashchange', () => render());

async function boot() {
  try {
    const me = await api('/api/me');
    state.me = me.user; state.guilds = me.guilds ?? []; state.demo = me.demo;
  } catch (e) { $app.replaceChildren(h('main', {}, errBox(e))); return; }
  render();
}

async function render() {
  if (!state.me) return renderLogin();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] !== 'g' || !parts[1]) return renderGuilds();
  const gid = parts[1];
  if (state.gid !== gid || !state.meta) {
    state.gid = gid; state.meta = null;
    try { state.meta = await api(`/api/g/${gid}/meta`); } catch (e) { return shell(null, h('div', { class: 'stack' }, errBox(e), h('a', { href: '#/' }, '← Server-Auswahl'))); }
  }
  const page = parts[2] ?? 'applications';
  const view = { applications: parts[3] ? () => pageDetail(parts[3]) : pageApplications, progress: pageProgress, bans: pageBans, stats: pageStats, setup: pageSetup }[page] ?? pageApplications;
  shell(page, h('p', { class: 'loading' }, 'Lädt …'));
  try { const el = await view(); if (el) main.replaceChildren(el); } catch (e) { main.replaceChildren(errBox(e)); }
}

let main;
function shell(active, content) {
  const g = state.meta;
  const link = (key, label) => h('a', { href: `#/g/${state.gid}/${key}`, class: active === key ? 'active' : '' }, label);
  main = h('main', {}, content);
  $app.replaceChildren(
    h('header', { class: 'top' }, h('div', { class: 'top-inner' },
      h('a', { class: 'brand', href: '#/' }, '📋', g ? g.name : 'Bewerbungen'),
      g ? h('nav', { class: 'tabs' }, link('applications', 'Bewerbungen'), link('progress', 'In Bearbeitung'), link('bans', 'Sperren'), link('stats', 'Statistik'), g.level === 'admin' && link('setup', 'Einrichtung')) : h('span', { class: 'grow' }),
      h('div', { class: 'user' }, avatar(state.me.avatar, state.me.name), h('span', { class: 'small' }, state.me.name), state.demo ? h('span', { class: 'badge b-REVIEW' }, 'Demo') : h('button', { class: 'ghost small', onclick: async () => { await api('/api/logout', { method: 'POST', body: {} }); location.href = '/'; } }, 'Abmelden')))),
    main,
  );
}

function renderLogin() {
  $app.replaceChildren(h('main', {}, h('div', { class: 'card login stack' },
    h('div', { class: 'brand' }, h('span', {}, '📋'), 'Bewerbungs-Dashboard'),
    h('p', { class: 'muted' }, 'Melde dich mit Discord an. Du siehst die Server, auf denen du „Server verwalten“ oder eine Prüfer-/Admin-Rolle des Bewerbungssystems hast.'),
    h('a', { class: 'btn primary', href: '/login' }, 'Mit Discord anmelden'))));
}

function renderGuilds() {
  state.gid = null; state.meta = null;
  const list = state.guilds;
  if (list.length === 1 && !location.hash.includes('all')) return go(`#/g/${list[0].id}`);
  shell(null, h('div', { class: 'stack' }, h('h1', {}, 'Server auswählen'),
    list.length ? h('div', { class: 'grid2' }, list.map((g) => h('a', { class: 'card row', href: `#/g/${g.id}` }, avatar(g.icon, g.name, 'avatar lg'), h('div', {}, h('strong', {}, g.name), h('p', { class: 'muted small' }, g.level === 'admin' ? 'Admin' : 'Prüfer')))))
      : h('div', { class: 'card' }, h('p', {}, 'Kein Server gefunden.'), h('p', { class: 'muted small' }, 'Der Bot muss auf dem Server sein, und du brauchst dort „Server verwalten“ oder eine Prüfer-/Admin-Rolle (Einrichtung → Zugriff).'))));
}

// ---------------- Bewerbungen ----------------
const listState = { status: 'OPEN', type: '', q: '', order: 'newest', page: 1, open: new Set() };

async function pageApplications() {
  const g = state.meta;
  const wrap = h('div', { class: 'stack' });
  const q = new URLSearchParams({ status: listState.status, ...(listState.type ? { type: listState.type } : {}), ...(listState.q ? { q: listState.q } : {}), order: listState.order, page: String(listState.page) });
  const data = await api(`/api/g/${state.gid}/applications?${q}`);
  const reload = () => render();
  const seg = h('div', { class: 'seg' }, ['OPEN', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'ALL'].map((s) => h('button', { class: listState.status === s ? 'active' : '', onclick: () => { listState.status = s; listState.page = 1; reload(); } },
    s === 'ALL' ? 'Alle' : STATUS[s], s !== 'ALL' && data.counts[s] ? h('span', { class: 'badge b-WITHDRAWN' }, data.counts[s]) : null)));
  const search = h('input', { type: 'search', class: 'grow search', placeholder: 'Suche: Name, Nummer, Discord-ID, Roblox …', value: listState.q });
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { listState.q = search.value.trim(); listState.page = 1; reload(); }, 350); });
  wrap.append(
    h('div', { class: 'row between' }, h('h1', {}, 'Bewerbungen'), g.level === 'admin' && h('a', { class: 'btn small', href: `/api/g/${state.gid}/applications.csv?${new URLSearchParams({ status: listState.status, ...(listState.type ? { type: listState.type } : {}) })}` }, '⬇ CSV-Export')),
    h('div', { class: 'card row' }, seg,
      h('select', { onchange: (e) => { listState.type = e.target.value; listState.page = 1; reload(); } }, h('option', { value: '' }, 'Alle Bewerbungsarten'), g.types.map((x) => h('option', { value: x.key, selected: listState.type === x.key }, x.name))),
      h('select', { onchange: (e) => { listState.order = e.target.value; reload(); } }, h('option', { value: 'newest', selected: listState.order === 'newest' }, 'Neueste zuerst'), h('option', { value: 'oldest', selected: listState.order === 'oldest' }, 'Älteste zuerst')),
      search),
  );
  if (!data.items.length) wrap.append(h('div', { class: 'card muted' }, 'Keine Bewerbungen gefunden.'));
  for (const a of data.items) wrap.append(appCard(a, reload));
  const pages = Math.ceil(data.total / data.pageSize);
  if (pages > 1) wrap.append(h('div', { class: 'pager' },
    h('button', { disabled: listState.page <= 1, onclick: () => { listState.page--; reload(); } }, '← Zurück'), h('span', { class: 'muted' }, `Seite ${listState.page} von ${pages} · ${data.total} Bewerbungen`),
    h('button', { disabled: listState.page >= pages, onclick: () => { listState.page++; reload(); } }, 'Weiter →')));
  setTimeout(() => search.value && search.focus(), 0);
  return wrap;
}

function aiOf(a) { return aiCheck(a.answers.map((x) => ({ question: x.question, answer: x.answer === '—' ? '' : x.answer })), a.durationSec); }
function aiBadge(r) { return h('span', { class: `badge ai-${r.level}`, title: `${AI_HINT}\n\n${r.reasons.join('\n')}` }, `🤖 KI ${AI_LEVEL_LABEL[r.level]} · ${r.score} %`); }
function answersView(a, ai) {
  return h('div', { class: 'answers' }, a.answers.map((x, i) => h('div', { class: `answer${ai.flagged.includes(i) ? ' flagged' : ''}` }, h('div', { class: 'q' }, `${i + 1}. ${x.question}`), h('div', { class: 'pre' }, x.answer))));
}

function appCard(a, reload) {
  const ai = aiOf(a);
  const isOpenNow = listState.open.has(a.id);
  const body = h('div', { class: 'stack' });
  const card = h('div', { class: 'card app-card' },
    h('div', { class: 'app-head', onclick: () => { if (listState.open.has(a.id)) listState.open.delete(a.id); else listState.open.add(a.id); card.replaceWith(appCard(a, reload)); } },
      avatar(a.avatar, a.userName),
      h('div', { class: 'meta' },
        h('div', { class: 'row' }, h('strong', {}, `${possessive(a.userName)} Bewerbung für „${a.typeName}“`), badge(a.status), ai.level !== 'LOW' && aiBadge(ai)),
        h('div', { class: 'muted small' }, `${a.number} · eingereicht ${fmt(a.createdAt)}${a.durationSec != null ? ` · ausgefüllt in ${dur(a.durationSec)}` : ''}${a.roblox ? ` · Roblox: ${a.roblox.name}` : ''}${a.decidedBy ? ` · entschieden von ${a.decidedBy.name}` : ''}`)),
      h('span', { class: 'muted' }, isOpenNow ? '▾' : '▸')),
    isOpenNow && body);
  if (isOpenNow) {
    body.append(answersView(a, ai));
    if (ai.level !== 'LOW') body.append(h('div', { class: 'warnbox small' }, h('strong', {}, `KI-Verdacht ${AI_LEVEL_LABEL[ai.level]}: `), ai.reasons.join(' · '), h('div', {}, AI_HINT)));
    if (a.reason) body.append(h('p', { class: 'small' }, h('strong', {}, 'Grund: '), a.reason));
    body.append(actions(a, reload));
  }
  return card;
}

function actions(a, reload, { detail = false } = {}) {
  const row = h('div', { class: 'row' });
  const run = async (fn, okText) => { try { await fn(); toast(okText); reload(); } catch (e) { toast(e.message, 'error'); } };
  if (OPEN.includes(a.status) && a.canDecide) {
    row.append(
      h('button', { class: 'ok', onclick: () => decideDialog(a, 'ACCEPTED', reload) }, '✓ Annehmen'),
      h('button', { class: 'bad', onclick: () => decideDialog(a, 'REJECTED', reload) }, '✕ Ablehnen'),
      a.status !== 'REVIEW' && h('button', { onclick: () => run(() => api(`/api/g/${state.gid}/applications/${a.id}/status`, { method: 'POST', body: { status: 'REVIEW' } }), 'Status: In Prüfung') }, 'In Prüfung'),
      a.status !== 'INTERVIEW' && h('button', { onclick: () => run(() => api(`/api/g/${state.gid}/applications/${a.id}/status`, { method: 'POST', body: { status: 'INTERVIEW' } }), 'Status: Gespräch') }, 'Gespräch'),
      h('button', { onclick: () => { if (confirm('Bewerbung als zurückgezogen markieren?')) run(() => api(`/api/g/${state.gid}/applications/${a.id}/status`, { method: 'POST', body: { status: 'WITHDRAWN' } }), 'Zurückgezogen'); } }, 'Zurückziehen'),
    );
  }
  row.append(h('button', { onclick: () => run(async () => { const t = await api(`/api/g/${state.gid}/applications/${a.id}/ticket`, { method: 'POST', body: {} }); toast(t.existing ? 'Ticket existiert bereits.' : 'Ticket in Discord geöffnet.'); }, 'Ticket') }, '🎫 Ticket'));
  if (!detail) row.append(h('a', { class: 'btn', href: `#/g/${state.gid}/applications/${a.id}` }, 'Details →'));
  if (detail && state.meta.level === 'admin') row.append(h('button', { class: 'ghost', onclick: () => { if (confirm(`Bewerbung ${a.number} endgültig löschen?`)) api(`/api/g/${state.gid}/applications/${a.id}`, { method: 'DELETE' }).then(() => { toast('Gelöscht.'); go(`#/g/${state.gid}/applications`); }, (e) => toast(e.message, 'error')); } }, '🗑 Löschen'));
  return row;
}

function decideDialog(a, status, reload) {
  const accept = status === 'ACCEPTED';
  const reason = h('textarea', { placeholder: accept ? 'optional, z. B. „Willkommen im Team!“' : 'z. B. „Mindestalter nicht erreicht“', maxlength: 1000 });
  const notify = h('input', { type: 'checkbox', checked: true });
  const err = h('div');
  const btn = h('button', { class: accept ? 'ok' : 'bad' }, accept ? 'Annehmen' : 'Ablehnen');
  const dlg = h('dialog', {}, h('form', { method: 'dialog', class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; err.replaceChildren();
    try {
      const r = await api(`/api/g/${state.gid}/applications/${a.id}/decide`, { method: 'POST', body: { status, reason: reason.value.trim() || undefined, notifyReason: notify.checked } });
      dlg.close(); dlg.remove();
      toast(`${a.number} ${accept ? 'angenommen' : 'abgelehnt'}.${r.dm ? ' DM zugestellt.' : ' ⚠ DM konnte nicht zugestellt werden.'}${r.roles && r.roles !== 'ok' ? ` ⚠ Rollen: ${r.roles}` : ''}`, r.dm ? 'success' : 'warnbox');
      reload();
    } catch (ex) { err.replaceChildren(errBox(ex)); btn.disabled = false; }
  } },
    h('h2', {}, `${a.number} ${accept ? 'annehmen' : 'ablehnen'}`),
    h('p', { class: 'muted small' }, `${a.userName} · ${a.typeName}. Die Person bekommt eine Direktnachricht; Rollen werden laut Einstellungen vergeben/entfernt.`),
    h('label', { class: 'field' }, h('span', {}, 'Grund'), reason),
    h('label', { class: 'check small' }, notify, 'Grund per Direktnachricht an die Person schicken (sonst nur intern)'),
    err,
    h('div', { class: 'row' }, btn, h('button', { type: 'button', onclick: () => { dlg.close(); dlg.remove(); } }, 'Abbrechen'))));
  document.body.append(dlg);
  dlg.showModal();
  reason.focus();
}

async function pageDetail(id) {
  const a = await api(`/api/g/${state.gid}/applications/${id}`);
  const ai = aiOf(a);
  const reload = () => render();
  const note = h('textarea', { placeholder: 'Interne Notiz fürs Team …', maxlength: 1000 });
  return h('div', { class: 'stack' },
    h('a', { href: `#/g/${state.gid}/applications` }, '← Alle Bewerbungen'),
    h('div', { class: 'card row' }, avatar(a.avatar, a.userName, 'avatar lg'),
      h('div', { class: 'grow' }, h('div', { class: 'row' }, h('h1', {}, `${a.userName} · ${a.typeName}`), badge(a.status), aiBadge(ai)),
        h('div', { class: 'muted small' }, `${a.number} · Discord-ID `, h('span', { class: 'mono' }, a.userId), a.roblox ? ` · Roblox: ${a.roblox.name}${a.roblox.id ? ` (${a.roblox.id})` : ''}` : '', ` · ${a.source === 'WEB' ? 'Browser-Formular' : 'Direktnachricht'}`)),
      ),
    h('div', { class: 'grid3' },
      info('Eingereicht', fmt(a.createdAt)), info('Ausgefüllt in', dur(a.durationSec) || '—'), info('Server beigetreten', fmtDate(a.joinedAt)),
      info('Entschieden', a.decidedAt ? `${fmt(a.decidedAt)} von ${a.decidedBy?.name ?? '—'}` : '—'),
      a.reason && info(a.reasonSent ? 'Grund (an Person gesendet)' : 'Grund (intern)', a.reason)),
    h('div', { class: 'card stack' }, h('h2', {}, 'Antworten'), answersView(a, ai),
      ai.level !== 'LOW' ? h('div', { class: 'warnbox small' }, h('strong', {}, `KI-Verdacht ${AI_LEVEL_LABEL[ai.level]} (${ai.score} %): `), h('ul', {}, ai.reasons.map((r) => h('li', {}, r))), AI_HINT) : h('p', { class: 'muted small' }, `KI-Check: ${AI_LEVEL_LABEL[ai.level]} (${ai.score} %)`),
      actions(a, reload, { detail: true })),
    h('div', { class: 'grid2' },
      h('div', { class: 'card stack' }, h('h2', {}, 'Notizen (intern)'),
        a.notes.length ? h('ul', { class: 'timeline' }, a.notes.map((n) => h('li', {}, h('div', { class: 'small muted' }, `${n.by?.name ?? '—'} · ${fmt(n.at)}`), h('div', { class: 'pre' }, n.text)))) : h('p', { class: 'muted small' }, 'Noch keine Notizen.'),
        note, h('div', {}, h('button', { onclick: async () => { try { await api(`/api/g/${state.gid}/applications/${a.id}/notes`, { method: 'POST', body: { text: note.value } }); reload(); } catch (e) { toast(e.message, 'error'); } } }, 'Notiz speichern'))),
      h('div', { class: 'card stack' }, h('h2', {}, 'Verlauf'),
        h('ul', { class: 'timeline' }, a.history.map((x) => h('li', {}, h('div', {}, badge(x.status), ' ', h('span', { class: 'small muted' }, `${fmt(x.at)}${x.by ? ` · ${x.by.name}` : ''}`)), x.note && h('div', { class: 'small pre' }, x.note)))),
        h('h3', {}, 'Frühere Bewerbungen dieser Person'),
        previous(a))),
  );
}
function previous(a) {
  const list = a.previous ?? [];
  return list.length ? h('ul', { class: 'timeline' }, list.map((x) => h('li', {}, h('a', { href: `#/g/${state.gid}/applications/${x.id}` }, x.number), ` · ${x.typeName} · `, badge(x.status), h('span', { class: 'small muted' }, ` ${fmtDate(x.createdAt)}`)))) : h('p', { class: 'muted small' }, 'Keine.');
}
const info = (label, value) => h('div', { class: 'card' }, h('div', { class: 'muted small' }, label), h('div', { class: 'pre' }, value));

// ---------------- In Bearbeitung ----------------
async function pageProgress() {
  const rows = await api(`/api/g/${state.gid}/progress`);
  return h('div', { class: 'stack' }, h('h1', {}, 'In Bearbeitung'), h('p', { class: 'muted' }, 'Angefangene, noch nicht abgeschickte Bewerbungen (Fragen per Direktnachricht oder Link zum Browser-Formular).'),
    rows.length ? h('div', { class: 'card' }, h('table', {}, h('thead', {}, h('tr', {}, ['Person', 'Bewerbung', 'Art', 'Fortschritt', 'Gestartet', 'Läuft ab'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((p) => h('tr', {}, h('td', {}, p.userName, h('div', { class: 'mono muted' }, p.userId)), h('td', {}, p.typeName), h('td', {}, p.source === 'WEB' ? 'Browser' : 'DM'),
        h('td', {}, p.answered != null ? `${p.answered}/${p.total}` : '—'), h('td', {}, fmt(p.startedAt)), h('td', {}, fmt(p.expiresAt)))))))
      : h('div', { class: 'card muted' }, 'Gerade füllt niemand eine Bewerbung aus.'));
}

// ---------------- Sperren ----------------
let showAllBans = false;
async function pageBans() {
  const rows = await api(`/api/g/${state.gid}/bans${showAllBans ? '?all=1' : ''}`);
  const types = state.meta.types;
  const typeName = (k) => (k === '*' ? 'Alle' : types.find((t) => t.key === k)?.name ?? k);
  const f = { discord: h('input', { placeholder: 'z. B. 123456789012345678', inputmode: 'numeric' }), roblox: h('input', { placeholder: 'Name oder ID (optional)' }), name: h('input', { placeholder: 'optional' }), reason: h('textarea', { placeholder: 'sieht die Person beim Bewerben' }), until: h('input', { type: 'date' }) };
  const all = h('input', { type: 'checkbox', checked: true });
  const checks = types.map((t) => ({ key: t.key, el: h('input', { type: 'checkbox' }) }));
  const err = h('div');
  const form = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault(); err.replaceChildren();
    try {
      await api(`/api/g/${state.gid}/bans`, { method: 'POST', body: { userId: f.discord.value.trim() || null, roblox: f.roblox.value.trim() || null, name: f.name.value.trim() || null, reason: f.reason.value, types: all.checked ? ['*'] : checks.filter((c) => c.el.checked).map((c) => c.key), expiresAt: f.until.value ? new Date(`${f.until.value}T23:59:59`).toISOString() : null } });
      toast('Sperre angelegt.'); render();
    } catch (ex) { err.replaceChildren(errBox(ex)); }
  } },
    h('h2', {}, 'Neue Sperre'),
    h('div', { class: 'grid3' }, h('label', { class: 'field' }, h('span', {}, 'Discord-ID'), f.discord), h('label', { class: 'field' }, h('span', {}, 'Roblox'), f.roblox), h('label', { class: 'field' }, h('span', {}, 'Name (Anzeige)'), f.name), h('label', { class: 'field' }, h('span', {}, 'Gilt bis (leer = dauerhaft)'), f.until)),
    h('div', { class: 'row' }, h('label', { class: 'check' }, all, h('strong', {}, 'Alle Bewerbungen')), checks.map((c) => h('label', { class: 'check' }, c.el, typeName(c.key)))),
    h('label', { class: 'field' }, h('span', {}, 'Grund'), f.reason), err, h('div', {}, h('button', { class: 'primary' }, 'Sperren')));
  const active = (b) => !b.liftedAt && (!b.expiresAt || Date.parse(b.expiresAt) > Date.now());
  return h('div', { class: 'stack' }, h('h1', {}, 'Bewerbungssperren'),
    h('p', { class: 'muted' }, 'Gesperrte Personen können die betroffenen Bewerbungen nicht starten und werden beim Absenden abgewiesen (erkannt per Discord-ID oder Roblox-ID). Auch per Befehl: /bewerbungssperre'),
    form,
    h('div', { class: 'card stack' }, h('div', { class: 'row between' }, h('h2', {}, showAllBans ? 'Alle Sperren' : 'Aktive Sperren'), h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: showAllBans, onchange: (e) => { showAllBans = e.target.checked; render(); } }), 'auch aufgehobene/abgelaufene')),
      rows.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Person', 'Bewerbungen', 'Grund', 'Bis', 'Angelegt', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((b) => h('tr', {}, h('td', {}, h('strong', {}, b.name), b.userId && h('div', { class: 'mono muted' }, `Discord ${b.userId}`), b.robloxId && h('div', { class: 'mono muted' }, `Roblox ${b.robloxId}`)),
          h('td', {}, b.types.map(typeName).join(', ')), h('td', { class: 'pre' }, b.reason), h('td', {}, b.expiresAt ? fmtDate(b.expiresAt) : 'dauerhaft'),
          h('td', { class: 'small' }, `${fmtDate(b.createdAt)} · ${b.createdBy?.name ?? ''}`),
          h('td', {}, active(b) ? h('button', { class: 'small', onclick: async () => { if (!confirm('Sperre aufheben?')) return; try { await api(`/api/g/${state.gid}/bans/${b.id}/lift`, { method: 'POST', body: {} }); toast('Aufgehoben.'); render(); } catch (e) { toast(e.message, 'error'); } } }, 'Aufheben') : h('span', { class: 'muted small' }, b.liftedAt ? 'aufgehoben' : 'abgelaufen'))))))
        : h('p', { class: 'muted' }, 'Keine Sperren.')));
}

// ---------------- Statistik ----------------
const statState = { days: 30, type: '', status: '', reviewer: '' };
async function pageStats() {
  const q = new URLSearchParams(Object.fromEntries(Object.entries(statState).filter(([, v]) => v)));
  const s = await api(`/api/g/${state.gid}/analytics?${q}`);
  const set = (k) => (e) => { statState[k] = e.target.value; render(); };
  const K = { total: ['Bewerbungen', (v) => v], approvalRate: ['Annahmequote', (v) => `${v.toFixed(0)} %`], avgReviewMin: ['⌀ Bearbeitungszeit', (v) => (v ? mins(v) : '—')], pending: ['Offen', (v) => v], completionRate: ['Entschieden', (v) => `${v.toFixed(0)} %`] };
  const max = Math.max(1, ...s.overTime.map((d) => d.count));
  const heatMax = Math.max(1, ...s.heat.flat());
  const bar = (pct) => { const d = h('div'); d.style.width = `${Math.min(100, pct)}%`; return h('div', { class: 'hbar' }, d); };
  const bars = h('div', { class: 'bars' }, s.overTime.map((d) => { const b = h('div', { class: 'bar', title: `${d.date}: ${d.count} (7-Tage-Schnitt ${d.avg7.toFixed(1)})` }); b.style.height = `${(d.count / max) * 100}%`; return b; }));
  const total = s.breakdown.APPROVED + s.breakdown.PENDING + s.breakdown.REJECTED;
  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  return h('div', { class: 'stack' },
    h('div', { class: 'row between' }, h('h1', {}, 'Statistik'), h('div', { class: 'row' },
      h('select', { onchange: set('days') }, [7, 30, 90, 180, 365].map((d) => h('option', { value: d, selected: statState.days == d }, `Letzte ${d} Tage`))),
      h('select', { onchange: set('type') }, h('option', { value: '' }, 'Alle Arten'), s.filters.types.map((t) => h('option', { value: t, selected: statState.type === t }, t))),
      h('select', { onchange: set('status') }, [['', 'Alle Status'], ['APPROVED', 'Angenommen'], ['PENDING', 'Offen'], ['REJECTED', 'Abgelehnt']].map(([v, l]) => h('option', { value: v, selected: statState.status === v }, l))),
      h('select', { onchange: set('reviewer') }, h('option', { value: '' }, 'Alle Prüfer'), s.filters.reviewers.map((r) => h('option', { value: r.id, selected: statState.reviewer === r.id }, r.name))))),
    h('div', { class: 'grid3' }, s.kpis.map((k) => h('div', { class: 'card kpi' }, h('div', { class: 'muted small' }, K[k.key][0]), h('div', { class: 'v' }, K[k.key][1](k.value)),
      h('div', { class: `small ${k.change > 0 ? 'up' : k.change < 0 ? 'down' : 'muted'}` }, `${k.change > 0 ? '▲' : k.change < 0 ? '▼' : '•'} ${Math.abs(k.change).toFixed(0)} % zur Vorperiode`)))),
    h('div', { class: 'card stack' }, h('h2', {}, 'Einreichungen pro Tag'), bars, h('div', { class: 'row between small muted' }, h('span', {}, s.overTime[0]?.date), h('span', {}, s.overTime.at(-1)?.date))),
    h('div', { class: 'grid2' },
      h('div', { class: 'card stack' }, h('h2', {}, 'Aufteilung'),
        [['APPROVED', 'Angenommen'], ['PENDING', 'Offen'], ['REJECTED', 'Abgelehnt']].map(([k, l]) => h('div', {}, h('div', { class: 'row between small' }, h('span', {}, l), h('span', {}, `${s.breakdown[k]} (${total ? Math.round((s.breakdown[k] / total) * 100) : 0} %)`)), bar(total ? (s.breakdown[k] / total) * 100 : 0)))),
      h('div', { class: 'card stack' }, h('h2', {}, 'Je Bewerbungsart'),
        s.byType.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Art', 'Anzahl', 'Annahme', '⌀ Zeit'].map((x) => h('th', {}, x)))), h('tbody', {}, s.byType.map((t) => h('tr', {}, h('td', {}, t.type), h('td', {}, t.submitted), h('td', {}, `${t.approvalRate.toFixed(0)} %`), h('td', {}, t.avgReviewMin ? mins(t.avgReviewMin) : '—'))))) : h('p', { class: 'muted' }, 'Keine Daten.')),
      h('div', { class: 'card stack' }, h('h2', {}, 'Top-Prüfer'),
        s.reviewers.length ? h('table', {}, h('thead', {}, h('tr', {}, ['Prüfer', 'Entschieden', 'Annahme', '⌀ Zeit'].map((x) => h('th', {}, x)))), h('tbody', {}, s.reviewers.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, r.reviewed), h('td', {}, `${r.approvalRate.toFixed(0)} %`), h('td', {}, r.avgReviewMin ? mins(r.avgReviewMin) : '—'))))) : h('p', { class: 'muted' }, 'Noch keine Entscheidungen.')),
      h('div', { class: 'card stack' }, h('h2', {}, 'Wann wird sich beworben?'),
        h('div', { class: 'heat' }, h('span'), Array.from({ length: 24 }, (_, i) => h('span', { class: 'lbl' }, i % 3 === 0 ? i : '')),
          s.heat.map((r, d) => [h('span', { class: 'lbl' }, WD[d]), r.map((n, hr) => { const c = h('span', { class: 'cell', title: `${WD[d]} ${hr}:00 – ${n}` }); c.style.opacity = String(n ? 0.15 + (n / heatMax) * 0.85 : 0.06); return c; })])))),
  );
}

// ---------------- Einrichtung ----------------
async function pageSetup() {
  const cfg = await api(`/api/g/${state.gid}/config`);
  const meta = state.meta;
  const wrap = h('div', { class: 'card stack' });
  const msg = h('div');
  const dirty = { v: false };
  const changed = () => { dirty.v = true; };
  const roleName = (id) => meta.roles.find((r) => r.id === id)?.name ?? `Rolle ${id}`;

  // --- Bausteine ---
  const channelSelect = (value, onChange) => h('select', { onchange: (e) => { onChange(e.target.value); changed(); } }, h('option', { value: '' }, '— kein Kanal —'),
    meta.channels.map((c) => h('option', { value: c.id, selected: c.id === value }, `#${c.name}${c.parent ? ` (${c.parent})` : ''}${c.botCanSend ? '' : ' ⚠ Bot kann hier nicht schreiben'}`)));
  const roleSelect = (value, onChange, empty = '— keine Rolle —') => h('select', { onchange: (e) => { onChange(e.target.value); changed(); } }, h('option', { value: '' }, empty), meta.roles.map((r) => h('option', { value: r.id, selected: r.id === value }, `@${r.name}${r.managed ? ' (Bot)' : ''}`)));
  function rolePicker(list, { assign = false } = {}) {
    const box = h('div', { class: 'stack' });
    const draw = () => {
      box.replaceChildren(
        h('div', { class: 'row' }, list.length ? list.map((id, i) => h('span', { class: 'chip' }, `@${roleName(id)}`, assign && meta.roles.find((r) => r.id === id)?.assignable === false ? ' ⚠' : '', h('button', { type: 'button', title: 'Entfernen', onclick: () => { list.splice(i, 1); changed(); draw(); } }, '×'))) : h('span', { class: 'muted small' }, 'keine')),
        h('select', { onchange: (e) => { if (e.target.value && !list.includes(e.target.value)) { list.push(e.target.value); changed(); } draw(); } }, h('option', { value: '' }, '+ Rolle hinzufügen …'),
          meta.roles.filter((r) => !list.includes(r.id)).map((r) => h('option', { value: r.id }, `@${r.name}${assign && !r.assignable ? ' (Bot kann sie nicht vergeben)' : ''}`))));
    };
    draw();
    return box;
  }
  const field = (label, el, hint) => h('label', { class: 'field' }, h('span', {}, label), el, hint && h('span', { class: 'hint' }, hint));
  const box = (label, el, hint) => h('div', { class: 'field' }, h('span', {}, label), el, hint && h('span', { class: 'hint' }, hint));
  const text = (obj, key, attrs = {}) => h('input', { value: obj[key] ?? '', ...attrs, oninput: (e) => { obj[key] = e.target.value; changed(); } });
  const area = (obj, key, attrs = {}) => h('textarea', { ...attrs, oninput: (e) => { obj[key] = e.target.value; changed(); } }, obj[key] ?? '');
  const num = (obj, key, attrs = {}) => h('input', { type: 'number', value: obj[key] ?? 0, ...attrs, oninput: (e) => { obj[key] = Number(e.target.value); changed(); } });
  const check = (obj, key, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!obj[key], onchange: (e) => { obj[key] = e.target.checked; changed(); } }), label);
  function duration(obj, key, label, hint) {
    const v = obj[key] ?? 0;
    const d = h('input', { type: 'number', min: 0, value: Math.floor(v / 1440) }), hr = h('input', { type: 'number', min: 0, max: 23, value: Math.floor((v % 1440) / 60) }), m = h('input', { type: 'number', min: 0, max: 59, value: v % 60 });
    const upd = () => { obj[key] = (Number(d.value) || 0) * 1440 + (Number(hr.value) || 0) * 60 + (Number(m.value) || 0); changed(); };
    [d, hr, m].forEach((x) => x.addEventListener('input', upd));
    return box(label, h('div', { class: 'row' }, field('Tage', d), field('Stunden', hr), field('Minuten', m)), hint);
  }
  function matchRule(rule, label, hint) {
    const mode = h('select', { onchange: (e) => { rule.mode = e.target.value; changed(); } }, h('option', { value: 'ANY', selected: rule.mode !== 'ALL' }, 'mindestens eine davon'), h('option', { value: 'ALL', selected: rule.mode === 'ALL' }, 'alle davon'));
    return box(label, h('div', { class: 'stack' }, mode, rolePicker(rule.ids)), hint);
  }

  // --- Zugriff & Tickets ---
  const access = h('section', { class: 'setup-section' }, h('h2', {}, 'Zugriff & Tickets'),
    h('div', { class: 'grid2' },
      box('Admin-Rollen', rolePicker(cfg.access.adminRoles), 'Alles inkl. Einrichtung (wer „Server verwalten“ hat, ist immer Admin).'),
      box('Prüfer-Rollen', rolePicker(cfg.access.reviewerRoles), 'Bewerbungen sehen und entscheiden, Sperren verwalten.'),
      field('Kategorie für Tickets', h('select', { onchange: (e) => { cfg.tickets.categoryId = e.target.value; changed(); } }, h('option', { value: '' }, '— keine Kategorie —'), meta.categories.map((c) => h('option', { value: c.id, selected: c.id === cfg.tickets.categoryId }, c.name))), '„Ticket mit Bewerber öffnen“ legt hier einen privaten Kanal an.'),
      field('Team-Rolle im Ticket', roleSelect(cfg.tickets.staffRoleId, (v) => { cfg.tickets.staffRoleId = v; }), 'Sieht alle Bewerbungs-Tickets.')),
    !meta.botCanManageRoles && h('div', { class: 'warnbox small' }, 'Dem Bot fehlt das Recht „Rollen verwalten“ – Rollen können nicht vergeben werden.'));

  // --- Panels ---
  const panelsBox = h('div', { class: 'stack' });
  const drawPanels = () => {
    panelsBox.replaceChildren(...cfg.panels.map((p, i) => h('div', { class: 'q-item' },
      h('div', { class: 'row between' }, h('strong', {}, p.title || 'Panel'), h('div', { class: 'row' },
        p.message ? h('span', { class: 'badge b-ACCEPTED' }, 'gesendet') : h('span', { class: 'badge b-WITHDRAWN' }, 'nicht gesendet'),
        h('button', { type: 'button', class: 'small', onclick: () => sendPanel(p, 'update') }, p.message ? 'Aktualisieren' : 'Senden'),
        p.message && h('button', { type: 'button', class: 'small', onclick: () => sendPanel(p, 'new') }, 'Neu senden'),
        h('button', { type: 'button', class: 'small ghost', onclick: () => { if (confirm('Panel entfernen? (Die Nachricht in Discord bleibt stehen.)')) { cfg.panels.splice(i, 1); changed(); drawPanels(); } } }, '🗑'))),
      h('div', { class: 'grid2' }, field('Titel', text(p, 'title', { maxlength: 256 })), field('Kanal', channelSelect(p.channelId, (v) => { p.channelId = v; })), field('Farbe', h('input', { type: 'color', value: p.color, oninput: (e) => { p.color = e.target.value; changed(); } }))),
      field('Beschreibung', area(p, 'description', { maxlength: 3500, rows: 4 }), 'Markdown wie in Discord. Bei mehreren Arten wird die Beschreibung jeder Art angehängt.'),
      box('Bewerbungsarten im Panel', h('div', { class: 'row' }, cfg.types.map((t) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: p.types.includes(t.key), onchange: (e) => { p.types = e.target.checked ? [...p.types, t.key] : p.types.filter((k) => k !== t.key); changed(); } }), t.name))), 'Eine Art → Button „Jetzt bewerben“, mehrere → Auswahlmenü.'))),
      h('div', {}, h('button', { type: 'button', onclick: () => { cfg.panels.push({ id: crypto.randomUUID(), title: '📋 Bewerbungen', description: '', color: '#5865F2', channelId: '', types: cfg.types.slice(0, 1).map((t) => t.key), message: null }); changed(); drawPanels(); } }, '+ Panel')));
  };
  async function sendPanel(p, mode) {
    if (dirty.v && !(await save())) return;
    try { await api(`/api/g/${state.gid}/panels/${p.id}/send`, { method: 'POST', body: { mode } }); toast('Panel gesendet.'); render(); } catch (e) { toast(e.message, 'error'); }
  }
  drawPanels();

  // --- Bewerbungsarten ---
  const typesBox = h('div', { class: 'stack' });
  const drawTypes = (openKey) => typesBox.replaceChildren(...cfg.types.map((t, i) => typeEditor(t, i, openKey === i)),
    h('div', {}, h('button', { type: 'button', onclick: () => {
      const used = new Set(cfg.types.map((x) => x.key)); let n = 1; while (used.has(`art${n}`)) n++;
      cfg.types.push({ key: `art${n}`, name: 'Neue Bewerbung', description: '', emoji: '📋', enabled: false, mode: 'DM', questions: [{ key: 'frage1', label: 'Warum möchtest du dich bewerben?', required: true, type: 'TEXT', minLength: 0, maxLength: 1000, options: [], multiple: false }],
        channels: { pending: '', accepted: '', denied: '' }, pingRoles: [], messages: { ...DEFAULT_MESSAGES }, roles: { restricted: { ids: [], mode: 'ANY' }, required: { ids: [], mode: 'ANY' }, accepted: [], denied: [], acceptedRemove: [], deniedRemove: [], pending: [], removeOnSubmit: [], managers: [] },
        staffThreads: false, cooldownMinutes: 0, timeLimitMinutes: 180, onLeave: 'NONE' });
      changed(); drawTypes(cfg.types.length - 1);
    } }, '+ Bewerbungsart')));

  function typeEditor(t, i, open) {
    const vars = h('div', { class: 'vars' }, Object.entries(VARIABLES).map(([k, v]) => h('code', { title: v }, k)));
    const message = (key, label, hint) => field(label, area(t.messages, key, { maxlength: 2000, rows: 3 }), hint);
    return h('details', { class: 'type-editor card', open },
      h('summary', {}, t.emoji || '📋', t.name, h('span', { class: `badge ${t.enabled ? 'b-ACCEPTED' : 'b-WITHDRAWN'}` }, t.enabled ? 'offen' : 'geschlossen'), h('span', { class: 'muted small mono' }, t.key)),
      h('div', { class: 'stack' },
        h('h3', {}, 'Allgemein'),
        h('div', { class: 'grid3' },
          field('Name', text(t, 'name', { maxlength: 60 }), '{applicationName}'), field('Schlüssel', text(t, 'key', { maxlength: 24, pattern: '[a-z0-9_-]{2,24}' }), 'a-z, 0-9, - _ (nach dem ersten Einsatz nicht mehr ändern)'), field('Emoji', text(t, 'emoji', { maxlength: 40 })),
          box('Status', check(t, 'enabled', 'Bewerbungen annehmen')),
          field('Art der Bewerbung', h('select', { onchange: (e) => { t.mode = e.target.value; changed(); } }, h('option', { value: 'DM', selected: t.mode === 'DM' }, 'Fragen per Direktnachricht'), h('option', { value: 'WEB', selected: t.mode === 'WEB' }, 'Formular im Browser (persönlicher Link)')))),
        field('Beschreibung (im Panel)', area(t, 'description', { maxlength: 600, rows: 2 })),
        h('h3', {}, 'Kanäle'),
        h('div', { class: 'grid3' },
          field('Offene Einsendungen', channelSelect(t.channels.pending, (v) => { t.channels.pending = v; }), 'Neue Bewerbungen mit Annehmen/Ablehnen-Buttons (nur fürs Team sichtbar).'),
          field('Angenommene', channelSelect(t.channels.accepted, (v) => { t.channels.accepted = v; }), 'Optional: Kopie entschiedener Bewerbungen.'),
          field('Abgelehnte', channelSelect(t.channels.denied, (v) => { t.channels.denied = v; }), 'Optional.'),
          box('Ping-Rollen', rolePicker(t.pingRoles), 'Werden bei neuen Bewerbungen erwähnt.'), box('Team-Threads', check(t, 'staffThreads', 'Thread je Einsendung erstellen'))),
        h('h3', {}, 'Fragen'),
        questionsEditor(t),
        h('h3', {}, 'Texte'), h('p', { class: 'hint' }, 'Variablen: '), vars,
        h('div', { class: 'grid2' },
          message('confirmation', 'Bestätigung (Start)', 'Erste DM mit „Bewerbung starten“.'), message('completion', 'Abschluss', 'Nach dem Absenden.'),
          message('accepted', 'Bei Annahme', 'DM an die Person. Ein Grund wird angehängt, wenn {reason} fehlt.'), message('denied', 'Bei Ablehnung', 'DM an die Person.')),
        h('h3', {}, 'Rollen'),
        h('div', { class: 'grid2' },
          matchRule(t.roles.required, 'Erforderliche Rollen', 'Ohne diese Rollen kann man sich nicht bewerben.'), matchRule(t.roles.restricted, 'Gesperrte Rollen', 'Mit diesen Rollen kann man sich nicht bewerben.'),
          box('Bei Annahme geben', rolePicker(t.roles.accepted, { assign: true })), box('Bei Annahme entfernen', rolePicker(t.roles.acceptedRemove, { assign: true })),
          box('Bei Ablehnung geben', rolePicker(t.roles.denied, { assign: true })), box('Bei Ablehnung entfernen', rolePicker(t.roles.deniedRemove, { assign: true })),
          box('„Ausstehend“ (beim Einreichen geben, bei Entscheidung nehmen)', rolePicker(t.roles.pending, { assign: true })), box('Beim Einreichen entfernen', rolePicker(t.roles.removeOnSubmit, { assign: true })),
          box('Manager-Rollen', rolePicker(t.roles.managers), 'Dürfen über diese Art entscheiden. Leer = alle Prüfer-Rollen.')),
        h('h3', {}, 'Sonstiges'),
        h('div', { class: 'grid2' },
          duration(t, 'cooldownMinutes', 'Wartezeit', 'Wie lange man nach einer Bewerbung warten muss.'), duration(t, 'timeLimitMinutes', 'Zeitlimit', 'Zeit zum Ausfüllen (5 Min. – 7 Tage).'),
          field('Aktion beim Verlassen des Servers', h('select', { onchange: (e) => { t.onLeave = e.target.value; changed(); } }, [['NONE', 'Nichts tun'], ['DENY', 'Automatisch ablehnen'], ['WITHDRAW', 'Als zurückgezogen markieren']].map(([v, l]) => h('option', { value: v, selected: t.onLeave === v }, l))), 'Braucht MEMBERS_INTENT=true.')),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'small', disabled: i === 0, onclick: () => { cfg.types.splice(i - 1, 0, cfg.types.splice(i, 1)[0]); changed(); drawTypes(i - 1); } }, '↑ nach oben'),
          h('button', { type: 'button', class: 'small', onclick: () => { const c = structuredClone(t); c.key = `${t.key}-kopie`.slice(0, 24); c.name = `${t.name} (Kopie)`.slice(0, 60); c.enabled = false; cfg.types.splice(i + 1, 0, c); changed(); drawTypes(i + 1); } }, 'Duplizieren'),
          h('button', { type: 'button', class: 'small bad', onclick: () => { if (cfg.types.length > 1 && confirm(`„${t.name}“ löschen? Bisherige Bewerbungen bleiben erhalten.`)) { cfg.types.splice(i, 1); cfg.panels.forEach((p) => { p.types = p.types.filter((k) => k !== t.key); }); changed(); drawTypes(); drawPanels(); } } }, 'Löschen'))));
  }

  function questionsEditor(t) {
    const box2 = h('div', { class: 'stack' });
    const draw = () => box2.replaceChildren(...t.questions.map((q, i) => {
      q.options ??= []; q.type ??= 'TEXT';
      const opts = h('div', { class: 'stack' });
      const drawOpts = () => opts.replaceChildren(...(isInputQuestion(q.type) ? [] : [
        ...q.options.map((o, j) => h('div', { class: 'row' }, h('input', { class: 'grow', value: o.label, maxlength: 100, placeholder: `Option ${j + 1}`, oninput: (e) => { o.label = e.target.value; changed(); } }),
          q.type === 'ROLE' && roleSelect(o.roleId ?? '', (v) => { o.roleId = v || undefined; }, '— Rolle wählen —'),
          h('button', { type: 'button', class: 'small ghost', onclick: () => { q.options.splice(j, 1); changed(); drawOpts(); } }, '×'))),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'small', disabled: q.options.length >= 25, onclick: () => { q.options.push({ label: '' }); changed(); drawOpts(); } }, '+ Option'), check(q, 'multiple', 'Mehrfachauswahl erlaubt')),
      ]));
      drawOpts();
      return h('div', { class: 'q-item' },
        h('div', { class: 'row' }, h('strong', {}, `${i + 1}.`), h('input', { class: 'grow', value: q.label, maxlength: 300, placeholder: 'Frage', oninput: (e) => { q.label = e.target.value; changed(); } }),
          h('select', { onchange: (e) => { q.type = e.target.value; changed(); draw(); } }, Object.entries(QUESTION_TYPES).map(([k, l]) => h('option', { value: k, selected: q.type === k }, l)))),
        h('div', { class: 'row' }, check(q, 'required', 'Pflichtfrage'),
          q.type === 'TEXT' && [h('label', { class: 'check small' }, 'min.', num(q, 'minLength', { min: 0, max: 4000, class: 'mono' })), h('label', { class: 'check small' }, 'max.', num(q, 'maxLength', { min: 1, max: 4000 })), h('span', { class: 'hint' }, 'Zeichen')],
          q.type === 'ROBLOX' && h('span', { class: 'hint' }, 'Name wird bei Roblox geprüft, die Person bestätigt ihr Konto.'),
          q.type === 'ROLE' && h('span', { class: 'hint' }, 'Gewählte Rollen werden bei Annahme vergeben.'),
          h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'small', disabled: i === 0, onclick: () => { t.questions.splice(i - 1, 0, t.questions.splice(i, 1)[0]); changed(); draw(); } }, '↑'),
          h('button', { type: 'button', class: 'small', disabled: i === t.questions.length - 1, onclick: () => { t.questions.splice(i + 1, 0, t.questions.splice(i, 1)[0]); changed(); draw(); } }, '↓'),
          h('button', { type: 'button', class: 'small ghost', disabled: t.questions.length <= 1, onclick: () => { t.questions.splice(i, 1); changed(); draw(); } }, '🗑')),
        opts);
    }), h('div', {}, h('button', { type: 'button', disabled: t.questions.length >= 50, onclick: () => { t.questions.push({ key: freeKey(t.questions.map((x) => x.key)), label: '', required: true, type: 'TEXT', minLength: 0, maxLength: 1000, options: [], multiple: false }); changed(); draw(); } }, '+ Frage')));
    draw();
    return box2;
  }
  drawTypes();

  async function save() {
    msg.replaceChildren();
    try {
      const r = await api(`/api/g/${state.gid}/config`, { method: 'PUT', body: cfg });
      Object.assign(cfg, r.config); dirty.v = false;
      state.meta = null; // Namen der Arten neu laden
      msg.replaceChildren(h('div', { class: 'success' }, 'Gespeichert.'), ...r.warnings.map((w) => h('div', { class: 'warnbox' }, w)));
      return true;
    } catch (e) { msg.replaceChildren(errBox(e)); return false; }
  }
  window.onbeforeunload = () => (dirty.v ? true : undefined);

  wrap.append(
    h('div', {}, h('h1', {}, 'Einrichtung'), h('p', { class: 'muted' }, 'Bewerbungsarten, Fragen, Texte, Rollen und Panels für diesen Server. Änderungen an gesendeten Panels werden beim Speichern in Discord übernommen.')),
    access, h('hr'), h('section', { class: 'setup-section' }, h('h2', {}, 'Bewerbungsarten'), typesBox), h('hr'), h('section', { class: 'setup-section' }, h('h2', {}, 'Panels'), panelsBox),
    h('div', { class: 'savebar' }, h('button', { class: 'primary', onclick: save }, 'Speichern'), msg));
  return wrap;
}

boot();
