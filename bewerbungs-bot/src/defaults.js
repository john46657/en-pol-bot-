import { randomUUID } from 'node:crypto';
import { DEFAULT_MESSAGES, normalizeQuestion, SNOWFLAKE, validateQuestions } from './forms.js';

export const ON_LEAVE = ['NONE', 'DENY', 'WITHDRAW'];
export const MODES = ['DM', 'WEB'];

/** Eine Bewerbungsart (z. B. „Team“, „Polizei“, „SEK“) mit allen Einstellungen. */
export function defaultType(over = {}) {
  return {
    key: 'team', name: 'Team-Bewerbung', description: 'Bewirb dich für unser Team!', emoji: '📋', enabled: true, mode: 'DM',
    questions: [
      { key: 'name', label: 'Wie heißt du und wie alt bist du?', required: true, type: 'TEXT', minLength: 0, maxLength: 200 },
      { key: 'motivation', label: 'Warum möchtest du zu uns?', required: true, type: 'TEXT', minLength: 30, maxLength: 2000 },
      { key: 'experience', label: 'Welche Erfahrung bringst du mit?', required: true, type: 'TEXT', minLength: 0, maxLength: 2000 },
      { key: 'availability', label: 'Wann und wie oft kannst du aktiv sein?', required: true, type: 'TEXT', minLength: 0, maxLength: 500 },
    ],
    channels: { pending: '', accepted: '', denied: '' },
    pingRoles: [],
    messages: { ...DEFAULT_MESSAGES },
    roles: { restricted: { ids: [], mode: 'ANY' }, required: { ids: [], mode: 'ANY' }, accepted: [], denied: [], acceptedRemove: [], deniedRemove: [], pending: [], removeOnSubmit: [], managers: [] },
    staffThreads: false, cooldownMinutes: 0, timeLimitMinutes: 180, onLeave: 'NONE',
    ...over,
  };
}

export function defaultPanel(over = {}) {
  return { id: randomUUID(), title: '📋 Bewerbungen', description: 'Klicke unten, um dich zu bewerben. Der Bot stellt dir die Fragen nacheinander per **Direktnachricht** – die Entscheidung bekommst du ebenfalls per Direktnachricht.', color: '#5865F2', channelId: '', types: ['team'], message: null, ...over };
}

export function defaultGuildConfig() {
  return { access: { adminRoles: [], reviewerRoles: [] }, tickets: { categoryId: '', staffRoleId: '' }, types: [defaultType()], panels: [defaultPanel()] };
}

// ---- Prüfen der Einstellungen aus dem Dashboard ----
const str = (v, max, d = '') => (typeof v === 'string' ? v.trim().slice(0, max) : d);
const id = (v) => (typeof v === 'string' && SNOWFLAKE.test(v) ? v : '');
const ids = (v, max = 25) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && SNOWFLAKE.test(x)))].slice(0, max);
const int = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const rule = (v) => ({ ids: ids(v?.ids), mode: v?.mode === 'ALL' ? 'ALL' : 'ANY' });

function cleanType(t) {
  const d = defaultType();
  const key = str(t?.key, 24).toLowerCase();
  if (!/^[a-z0-9_-]{2,24}$/.test(key)) return { error: `Schlüssel „${key}“: 2–24 Zeichen a-z, 0-9, - oder _.` };
  const name = str(t?.name, 60);
  if (name.length < 2) return { error: `Bewerbung „${key}“: Name fehlt.` };
  const questions = (Array.isArray(t?.questions) ? t.questions : []).map(normalizeQuestion);
  const qErr = validateQuestions(questions);
  if (qErr) return { error: `${name}: ${qErr}` };
  const m = t?.messages ?? {};
  const r = t?.roles ?? {};
  return {
    type: {
      key, name, description: str(t?.description, 600), emoji: str(t?.emoji, 40), enabled: t?.enabled !== false, mode: MODES.includes(t?.mode) ? t.mode : 'DM',
      questions,
      channels: { pending: id(t?.channels?.pending), accepted: id(t?.channels?.accepted), denied: id(t?.channels?.denied) },
      pingRoles: ids(t?.pingRoles, 10),
      messages: Object.fromEntries(Object.keys(DEFAULT_MESSAGES).map((k) => [k, str(m[k], 2000) || d.messages[k]])),
      roles: { restricted: rule(r.restricted), required: rule(r.required), accepted: ids(r.accepted), denied: ids(r.denied), acceptedRemove: ids(r.acceptedRemove), deniedRemove: ids(r.deniedRemove), pending: ids(r.pending), removeOnSubmit: ids(r.removeOnSubmit), managers: ids(r.managers) },
      staffThreads: !!t?.staffThreads,
      cooldownMinutes: int(t?.cooldownMinutes, 0, 525_600, 0),
      timeLimitMinutes: int(t?.timeLimitMinutes, 5, 10_080, 180),
      onLeave: ON_LEAVE.includes(t?.onLeave) ? t.onLeave : 'NONE',
    },
  };
}

/** Eingabe aus dem Dashboard prüfen. `old` liefert die bereits gesendeten Panel-Nachrichten. */
export function sanitizeConfig(input, old) {
  const types = [];
  for (const t of Array.isArray(input?.types) ? input.types : []) {
    const r = cleanType(t);
    if (r.error) return { error: r.error };
    types.push(r.type);
  }
  if (!types.length) return { error: 'Mindestens eine Bewerbungsart ist nötig.' };
  if (types.length > 25) return { error: 'Höchstens 25 Bewerbungsarten.' };
  if (new Set(types.map((t) => t.key)).size !== types.length) return { error: 'Die Schlüssel der Bewerbungsarten müssen eindeutig sein.' };
  const keys = new Set(types.map((t) => t.key));
  const panels = [];
  for (const p of (Array.isArray(input?.panels) ? input.panels : []).slice(0, 10)) {
    const pid = typeof p?.id === 'string' && /^[\w-]{1,64}$/.test(p.id) ? p.id : randomUUID();
    const title = str(p?.title, 256);
    if (!title) return { error: 'Jedes Panel braucht einen Titel.' };
    const ptypes = [...new Set((Array.isArray(p?.types) ? p.types : []).filter((k) => keys.has(k)))];
    if (!ptypes.length) return { error: `Panel „${title}“: mindestens eine Bewerbungsart auswählen.` };
    const prev = old?.panels?.find((x) => x.id === pid);
    panels.push({ id: pid, title, description: str(p?.description, 3500), color: /^#[0-9a-f]{6}$/i.test(p?.color) ? p.color : '#5865F2', channelId: id(p?.channelId), types: ptypes, message: prev?.message ?? null });
  }
  return {
    config: {
      access: { adminRoles: ids(input?.access?.adminRoles), reviewerRoles: ids(input?.access?.reviewerRoles) },
      tickets: { categoryId: id(input?.tickets?.categoryId), staffRoleId: id(input?.tickets?.staffRoleId) },
      types, panels,
    },
  };
}
