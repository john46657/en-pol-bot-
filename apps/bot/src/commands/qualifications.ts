import { checkAnswer, normalizeField, type Field, type FormField } from '@enrp/shared';
import { BotApiError, type Api } from '../api';
import { clip, COLORS, errorReply, okReply, plain, type ButtonSpec, type EmbedData, type Reply, type SelectSpec } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

// ---------------- Bewerbungen per Direktnachricht: Polizei-Bewerbung (/bewerbung, /bewerbungspanel) und Qualifikationen (SEK, Flugstaffel, Ausbilder … über /qualipanel) ----------------
export interface QualiUnit { key: string; name: string; description: string; questions: (string | FormField)[] }
export interface QualiConfig { title: string; intro: string; units: QualiUnit[]; police?: { title: string; description: string } }
interface Question { text: string; key?: string; field: Field }
/** Antworten: Text, gewählte Optionen (Auswahl/Rollen) oder `null` (übersprungen). */
type Answer = string | string[] | null;
interface Session { unit: string; unitName: string; questions: Question[]; answers: Answer[]; expiresAt: number; startedAt: number; joinedAt?: string }
type SendDm = (userId: string, m: { embed: EmbedData; buttons?: ButtonSpec[]; select?: SelectSpec }) => Promise<unknown>;
type RobloxLookup = (name: string) => Promise<{ id: number; name: string } | null>;

/** Pseudo-Einheit für die normale Bewerbung bei EN Polizei (kann nicht mit konfigurierten Einheiten kollidieren). */
export const POLICE = '@polizei';
const POLICE_NAME = 'Bewerbung – EN Polizei';
const SKIP = '-';

/** Zeit für eine Bewerbung (wie bei Appy: 3 Stunden). */
export const APPLICATION_MS = 3 * 60 * 60_000;
export const MAX_ANSWER = 1000;
/** Laufende Bewerbungen im Speicher des Bots (ein Neustart des Bots bricht sie ab – dann einfach neu starten). */
const sessions = new Map<string, Session>();
/** Server-Beitritt aus der Auswahl im Server (die eigentliche Bewerbung läuft per DM, dort ist er unbekannt). */
const joinedAtOf = new Map<string, string>();
export const resetSessions = () => { sessions.clear(); joinedAtOf.clear(); };
export const sweepSessions = (now = Date.now()) => { for (const [k, s] of sessions) if (s.expiresAt <= now) sessions.delete(k); };

const CANCEL: ButtonSpec = { id: 'quali:cancel', label: 'Bewerbung abbrechen', style: 'danger' };
const getConfig = (api: Api) => api.service<QualiConfig>('GET', '/bot/qualifications');
const field = (f: FormField): Field => { const n = normalizeField(f); return { ...n, maxLength: Math.min(n.maxLength, 2000) }; };
const asField = (q: string | FormField, i: number): FormField => (typeof q === 'string' ? { key: `q${i + 1}`, label: q, required: true, maxLength: MAX_ANSWER } : q);
/** Aktuelle Frage: Text → Antwort per Nachricht; Auswahl/Rollen → Menü (+ „Überspringen“, falls optional). */
const questionMessage = (s: Session): { embed: EmbedData; buttons: ButtonSpec[]; select?: SelectSpec } => {
  const i = s.answers.length;
  const q = s.questions[i]!;
  const f = q.field;
  const head = `**${i + 1}/${s.questions.length}.** ${plain(q.text)}`;
  if (f.type === 'TEXT') {
    const hints = [f.minLength ? `mindestens ${f.minLength} Zeichen` : '', !f.required ? `optional – schreibe „${SKIP}“, um zu überspringen` : ''].filter(Boolean).join(' · ');
    return { embed: { title: clip(s.unitName, 256), color: COLORS.info, description: clip(`${head}\n\n_Antworte einfach mit einer Nachricht hier im Chat.${hints ? ` (${hints})` : ''}_`, 4000) }, buttons: [CANCEL] };
  }
  return {
    embed: { title: clip(s.unitName, 256), color: COLORS.info, description: clip(`${head}\n\n_Wähle unten ${f.multiple ? 'eine oder mehrere Optionen' : 'eine Option'} aus.${f.required ? '' : ' Optional.'}_`, 4000) },
    select: { id: `quali:ans:${i}`, placeholder: f.multiple ? 'Optionen wählen …' : 'Option wählen …', min: 1, max: f.multiple ? f.options.length : 1, options: f.options.map((o, j) => ({ label: clip(o.label, 100), value: String(j) })) },
    buttons: [...(f.required ? [] : [{ id: `quali:skip:${i}`, label: 'Überspringen', style: 'secondary' as const }]), CANCEL],
  };
};
const answerText = (a: Answer) => (a === null ? '— (übersprungen)' : Array.isArray(a) ? a.join(', ') : a);

interface Flow { key: string; name: string; questions: Question[] }
/** Lädt Fragen einer Einheit bzw. der Polizei-Bewerbung (Formular aus dem System). */
async function loadFlow(api: Api, key: string | undefined): Promise<Flow | null> {
  if (!key) return null;
  if (key === POLICE) {
    const form = await api.service<FormField[]>('GET', '/applications/form');
    return { key, name: POLICE_NAME, questions: [{ text: 'Wie ist dein Roblox-Benutzername?', key: 'roblox', field: field({ key: 'roblox', label: 'Roblox', required: true, maxLength: 20 }) }, ...form.map((f) => ({ text: f.label, key: f.key, field: field(f) }))] };
  }
  const unit = (await getConfig(api)).units.find((u) => u.key === key);
  return unit ? { key: unit.key, name: unit.name, questions: unit.questions.map(asField).map((f) => ({ text: f.label, key: f.key, field: field(f) })) } : null;
}
async function openApplication(api: Api, key: string, discordId: string) {
  return key === POLICE
    ? api.service<{ open: boolean; number: string | null }>('GET', `/bot/application/open?discordId=${discordId}`)
    : api.service<{ open: boolean; number: string | null }>('GET', `/bot/qualifications/open?discordId=${discordId}&unit=${encodeURIComponent(key)}`);
}
async function submitSession(api: Api, s: Session, userId: string, userName: string, robloxLookup?: RobloxLookup, now = Date.now()): Promise<string> {
  const meta = { durationSec: Math.max(0, Math.round((now - s.startedAt) / 1000)), ...(s.joinedAt ? { joinedAt: s.joinedAt } : {}) };
  if (s.unit === POLICE) {
    const roblox = String(s.answers[0] ?? '').trim();
    const rb = await robloxLookup?.(roblox).catch(() => null);
    const answers = Object.fromEntries(s.questions.slice(1).flatMap((q, i) => { const a = s.answers[i + 1]; return a === null || a === undefined ? [] : [[q.key!, a]]; }));
    return (await api.service<{ number: string }>('POST', '/bot/application', { robloxUsername: rb?.name ?? roblox, ...(rb ? { robloxUserId: String(rb.id) } : {}), discordId: userId, discordName: userName, answers, ...meta })).number;
  }
  return (await api.service<{ number: string }>('POST', '/bot/qualifications/applications', { unit: s.unit, discordId: userId, discordName: userName, answers: s.questions.map((q, i) => ({ question: q.text, answer: s.answers[i] ?? null })), ...meta })).number;
}

/** Fallback, falls das System die Panel-Texte nicht liefert (Texte: Web → Qualifications → Setup). */
const POLICE_PANEL: EmbedData = { title: '📋 Bewerbung bei EN Polizei', color: COLORS.info, description: 'Du möchtest Teil der **EN Polizei** werden? Klicke auf **Jetzt bewerben** – der Bot stellt dir die Fragen nacheinander per **Direktnachricht**.\n\nDu brauchst deinen **Roblox-Namen** und etwa 10 Minuten Zeit. Die Entscheidung bekommst du ebenfalls per Direktnachricht.' };

/** Schritt 1 (Panel-Auswahl, Button oder /bewerbung): Bestätigung per DM mit Start/Abbrechen, im Channel „Zur Bewerbung“. */
async function offer(c: Ctx, key: string | undefined): Promise<Reply> {
  const running = sessions.get(c.discordId);
  if (running && running.expiresAt > Date.now()) return errorReply(`Du hast bereits eine laufende Bewerbung (**${plain(running.unitName)}**) in deinen Direktnachrichten. Beende oder brich sie dort zuerst ab.`);
  const flow = await loadFlow(c.api, key);
  if (!flow) return errorReply('Diese Auswahl gibt es nicht mehr. Bitte das Panel neu laden.');
  const open = await openApplication(c.api, flow.key, c.discordId);
  if (open.open) return errorReply(`Du hast für **${plain(flow.name)}** bereits eine offene Bewerbung (${open.number}). Bitte warte auf die Entscheidung.`);
  if (!c.platform) return errorReply('Direktnachrichten sind hier nicht verfügbar.');
  if (c.memberJoinedAt) joinedAtOf.set(c.discordId, c.memberJoinedAt);
  let dm: { channelId: string; messageId: string };
  try {
    dm = await c.platform.sendDm(c.discordId, {
      embed: { title: clip(flow.name, 256), color: COLORS.info, description: `Bist du sicher, dass du dich bewerben möchtest?\n\nSobald du startest, schicke ich dir nacheinander **${flow.questions.length} Fragen**. Du hast **3 Stunden** Zeit, die Bewerbung abzuschließen – sonst musst du neu starten. Abbrechen kannst du jederzeit über den Button.` },
      buttons: [{ id: `quali:start:${flow.key}`, label: 'Bewerbung starten', style: 'success' }, { id: 'quali:cancel', label: 'Abbrechen', style: 'danger' }],
    });
  } catch {
    return errorReply('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten von Servermitgliedern (Server-Menü → Privatsphäre-Einstellungen) und versuche es erneut.');
  }
  return { ephemeral: true, embeds: [{ title: 'Bewerbung gestartet', description: 'Die Bewerbung wurde in deinen **Direktnachrichten** gestartet!', color: COLORS.success }], buttons: [{ id: 'quali:link', label: 'Zur Bewerbung', style: 'secondary', url: `https://discord.com/channels/@me/${dm.channelId}/${dm.messageId}` }] };
}

export function panelEmbed(cfg: QualiConfig): EmbedData {
  const parts = [cfg.intro, ...cfg.units.map((u) => `**__${plain(u.name)}:__**\n${u.description}`)].filter(Boolean);
  return { title: clip(cfg.title, 256), color: COLORS.info, description: clip(parts.join('\n\n'), 4000) };
}

export const QUALI_COMMANDS: CommandDef[] = [
  {
    name: 'bewerbung', description: 'Bewirb dich bei EN Polizei (Fragen per Direktnachricht)',
    async run(c) { try { return await offer(c, POLICE); } catch (e) { return mapError(e); } },
  },
  {
    name: 'bewerbungspanel', description: 'Postet das Bewerbungs-Panel („Jetzt bewerben“) in diesen Channel',
    async run(c) {
      if (!c.guildId) return errorReply('Das geht nur auf einem Server, nicht per Direktnachricht.');
      if (!c.isGuildAdmin) return errorReply('Dafür brauchst du auf diesem Discord-Server das Recht „Server verwalten“.');
      if (!c.channelId || !c.platform) return errorReply('Panel kann hier nicht gepostet werden.');
      try {
        const police = (await getConfig(c.api).catch(() => undefined))?.police;
        const embed = police ? { title: clip(police.title, 256), color: COLORS.info, description: clip(police.description, 4000) } : POLICE_PANEL;
        await c.platform.postPanel({ channelId: c.channelId, embed, buttons: [{ id: `quali:pick:${POLICE}`, label: 'Jetzt bewerben', emoji: '📋', style: 'primary' }] });
      } catch { return errorReply('Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Channel?).'); }
      return okReply('Bewerbungs-Panel gepostet. Neue Bewerbungen erscheinen im System unter *Applications* (und im Applications-Channel, falls eingestellt).');
    },
  },
  {
    name: 'qualipanel', description: 'Postet das Qualifikations-Panel (SEK, Flugstaffel, Ausbilder …) in diesen Channel',
    async run(c) {
      if (!c.guildId) return errorReply('Das geht nur auf einem Server, nicht per Direktnachricht.');
      if (!c.isGuildAdmin) return errorReply('Dafür brauchst du auf diesem Discord-Server das Recht „Server verwalten“.');
      if (!c.channelId || !c.platform) return errorReply('Panel kann hier nicht gepostet werden.');
      try {
        const cfg = await getConfig(c.api);
        await c.platform.postPanel({ channelId: c.channelId, embed: panelEmbed(cfg), select: { id: 'quali:pick', placeholder: 'Triff eine Auswahl', options: cfg.units.map((u) => ({ label: clip(u.name, 100), value: u.key, ...(u.description ? { description: clip(plain(u.description).replace(/\*|_/g, ''), 100) } : {}) })) } });
        const ch = await c.config?.().catch(() => undefined);
        return okReply(`Qualifikations-Panel gepostet.${ch?.qualifications ? '' : ' Tipp: In den Einstellungen einen **Qualifications channel** hinterlegen – dort landen die Bewerbungen mit Annehmen/Ablehnen-Buttons.'}`);
      } catch (e) {
        if (e instanceof BotApiError) return mapError(e);
        return errorReply('Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Channel?).');
      }
    },
  },
];

/** Antwort auf eine Direktnachricht während einer laufenden Bewerbung. */
export async function handleDirectMessage(a: { userId: string; userName: string; content: string; api: Api; sendDm: SendDm; robloxLookup?: RobloxLookup; now?: number }): Promise<void> {
  const now = a.now ?? Date.now();
  const s = sessions.get(a.userId);
  const say = (description: string, color: number = COLORS.info, buttons?: ButtonSpec[]) => a.sendDm(a.userId, { embed: { title: s ? clip(s.unitName, 256) : 'Bewerbung', description, color }, buttons });
  if (!s) { await say('Du hast gerade keine laufende Bewerbung. Starte eine über das Bewerbungs- oder Qualifikations-Panel auf dem Server (oder mit `/bewerbung`).', COLORS.neutral); return; }
  if (s.expiresAt <= now) {
    sessions.delete(a.userId);
    await say('⏰ Die Zeit für deine Bewerbung ist abgelaufen (3 Stunden). Bitte starte sie über das Panel neu.', COLORS.warning);
    return;
  }
  const q = s.questions[s.answers.length]!;
  if (q.field.type !== 'TEXT') { await say('Bitte wähle die Antwort im **Menü** der letzten Frage aus.', COLORS.warning); await a.sendDm(a.userId, questionMessage(s)); return; }
  const text = a.content.trim();
  if (!text) { await say('Bitte antworte mit Text.', COLORS.warning, [CANCEL]); return; }
  if (!q.field.required && text === SKIP) s.answers.push(null);
  else {
    const r = checkAnswer(q.field, text);
    if (!r.ok) { await say(r.error, COLORS.warning, [CANCEL]); return; }
    s.answers.push(text);
  }
  await proceed({ api: a.api, userId: a.userId, userName: a.userName, sendDm: a.sendDm, robloxLookup: a.robloxLookup, now }, s);
}

/** Nächste Frage senden – oder nach der letzten Antwort einreichen. */
async function proceed(o: { api: Api; userId: string; userName: string; sendDm: SendDm; robloxLookup?: RobloxLookup; now: number }, s: Session): Promise<void> {
  const say = (description: string, color: number = COLORS.info, buttons?: ButtonSpec[]) => o.sendDm(o.userId, { embed: { title: clip(s.unitName, 256), description, color }, buttons });
  if (s.answers.length < s.questions.length) { await o.sendDm(o.userId, questionMessage(s)); return; }
  try {
    const number = await submitSession(o.api, s, o.userId, o.userName, o.robloxLookup, o.now);
    sessions.delete(o.userId);
    await say(`✅ Deine Bewerbung **${number}** ist eingegangen! Das Team prüft sie – die Entscheidung bekommst du hier per Direktnachricht.`, COLORS.success);
  } catch (e) {
    if (e instanceof BotApiError && (e.status === 409 || e.status === 400 || e.status === 404)) {
      sessions.delete(o.userId);
      await say(e.status === 409 ? 'Du hast hierfür bereits eine offene Bewerbung. Bitte warte auf die Entscheidung.' : 'Die Fragen wurden inzwischen geändert. Bitte starte die Bewerbung neu.', COLORS.warning);
      return;
    }
    const last = s.questions[s.answers.length - 1]!;
    s.answers.pop(); // letzte Antwort erneut = erneuter Versuch
    if (last.field.type === 'TEXT') await say('⚠️ Deine Bewerbung konnte gerade nicht gespeichert werden (System nicht erreichbar). Schicke deine **letzte Antwort** gleich noch einmal, um es erneut zu versuchen.', COLORS.warning, [CANCEL]);
    else { await say('⚠️ Deine Bewerbung konnte gerade nicht gespeichert werden (System nicht erreichbar). Wähle deine letzte Antwort gleich noch einmal aus.', COLORS.warning); await o.sendDm(o.userId, questionMessage(s)); }
  }
}

type Kind = 'q' | 'p';
const STATUS = new Set(['ACCEPTED', 'REJECTED']);
/** `quali:decide:<q|p>:<id>:<STATUS>` (alt: `quali:decide:<id>:<STATUS>` = Qualifikation). */
const parseDecision = (rest: string[]): { kind: Kind; id: string; status: 'ACCEPTED' | 'REJECTED' } | null => {
  const [kind, id, status] = rest.length === 2 ? ['q', rest[0], rest[1]] : rest;
  return (kind === 'q' || kind === 'p') && id && status && STATUS.has(status) ? { kind, id, status: status as 'ACCEPTED' | 'REJECTED' } : null;
};

/** Entscheidung als klickender Benutzer (Rechte im System); aktualisiert danach die Bewerbungs-Nachricht im Channel. */
async function decide(c: Ctx, d: { kind: Kind; id: string; status: 'ACCEPTED' | 'REJECTED' }, reason?: string): Promise<Reply> {
  const path = d.kind === 'p' ? `/applications/${d.id}/discord-decision` : `/qualifications/applications/${d.id}/decision`;
  const r = await c.api.asUser<{ number: string; unitName?: string; addedToSek?: boolean; decidedByName?: string | null }>(c.discordId, 'POST', path, { status: d.status, ...(reason ? { reason } : {}) });
  const accepted = d.status === 'ACCEPTED';
  const what = `Bewerbung **${r.number}**${r.unitName ? ` (${plain(r.unitName)})` : ''}`;
  return {
    ...okReply(`${what} ${accepted ? '**angenommen**' : '**abgelehnt**'}. Die Person wird per Direktnachricht informiert${accepted && d.kind === 'q' ? ' (und bekommt ggf. die Rolle)' : ''}.${r.addedToSek ? ' Außerdem ins SEK aufgenommen.' : ''}`),
    decided: { color: accepted ? COLORS.success : COLORS.danger, text: clip(`${accepted ? '✅ Angenommen' : '❌ Abgelehnt'} von <@${c.discordId}>${r.decidedByName ? ` (${plain(r.decidedByName)})` : ''}${reason ? `\n**Grund:** ${plain(reason)}` : ''}`, 1024) },
  };
}

const STATUS_DE: Record<string, string> = { OPEN: '🟡 offen', SUBMITTED: '🟡 eingereicht', SCREENING: '🟡 in Prüfung', INTERVIEW: '🟡 Gespräch', PENDING_DECISION: '🟡 Entscheidung offen', ACCEPTED: '✅ angenommen', REJECTED: '❌ abgelehnt', WITHDRAWN: '↩️ zurückgezogen' };
interface HistoryRow { number: string; unitName?: string; status: string; createdAt: string; decisionReason?: string | null }

export const QUALI_INTERACTION: InteractionDef = {
  prefix: 'quali',
  opensModal: (args) => args[0] === 'reason',
  async run(c): Promise<Reply> {
    const [action, ...rest] = c.args;
    try {
      if (action === 'reason') {
        const d = parseDecision(rest);
        if (!d) return errorReply('Unbekannte Aktion.');
        return { modal: { id: `quali:reasonsubmit:${d.kind}:${d.id}:${d.status}`, title: d.status === 'ACCEPTED' ? 'Annehmen mit Grund' : 'Ablehnen mit Grund', fields: [{ id: 'reason', label: 'Grund (geht per DM an die Person)', paragraph: true, required: true, maxLength: 1000 }] } };
      }
      if (action === 'reasonsubmit') {
        const d = parseDecision(rest);
        const reason = (c.fields?.reason ?? '').trim();
        if (!d || !reason) return errorReply('Bitte einen Grund angeben.');
        return await decide(c, d, reason);
      }
      if (action === 'history') {
        const id = rest[0] ?? '';
        if (!/^\d{15,25}$/.test(id)) return errorReply('Unbekannte Person.');
        const get = (path: string) => c.api.asUser<HistoryRow[]>(c.discordId, 'GET', path).then((x) => x, (e) => (e instanceof BotApiError && e.status === 403 ? null : Promise.reject(e)));
        const [quali, police] = await Promise.all([get(`/qualifications/history?discordId=${id}`), get(`/applications/history?discordId=${id}`)]);
        if (!quali && !police) return errorReply('Du hast keine Berechtigung, Bewerbungen anzusehen.');
        const rows = [...(police ?? []).map((r) => ({ ...r, unitName: 'EN Polizei' })), ...(quali ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        const lines = rows.slice(0, 20).map((r) => `• **${r.number}** · ${plain(r.unitName)} · ${STATUS_DE[r.status] ?? r.status} · <t:${Math.floor(Date.parse(r.createdAt) / 1000)}:d>${r.decisionReason ? `\n  ↳ ${clip(plain(r.decisionReason), 150)}` : ''}`);
        return { ephemeral: true, embeds: [{ title: '🗂️ Bewerbungs-Verlauf', color: COLORS.info, description: clip(`<@${id}>\n\n${lines.join('\n') || 'Keine Bewerbungen.'}`, 4000) }] };
      }
      if (action === 'ticket') {
        const [kind, id] = rest;
        if ((kind !== 'q' && kind !== 'p') || !id) return errorReply('Unbekannte Aktion.');
        if (!c.guildId || !c.platform) return errorReply('Das geht nur auf einem Server.');
        const a = await c.api.asUser<{ number: string; discordId: string | null; discordName?: string | null; robloxUsername?: string; unitName?: string }>(c.discordId, 'GET', kind === 'p' ? `/applications/${id}` : `/qualifications/applications/${id}`);
        if (!a.discordId) return errorReply('Diese Bewerbung kam nicht über Discord – es gibt keinen Discord-Benutzer für ein Ticket.');
        const cfg = await c.config?.().catch(() => undefined);
        let t: { channelId: string; existing: boolean };
        try { t = await c.platform.createTicketChannel({ guildId: c.guildId, userId: a.discordId, userName: a.discordName ?? a.robloxUsername ?? a.discordId, categoryId: cfg?.tickets, staffRoleId: cfg?.staffRole, extraUserIds: [c.discordId] }); }
        catch { return errorReply('Ticket konnte nicht angelegt werden (fehlen dem Bot die Rechte „Kanäle verwalten“, oder ist die Person nicht mehr auf dem Server?).'); }
        if (t.existing) return okReply(`Mit dieser Person gibt es schon ein offenes Ticket: <#${t.channelId}>`);
        await c.platform.postPanel({ channelId: t.channelId, embed: { title: `🎫 Ticket zur Bewerbung ${a.number}`, color: COLORS.info, description: `<@${a.discordId}>, das Team hat eine Rückfrage zu deiner Bewerbung **${a.number}**${a.unitName ? ` (${plain(a.unitName)})` : ''}. Bitte antworte hier.` }, buttons: [{ id: 'support:close', label: 'Ticket schließen', emoji: '🔒', style: 'danger' }] }).catch(() => undefined);
        return okReply(`Ticket geöffnet: <#${t.channelId}>`);
      }
      if (action === 'ans' || action === 'skip') {
        const s = sessions.get(c.discordId);
        if (!s || s.expiresAt <= Date.now()) return errorReply('Du hast gerade keine laufende Bewerbung. Starte sie über das Panel neu.');
        const i = Number(rest[0]);
        if (i !== s.answers.length) return errorReply('Diese Frage hast du schon beantwortet.');
        const q = s.questions[i]!;
        let value: Answer = null;
        if (action === 'skip') { if (q.field.required) return errorReply('Diese Frage ist eine Pflichtfrage.'); }
        else {
          const labels = (c.values ?? []).map((v) => q.field.options[Number(v)]?.label).filter((x): x is string => !!x);
          const r = checkAnswer(q.field, labels);
          if (!r.ok) return errorReply(r.error);
          value = labels;
        }
        if (!c.platform) return errorReply('Direktnachrichten sind hier nicht verfügbar.');
        s.answers.push(value);
        const platform = c.platform;
        await proceed({ api: c.api, userId: c.discordId, userName: c.userName ?? c.discordId, sendDm: (u, m) => platform.sendDm(u, m), robloxLookup: c.robloxLookup, now: Date.now() }, s);
        return { ...okReply('Gespeichert.'), update: { embeds: [{ title: clip(s.unitName, 256), color: COLORS.success, description: clip(`**${i + 1}/${s.questions.length}.** ${plain(q.text)}\n\n✅ ${plain(answerText(value))}`, 4000) }] } };
      }
      if (action === 'cancel') {
        const had = sessions.delete(c.discordId);
        return okReply(had ? 'Bewerbung abgebrochen. Du kannst jederzeit über das Panel neu starten.' : 'Es läuft keine Bewerbung.');
      }
      if (action === 'decide') {
        const d = parseDecision(rest);
        return d ? await decide(c, d) : errorReply('Unbekannte Aktion.');
      }
      if (action === 'pick') return await offer(c, c.values?.[0] ?? rest[0]);
      if (action !== 'start') return errorReply('Unbekannte Aktion.');
      const running = sessions.get(c.discordId);
      if (running && running.expiresAt > Date.now()) {
        if (running.unit === rest[0]) return okReply(`Deine Bewerbung läuft bereits – Frage ${running.answers.length + 1}/${running.questions.length}: ${plain(running.questions[running.answers.length]!.text)}`);
        return errorReply(`Du hast bereits eine laufende Bewerbung (**${plain(running.unitName)}**). Beende oder brich sie zuerst ab.`);
      }
      const flow = await loadFlow(c.api, rest[0]);
      if (!flow) return errorReply('Diese Auswahl gibt es nicht mehr. Bitte das Panel neu laden.');
      const open = await openApplication(c.api, flow.key, c.discordId);
      if (open.open) return errorReply(`Du hast für **${plain(flow.name)}** bereits eine offene Bewerbung (${open.number}). Bitte warte auf die Entscheidung.`);
      if (!c.platform) return errorReply('Direktnachrichten sind hier nicht verfügbar.');
      const s: Session = { unit: flow.key, unitName: flow.name, questions: flow.questions, answers: [], startedAt: Date.now(), expiresAt: Date.now() + APPLICATION_MS, joinedAt: joinedAtOf.get(c.discordId) };
      sessions.set(c.discordId, s);
      try { await c.platform.sendDm(c.discordId, questionMessage(s)); }
      catch { sessions.delete(c.discordId); return errorReply('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten und versuche es erneut.'); }
      return okReply('Los geht’s – beantworte die Fragen einfach hier im Chat.');
    } catch (e) {
      if (e instanceof BotApiError && e.status === 409) return errorReply('Über diese Bewerbung wurde bereits entschieden.');
      return mapError(e);
    }
  },
};
