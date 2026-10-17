"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHIFT_INTERACTION = exports.SHIFT_COMMANDS = void 0;
exports.manageReply = manageReply;
exports.adminReply = adminReply;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Minuten → „3 h 05 min“. */
const hm = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const ts = (iso, style = 'f') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
const days = (c) => Number(c.opts.days ?? 7);
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
/** Schichtart aus der Eingabe (ID oder Name, ohne Groß-/Kleinschreibung). */
const findType = (types, wanted) => { const w = wanted.trim().toLowerCase(); return types.find((x) => x.id === w || x.name.toLowerCase() === w); };
/** Minuten → „2 Stunden, 5 Minuten“ (wie bei Trident ausgeschrieben). */
const long = (min) => {
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    const parts = [...(h ? [`${h} ${h === 1 ? 'Stunde' : 'Stunden'}`] : []), ...(m || !h ? [`${m} ${m === 1 ? 'Minute' : 'Minuten'}`] : [])];
    return parts.join(', ');
};
/** Schichtart fürs Panel: gewählte, sonst Standard bzw. erste (wie Trident „Shift Type“); ohne eingerichtete Arten keine. */
const pickType = (types, wanted) => (wanted ? findType(types, wanted) : types.find((t) => t.isDefault) ?? types[0]);
/**
 * `/shift manage`: Panel wie bei Trident – laufende Schicht, Gesamtübersicht (Anzahl, Gesamt- und Durchschnittsdauer),
 * Schichtart und immer „Start“, „Pause“, „Beenden“ (was gerade nicht geht, ist ausgegraut). Klicks zeichnen das Panel neu.
 */
async function manageReply(c, type, notice) {
    const [log, stats] = await Promise.all([
        c.api.asUser(c.discordId, 'GET', '/team/me/shifts?days=1'),
        c.api.asUser(c.discordId, 'GET', '/team/me/shift-stats'),
    ]);
    const current = log.items.find((s) => s.active);
    const onBreak = current?.status === 'BREAK';
    const st = current ? format_1.DUTY_DE[current.status] : undefined;
    const typeName = current ? current.shiftType : type?.name ?? null;
    const description = [
        ...(notice ? [notice, ''] : []),
        ...(current ? ['### 🕒 Aktuelle Schicht', `**Status**: ${st?.emoji ?? '🟢'} ${st?.label ?? current.status}`, `**Begonnen**: ${ts(current.startedAt, 'R')}`,
            `**Dauer**: ${long(current.minutes - current.breakMinutes)}`, `**Pausen**: ${current.breaks ? `${current.breaks} (${long(current.breakMinutes)})` : 'keine'}`, ''] : []),
        '### 📋 Gesamtübersicht',
        `**Anzahl Schichten**: ${stats.count}`,
        `**Gesamtdauer**: ${long(stats.minutes)}`,
        `**Durchschnittliche Dauer**: ${long(stats.count ? stats.minutes / stats.count : 0)}`,
        ...(typeName ? ['', `-# Schichtart: ${(0, format_1.plain)(typeName)}`] : []),
    ].join('\n');
    const buttons = [
        { id: `shift:on${!current && type ? `:${type.id}` : ''}`, label: 'Start', style: 'success', emoji: '▶️', disabled: !!current },
        { id: 'shift:break', label: onBreak ? 'Pause beenden' : 'Pause', style: 'primary', emoji: '⏸️', disabled: !current },
        { id: 'shift:off', label: 'Beenden', style: 'danger', emoji: '⏹️', disabled: !current },
    ];
    return { ephemeral: true, buttons, embeds: [{ box: true, heading: 'small', title: 'Schichtverwaltung', description: (0, format_1.clip)(description, 3900) }] };
}
/** Status setzen und das Panel neu zeichnen; „schon so“ (409) und Fehler stehen oben im Panel. */
async function switchTo(c, status, type) {
    let notice;
    try {
        await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status, ...(type ? { shiftType: type.id } : {}) });
        notice = status === 'ON_DUTY' && type ? `🟢 Schicht **${(0, format_1.plain)(type.name)}** gestartet.` : `${format_1.DUTY_DE[status].emoji} Du bist jetzt **${format_1.DUTY_DE[status].label}**.`;
    }
    catch (e) {
        notice = e instanceof api_1.BotApiError && e.status === 409 ? `Du bist bereits **${format_1.DUTY_DE[status].label}**.` : (0, errors_1.mapError)(e).content ?? '❌ Das hat nicht geklappt.';
    }
    return manageReply(c, type, notice);
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
const MEDALS = ['🥇', '🥈', '🥉'];
/** `/shift leaderboard`: alle nach Zeit im Dienst (ohne Pausen), eigene Platzierung unten. */
async function leaderboard(c) {
    try {
        const d = days(c);
        const r = await c.api.asUser(c.discordId, 'GET', `/team/leaderboard?days=${d}`);
        const lines = r.users.slice(0, 20).map((u, i) => `${MEDALS[i] ?? `\`${i + 1}.\``} **${(0, format_1.plain)(u.callsign ?? u.name)}**${u.callsign ? ` (${(0, format_1.plain)(u.name)})` : ''} · ${hm(u.minutes)}${u.userId === r.me ? ' ← du' : ''}`);
        const mine = r.users.findIndex((u) => u.userId === r.me);
        return { ephemeral: true, embeds: [{ title: `🏆 Rangliste (${period(r.days)})`, color: format_1.COLORS.info,
                    description: (0, format_1.clip)(lines.length ? `${lines.join('\n')}${r.users.length > 20 ? `\n… und ${r.users.length - 20} weitere` : ''}` : 'Im Zeitraum war niemand im Dienst.', 4000),
                    ...(r.users.length ? { footer: mine >= 0 ? `Dein Platz: ${mine + 1} von ${r.users.length} · ${hm(r.users[mine].minutes)}` : 'Du warst im Zeitraum nicht im Dienst.' } : {}) }] };
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
        name: 'shift', description: 'Schichten: starten, Pause, beenden, wer im Dienst ist und Rangliste',
        subcommands: [
            { name: 'manage', description: 'Deine Schicht verwalten: starten, Pause machen, beenden', options: [{ name: 'type', description: 'Die Schichtart (leer = Auswahl bzw. Standard)', type: 'string', maxLength: 40, autocomplete: true }] },
            { name: 'active', description: 'Alle, die gerade eine Schicht haben' },
            { name: 'admin', description: 'Schichten eines Mitglieds verwalten und Infos ansehen', options: [
                    { name: 'member', description: 'Discord-Mitglied', type: 'user', required: true },
                    { name: 'days', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 },
                ] },
            { name: 'leaderboard', description: 'Alle Mitglieder nach ihrer Zeit im Dienst', options: [{ name: 'days', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 }] },
        ],
        async complete(c, option, value) {
            if (option !== 'type')
                return [];
            const v = value.trim().toLowerCase();
            return (await shiftTypes(c)).filter((t) => !v || t.name.toLowerCase().includes(v) || t.id.includes(v)).map((t) => ({ name: t.name, value: t.id }));
        },
        async run(c) {
            switch (c.opts._sub) {
                case 'active': return active(c);
                case 'leaderboard': return leaderboard(c);
                case 'admin': try {
                    return await adminReply(c, String(c.opts.member ?? ''), days(c));
                }
                catch (e) {
                    return (0, errors_1.mapError)(e);
                }
                case 'manage': {
                    const wanted = String(c.opts.type ?? '').trim();
                    try {
                        const types = await shiftTypes(c);
                        const t = pickType(types, wanted || undefined);
                        if (wanted && !t)
                            return (0, format_1.errorReply)(types.length ? `Unbekannte Schichtart. Verfügbar: ${types.map((x) => `**${(0, format_1.plain)(x.name)}**`).join(', ')}.` : 'Auf diesem Server sind keine Schichtarten eingerichtet – einfach `/shift manage` ohne Schichtart.');
                        return await manageReply(c, t);
                    }
                    catch (e) {
                        return (0, errors_1.mapError)(e);
                    }
                }
                default: return (0, format_1.errorReply)('Unbekannter Unterbefehl.');
            }
        },
    },
];
/**
 * Buttons aus `/shift manage` (zeichnen das Panel neu): `shift:on[:<schichtart>]`, `shift:break` (Pause an/aus), `shift:off`;
 * aus `/shift admin`: `shift:end:<userId>:<discordId>` (Schicht eines Mitglieds beenden).
 */
exports.SHIFT_INTERACTION = {
    prefix: 'shift',
    updatesMessage: (args) => args[0] === 'on' || args[0] === 'break' || args[0] === 'off',
    async run(c) {
        const [action, userId, discordId] = c.args;
        try {
            if (action === 'on') {
                const types = await shiftTypes(c);
                const t = userId ? findType(types, userId) : undefined;
                return await switchTo(c, 'ON_DUTY', t);
            }
            if (action === 'break') {
                const me = await c.api.asUser(c.discordId, 'GET', '/team/me');
                return await switchTo(c, me?.status === 'BREAK' ? 'ON_DUTY' : 'BREAK');
            }
            if (action === 'off')
                return await switchTo(c, 'OFF_DUTY');
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
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