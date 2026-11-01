import { z } from 'zod';
import {
  mbDocumentDataSchema, mbId, toDiscordPayload,
  type MbButton, type MbDocumentData, type MbEmbed, type MbMessage, type MbRow, type MbSelectOption,
} from './message-builder';

/**
 * JSON-Editor des Embed Builders: Nachrichten im echten Discord-Nachrichtenformat (wie die REST-API „Create Message“ /
 * „Execute Webhook“) anzeigen, bearbeiten, prüfen, importieren und exportieren.
 *
 * Format (Export):
 * ```json
 * { "messages": [ { "content": "…", "embeds": [ … ], "components": [ … ], "allowed_mentions": { "parse": ["users"] } } ],
 *   "webhook": { "username": "…", "avatar_url": "…" } }
 * ```
 * Beim Import werden zusätzlich angenommen: eine einzelne Discord-Nachricht, eine Liste von Nachrichten und das verbreitete
 * Format `{ "messages": [ { "data": { … } } ] }` (z. B. aus anderen Embed-Editoren).
 *
 * Interaktive Komponenten: Die custom_id ist im Export die interne Komponenten-ID. Discord kennt keine „Aktionen“ – beim
 * Zurückübernehmen bleibt die im grafischen Editor festgelegte Aktion erhalten, solange die custom_id gleich bleibt.
 * Neue interaktive Komponenten brauchen danach eine Aktion (die Prüfung meldet das), sonst wird nicht gesendet.
 */

// ───────────── JSON mit Fehlerposition ─────────────

export interface JsonError { message: string; offset: number; line: number; column: number }
export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: JsonError };

/** Zeile/Spalte (1-basiert) zu einer Zeichenposition. */
export function lineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1, col = 1;
  for (let i = 0; i < Math.min(offset, text.length); i++) {
    if (text[i] === '\n') { line++; col = 1; } else col++;
  }
  return { line, column: col };
}

/**
 * Strenger JSON-Parser (RFC 8259) mit genauer Fehlerposition und deutschen Meldungen. Unabhängig vom Browser, weil die
 * Meldungen von `JSON.parse` je nach Engine verschieden sind und nicht immer eine Position enthalten.
 */
export function parseJsonWithPosition(text: string): JsonParseResult {
  let i = 0;
  class Fail extends Error { constructor(msg: string, public at: number) { super(msg); } }
  const fail = (msg: string, at = i): never => { throw new Fail(msg, at); };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++; };
  const show = (c: string | undefined) => (c === undefined ? 'Ende des Textes' : c === '\n' ? 'Zeilenumbruch' : `„${c}“`);
  const value = (depth: number): unknown => {
    if (depth > 64) fail('Zu tief verschachtelt.');
    ws();
    const c = text[i];
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"') return string();
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return number();
    for (const [word, v] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(word, i)) { i += word.length; return v; }
    }
    if (c === "'") fail('Zeichenketten brauchen doppelte Anführungszeichen (") statt einfacher.');
    if (c === undefined) fail('Unerwartetes Ende – ein Wert fehlt.');
    return fail(`Unerwartetes Zeichen ${show(c)} – erwartet wird ein Wert (Text in "…", Zahl, true/false/null, {…} oder […]).`);
  };
  const object = (depth: number) => {
    const out: Record<string, unknown> = {};
    i++; ws();
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      ws();
      if (text[i] === '}') fail('Komma vor „}“ ist in JSON nicht erlaubt.');
      if (text[i] !== '"') fail(`Erwartet wird ein Schlüssel in doppelten Anführungszeichen, gefunden ${show(text[i])}.`);
      const key = string();
      ws();
      if (text[i] !== ':') fail(`Nach dem Schlüssel "${key}" fehlt ein Doppelpunkt.`);
      i++;
      out[key] = value(depth + 1);
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return out; }
      fail(`Erwartet wird „,“ oder „}“, gefunden ${show(text[i])}.`);
    }
  };
  const array = (depth: number) => {
    const out: unknown[] = [];
    i++; ws();
    if (text[i] === ']') { i++; return out; }
    for (;;) {
      ws();
      if (text[i] === ']') fail('Komma vor „]“ ist in JSON nicht erlaubt.');
      out.push(value(depth + 1));
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return out; }
      fail(`Erwartet wird „,“ oder „]“, gefunden ${show(text[i])}.`);
    }
  };
  const string = () => {
    const start = i;
    i++;
    let out = '';
    for (;;) {
      const c = text[i];
      if (c === undefined) fail('Zeichenkette wird nicht geschlossen (fehlendes ").', start);
      if (c === '"') { i++; return out; }
      if (c === '\n' || c === '\r') fail('Zeilenumbruch in einer Zeichenkette – dafür \\n schreiben.');
      if (c === '\\') {
        const e = text[i + 1];
        const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e !== undefined && map[e] !== undefined) { out += map[e]; i += 2; continue; }
        if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16)); i += 6; continue; }
        fail('Ungültige Escape-Sequenz in der Zeichenkette.');
      }
      out += c; i++;
    }
  };
  const number = () => {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) return fail('Ungültige Zahl.');
    i += m[0].length;
    return Number(m[0]);
  };
  try {
    const v = value(0);
    ws();
    if (i < text.length) fail(`Nach dem Ende des JSON folgt noch ${show(text[i])}.`);
    return { ok: true, value: v };
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    return { ok: false, error: { message: e.message, offset: e.at, ...lineCol(text, e.at) } };
  }
}

// ───────────── Discord-Format (Schema) ─────────────

const emojiIn = z.object({ id: z.string().regex(/^\d{15,25}$/).nullish(), name: z.string().max(100).nullish(), animated: z.boolean().optional() }).nullish();
const linkButtonIn = z.object({ type: z.literal(2), style: z.literal(5), label: z.string().optional(), emoji: emojiIn, url: z.string(), disabled: z.boolean().optional() });
const actionButtonIn = z.object({ type: z.literal(2), style: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), label: z.string().optional(), emoji: emojiIn, custom_id: z.string().min(1).max(100), disabled: z.boolean().optional() });
const selectIn = z.object({
  type: z.literal(3), custom_id: z.string().min(1).max(100), placeholder: z.string().optional(), disabled: z.boolean().optional(),
  min_values: z.number().int().min(0).max(25).optional(), max_values: z.number().int().min(1).max(25).optional(),
  options: z.array(z.object({ label: z.string(), value: z.string().min(1).max(100), description: z.string().nullish(), emoji: emojiIn, default: z.boolean().optional() })).max(25),
});
const rowIn = z.object({ type: z.literal(1), components: z.array(z.unknown()).min(1).max(5) });
const embedIn = z.object({
  title: z.string().nullish(), url: z.string().nullish(), description: z.string().nullish(),
  color: z.number().int().min(0).max(0xffffff).nullish(), timestamp: z.string().nullish(),
  author: z.object({ name: z.string(), url: z.string().nullish(), icon_url: z.string().nullish() }).nullish(),
  footer: z.object({ text: z.string(), icon_url: z.string().nullish() }).nullish(),
  thumbnail: z.object({ url: z.string() }).nullish(), image: z.object({ url: z.string() }).nullish(),
  fields: z.array(z.object({ name: z.string(), value: z.string(), inline: z.boolean().nullish() })).nullish(),
});
const messageIn = z.object({
  content: z.string().nullish(),
  embeds: z.array(embedIn).nullish(),
  components: z.array(rowIn).nullish(),
  allowed_mentions: z.object({ parse: z.array(z.enum(['users', 'roles', 'everyone'])).optional() }).nullish(),
});
export type DiscordMessageJson = z.infer<typeof messageIn>;

export interface MbJsonIssue { message: string; /** z. B. `messages[0].embeds[1].color` */ path: string }
export type MbJsonResult = { ok: true; data: MbDocumentData; notes: string[] } | { ok: false; error: MbJsonIssue & Partial<JsonError> };

export interface FromJsonOptions {
  /** bisheriger Stand: Aktionen interaktiver Komponenten mit gleicher custom_id bleiben erhalten */
  previous?: MbDocumentData;
  /** Zeitpunkt, mit dem „Zeitpunkt des Sendens“ exportiert wurde – gleicher Wert wird wieder zu „beim Senden“ */
  sendNow?: Date;
  /**
   * Was mit unbekannten custom_ids passiert: `action` = neue Aktions-Komponente (Aktion muss festgelegt werden),
   * `keep` = custom_id unverändert übernehmen (nur beim Bearbeiten aus Discord geladener Nachrichten).
   */
  foreignCustomIds?: 'action' | 'keep';
}

const pathStr = (p: (string | number)[]) => p.reduce<string>((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${k}` : k), '');
const emojiStr = (e: z.infer<typeof emojiIn>) => (!e ? '' : e.id ? `<${e.animated ? 'a' : ''}:${e.name ?? 'emoji'}:${e.id}>` : e.name ?? '');
const ID_OK = /^[\w:.-]{1,64}$/;

/** Alle Komponenten (Buttons/Menüs) des bisherigen Stands nach ID. */
function previousComponents(d?: MbDocumentData) {
  const buttons = new Map<string, MbButton>(), selects = new Map<string, Extract<MbRow, { type: 'select' }>>();
  for (const m of d?.messages ?? []) for (const r of m.rows) {
    if (r.type === 'select') selects.set(r.id, r);
    else for (const b of r.buttons) buttons.set(b.id, b);
  }
  return { buttons, selects };
}

/** Eine Nachricht im Discord-Format → Nachricht des Editors. Wirft `{ message, path }` bei ungültigem Aufbau. */
function messageFromJson(raw: unknown, base: (string | number)[], o: FromJsonOptions, prev: ReturnType<typeof previousComponents>, notes: string[]): MbMessage {
  const p = messageIn.safeParse(raw);
  if (!p.success) {
    const iss = p.error.issues[0]!;
    throw { message: zodText(iss), path: pathStr([...base, ...iss.path]) } satisfies MbJsonIssue;
  }
  const j = p.data;
  const embeds: MbEmbed[] = (j.embeds ?? []).map((e) => {
    const ts = e.timestamp ?? '';
    if (ts && Number.isNaN(Date.parse(ts))) throw { message: 'Zeitstempel: kein gültiges ISO-8601-Datum (z. B. 2026-11-01T12:00:00.000Z).', path: pathStr([...base, 'embeds', (j.embeds ?? []).indexOf(e), 'timestamp']) };
    const isSend = !!ts && !!o.sendNow && new Date(ts).toISOString() === o.sendNow.toISOString();
    return {
      id: mbId(), title: e.title ?? '', url: e.url ?? '', description: e.description ?? '',
      color: e.color === null || e.color === undefined ? '' : `#${e.color.toString(16).padStart(6, '0')}`,
      authorName: e.author?.name ?? '', authorUrl: e.author?.url ?? '', authorIconUrl: e.author?.icon_url ?? '',
      thumbnailUrl: e.thumbnail?.url ?? '', imageUrl: e.image?.url ?? '',
      footerText: e.footer?.text ?? '', footerIconUrl: e.footer?.icon_url ?? '',
      timestamp: !ts ? 'none' : isSend ? 'send' : 'custom', timestampAt: ts && !isSend ? new Date(ts).toISOString() : '',
      fields: (e.fields ?? []).map((f) => ({ id: mbId(), name: f.name, value: f.value, inline: !!f.inline })),
    };
  });
  const rows: MbRow[] = (j.components ?? []).map((row, ri) => {
    const comps = row.components;
    const first = comps[0] as { type?: unknown };
    const rp = [...base, 'components', ri, 'components'];
    if (first?.type === 3) {
      if (comps.length !== 1) throw { message: 'Ein Auswahlmenü muss allein in seiner Reihe stehen.', path: pathStr(rp) };
      const s = selectIn.safeParse(first);
      if (!s.success) { const iss = s.error.issues[0]!; throw { message: zodText(iss), path: pathStr([...rp, 0, ...iss.path]) }; }
      const old = prev.selects.get(s.data.custom_id);
      const known = !!old || (ID_OK.test(s.data.custom_id) && !s.data.custom_id.includes(':'));
      const keep = !old && o.foreignCustomIds === 'keep';
      if (!old && !keep) notes.push(`Auswahlmenü „${s.data.placeholder || s.data.custom_id}“: Aktionen der Optionen festlegen.`);
      const options: MbSelectOption[] = s.data.options.map((op) => {
        if (op.value.length > 64) throw { message: 'Optionswert: höchstens 64 Zeichen.', path: pathStr([...rp, 0, 'options', s.data.options.indexOf(op), 'value']) };
        const was = old?.options.find((x) => x.id === op.value);
        return { id: op.value, label: op.label, description: op.description ?? '', emoji: emojiStr(op.emoji), action: was?.action ?? { type: 'reply', text: '' } };
      });
      return {
        id: old ? old.id : keep || !known ? mbId() : s.data.custom_id, type: 'select', placeholder: s.data.placeholder ?? '', disabled: !!s.data.disabled, options,
        minValues: s.data.min_values ?? 1, maxValues: s.data.max_values ?? 1, keepCustomId: keep ? s.data.custom_id : '',
      };
    }
    const buttons = comps.map((c, ci): MbButton => {
      const t = c as { type?: unknown; style?: unknown };
      if (t?.type !== 2) throw { message: `Komponente vom Typ ${String(t?.type)} wird nicht unterstützt (nur Buttons = 2 und Text-Auswahlmenüs = 3).`, path: pathStr([...rp, ci, 'type']) };
      if (t.style === 5) {
        const l = linkButtonIn.safeParse(c);
        if (!l.success) { const iss = l.error.issues[0]!; throw { message: zodText(iss), path: pathStr([...rp, ci, ...iss.path]) }; }
        return { id: mbId(), kind: 'link', label: l.data.label ?? '', emoji: emojiStr(l.data.emoji), style: 'primary', url: l.data.url, disabled: !!l.data.disabled, action: { type: 'reply', text: '' }, keepCustomId: '' };
      }
      const a = actionButtonIn.safeParse(c);
      if (!a.success) {
        const iss = a.error.issues[0]!;
        const msg = t.style === 6 ? 'Premium-Buttons (Stil 6) werden nicht unterstützt.' : zodText(iss);
        throw { message: msg, path: pathStr([...rp, ci, ...(t.style === 6 ? ['style'] : iss.path)]) };
      }
      const style = (['primary', 'secondary', 'success', 'danger'] as const)[a.data.style - 1]!;
      const old = prev.buttons.get(a.data.custom_id);
      const keep = !old && o.foreignCustomIds === 'keep';
      if (!old && !keep) notes.push(`Button „${a.data.label || a.data.custom_id}“: Aktion festlegen.`);
      const ownId = ID_OK.test(a.data.custom_id) && !a.data.custom_id.includes(':');
      return {
        id: old ? old.id : !keep && ownId ? a.data.custom_id : mbId(), kind: 'action', label: a.data.label ?? '', emoji: emojiStr(a.data.emoji), style, url: '', disabled: !!a.data.disabled,
        action: old?.action ?? { type: 'reply', text: '' }, keepCustomId: keep ? a.data.custom_id : '',
      };
    });
    return { id: mbId(), type: 'buttons', buttons };
  });
  const parse = j.allowed_mentions?.parse;
  return {
    id: mbId(), content: j.content ?? '', embeds, rows,
    mentions: parse ? { users: parse.includes('users'), roles: parse.includes('roles'), everyone: parse.includes('everyone') } : { users: true, roles: false, everyone: false },
  };
}

function zodText(iss: z.ZodIssue): string {
  if (iss.code === 'invalid_type') return iss.received === 'undefined' ? 'Pflichtangabe fehlt.' : `Falscher Typ: erwartet ${typeName(iss.expected)}, gefunden ${typeName(iss.received)}.`;
  if (iss.code === 'invalid_literal') return `Ungültiger Wert – erwartet ${JSON.stringify(iss.expected)}.`;
  if (iss.code === 'too_big') return `Zu groß/zu lang (höchstens ${String(iss.maximum)}).`;
  if (iss.code === 'too_small') return `Zu klein/zu kurz (mindestens ${String(iss.minimum)}).`;
  if (iss.code === 'invalid_enum_value') return `Ungültiger Wert – erlaubt: ${iss.options.join(', ')}.`;
  if (iss.code === 'invalid_union') return 'Ungültiger Wert.';
  return iss.message;
}
const typeName = (t: string) => ({ string: 'Text', number: 'Zahl', integer: 'ganze Zahl', boolean: 'true/false', object: 'Objekt {…}', array: 'Liste […]', null: 'null', undefined: 'nichts' } as Record<string, string>)[t] ?? t;

/** Bereits geparstes JSON (Discord-Format) → Inhalt des Editors. */
export function mbFromDiscordJson(value: unknown, o: FromJsonOptions = {}): MbJsonResult {
  const notes: string[] = [];
  const prev = previousComponents(o.previous);
  try {
    let list: { raw: unknown; path: (string | number)[] }[];
    let webhook: { username?: unknown; avatar_url?: unknown } | undefined;
    if (Array.isArray(value)) list = value.map((raw, k) => ({ raw, path: [k] }));
    else if (value && typeof value === 'object' && Array.isArray((value as { messages?: unknown }).messages)) {
      const v = value as { messages: unknown[]; webhook?: unknown; username?: unknown; avatar_url?: unknown };
      list = v.messages.map((m, k) => {
        const data = m && typeof m === 'object' && 'data' in m && (m as { data?: unknown }).data && typeof (m as { data?: unknown }).data === 'object' ? (m as { data: unknown }).data : null;
        return data ? { raw: data, path: ['messages', k, 'data'] } : { raw: m, path: ['messages', k] };
      });
      webhook = v.webhook && typeof v.webhook === 'object' ? v.webhook as typeof webhook : undefined;
      // Discohook-Format: Profil steht in data.username / data.avatar_url der ersten Nachricht
      const d0 = list[0]?.raw as { username?: unknown; avatar_url?: unknown } | undefined;
      if (!webhook && d0 && (typeof d0.username === 'string' || typeof d0.avatar_url === 'string')) webhook = d0;
    } else if (value && typeof value === 'object') {
      list = [{ raw: value, path: [] }];
      const v = value as { username?: unknown; avatar_url?: unknown };
      if (typeof v.username === 'string' || typeof v.avatar_url === 'string') webhook = v;
    } else return { ok: false, error: { message: 'Erwartet wird ein Objekt {…} (eine Nachricht oder { "messages": [ … ] }).', path: '' } };
    if (!list.length) return { ok: false, error: { message: 'Keine Nachricht enthalten.', path: 'messages' } };
    if (list.length > 10) return { ok: false, error: { message: 'Höchstens 10 Nachrichten je Gruppe.', path: 'messages' } };
    const messages = list.map((x) => messageFromJson(x.raw, x.path, o, prev, notes));
    const data = mbDocumentDataSchema.safeParse({
      messages,
      webhookProfile: { username: typeof webhook?.username === 'string' ? webhook.username : o.previous?.webhookProfile.username ?? '', avatarUrl: typeof webhook?.avatar_url === 'string' ? webhook.avatar_url : o.previous?.webhookProfile.avatarUrl ?? '' },
    });
    if (!data.success) {
      const iss = data.error.issues[0]!;
      return { ok: false, error: { message: zodText(iss), path: pathStr(iss.path) } };
    }
    return { ok: true, data: data.data, notes };
  } catch (e) {
    if (e && typeof e === 'object' && 'path' in e && 'message' in e) return { ok: false, error: e as MbJsonIssue };
    throw e;
  }
}

/** JSON-Text → Inhalt des Editors (mit Zeile/Spalte bei Syntaxfehlern). */
export function mbParseJsonText(text: string, o: FromJsonOptions = {}): MbJsonResult {
  if (!text.trim()) return { ok: false, error: { message: 'Das JSON ist leer.', path: '', offset: 0, line: 1, column: 1 } };
  const p = parseJsonWithPosition(text);
  if (!p.ok) return { ok: false, error: { ...p.error, path: '' } };
  return mbFromDiscordJson(p.value, o);
}

/** Inhalt des Editors → Discord-Format (custom_id = interne Komponenten-ID). */
export function mbToDiscordJson(d: MbDocumentData, now: Date = new Date()) {
  const messages = d.messages.map((m) => {
    const ids = new Set<string>();
    for (const r of m.rows) { if (r.type === 'select') ids.add(r.id); else for (const b of r.buttons) if (b.kind === 'action') ids.add(b.id); }
    const p = toDiscordPayload(m, { now, customIdOf: (cid) => (ids.has(cid) ? cid : undefined) });
    return { ...(p.content ? { content: p.content } : {}), embeds: p.embeds, components: p.components, allowed_mentions: p.allowed_mentions };
  });
  const w = d.webhookProfile;
  return { messages, ...(w.username || w.avatarUrl ? { webhook: { ...(w.username ? { username: w.username } : {}), ...(w.avatarUrl ? { avatar_url: w.avatarUrl } : {}) } } : {}) };
}
export const mbToDiscordJsonText = (d: MbDocumentData, now?: Date) => JSON.stringify(mbToDiscordJson(d, now), null, 2);

/** custom_ids aller interaktiven Komponenten einer Discord-Nachricht (für erlaubte übernommene custom_ids beim Bearbeiten). */
export function customIdsOf(components: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x && typeof x === 'object') {
      const o = x as { custom_id?: unknown; components?: unknown };
      if (typeof o.custom_id === 'string') out.push(o.custom_id);
      if (o.components) walk(o.components);
    }
  };
  walk(components);
  return out;
}

// ───────────── Vorlagen-Austausch (Import/Export) ─────────────

export const MB_TEMPLATE_EXPORT_FORMAT = 'enpol-embed-builder-templates';
export const mbTemplateExportSchema = z.object({
  format: z.literal(MB_TEMPLATE_EXPORT_FORMAT),
  version: z.literal(1),
  templates: z.array(z.object({ name: z.string().trim().min(1).max(100), category: z.string().trim().max(60).nullable().default(null), data: mbDocumentDataSchema })).min(1).max(200),
});
export type MbTemplateExport = z.infer<typeof mbTemplateExportSchema>;
