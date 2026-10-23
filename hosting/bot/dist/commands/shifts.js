"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHIFT_INTERACTION = exports.SHIFT_COMMANDS = exports.permittedFor = void 0;
exports.manageReply = manageReply;
exports.adminReply = adminReply;
exports.parseShiftDuration = parseShiftDuration;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
const ts = (iso, style = 'f') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
async function shiftTypes(c) {
    const cfg = await c.api.service('GET', '/bot/shifts').catch(() => null);
    return cfg?.enabled ? cfg.types : [];
}
/** Darf der Aufrufer die Schichtart nutzen (erlaubte Rollen)? Außerhalb eines Servers entscheidet die API. */
const permittedFor = (c, t) => !t.permittedRoleIds?.length || !c.memberRoleIds || t.permittedRoleIds.some((r) => c.memberRoleIds.includes(r));
exports.permittedFor = permittedFor;
/** Schichtart aus der Eingabe (ID oder Name, ohne Groß-/Kleinschreibung). */
const findType = (types, wanted) => { const w = wanted.trim().toLowerCase(); return types.find((x) => x.id === w || x.name.toLowerCase() === w); };
/** Schichtart fürs Panel: gewählte, sonst Standard bzw. erste (wie Trident „Shift Type“); ohne eingerichtete Arten keine. */
const pickType = (c, types, wanted) => {
    if (wanted)
        return findType(types, wanted);
    const usable = types.filter((t) => (0, exports.permittedFor)(c, t));
    return usable.find((t) => t.isDefault) ?? usable[0];
};
const STATUS_EN = { ON_DUTY: 'On Shift', BREAK: 'On Break', TRAINING: 'Training', ADMINISTRATIVE: 'Administrative' };
/**
 * `/shift manage`: Panel wie bei Trident – Kopfzeile „Shift Management“ mit Profilbild, laufende Schicht,
 * „All Time Information“ (Anzahl, Gesamt- und Durchschnittsdauer), Schichtart und immer „Start“, „Pause“, „End“
 * (was gerade nicht geht, ist ausgegraut). Das Panel ist für alle im Channel sichtbar; Klicks des Besitzers zeichnen
 * es neu, die Buttons tragen dafür seine Discord-ID.
 */
async function manageReply(c, type, notice) {
    const [log, stats] = await Promise.all([
        c.api.asUser(c.discordId, 'GET', '/team/me/shifts?days=1'),
        c.api.asUser(c.discordId, 'GET', '/team/me/shift-stats'),
    ]);
    const current = log.items.find((s) => s.active);
    const onBreak = current?.status === 'BREAK';
    const typeName = current ? current.shiftType : type?.name ?? null;
    const total = stats.seconds ?? stats.minutes * 60;
    const running = current ? (Date.now() - new Date(current.startedAt).getTime()) / 1000 - current.breakMinutes * 60 : 0;
    const description = [
        ...(notice ? [notice, ''] : []),
        ...(current ? ['### 🕒 Current Shift', `**Status**: ${STATUS_EN[current.status] ?? current.status}`, `**Started**: ${ts(current.startedAt, 'R')}`,
            `**Duration**: ${(0, format_1.shiftDuration)(running)}`, `**Breaks**: ${current.breaks ? `${current.breaks} (${(0, format_1.shiftDuration)(current.breakMinutes * 60)})` : 'none'}`, ''] : []),
        '### 📋 All Time Information',
        `**Shift Count**: ${stats.count}`,
        `**Total Duration**: ${(0, format_1.shiftDuration)(total)}`,
        `**Average Duration**: ${(0, format_1.shiftDuration)(stats.count ? total / stats.count : 0)}`,
        '', `-# Shift Type: ${typeName ? (0, format_1.plain)(typeName) : 'default'}`,
    ].join('\n');
    const buttons = [
        { id: `shift:on:${!current && type ? type.id : ''}:${c.discordId}`, label: 'Start', style: 'success', emoji: '▶️', disabled: !!current },
        { id: `shift:break:${c.discordId}`, label: onBreak ? 'Resume' : 'Pause', style: 'primary', emoji: '⏸️', disabled: !current },
        { id: `shift:off:${c.discordId}`, label: 'End', style: 'danger', emoji: '⏹️', disabled: !current },
    ];
    return { ephemeral: false, panel: true, buttons, embeds: [{ author: { name: 'Shift Management', ...(c.userAvatar ? { iconUrl: c.userAvatar } : {}) }, title: '', description: (0, format_1.clip)(description, 3900) }] };
}
const NOTICE = { ON_DUTY: '🟢 Your shift is now **active**.', BREAK: '🟡 You are now **on break**.', OFF_DUTY: '🔴 Your shift has **ended**.' };
/** Status setzen und das Panel neu zeichnen; „schon so“ (409) und Fehler stehen oben im Panel. */
async function switchTo(c, status, type) {
    let notice;
    try {
        await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status, ...(type ? { shiftType: type.id } : {}) });
        notice = status === 'ON_DUTY' && type ? `🟢 Shift **${(0, format_1.plain)(type.name)}** started.` : NOTICE[status];
    }
    catch (e) {
        notice = e instanceof api_1.BotApiError && e.status === 409 ? `Du bist bereits **${format_1.DUTY_DE[status].label}**.` : (0, errors_1.mapError)(e).content ?? '❌ Das hat nicht geklappt.';
    }
    return manageReply(c, type, notice);
}
/** Kopfzeile wie bei Trident: Server-Name mit Icon. */
const serverAuthor = (c) => (c.guildName ? { author: { name: (0, format_1.clip)(c.guildName, 200), ...(c.guildIcon ? { iconUrl: c.guildIcon } : {}) } } : {});
const who = (u) => (u.discordId ? `<@${u.discordId}>` : `**${(0, format_1.plain)(u.name)}**`);
/** `/shift active` wie Trident: „Active Shifts“ mit Mitglied, Dauer ohne Pausen, Pause und Schichtart. */
async function active(c) {
    try {
        const rows = await c.api.asUser(c.discordId, 'GET', '/team/active-shifts');
        const lines = rows.slice(0, 30).map((r, i) => `\`${i + 1}.\` ${who(r)} • ${(0, format_1.shiftDuration)(r.seconds)}${r.status === 'BREAK' ? ' (On Break)' : ''}${r.shiftType ? ` • ${(0, format_1.plain)(r.shiftType)}` : ''}`);
        return { ephemeral: false, embeds: [{ ...serverAuthor(c), title: '🕒 Active Shifts',
                    description: (0, format_1.clip)(lines.length ? `${lines.join('\n')}${rows.length > 30 ? `\n… and ${rows.length - 30} more` : ''}` : 'There are no active shifts.', 4000) }] };
    }
    catch (e) {
        return (0, errors_1.mapError)(e);
    }
}
const boardPath = (d, type) => `/team/leaderboard${[d ? `days=${d}` : '', type ? `shiftType=${type}` : ''].filter(Boolean).reduce((q, x, i) => `${q}${i ? '&' : '?'}${x}`, '')}`;
/** `/shift leaderboard` wie Trident: alle nach Zeit im Dienst (ohne Pausen), Standard alle Zeiten; Button „Raw Shift Data“ (CSV). */
async function leaderboard(c) {
    try {
        const d = c.opts.days ? Number(c.opts.days) : null;
        const wanted = String(c.opts.type ?? '').trim();
        const t = wanted ? findType(await shiftTypes(c), wanted) : undefined;
        if (wanted && !t)
            return (0, format_1.errorReply)('Unbekannte Schichtart.');
        const r = await c.api.asUser(c.discordId, 'GET', boardPath(d, t?.id ?? ''));
        const lines = r.users.slice(0, 25).map((u, i) => `\`${i + 1}.\` ${who(u)} • ${(0, format_1.shiftDuration)(u.seconds)}`);
        const footer = `Showing ${t ? `Shift Type: ${t.name}` : 'All Shift Types'}${d ? ` · last ${d === 1 ? '24 hours' : `${d} days`}` : ''}`;
        return { ephemeral: false, embeds: [{ ...serverAuthor(c), title: 'Shift Leaderboard',
                    description: (0, format_1.clip)(lines.length ? `${lines.join('\n')}${r.users.length > 25 ? `\n… and ${r.users.length - 25} more` : ''}` : 'No shifts yet.', 4000), footer }],
            buttons: [{ id: `shift:raw:${d ?? 0}:${t?.id ?? ''}`, label: 'Raw Shift Data', style: 'secondary' }] };
    }
    catch (e) {
        return (0, errors_1.mapError)(e);
    }
}
/** „Raw Shift Data“: komplette Rangliste als CSV (nur für den Klickenden). */
async function rawData(c, days, type) {
    const d = Number(days) || null;
    const r = await c.api.asUser(c.discordId, 'GET', boardPath(d, type && /^[a-z0-9-]{1,40}$/.test(type) ? type : ''));
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['Place,Name,Callsign,Discord ID,Shifts,Total Seconds,Total Time', ...r.users.map((u, i) => [i + 1, q(u.name), q(u.callsign), q(u.discordId), u.shifts, u.seconds, q((0, format_1.shiftDuration)(u.seconds))].join(','))].join('\n');
    return { ephemeral: true, content: `📄 Raw shift data (${r.users.length} ${r.users.length === 1 ? 'member' : 'members'})`, files: [{ name: 'shift-data.csv', data: csv }] };
}
const LAST_STATUS = { ENDED: '⚫ Ended', ON_DUTY: '🟢 Active', BREAK: '🟡 On Break', TRAINING: '🟢 Training', ADMINISTRATIVE: '🟢 Administrative' };
/**
 * `/shift admin` wie Trident: Kopfzeile „Shift Management: @Mitglied“ mit Profilbild, All Time Information, Last Shift,
 * Menü „Shift Actions“ (Liste, ändern, löschen, alle löschen) und Start/Pause/End für das Mitglied.
 */
async function adminReply(c, discordId, notice) {
    if (!/^\d{15,25}$/.test(discordId))
        return (0, format_1.errorReply)('Bitte ein Mitglied auswählen.');
    const log = await c.api.asUser(c.discordId, 'GET', `/team/shifts?discordId=${discordId}&days=1`);
    if (!log.member)
        return (0, format_1.errorReply)(`<@${discordId}> ist mit keinem Konto im System verknüpft.`);
    const userId = log.member.userId;
    const [stats, name, avatar] = await Promise.all([
        c.api.asUser(c.discordId, 'GET', `/team/${userId}/shift-stats`),
        c.userNameOf?.(discordId).catch(() => null) ?? null,
        c.userAvatarOf?.(discordId).catch(() => null) ?? null,
    ]);
    const current = log.items.find((s) => s.active);
    const total = stats.seconds ?? stats.minutes * 60;
    const description = [
        ...(notice ? [notice, ''] : []),
        '### 📋 All Time Information',
        `**Shift Count**: ${stats.count}`,
        `**Total Duration**: ${(0, format_1.shiftDuration)(total)}`,
        `**Average Duration**: ${(0, format_1.shiftDuration)(stats.count ? total / stats.count : 0)}`,
        ...(stats.last ? ['', '### 🕒 Last Shift', `**Status**: ${LAST_STATUS[stats.last.status] ?? stats.last.status}`, `**Total Time**: ${(0, format_1.shiftDuration)(stats.last.seconds)}`, ...(stats.last.shiftId ? [`**Shift ID**: \`${stats.last.shiftId}\``] : [])] : []),
        '', `-# Shift Type: ${stats.last?.shiftType ? (0, format_1.plain)(stats.last.shiftType) : 'default'}`,
    ].join('\n');
    const ref = `${userId}:${discordId}`;
    const onBreak = current?.status === 'BREAK';
    return {
        ephemeral: false, panel: true,
        embeds: [{ author: { name: (0, format_1.clip)(`Shift Management: @${name ?? log.member.name}`, 200), ...(avatar ? { iconUrl: avatar } : {}) }, title: '', description: (0, format_1.clip)(description, 3900) }],
        select: { id: `shift:act:${ref}`, placeholder: 'Shift Actions', options: [
                { label: 'View Shift List', value: 'list', description: 'View all shifts for this user', emoji: '📃' },
                { label: 'Modify Shift', value: 'modify', description: 'Modify a shift: add, remove, or set time', emoji: '🕒' },
                { label: 'Delete Shift', value: 'delete', description: 'Delete a shift', emoji: '❌' },
                { label: 'Clear User Shifts', value: 'clear', description: 'Clear all shifts for this user', emoji: '🗑️' },
            ] },
        buttons: [
            { id: `shift:as:on:${ref}`, label: 'Start', style: 'success', emoji: '▶️', disabled: !!current },
            { id: `shift:as:break:${ref}`, label: onBreak ? 'Resume' : 'Pause', style: 'primary', emoji: '⏸️', disabled: !current },
            { id: `shift:as:off:${ref}`, label: 'End', style: 'danger', emoji: '⏹️', disabled: !current },
        ],
    };
}
/** Dauer wie „1h 30m“, „45m“, „2h“, „90s“, „1d 2h“; reine Zahl = Minuten. Sekunden oder `null`. */
function parseShiftDuration(input) {
    const t = input.trim().toLowerCase().replace(/\s+/g, '');
    if (/^\d+$/.test(t))
        return Number(t) * 60;
    if (!t || !/^(\d+(?:[.,]\d+)?(?:d|h|std|min|m|s))+$/.test(t))
        return null;
    const unit = { d: 86_400, h: 3_600, std: 3_600, min: 60, m: 60, s: 1 };
    let sec = 0;
    for (const [, n, u] of t.matchAll(/(\d+(?:[.,]\d+)?)(d|h|std|min|m|s)/g))
        sec += Number(n.replace(',', '.')) * unit[u];
    return Number.isFinite(sec) ? Math.round(sec) : null;
}
/** „View Shift List“: alle Schichten des Mitglieds mit ID (nur für den Klickenden). */
async function shiftList(c, discordId) {
    const log = await c.api.asUser(c.discordId, 'GET', `/team/shifts?discordId=${discordId}&days=3650`);
    const items = log.items;
    const lines = items.slice(0, 25).map((s, i) => `\`${i + 1}.\` ${ts(s.startedAt)} • ${(0, format_1.shiftDuration)(s.seconds ?? (s.minutes - s.breakMinutes) * 60)}${s.shiftType ? ` • ${(0, format_1.plain)(s.shiftType)}` : ''}${s.active ? ' • 🟢 Active' : ''}\n-# Shift ID: ${s.shiftId ? `\`${s.shiftId}\`` : '—'}`);
    return { ephemeral: true, embeds: [{ title: (0, format_1.clip)(`Shift List: ${log.member?.name ?? ''}`, 256), color: format_1.COLORS.info,
                description: (0, format_1.clip)(lines.length ? `${lines.join('\n')}${items.length > 25 ? `\n… and ${items.length - 25} more` : ''}` : 'This user has no shifts.', 4000) }] };
}
/** Formulare aus dem Menü „Shift Actions“; die letzte Schicht ist vorausgefüllt. */
async function actionModal(c, kind, userId, discordId) {
    const stats = await c.api.asUser(c.discordId, 'GET', `/team/${userId}/shift-stats`).catch(() => null);
    const last = stats?.last?.shiftId ?? undefined;
    const shiftField = { id: 'shift', label: 'Shift ID', required: true, maxLength: 25, placeholder: 'z. B. 1508566299347784460', ...(last ? { value: last } : {}) };
    if (kind === 'delete')
        return { modal: { id: `shift:del:${userId}:${discordId}`, title: 'Delete Shift', fields: [shiftField] } };
    return { modal: { id: `shift:mod:${userId}:${discordId}`, title: 'Modify Shift', fields: [
                shiftField,
                { id: 'action', label: 'Action', kind: 'select', required: true, options: [{ label: 'Add time', value: 'add', default: true }, { label: 'Remove time', value: 'remove' }, { label: 'Set time', value: 'set' }] },
                { id: 'duration', label: 'Duration', required: true, maxLength: 30, placeholder: 'z. B. 1h 30m, 45m, 2h' },
            ] } };
}
/** Wert eines Formularfelds (Text oder Auswahl). */
const fieldOf = (c, id) => {
    const v = c.modal?.values[id] ?? c.fields?.[id];
    return String(Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
};
exports.SHIFT_COMMANDS = [
    {
        name: 'shift', description: 'Schichten: starten, Pause, beenden, wer im Dienst ist und Rangliste',
        subcommands: [
            { name: 'manage', description: 'Deine Schicht verwalten: starten, Pause machen, beenden', options: [{ name: 'type', description: 'Die Schichtart (leer = Auswahl bzw. Standard)', type: 'string', maxLength: 40, autocomplete: true }] },
            { name: 'active', description: 'Alle, die gerade eine Schicht haben' },
            { name: 'admin', description: 'Schichten eines Mitglieds verwalten und Infos ansehen', options: [
                    { name: 'member', description: 'Discord-Mitglied', type: 'user', required: true },
                ] },
            { name: 'leaderboard', description: 'Alle Mitglieder nach ihrer Zeit im Dienst', options: [
                    { name: 'type', description: 'Nur diese Schichtart (leer = alle)', type: 'string', maxLength: 40, autocomplete: true },
                    { name: 'days', description: 'Nur die letzten Tage (leer = alle Zeiten)', type: 'integer', min: 1, max: 3650 },
                ] },
        ],
        publicReply: () => true, // alles rund um Schichten ist für alle im Channel sichtbar
        async complete(c, option, value) {
            if (option !== 'type')
                return [];
            const v = value.trim().toLowerCase();
            return (await shiftTypes(c)).filter((t) => c.opts._sub === 'leaderboard' || (0, exports.permittedFor)(c, t)).filter((t) => !v || t.name.toLowerCase().includes(v) || t.id.includes(v)).map((t) => ({ name: t.name, value: t.id }));
        },
        async run(c) {
            switch (c.opts._sub) {
                case 'active': return active(c);
                case 'leaderboard': return leaderboard(c);
                case 'admin': try {
                    return await adminReply(c, String(c.opts.member ?? ''));
                }
                catch (e) {
                    return (0, errors_1.mapError)(e);
                }
                case 'manage': {
                    const wanted = String(c.opts.type ?? '').trim();
                    try {
                        const types = await shiftTypes(c);
                        const t = pickType(c, types, wanted || undefined);
                        if (t && !(0, exports.permittedFor)(c, t))
                            return (0, format_1.errorReply)(`Für die Schichtart **${(0, format_1.plain)(t.name)}** fehlt dir die passende Rolle.`);
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
 * Buttons aus `/shift manage` (zeichnen das Panel neu): `shift:on:<schichtart|leer>:<besitzer>`, `shift:break:<besitzer>` (Pause an/aus),
 * `shift:off:<besitzer>` – nur der Besitzer des Panels darf sie benutzen (ältere Panels ohne Besitzer: wer klickt);
 * aus `/shift admin`: `shift:end:<userId>:<discordId>` (Schicht eines Mitglieds beenden).
 */
/** Aktionen aus `/shift admin`: `act:<userId>:<discordId>` (Menü), `mod`/`del` (Formulare), `as:<on|break|off>`, `clear` (Bestätigung). */
async function adminAction(c, args) {
    const [action] = args;
    const [userId, discordId] = action === 'as' ? args.slice(2) : args.slice(1);
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId) || !discordId || !/^\d{15,25}$/.test(discordId))
        return (0, format_1.errorReply)('Unbekannte Aktion.');
    if (action === 'act') {
        const pick = c.values?.[0];
        if (pick === 'list')
            return shiftList(c, discordId);
        if (pick === 'modify' || pick === 'delete')
            return actionModal(c, pick, userId, discordId);
        if (pick === 'clear')
            return { ephemeral: true, content: `⚠️ Really delete **all ended shifts** of <@${discordId}>? This cannot be undone.`, buttons: [{ id: `shift:clear:${userId}:${discordId}`, label: 'Clear User Shifts', style: 'danger', emoji: '🗑️' }] };
        return (0, format_1.errorReply)('Unbekannte Aktion.');
    }
    if (action === 'as') {
        const status = { on: 'ON_DUTY', break: 'BREAK', off: 'OFF_DUTY' }[args[1] ?? ''];
        if (!status)
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        let next = status;
        if (status === 'BREAK') {
            const log = await c.api.asUser(c.discordId, 'GET', `/team/shifts?discordId=${discordId}&days=1`);
            if (log.items.find((s) => s.active)?.status === 'BREAK')
                next = 'ON_DUTY';
        }
        let notice;
        try {
            await c.api.asUser(c.discordId, 'PUT', `/team/${userId}/status`, { status: next });
            notice = { ON_DUTY: status === 'BREAK' ? '🟢 Break ended.' : '🟢 Shift started.', BREAK: '🟡 Break started.', OFF_DUTY: '🔴 Shift ended.' }[next];
        }
        catch (e) {
            if (!(e instanceof api_1.BotApiError && e.status === 409))
                return (0, errors_1.mapError)(e);
            notice = 'Status was already set.';
        }
        return adminReply(c, discordId, notice);
    }
    if (action === 'mod') {
        const shiftId = fieldOf(c, 'shift'), how = fieldOf(c, 'action') || 'add', sec = parseShiftDuration(fieldOf(c, 'duration'));
        if (!/^\d{1,25}$/.test(shiftId))
            return (0, format_1.errorReply)('Bitte eine gültige Shift ID angeben.');
        if (!['add', 'remove', 'set'].includes(how))
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        if (sec === null)
            return (0, format_1.errorReply)('Ungültige Dauer – z. B. `1h 30m`, `45m` oder `2h`.');
        const r = await c.api.asUser(c.discordId, 'PATCH', `/team/shifts/${shiftId}`, { action: how, seconds: sec });
        return adminReply(c, discordId, `✅ Shift \`${shiftId}\` modified – new total time: ${(0, format_1.shiftDuration)(r.seconds)}.`);
    }
    if (action === 'del') {
        const shiftId = fieldOf(c, 'shift');
        if (!/^\d{1,25}$/.test(shiftId))
            return (0, format_1.errorReply)('Bitte eine gültige Shift ID angeben.');
        await c.api.asUser(c.discordId, 'DELETE', `/team/shifts/${shiftId}`);
        return adminReply(c, discordId, `🗑️ Shift \`${shiftId}\` deleted.`);
    }
    if (action === 'clear') {
        const r = await c.api.asUser(c.discordId, 'DELETE', `/team/${userId}/shifts`);
        return (0, format_1.okReply)(`Cleared all ended shifts of <@${discordId}> (${r.deleted} ${r.deleted === 1 ? 'entry' : 'entries'}). Run \`/shift admin\` again to see the update.`);
    }
    return (0, format_1.errorReply)('Unbekannte Aktion.');
}
exports.SHIFT_INTERACTION = {
    prefix: 'shift',
    updatesMessage: (args) => args[0] === 'on' || args[0] === 'break' || args[0] === 'off',
    opensModal: (args, values) => args[0] === 'act' && (values?.[0] === 'modify' || values?.[0] === 'delete'),
    // `/shift admin`: Menü, Formulare und Start/Pause/End zeichnen das Panel neu (Listen, Rückfragen und Fehler privat)
    panel: (args) => ['act', 'mod', 'del', 'as'].includes(args[0] ?? ''),
    async run(c) {
        const [action, userId, discordId] = c.args;
        const owner = action === 'on' ? discordId : action === 'break' || action === 'off' ? userId : undefined;
        if (owner && owner !== c.discordId)
            return (0, format_1.errorReply)(`Das ist die Schichtverwaltung von <@${owner}>. Für deine eigene Schicht: \`/shift manage\`.`);
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
        if (action === 'raw') {
            try {
                return await rawData(c, userId, discordId);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        }
        if (['act', 'mod', 'del', 'as', 'clear'].includes(action ?? '')) {
            try {
                return await adminAction(c, c.args);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
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
        // öffentliche Nachricht aus `/shift admin` neu zeichnen, Bestätigung nur für den Klickenden
        try {
            return discordId ? { ...(0, format_1.okReply)('Schicht beendet.'), update: await adminReply(c, discordId) } : (0, format_1.okReply)('Schicht beendet.');
        }
        catch {
            return (0, format_1.okReply)('Schicht beendet.');
        }
    },
};
//# sourceMappingURL=shifts.js.map