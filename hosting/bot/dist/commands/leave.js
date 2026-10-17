"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEAVE_INTERACTION = exports.LEAVE_COMMANDS = void 0;
exports.berlinTime = berlinTime;
exports.parseLeaveDate = parseLeaveDate;
exports.parseDuration = parseDuration;
exports.manageReply = manageReply;
exports.adminReply = adminReply;
exports.listReply = listReply;
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Zeitpunkt in deutscher Zeit (Europe/Berlin) → Date (berücksichtigt Sommer-/Winterzeit). */
function berlinTime(y, m, d, h, min) {
    const guess = Date.UTC(y, m - 1, d, h, min);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    return new Date(guess - (shown - guess));
}
/**
 * Datum aus Discord-Eingabe: „heute“, „morgen“, „24.12.“, „24.12.2026“, optional mit Uhrzeit „24.12.2026 18:00“.
 * Ohne Uhrzeit: Beginn 00:00, Ende 23:59. `null` bei ungültiger Eingabe.
 */
function parseLeaveDate(input, end, now = new Date()) {
    const t = input.trim().toLowerCase();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now).split('-').map(Number);
    let y, m, d, rest = '';
    const rel = t.match(/^(heute|morgen|übermorgen)(.*)$/);
    if (rel) {
        const add = rel[1] === 'heute' ? 0 : rel[1] === 'morgen' ? 1 : 2;
        const base = new Date(Date.UTC(today[0], today[1] - 1, today[2] + add));
        [y, m, d] = [base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()];
        rest = rel[2] ?? '';
    }
    else {
        const x = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(.*)$/);
        if (!x)
            return null;
        d = Number(x[1]);
        m = Number(x[2]);
        y = x[3] ? (x[3].length === 2 ? 2000 + Number(x[3]) : Number(x[3])) : today[0];
        rest = x[4] ?? '';
        // „24.12.“ ohne Jahr, schon vorbei → nächstes Jahr
        if (!x[3] && Date.UTC(y, m - 1, d) < Date.UTC(today[0], today[1] - 1, today[2]))
            y++;
    }
    const time = rest.trim().replace(/^(um|,)\s*/, '').replace(/\s*uhr$/, '');
    let h = end ? 23 : 0, min = end ? 59 : 0;
    if (time) {
        const tm = time.match(/^(\d{1,2})(?::(\d{2}))?$/);
        if (!tm)
            return null;
        h = Number(tm[1]);
        min = Number(tm[2] ?? 0);
        if (h > 23 || min > 59)
            return null;
    }
    if (m < 1 || m > 12 || d < 1 || d > 31)
        return null;
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCMonth() !== m - 1)
        return null; // z. B. 31.02.
    return berlinTime(y, m, d, h, min);
}
const fmt = (iso) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const HOUR = 3_600_000;
const UNIT_MS = { m: 60_000, min: 60_000, h: HOUR, std: HOUR, d: 24 * HOUR, t: 24 * HOUR, w: 168 * HOUR };
/**
 * Dauer wie bei Trident: „6h“, „4d“, „2w“, auch kombiniert („1w 2d“) und deutsch („3t“ = 3 Tage, „5std“).
 * Ergebnis in Millisekunden; `null` bei ungültiger Eingabe oder unter einer Stunde.
 */
function parseDuration(input) {
    const t = input.trim().toLowerCase().replace(/\s+/g, '');
    if (!t || !/^(\d+(?:[.,]\d+)?(?:min|std|m|h|d|t|w))+$/.test(t))
        return null;
    let ms = 0;
    for (const [, n, u] of t.matchAll(/(\d+(?:[.,]\d+)?)(min|std|m|h|d|t|w)/g))
        ms += Number(n.replace(',', '.')) * UNIT_MS[u];
    return ms >= HOUR && Number.isFinite(ms) ? Math.round(ms) : null;
}
const ts = (iso, style = 'F') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
/** Abschnitt „Aktuelle Abmeldung“ wie bei Trident: Status, Beginn, Ende, Dauer, Grund, ID. */
function currentBlock(r) {
    const status = r.active ? '🟢 Aktiv' : r.status === 'PENDING' ? '🟡 Wartet auf Freigabe' : '📅 Geplant';
    return [`### Aktuelle Abmeldung`, `**Status**: ${status}`, `**Beginn**: ${ts(r.startsAt, 'f')}`, `**Ende**: ${ts(r.endsAt, 'f')} (${ts(r.endsAt, 'R')})`,
        `**Dauer**: ${(0, format_1.humanDuration)(new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime())}`, `**Grund**: ${(0, format_1.clip)((0, format_1.plain)(r.reason), 800)}`,
        ...(r.extensionMinutes ? [`**Verlängerung**: ⏳ +${(0, format_1.humanDuration)(r.extensionMinutes * 60_000)} beantragt – wartet auf die Leitung`] : []), `-# ID: ${r.number}`].join('\n');
}
/** „Verlängern“ + „Vorzeitig beenden“ / „Antrag zurückziehen“ / „Absagen“ zur aktuellen Abmeldung. */
const currentButtons = (r) => [
    { id: `leave:extend:${r.id}`, label: 'Verlängern', style: 'primary', emoji: '🕒' },
    { id: `leave:cancel:${r.id}`, label: r.active ? 'Vorzeitig beenden' : r.status === 'PENDING' ? 'Antrag zurückziehen' : 'Absagen', style: 'danger', emoji: '⏹️' },
];
/** Offene, laufende oder geplante Abmeldung (in dieser Reihenfolge). */
const currentOf = (items) => items.find((r) => r.status === 'APPROVED' && r.active) ?? items.find((r) => r.status === 'PENDING') ?? items.find((r) => r.status === 'APPROVED' && new Date(r.startsAt).getTime() > Date.now());
/** `/leave manage`: eigene Abmeldung ansehen, starten, verlängern, zurückziehen oder vorzeitig beenden (wie Trident). */
async function manageReply(c) {
    const { items } = await c.api.asUser(c.discordId, 'GET', '/leave?mine=true');
    const current = currentOf(items);
    const last = items.find((r) => r.status === 'ENDED');
    const box = (description) => ({ box: true, heading: 'small', ...(c.userName ? { author: { name: `@${c.userName}`, ...(c.userAvatar ? { iconUrl: c.userAvatar } : {}) } } : {}), title: 'Abmeldungen verwalten', description });
    if (current)
        return { ephemeral: true, embeds: [box(currentBlock(current))], buttons: currentButtons(current) };
    const start = [{ id: 'leave:start', label: 'Start', style: 'primary', emoji: '🕒' }];
    if (!items.length)
        return { ephemeral: true, embeds: [box('Du warst noch nie abgemeldet.\nUm jetzt eine Abmeldung zu starten, klicke auf `Start`.')], buttons: start };
    return { ephemeral: true, embeds: [box(`${last ? `Deine letzte Abmeldung endete ${ts(last.endedAt ?? last.endsAt)}.` : 'Du hast gerade keine Abmeldung.'}\nUm eine neue Abmeldung zu starten, klicke auf \`Start\`.`)], buttons: start };
}
const DAY_MS = 24 * HOUR;
/** Dauer kurz wie bei Trident: „[3 Tage]“, „[6 Std.]“. */
const span = (ms) => { const d = Math.round(ms / DAY_MS); if (d >= 1)
    return `${d} ${d === 1 ? 'Tag' : 'Tage'}`; const h = Math.max(1, Math.round(ms / HOUR)); return `${h} Std.`; };
const STATE_DE = { PENDING: '⏳ ausstehend', DENIED: '❌ abgelehnt', CANCELLED: '↩️ zurückgezogen' };
const leaveState = (r) => (r.active ? '🟢 läuft' : r.status === 'APPROVED' && new Date(r.startsAt).getTime() > Date.now() ? '📅 geplant' : STATE_DE[r.status] ?? '');
const memberHead = async (c, discordId) => ({ name: `Abmeldungsverwaltung: @${(await c.userNameOf?.(discordId)) ?? discordId}` });
/** `/leave admin`: Abmeldungen eines Mitglieds verwalten (Leitung) – Verlauf, Abmeldung starten, beenden, erweiterter Verlauf (wie Trident). */
async function adminReply(c, discordId) {
    if (!/^\d{15,25}$/.test(discordId))
        return (0, format_1.errorReply)('Bitte ein Mitglied auswählen.');
    const { items } = await c.api.asUser(c.discordId, 'GET', `/leave?discordId=${discordId}&status=ALL`);
    const current = currentOf(items);
    const list = items.slice(0, 10).map((r, i) => {
        const end = r.endedAt && r.status === 'ENDED' ? r.endedAt : r.endsAt;
        const st = leaveState(r);
        return `\`${i + 1}.\` ${ts(r.startsAt, 'f')} [${span(new Date(end).getTime() - new Date(r.startsAt).getTime())}]${st ? ` ${st}` : ''}`;
    });
    const description = current ? currentBlock(current) : `**Verlauf**\n${list.length ? list.join('\n') : 'Noch keine Abmeldungen.'}${items.length > 10 ? `\n… und ${items.length - 10} ältere` : ''}`;
    const buttons = [
        ...(current ? currentButtons(current) : [{ id: `leave:astart:${discordId}`, label: 'Start', style: 'primary', emoji: '🕒' }]),
        ...(items.length ? [{ id: `leave:ahist:${discordId}`, label: 'Erweiterten Verlauf ansehen', style: 'secondary', emoji: '📜' }] : []),
    ];
    return { ephemeral: true, embeds: [{ box: true, heading: 'small', author: await memberHead(c, discordId), title: 'Abmeldungen verwalten', description }], buttons };
}
/** Erweiterter Verlauf: jede Abmeldung mit ID, Beginn, Ende, Grund und Status. */
async function adminHistory(c, discordId) {
    const { items } = await c.api.asUser(c.discordId, 'GET', `/leave?discordId=${discordId}&status=ALL`);
    if (!items.length)
        return (0, format_1.okReply)('Noch keine Abmeldungen.');
    const blocks = items.slice(0, 15).map((r) => {
        const st = leaveState(r);
        return (0, format_1.clip)([`\`${r.number}\`${st ? ` ${st}` : ''}`, `- **Beginn:** ${ts(r.startsAt, 'f')}`, `- **Ende:** ${ts(r.status === 'ENDED' && r.endedAt ? r.endedAt : r.endsAt, 'f')}`, `- **Grund:** ${(0, format_1.clip)((0, format_1.plain)(r.reason), 300)}`,
            ...(r.decisionReason ? [`- **Entscheidung:** ${(0, format_1.clip)((0, format_1.plain)(r.decisionReason), 200)}`] : [])].join('\n'), 900);
    });
    return { ephemeral: true, embeds: [{ box: true, heading: 'small', author: await memberHead(c, discordId), title: 'Verlauf der Abmeldungen', description: (0, format_1.clip)(blocks.join('\n\n'), 3900) }] };
}
/** Ansichten wie im Dashboard (Abmeldungen → Tabs). */
const LIST_VIEWS = { offen: ['PENDING', 'Offene Anträge'], aktiv: ['ACTIVE', 'Gerade abgemeldet'], geplant: ['UPCOMING', 'Bevorstehend'], kalender: ['CALENDAR', 'Nächste 4 Wochen'], alle: ['ALL', 'Alle Abmeldungen'] };
const who = (r) => (r.discordId ? `<@${r.discordId}>` : `**${(0, format_1.plain)(r.name)}**`);
/** `/leave liste`: Übersicht für die Leitung (ohne „leave.view“ nur die eigenen); bei offenen Anträgen Auswahl zum Entscheiden. */
async function listReply(c, view) {
    const [status, title] = LIST_VIEWS[view] ?? LIST_VIEWS.offen;
    const { all, items } = await c.api.asUser(c.discordId, 'GET', `/leave?status=${status}`);
    // offene Anträge: älteste zuerst (wie eine Warteschlange), sonst nach Beginn
    const rows = status === 'PENDING' ? [...items].reverse() : status === 'CALENDAR' || status === 'UPCOMING' ? [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : items;
    const lines = rows.slice(0, 20).map((r) => `\`${r.number}\` ${all ? `${who(r)} · ` : ''}${ts(r.startsAt, 'd')} – ${ts(r.endsAt, 'd')} [${span(new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime())}]${status === 'ACTIVE' ? ` · bis ${ts(r.endsAt, 'R')}` : ''}${status === 'ALL' || status === 'CALENDAR' ? ` ${leaveState(r)}` : ''}\n> ${(0, format_1.clip)((0, format_1.plain)(r.reason), 120)}`);
    const embed = { title: `📅 ${all ? title : `Deine Abmeldungen – ${title}`} (${items.length})`, color: status === 'PENDING' && items.length ? format_1.COLORS.warning : format_1.COLORS.info,
        description: (0, format_1.clip)(lines.length ? `${lines.join('\n')}${rows.length > 20 ? `\n… und ${rows.length - 20} weitere (im Dashboard)` : ''}` : 'Keine Einträge.', 4000) };
    if (status !== 'PENDING' || !all || !rows.length)
        return { ephemeral: true, embeds: [embed] };
    return { ephemeral: true, embeds: [embed], select: { id: 'leave:pick', placeholder: 'Antrag zum Entscheiden wählen …', options: rows.slice(0, 25).map((r) => ({ label: (0, format_1.clip)(`${r.number} · ${r.name}`, 100), value: r.id, description: (0, format_1.clip)(`${fmt(r.startsAt)} – ${fmt(r.endsAt)} · ${r.reason}`, 100) })) } };
}
/** Auswahl aus `/leave liste`: einen offenen Antrag mit „Annehmen“/„Ablehnen“ zeigen. */
async function pickReply(c, id) {
    const { items } = await c.api.asUser(c.discordId, 'GET', '/leave?status=PENDING');
    const r = items.find((x) => x.id === id);
    if (!r)
        return (0, format_1.errorReply)('Dieser Antrag ist nicht mehr offen.');
    return { ephemeral: true, embeds: [{ title: 'Abmeldeantrag', color: format_1.COLORS.warning, footer: `ID: ${r.number}`,
                description: `${who(r)}${r.discordId ? ` (${(0, format_1.plain)(r.name)})` : ''}\n**${ts(r.startsAt, 'f')}** bis **${ts(r.endsAt, 'f')}** (${span(new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime())})`,
                fields: [{ name: 'Grund', value: (0, format_1.clip)((0, format_1.plain)(r.reason), 1024) }] }],
        buttons: [{ id: `leave:decide:${r.id}:APPROVED`, label: 'Annehmen', style: 'success', emoji: '✅' }, { id: `leave:reason:${r.id}:DENIED`, label: 'Ablehnen', style: 'danger', emoji: '❌' }] };
}
exports.LEAVE_COMMANDS = [
    {
        name: 'abmeldung', description: 'Abmeldung (Urlaub, Abwesenheit) beantragen – die Leitung entscheidet',
        options: [
            { name: 'von', description: 'Beginn, z. B. heute, 24.12. oder 24.12.2026 18:00', type: 'string', required: true, maxLength: 30 },
            { name: 'bis', description: 'Ende, z. B. 31.12. oder 02.01.2027', type: 'string', required: true, maxLength: 30 },
            { name: 'grund', description: 'Grund der Abmeldung', type: 'string', required: true, maxLength: 1000 },
        ],
        async run(c) {
            const from = parseLeaveDate(String(c.opts.von ?? ''), false), to = parseLeaveDate(String(c.opts.bis ?? ''), true);
            if (!from)
                return (0, format_1.errorReply)('„von“ verstehe ich nicht. Beispiele: `heute`, `24.12.`, `24.12.2026 18:00`.');
            if (!to)
                return (0, format_1.errorReply)('„bis“ verstehe ich nicht. Beispiele: `31.12.`, `02.01.2027`, `morgen 20:00`.');
            try {
                const r = await c.api.asUser(c.discordId, 'POST', '/leave', { startsAt: from.toISOString(), endsAt: to.toISOString(), reason: String(c.opts.grund ?? ''), ...(c.guildId ? { guildId: c.guildId } : {}) });
                return { ephemeral: true, embeds: [{ title: `📅 Abmeldung ${r.number} beantragt`, color: format_1.COLORS.info,
                            description: `**${fmt(r.startsAt)}** bis **${fmt(r.endsAt)}** (${r.days} ${r.days === 1 ? 'Tag' : 'Tage'})\n\nDie Leitung entscheidet – du bekommst eine Direktnachricht.` }] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'leave', description: 'Abmeldungen (Leave of Absence)',
        subcommands: [
            { name: 'manage', description: 'Deine Abmeldung verwalten: starten, verlängern, beenden' },
            { name: 'liste', description: 'Übersicht: offene Anträge, gerade abgemeldet, bevorstehend, Kalender', options: [{ name: 'ansicht', description: 'Was anzeigen? (Standard: offen)', type: 'string', choices: Object.keys(LIST_VIEWS).map((k) => ({ name: k, value: k })) }] },
            { name: 'admin', description: 'Abmeldung eines Teammitglieds verwalten', options: [{ name: 'user', description: 'Das Teammitglied', type: 'user', required: true }] },
        ],
        async run(c) {
            try {
                if (c.opts._sub === 'admin')
                    return await adminReply(c, String(c.opts.user ?? ''));
                if (c.opts._sub === 'liste')
                    return await listReply(c, String(c.opts.ansicht ?? 'offen'));
                return await manageReply(c);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
];
async function decide(c, id, status, reason) {
    try {
        const r = await c.api.asUser(c.discordId, 'POST', `/leave/${id}/decision`, { status, ...(reason ? { reason } : {}) });
        const ok = status === 'APPROVED';
        const now = `<t:${Math.floor(Date.now() / 1000)}:f>`;
        return {
            ephemeral: true,
            embeds: [ok
                    ? { title: 'Abmeldung angenommen', color: format_1.COLORS.success, description: `Diese Abmeldung endet ungefähr ${ts(r.endsAt)}.\nUm sie anzusehen oder zu ändern, nutze \`/leave admin\`.`, footer: `ID: ${r.number}` }
                    : { title: 'Abmeldung abgelehnt', color: format_1.COLORS.danger, description: `Die Abmeldung von ${(0, format_1.plain)(r.name)} wurde abgelehnt. Die Person bekommt eine Direktnachricht.`, footer: `ID: ${r.number}` }],
            // wie Trident: über dem Antrag „Angenommen von @… am …“, statt der Buttons ein ausgegrautes „Angenommen“
            decided: { color: ok ? format_1.COLORS.success : format_1.COLORS.danger, note: `${ok ? 'Angenommen' : 'Abgelehnt'} von <@${c.discordId}> am ${now}`,
                badge: ok ? { label: 'Angenommen', style: 'success', emoji: '✔️' } : { label: 'Abgelehnt', style: 'danger', emoji: '✖️' },
                text: (0, format_1.clip)(`${ok ? '✅ Angenommen' : '❌ Abgelehnt'} von <@${c.discordId}>${r.decidedByName ? ` (${(0, format_1.plain)(r.decidedByName)})` : ''}${reason ? `\n**Grund:** ${(0, format_1.plain)(reason)}` : ''}`, 1024) },
        };
    }
    catch (e) {
        return (0, errors_1.mapError)(e);
    }
}
/** Leitung: Verlängerung annehmen/ablehnen; Antrag wie bei Trident markieren, Mitglied bekommt eine DM. */
async function decideExtension(c, id, status, reason) {
    try {
        const r = await c.api.asUser(c.discordId, 'POST', `/leave/${id}/extension-decision`, { status, ...(reason ? { reason } : {}) });
        const ok = status === 'APPROVED';
        return {
            ephemeral: true,
            embeds: [ok
                    ? { title: 'Verlängerung angenommen', color: format_1.COLORS.success, description: `Die Abmeldung von ${(0, format_1.plain)(r.name)} endet jetzt ungefähr ${ts(r.endsAt)}.\nUm sie anzusehen oder zu ändern, nutze \`/leave admin\`.`, footer: `ID: ${r.number}` }
                    : { title: 'Verlängerung abgelehnt', color: format_1.COLORS.danger, description: `Die Abmeldung von ${(0, format_1.plain)(r.name)} endet weiterhin ungefähr ${ts(r.endsAt)}. Die Person bekommt eine Direktnachricht.`, footer: `ID: ${r.number}` }],
            decided: { color: ok ? format_1.COLORS.success : format_1.COLORS.danger, note: `${ok ? 'Angenommen' : 'Abgelehnt'} von <@${c.discordId}> am <t:${Math.floor(Date.now() / 1000)}:f>`,
                badge: ok ? { label: 'Angenommen', style: 'success', emoji: '✔️' } : { label: 'Abgelehnt', style: 'danger', emoji: '✖️' },
                text: (0, format_1.clip)(`${ok ? '✅ Angenommen' : '❌ Abgelehnt'} von <@${c.discordId}>${reason ? `\n**Grund:** ${(0, format_1.plain)(reason)}` : ''}`, 1024) },
        };
    }
    catch (e) {
        return (0, errors_1.mapError)(e);
    }
}
/**
 * Buttons/Formulare: `leave:start` (Formular Dauer/Grund) → `leave:create`, `leave:cancel:<id>`,
 * Antrag: `leave:decide:<id>:<status>`, `leave:reason:<id>:DENIED` (Formular) → `leave:reasonsubmit:<id>:<status>`.
 */
exports.LEAVE_INTERACTION = {
    prefix: 'leave',
    opensModal: (args) => args[0] === 'reason' || args[0] === 'xreason' || args[0] === 'start' || args[0] === 'astart' || args[0] === 'extend',
    async run(c) {
        const [action, id, st] = c.args;
        // Leitung (/leave admin): Abmeldung für ein Mitglied starten (gilt sofort) bzw. erweiterten Verlauf zeigen
        if (action === 'ahist' && id) {
            try {
                return await adminHistory(c, id);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        }
        if (action === 'astart' && id)
            return { modal: { id: `leave:acreate:${id}`, title: 'Abmeldung für Mitglied starten', fields: [
                        { id: 'duration', label: 'Dauer', required: true, maxLength: 20, placeholder: "Format: '6h', '4d' oder '2w'" },
                        { id: 'reason', label: 'Grund', paragraph: true, required: true, minLength: 3, maxLength: 1000, placeholder: 'z. B. Urlaub' },
                    ] } };
        if (action === 'acreate' && id && /^\d{15,25}$/.test(id)) {
            const ms = parseDuration(c.fields?.duration ?? '');
            if (!ms)
                return (0, format_1.errorReply)('Die Dauer verstehe ich nicht. Beispiele: `6h`, `4d`, `2w` oder `1w 2d` (mindestens 1 Stunde).');
            const reason = (c.fields?.reason ?? '').trim();
            if (reason.length < 3)
                return (0, format_1.errorReply)('Bitte einen Grund angeben.');
            const now = Date.now();
            try {
                await c.api.asUser(c.discordId, 'POST', '/leave', { startsAt: new Date(now).toISOString(), endsAt: new Date(now + ms).toISOString(), reason, forDiscordId: id, ...(c.guildId ? { guildId: c.guildId } : {}) });
                return await adminReply(c, id);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        }
        if (action === 'start')
            return { modal: { id: 'leave:create', title: 'Abmeldung erstellen', fields: [
                        { id: 'duration', label: 'Dauer', required: true, maxLength: 20, placeholder: "Format: '6h', '4d' oder '2w'" },
                        { id: 'reason', label: 'Grund', paragraph: true, required: true, minLength: 3, maxLength: 1000, placeholder: 'z. B. Urlaub, Prüfungsphase' },
                    ] } };
        if (action === 'create') {
            const ms = parseDuration(c.fields?.duration ?? '');
            if (!ms)
                return (0, format_1.errorReply)('Die Dauer verstehe ich nicht. Beispiele: `6h`, `4d`, `2w` oder `1w 2d` (mindestens 1 Stunde).');
            const reason = (c.fields?.reason ?? '').trim();
            if (reason.length < 3)
                return (0, format_1.errorReply)('Bitte einen Grund angeben.');
            const now = Date.now();
            try {
                const r = await c.api.asUser(c.discordId, 'POST', '/leave', { startsAt: new Date(now).toISOString(), endsAt: new Date(now + ms).toISOString(), reason, ...(c.guildId ? { guildId: c.guildId } : {}) });
                return { ephemeral: true, embeds: [{ title: `Abmeldung eingereicht · ${(0, format_1.humanDuration)(ms)}`, color: format_1.COLORS.neutral, footer: `ID: ${r.number}`,
                            description: `Deine Abmeldung wurde der Leitung zur Freigabe vorgelegt.\nWenn sie angenommen wird, endet sie ungefähr ${ts(r.endsAt)}.\nUm benachrichtigt zu werden, ob sie angenommen oder abgelehnt wird, lass bitte deine DMs offen.` }] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        }
        if (action === 'pick') {
            const picked = c.values?.[0] ?? '';
            if (!/^[0-9a-f-]{36}$/.test(picked))
                return (0, format_1.errorReply)('Bitte einen Antrag auswählen.');
            try {
                return await pickReply(c, picked);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        }
        if (!id || !/^[0-9a-f-]{36}$/.test(id))
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        if (action === 'extend')
            return { modal: { id: `leave:extendsubmit:${id}`, title: 'Abmeldung verlängern', fields: [
                        { id: 'duration', label: 'Zusätzliche Dauer', paragraph: true, required: true, maxLength: 20, placeholder: "Hinweis: Wird zur bisherigen Zeit hinzugefügt.\nFormat: '6h', '4d' oder '2w'" },
                        { id: 'reason', label: 'Grund', paragraph: true, required: true, minLength: 3, maxLength: 1000, placeholder: 'z. B. Urlaub verlängert sich' },
                    ] } };
        if (action === 'extendsubmit') {
            const ms = parseDuration(c.fields?.duration ?? '');
            if (!ms)
                return (0, format_1.errorReply)('Die Dauer verstehe ich nicht. Beispiele: `6h`, `4d`, `2w` oder `1w 2d` (mindestens 1 Stunde).');
            const reason = (c.fields?.reason ?? '').trim();
            if (reason.length < 3)
                return (0, format_1.errorReply)('Bitte einen Grund angeben.');
            try {
                const r = await c.api.asUser(c.discordId, 'POST', `/leave/${id}/extend`, { minutes: Math.round(ms / 60_000), reason });
                if (r.extensionPending)
                    return { ephemeral: true, embeds: [{ title: `Verlängerung beantragt · ${(0, format_1.humanDuration)(ms)}`, color: format_1.COLORS.neutral, footer: `ID: ${r.number}`,
                                description: 'Deine Verlängerung wurde der Leitung zur Freigabe vorgelegt. Bis dahin bleibt das bisherige Ende.\nUm benachrichtigt zu werden, ob sie angenommen oder abgelehnt wird, lass bitte deine DMs offen.' }] };
                return (0, format_1.okReply)(`Abmeldung **${r.number}** um ${(0, format_1.humanDuration)(ms)} verlängert – sie endet jetzt ungefähr ${ts(r.endsAt)} (${ts(r.endsAt, 'R')}).`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        }
        // Verlängerungsantrag (Freigabe-Channel): `leave:xdecide:<id>:<status>`, `leave:xreason:<id>:DENIED` (Formular) → `leave:xreasonsubmit:<id>:<status>`
        if (action === 'xdecide' || action === 'xreasonsubmit') {
            const status = st === 'APPROVED' || st === 'DENIED' ? st : null;
            if (!status)
                return (0, format_1.errorReply)('Unbekannte Aktion.');
            const reason = action === 'xreasonsubmit' ? (c.fields?.reason ?? '').trim() : undefined;
            if (action === 'xreasonsubmit' && !reason)
                return (0, format_1.errorReply)('Bitte einen Grund angeben.');
            return decideExtension(c, id, status, reason);
        }
        if (action === 'xreason')
            return { modal: { id: `leave:xreasonsubmit:${id}:DENIED`, title: 'Verlängerung ablehnen', fields: [{ id: 'reason', label: 'Grund', paragraph: true, required: true, maxLength: 1000 }] } };
        if (action === 'cancel') {
            try {
                const r = await c.api.asUser(c.discordId, 'POST', `/leave/${id}/cancel`);
                if (r.discordId && r.discordId !== c.discordId)
                    return (0, format_1.okReply)(`Abmeldung **${r.number}** von ${(0, format_1.plain)(r.name)} ${r.status === 'ENDED' ? 'beendet' : 'abgesagt'}.`); // Leitung (/leave admin)
                return (0, format_1.okReply)(r.status === 'ENDED' ? `Deine Abmeldung **${r.number}** ist beendet – willkommen zurück!` : `Abmeldung **${r.number}** zurückgezogen.`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        }
        const status = st === 'APPROVED' || st === 'DENIED' ? st : null;
        if (!status)
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        if (action === 'decide')
            return decide(c, id, status);
        if (action === 'reason')
            return { modal: { id: `leave:reasonsubmit:${id}:${status}`, title: status === 'APPROVED' ? 'Abmeldung annehmen' : 'Abmeldung ablehnen', fields: [{ id: 'reason', label: 'Grund', paragraph: true, required: true, maxLength: 1000 }] } };
        if (action === 'reasonsubmit') {
            const reason = (c.fields?.reason ?? '').trim();
            return reason ? decide(c, id, status, reason) : (0, format_1.errorReply)('Bitte einen Grund angeben.');
        }
        return (0, format_1.errorReply)('Unbekannte Aktion.');
    },
};
//# sourceMappingURL=leave.js.map