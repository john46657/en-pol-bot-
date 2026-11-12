import { checkAnswer, clip, formatMinutes, normalizeQuestion, plain, renderText } from '../forms.js';
import { AppError } from '../service.js';
import { button, COLORS, row, simple } from './messages.js';

const CANCEL_WORD = 'abbrechen';
const SKIP = '-';

/**
 * Bewerbung per Direktnachricht: Bestätigung → Fragen einzeln → Einreichen.
 * Laufende Bewerbungen liegen im Speicher (ein Neustart bricht sie ab – dann einfach neu starten).
 */
export class DmFlow {
  /** `send(userId, payload)` schickt eine DM und liefert { channelId, messageId }. */
  constructor({ service, store, send, roblox, webLink, log = console }) {
    this.service = service; this.store = store; this.send = send; this.roblox = roblox; this.webLink = webLink; this.log = log;
    this.sessions = new Map();
    /** Server-Beitritt aus dem Panel-Klick (in der DM unbekannt). */
    this.joined = new Map();
  }

  sweep(now = Date.now()) { for (const [k, s] of this.sessions) if (s.expiresAt <= now) this.sessions.delete(k); }

  report(s) {
    this.store.saveProgress({ guildId: s.guildId, userId: s.userId, userName: s.userName, type: s.type.key, typeName: s.type.name, source: 'DM', answered: s.answers.length, total: s.questions.length, startedAt: new Date(s.startedAt).toISOString(), expiresAt: new Date(s.expiresAt).toISOString() });
  }

  /** Panel-Klick / `/bewerbung`: Vorabprüfung, dann Bestätigung per DM (oder Link zum Browser-Formular). Antwort = ephemere Nachricht. */
  async offer({ guildId, typeKey, user, memberRoles, joinedAt }) {
    const running = this.sessions.get(user.id);
    if (running && running.expiresAt > Date.now()) return simple(`Du hast bereits eine laufende Bewerbung (**${plain(running.type.name)}**) in deinen Direktnachrichten. Beende oder brich sie dort zuerst ab.`, COLORS.danger);
    const blocked = this.service.preCheck(guildId, typeKey, { userId: user.id, memberRoles });
    if (blocked) return simple(blocked, COLORS.danger);
    const t = this.service.type(guildId, typeKey);
    if (joinedAt) this.joined.set(user.id, joinedAt);
    if (t.mode === 'WEB') {
      const l = this.webLink({ guildId, type: t, user, joinedAt });
      this.store.saveProgress({ guildId, userId: user.id, userName: user.name, type: t.key, typeName: t.name, source: 'WEB', answered: null, total: t.questions.length, expiresAt: l.expiresAt });
      return { embeds: [{ title: clip(t.name, 256), color: COLORS.info, description: `Deine Bewerbung füllst du im **Browser** aus. Der Link gilt nur für dich und ist **${formatMinutes(t.timeLimitMinutes)}** gültig – teile ihn mit niemandem.` }], components: [row(button(null, 'Bewerbung öffnen', 'link', '📝', l.url))] };
    }
    let dm;
    try {
      dm = await this.send(user.id, {
        embeds: [{ title: clip(t.name, 256), color: COLORS.info, description: clip(renderText(t.messages.confirmation, { '{questionCount}': String(t.questions.length), '{timeLimit}': formatMinutes(t.timeLimitMinutes), '{applicationName}': t.name }), 4000) }],
        components: [row(button(`app:start:${guildId}:${t.key}`, 'Bewerbung starten', 'success'), button('app:cancel', 'Abbrechen', 'danger'))],
      });
    } catch {
      return simple('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten von Servermitgliedern (Server-Menü → Privatsphäre-Einstellungen) und versuche es erneut.', COLORS.danger);
    }
    return { embeds: [{ title: 'Bewerbung gestartet', description: 'Die Bewerbung wurde in deinen **Direktnachrichten** gestartet!', color: COLORS.success }], components: [row(button(null, 'Zur Bewerbung', 'link', undefined, `https://discord.com/channels/@me/${dm.channelId}/${dm.messageId}`))] };
  }

  /** Button „Bewerbung starten“ in der DM. */
  async start({ guildId, typeKey, user }) {
    const running = this.sessions.get(user.id);
    if (running && running.expiresAt > Date.now()) {
      if (running.type.key === typeKey && running.guildId === guildId) return simple(`Deine Bewerbung läuft bereits – Frage ${running.answers.length + 1}/${running.questions.length}.`);
      return simple(`Du hast bereits eine laufende Bewerbung (**${plain(running.type.name)}**). Beende oder brich sie zuerst ab.`, COLORS.danger);
    }
    const blocked = this.service.preCheck(guildId, typeKey, { userId: user.id });
    if (blocked) return simple(blocked, COLORS.danger);
    const t = this.service.type(guildId, typeKey);
    const now = Date.now();
    const s = { guildId, userId: user.id, userName: user.name, avatar: user.avatar ?? null, type: t, questions: t.questions.map(normalizeQuestion), answers: [], startedAt: now, expiresAt: now + t.timeLimitMinutes * 60_000, joinedAt: this.joined.get(user.id) ?? null, pendingRoblox: null };
    this.sessions.set(user.id, s);
    try { await this.send(user.id, this.questionPayload(s)); } catch { this.sessions.delete(user.id); return simple('Ich kann dir keine Direktnachricht schicken. Bitte erlaube Direktnachrichten und versuche es erneut.', COLORS.danger); }
    this.report(s);
    return simple('Los geht’s – beantworte die Fragen einfach hier im Chat.', COLORS.success);
  }

  cancel(userId) {
    const s = this.sessions.get(userId);
    this.sessions.delete(userId);
    if (s) this.store.clearProgress(s.guildId, userId, s.type.key);
    return simple(s ? 'Bewerbung abgebrochen. Du kannst jederzeit über das Panel neu starten.' : 'Es läuft keine Bewerbung.', COLORS.neutral);
  }

  /** Aktuelle Frage: Text/Roblox → Antwort per Nachricht; Auswahl/Rollen → Menü (+ „Überspringen“ bei optionalen). */
  questionPayload(s) {
    const i = s.answers.length, f = s.questions[i];
    const head = `**${i + 1}/${s.questions.length}.** ${plain(f.label)}`;
    const embed = (hint) => ({ title: clip(s.type.name, 256), color: COLORS.info, description: clip(`${head}\n\n_${hint}_`, 4000) });
    if (f.type === 'ROBLOX') return { embeds: [embed(`Schreibe deinen **Roblox-Benutzernamen** (genau wie in Roblox, nicht den Anzeigenamen) hier in den Chat.${f.required ? '' : ` Optional – „${SKIP}“ zum Überspringen.`}`)] };
    if (f.type === 'TEXT') {
      const hints = [f.minLength ? `mindestens ${f.minLength} Zeichen` : '', !f.required ? `optional – schreibe „${SKIP}“, um zu überspringen` : ''].filter(Boolean).join(' · ');
      return { embeds: [embed(`Antworte einfach mit einer Nachricht hier im Chat.${hints ? ` (${hints})` : ''}`)] };
    }
    return {
      embeds: [embed(`Wähle unten ${f.multiple ? 'eine oder mehrere Optionen' : 'eine Option'} aus.${f.required ? '' : ' Optional.'}`)],
      components: [
        row({ type: 3, custom_id: `app:ans:${i}`, placeholder: f.multiple ? 'Optionen wählen …' : 'Option wählen …', min_values: 1, max_values: f.multiple ? f.options.length : 1, options: f.options.map((o, j) => ({ label: clip(o.label, 100), value: String(j) })) }),
        ...(f.required ? [] : [row(button(`app:skip:${i}`, 'Überspringen', 'secondary'))]),
      ],
    };
  }

  /** Nachricht in der DM während einer laufenden Bewerbung. */
  async message(user, content, now = Date.now()) {
    const s = this.sessions.get(user.id);
    const say = (text, color = COLORS.info) => this.send(user.id, simple(text, color, s?.type.name ?? 'Bewerbung'));
    if (!s) return say('Du hast gerade keine laufende Bewerbung. Starte eine über das Bewerbungs-Panel auf dem Server (oder mit `/bewerbung`).', COLORS.neutral);
    if (s.expiresAt <= now) {
      this.sessions.delete(user.id); this.store.clearProgress(s.guildId, user.id, s.type.key);
      return say(`⏰ Die Zeit für deine Bewerbung ist abgelaufen (${formatMinutes(s.type.timeLimitMinutes)}). Bitte starte sie über das Panel neu.`, COLORS.warning);
    }
    if (content.trim().toLowerCase() === CANCEL_WORD) return this.send(user.id, this.cancel(user.id));
    const q = s.questions[s.answers.length];
    if (q.type !== 'TEXT' && q.type !== 'ROBLOX') { await say('Bitte wähle die Antwort im **Menü** der letzten Frage aus.', COLORS.warning); return this.send(user.id, this.questionPayload(s)); }
    const text = content.trim();
    if (!text) return say('Bitte antworte mit Text.', COLORS.warning);
    if (!q.required && text === SKIP) s.answers.push(null);
    else {
      const r = checkAnswer(q, text);
      if (!r.ok) return say(r.error, COLORS.warning);
      if (q.type === 'ROBLOX') {
        const rb = await this.roblox.lookup(r.text);
        if (rb === null) return say(`❌ Den Roblox-Benutzer **${plain(r.text)}** gibt es nicht. Bitte prüfe die Schreibweise und schicke ihn noch einmal.`, COLORS.warning);
        if (rb) {
          s.pendingRoblox = rb.name;
          const i = s.answers.length;
          return this.send(user.id, {
            embeds: [{ title: clip(s.type.name, 256), color: COLORS.info, description: `Ist das dein Roblox-Konto?\n\n**${plain(rb.name)}**${rb.displayName !== rb.name ? `\n${plain(rb.displayName)}` : ''}\n\n_Falls nicht: auf „Anderer Name“ tippen oder einfach den richtigen Namen schreiben._`, ...(rb.avatarUrl ? { thumbnail: { url: rb.avatarUrl } } : {}) }],
            components: [row(button(`app:rb:${i}:yes`, 'Ja, das bin ich', 'success'), button(`app:rb:${i}:no`, 'Anderer Name', 'secondary'))],
          });
        }
        s.answers.push(r.text); // Roblox nicht erreichbar → beim Einreichen erneut geprüft
      } else s.answers.push(r.text);
    }
    return this.proceed(s, now);
  }

  /** Auswahl-Antwort (Menü), „Überspringen“ oder Roblox-Bestätigung. Antwort = Aktualisierung der Fragen-Nachricht. */
  async component(user, action, index, values = []) {
    const s = this.sessions.get(user.id);
    if (!s || s.expiresAt <= Date.now()) return { error: 'Du hast gerade keine laufende Bewerbung. Starte sie über das Panel neu.' };
    if (index !== s.answers.length) return { error: 'Diese Frage hast du schon beantwortet.' };
    const q = s.questions[index];
    const done = (answer) => ({ update: { embeds: [{ title: clip(s.type.name, 256), color: COLORS.success, description: clip(`**${index + 1}/${s.questions.length}.** ${plain(q.label)}\n\n✅ ${plain(answer)}`, 4000) }], components: [] } });
    if (action === 'rb') {
      if (!s.pendingRoblox) return { error: 'Diese Frage hast du schon beantwortet.' };
      const name = s.pendingRoblox;
      s.pendingRoblox = null;
      if (values[0] !== 'yes') return { update: { embeds: [{ title: clip(s.type.name, 256), color: COLORS.neutral, description: clip(`**${index + 1}/${s.questions.length}.** ${plain(q.label)}\n\nSchreib deinen Roblox-Benutzernamen bitte noch einmal (genau wie in Roblox).`, 4000) }], components: [] } };
      s.answers.push(name);
      const r = done(name); await this.proceed(s); return r;
    }
    if (action === 'skip') {
      if (q.required) return { error: 'Diese Frage ist eine Pflichtfrage.' };
      s.answers.push(null);
      const r = done('— (übersprungen)'); await this.proceed(s); return r;
    }
    const labels = values.map((v) => q.options[Number(v)]?.label).filter(Boolean);
    const c = checkAnswer(q, labels);
    if (!c.ok) return { error: c.error };
    s.answers.push(labels);
    const r = done(labels.join(', ')); await this.proceed(s); return r;
  }

  /** Nächste Frage – oder nach der letzten Antwort einreichen. */
  async proceed(s, now = Date.now()) {
    if (s.answers.length < s.questions.length) { this.report(s); return this.send(s.userId, this.questionPayload(s)); }
    const say = (text, color) => this.send(s.userId, simple(text, color, s.type.name));
    try {
      const app = await this.service.submit({ guildId: s.guildId, typeKey: s.type.key, user: { id: s.userId, name: s.userName, avatar: s.avatar }, answers: s.answers.map((a) => (a === null ? '' : a)), source: 'DM', durationSec: Math.max(0, Math.round((now - s.startedAt) / 1000)), joinedAt: s.joinedAt });
      this.sessions.delete(s.userId);
      const t = this.service.type(s.guildId, s.type.key) ?? s.type;
      return say(clip(renderText(t.messages.completion, { '{number}': app.number, '{applicationName}': t.name }), 4000), COLORS.success);
    } catch (e) {
      this.sessions.delete(s.userId);
      this.store.clearProgress(s.guildId, s.userId, s.type.key);
      if (e instanceof AppError) return say(`${e.message}${e.status === 400 ? '\n\nFalls die Fragen inzwischen geändert wurden: bitte die Bewerbung über das Panel neu starten.' : ''}`, COLORS.warning);
      this.log.error('Einreichen fehlgeschlagen:', e);
      return say('⚠️ Deine Bewerbung konnte gerade nicht gespeichert werden. Bitte starte sie in ein paar Minuten neu.', COLORS.danger);
    }
  }
}
