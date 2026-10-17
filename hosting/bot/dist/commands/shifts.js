"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHIFT_INTERACTION = exports.SHIFT_COMMANDS = void 0;
exports.adminReply = adminReply;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Minuten → „3 h 05 min“. */
const hm = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const ts = (iso, style = 'f') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
const days = (c) => Number(c.opts.tage ?? 7);
const period = (d) => (d === 1 ? 'letzte 24 Stunden' : `letzte ${d} Tage`);
async function shiftTypes(c) {
    const cfg = await c.api.service('GET', '/bot/shifts').catch(() => null);
    return cfg?.enabled ? cfg.types : [];
}
/** Eine Zeile im Verlauf: Beginn, Dauer, Schichtart, Pausen. */
const line = (s, i) => `\`${i + 1}.\` ${ts(s.startedAt)} · **${hm(s.minutes - s.breakMinutes)}**${s.shiftType ? ` · ${(0, format_1.plain)(s.shiftType)}` : ''}${s.breaks ? ` · ${s.breaks}× Pause (${hm(s.breakMinutes)})` : ''}${s.active ? ` · ${format_1.DUTY_DE[s.status]?.emoji ?? '🟢'} läuft` : ''}`;
/** Übersicht: laufende Schicht oben, darunter Summe und die letzten Schichten. */
function logEmbed(title, log, emptyText) {
    const items = log.items;
    const current = items.find((s) => s.active);
    const total = items.reduce((n, s) => n + s.minutes - s.breakMinutes, 0);
    const fields = [];
    if (current)
        fields.push({ name: 'Aktuelle Schicht', value: (0, format_1.clip)([`${format_1.DUTY_DE[current.status]?.emoji ?? '🟢'} **${format_1.DUTY_DE[current.status]?.label ?? current.status}** seit ${ts(current.startedAt, 'R')}`, current.shiftType ? `Schicht: **${(0, format_1.plain)(current.shiftType)}**` : null, `Dauer: ${hm(current.minutes)}${current.breakMinutes ? ` (davon Pause ${hm(current.breakMinutes)})` : ''}`].filter(Boolean).join('\n'), 1024) });
    fields.push({ name: `Gesamt (${period(log.days)})`, value: `**${hm(total)}** in ${items.length} ${items.length === 1 ? 'Schicht' : 'Schichten'}`, inline: true });
    const lines = items.slice(0, 15).map(line);
    return { title, color: current ? format_1.COLORS.success : format_1.COLORS.info, fields,
        description: (0, format_1.clip)(lines.length ? `${lines.join('\n')}${items.length > 15 ? `\n… und ${items.length - 15} weitere` : ''}` : emptyText, 4000) };
}
async function setStatus(c, status, shiftType) {
    try {
        await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status, ...(shiftType ? { shiftType } : {}) });
        return (0, format_1.okReply)(`${format_1.DUTY_DE[status].emoji} Du bist jetzt **${format_1.DUTY_DE[status].label}**.`);
    }
    catch (e) {
        if (e instanceof api_1.BotApiError && e.status === 409)
            return (0, format_1.okReply)(`Du bist bereits **${format_1.DUTY_DE[status].label}**.`);
        return (0, errors_1.mapError)(e);
    }
}
async function start(c) {
    const types = await shiftTypes(c);
    const wanted = String(c.opts.art ?? '').trim().toLowerCase();
    if (wanted) {
        const t = types.find((x) => x.id === wanted || x.name.toLowerCase() === wanted);
        if (!t)
            return (0, format_1.errorReply)(types.length ? `Unbekannte Schichtart. Verfügbar: ${types.map((x) => `**${(0, format_1.plain)(x.name)}**`).join(', ')}.` : 'Auf diesem Server sind keine Schichtarten eingerichtet – einfach `/schicht start` ohne Art.');
        try {
            await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status: 'ON_DUTY', shiftType: t.id });
            return (0, format_1.okReply)(`🟢 Schicht **${(0, format_1.plain)(t.name)}** gestartet.`);
        }
        catch (e) {
            if (e instanceof api_1.BotApiError && e.status === 409)
                return (0, format_1.okReply)(`Deine Schicht **${(0, format_1.plain)(t.name)}** läuft bereits.`);
            return (0, errors_1.mapError)(e);
        }
    }
    // Mehrere Arten: Auswahlmenü (wird vom Dienst-Panel-Handler `duty:type` verarbeitet)
    if (types.length >= 2)
        return { ephemeral: true, content: 'Welche Schicht beginnst du?', select: { id: 'duty:type', placeholder: 'Schicht wählen …', options: types.slice(0, 25).map((t) => ({ label: (0, format_1.clip)(t.name, 100), value: t.id, ...(t.isDefault ? { description: 'Standard' } : {}) })) } };
    return setStatus(c, 'ON_DUTY');
}
/** Pause umschalten: im Dienst → Pause, in der Pause → zurück in den Dienst (gleiche Schichtart). */
async function pause(c) {
    try {
        const me = await c.api.asUser(c.discordId, 'GET', '/team/me');
        if (!me)
            return (0, format_1.errorReply)('Du bist gerade nicht im Dienst. Starte mit `/schicht start`.');
        return setStatus(c, me.status === 'BREAK' ? 'ON_DUTY' : 'BREAK');
    }
    catch (e) {
        return (0, errors_1.mapError)(e);
    }
}
async function active(c) {
    try {
        const rows = await c.api.asUser(c.discordId, 'GET', '/team/overview');
        const on = rows.filter((r) => r.dutyStatus !== 'OFF_DUTY').sort((a, b) => (a.onDutySince ?? '').localeCompare(b.onDutySince ?? ''));
        const lines = on.slice(0, 30).map((r) => `${format_1.DUTY_DE[r.dutyStatus]?.emoji ?? '•'} **${(0, format_1.plain)(r.callsign ?? r.name)}**${r.callsign ? ` (${(0, format_1.plain)(r.name)})` : ''}${r.shiftType ? ` · ${(0, format_1.plain)(r.shiftType)}` : ''}${r.onDutySince ? ` · seit ${ts(r.onDutySince, 'R')}` : ''}`);
        const onBreak = on.filter((r) => r.dutyStatus === 'BREAK').length;
        return { ephemeral: true, embeds: [{ title: `👮 Laufende Schichten (${on.length})`, color: on.length ? format_1.COLORS.success : format_1.COLORS.neutral,
                    description: (0, format_1.clip)(lines.length ? `${lines.join('\n')}${on.length > 30 ? `\n… und ${on.length - 30} weitere` : ''}` : 'Gerade ist niemand im Dienst.', 4000),
                    ...(onBreak ? { footer: `${onBreak} davon in der Pause` } : {}) }] };
    }
    catch (e) {
        return (0, errors_1.mapError)(e);
    }
}
/** Leitung: Schichten eines Mitglieds; läuft eine, gibt es „Schicht beenden“. */
async function adminReply(c, discordId, d = 7) {
    if (!/^\d{15,25}$/.test(discordId))
        return (0, format_1.errorReply)('Bitte ein Mitglied auswählen.');
    const log = await c.api.asUser(c.discordId, 'GET', `/team/shifts?discordId=${discordId}&days=${d}`);
    if (!log.member)
        return (0, format_1.errorReply)(`<@${discordId}> ist mit keinem Konto im System verknüpft.`);
    const current = log.items.find((s) => s.active);
    const buttons = current ? [{ id: `shift:end:${log.member.userId}:${discordId}`, label: 'Schicht beenden', style: 'danger', emoji: '⏹️' }] : [];
    return { ephemeral: true, embeds: [logEmbed((0, format_1.clip)(`🕒 Schichten von ${(0, format_1.plain)(log.member.name)}`, 256), log, 'Im Zeitraum keine Schichten.')], ...(buttons.length ? { buttons } : {}) };
}
exports.SHIFT_COMMANDS = [
    {
        name: 'schicht', description: 'Schichten: starten, Pause, beenden, Verlauf und wer gerade im Dienst ist',
        subcommands: [
            { name: 'start', description: 'Schicht beginnen', options: [{ name: 'art', description: 'Schichtart (leer = Auswahl bzw. Standard)', type: 'string', maxLength: 40 }] },
            { name: 'pause', description: 'Pause beginnen bzw. beenden' },
            { name: 'ende', description: 'Schicht beenden (außer Dienst)' },
            { name: 'status', description: 'Deine aktuelle Schicht und deine Zeit der letzten 7 Tage' },
            { name: 'verlauf', description: 'Deine letzten Schichten', options: [{ name: 'tage', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 }] },
            { name: 'aktiv', description: 'Wer gerade eine Schicht hat' },
            { name: 'admin', description: 'Leitung: Schichten eines Mitglieds ansehen und beenden', options: [
                    { name: 'mitglied', description: 'Discord-Mitglied', type: 'user', required: true },
                    { name: 'tage', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 },
                ] },
        ],
        async run(c) {
            switch (c.opts._sub) {
                case 'start': return start(c);
                case 'pause': return pause(c);
                case 'ende': return setStatus(c, 'OFF_DUTY');
                case 'aktiv': return active(c);
                case 'admin': try {
                    return await adminReply(c, String(c.opts.mitglied ?? ''), days(c));
                }
                catch (e) {
                    return (0, errors_1.mapError)(e);
                }
                case 'status':
                case 'verlauf':
                    try {
                        const d = c.opts._sub === 'status' ? 7 : days(c);
                        const log = await c.api.asUser(c.discordId, 'GET', `/team/me/shifts?days=${d}`);
                        return { ephemeral: true, embeds: [logEmbed('🕒 Deine Schichten', log, 'Im Zeitraum hattest du keine Schicht. Starte mit `/schicht start`.')] };
                    }
                    catch (e) {
                        return (0, errors_1.mapError)(e);
                    }
                default: return (0, format_1.errorReply)('Unbekannter Unterbefehl.');
            }
        },
    },
];
/** Button `shift:end:<userId>:<discordId>` aus `/schicht admin`: Schicht eines Mitglieds beenden. */
exports.SHIFT_INTERACTION = {
    prefix: 'shift',
    async run(c) {
        const [action, userId, discordId] = c.args;
        if (action !== 'end' || !userId || !/^[0-9a-f-]{36}$/i.test(userId))
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        try {
            await c.api.asUser(c.discordId, 'PUT', `/team/${userId}/status`, { status: 'OFF_DUTY' });
        }
        catch (e) {
            if (!(e instanceof api_1.BotApiError && e.status === 409))
                return (0, errors_1.mapError)(e);
        }
        try {
            return discordId ? { ...(await adminReply(c, discordId)), content: '✅ Schicht beendet.' } : (0, format_1.okReply)('Schicht beendet.');
        }
        catch {
            return (0, format_1.okReply)('Schicht beendet.');
        }
    },
};
//# sourceMappingURL=shifts.js.map