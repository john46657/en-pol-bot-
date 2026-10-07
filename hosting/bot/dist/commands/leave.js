"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEAVE_INTERACTION = exports.LEAVE_COMMANDS = void 0;
exports.berlinTime = berlinTime;
exports.parseLeaveDate = parseLeaveDate;
exports.parseDuration = parseDuration;
exports.manageReply = manageReply;
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
/** `/leave manage`: eigene Abmeldung ansehen, starten, zurückziehen oder vorzeitig beenden (wie Trident). */
async function manageReply(c) {
    const { items } = await c.api.asUser(c.discordId, 'GET', '/leave?mine=true');
    const now = Date.now();
    const pending = items.find((r) => r.status === 'PENDING');
    const active = items.find((r) => r.status === 'APPROVED' && r.active);
    const upcoming = items.find((r) => r.status === 'APPROVED' && new Date(r.startsAt).getTime() > now);
    const last = items.find((r) => r.status === 'ENDED');
    const head = c.userName ? { author: { name: `@${c.userName}`, ...(c.userAvatar ? { iconUrl: c.userAvatar } : {}) } } : {};
    const embed = (description, color = format_1.COLORS.neutral, fields, footer) => ({ ...head, title: 'Abmeldungen verwalten', description, color, ...(fields ? { fields } : {}), ...(footer ? { footer } : {}) });
    const reason = (r) => [{ name: 'Grund', value: (0, format_1.clip)((0, format_1.plain)(r.reason), 1024) }];
    if (active)
        return { ephemeral: true, embeds: [embed(`Du bist gerade abgemeldet – bis ungefähr ${ts(active.endsAt)} (${ts(active.endsAt, 'R')}).\nDu kannst die Abmeldung jederzeit vorzeitig beenden.`, format_1.COLORS.success, reason(active), `ID: ${active.number}`)],
            buttons: [{ id: `leave:cancel:${active.id}`, label: 'Vorzeitig beenden', style: 'danger', emoji: '⏹️' }] };
    if (pending)
        return { ephemeral: true, embeds: [embed(`Deine Abmeldung wartet auf die Freigabe durch die Leitung.\nWenn sie angenommen wird, endet sie ungefähr ${ts(pending.endsAt)}.`, format_1.COLORS.warning, reason(pending), `ID: ${pending.number}`)],
            buttons: [{ id: `leave:cancel:${pending.id}`, label: 'Antrag zurückziehen', style: 'danger', emoji: '↩️' }] };
    if (upcoming)
        return { ephemeral: true, embeds: [embed(`Deine Abmeldung beginnt ${ts(upcoming.startsAt)} und endet ${ts(upcoming.endsAt)}.`, format_1.COLORS.info, reason(upcoming), `ID: ${upcoming.number}`)],
            buttons: [{ id: `leave:cancel:${upcoming.id}`, label: 'Absagen', style: 'danger', emoji: '↩️' }] };
    const start = [{ id: 'leave:start', label: 'Start', style: 'primary', emoji: '🕒' }];
    if (!items.length)
        return { ephemeral: true, embeds: [embed('Du warst noch nie abgemeldet.\nUm jetzt eine Abmeldung zu starten, klicke auf `Start`.')], buttons: start };
    return { ephemeral: true, embeds: [embed(`${last ? `Deine letzte Abmeldung endete ${ts(last.endedAt ?? last.endsAt)}.` : 'Du hast gerade keine Abmeldung.'}\nUm eine neue Abmeldung zu starten, klicke auf \`Start\`.`)], buttons: start };
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
        subcommands: [{ name: 'manage', description: 'Eigene Abmeldung ansehen, starten oder beenden' }],
        async run(c) {
            try {
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
        return {
            ...(0, format_1.okReply)(`Abmeldung **${r.number}** von ${(0, format_1.plain)(r.name)} ${ok ? '**angenommen**' : '**abgelehnt**'}. Die Person bekommt eine Direktnachricht.`),
            decided: { color: ok ? format_1.COLORS.success : format_1.COLORS.danger, text: (0, format_1.clip)(`${ok ? '✅ Angenommen' : '❌ Abgelehnt'} von <@${c.discordId}>${r.decidedByName ? ` (${(0, format_1.plain)(r.decidedByName)})` : ''}${reason ? `\n**Grund:** ${(0, format_1.plain)(reason)}` : ''}`, 1024) },
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
    opensModal: (args) => args[0] === 'reason' || args[0] === 'start',
    async run(c) {
        const [action, id, st] = c.args;
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
        if (!id || !/^[0-9a-f-]{36}$/.test(id))
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        if (action === 'cancel') {
            try {
                const r = await c.api.asUser(c.discordId, 'POST', `/leave/${id}/cancel`);
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