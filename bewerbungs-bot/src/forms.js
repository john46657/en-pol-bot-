/**
 * Bewerbungsfragen, Antwortprüfung, Texte mit Variablen und Rollen-Regeln.
 * Reine Funktionen – vom Bot (DM-Fragen), vom Web-Formular und vom Dashboard gleich benutzt.
 */

/** Fragetypen: Text, Auswahl, Rollen-Auswahl (Rolle wird bei Annahme vergeben), Roblox-Benutzer (wird bei Roblox geprüft). */
export const QUESTION_TYPES = { TEXT: 'Text', CHOICE: 'Auswahl', ROLE: 'Rollen-Auswahl', ROBLOX: 'Roblox-Benutzer' };
export const ROBLOX_NAME = /^[A-Za-z0-9_]{3,20}$/;
export const SNOWFLAKE = /^\d{15,25}$/;
export const MAX_QUESTIONS = 50;
export const MAX_OPTIONS = 25;
export const isInputQuestion = (t) => !t || t === 'TEXT' || t === 'ROBLOX';

/** Vollständige Frage mit Standardwerten. */
export function normalizeQuestion(q) {
  const type = QUESTION_TYPES[q.type] ? q.type : 'TEXT';
  const input = isInputQuestion(type);
  return {
    key: String(q.key), label: String(q.label ?? ''), required: q.required !== false, type,
    minLength: type === 'TEXT' ? Math.max(0, Number(q.minLength) || 0) : 0,
    maxLength: type === 'ROBLOX' ? 20 : Math.min(4000, Math.max(1, Number(q.maxLength) || 1000)),
    options: input ? [] : (Array.isArray(q.options) ? q.options : []).slice(0, MAX_OPTIONS).map((o) => ({ label: String(o.label ?? ''), ...(o.roleId ? { roleId: String(o.roleId) } : {}) })),
    multiple: !input && !!q.multiple,
  };
}

/**
 * Prüft eine Antwort. Text: String; Auswahl/Rollen: gewählte Beschriftungen.
 * Ergebnis: { ok, text, roleIds } oder { ok: false, error }.
 */
export function checkAnswer(question, value) {
  const f = normalizeQuestion(question);
  const empty = { ok: true, text: '', roleIds: [] };
  if (f.type === 'ROBLOX') {
    const v = String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim().replace(/^@/, '');
    if (!v) return f.required ? { ok: false, error: `„${f.label}“ ist eine Pflichtfrage.` } : empty;
    if (!ROBLOX_NAME.test(v)) return { ok: false, error: `Bei „${f.label}“ bitte einen gültigen Roblox-Benutzernamen angeben (3–20 Zeichen, Buchstaben, Ziffern, _).` };
    return { ok: true, text: v, roleIds: [] };
  }
  if (f.type === 'TEXT') {
    const v = String(Array.isArray(value) ? value.join('\n') : value ?? '').trim();
    if (!v) return f.required ? { ok: false, error: `„${f.label}“ ist eine Pflichtfrage.` } : empty;
    if (v.length < f.minLength) return { ok: false, error: `Die Antwort auf „${f.label}“ ist zu kurz (mindestens ${f.minLength} Zeichen).` };
    if (v.length > f.maxLength) return { ok: false, error: `Die Antwort auf „${f.label}“ ist zu lang (höchstens ${f.maxLength} Zeichen).` };
    return { ok: true, text: v, roleIds: [] };
  }
  const picked = [...new Set((Array.isArray(value) ? value : value ? [value] : []).map((x) => String(x).trim()).filter(Boolean))];
  if (!picked.length) return f.required ? { ok: false, error: `Bitte bei „${f.label}“ etwas auswählen.` } : empty;
  if (!f.multiple && picked.length > 1) return { ok: false, error: `Bei „${f.label}“ ist nur eine Auswahl erlaubt.` };
  const opts = picked.map((p) => f.options.find((o) => o.label === p));
  if (opts.some((o) => !o)) return { ok: false, error: `Ungültige Auswahl bei „${f.label}“.` };
  return { ok: true, text: picked.join(', '), roleIds: f.type === 'ROLE' ? opts.map((o) => o.roleId).filter((r) => r && SNOWFLAKE.test(r)) : [] };
}

/** Prüft einen Fragenkatalog (Dashboard → Speichern). Liefert Fehlertext oder null. */
export function validateQuestions(qs) {
  if (!Array.isArray(qs) || !qs.length) return 'Mindestens eine Frage ist nötig.';
  if (qs.length > MAX_QUESTIONS) return `Höchstens ${MAX_QUESTIONS} Fragen.`;
  const keys = new Set();
  for (const [i, raw] of qs.entries()) {
    const q = normalizeQuestion(raw);
    const n = `Frage ${i + 1}`;
    if (!/^[a-zA-Z][\w]{0,40}$/.test(q.key)) return `${n}: ungültiger Schlüssel.`;
    if (keys.has(q.key)) return `${n}: Schlüssel „${q.key}“ doppelt.`;
    keys.add(q.key);
    if (!q.label.trim() || q.label.length > 300) return `${n}: Text fehlt oder ist zu lang (max. 300 Zeichen).`;
    if (q.minLength > q.maxLength) return `${n}: Mindestlänge ist größer als die Höchstlänge.`;
    if (!isInputQuestion(q.type)) {
      if (!q.options.length) return `${n}: mindestens eine Option nötig.`;
      if (q.options.some((o) => !o.label.trim() || o.label.length > 100)) return `${n}: jede Option braucht einen Text (max. 100 Zeichen).`;
      if (new Set(q.options.map((o) => o.label)).size !== q.options.length) return `${n}: Optionen müssen eindeutig sein.`;
      if (q.type === 'ROLE' && q.options.some((o) => !o.roleId || !SNOWFLAKE.test(o.roleId))) return `${n}: jede Option einer Rollen-Auswahl braucht eine Rolle.`;
    }
  }
  return null;
}

/** Freier Schlüssel `frage1`, `frage2` … */
export function freeKey(used) {
  const set = new Set(used);
  for (let n = 1; ; n++) if (!set.has(`frage${n}`)) return `frage${n}`;
}

// ---- Texte mit Variablen ----
export const VARIABLES = {
  '{applicationName}': 'Name der Bewerbung',
  '{user}': 'Wer entschieden hat (Erwähnung)',
  '{applicant}': 'Der Bewerber (Erwähnung)',
  '{number}': 'Bewerbungsnummer',
  '{reason}': 'Grund (falls angegeben)',
  '{questionCount}': 'Anzahl der Fragen',
  '{timeLimit}': 'Zeitlimit, z. B. 3 Stunden',
  '{server}': 'Name des Discord-Servers',
};
export const DEFAULT_MESSAGES = {
  accepted: '🎉 Deine Bewerbung als `{applicationName}` ({number}) wurde von {user} **angenommen**!',
  denied: 'Deine Bewerbung als `{applicationName}` ({number}) wurde von {user} leider **abgelehnt**. Du kannst dich später gerne erneut bewerben.',
  confirmation: 'Bist du sicher, dass du dich bewerben möchtest?\n\nSobald du startest, schicke ich dir nacheinander **{questionCount} Fragen**. Du hast **{timeLimit}** Zeit, die Bewerbung abzuschließen – sonst musst du neu starten. Abbrechen kannst du jederzeit, indem du **abbrechen** schreibst.',
  completion: '✅ Deine Bewerbung **{number}** ist eingegangen! Das Team prüft sie – die Entscheidung bekommst du per Direktnachricht.',
};
/** Ersetzt bekannte Variablen; ein Grund wird angehängt, wenn der Text `{reason}` nicht selbst enthält. */
export function renderText(text, vars, appendReason = false) {
  const out = String(text).replace(/\{[a-zA-Z]+\}/g, (m) => (m in vars ? vars[m] ?? '' : m));
  return appendReason && vars['{reason}'] && !String(text).includes('{reason}') ? `${out}\n\n**Grund:** ${vars['{reason}']}` : out;
}

export function formatMinutes(min) {
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return [d ? `${d} ${d === 1 ? 'Tag' : 'Tage'}` : '', h ? `${h} ${h === 1 ? 'Stunde' : 'Stunden'}` : '', m ? `${m} ${m === 1 ? 'Minute' : 'Minuten'}` : ''].filter(Boolean).join(' ') || '0 Minuten';
}
export const formatDuration = (sec) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)} min ${sec % 60}s` : `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`);

// ---- Rollen ----
/** „alle“ (ALL) oder „mindestens eine“ (ANY) der Rollen. */
export const rolesMatch = (have, ids, mode) => (mode === 'ALL' ? ids.every((r) => have.includes(r)) : ids.some((r) => have.includes(r)));
const uniq = (xs) => [...new Set(xs.filter((x) => x && SNOWFLAKE.test(x)))];

/** Rollen-Voraussetzungen – Fehlermeldung oder null. */
export function roleBlock(type, memberRoles) {
  const req = type.roles?.required, res = type.roles?.restricted;
  if (req?.ids?.length && !rolesMatch(memberRoles, req.ids, req.mode)) return `Dir fehlt ${req.mode === 'ALL' ? 'eine der nötigen Rollen' : 'die nötige Rolle'} für diese Bewerbung.`;
  if (res?.ids?.length && rolesMatch(memberRoles, res.ids, res.mode)) return 'Mit deinen Rollen kannst du dich hierfür nicht bewerben.';
  return null;
}
/** Beim Einreichen: „ausstehend“ geben, „beim Einreichen entfernen“ nehmen. */
export const submitRoles = (type) => ({ add: uniq(type.roles?.pending ?? []), remove: uniq(type.roles?.removeOnSubmit ?? []) });
/** Bei der Entscheidung: Annahme → Annahme-Rollen + gewählte Rollen; Ablehnung → Ablehnungs-Rollen; „ausstehend“ fällt weg. */
export function decisionRoles(type, accepted, extra = []) {
  const r = type.roles ?? {};
  const add = accepted ? uniq([...extra, ...(r.accepted ?? [])]) : uniq(r.denied ?? []);
  const remove = uniq([...(accepted ? r.acceptedRemove ?? [] : r.deniedRemove ?? []), ...(r.pending ?? [])]).filter((x) => !add.includes(x));
  return { add, remove };
}
/** Wartezeit in Minuten bis zur nächsten Bewerbung – null, wenn keine. */
export function cooldownLeft(type, last, now = Date.now()) {
  if (!type.cooldownMinutes || !last) return null;
  const left = new Date(last).getTime() + type.cooldownMinutes * 60_000 - now;
  return left > 0 ? Math.ceil(left / 60_000) : null;
}

/** Deutscher Genitiv: „Lenas“, aber „Jonas’“. */
export const possessive = (name) => (/[sßxz]$/i.test(String(name ?? '').trim()) ? `${name}’` : `${name}s`);
export const clip = (s, max) => { const t = String(s ?? ''); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
/** Markdown und @everyone/@here entschärfen. */
export const plain = (s) => String(s ?? '').replace(/[*_`~|>\\]/g, '\\$&').replace(/@(everyone|here)/g, '@\u200b$1');
