"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.byName = exports.mapError = exports.COMMANDS = void 0;
const errors_1 = require("./errors");
Object.defineProperty(exports, "mapError", { enumerable: true, get: function () { return errors_1.mapError; } });
const features_1 = require("./features");
const leave_1 = require("./leave");
const features_2 = require("./features");
const tickets_1 = require("./tickets");
const duty_reports_1 = require("./duty-reports");
const warnings_1 = require("./warnings");
const radio_whitelist_1 = require("./radio-whitelist");
const trainings_1 = require("./trainings");
const shifts_1 = require("./shifts");
const setup_1 = require("./setup");
const system_1 = require("./system");
const backup_1 = require("./backup");
const exams_1 = require("./exams");
const bot_profile_1 = require("./bot-profile");
const reminders_1 = require("./reminders");
const extension4_1 = require("./extension4");
const administration_1 = require("./administration");
const format_1 = require("../format");
/** Minuten → „3 h 05 min“. */
const hm = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const q = (s) => encodeURIComponent(s.trim());
const str = (c, k) => String(c.opts[k] ?? '').trim();
const DUTY = { an: 'ON_DUTY', pause: 'BREAK', aus: 'OFF_DUTY' };
const choices = (m) => Object.keys(m).map((k) => ({ name: k.replace('_', ' '), value: k }));
const CHANNEL = { team: 'TEAM', dispatch: 'DISPATCH' };
exports.COMMANDS = [
    {
        name: 'funkcode', description: 'Funk-Codes nachschlagen (z. B. 10-4)',
        options: [{ name: 'suche', description: 'Code oder Bedeutung (leer = alle)', type: 'string', maxLength: 64 }],
        async run(c) {
            try {
                const term = str(c, 'suche');
                const rows = await c.api.asUser(c.discordId, 'GET', `/radio-codes${term ? `?q=${q(term)}` : ''}`);
                if (!rows.length)
                    return (0, format_1.errorReply)(term ? `Kein Funk-Code zu „${(0, format_1.plain)(term)}“ gefunden.` : 'Es sind noch keine Funk-Codes hinterlegt.');
                const exact = term ? rows.find((r) => r.code.toLowerCase() === term.toLowerCase()) : undefined;
                if (exact)
                    return { ephemeral: true, embeds: [{ title: `📡 ${(0, format_1.plain)(exact.code)}`, description: `**${(0, format_1.plain)(exact.meaning)}**${exact.description ? `\n${(0, format_1.plain)(exact.description)}` : ''}`, color: 0x3b82f6, footer: exact.category ? (0, format_1.plain)(exact.category) : undefined }] };
                const lines = rows.slice(0, 40).map((r) => `\`${(0, format_1.plain)(r.code)}\` – ${(0, format_1.plain)(r.meaning)}`);
                return { ephemeral: true, embeds: [{ title: '📡 Funk-Codes', description: lines.join('\n').slice(0, 4000), color: 0x3b82f6, footer: rows.length > 40 ? `${rows.length - 40} weitere – Suche eingrenzen` : undefined }] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'teamchance', description: 'Zeigt, ob gerade eine Team-Chance (Bewerbungsphase fürs Team) offen ist',
        async run(c) {
            try {
                const s = await c.api.service('GET', `/bot/teamchance${c.guildId ? `?guildId=${c.guildId}` : ''}`);
                const when = (iso) => (iso ? `<t:${Math.floor(Date.parse(iso) / 1000)}:f>` : null);
                if (s.isOpen)
                    return { ephemeral: true, embeds: [{ title: `📣 ${(0, format_1.plain)(s.title)} – offen`, description: `${(0, format_1.plain)(s.description)}\n\nBewerben: über das Bewerbungs-Panel auf dem Server`.slice(0, 4000), color: 0x22c55e, fields: [...(s.closesAt ? [{ name: 'Bewerbungsschluss', value: when(s.closesAt), inline: true }] : []), ...(s.remaining !== null ? [{ name: 'Freie Plätze', value: String(s.remaining), inline: true }] : [])] }] };
                const why = s.reason === 'not_started' && s.opensAt ? `Startet ${when(s.opensAt)}.` : s.reason === 'full' ? 'Alle Plätze sind vergeben.' : 'Derzeit ist keine Team-Chance offen.';
                return { ephemeral: true, embeds: [{ title: `🔒 ${(0, format_1.plain)(s.title)}`, description: why, color: 0xef4444 }] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    ...['dashboard', 'panel'].map((name) => ({
        name, description: 'Link zum Web-Dashboard',
        async run(c) {
            try {
                const { url } = await c.api.service('GET', '/bot/dashboard-url');
                return { ephemeral: true, embeds: [{ title: '🖥️ EN Polizei – Dashboard', description: `Hier geht's zum Web-Dashboard:\n${url}`, color: format_1.COLORS.info }], buttons: [{ id: 'link', label: 'Dashboard öffnen', style: 'secondary', url }] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    })),
    {
        name: 'hilfe', description: 'Zeigt alle Befehle – mit „suche“ durchsucht er das Hilfe-Center',
        options: [{ name: 'suche', description: 'Hilfe-Center durchsuchen, z. B. „Dienst anmelden“', type: 'string', maxLength: 100 }],
        async run(c) {
            if (String(c.opts.suche ?? '').trim())
                return (0, extension4_1.helpSearch)(c);
            return { ephemeral: true, embeds: [{ title: 'EN Polizei — Befehle', color: format_1.COLORS.info, fields: [
                            { name: 'Konto', value: '`/dashboard` `/panel` `/benachrichtigungen`' },
                            { name: 'Abfragen', value: '`/team` `/personal akte` `/personal qualifikationen` `/organigramm` `/hilfe suche:` (Hilfe-Center)' },
                            { name: 'Dienst & Leitstelle', value: '`/shift manage` `/shift active` `/shift admin` `/shift leaderboard` `/dienst` `/dienststunden` `/abmeldung` `/leave manage` `/leave liste` `/funk` `/funkcode` `/funkantrag` `/funkstatus`' },
                            { name: 'Erfassen', value: '`/dienstbericht` `/dienstbericht liste`' },
                            { name: 'Dienstplanung & Verwaltung', value: '`/schichtplan anzeigen|meine|uebersicht|anmelden|abmelden|melden` `/termine liste|anmelden|absagen` `/antrag befoerderung|versetzung|status|antworten|zurueckziehen` `/dokument` `/benachrichtigungen dm:`' },
                            { name: 'Leitung & Team', value: '`/ausbildung` `/verwarnen` `/funkfreigabe` `/teamliste` `/dienstpanel` `/teamchance` `/roblox`' },
                            { name: 'Ausbildung & Prüfungen', value: '`/pruefung liste` `/pruefung ergebnisse` `/pruefung ausbildungen` · Ausbilder: `/pruefung verwalten` `/pruefung bewerten`' },
                            { name: 'Administration', value: '`/setup` (Einrichtung) `/system status` `/system diagnose` `/system integrations` `/backup status` `/backup erstellen` `/backup wiederherstellen` `/botprofil name|avatar|status`' },
                            { name: 'Support-Tickets', value: '`/support` öffnet ein Ticket (Team: `/support mitglied:@…` für jemand anderen). Team im Ticket-Kanal: `/ticket` (claim, unclaim, schliessen, anfrage, weiterleiten, hinzufuegen, entfernen, umbenennen, erinnern, notiz, automatik, oeffnen). Ticket-Panels, Kategorien, Fragen und Buttons werden im Dashboard eingerichtet und von dort in Discord gesendet.' },
                            { name: 'Für alle', value: 'Bewerbung über das Bewerbungs-Panel (auch ohne Verknüpfung; Fragen per Direktnachricht) · SEK/Flugstaffel/Ausbilder über das Qualifikations-Panel · `/remind-me` (Erinnerung, z. B. `in: 30m`) · `/erinnerungen`' },
                            { name: 'Hinweis', value: 'Alle Befehle laufen mit **deinen** Rechten im System. Antworten sind nur für dich sichtbar.' }
                        ] }] };
        },
    },
    {
        name: 'dienst', description: 'Setzt deinen Dienststatus',
        options: [{ name: 'status', description: 'Neuer Status', type: 'string', required: true, choices: choices(DUTY) }],
        async run(c) {
            const status = DUTY[str(c, 'status')];
            if (!status)
                return (0, format_1.errorReply)('Unbekannter Status.');
            if (status === 'ON_DUTY') {
                const pick = await (0, features_2.shiftPicker)(c);
                if (pick)
                    return pick;
            }
            try {
                await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status });
                return (0, format_1.okReply)(`Dienststatus: **${(0, format_1.label)(status)}**`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'dienststunden', description: 'Zeigt deine Dienststunden (oder mit „alle“ die des Teams)',
        options: [
            { name: 'tage', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 },
            { name: 'alle', description: 'Alle Beamten anzeigen (nur Schichtleitung)', type: 'boolean' },
        ],
        async run(c) {
            const days = Number(c.opts.tage ?? 7);
            const all = c.opts.alle === true;
            try {
                const r = await c.api.asUser(c.discordId, 'GET', `${all ? '/team/hours' : '/team/me/hours'}?days=${days}`);
                const period = days === 1 ? 'letzte 24 Stunden' : `letzte ${days} Tage`;
                if (all) {
                    const lines = r.users.slice(0, 25).map((u, i) => `${i + 1}. **${(0, format_1.plain)(u.callsign ?? u.name)}** ${u.callsign ? `(${(0, format_1.plain)(u.name)}) ` : ''}— ${hm(u.minutes)} · im Dienst ${hm(u.byStatus.ON_DUTY ?? 0)}`);
                    return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`⏱️ Dienststunden Team (${period})`, lines, 'Im Zeitraum war niemand im Dienst.')] };
                }
                const me = r.users[0];
                if (!me)
                    return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`⏱️ Deine Dienststunden (${period})`, [], 'Im Zeitraum warst du nicht im Dienst.')] };
                const lines = Object.entries(me.byStatus).sort((a, b) => b[1] - a[1]).map(([s, m]) => `• ${(0, format_1.label)(s)}: ${hm(m)}`);
                return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`⏱️ Deine Dienststunden (${period})`, [`**Gesamt: ${hm(me.minutes)}** in ${me.sessions} Abschnitt${me.sessions === 1 ? '' : 'en'}`, ...lines], '')] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'team', description: 'Zeigt, wer im Dienst ist',
        async run(c) {
            try {
                const rows = await c.api.asUser(c.discordId, 'GET', '/team/overview');
                const on = rows.filter((r) => r.dutyStatus !== 'OFF_DUTY');
                const lines = on.slice(0, 25).map((r) => `• **${(0, format_1.plain)(r.callsign ?? '—')}** ${(0, format_1.plain)(r.name)} — ${(0, format_1.label)(r.dutyStatus)}${r.unit ? ` · ${(0, format_1.plain)(r.unit.callsign)}` : ''}${r.currentIncident ? ` · 🚨 ${r.currentIncident.number}` : ''}`);
                return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`👮 Im Dienst (${on.length} von ${rows.length})`, lines, 'Aktuell ist niemand im Dienst.')] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'funk', description: 'Sendet eine Nachricht in einen Systemkanal',
        options: [
            { name: 'kanal', description: 'Kanal', type: 'string', required: true, choices: choices(CHANNEL) },
            { name: 'text', description: 'Nachricht', type: 'string', required: true, maxLength: 1500 },
        ],
        async run(c) {
            const ch = CHANNEL[str(c, 'kanal')];
            if (!ch)
                return (0, format_1.errorReply)('Unbekannter Kanal.');
            try {
                await c.api.asUser(c.discordId, 'POST', `/communication/channels/${ch}/messages`, { body: str(c, 'text') });
                return (0, format_1.okReply)(`Nachricht an **${ch}** gesendet.`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'benachrichtigungen', description: 'Zeigt deine ungelesenen Benachrichtigungen (optional: Discord-DMs an/aus)',
        options: [{ name: 'dm', description: 'Benachrichtigungen zusätzlich per Direktnachricht erhalten?', type: 'boolean' }],
        async run(c) {
            try {
                if (typeof c.opts.dm === 'boolean') {
                    const cur = await c.api.asUser(c.discordId, 'GET', '/notifications/preferences');
                    await c.api.asUser(c.discordId, 'PUT', '/notifications/preferences', { muted: cur.muted ?? [], important: cur.important ?? [], dmEvents: cur.dmEvents ?? [], reminders: cur.reminders !== false, dm: c.opts.dm });
                    return (0, format_1.okReply)(c.opts.dm ? '🔔 Du bekommst Benachrichtigungen jetzt auch per DM (Schichten, Termine, Anträge …). Feineinstellung im Dashboard unter Persönlich.' : '🔕 Keine Benachrichtigungen mehr per DM. Im Dashboard bleiben sie sichtbar.');
                }
                const r = await c.api.asUser(c.discordId, 'GET', '/notifications?filter=unread&pageSize=10');
                return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`🔔 Ungelesen (${r.unread})`, r.items.map((n) => `• ${(0, format_1.plain)(n.title)}`), 'Keine ungelesenen Benachrichtigungen.')] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    ...features_1.FEATURE_COMMANDS,
    ...leave_1.LEAVE_COMMANDS,
    ...duty_reports_1.DUTY_REPORT_COMMANDS,
    ...warnings_1.WARNING_COMMANDS,
    ...radio_whitelist_1.RADIO_WHITELIST_COMMANDS,
    ...trainings_1.TRAINING_COMMANDS,
    ...shifts_1.SHIFT_COMMANDS,
    tickets_1.TICKET_COMMAND, tickets_1.TICKET_ADMIN_COMMAND,
    ...setup_1.SETUP_COMMANDS,
    ...system_1.SYSTEM_COMMANDS,
    ...backup_1.BACKUP_COMMANDS,
    ...exams_1.EXAM_COMMANDS,
    ...bot_profile_1.BOT_PROFILE_COMMANDS,
    ...reminders_1.REMINDER_COMMANDS,
    ...extension4_1.EXTENSION4_COMMANDS,
    ...administration_1.ADMINISTRATION_COMMANDS,
];
const byName = (n) => exports.COMMANDS.find((c) => c.name === n);
exports.byName = byName;
//# sourceMappingURL=index.js.map