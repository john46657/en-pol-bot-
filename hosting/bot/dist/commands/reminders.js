"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REMINDER_INTERACTION = exports.REMINDER_COMMANDS = void 0;
exports.reminderMessage = reminderMessage;
exports.deliverReminder = deliverReminder;
const shared_1 = require("@enrp/shared");
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
const ts = (iso, f = 'R') => `<t:${Math.floor(Date.parse(iso) / 1000)}:${f}>`;
const isId = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
/** Fachliche Antworten der API (nicht deine Erinnerung, schon verschoben …) direkt anzeigen. */
const apiError = (e) => (e instanceof api_1.BotApiError && [400, 403, 404, 409].includes(e.status) && e.message ? (0, format_1.errorReply)(e.message) : (0, errors_1.mapError)(e));
exports.REMINDER_COMMANDS = [{
        name: 'remind-me', description: 'Erinnert dich nach einer Zeit an etwas (per DM oder hier im Kanal)',
        options: [
            { name: 'in', description: 'In wie viel Zeit? z. B. 10m, 30 min, 1h, 1h30m, 2 Tage', type: 'string', required: true, maxLength: 50 },
            { name: 'what', description: 'Woran soll ich dich erinnern?', type: 'string', required: true, maxLength: shared_1.REMINDER_TEXT_MAX },
            { name: 'dm', description: 'Per Direktnachricht erinnern (Standard: hier im Kanal)', type: 'boolean' },
        ],
        async run(c) {
            const d = (0, shared_1.parseReminderDuration)(c.opts.in);
            if (!d.ok)
                return (0, format_1.errorReply)(d.error);
            const text = String(c.opts.what ?? '').trim();
            if (!text)
                return (0, format_1.errorReply)('Bitte angeben, woran ich dich erinnern soll.');
            if (text.length > shared_1.REMINDER_TEXT_MAX)
                return (0, format_1.errorReply)(`Der Erinnerungstext darf höchstens ${shared_1.REMINDER_TEXT_MAX} Zeichen lang sein.`);
            // `dm` kommt von Discord als Wahrheitswert; Texte wie „True“/„False“ werden ebenso verstanden. Ohne Server (DM) → immer DM.
            const channelId = c.guildId && c.channelId ? c.channelId : null;
            let dm = (0, shared_1.parseBool)(c.opts.dm, false) || !channelId;
            let note = '';
            // Können DMs ankommen? Kurze Bestätigung per DM – klappt das nicht, kommt die Erinnerung im Kanal.
            if (dm && channelId && c.platform) {
                try {
                    await c.platform.sendDm(c.discordId, { embed: { title: '⏰ Erinnerung gespeichert', description: `Ich schreibe dir hier ${(0, shared_1.formatReminderDuration)(d.ms)} nach dem Speichern:\n> ${(0, format_1.clip)((0, format_1.plain)(text), 300)}`, color: format_1.COLORS.info } });
                }
                catch {
                    dm = false;
                    note = '\n⚠️ Ich kann dir keine Direktnachricht schicken (DMs geschlossen?) – die Erinnerung kommt deshalb **hier im Kanal**.';
                }
            }
            try {
                const r = await c.api.service('POST', '/bot/reminders', { discordId: c.discordId, guildId: c.guildId ?? null, channelId, text, dm, delayMs: d.ms });
                return (0, format_1.okReply)(`${r.duplicate ? 'Diese Erinnerung hast du gerade schon gespeichert. ' : ''}Ich erinnere dich ${ts(r.dueAt)} (${ts(r.dueAt, 'f')}) ${r.dm ? 'per **Direktnachricht**' : 'hier im **Kanal**'}:\n> ${(0, format_1.clip)((0, format_1.plain)(text), 300)}${note}\n-# Übersicht und löschen: \`/erinnerungen\``);
            }
            catch (e) {
                return apiError(e);
            }
        },
    }, {
        name: 'erinnerungen', description: 'Deine offenen Erinnerungen ansehen und löschen',
        async run(c) {
            try {
                const list = await c.api.service('GET', `/bot/reminders?discordId=${c.discordId}`);
                if (!list.length)
                    return (0, format_1.okReply)('Du hast keine offenen Erinnerungen. Neue mit `/remind-me`.');
                const lines = list.map((r, i) => `**${i + 1}.** ${ts(r.dueAt)} · ${r.dm ? 'DM' : 'Kanal'} – ${(0, format_1.clip)((0, format_1.plain)(r.text), 120)}`);
                return { ephemeral: true, embeds: [{ title: `⏰ Deine Erinnerungen (${list.length})`, color: format_1.COLORS.info, description: (0, format_1.clip)(lines.join('\n'), 4000) }],
                    buttons: list.slice(0, 20).map((r, i) => ({ id: `remind:cancel:${r.id}`, label: `${i + 1} löschen`, style: 'danger' })) };
            }
            catch (e) {
                return apiError(e);
            }
        },
    }];
/** Nachricht zur fälligen Erinnerung (DM oder Kanal) mit Buttons zum Verschieben. */
function reminderMessage(p) {
    const id = String(p.id), fire = Number(p.fire) || 1;
    const late = typeof p.lateMinutes === 'number' && typeof p.dueAt === 'string' ? `\n\n⚠️ Verspätet zugestellt (der Bot war nicht erreichbar) – fällig war ${ts(p.dueAt, 'f')}.` : '';
    return {
        embed: { title: '⏰ Erinnerung', color: format_1.COLORS.warning, description: (0, format_1.clip)(`${(0, format_1.plain)(p.text) || '—'}${late}`, 4000),
            fields: typeof p.createdAt === 'string' ? [{ name: 'Gespeichert', value: ts(p.createdAt), inline: true }] : [], footer: 'Später noch einmal erinnern:' },
        buttons: [...shared_1.REMINDER_SNOOZE.map((s) => ({ id: `remind:snooze:${id}:${fire}:${s.minutes}`, label: s.label, style: 'secondary', emoji: '⏰' })), { id: `remind:done:${id}:${fire}`, label: 'Erledigt', style: 'success', emoji: '✅' }],
    };
}
/**
 * Fällige Erinnerung zustellen. DM gewünscht, aber nicht möglich (DMs geschlossen, Server verlassen) → im Kanal mit
 * Erwähnung. Wirft nur, wenn kein Weg klappt – dann versucht es die Warteschlange später erneut. Nie ein Absturz.
 */
async function deliverReminder(p, t) {
    const userId = String(p.discordId ?? '');
    if (!/^\d{15,25}$/.test(userId))
        throw new Error('no Discord user id');
    const channelId = typeof p.channelId === 'string' && /^\d{15,25}$/.test(p.channelId) ? p.channelId : null;
    const m = reminderMessage(p);
    if (p.dm === true || !channelId) {
        try {
            await t.dm(userId, m);
            return 'dm';
        }
        catch (e) {
            if (!channelId)
                throw new Error(`reminder DM failed: ${e instanceof Error ? e.message : e}`);
            await t.channel(channelId, { ...m, content: `<@${userId}> deine Erinnerung – eine Direktnachricht an dich war nicht möglich (DMs geschlossen?).`, mentionUserId: userId });
            return 'channel-fallback';
        }
    }
    await t.channel(channelId, { ...m, content: `<@${userId}>`, mentionUserId: userId });
    return 'channel';
}
exports.REMINDER_INTERACTION = {
    prefix: 'remind',
    async run(c) {
        const [action, id, a, b] = c.args;
        if (!isId(id))
            return (0, format_1.errorReply)('Unbekannte Erinnerung.');
        try {
            if (action === 'cancel') {
                await c.api.service('DELETE', `/bot/reminders/${id}?discordId=${c.discordId}`);
                return (0, format_1.okReply)('Erinnerung gelöscht.');
            }
            const fire = Number(a);
            if (!Number.isInteger(fire) || fire < 1)
                return (0, format_1.errorReply)('Unbekannte Aktion.');
            if (action === 'snooze') {
                const minutes = Number(b);
                if (!shared_1.REMINDER_SNOOZE.some((s) => s.minutes === minutes))
                    return (0, format_1.errorReply)('Ungültige Zeit zum Verschieben.');
                const r = await c.api.service('POST', `/bot/reminders/${id}/snooze`, { discordId: c.discordId, fire, minutes });
                // Buttons der alten Nachricht entfernen – weitere Klicks sind ohnehin wirkungslos
                return { ...(0, format_1.okReply)(`Verschoben – ich erinnere dich ${ts(r.dueAt)} (${ts(r.dueAt, 'f')}) erneut.`),
                    update: { embeds: [{ title: '⏰ Erinnerung (verschoben)', color: format_1.COLORS.neutral, description: (0, format_1.clip)(`${(0, format_1.plain)(r.text)}\n\nNächste Erinnerung ${ts(r.dueAt)}.`, 4000) }], buttons: [] } };
            }
            if (action === 'done') {
                await c.api.service('POST', `/bot/reminders/${id}/done`, { discordId: c.discordId, fire });
                return { ...(0, format_1.okReply)('Erledigt.'), update: { embeds: [{ title: '✅ Erinnerung erledigt', color: format_1.COLORS.success, description: 'Diese Erinnerung ist abgeschlossen.' }], buttons: [] } };
            }
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        }
        catch (e) {
            return apiError(e);
        }
    },
};
//# sourceMappingURL=reminders.js.map