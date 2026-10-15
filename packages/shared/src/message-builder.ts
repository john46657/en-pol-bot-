import { z } from 'zod';

/**
 * Discord Message Builder (Discohook-artig): Nachrichtengruppen aus mehreren Discord-Nachrichten mit Text, Embeds und
 * Komponenten (Buttons, Auswahlmenü). Gemeinsam für Dashboard (Editor + Vorschau), API (Prüfung + Versand) und Bot.
 *
 * Gespeichert wird bewusst „locker“ (Entwürfe dürfen unfertig sein). Vor dem Versand prüft `validateMbDocument` streng gegen
 * die Discord-Limits; `toDiscordPayload` erzeugt den JSON-Body im Format der Discord-REST-API (Create Message / Execute Webhook).
 */

/** Discord-API-Limits (https://discord.com/developers/docs/resources/message, …/channel#embed-limits, …/components). */
export const DISCORD_LIMITS = {
  content: 2000,
  embedsPerMessage: 10,
  embedTotal: 6000,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  actionRows: 5,
  buttonsPerRow: 5,
  buttonLabel: 80,
  customId: 100,
  linkUrl: 512,
  selectOptions: 25,
  selectPlaceholder: 150,
  optionLabel: 100,
  optionValue: 100,
  optionDescription: 100,
  webhookUsername: 80,
} as const;
/** Interne Obergrenzen (kein Discord-Limit): eine Gruppe, Länge sonstiger URLs. */
export const MB_LIMITS = { messagesPerGroup: 10, url: 2048, replyText: 2000 } as const;

const str = (max: number) => z.string().max(max).default('');
const id = z.string().min(1).max(64);

export const MB_BUTTON_STYLES = ['primary', 'secondary', 'success', 'danger'] as const;
export type MbButtonStyle = (typeof MB_BUTTON_STYLES)[number];

/** Was ein interaktiver Button / eine Menü-Option tut. Ohne definierte Aktion wird kein interaktiver Button gesendet. */
export const mbActionSchema = z.discriminatedUnion('type', [
  /** Antwort nur für die klickende Person sichtbar (ephemeral). */
  z.object({ type: z.literal('reply'), text: str(4000) }),
  /** Discord-Rolle der klickenden Person geben bzw. wieder nehmen (Umschalter). */
  z.object({ type: z.literal('role'), roleId: str(32), mode: z.enum(['toggle', 'add', 'remove']).default('toggle') }),
]);
export type MbAction = z.infer<typeof mbActionSchema>;

export const mbButtonSchema = z.object({
  id,
  /** link = öffnet eine URL (keine Interaktion nötig); action = führt eine definierte Aktion im Bot aus */
  kind: z.enum(['link', 'action']).default('link'),
  label: str(500),
  emoji: str(100),
  style: z.enum(MB_BUTTON_STYLES).default('primary'),
  url: str(4000),
  disabled: z.boolean().default(false),
  action: mbActionSchema.default({ type: 'reply', text: '' }),
});
export type MbButton = z.infer<typeof mbButtonSchema>;

export const mbSelectOptionSchema = z.object({ id, label: str(500), description: str(500), emoji: str(100), action: mbActionSchema.default({ type: 'reply', text: '' }) });
export type MbSelectOption = z.infer<typeof mbSelectOptionSchema>;

export const mbRowSchema = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('buttons'), buttons: z.array(mbButtonSchema).max(25).default([]) }),
  z.object({ id, type: z.literal('select'), placeholder: str(500), disabled: z.boolean().default(false), options: z.array(mbSelectOptionSchema).max(50).default([]) }),
]);
export type MbRow = z.infer<typeof mbRowSchema>;

export const mbFieldSchema = z.object({ id, name: str(2000), value: str(4000), inline: z.boolean().default(false) });
export type MbField = z.infer<typeof mbFieldSchema>;

export const mbEmbedSchema = z.object({
  id,
  title: str(2000),
  url: str(4000),
  description: str(10000),
  /** `#rrggbb` oder leer (= keine Farbe) */
  color: str(16),
  authorName: str(2000), authorUrl: str(4000), authorIconUrl: str(4000),
  thumbnailUrl: str(4000),
  imageUrl: str(4000),
  footerText: str(4000), footerIconUrl: str(4000),
  /** none = ohne, send = Zeitpunkt des Versands, custom = `timestampAt` */
  timestamp: z.enum(['none', 'send', 'custom']).default('none'),
  timestampAt: str(64),
  fields: z.array(mbFieldSchema).max(50).default([]),
});
export type MbEmbed = z.infer<typeof mbEmbedSchema>;

export const mbMessageSchema = z.object({
  id,
  content: str(10000),
  embeds: z.array(mbEmbedSchema).max(20).default([]),
  rows: z.array(mbRowSchema).max(10).default([]),
  /** Wer wirklich gepingt wird. @everyone/@here nur, wenn ausdrücklich eingeschaltet. */
  mentions: z.object({ users: z.boolean().default(true), roles: z.boolean().default(false), everyone: z.boolean().default(false) }).default({}),
});
export type MbMessage = z.infer<typeof mbMessageSchema>;

/** Inhalt eines Entwurfs bzw. einer Vorlage. */
export const mbDocumentDataSchema = z.object({
  messages: z.array(mbMessageSchema).max(MB_LIMITS.messagesPerGroup).default([]),
  /** Name/Profilbild nur beim Versand über einen Webhook (der Bot sendet immer als er selbst). */
  webhookProfile: z.object({ username: str(200), avatarUrl: str(4000) }).default({}),
});
export type MbDocumentData = z.infer<typeof mbDocumentDataSchema>;

let counter = 0;
/** Kurze, im Dokument eindeutige ID (für React-Keys und Zuordnung von Aktionen). */
export const mbId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const emptyMbEmbed = (): MbEmbed => mbEmbedSchema.parse({ id: mbId(), color: '#1e3a8a' });
export const emptyMbMessage = (): MbMessage => mbMessageSchema.parse({ id: mbId() });
export const emptyMbDocument = (): MbDocumentData => mbDocumentDataSchema.parse({ messages: [{ id: mbId(), content: '' }] });

/** Kopie mit neuen IDs (Nachricht/Embed duplizieren). */
export function cloneWithNewIds<T>(v: T): T {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, k === 'id' && typeof val === 'string' ? mbId() : walk(val)]));
    return x;
  };
  return walk(v) as T;
}

// ───────────── Prüfung ─────────────

export interface MbIssue { level: 'error' | 'warning'; message: string; /** z. B. „Nachricht 1 › Embed 2 › Feld 3“ */ where: string; /** Pfad im Dokument (für Markierungen im Editor) */ path: (string | number)[] }

const SNOWFLAKE = /^\d{15,25}$/;
const CUSTOM_EMOJI = /^<(a?):(\w{2,32}):(\d{15,25})>$/;
/** Ein Unicode-Emoji (inkl. Varianten/Zusammensetzungen) – grob, aber ohne Buchstaben/Ziffern. */
const UNICODE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)(?:[️‍\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{E0020}-\u{E007F}])*$/u;
export const isValidEmoji = (e: string) => CUSTOM_EMOJI.test(e) || (e.length <= 32 && UNICODE_EMOJI.test(e));
/** http(s)-URL, die Discord annimmt. */
export function isHttpUrl(u: string): boolean {
  if (!/^https?:\/\//i.test(u) || /\s/.test(u)) return false;
  try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') && !!x.hostname; } catch { return false; }
}
const HEX = /^#[0-9a-fA-F]{6}$/;
const len = (s: string) => [...s].length;

/** Zeichen, die bei den 6000 Zeichen je Nachricht zählen (Titel, Beschreibung, Feldnamen/-werte, Fußzeile, Autor). */
export const embedChars = (e: MbEmbed) => len(e.title) + len(e.description) + len(e.authorName) + len(e.footerText) + e.fields.reduce((n, f) => n + len(f.name) + len(f.value), 0);

export interface MbValidateOptions {
  /** Versandweg: Webhooks (nicht vom Bot) dürfen nur Link-Buttons senden. */
  target?: 'bot' | 'webhook';
  /** Rollen-Aktionen erlaubt (eigenes Recht)? */
  allowRoleActions?: boolean;
  /** Bekannte Rollen des Servers (für Rollen-Aktionen); undefiniert = nicht prüfbar */
  roleIds?: readonly string[];
}

export function validateMbMessage(m: MbMessage, idx: number, o: MbValidateOptions = {}): MbIssue[] {
  const out: MbIssue[] = [];
  const base = `Nachricht ${idx + 1}`;
  const add = (level: MbIssue['level'], where: string, path: (string | number)[], message: string) => out.push({ level, where: where ? `${base} › ${where}` : base, path: ['messages', idx, ...path], message });
  const url = (v: string, where: string, path: (string | number)[], label: string, max: number = MB_LIMITS.url) => {
    if (!v) return;
    if (!isHttpUrl(v)) add('error', where, path, `${label}: keine gültige URL (muss mit https:// oder http:// beginnen).`);
    else if (v.length > max) add('error', where, path, `${label}: höchstens ${max} Zeichen.`);
    else if (v.startsWith('http://')) add('warning', where, path, `${label}: unverschlüsselt (http). Discord zeigt Bilder über http oft nicht an.`);
  };
  if (len(m.content) > DISCORD_LIMITS.content) add('error', 'Text', ['content'], `Text: ${len(m.content)}/${DISCORD_LIMITS.content} Zeichen.`);
  if (!m.content.trim() && !m.embeds.length && !m.rows.length) add('error', '', [], 'Die Nachricht ist leer – Text, Embed oder Komponente nötig.');
  if (m.mentions.everyone && /@(everyone|here)/.test(m.content)) add('warning', 'Text', ['content'], '@everyone/@here wird wirklich gepingt (der Bot braucht dafür das Recht „@everyone erwähnen“).');
  if (m.embeds.length > DISCORD_LIMITS.embedsPerMessage) add('error', '', ['embeds'], `Höchstens ${DISCORD_LIMITS.embedsPerMessage} Embeds je Nachricht.`);
  let total = 0;
  m.embeds.forEach((e, ei) => {
    const w = `Embed ${ei + 1}`;
    const p = (...x: (string | number)[]) => ['embeds', ei, ...x];
    total += embedChars(e);
    const lim = (v: string, max: number, key: string, label: string) => { if (len(v) > max) add('error', w, p(key), `${label}: ${len(v)}/${max} Zeichen.`); };
    lim(e.title, DISCORD_LIMITS.title, 'title', 'Titel');
    lim(e.description, DISCORD_LIMITS.description, 'description', 'Beschreibung');
    lim(e.authorName, DISCORD_LIMITS.authorName, 'authorName', 'Autorname');
    lim(e.footerText, DISCORD_LIMITS.footerText, 'footerText', 'Fußzeile');
    if (e.color && !HEX.test(e.color)) add('error', w, p('color'), 'Farbe: HEX-Wert wie #1e3a8a.');
    url(e.url, w, p('url'), 'Titel-URL');
    if (e.url && !e.title) add('warning', w, p('url'), 'Titel-URL ohne Titel wird in Discord nicht angezeigt.');
    url(e.authorUrl, w, p('authorUrl'), 'Autor-URL');
    url(e.authorIconUrl, w, p('authorIconUrl'), 'Autor-Icon');
    if ((e.authorUrl || e.authorIconUrl) && !e.authorName.trim()) add('error', w, p('authorName'), 'Autor-URL/-Icon brauchen einen Autornamen.');
    url(e.thumbnailUrl, w, p('thumbnailUrl'), 'Thumbnail');
    url(e.imageUrl, w, p('imageUrl'), 'Bild');
    url(e.footerIconUrl, w, p('footerIconUrl'), 'Fußzeilen-Icon');
    if (e.footerIconUrl && !e.footerText.trim()) add('error', w, p('footerText'), 'Ein Fußzeilen-Icon braucht einen Fußzeilentext.');
    if (e.timestamp === 'custom' && (!e.timestampAt || Number.isNaN(Date.parse(e.timestampAt)))) add('error', w, p('timestampAt'), 'Zeitstempel: gültiges Datum wählen.');
    if (e.fields.length > DISCORD_LIMITS.fields) add('error', w, p('fields'), `Höchstens ${DISCORD_LIMITS.fields} Felder je Embed.`);
    e.fields.forEach((f, fi) => {
      const fw = `${w} › Feld ${fi + 1}`;
      if (!f.name.trim()) add('error', fw, p('fields', fi, 'name'), 'Feldname fehlt (Discord verlangt Name und Wert).');
      if (!f.value.trim()) add('error', fw, p('fields', fi, 'value'), 'Feldwert fehlt (Discord verlangt Name und Wert).');
      if (len(f.name) > DISCORD_LIMITS.fieldName) add('error', fw, p('fields', fi, 'name'), `Feldname: ${len(f.name)}/${DISCORD_LIMITS.fieldName} Zeichen.`);
      if (len(f.value) > DISCORD_LIMITS.fieldValue) add('error', fw, p('fields', fi, 'value'), `Feldwert: ${len(f.value)}/${DISCORD_LIMITS.fieldValue} Zeichen.`);
    });
    const empty = !e.title.trim() && !e.description.trim() && !e.fields.length && !e.imageUrl && !e.thumbnailUrl && !e.authorName.trim() && !e.footerText.trim();
    if (empty) add('error', w, p(), 'Das Embed ist leer – Titel, Beschreibung, Feld, Bild, Autor oder Fußzeile nötig.');
  });
  if (total > DISCORD_LIMITS.embedTotal) add('error', 'Embeds', ['embeds'], `Alle Embeds zusammen: ${total}/${DISCORD_LIMITS.embedTotal} Zeichen.`);
  if (m.rows.length > DISCORD_LIMITS.actionRows) add('error', 'Komponenten', ['rows'], `Höchstens ${DISCORD_LIMITS.actionRows} Komponenten-Reihen je Nachricht.`);
  const action = (a: MbAction, where: string, path: (string | number)[]) => {
    if (a.type === 'reply') {
      if (!a.text.trim()) add('error', where, [...path, 'text'], 'Aktion „Antwort“: Antworttext fehlt.');
      else if (len(a.text) > MB_LIMITS.replyText) add('error', where, [...path, 'text'], `Antworttext: ${len(a.text)}/${MB_LIMITS.replyText} Zeichen.`);
    } else {
      if (o.allowRoleActions === false) add('error', where, path, 'Rollen-Aktionen darfst du nicht anlegen (Recht „Rollen-Buttons“).');
      if (!SNOWFLAKE.test(a.roleId)) add('error', where, [...path, 'roleId'], 'Aktion „Rolle“: Rolle wählen.');
      else if (o.roleIds && !o.roleIds.includes(a.roleId)) add('error', where, [...path, 'roleId'], 'Diese Rolle gibt es auf dem Discord-Server nicht (mehr).');
    }
  };
  m.rows.forEach((r, ri) => {
    const w = `Reihe ${ri + 1}`;
    const p = (...x: (string | number)[]) => ['rows', ri, ...x];
    if (r.type === 'buttons') {
      if (!r.buttons.length) add('error', w, p('buttons'), 'Die Button-Reihe ist leer.');
      if (r.buttons.length > DISCORD_LIMITS.buttonsPerRow) add('error', w, p('buttons'), `Höchstens ${DISCORD_LIMITS.buttonsPerRow} Buttons je Reihe.`);
      r.buttons.forEach((b, bi) => {
        const bw = `${w} › Button ${bi + 1}`;
        if (!b.label.trim() && !b.emoji.trim()) add('error', bw, p('buttons', bi, 'label'), 'Button braucht eine Beschriftung oder ein Emoji.');
        if (len(b.label) > DISCORD_LIMITS.buttonLabel) add('error', bw, p('buttons', bi, 'label'), `Beschriftung: ${len(b.label)}/${DISCORD_LIMITS.buttonLabel} Zeichen.`);
        if (b.emoji && !isValidEmoji(b.emoji.trim())) add('error', bw, p('buttons', bi, 'emoji'), 'Emoji: ein Unicode-Emoji (z. B. 🚓) oder ein Server-Emoji wie <:name:123…>.');
        if (b.kind === 'link') {
          if (!b.url) add('error', bw, p('buttons', bi, 'url'), 'Link-Button braucht eine URL.');
          else url(b.url, bw, p('buttons', bi, 'url'), 'Link', DISCORD_LIMITS.linkUrl);
        } else {
          if (o.target === 'webhook') add('error', bw, p('buttons', bi), 'Über einen Webhook sind nur Link-Buttons möglich – für Aktions-Buttons über den Bot senden.');
          action(b.action, bw, p('buttons', bi, 'action'));
        }
      });
    } else {
      if (o.target === 'webhook') add('error', w, p(), 'Über einen Webhook sind keine Auswahlmenüs möglich – über den Bot senden.');
      if (!r.options.length) add('error', w, p('options'), 'Das Auswahlmenü braucht mindestens eine Option.');
      if (r.options.length > DISCORD_LIMITS.selectOptions) add('error', w, p('options'), `Höchstens ${DISCORD_LIMITS.selectOptions} Optionen.`);
      if (len(r.placeholder) > DISCORD_LIMITS.selectPlaceholder) add('error', w, p('placeholder'), `Platzhalter: ${len(r.placeholder)}/${DISCORD_LIMITS.selectPlaceholder} Zeichen.`);
      r.options.forEach((op, oi) => {
        const ow = `${w} › Option ${oi + 1}`;
        if (!op.label.trim()) add('error', ow, p('options', oi, 'label'), 'Option braucht eine Beschriftung.');
        if (len(op.label) > DISCORD_LIMITS.optionLabel) add('error', ow, p('options', oi, 'label'), `Beschriftung: ${len(op.label)}/${DISCORD_LIMITS.optionLabel} Zeichen.`);
        if (len(op.description) > DISCORD_LIMITS.optionDescription) add('error', ow, p('options', oi, 'description'), `Beschreibung: ${len(op.description)}/${DISCORD_LIMITS.optionDescription} Zeichen.`);
        if (op.emoji && !isValidEmoji(op.emoji.trim())) add('error', ow, p('options', oi, 'emoji'), 'Emoji: ein Unicode-Emoji oder ein Server-Emoji wie <:name:123…>.');
        action(op.action, ow, p('options', oi, 'action'));
      });
    }
  });
  return out;
}

export function validateMbDocument(d: MbDocumentData, o: MbValidateOptions = {}): MbIssue[] {
  const out: MbIssue[] = [];
  if (!d.messages.length) out.push({ level: 'error', where: 'Gruppe', path: ['messages'], message: 'Keine Nachricht vorhanden.' });
  if (d.messages.length > MB_LIMITS.messagesPerGroup) out.push({ level: 'error', where: 'Gruppe', path: ['messages'], message: `Höchstens ${MB_LIMITS.messagesPerGroup} Nachrichten je Gruppe.` });
  d.messages.forEach((m, i) => out.push(...validateMbMessage(m, i, o)));
  if (o.target === 'webhook') {
    const u = d.webhookProfile.username.trim();
    if (len(u) > DISCORD_LIMITS.webhookUsername) out.push({ level: 'error', where: 'Webhook-Profil', path: ['webhookProfile', 'username'], message: `Name: höchstens ${DISCORD_LIMITS.webhookUsername} Zeichen.` });
    if (/clyde|discord/i.test(u)) out.push({ level: 'error', where: 'Webhook-Profil', path: ['webhookProfile', 'username'], message: 'Discord verbietet „clyde“ und „discord“ im Webhook-Namen.' });
    if (d.webhookProfile.avatarUrl && !isHttpUrl(d.webhookProfile.avatarUrl)) out.push({ level: 'error', where: 'Webhook-Profil', path: ['webhookProfile', 'avatarUrl'], message: 'Profilbild: keine gültige URL.' });
  }
  return out;
}
export const hasErrors = (issues: MbIssue[]) => issues.some((i) => i.level === 'error');

// ───────────── Discord-Payload ─────────────

/** Emoji im Format der Discord-API (Partial Emoji). */
export function toPartialEmoji(e: string): { id?: string; name: string; animated?: boolean } | undefined {
  const t = e.trim();
  if (!t) return undefined;
  const c = CUSTOM_EMOJI.exec(t);
  return c ? { id: c[3]!, name: c[2]!, ...(c[1] ? { animated: true } : {}) } : { name: t };
}
const STYLE_NUM: Record<MbButtonStyle, number> = { primary: 1, secondary: 2, success: 3, danger: 4 };

/** Discord-JSON einer Nachricht (snake_case wie die REST-API). */
export interface DiscordMessagePayload {
  content?: string;
  embeds: Record<string, unknown>[];
  components: { type: 1; components: Record<string, unknown>[] }[];
  allowed_mentions: { parse: ('users' | 'roles' | 'everyone')[] };
}

/**
 * Baut den Discord-Body. `customIdOf(componentId)` liefert die custom_id interaktiver Komponenten (`mb:<aktion>`);
 * ohne Zuordnung werden interaktive Komponenten weggelassen – es entsteht nie ein Button ohne Funktion.
 */
export function toDiscordPayload(m: MbMessage, o: { now?: Date; customIdOf?: (componentId: string) => string | undefined } = {}): DiscordMessagePayload {
  const now = o.now ?? new Date();
  const embeds = m.embeds.map((e) => {
    const x: Record<string, unknown> = {};
    if (e.title) x.title = e.title;
    if (e.url) x.url = e.url;
    if (e.description) x.description = e.description;
    if (e.color && HEX.test(e.color)) x.color = parseInt(e.color.slice(1), 16);
    if (e.authorName) x.author = { name: e.authorName, ...(e.authorUrl ? { url: e.authorUrl } : {}), ...(e.authorIconUrl ? { icon_url: e.authorIconUrl } : {}) };
    if (e.thumbnailUrl) x.thumbnail = { url: e.thumbnailUrl };
    if (e.imageUrl) x.image = { url: e.imageUrl };
    if (e.footerText) x.footer = { text: e.footerText, ...(e.footerIconUrl ? { icon_url: e.footerIconUrl } : {}) };
    if (e.timestamp === 'send') x.timestamp = now.toISOString();
    if (e.timestamp === 'custom' && e.timestampAt && !Number.isNaN(Date.parse(e.timestampAt))) x.timestamp = new Date(e.timestampAt).toISOString();
    if (e.fields.length) x.fields = e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline }));
    return x;
  });
  const components: DiscordMessagePayload['components'] = [];
  for (const r of m.rows) {
    if (r.type === 'buttons') {
      const buttons = r.buttons.flatMap((b): Record<string, unknown>[] => {
        const emoji = toPartialEmoji(b.emoji);
        const common = { ...(b.label ? { label: b.label } : {}), ...(emoji ? { emoji } : {}), ...(b.disabled ? { disabled: true } : {}) };
        if (b.kind === 'link') return b.url ? [{ type: 2, style: 5, url: b.url, ...common }] : [];
        const cid = o.customIdOf?.(b.id);
        return cid ? [{ type: 2, style: STYLE_NUM[b.style], custom_id: cid, ...common }] : [];
      });
      if (buttons.length) components.push({ type: 1, components: buttons });
    } else {
      const cid = o.customIdOf?.(r.id);
      if (!cid || !r.options.length) continue;
      components.push({ type: 1, components: [{
        type: 3, custom_id: cid, min_values: 1, max_values: 1, ...(r.placeholder ? { placeholder: r.placeholder } : {}), ...(r.disabled ? { disabled: true } : {}),
        options: r.options.map((op) => { const emoji = toPartialEmoji(op.emoji); return { label: op.label, value: op.id, ...(op.description ? { description: op.description } : {}), ...(emoji ? { emoji } : {}) }; }),
      }] });
    }
  }
  const parse: DiscordMessagePayload['allowed_mentions']['parse'] = [];
  if (m.mentions.users) parse.push('users');
  if (m.mentions.roles) parse.push('roles');
  if (m.mentions.everyone) parse.push('everyone');
  return { ...(m.content ? { content: m.content } : {}), embeds, components, allowed_mentions: { parse } };
}

/** Kurzbeschreibung für Historie und Versandstatus („Text · 2 Embeds · 3 Buttons“). */
export function mbSummary(m: MbMessage): string {
  const buttons = m.rows.reduce((n, r) => n + (r.type === 'buttons' ? r.buttons.length : 0), 0);
  const selects = m.rows.filter((r) => r.type === 'select').length;
  const parts = [m.content.trim() ? 'Text' : '', m.embeds.length ? `${m.embeds.length} Embed${m.embeds.length > 1 ? 's' : ''}` : '', buttons ? `${buttons} Button${buttons > 1 ? 's' : ''}` : '', selects ? `${selects} Auswahlmenü${selects > 1 ? 's' : ''}` : ''].filter(Boolean);
  return parts.join(' · ') || 'leer';
}

/** Interaktive Komponenten einer Nachricht (Button-ID bzw. Menü-ID → Aktion(en)), für die beim Versand Aktionen angelegt werden. */
export type MbInteractive = { componentId: string; kind: 'button'; action: MbAction } | { componentId: string; kind: 'select'; options: Record<string, MbAction> };
export function interactiveComponents(m: MbMessage): MbInteractive[] {
  return m.rows.flatMap((r): MbInteractive[] => r.type === 'buttons'
    ? r.buttons.filter((b) => b.kind === 'action').map((b) => ({ componentId: b.id, kind: 'button', action: b.action }))
    : [{ componentId: r.id, kind: 'select', options: Object.fromEntries(r.options.map((op) => [op.id, op.action])) }]);
}

export const MB_DEFAULT_CATEGORIES = ['Allgemein', 'Polizei', 'Leitstelle', 'Dienstantritt', 'Dienstende', 'Einsatzmeldung', 'Personalinformation', 'Ankündigung', 'Wartung', 'Sonstiges'] as const;

/** Rechte des Bots im Kanal, die zum Senden gebraucht werden (meldet der Bot im Kanalverzeichnis). */
export interface MbChannelBotPerms { view: boolean; send: boolean; embed: boolean; mentionEveryone?: boolean; sendInThreads?: boolean }
/** Fehlende Bot-Rechte für eine Nachrichtengruppe (leer = alles da). */
export function missingBotPerms(p: MbChannelBotPerms, d: MbDocumentData): string[] {
  const miss: string[] = [];
  if (!p.view) miss.push('Kanal ansehen');
  if (!p.send) miss.push('Nachrichten senden');
  if (!p.embed && d.messages.some((m) => m.embeds.length)) miss.push('Links einbetten');
  if (p.mentionEveryone === false && d.messages.some((m) => m.mentions.everyone && /@(everyone|here)/.test(m.content))) miss.push('@everyone, @here und alle Rollen erwähnen');
  return miss;
}

/** Discord-Fehler (JSON-Fehlercode der API bzw. HTTP-Status) verständlich auf Deutsch – ohne Token/URLs. */
const DISCORD_ERRORS: Record<number, string> = {
  10003: 'Den Kanal gibt es nicht (mehr).',
  10008: 'Die Nachricht gibt es nicht (mehr).',
  10015: 'Den Webhook gibt es nicht mehr – in den Webhook-Einstellungen entfernen oder neu anlegen.',
  20016: 'Langsamer Modus im Kanal aktiv – später erneut senden.',
  40005: 'Die Nachricht ist zu groß.',
  50001: 'Der Bot hat keinen Zugriff auf diesen Kanal.',
  50006: 'Discord lehnt eine leere Nachricht ab.',
  50008: 'In diesen Kanaltyp kann nicht gesendet werden.',
  50013: 'Dem Bot fehlen Rechte in diesem Kanal (z. B. „Nachrichten senden“ oder „Links einbetten“).',
  50035: 'Discord hat Inhalte als ungültig abgelehnt.',
  50109: 'Ungültiges JSON.',
};
export function describeDiscordError(e: { status?: number; code?: number; message?: string }): string {
  const known = e.code !== undefined ? DISCORD_ERRORS[e.code] : undefined;
  const detail = (e.message ?? '').replace(/https?:\/\/\S+/g, '[URL]').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (e.status === 429) return 'Discord-Anfragelimit erreicht – bitte kurz warten und erneut senden.';
  if (known) return e.code === 50035 && detail ? `${known.slice(0, -1)} (${detail.replace(/\.$/, '')}).` : known;
  if (e.status === 401 || e.status === 403) return `Discord verweigert den Zugriff${detail ? ` (${detail})` : ''}.`;
  if (e.status && e.status >= 500) return 'Discord ist gerade nicht erreichbar (Serverfehler) – später erneut versuchen.';
  return detail || 'Unbekannter Discord-Fehler.';
}
