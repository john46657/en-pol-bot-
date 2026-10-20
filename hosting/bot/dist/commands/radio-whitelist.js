"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RADIO_WHITELIST_INTERACTION = exports.RADIO_WHITELIST_COMMANDS = void 0;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Rückfall, falls das System (ältere Version) kein Formular mitschickt – entspricht dem Standardformular. */
const DEFAULT_FORM = { title: 'Antrag auf Funkfreigabe', fields: [
        { key: 'reason', label: 'Begründung', placeholder: 'Warum brauchst du Zugang zum Funk?', paragraph: true, required: true, maxLength: 1000 },
        { key: 'rank', label: 'Dienstgrad (falls relevant)', placeholder: '', paragraph: false, required: false, maxLength: 80 },
        { key: 'department', label: 'Abteilung (falls relevant)', placeholder: '', paragraph: false, required: false, maxLength: 80 },
    ] };
const STATUS_DE = { ACTIVE: '✅ aktiv', PENDING: '🕓 ausstehend', DISABLED: '⏸️ deaktiviert', SUSPENDED: '⛔ gesperrt', EXPIRED: '⌛ abgelaufen', REVOKED: '❌ entzogen' };
const ts = (iso) => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:D>`;
const apiError = (e) => (e instanceof api_1.BotApiError && e.status === 503 ? (0, format_1.errorReply)(e.message) : (0, errors_1.mapError)(e));
/** Formular für den Antrag öffnen (Befehl `/funkantrag` und Button `rwreq:open` im Antrags-Panel). */
async function openRequestForm(c) {
    if (!c.guildId)
        return (0, format_1.errorReply)('Bitte stelle den Antrag auf dem Discord-Server, nicht per Direktnachricht.');
    let s;
    try {
        s = await c.api.service('GET', `/bot/radio-whitelist/status/${c.discordId}`);
        if (s.roleOnly)
            return s.authorized ? (0, format_1.okReply)('Du bist bereits für den Funk freigegeben.') : (0, format_1.errorReply)('Ein Antrag ist nicht nötig – die Funkfreigabe kommt automatisch mit der Funk-Rolle in Discord. Wende dich an die Leitung, wenn du die Rolle bekommen sollst.');
        if (!s.requestsEnabled)
            return (0, format_1.errorReply)('Anträge auf Funkfreigabe sind derzeit deaktiviert.');
        if (s.authorized)
            return (0, format_1.okReply)('Du bist bereits für den Funk freigegeben.');
        if (s.status === 'SUSPENDED')
            return (0, format_1.errorReply)(`Deine Funkfreigabe ist gesperrt${s.suspendedUntil ? ` bis ${ts(s.suspendedUntil)}` : ''} – ein Antrag ist derzeit nicht möglich.`);
        if (s.pendingSince)
            return (0, format_1.okReply)(`Du hast bereits einen offenen Antrag (seit ${ts(s.pendingSince)}). Du bekommst eine Direktnachricht, sobald entschieden ist.`);
    }
    catch (e) {
        return apiError(e);
    }
    // Formular so, wie es im Dashboard eingestellt ist (Titel, Felder, Pflichtfelder)
    const form = s.form?.fields?.length ? s.form : DEFAULT_FORM;
    return { modal: { id: 'rwreq:submit', title: form.title.slice(0, 45), fields: form.fields.slice(0, 5).map((f) => ({
                id: f.key, label: f.label.slice(0, 45), paragraph: f.paragraph, required: f.required, maxLength: Math.min(f.maxLength, 4000), ...(f.placeholder ? { placeholder: f.placeholder.slice(0, 100) } : {}),
            })) } };
}
/** Entscheidung in Discord (Buttons unter der Antragsmeldung) – mit den Rechten des verknüpften Kontos (radiowhitelist.requests). */
async function decide(c, id, decision, reason) {
    try {
        const r = await c.api.asUser(c.discordId, 'POST', `/radio-whitelist/requests/${id}/decision`, { decision, ...(reason ? { reason } : {}) });
        const ok = decision === 'APPROVE';
        return {
            ...(0, format_1.okReply)(ok ? '✅ Antrag genehmigt – das Mitglied wurde per Direktnachricht informiert.' : '❌ Antrag abgelehnt – das Mitglied wurde per Direktnachricht informiert.'),
            decided: { color: ok ? format_1.COLORS.success : format_1.COLORS.danger, text: `${ok ? '✅ Genehmigt' : '❌ Abgelehnt'} von <@${c.discordId}>${r.decidedByName ? ` (${(0, format_1.plain)(r.decidedByName)})` : ''}${reason ? `\n**Grund:** ${(0, format_1.plain)(reason)}` : ''}`.slice(0, 1024) },
        };
    }
    catch (e) {
        return apiError(e);
    }
}
/**
 * 🎙️ Funk-Whitelist: `/funkantrag` (Formular: Begründung, Dienstgrad, Abteilung) und `/funkstatus`.
 * Auch ohne Dashboard-Konto – die Identität ist die Discord-ID der Interaktion; entschieden wird im Dashboard oder per Button.
 */
exports.RADIO_WHITELIST_COMMANDS = [
    {
        name: 'funkantrag', description: 'Funkfreigabe für den externen Funkdienst beantragen',
        opensModal: true,
        run: openRequestForm,
    },
    {
        name: 'funkstatus', description: 'Deinen Status in der Funk-Whitelist anzeigen',
        async run(c) {
            try {
                const s = await c.api.service('GET', `/bot/radio-whitelist/status/${c.discordId}`);
                const lines = [
                    `**Status:** ${s.status ? STATUS_DE[s.status] ?? s.status : 'nicht freigegeben'}`,
                    ...(s.expiresAt && s.status === 'ACTIVE' ? [`**Gültig bis:** ${ts(s.expiresAt)}`] : []),
                    ...(s.suspendedUntil && s.status === 'SUSPENDED' ? [`**Gesperrt bis:** ${ts(s.suspendedUntil)}`] : []),
                    ...(s.pendingSince ? [`**Offener Antrag seit:** ${ts(s.pendingSince)}`] : []),
                ];
                return { ephemeral: true, embeds: [{ title: '🎙️ Funk-Whitelist', description: lines.join('\n'), color: s.authorized ? format_1.COLORS.success : format_1.COLORS.neutral }] };
            }
            catch (e) {
                return apiError(e);
            }
        },
    },
];
const UUID = /^[0-9a-f-]{36}$/;
/**
 * `rwreq:open` (Button im Antrags-Panel → Formular), `rwreq:submit` (Formular abgeschickt),
 * `rwreq:approve:<id>` / `rwreq:reject:<id>` → `rwreq:rejectsubmit:<id>` (Leitung entscheidet in Discord).
 */
exports.RADIO_WHITELIST_INTERACTION = {
    prefix: 'rwreq',
    opensModal: (args) => args[0] === 'open' || args[0] === 'reject',
    async run(c) {
        const [action, id] = c.args;
        if (action === 'open')
            return openRequestForm(c);
        if (action === 'approve' || action === 'reject' || action === 'rejectsubmit') {
            if (!UUID.test(id ?? ''))
                return (0, format_1.errorReply)('Unbekannter Antrag.');
            if (action === 'approve')
                return decide(c, id, 'APPROVE');
            if (action === 'reject')
                return { modal: { id: `rwreq:rejectsubmit:${id}`, title: 'Antrag ablehnen', fields: [{ id: 'reason', label: 'Grund (geht per DM an das Mitglied)', paragraph: true, required: true, minLength: 3, maxLength: 1000 }] } };
            const reason = (c.fields?.reason ?? '').trim();
            if (reason.length < 3)
                return (0, format_1.errorReply)('Bitte einen Grund angeben.');
            return decide(c, id, 'REJECT', reason);
        }
        if (action !== 'submit' || !c.fields)
            return (0, format_1.errorReply)('Ungültige Anfrage.');
        const reason = (c.fields.reason ?? '').trim();
        if (reason.length < 3)
            return (0, format_1.errorReply)('Bitte begründe deinen Antrag.');
        const answers = Object.fromEntries(Object.entries(c.fields).filter(([k]) => !['reason', 'rank', 'department'].includes(k)).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
        try {
            await c.api.service('POST', '/bot/radio-whitelist/requests', {
                guildId: c.guildId ?? null, discordId: c.discordId, discordName: c.userDisplayName ?? c.userName ?? null,
                rank: (c.fields.rank ?? '').trim() || null, department: (c.fields.department ?? '').trim() || null, reason, ...(Object.keys(answers).length ? { answers } : {}),
            });
            return (0, format_1.okReply)(`📨 Dein Antrag auf Funkfreigabe ist eingegangen. Du bekommst eine Direktnachricht, sobald eine Führungskraft entschieden hat.\n> ${(0, format_1.plain)(reason).slice(0, 300)}`);
        }
        catch (e) {
            return apiError(e);
        }
    },
};
//# sourceMappingURL=radio-whitelist.js.map