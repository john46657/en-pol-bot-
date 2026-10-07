"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERIFY_COMMANDS = exports.VERIFY_INTERACTION = void 0;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Fachliche Meldungen der Verifizierung (z. B. „Wörter stehen nicht im Profil“) direkt zeigen. */
const fail = (e) => (e instanceof api_1.BotApiError && [400, 404, 409, 503].includes(e.status) ? (0, format_1.errorReply)(e.message) : (0, errors_1.mapError)(e));
const ts = (iso) => `<t:${Math.floor(Date.parse(iso) / 1000)}:R>`;
const nameModal = () => ({ modal: { id: 'verify:name', title: 'Roblox-Verifizierung', fields: [{ id: 'roblox', label: 'Dein Roblox-Benutzername', required: true, minLength: 3, maxLength: 20, placeholder: 'z. B. Builderman' }] } });
/** Rollen/Nickname auf diesem Server setzen und das Ergebnis als Text zurückgeben. */
async function applyHere(c, s) {
    if (!c.guildId || !s.enabled || !s.actions || !c.verifyApply)
        return '';
    const problems = await c.verifyApply(c.guildId, c.discordId, s.actions).catch((e) => [e instanceof Error ? e.message : 'Rollen konnten nicht gesetzt werden']);
    const parts = [s.actions.add.length ? `Rollen: ${s.actions.add.map((r) => `<@&${r}>`).join(' ')}` : '', s.actions.nickname ? `Nickname: **${(0, format_1.plain)(s.actions.nickname)}**` : ''].filter(Boolean);
    return [parts.join('\n'), problems.length ? `⚠️ ${problems.join(' · ')}` : ''].filter(Boolean).join('\n');
}
const linkFields = (l) => [
    { name: 'Roblox', value: `[${(0, format_1.plain)(l.robloxName)}](${l.profileUrl})`, inline: true },
    { name: 'Anzeigename', value: (0, format_1.plain)(l.displayName), inline: true },
    { name: 'Roblox-ID', value: l.robloxId, inline: true },
    { name: 'Verifiziert', value: ts(l.verifiedAt), inline: true },
];
exports.VERIFY_INTERACTION = {
    prefix: 'verify',
    opensModal: (args) => args[0] === 'start',
    async run(c) {
        const action = c.args[0];
        if (action === 'start')
            return nameModal();
        if (action === 'name') {
            try {
                const r = await c.api.service('POST', '/bot/verify/start', { ...(c.guildId ? { guildId: c.guildId } : {}), discordId: c.discordId, roblox: (c.fields?.roblox ?? '').trim() });
                return {
                    ephemeral: true,
                    embeds: [{
                            title: `Bist du ${(0, format_1.plain)(r.roblox.name)}?`, color: format_1.COLORS.info, ...(r.roblox.avatarUrl ? { thumbnail: r.roblox.avatarUrl } : {}),
                            description: [
                                'Damit wir wissen, dass das Konto dir gehört:',
                                `**1.** Öffne dein [Roblox-Profil](https://www.roblox.com/users/${r.roblox.id}/profile) → **Bearbeiten** (Stift bei „Über mich“).`,
                                '**2.** Füge diese Wörter irgendwo in **„Über mich“** ein und speichere:',
                                `\`\`\`${r.code}\`\`\``,
                                '**3.** Klick unten auf **Fertig – prüfen**.',
                                '',
                                `Der Code läuft ${ts(r.expiresAt)} ab. Danach kannst du die Wörter wieder löschen.`,
                            ].join('\n'),
                            footer: `Anzeigename: ${r.roblox.displayName} · ID ${r.roblox.id}`,
                        }],
                    buttons: [
                        { id: 'verify:check', label: 'Fertig – prüfen', style: 'success', emoji: '✅' },
                        { id: 'verify:start', label: 'Anderes Konto', style: 'secondary' },
                    ],
                };
            }
            catch (e) {
                return fail(e);
            }
        }
        if (action === 'check') {
            try {
                const s = await c.api.service('POST', '/bot/verify/check', { ...(c.guildId ? { guildId: c.guildId } : {}), discordId: c.discordId, ...(c.userName ? { discordName: c.userName } : {}) });
                const done = await applyHere(c, s);
                return { ephemeral: true, embeds: [{ title: `✅ Verifiziert als ${(0, format_1.plain)(s.link.robloxName)}`, color: format_1.COLORS.success, description: ['Dein Roblox-Konto ist jetzt mit Discord verknüpft. Die Wörter kannst du wieder aus deinem Profil löschen.', done].filter(Boolean).join('\n\n'), fields: linkFields(s.link) }] };
            }
            catch (e) {
                return fail(e);
            }
        }
        if (action === 'update')
            return update(c);
        return (0, format_1.errorReply)('Unbekannte Aktion.');
    },
};
async function update(c, userId = c.discordId) {
    if (!c.guildId)
        return (0, format_1.errorReply)('Das geht nur auf einem Server.');
    try {
        const s = await c.api.service('POST', '/bot/verify/status', { guildId: c.guildId, discordId: userId, ...(userId === c.discordId && c.userName ? { discordName: c.userName } : {}) });
        if (!s.enabled)
            return (0, format_1.errorReply)('Die Roblox-Verifizierung ist auf diesem Server nicht aktiviert.');
        if (!s.link && userId === c.discordId)
            return { ...nameModalHint(), ephemeral: true };
        const problems = s.actions && c.verifyApply ? await c.verifyApply(c.guildId, userId, s.actions).catch((e) => [e instanceof Error ? e.message : 'fehlgeschlagen']) : [];
        const who = userId === c.discordId ? 'Deine' : `Die von <@${userId}>`;
        return (0, format_1.okReply)(`${who} Rollen${s.actions?.nickname ? ' und Nickname' : ''} sind aktualisiert${s.link ? ` (Roblox: **${(0, format_1.plain)(s.link.robloxName)}**)` : ' (nicht verifiziert)'}.${problems.length ? `\n⚠️ ${problems.join(' · ')}` : ''}`);
    }
    catch (e) {
        return fail(e);
    }
}
const nameModalHint = () => ({ content: 'Du bist noch nicht verifiziert.', buttons: [{ id: 'verify:start', label: 'Jetzt verifizieren', style: 'success', emoji: '✅' }] });
exports.VERIFY_COMMANDS = [
    { name: 'verifizieren', description: 'Verknüpft dein Roblox-Konto mit Discord (Rollen und Nickname)', opensModal: true, async run() { return nameModal(); } },
    {
        name: 'aktualisieren', description: 'Setzt Rollen und Nickname aus deiner Roblox-Verifizierung neu',
        options: [{ name: 'mitglied', description: 'Anderes Mitglied (nur mit „Server verwalten“)', type: 'user' }],
        async run(c) {
            const other = typeof c.opts.mitglied === 'string' && c.opts.mitglied !== c.discordId ? c.opts.mitglied : undefined;
            if (other && !c.isGuildAdmin)
                return (0, format_1.errorReply)('Andere Mitglieder aktualisieren dürfen nur Leute mit „Server verwalten“.');
            return update(c, other);
        },
    },
    {
        name: 'whois', description: 'Zeigt das verifizierte Roblox-Konto eines Mitglieds',
        options: [{ name: 'mitglied', description: 'Discord-Mitglied', type: 'user', required: true }],
        async run(c) {
            const id = String(c.opts.mitglied ?? '');
            try {
                const { link } = await c.api.service('GET', `/bot/verify/whois?discordId=${id}`);
                if (!link)
                    return { ephemeral: true, content: `<@${id}> ist nicht mit Roblox verifiziert.` };
                return { ephemeral: true, embeds: [{ title: `🔎 ${(0, format_1.plain)(link.robloxName)}`, color: format_1.COLORS.info, description: `<@${id}>`, fields: linkFields(link) }] };
            }
            catch (e) {
                return fail(e);
            }
        },
    },
];
//# sourceMappingURL=verify.js.map