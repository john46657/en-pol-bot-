"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RADIO_WHITELIST_INTERACTION = exports.RADIO_WHITELIST_COMMANDS = void 0;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
const STATUS_DE = { ACTIVE: '✅ aktiv', PENDING: '🕓 ausstehend', DISABLED: '⏸️ deaktiviert', SUSPENDED: '⛔ gesperrt', EXPIRED: '⌛ abgelaufen', REVOKED: '❌ entzogen' };
const ts = (iso) => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:D>`;
const apiError = (e) => (e instanceof api_1.BotApiError && e.status === 503 ? (0, format_1.errorReply)(e.message) : (0, errors_1.mapError)(e));
/**
 * 🎙️ Funk-Whitelist: `/funkantrag` (Formular: Begründung, Dienstgrad, Abteilung) und `/funkstatus`.
 * Auch ohne Dashboard-Konto – die Identität ist die Discord-ID der Interaktion; entschieden wird im Dashboard.
 */
exports.RADIO_WHITELIST_COMMANDS = [
    {
        name: 'funkantrag', description: 'Funkfreigabe für den externen Funkdienst beantragen',
        opensModal: true,
        async run(c) {
            if (!c.guildId)
                return (0, format_1.errorReply)('Bitte stelle den Antrag auf dem Discord-Server, nicht per Direktnachricht.');
            try {
                const s = await c.api.service('GET', `/bot/radio-whitelist/status/${c.discordId}`);
                if (!s.requestsEnabled)
                    return (0, format_1.errorReply)('Anträge auf Funkfreigabe sind derzeit deaktiviert.');
                if (s.authorized)
                    return (0, format_1.okReply)('Du bist bereits für den Funk freigegeben.');
                if (s.status === 'SUSPENDED')
                    return (0, format_1.errorReply)(`Deine Funkfreigabe ist gesperrt${s.suspendedUntil ? ` bis ${ts(s.suspendedUntil)}` : ''} – ein Antrag ist derzeit nicht möglich.`);
            }
            catch (e) {
                return apiError(e);
            }
            return { modal: { id: 'rwreq:submit', title: 'Antrag auf Funkfreigabe', fields: [
                        { id: 'reason', label: 'Begründung', paragraph: true, required: true, maxLength: 1000, placeholder: 'Warum brauchst du Zugang zum Funk?' },
                        { id: 'rank', label: 'Dienstgrad (falls relevant)', required: false, maxLength: 80 },
                        { id: 'department', label: 'Abteilung (falls relevant)', required: false, maxLength: 80 },
                    ] } };
        },
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
/** Formular-Absendung `rwreq:submit`. */
exports.RADIO_WHITELIST_INTERACTION = {
    prefix: 'rwreq',
    async run(c) {
        if (c.args[0] !== 'submit' || !c.fields)
            return (0, format_1.errorReply)('Ungültige Anfrage.');
        const reason = (c.fields.reason ?? '').trim();
        if (reason.length < 10)
            return (0, format_1.errorReply)('Bitte begründe deinen Antrag etwas ausführlicher (mind. 10 Zeichen).');
        try {
            await c.api.service('POST', '/bot/radio-whitelist/requests', {
                guildId: c.guildId ?? null, discordId: c.discordId, discordName: c.userDisplayName ?? c.userName ?? null,
                rank: (c.fields.rank ?? '').trim() || null, department: (c.fields.department ?? '').trim() || null, reason,
            });
            return (0, format_1.okReply)(`📨 Dein Antrag auf Funkfreigabe ist eingegangen. Du bekommst eine Direktnachricht, sobald eine Führungskraft entschieden hat.\n> ${(0, format_1.plain)(reason).slice(0, 300)}`);
        }
        catch (e) {
            return apiError(e);
        }
    },
};
//# sourceMappingURL=radio-whitelist.js.map