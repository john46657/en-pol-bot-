import { BotApiError, type Api } from '../api';
import { clip, COLORS, errorReply, okReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import type { CommandDef, InteractionDef } from './types';
import { mapError } from './errors';

// ---------------- Qualifikationen (SEK, Flugstaffel, Ausbilder …): Panel → Fragen per Direktnachricht ----------------
export interface QualiUnit { key: string; name: string; description: string; questions: string[] }
export interface QualiConfig { title: string; intro: string; units: QualiUnit[] }
interface Session { unit: string; unitName: string; questions: string[]; answers: string[]; expiresAt: number }
type SendDm = (userId: string, m: { embed: EmbedData; buttons?: ButtonSpec[] }) => Promise<unknown>;

/** Zeit für eine Bewerbung (wie bei Appy: 3 Stunden). */
export const APPLICATION_MS = 3 * 60 * 60_000;
export const MAX_ANSWER = 1000;
/** Laufende Bewerbungen im Speicher des Bots (ein Neustart des Bots bricht sie ab – dann einfach neu starten). */
const sessions = new Map<string, Session>();
export const resetSessions = () => sessions.clear();
export const sweepSessions = (now = Date.now()) => { for (const [k, s] of sessions) if (s.expiresAt <= now) sessions.delete(k); };

const CANCEL: ButtonSpec = { id: 'quali:cancel', label: 'Bewerbung abbrechen', style: 'danger' };
const getConfig = (api: Api) => api.service<QualiConfig>('GET', '/bot/qualifications');
const questionEmbed = (s: Session): EmbedData => ({
  title: clip(s.unitName, 256), color: COLORS.info,
  description: clip(`**${s.answers.length + 1}/${s.questions.length}.** ${plain(s.questions[s.answers.length])}\n\n_Antworte einfach mit einer Nachricht hier im Chat._`, 4000),
});

export function panelEmbed(cfg: QualiConfig): EmbedData {
  const parts = [cfg.intro, ...cfg.units.map((u) => `**__${plain(u.name)}:__**\n${u.description}`)].filter(Boolean);
  return { title: clip(cfg.title, 256), color: COLORS.info, description: clip(parts.join('\n\n'), 4000) };
}

export const QUALI_COMMANDS: CommandDef[] = [
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
export async function handleDirectMessage(a: { userId: string; userName: string; content: string; api: Api; sendDm: SendDm; now?: number }): Promise<void> {
  const now = a.now ?? Date.now();
  const s = sessions.get(a.userId);
  const say = (description: string, color: number = COLORS.info, buttons?: ButtonSpec[]) => a.sendDm(a.userId, { embed: { title: s ? clip(s.unitName, 256) : 'Bewerbung', description, color }, buttons });
  if (!s) { await say('Du hast gerade keine laufende Bewerbung. Starte eine über das **Qualifikations-Panel** auf dem Server.', COLORS.neutral); return; }
  if (s.expiresAt <= now) {
    sessions.delete(a.userId);
    await say('⏰ Die Zeit für deine Bewerbung ist abgelaufen (3 Stunden). Bitte starte sie über das Panel neu.', COLORS.warning);
    return;
  }
  const text = a.content.trim();
  if (!text) { await say('Bitte antworte mit Text.', COLORS.warning, [CANCEL]); return; }
  if (text.length > MAX_ANSWER) { await say(`Deine Antwort ist zu lang (${text.length} Zeichen, höchstens ${MAX_ANSWER}). Bitte kürzer fassen.`, COLORS.warning, [CANCEL]); return; }
  s.answers.push(text);
  if (s.answers.length < s.questions.length) { await a.sendDm(a.userId, { embed: questionEmbed(s), buttons: [CANCEL] }); return; }
  try {
    const r = await a.api.service<{ number: string }>('POST', '/bot/qualifications/applications', { unit: s.unit, discordId: a.userId, discordName: a.userName, answers: s.questions.map((question, i) => ({ question, answer: s.answers[i] })) });
    sessions.delete(a.userId);
    await say(`✅ Deine Bewerbung **${r.number}** ist eingegangen! Das Team prüft sie – die Entscheidung bekommst du hier per Direktnachricht.`, COLORS.success);
  } catch (e) {
    if (e instanceof BotApiError && (e.status === 409 || e.status === 400 || e.status === 404)) {
      sessions.delete(a.userId);
      await say(e.status === 409 ? 'Du hast für diese Einheit bereits eine offene Bewerbung. Bitte warte auf die Entscheidung.' : 'Die Fragen wurden inzwischen geändert. Bitte starte die Bewerbung über das Panel neu.', COLORS.warning);
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
      if (action !== 'pick' && action !== 'start') return errorReply('Unbekannte Aktion.');
      const key = action === 'pick' ? c.values?.[0] : rest[0];
      const running = sessions.get(c.discordId);
      if (running && running.expiresAt > Date.now()) {
        if (action === 'start' && running.unit === key) return okReply(`Deine Bewerbung läuft bereits – Frage ${running.answers.length + 1}/${running.questions.length}: ${plain(running.questions[running.answers.length])}`);
        return errorReply(`Du hast bereits eine laufende Bewerbung (**${plain(running.unitName)}**) in deinen Direktnachrichten. Beende oder brich sie dort zuerst ab.`);
      }
      const unit = (await getConfig(c.api)).units.find((u) => u.key === key);
      if (!unit) return errorReply('Diese Auswahl gibt es nicht mehr. Bitte das Panel neu laden.');
      const open = await c.api.service<{ open: boolean; number: string | null }>('GET', `/bot/qualifications/open?discordId=${c.discordId}&unit=${encodeURIComponent(unit.key)}`);
      if (open.open) return errorReply(`Du hast für **${plain(unit.name)}** bereits eine offene Bewerbung (${open.number}). Bitte warte auf die Entscheidung.`);
      if (!c.platform) return errorReply('Direktnachrichten sind hier nicht verfügbar.');

      if (action === 'pick') {
        let dm: { channelId: string; messageId: string };
        try {
          dm = await c.platform.sendDm(c.discordId, {
            embed: { title: clip(unit.name, 256), color: COLORS.info, description: `Bist du sicher, dass du dich bewerben möchtest?\n\nSobald du startest, schicke ich dir nacheinander **${unit.questions.length} Fragen**. Du hast **3 Stunden** Zeit, die Bewerbung abzuschließen – sonst musst du neu starten. Abbrechen kannst du jederzeit über den Button.` },
            buttons: [{ id: `quali:start:${unit.key}`, label: 'Bewerbung starten', style: 'success' }, { id: 'quali:cancel', label: 'Abbrechen', style: 'danger' }],
          });
        } catch {
          return errorReply('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten von Servermitgliedern (Server-Menü → Privatsphäre-Einstellungen) und wähle erneut.');
        }
        return { ephemeral: true, embeds: [{ title: 'Bewerbung gestartet', description: 'Die Bewerbung wurde in deinen **Direktnachrichten** gestartet!', color: COLORS.success }], buttons: [{ id: 'quali:link', label: 'Zur Bewerbung', style: 'secondary', url: `https://discord.com/channels/@me/${dm.channelId}/${dm.messageId}` }] };
      }
      const s: Session = { unit: unit.key, unitName: unit.name, questions: unit.questions, answers: [], expiresAt: Date.now() + APPLICATION_MS };
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
