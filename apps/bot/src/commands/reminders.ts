import { formatReminderDuration, parseBool, parseReminderDuration, REMINDER_SNOOZE, REMINDER_TEXT_MAX } from '@enrp/shared';
import { BotApiError } from '../api';
import { clip, COLORS, errorReply, okReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import { mapError } from './errors';
import type { CommandDef, InteractionDef } from './types';

/**
 * Persönliche Erinnerungen: `/remind-me in what dm` und `/erinnerungen`. Gespeichert im System (übersteht Neustarts),
 * zugestellt über die Bot-Warteschlange (`reminder.due`) – per DM oder im Kanal des Befehls. Unter jeder ausgelösten
 * Erinnerung: verschieben um 10 Minuten / 30 Minuten / 1 Stunde / 1 Tag oder „Erledigt“ (nur der erste Klick zählt).
 * Funktioniert ohne verknüpftes Konto; jede Person sieht und ändert nur ihre eigenen Erinnerungen.
 */
interface ReminderView { id: string; text: string; dm: boolean; dueAt: string; status: string; fireCount: number; channelId: string | null; duplicate?: boolean }
const ts = (iso: string, f: 'R' | 'f' = 'R') => `<t:${Math.floor(Date.parse(iso) / 1000)}:${f}>`;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
/** Fachliche Antworten der API (nicht deine Erinnerung, schon verschoben …) direkt anzeigen. */
const apiError = (e: unknown): Reply => (e instanceof BotApiError && [400, 403, 404, 409].includes(e.status) && e.message ? errorReply(e.message) : mapError(e));

export const REMINDER_COMMANDS: CommandDef[] = [{
  name: 'remind-me', description: 'Erinnert dich nach einer Zeit an etwas (per DM oder hier im Kanal)',
  options: [
    { name: 'in', description: 'In wie viel Zeit? z. B. 10m, 30 min, 1h, 1h30m, 2 Tage', type: 'string', required: true, maxLength: 50 },
    { name: 'what', description: 'Woran soll ich dich erinnern?', type: 'string', required: true, maxLength: REMINDER_TEXT_MAX },
    { name: 'dm', description: 'Per Direktnachricht erinnern (Standard: hier im Kanal)', type: 'boolean' },
  ],
  async run(c) {
    const d = parseReminderDuration(c.opts.in);
    if (!d.ok) return errorReply(d.error);
    const text = String(c.opts.what ?? '').trim();
    if (!text) return errorReply('Bitte angeben, woran ich dich erinnern soll.');
    if (text.length > REMINDER_TEXT_MAX) return errorReply(`Der Erinnerungstext darf höchstens ${REMINDER_TEXT_MAX} Zeichen lang sein.`);
    // `dm` kommt von Discord als Wahrheitswert; Texte wie „True“/„False“ werden ebenso verstanden. Ohne Server (DM) → immer DM.
    const channelId = c.guildId && c.channelId ? c.channelId : null;
    let dm = parseBool(c.opts.dm, false) || !channelId;
    let note = '';
    // Können DMs ankommen? Kurze Bestätigung per DM – klappt das nicht, kommt die Erinnerung im Kanal.
    if (dm && channelId && c.platform) {
      try { await c.platform.sendDm(c.discordId, { embed: { title: '⏰ Erinnerung gespeichert', description: `Ich schreibe dir hier ${formatReminderDuration(d.ms)} nach dem Speichern:\n> ${clip(plain(text), 300)}`, color: COLORS.info } }); }
      catch { dm = false; note = '\n⚠️ Ich kann dir keine Direktnachricht schicken (DMs geschlossen?) – die Erinnerung kommt deshalb **hier im Kanal**.'; }
    }
    try {
      const r = await c.api.service<ReminderView>('POST', '/bot/reminders', { discordId: c.discordId, guildId: c.guildId ?? null, channelId, text, dm, delayMs: d.ms });
      return okReply(`${r.duplicate ? 'Diese Erinnerung hast du gerade schon gespeichert. ' : ''}Ich erinnere dich ${ts(r.dueAt)} (${ts(r.dueAt, 'f')}) ${r.dm ? 'per **Direktnachricht**' : 'hier im **Kanal**'}:\n> ${clip(plain(text), 300)}${note}\n-# Übersicht und löschen: \`/erinnerungen\``);
    } catch (e) { return apiError(e); }
  },
}, {
  name: 'erinnerungen', description: 'Deine offenen Erinnerungen ansehen und löschen',
  async run(c) {
    try {
      const list = await c.api.service<ReminderView[]>('GET', `/bot/reminders?discordId=${c.discordId}`);
      if (!list.length) return okReply('Du hast keine offenen Erinnerungen. Neue mit `/remind-me`.');
      const lines = list.map((r, i) => `**${i + 1}.** ${ts(r.dueAt)} · ${r.dm ? 'DM' : 'Kanal'} – ${clip(plain(r.text), 120)}`);
      return { ephemeral: true, embeds: [{ title: `⏰ Deine Erinnerungen (${list.length})`, color: COLORS.info, description: clip(lines.join('\n'), 4000) }],
        buttons: list.slice(0, 20).map((r, i) => ({ id: `remind:cancel:${r.id}`, label: `${i + 1} löschen`, style: 'danger' as const })) };
    } catch (e) { return apiError(e); }
  },
}];

/** Nachricht zur fälligen Erinnerung (DM oder Kanal) mit Buttons zum Verschieben. */
export function reminderMessage(p: Record<string, unknown>): { embed: EmbedData; buttons: ButtonSpec[] } {
  const id = String(p.id), fire = Number(p.fire) || 1;
  const late = typeof p.lateMinutes === 'number' && typeof p.dueAt === 'string' ? `\n\n⚠️ Verspätet zugestellt (der Bot war nicht erreichbar) – fällig war ${ts(p.dueAt, 'f')}.` : '';
  return {
    embed: { title: '⏰ Erinnerung', color: COLORS.warning, description: clip(`${plain(p.text) || '—'}${late}`, 4000),
      fields: typeof p.createdAt === 'string' ? [{ name: 'Gespeichert', value: ts(p.createdAt), inline: true }] : [], footer: 'Später noch einmal erinnern:' },
    buttons: [...REMINDER_SNOOZE.map((s) => ({ id: `remind:snooze:${id}:${fire}:${s.minutes}`, label: s.label, style: 'secondary' as const, emoji: '⏰' })), { id: `remind:done:${id}:${fire}`, label: 'Erledigt', style: 'success', emoji: '✅' }],
  };
}

/** Zustellwege (in index.ts aus Discord, in Tests ein Fake). */
export interface ReminderTransport {
  dm(userId: string, m: { embed: EmbedData; buttons: ButtonSpec[] }): Promise<unknown>;
  channel(channelId: string, m: { content: string; embed: EmbedData; buttons: ButtonSpec[]; mentionUserId: string }): Promise<unknown>;
}
/**
 * Fällige Erinnerung zustellen. DM gewünscht, aber nicht möglich (DMs geschlossen, Server verlassen) → im Kanal mit
 * Erwähnung. Wirft nur, wenn kein Weg klappt – dann versucht es die Warteschlange später erneut. Nie ein Absturz.
 */
export async function deliverReminder(p: Record<string, unknown>, t: ReminderTransport): Promise<'dm' | 'channel' | 'channel-fallback'> {
  const userId = String(p.discordId ?? '');
  if (!/^\d{15,25}$/.test(userId)) throw new Error('no Discord user id');
  const channelId = typeof p.channelId === 'string' && /^\d{15,25}$/.test(p.channelId) ? p.channelId : null;
  const m = reminderMessage(p);
  if (p.dm === true || !channelId) {
    try { await t.dm(userId, m); return 'dm'; } catch (e) {
      if (!channelId) throw new Error(`reminder DM failed: ${e instanceof Error ? e.message : e}`);
      await t.channel(channelId, { ...m, content: `<@${userId}> deine Erinnerung – eine Direktnachricht an dich war nicht möglich (DMs geschlossen?).`, mentionUserId: userId });
      return 'channel-fallback';
    }
  }
  await t.channel(channelId, { ...m, content: `<@${userId}>`, mentionUserId: userId });
  return 'channel';
}

export const REMINDER_INTERACTION: InteractionDef = {
  prefix: 'remind',
  async run(c): Promise<Reply> {
    const [action, id, a, b] = c.args;
    if (!isId(id)) return errorReply('Unbekannte Erinnerung.');
    try {
      if (action === 'cancel') {
        await c.api.service('DELETE', `/bot/reminders/${id}?discordId=${c.discordId}`);
        return okReply('Erinnerung gelöscht.');
      }
      const fire = Number(a);
      if (!Number.isInteger(fire) || fire < 1) return errorReply('Unbekannte Aktion.');
      if (action === 'snooze') {
        const minutes = Number(b);
        if (!REMINDER_SNOOZE.some((s) => s.minutes === minutes)) return errorReply('Ungültige Zeit zum Verschieben.');
        const r = await c.api.service<ReminderView>('POST', `/bot/reminders/${id}/snooze`, { discordId: c.discordId, fire, minutes });
        // Buttons der alten Nachricht entfernen – weitere Klicks sind ohnehin wirkungslos
        return { ...okReply(`Verschoben – ich erinnere dich ${ts(r.dueAt)} (${ts(r.dueAt, 'f')}) erneut.`),
          update: { embeds: [{ title: '⏰ Erinnerung (verschoben)', color: COLORS.neutral, description: clip(`${plain(r.text)}\n\nNächste Erinnerung ${ts(r.dueAt)}.`, 4000) }], buttons: [] } };
      }
      if (action === 'done') {
        await c.api.service('POST', `/bot/reminders/${id}/done`, { discordId: c.discordId, fire });
        return { ...okReply('Erledigt.'), update: { embeds: [{ title: '✅ Erinnerung erledigt', color: COLORS.success, description: 'Diese Erinnerung ist abgeschlossen.' }], buttons: [] } };
      }
      return errorReply('Unbekannte Aktion.');
    } catch (e) { return apiError(e); }
  },
};
