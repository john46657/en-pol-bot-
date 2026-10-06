import { BotApiError, type Api } from '../api';
import { clip, COLORS, errorReply, okReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

// ---------------- Bewerbungen per Direktnachricht: Polizei-Bewerbung (/bewerbung, /bewerbungspanel) und Qualifikationen (SEK, Flugstaffel, Ausbilder … über /qualipanel) ----------------
export interface QualiUnit { key: string; name: string; description: string; questions: string[] }
export interface QualiConfig { title: string; intro: string; units: QualiUnit[] }
interface Question { text: string; key?: string; optional?: boolean; max: number }
interface Session { unit: string; unitName: string; questions: Question[]; answers: string[]; expiresAt: number }
type SendDm = (userId: string, m: { embed: EmbedData; buttons?: ButtonSpec[] }) => Promise<unknown>;
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
export const resetSessions = () => sessions.clear();
export const sweepSessions = (now = Date.now()) => { for (const [k, s] of sessions) if (s.expiresAt <= now) sessions.delete(k); };

const CANCEL: ButtonSpec = { id: 'quali:cancel', label: 'Bewerbung abbrechen', style: 'danger' };
const getConfig = (api: Api) => api.service<QualiConfig>('GET', '/bot/qualifications');
const questionEmbed = (s: Session): EmbedData => {
  const q = s.questions[s.answers.length]!;
  return { title: clip(s.unitName, 256), color: COLORS.info,
    description: clip(`**${s.answers.length + 1}/${s.questions.length}.** ${plain(q.text)}\n\n_Antworte einfach mit einer Nachricht hier im Chat.${q.optional ? ` Optional – schreibe „${SKIP}“, um die Frage zu überspringen.` : ''}_`, 4000) };
};

interface Flow { key: string; name: string; questions: Question[] }
/** Lädt Fragen einer Einheit bzw. der Polizei-Bewerbung (Formular aus dem System). */
async function loadFlow(api: Api, key: string | undefined): Promise<Flow | null> {
  if (!key) return null;
  if (key === POLICE) {
    const form = await api.service<{ key: string; label: string; required: boolean; maxLength: number }[]>('GET', '/applications/form');
    return { key, name: POLICE_NAME, questions: [{ text: 'Wie ist dein Roblox-Benutzername?', key: 'roblox', max: 20 }, ...form.map((f) => ({ text: f.label, key: f.key, optional: !f.required, max: Math.min(f.maxLength, 2000) }))] };
  }
  const unit = (await getConfig(api)).units.find((u) => u.key === key);
  return unit ? { key: unit.key, name: unit.name, questions: unit.questions.map((text) => ({ text, max: MAX_ANSWER })) } : null;
}
async function openApplication(api: Api, key: string, discordId: string) {
  return key === POLICE
    ? api.service<{ open: boolean; number: string | null }>('GET', `/bot/application/open?discordId=${discordId}`)
    : api.service<{ open: boolean; number: string | null }>('GET', `/bot/qualifications/open?discordId=${discordId}&unit=${encodeURIComponent(key)}`);
}
async function submitSession(api: Api, s: Session, userId: string, userName: string, robloxLookup?: RobloxLookup): Promise<string> {
  if (s.unit === POLICE) {
    const roblox = s.answers[0]!.trim();
    const rb = await robloxLookup?.(roblox).catch(() => null);
    const answers = Object.fromEntries(s.questions.slice(1).flatMap((q, i) => { const a = s.answers[i + 1]!; return q.optional && a === SKIP ? [] : [[q.key!, a]]; }));
    return (await api.service<{ number: string }>('POST', '/bot/application', { robloxUsername: rb?.name ?? roblox, ...(rb ? { robloxUserId: String(rb.id) } : {}), discordId: userId, answers })).number;
  }
  return (await api.service<{ number: string }>('POST', '/bot/qualifications/applications', { unit: s.unit, discordId: userId, discordName: userName, answers: s.questions.map((q, i) => ({ question: q.text, answer: s.answers[i] })) })).number;
}

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
      try { await c.platform.postPanel({ channelId: c.channelId, embed: POLICE_PANEL, buttons: [{ id: `quali:pick:${POLICE}`, label: 'Jetzt bewerben', emoji: '📋', style: 'primary' }] }); }
      catch { return errorReply('Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Channel?).'); }
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
  const text = a.content.trim();
  if (!text) { await say('Bitte antworte mit Text.', COLORS.warning, [CANCEL]); return; }
  const max = s.questions[s.answers.length]!.max;
  if (text.length > max) { await say(`Deine Antwort ist zu lang (${text.length} Zeichen, höchstens ${max}). Bitte kürzer fassen.`, COLORS.warning, [CANCEL]); return; }
  s.answers.push(text);
  if (s.answers.length < s.questions.length) { await a.sendDm(a.userId, { embed: questionEmbed(s), buttons: [CANCEL] }); return; }
  try {
    const number = await submitSession(a.api, s, a.userId, a.userName, a.robloxLookup);
    sessions.delete(a.userId);
    await say(`✅ Deine Bewerbung **${number}** ist eingegangen! Das Team prüft sie – die Entscheidung bekommst du hier per Direktnachricht.`, COLORS.success);
  } catch (e) {
    if (e instanceof BotApiError && (e.status === 409 || e.status === 400 || e.status === 404)) {
      sessions.delete(a.userId);
      await say(e.status === 409 ? 'Du hast hierfür bereits eine offene Bewerbung. Bitte warte auf die Entscheidung.' : 'Die Fragen wurden inzwischen geändert. Bitte starte die Bewerbung neu.', COLORS.warning);
      return;
    }
    s.answers.pop(); // letzte Antwort erneut senden = erneuter Versuch
    await say('⚠️ Deine Bewerbung konnte gerade nicht gespeichert werden (System nicht erreichbar). Schicke deine **letzte Antwort** gleich noch einmal, um es erneut zu versuchen.', COLORS.warning, [CANCEL]);
  }
}

export const QUALI_INTERACTION: InteractionDef = {
  prefix: 'quali',
  async run(c): Promise<Reply> {
    const [action, ...rest] = c.args;
    try {
      if (action === 'cancel') {
        const had = sessions.delete(c.discordId);
        return okReply(had ? 'Bewerbung abgebrochen. Du kannst jederzeit über das Panel neu starten.' : 'Es läuft keine Bewerbung.');
      }
      if (action === 'decide') {
        const [id, status] = rest;
        if (!id || (status !== 'ACCEPTED' && status !== 'REJECTED')) return errorReply('Unbekannte Aktion.');
        const r = await c.api.asUser<{ number: string; unitName: string; addedToSek?: boolean }>(c.discordId, 'POST', `/qualifications/applications/${id}/decision`, { status });
        return okReply(`Bewerbung **${r.number}** (${plain(r.unitName)}) ${status === 'ACCEPTED' ? '**angenommen**' : '**abgelehnt**'}. Die Person wird per Direktnachricht informiert${status === 'ACCEPTED' ? ' (und bekommt ggf. die Rolle)' : ''}.${r.addedToSek ? ' Außerdem ins SEK aufgenommen.' : ''}`);
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
      const s: Session = { unit: flow.key, unitName: flow.name, questions: flow.questions, answers: [], expiresAt: Date.now() + APPLICATION_MS };
      sessions.set(c.discordId, s);
      try { await c.platform.sendDm(c.discordId, { embed: questionEmbed(s), buttons: [CANCEL] }); }
      catch { sessions.delete(c.discordId); return errorReply('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten und versuche es erneut.'); }
      return okReply('Los geht’s – beantworte die Fragen einfach hier im Chat.');
    } catch (e) {
      if (e instanceof BotApiError && e.status === 409) return errorReply('Über diese Bewerbung wurde bereits entschieden.');
      return mapError(e);
    }
  },
};
