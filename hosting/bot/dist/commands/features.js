"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interactionFor = exports.INTERACTIONS = exports.FEATURE_COMMANDS = exports.resetFormCache = void 0;
exports.modalFieldsFor = modalFieldsFor;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
const sek_1 = require("./sek");
const qualifications_1 = require("./qualifications");
const str = (c, k) => String(c.opts[k] ?? '').trim();
const choices = (m) => Object.keys(m).map((k) => ({ name: k.replace('_', ' '), value: k }));
const needGuildAdmin = (c) => (!c.guildId ? (0, format_1.errorReply)('Das geht nur auf einem Server, nicht per Direktnachricht.') : !c.isGuildAdmin ? (0, format_1.errorReply)('Dafür brauchst du auf diesem Discord-Server das Recht „Server verwalten“.') : null);
// ---------------- Gefahrenstatus ----------------
const LEVEL = { gruen: 'GREEN', gelb: 'YELLOW', rot: 'RED' };
async function setDanger(c, level, reason) {
    try {
        const s = await c.api.asUser(c.discordId, 'PUT', '/danger-level', { level, ...(reason ? { reason } : {}) });
        await c.refreshLive?.('danger').catch(() => undefined); // Panel sofort nachziehen (sonst spätestens beim nächsten Abgleich)
        return (0, format_1.okReply)(`Gefahrenstatus: ${format_1.DANGER[s.level]?.emoji ?? ''} **${format_1.DANGER[s.level]?.label ?? s.level}**`);
    }
    catch (e) {
        return (0, errors_1.mapError)(e);
    }
}
/** Discord erlaubt höchstens 5 Eingabefelder pro Formular; eins davon ist der Roblox-Name. */
const MAX_MODAL_FORM_FIELDS = 4;
let formCache;
/** Das Formular wird kurz zwischengespeichert: Discord gibt nur 3 Sekunden Zeit, bis das Formular angezeigt werden muss. */
async function applicationForm(c) {
    if (formCache && Date.now() - formCache.at < 5 * 60_000)
        return formCache.form;
    const form = await c.api.service('GET', '/applications/form');
    formCache = { at: Date.now(), form };
    return form;
}
const resetFormCache = () => { formCache = undefined; };
exports.resetFormCache = resetFormCache;
/** Pflichtfelder zuerst; passt das Formular nicht in ein Discord-Formular, bleibt nur das Web. */
function modalFieldsFor(form) {
    const required = form.filter((f) => f.required), optional = form.filter((f) => !f.required);
    if (required.length > MAX_MODAL_FORM_FIELDS)
        return null;
    return [...required, ...optional].slice(0, MAX_MODAL_FORM_FIELDS).map((f) => ({ id: `f_${f.key}`, label: (0, format_1.clip)(f.label, 45), paragraph: f.maxLength > 200, required: f.required, maxLength: Math.min(f.maxLength, 4000) }));
}
// ---------------- Support-Tickets ----------------
const SUPPORT_PANEL = { title: '🎫 Support', color: format_1.COLORS.info, description: 'Fragen, Probleme oder Anliegen an die Leitung? Klicke auf **Ticket öffnen** – es wird ein privater Channel nur für dich und das Team angelegt.' };
const SUPPORT_OPEN = { id: 'support:open', label: 'Ticket öffnen', emoji: '🎫', style: 'primary' };
const SUPPORT_CLOSE = { id: 'support:close', label: 'Ticket schließen', emoji: '🔒', style: 'danger' };
// ---------------- Funk-Freigabe ----------------
const RADIO = { hinzufuegen: 'add', entfernen: 'remove', pruefen: 'check', liste: 'list' };
exports.FEATURE_COMMANDS = [
    {
        name: 'gefahrenstatus', description: 'Gefahrenstatus anzeigen, setzen oder als Panel posten',
        options: [
            { name: 'aktion', description: 'Was möchtest du tun? (Standard: anzeigen)', type: 'string', choices: [{ name: 'anzeigen', value: 'anzeigen' }, { name: 'setzen', value: 'setzen' }, { name: 'panel hier posten', value: 'panel' }] },
            { name: 'stufe', description: 'Neue Stufe (bei „setzen“)', type: 'string', choices: choices(LEVEL) },
            { name: 'grund', description: 'Grund (optional, bei „setzen“)', type: 'string', maxLength: 200 },
        ],
        async run(c) {
            const action = str(c, 'aktion') || 'anzeigen';
            if (action === 'setzen') {
                const level = LEVEL[str(c, 'stufe')];
                return level ? setDanger(c, level, str(c, 'grund') || undefined) : (0, format_1.errorReply)('Bitte eine Stufe wählen (grün, gelb, rot).');
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
        name: 'bewerbung', description: 'Bewirb dich bei EN Polizei (Formular)', opensModal: true,
        async run(c) {
            try {
                const fields = modalFieldsFor(await applicationForm(c));
                if (!fields)
                    return (0, format_1.errorReply)('Das Bewerbungsformular ist zu lang für Discord. Bitte bewirb dich über das Web-Formular (Seite `/apply`).');
                return { modal: { id: 'bewerbung:submit', title: 'Bewerbung – EN Polizei', fields: [{ id: 'roblox', label: 'Dein Roblox-Name', required: true, maxLength: 20, placeholder: 'z. B. Builderman' }, ...fields] } };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'supportpanel', description: 'Postet das Support-Ticket-Panel in diesen Channel',
        async run(c) {
            const denied = needGuildAdmin(c);
            if (denied)
                return denied;
            if (!c.channelId || !c.platform)
                return (0, format_1.errorReply)('Panel kann hier nicht gepostet werden.');
            try {
                await c.platform.postPanel({ channelId: c.channelId, embed: SUPPORT_PANEL, buttons: [SUPPORT_OPEN] });
                const cfg = await c.config?.().catch(() => undefined);
                return (0, format_1.okReply)(`Support-Panel gepostet.${cfg?.staffRole ? '' : ' Tipp: In den Einstellungen eine **Team-Rolle** hinterlegen, damit das Team Tickets sieht.'}`);
            }
            catch {
                return (0, format_1.errorReply)('Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Channel?).');
            }
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
exports.INTERACTIONS = [
    sek_1.SEK_INTERACTION,
    qualifications_1.QUALI_INTERACTION,
    {
        prefix: 'danger',
        async run(c) {
            const level = c.args[0] === 'set' ? c.args[1] : undefined;
            return level && level in format_1.DANGER ? setDanger(c, level) : (0, format_1.errorReply)('Unbekannte Aktion.');
        },
    },
    {
        prefix: 'bewerbung',
        async run(c) {
            const f = c.fields ?? {};
            const robloxUsername = (f.roblox ?? '').trim();
            if (!robloxUsername)
                return (0, format_1.errorReply)('Bitte deinen Roblox-Namen angeben.');
            const answers = Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('f_')).map(([k, v]) => [k.slice(2), v.trim()]));
            try {
                // Roblox-ID ist optional: wird gefunden, prüft das System doppelte offene Bewerbungen zuverlässiger
                const rb = await c.robloxLookup?.(robloxUsername).catch(() => null);
                const r = await c.api.service('POST', '/bot/application', { robloxUsername: rb?.name ?? robloxUsername, ...(rb ? { robloxUserId: String(rb.id) } : {}), discordId: c.discordId, answers });
                return (0, format_1.okReply)(`Danke! Deine Bewerbung **${r.number}** ist eingegangen. Die Entscheidung bekommst du per Direktnachricht (bitte DMs von Servermitgliedern erlauben).`);
            }
            catch (e) {
                if (e instanceof api_1.BotApiError && e.status === 409)
                    return (0, format_1.errorReply)('Für diesen Roblox-Account läuft bereits eine offene Bewerbung.');
                return (0, errors_1.mapError)(e);
            }
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
            if (c.args[0] !== 'open')
                return (0, format_1.errorReply)('Unbekannte Aktion.');
            const cfg = await c.config?.().catch(() => undefined);
            try {
                const t = await c.platform.createTicketChannel({ guildId: c.guildId, userId: c.discordId, userName: c.userName ?? c.discordId, categoryId: cfg?.tickets, staffRoleId: cfg?.staffRole });
                if (t.existing)
                    return (0, format_1.okReply)(`Du hast schon ein offenes Ticket: <#${t.channelId}>`);
                await c.platform.postPanel({ channelId: t.channelId, embed: { title: '🎫 Ticket geöffnet', color: format_1.COLORS.info, description: `<@${c.discordId}>, beschreibe dein Anliegen – das Team meldet sich hier.\nZum Schließen den Button unten nutzen.` }, buttons: [SUPPORT_CLOSE] });
                return (0, format_1.okReply)(`Dein Ticket: <#${t.channelId}>`);
            }
            catch {
                return (0, format_1.errorReply)('Ticket konnte nicht angelegt werden (fehlen dem Bot die Rechte „Kanäle verwalten“?).');
            }
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