"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRAINING_INTERACTION = exports.TRAINING_COMMANDS = void 0;
exports.parseGermanDate = parseGermanDate;
exports.checkTrainingTime = checkTrainingTime;
const format_1 = require("../format");
const errors_1 = require("./errors");
/** „08.10.2026 18:30“ (deutsche Zeit) → ISO. Sommer-/Winterzeit über Intl, unabhängig von der Zeitzone des Bot-Servers. */
function parseGermanDate(text, now = new Date()) {
    const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\s*(?:,?\s*(?:um\s*)?(\d{1,2})[:.](\d{2}))?\s*(?:uhr)?\s*$/i.exec(text);
    if (!m)
        return null;
    if (m[3] && m[3].length === 3)
        return null;
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
    const [d, mo, h, mi] = [Number(m[1]), Number(m[2]), Number(m[4] ?? 18), Number(m[5] ?? 0)];
    const guess = Date.UTC(year, mo - 1, d, h, mi);
    if (new Date(guess).getUTCDate() !== d || h > 23 || mi > 59)
        return null;
    // Versatz von Europe/Berlin zu diesem Zeitpunkt
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asBerlin = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const iso = new Date(guess - (asBerlin - guess)).toISOString();
    // ohne Jahr: ein schon vergangener Tag meint das nächste Jahr (im Dezember „05.01.“ → Januar)
    if (!m[3] && Date.parse(iso) < now.getTime() - 86_400_000)
        return parseGermanDate(`${d}.${mo}.${year + 1} ${h}:${String(mi).padStart(2, '0')}`, now);
    return iso;
}
/** Zeitpunkt für einen Ausbildungstermin prüfen: Format, gültiges Datum, nicht in der Vergangenheit, höchstens 1 Jahr im Voraus. */
function checkTrainingTime(text, now = new Date()) {
    const t = text.trim();
    if (!t)
        return { error: 'Bitte angeben, wann die Ausbildung stattfindet – z. B. `08.10.2026 18:30`.' };
    const startsAt = parseGermanDate(t, now);
    if (!startsAt) {
        return { error: /^\s*\d{1,2}\.\d{1,2}\./.test(t)
                ? `„${t.slice(0, 20)}“ ist kein gültiges Datum bzw. keine gültige Uhrzeit (Tag, Monat und Uhrzeit 00:00–23:59 prüfen). Beispiel: \`08.10.2026 18:30\``
                : `Den Zeitpunkt „${t.slice(0, 20)}“ verstehe ich nicht. Bitte so angeben: \`TT.MM.JJJJ HH:MM\`, z. B. \`08.10.2026 18:30\` (deutsche Zeit).` };
    }
    const at = Date.parse(startsAt);
    if (at < now.getTime())
        return { error: `Der Zeitpunkt <t:${Math.floor(at / 1000)}:F> liegt in der Vergangenheit – bitte einen zukünftigen Termin angeben.` };
    if (at > now.getTime() + 366 * 86_400_000)
        return { error: 'Der Termin liegt mehr als ein Jahr in der Zukunft – bitte das Jahr prüfen.' };
    return { startsAt };
}
/** /ausbildung: Termin ansetzen (Formular; Ankündigung mit Anmeldung + Thread im aktuellen Kanal) oder anstehende Termine ansehen. */
exports.TRAINING_COMMANDS = [{
        name: 'ausbildung', description: 'Ausbildungstermin ansetzen oder anstehende Termine ansehen',
        subcommands: [{ name: 'ansetzen', description: 'Neuen Termin ankündigen (in diesem Kanal, mit Anmeldung)' }, { name: 'termine', description: 'Anstehende Ausbildungstermine' }],
        opensModal: true,
        async run(c) {
            try {
                if (c.opts._sub === 'termine') {
                    const list = await c.api.asUser(c.discordId, 'GET', '/hr/training-sessions?scope=upcoming');
                    if (!list.length)
                        return (0, format_1.okReply)('Gerade sind keine Ausbildungstermine angesetzt.');
                    return { ephemeral: true, embeds: [{ title: '📚 Anstehende Ausbildungen', color: format_1.COLORS.info, description: list.slice(0, 15).map((s) => `**${s.title}** – <t:${Math.floor(new Date(s.startsAt).getTime() / 1000)}:F>${s.forRank ? ` · ${s.forRank}` : ''} · ${s.signups.length}${s.maxSignups ? `/${s.maxSignups}` : ''} angemeldet`).join('\n') }] };
                }
                return { modal: { id: 'trn:new', title: 'Ausbildung ansetzen', fields: [
                            { id: 'title', label: 'Titel', required: true, maxLength: 120, value: 'Grundausbildung' },
                            { id: 'when', label: 'Wann? (TT.MM.JJJJ HH:MM)', required: true, maxLength: 20, placeholder: '08.10.2026 18:30' },
                            { id: 'rank', label: 'Für den Rang', required: false, maxLength: 60, placeholder: 'z. B. Polizeianwärter' },
                            { id: 'duration', label: 'Ungefähre Dauer', required: false, maxLength: 60, placeholder: 'z. B. 60–120 Minuten' },
                            { id: 'notes', label: 'Hinweise', paragraph: true, required: false, maxLength: 1500 },
                        ] } };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    }];
/** trn:join:<id> · trn:leave:<id> (Anmelde-Buttons) · trn:new (Formular von /ausbildung ansetzen) */
exports.TRAINING_INTERACTION = {
    prefix: 'trn',
    async run(c) {
        const [action, id] = c.args;
        try {
            if (action === 'join' || action === 'leave') {
                if (!/^[0-9a-f-]{36}$/.test(id ?? ''))
                    return (0, format_1.errorReply)('Ungültige Anfrage.');
                const r = await c.api.service('POST', `/bot/training-sessions/${id}/signup`, { discordId: c.discordId, name: (c.userDisplayName ?? c.userName ?? c.discordId).slice(0, 64), join: action === 'join' });
                return (0, format_1.okReply)(r.message);
            }
            if (action === 'new') {
                const f = c.fields ?? {};
                const title = (f.title ?? '').trim();
                if (title.length < 2)
                    return (0, format_1.errorReply)('Bitte einen Titel mit mindestens 2 Zeichen angeben, z. B. „Grundausbildung“.');
                const when = checkTrainingTime(f.when ?? '');
                if ('error' in when)
                    return (0, format_1.errorReply)(when.error);
                const unix = Math.floor(Date.parse(when.startsAt) / 1000);
                const s = await c.api.asUser(c.discordId, 'POST', '/hr/training-sessions', { title, startsAt: when.startsAt, forRank: f.rank?.trim() || null, duration: f.duration?.trim() || null, notes: f.notes?.trim() || null, channelId: c.channelId ?? null, guildId: c.guildId ?? null });
                return (0, format_1.okReply)(`Ausbildung **${(0, format_1.plain)(title)}** angesetzt (**${s.number}**) für <t:${unix}:F> (<t:${unix}:R>)${f.duration?.trim() ? ` · Dauer: ${(0, format_1.plain)(f.duration.trim())}` : ''} – die Ankündigung mit Anmeldung erscheint gleich in diesem Kanal. Auswerten im Dashboard unter „Ausbildungen & Prüfungen“.`);
            }
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
    },
};
//# sourceMappingURL=trainings.js.map