"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOT_PROFILE_COMMANDS = exports._resetStatusCooldown = exports.presenceText = exports.DEFAULT_PRESENCE = exports.ACTIVITIES = exports.STATUSES = exports.STATUS_COOLDOWN_MS = exports.AVATAR_MAX_BYTES = exports.ACTIVITY_MAX = exports.USERNAME_MAX = exports.USERNAME_MIN = exports.NICK_MAX = void 0;
exports.checkNick = checkNick;
exports.checkUsername = checkUsername;
exports.imageType = imageType;
exports.checkAttachment = checkAttachment;
exports.checkPresence = checkPresence;
exports.toPresenceData = toPresenceData;
exports.discordErrorText = discordErrorText;
exports.restorePresence = restorePresence;
const access_1 = require("../access");
const format_1 = require("../format");
const safety_1 = require("../safety");
/**
 * /botprofil – Name, Profilbild und Status des Bots direkt in Discord anpassen.
 *
 * Was Discord dabei erlaubt (geprüft gegen discord.js 14.27 / Discord-API):
 *  - Name und Profilbild gibt es je Server („Modify Current Member“: `nick`, `avatar`) und global für den Bot-Account
 *    (`PATCH /users/@me`). Je Server reicht ein Serveradministrator; global wirkt auf ALLE Server und ist deshalb nur dem
 *    Bot-Inhaber (Inhaber/Team der Discord-Anwendung) erlaubt. Discord begrenzt globale Änderungen stark (wenige pro Stunde).
 *  - Status und Aktivität (Presence) gibt es nur global – Discord kennt keinen Status je Server. Discord speichert ihn nicht;
 *    der Bot merkt ihn sich und setzt ihn nach jedem (Neu-)Start und jeder neuen Verbindung wieder.
 */
/** Discord-Grenzen. */
exports.NICK_MAX = 32;
exports.USERNAME_MIN = 2, exports.USERNAME_MAX = 32;
exports.ACTIVITY_MAX = 128;
/** Profilbild: von Discord dokumentierte Bildformate; Größe mit Puffer für die Base64-Übertragung. */
exports.AVATAR_MAX_BYTES = 8 * 1024 * 1024;
/** Mindestabstand zwischen zwei Status-Änderungen (Discord begrenzt Presence-Updates je Verbindung). */
exports.STATUS_COOLDOWN_MS = 20_000;
exports.STATUSES = { online: 'Online', idle: 'Abwesend', dnd: 'Bitte nicht stören', invisible: 'Unsichtbar' };
/** Aktivitätsarten, die Bots setzen dürfen (Discord ActivityType). */
exports.ACTIVITIES = { keine: -1, spielt: 0, streamt: 1, hoert: 2, schaut: 3, benutzerdefiniert: 4, wettkampf: 5 };
const ACTIVITY_LABEL = { keine: 'keine Aktivität', spielt: 'Spielt', streamt: 'Streamt', hoert: 'Hört', schaut: 'Schaut', benutzerdefiniert: 'Benutzerdefiniert', wettkampf: 'Tritt an in' };
exports.DEFAULT_PRESENCE = { status: 'online', activity: 'keine', text: null, url: null };
// ───────────── Prüfungen ─────────────
/** Nickname je Server: 1–32 Zeichen; leer = zurücksetzen. */
function checkNick(raw) {
    const nick = raw.trim();
    if (!nick)
        return { nick: null };
    if (nick.length > exports.NICK_MAX)
        return { error: `Der Name ist zu lang (höchstens ${exports.NICK_MAX} Zeichen).` };
    return { nick };
}
/** Globaler Benutzername nach den Discord-Regeln für Namen. */
function checkUsername(raw) {
    const name = raw.trim();
    if (name.length < exports.USERNAME_MIN || name.length > exports.USERNAME_MAX)
        return { error: `Der globale Name muss ${exports.USERNAME_MIN}–${exports.USERNAME_MAX} Zeichen lang sein.` };
    if (/[@#:]|```/.test(name))
        return { error: 'Der globale Name darf kein @, #, : oder ``` enthalten.' };
    if (/discord|clyde/i.test(name))
        return { error: 'Discord erlaubt „discord“ und „clyde“ nicht im Namen.' };
    if (/^(everyone|here)$/i.test(name))
        return { error: '„everyone“ und „here“ sind als Name nicht erlaubt.' };
    return { name };
}
/** Echter Bildtyp aus den ersten Bytes (Dateiendung/Angabe zählen nicht). */
function imageType(b) {
    if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return 'png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
        return 'jpeg';
    if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1')))
        return 'gif';
    return null;
}
/** Vorprüfung des Anhangs (vor dem Herunterladen). */
function checkAttachment(f) {
    if (!f)
        return 'Bitte ein Bild anhängen oder „zuruecksetzen“ wählen.';
    if (f.size > exports.AVATAR_MAX_BYTES)
        return `Das Bild ist zu groß (höchstens ${exports.AVATAR_MAX_BYTES / 1024 / 1024} MB).`;
    if (f.contentType && !/^image\/(png|jpeg|gif)$/i.test(f.contentType.split(';')[0].trim()))
        return 'Erlaubt sind nur PNG, JPG und GIF.';
    return null;
}
/** Status-Eingaben prüfen. */
function checkPresence(o) {
    const status = (o.status || 'online');
    const activity = (o.activity || (o.text?.trim() ? 'benutzerdefiniert' : 'keine'));
    if (!(status in exports.STATUSES))
        return { error: 'Unbekannter Status.' };
    if (!(activity in exports.ACTIVITIES))
        return { error: 'Unbekannte Aktivitätsart.' };
    const text = o.text?.trim() || null;
    if (activity !== 'keine' && !text)
        return { error: 'Für eine Aktivität bitte einen Text angeben.' };
    if (text && text.length > exports.ACTIVITY_MAX)
        return { error: `Der Aktivitätstext ist zu lang (höchstens ${exports.ACTIVITY_MAX} Zeichen).` };
    const url = o.url?.trim() || null;
    if (activity === 'streamt' && !(url && /^https:\/\/(www\.)?(twitch\.tv|youtube\.com)\/\S+$/i.test(url)))
        return { error: 'Für „Streamt“ verlangt Discord einen Twitch- oder YouTube-Link (https://twitch.tv/… oder https://youtube.com/…).' };
    if (url && activity !== 'streamt')
        return { error: 'Ein Link ist nur bei „Streamt“ möglich.' };
    return { presence: { status, activity, text: activity === 'keine' ? null : text, url } };
}
/** Status in die Form von discord.js (`client.user.setPresence`). */
function toPresenceData(p) {
    if (p.activity === 'keine' || !p.text)
        return { status: p.status, activities: [] };
    const type = exports.ACTIVITIES[p.activity];
    // Benutzerdefiniert: Discord zeigt `state`; `name` muss trotzdem gesetzt sein
    if (p.activity === 'benutzerdefiniert')
        return { status: p.status, activities: [{ name: 'Custom Status', type, state: p.text }] };
    return { status: p.status, activities: [{ name: p.text, type, ...(p.url ? { url: p.url } : {}) }] };
}
const presenceText = (p) => `${exports.STATUSES[p.status]}${p.activity !== 'keine' && p.text ? ` · ${ACTIVITY_LABEL[p.activity]}${p.activity === 'benutzerdefiniert' ? ':' : ''} ${(0, format_1.plain)(p.text)}` : ''}`;
exports.presenceText = presenceText;
/** Fehler von Discord in verständliche Sätze (keine Stacktraces, keine Geheimnisse). */
function discordErrorText(e, what) {
    const x = e;
    const raw = JSON.stringify(x?.rawError?.errors ?? '') + (x?.message ?? '');
    if (x?.status === 429 || /RATE_LIMIT|too fast|zu schnell/i.test(raw))
        return `Discord lässt ${what} gerade nicht zu: zu viele Änderungen in kurzer Zeit (Discord erlaubt nur wenige pro Stunde). Bitte später erneut versuchen.`;
    if (x?.code === 50013)
        return `Dem Bot fehlt auf diesem Server die nötige Berechtigung für ${what}.`;
    if (x?.code === 50001)
        return `Der Bot hat keinen Zugriff für ${what}.`;
    if (x?.code === 50035)
        return `Discord hat ${what} abgelehnt (ungültiger Wert${/USERNAME_TOO_MANY_USERS/.test(raw) ? ': dieser Name wird schon zu oft verwendet' : /BINARY_TYPE_MAX_SIZE|too large/i.test(raw) ? ': Bild zu groß' : /IMAGE|AVATAR/i.test(raw) ? ': Bild wird nicht akzeptiert' : ''}).`;
    if (x?.code === 'TOO_LARGE')
        return 'Das Bild ist zu groß.';
    if (typeof x?.status === 'number' && x.status >= 500)
        return `Discord ist gerade gestört – ${what} hat nicht geklappt. Bitte später erneut versuchen.`;
    return `${what[0].toUpperCase()}${what.slice(1)} hat nicht geklappt${x?.message ? `: ${(0, safety_1.redact)(String(x.message)).slice(0, 200)}` : '.'}`;
}
// ───────────── Befehl ─────────────
let lastStatusChange = 0;
const _resetStatusCooldown = () => { lastStatusChange = 0; };
exports._resetStatusCooldown = _resetStatusCooldown;
async function scopeAllowed(c, scope, p) {
    if (scope === 'global' && !(await p.isBotOwner(c.discordId).catch(() => false)))
        return (0, format_1.errorReply)('Globale Änderungen wirken auf **alle** Server des Bots und sind deshalb nur dem Bot-Inhaber (Inhaber bzw. Team der Discord-Anwendung) erlaubt. Für diesen Server: `bereich: server`.');
    return null;
}
async function setName(c, p, scope) {
    const input = String(c.opts.name ?? '');
    if (scope === 'server') {
        const r = checkNick(input);
        if (r.error)
            return (0, format_1.errorReply)(r.error);
        if (!(await p.canChangeNickname(c.guildId).catch(() => false)))
            return (0, format_1.errorReply)('Dem Bot fehlt auf diesem Server das Recht „Nickname ändern“. Servereinstellungen → Rollen → Bot-Rolle → „Nickname ändern“ aktivieren.');
        try {
            await p.setServerNick(c.guildId, r.nick ?? null);
        }
        catch (e) {
            return (0, format_1.errorReply)(discordErrorText(e, 'die Namensänderung'));
        }
        return (0, format_1.okReply)(r.nick ? `Der Bot heißt auf diesem Server jetzt **${(0, format_1.plain)(r.nick)}**.` : 'Der Name des Bots auf diesem Server wurde zurückgesetzt (globaler Name).');
    }
    const r = checkUsername(input);
    if (r.error)
        return (0, format_1.errorReply)(r.error);
    try {
        await p.setGlobalName(r.name);
    }
    catch (e) {
        return (0, format_1.errorReply)(discordErrorText(e, 'die Namensänderung'));
    }
    return (0, format_1.okReply)(`Der globale Name des Bots ist jetzt **${(0, format_1.plain)(r.name)}** (gilt auf allen Servern, außer wo ein eigener Server-Name gesetzt ist).`);
}
async function setAvatar(c, p, scope) {
    const reset = c.opts.zuruecksetzen === true;
    const file = c.attachments?.bild;
    let image = null;
    if (!reset) {
        const pre = checkAttachment(file);
        if (pre)
            return (0, format_1.errorReply)(pre);
        try {
            image = await p.download(file.url, exports.AVATAR_MAX_BYTES);
        }
        catch (e) {
            return (0, format_1.errorReply)(e?.code === 'TOO_LARGE' ? `Das Bild ist zu groß (höchstens ${exports.AVATAR_MAX_BYTES / 1024 / 1024} MB).` : 'Das Bild konnte nicht geladen werden. Bitte erneut anhängen.');
        }
        if (image.length > exports.AVATAR_MAX_BYTES)
            return (0, format_1.errorReply)(`Das Bild ist zu groß (höchstens ${exports.AVATAR_MAX_BYTES / 1024 / 1024} MB).`);
        if (!imageType(image))
            return (0, format_1.errorReply)('Die Datei ist kein PNG-, JPG- oder GIF-Bild (geprüft wird der Inhalt, nicht die Endung).');
    }
    try {
        if (scope === 'server')
            await p.setServerAvatar(c.guildId, image);
        else
            await p.setGlobalAvatar(image);
    }
    catch (e) {
        return (0, format_1.errorReply)(discordErrorText(e, 'die Änderung des Profilbilds'));
    }
    if (scope === 'server')
        return (0, format_1.okReply)(image ? 'Das Profilbild des Bots auf diesem Server wurde geändert.' : 'Das Profilbild des Bots auf diesem Server wurde zurückgesetzt (globales Profilbild).');
    return (0, format_1.okReply)(image ? 'Das globale Profilbild des Bots wurde geändert (gilt auf allen Servern ohne eigenes Server-Profilbild).' : 'Das globale Profilbild des Bots wurde entfernt (Discord-Standardbild).');
}
async function setStatus(c, p) {
    if (!(await p.isBotOwner(c.discordId).catch(() => false)))
        return (0, format_1.errorReply)('Der Status des Bots gilt bei Discord immer für **alle** Server (einen Status je Server gibt es nicht). Ändern darf ihn deshalb nur der Bot-Inhaber (Inhaber bzw. Team der Discord-Anwendung).');
    const r = checkPresence({ status: c.opts.status, activity: c.opts.art, text: c.opts.text, url: c.opts.link });
    if (r.error)
        return (0, format_1.errorReply)(r.error);
    const wait = lastStatusChange + exports.STATUS_COOLDOWN_MS - Date.now();
    if (wait > 0)
        return (0, format_1.errorReply)(`Bitte ${Math.ceil(wait / 1000)} Sekunden warten – Discord begrenzt, wie oft der Status geändert werden darf.`);
    try {
        await p.setPresence(r.presence);
    }
    catch (e) {
        return (0, format_1.errorReply)(discordErrorText(e, 'die Statusänderung'));
    }
    lastStatusChange = Date.now();
    const saved = await p.savePresence(r.presence).then(() => true, () => false);
    return { ephemeral: true, embeds: [{ title: '✅ Status geändert', description: `${(0, exports.presenceText)(r.presence)}${saved ? '' : '\n\n⚠️ Konnte nicht gespeichert werden (System nicht erreichbar?) – nach einem Neustart gilt wieder der vorherige Status.'}`, color: format_1.COLORS.success }] };
}
exports.BOT_PROFILE_COMMANDS = [{
        name: 'botprofil', description: 'Name, Profilbild und Status des Bots anpassen',
        subcommands: [
            { name: 'name', description: 'Bot-Namen ändern (leer lassen = Server-Name zurücksetzen)', options: [
                    { name: 'name', description: 'Neuer Name (Server: bis 32 Zeichen, leer = zurücksetzen)', type: 'string', maxLength: exports.USERNAME_MAX },
                    { name: 'bereich', description: 'Nur dieser Server (Standard) oder global für alle Server (nur Bot-Inhaber)', type: 'string', choices: [{ name: 'dieser Server', value: 'server' }, { name: 'global (alle Server)', value: 'global' }] },
                ] },
            { name: 'avatar', description: 'Profilbild des Bots ändern (PNG, JPG oder GIF)', options: [
                    { name: 'bild', description: 'Neues Profilbild (PNG, JPG oder GIF, bis 8 MB)', type: 'attachment' },
                    { name: 'bereich', description: 'Nur dieser Server (Standard) oder global für alle Server (nur Bot-Inhaber)', type: 'string', choices: [{ name: 'dieser Server', value: 'server' }, { name: 'global (alle Server)', value: 'global' }] },
                    { name: 'zuruecksetzen', description: 'Profilbild zurücksetzen statt ein neues zu setzen', type: 'boolean' },
                ] },
            { name: 'status', description: 'Status und Aktivitätstext des Bots (gilt auf allen Servern, nur Bot-Inhaber)', options: [
                    { name: 'status', description: 'Online-Status', type: 'string', choices: Object.keys(exports.STATUSES).map((k) => ({ name: exports.STATUSES[k], value: k })) },
                    { name: 'art', description: 'Art der Aktivität (Standard: benutzerdefiniert, wenn ein Text angegeben ist)', type: 'string', choices: Object.keys(exports.ACTIVITIES).map((k) => ({ name: ACTIVITY_LABEL[k], value: k })) },
                    { name: 'text', description: `Aktivitätstext (bis ${exports.ACTIVITY_MAX} Zeichen)`, type: 'string', maxLength: exports.ACTIVITY_MAX },
                    { name: 'link', description: 'Nur bei „Streamt“: Twitch- oder YouTube-Link', type: 'string', maxLength: 200 },
                ] },
        ],
        async run(c) {
            const sub = String(c.opts._sub ?? '');
            const denied = await (0, access_1.guard)(c, `botprofil ${sub}`);
            if (denied)
                return denied;
            const p = c.botProfile;
            if (!p || !c.guildId)
                return (0, format_1.errorReply)('Das geht nur auf einem Discord-Server.');
            const scope = c.opts.bereich === 'global' ? 'global' : 'server';
            const blocked = await scopeAllowed(c, scope, p);
            if (blocked)
                return blocked;
            if (sub === 'name')
                return setName(c, p, scope);
            if (sub === 'avatar')
                return setAvatar(c, p, scope);
            if (sub === 'status')
                return setStatus(c, p);
            return (0, format_1.errorReply)('Unbekannter Unterbefehl.');
        },
    }];
/** Gespeicherten Status setzen (nach dem Start und nach jeder neuen Verbindung). */
async function restorePresence(p, log = console.error) {
    const saved = await p.loadPresence().catch((e) => { log(`bot status not loaded: ${e instanceof Error ? e.message : e}`); return null; });
    if (!saved)
        return null;
    const ok = checkPresence({ status: saved.status, activity: saved.activity, text: saved.text ?? undefined, url: saved.url ?? undefined });
    if (!ok.presence) {
        log('saved bot status is invalid – ignored');
        return null;
    }
    await p.setPresence(ok.presence).catch((e) => log(`bot status not set: ${e instanceof Error ? e.message : e}`));
    return ok.presence;
}
//# sourceMappingURL=bot-profile.js.map