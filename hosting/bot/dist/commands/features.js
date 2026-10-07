"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interactionFor = exports.INTERACTIONS = exports.FEATURE_COMMANDS = void 0;
exports.shiftPicker = shiftPicker;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
const sek_1 = require("./sek");
const qualifications_1 = require("./qualifications");
const tickets_1 = require("./tickets");
const voice_support_1 = require("../voice-support");
const leave_1 = require("./leave");
const cad_1 = require("./cad");
const str = (c, k) => String(c.opts[k] ?? '').trim();
const choices = (m) => Object.keys(m).map((k) => ({ name: k.replace('_', ' '), value: k }));
const needGuildAdmin = (c) => (!c.guildId ? (0, format_1.errorReply)('Das geht nur auf einem Server, nicht per Direktnachricht.') : !c.isGuildAdmin ? (0, format_1.errorReply)('Dafür brauchst du auf diesem Discord-Server das Recht „Server verwalten“.') : null);
// ---------------- Gefahrenstatus ----------------
/** Alte Eingaben (grün/gelb/rot) weiter verstehen; sonst entscheidet die API anhand der eingestellten Stufen. */
const LEGACY = { gruen: 'STATUS_1', 'grün': 'STATUS_1', gelb: 'STATUS_2', rot: 'STATUS_4' };
async function setDanger(c, level, reason) {
    try {
        const s = await c.api.asUser(c.discordId, 'PUT', '/danger-level', { level, ...(reason ? { reason } : {}) });
        await c.refreshLive?.('danger').catch(() => undefined); // Panel sofort nachziehen (sonst spätestens beim nächsten Abgleich)
        return (0, format_1.okReply)(`Gefahrenstatus: ${s.def?.emoji ?? ''} **${(0, format_1.plain)(s.def?.name ?? s.level)}**${s.def?.title ? ` – ${(0, format_1.plain)(s.def.title)}` : ''}`);
    }
    catch (e) {
        return (0, errors_1.mapError)(e);
    }
}
// ---------------- Dienst-Panel ----------------
const DUTY_PANEL = { title: '🚓 Dienststatus', color: format_1.COLORS.info, description: 'Melde dich hier mit einem Klick **in den Dienst**, in die **Pause** oder **außer Dienst**.\nDein Status erscheint sofort im Dashboard, in der Teamliste und – falls eingestellt – als Discord-Rolle.\n\n*Dein Discord-Konto muss verknüpft sein (`/verknuepfen`).*' };
const DUTY_BUTTONS = [
    { id: 'duty:ON_DUTY', label: 'Im Dienst', emoji: '🟢', style: 'success' }, { id: 'duty:BREAK', label: 'Pause', emoji: '🟡', style: 'secondary' },
    { id: 'duty:TRAINING', label: 'Training', emoji: '🔵', style: 'secondary' }, { id: 'duty:ADMINISTRATIVE', label: 'Verwaltung', emoji: '🗂️', style: 'secondary' },
    { id: 'duty:OFF_DUTY', label: 'Außer Dienst', emoji: '⚪', style: 'danger' },
];
// ---------------- Funk-Freigabe ----------------
const RADIO = { hinzufuegen: 'add', entfernen: 'remove', pruefen: 'check', liste: 'list' };
exports.FEATURE_COMMANDS = [
    {
        name: 'gefahrenstatus', description: 'Gefahrenstatus anzeigen, setzen oder als Panel posten',
        options: [
            { name: 'aktion', description: 'Was möchtest du tun? (Standard: anzeigen)', type: 'string', choices: [{ name: 'anzeigen', value: 'anzeigen' }, { name: 'setzen', value: 'setzen' }, { name: 'panel hier posten', value: 'panel' }] },
            { name: 'stufe', description: 'Neue Stufe (bei „setzen“), z. B. Status 2', type: 'string', maxLength: 40 },
            { name: 'grund', description: 'Grund (optional, bei „setzen“)', type: 'string', maxLength: 200 },
        ],
        async run(c) {
            const action = str(c, 'aktion') || 'anzeigen';
            if (action === 'setzen') {
                const level = str(c, 'stufe');
                return level ? setDanger(c, LEGACY[level.toLowerCase()] ?? level, str(c, 'grund') || undefined) : (0, format_1.errorReply)('Bitte eine Stufe angeben (z. B. „Status 2“).');
            }
            if (action === 'panel') {
                const denied = needGuildAdmin(c);
                if (denied)
                    return denied;
                if (!c.channelId || !c.refreshLive)
                    return (0, format_1.errorReply)('Panel kann hier nicht gepostet werden.');
                try {
                    await c.api.asUser(c.discordId, 'GET', '/danger-level'); // nur verknüpfte Benutzer mit Leserecht richten das Panel ein
                    await c.refreshLive('danger', { channelId: c.channelId, force: true });
                    return (0, format_1.okReply)('Gefahrenstatus-Panel gepostet. Es aktualisiert sich selbst; ein älteres Panel wird nicht mehr bearbeitet.');
                }
                catch (e) {
                    return (0, errors_1.mapError)(e);
                }
            }
            try {
                return { ephemeral: true, embeds: [(0, format_1.dangerEmbed)(await c.api.asUser(c.discordId, 'GET', '/danger-level'))] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'teamliste', description: 'Richtet die selbst aktualisierende Teamliste ein bzw. aktualisiert sie sofort',
        async run(c) {
            const denied = needGuildAdmin(c);
            if (denied)
                return denied;
            if (!c.refreshLive)
                return (0, format_1.errorReply)('Teamliste ist hier nicht verfügbar.');
            try {
                await c.api.asUser(c.discordId, 'GET', '/team/overview'); // Leserecht im System prüfen
                const cfg = await c.config?.();
                const p = await c.refreshLive('teamlist', { channelId: cfg?.teamlist ? undefined : c.channelId, force: true });
                return p ? (0, format_1.okReply)(`Teamliste steht in <#${p.channelId}> und aktualisiert sich automatisch.`) : (0, format_1.errorReply)('Kein Channel für die Teamliste gefunden.');
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'funkfreigabe', description: 'Funk-Whitelist verwalten (hinzufügen, entfernen, prüfen, Liste)',
        options: [
            { name: 'aktion', description: 'Aktion', type: 'string', required: true, choices: choices(RADIO) },
            { name: 'mitglied', description: 'Discord-Mitglied (nicht bei „liste“)', type: 'user' },
        ],
        async run(c) {
            const action = RADIO[str(c, 'aktion')];
            if (!action)
                return (0, format_1.errorReply)('Unbekannte Aktion.');
            try {
                if (action === 'list') {
                    const rows = await c.api.asUser(c.discordId, 'GET', '/radio-whitelist');
                    return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`📻 Funk-Freigabe (${rows.length})`, rows.map((r) => `• ${r.callsign ? `**${(0, format_1.plain)(r.callsign)}** ` : ''}${(0, format_1.plain)(r.displayName)}`), 'Noch niemand freigegeben.')] };
                }
                const target = str(c, 'mitglied');
                if (!/^\d{15,25}$/.test(target))
                    return (0, format_1.errorReply)('Bitte ein Mitglied angeben.');
                if (action === 'check') {
                    const r = await c.api.asUser(c.discordId, 'GET', `/radio-whitelist/check?discordId=${target}`);
                    return r.whitelisted ? (0, format_1.okReply)(`**${(0, format_1.plain)(r.displayName)}** ist für den Funk freigegeben.`) : (0, format_1.errorReply)(`**${(0, format_1.plain)(r.displayName)}** ist **nicht** für den Funk freigegeben.`);
                }
                const r = await c.api.asUser(c.discordId, 'POST', action === 'add' ? '/radio-whitelist' : '/radio-whitelist/remove', { discordId: target });
                // Optional die Discord-Funkrolle mitziehen (System bleibt maßgeblich; Rollenfehler nur als Hinweis)
                let note = '';
                const cfg = await c.config?.().catch(() => undefined);
                if (cfg?.radioRole && c.guildId && c.platform) {
                    try {
                        await c.platform.setRole(c.guildId, target, cfg.radioRole, action === 'add');
                        note = ` Rolle <@&${cfg.radioRole}> ${action === 'add' ? 'vergeben' : 'entzogen'}.`;
                    }
                    catch {
                        note = ' ⚠️ Die Discord-Rolle konnte nicht geändert werden (Bot-Rolle muss über der Funkrolle stehen und „Rollen verwalten“ haben).';
                    }
                }
                return (0, format_1.okReply)(`**${(0, format_1.plain)(r.displayName)}** ${action === 'add' ? 'ist jetzt für den Funk freigegeben' : 'wurde von der Funk-Freigabe entfernt'}.${note}`);
            }
            catch (e) {
                if (e instanceof api_1.BotApiError && e.status === 404)
                    return (0, format_1.errorReply)('Dieses Discord-Konto ist mit keinem aktiven Benutzer verknüpft (oder steht nicht auf der Liste).');
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'dienstpanel', description: 'Postet das Dienst-Panel (Im Dienst / Pause / Außer Dienst per Button) in diesen Channel',
        async run(c) {
            const denied = needGuildAdmin(c);
            if (denied)
                return denied;
            if (!c.channelId || !c.platform)
                return (0, format_1.errorReply)('Panel kann hier nicht gepostet werden.');
            try {
                await c.platform.postPanel({ channelId: c.channelId, embed: DUTY_PANEL, buttons: DUTY_BUTTONS });
            }
            catch {
                return (0, format_1.errorReply)('Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Channel?).');
            }
            const cfg = await c.config?.().catch(() => undefined);
            return (0, format_1.okReply)(`Dienst-Panel gepostet.${cfg?.dutyRole || cfg?.duty ? '' : ' Tipp: In den Einstellungen einen **Dienst-Channel** (Meldungen) und eine **Dienst-Rolle** hinterlegen.'}`);
        },
    },
    {
        name: 'roblox', description: 'Sucht einen Roblox-Benutzer (Name → ID)',
        options: [{ name: 'name', description: 'Roblox-Benutzername', type: 'string', required: true, maxLength: 20 }],
        async run(c) {
            if (!c.robloxLookup)
                return (0, format_1.errorReply)('Roblox-Suche ist nicht verfügbar.');
            const u = await c.robloxLookup(str(c, 'name'));
            if (!u)
                return (0, format_1.errorReply)(`Kein Roblox-Benutzer „${(0, format_1.plain)(str(c, 'name'))}“ gefunden (oder Roblox ist gerade nicht erreichbar).`);
            return { ephemeral: true, embeds: [{ title: (0, format_1.clip)(`🎮 ${(0, format_1.plain)(u.name)}`, 256), color: format_1.COLORS.info, fields: [
                            { name: 'Roblox-ID', value: String(u.id), inline: true }, { name: 'Anzeigename', value: (0, format_1.clip)((0, format_1.plain)(u.displayName), 1024), inline: true },
                            { name: 'Profil', value: `https://www.roblox.com/users/${u.id}/profile` }
                        ] }] };
        },
    },
];
async function shiftTypes(c) {
    const cfg = await c.api.service('GET', '/bot/shifts').catch(() => null);
    return cfg?.enabled ? cfg.types : null;
}
/** Mehrere Schicht-Arten (Admin → Shifts)? Dann erst auswählen lassen; sonst `null` (Standard-Schicht). */
async function shiftPicker(c) {
    const types = await shiftTypes(c);
    if (!types || types.length < 2)
        return null;
    return { ephemeral: true, content: 'Welche Schicht beginnst du?', select: { id: 'duty:type', placeholder: 'Schicht wählen …', options: types.slice(0, 25).map((t) => ({ label: (0, format_1.clip)(t.name, 100), value: t.id, ...(t.isDefault ? { description: 'Standard' } : {}) })) } };
}
exports.INTERACTIONS = [
    {
        prefix: 'duty',
        async run(c) {
            // Auswahl der Schicht-Art (Auswahlmenü nach „Im Dienst“)
            const shiftType = c.args[0] === 'type' ? c.values?.[0] : undefined;
            const status = c.args[0] === 'type' ? 'ON_DUTY' : c.args[0] ?? '';
            if (!format_1.DUTY_DE[status])
                return (0, format_1.errorReply)('Unbekannter Status.');
            if (status === 'ON_DUTY' && !shiftType) {
                const pick = await shiftPicker(c);
                if (pick)
                    return pick;
            }
            try {
                const r = await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status, ...(shiftType ? { shiftType } : {}) });
                const name = shiftType ? (await shiftTypes(c))?.find((t) => t.id === (r.shiftType ?? shiftType))?.name : undefined;
                return (0, format_1.okReply)(`${format_1.DUTY_DE[status].emoji} Du bist jetzt **${format_1.DUTY_DE[status].label}**${name ? ` (Schicht: **${(0, format_1.plain)(name)}**)` : ''}.`);
            }
            catch (e) {
                if (e instanceof api_1.BotApiError && e.status === 409)
                    return (0, format_1.okReply)(`Du bist bereits **${format_1.DUTY_DE[status].label}**.`);
                return (0, errors_1.mapError)(e);
            }
        },
    },
    sek_1.SEK_INTERACTION,
    qualifications_1.QUALI_INTERACTION,
    tickets_1.TICKET_INTERACTION,
    voice_support_1.VOICE_INTERACTION,
    leave_1.LEAVE_INTERACTION,
    cad_1.CAD_INTERACTION,
    {
        prefix: 'danger',
        async run(c) {
            const level = c.args[0] === 'set' ? c.args[1] : undefined;
            return level ? setDanger(c, level) : (0, format_1.errorReply)('Unbekannte Aktion.');
        },
    },
    {
        prefix: 'support',
        async run(c) {
            if (!c.guildId || !c.platform)
                return (0, format_1.errorReply)('Das geht nur auf einem Server.');
            if (c.args[0] === 'close') {
                if (!c.channelId)
                    return (0, format_1.errorReply)('Unbekannter Channel.');
                await c.platform.deleteChannel(c.channelId, 5000);
                return (0, format_1.okReply)('Ticket wird in 5 Sekunden geschlossen.');
            }
            return (0, format_1.errorReply)('Dieses alte Support-Panel wird nicht mehr unterstützt. Bitte das neue Ticket-Panel benutzen.');
        },
    },
];
const interactionFor = (customId) => {
    const [prefix, ...args] = customId.split(':');
    const def = exports.INTERACTIONS.find((d) => d.prefix === prefix);
    return def ? { def, args } : undefined;
};
exports.interactionFor = interactionFor;
//# sourceMappingURL=features.js.map