"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INFO_PANEL_INTERACTION = exports.FORM_PANEL_INTERACTION = void 0;
const shared_1 = require("@enrp/shared");
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Formular-Panels: Button → Formular (Felder aus dem Dashboard) → Nachricht im Zielkanal (optional als die Person, mit Reaktionen). */
exports.FORM_PANEL_INTERACTION = {
    prefix: 'fpanel',
    opensModal: (args) => args.length === 1,
    async run(c) {
        const id = c.args[0] ?? '';
        if (!/^[0-9a-f-]{36}$/.test(id))
            return (0, format_1.errorReply)('Unbekanntes Panel.');
        try {
            if (c.args[1] !== 'submit') {
                const p = await c.api.service('GET', `/bot/panels/forms/${id}`);
                return { modal: { id: `fpanel:${id}:submit`, title: p.modalTitle, fields: p.fields.map((f) => ({ id: f.id, label: f.label, paragraph: f.long, required: f.required, maxLength: Math.min(f.maxLength, 4000), ...(f.placeholder ? { placeholder: f.placeholder } : {}) })) } };
            }
            const r = await c.api.service('POST', `/bot/panels/forms/${id}/submit`, { guildId: c.guildId ?? null, discordId: c.discordId, userName: c.userDisplayName ?? c.userName ?? c.discordId, ...(c.userAvatar ? { avatar: c.userAvatar } : {}), values: c.fields ?? {} });
            const channelId = r.channelId ?? c.channelId;
            if (!channelId || !c.discord)
                return (0, format_1.errorReply)('Für dieses Panel ist kein Zielkanal eingestellt.');
            if (r.previous)
                await c.discord.deleteMessage(r.previous.channelId, r.previous.messageId);
            const spot = await c.discord.post(channelId, r.message, r.asUser ? { username: c.userDisplayName ?? c.userName ?? 'Mitglied', ...(c.userAvatar ? { avatarURL: c.userAvatar } : {}) } : undefined);
            await c.api.service('POST', `/bot/panels/submissions/${r.submissionId}/posted`, spot).catch(() => undefined);
            if (r.grantRoleIds.length && c.guildId)
                await c.discord.addRoles(c.guildId, c.discordId, r.grantRoleIds).catch(() => undefined);
            return { ephemeral: true, content: r.confirmText || '✅ Gepostet.' };
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
    },
};
/** Info-Panel: Auswahlmenü `ipnl:<panelId>` → der gewählte Punkt erscheint nur für die Person (Texte im Dashboard). */
exports.INFO_PANEL_INTERACTION = {
    prefix: 'ipnl',
    async run(c) {
        const [id] = c.args;
        if (!/^[0-9a-f-]{36}$/.test(id ?? ''))
            return (0, format_1.errorReply)('Ungültige Anfrage.');
        try {
            const p = await c.api.service('GET', `/bot/panels/info/${id}`);
            const o = p.options.find((x) => x.id === c.values?.[0]);
            if (!o)
                return (0, format_1.errorReply)('Diesen Punkt gibt es nicht mehr.');
            const e = (0, shared_1.infoOptionEmbed)(o);
            return { ephemeral: true, embeds: [{ title: e.title ?? o.label, ...(e.description ? { description: e.description } : {}), ...(e.color !== undefined ? { color: e.color } : {}), ...(e.image ? { image: e.image } : {}) }] };
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
    },
};
//# sourceMappingURL=panels.js.map