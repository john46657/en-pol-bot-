"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.byName = exports.mapError = exports.COMMANDS = void 0;
const api_1 = require("../api");
const errors_1 = require("./errors");
Object.defineProperty(exports, "mapError", { enumerable: true, get: function () { return errors_1.mapError; } });
const features_1 = require("./features");
const qualifications_1 = require("./qualifications");
const leave_1 = require("./leave");
const cad_1 = require("./cad");
const features_2 = require("./features");
const tickets_1 = require("./tickets");
const duty_reports_1 = require("./duty-reports");
const warnings_1 = require("./warnings");
const trainings_1 = require("./trainings");
const format_1 = require("../format");
/** Minuten → „3 h 05 min“. */
const hm = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const q = (s) => encodeURIComponent(s.trim());
const str = (c, k) => String(c.opts[k] ?? '').trim();
/** Findet genau eine Person per Roblox-Name (exakt, ohne Groß-/Kleinschreibung) oder Roblox-ID. */
async function resolvePerson(c, term, opts = {}) {
    const page = await c.api.asUser(c.discordId, 'GET', `/persons?q=${q(term)}&pageSize=10`);
    const exact = page.items.filter((p) => String(p.robloxUsername).toLowerCase() === term.toLowerCase() || p.robloxUserId === term);
    if (exact.length === 1)
        return { person: exact[0] };
    if (exact.length === 0 && page.items.length === 0) {
        // Unbekannte Person: bei Bedarf nach Roblox-Prüfung selbst anlegen (nur mit dem Recht dazu; Tippfehler fängt Roblox ab)
        if (opts.create && c.robloxLookup) {
            const u = await c.robloxLookup(term);
            if (!u)
                return { reply: (0, format_1.errorReply)(`Keine Person zu „${(0, format_1.plain)(term)}“ gefunden – und bei Roblox gibt es keinen Benutzer mit diesem Namen (oder Roblox ist gerade nicht erreichbar).`) };
            try {
                const created = await c.api.asUser(c.discordId, 'POST', '/persons', { robloxUsername: u.name, robloxUserId: String(u.id) });
                return { person: created, created: true };
            }
            catch (e) {
                if (e instanceof api_1.BotApiError && e.status === 403)
                    return { reply: (0, format_1.errorReply)(`„${(0, format_1.plain)(u.name)}“ ist noch nicht im System, und dir fehlt das Recht, Personen anzulegen. Bitte lass die Person von jemandem mit Berechtigung anlegen.`) };
                throw e;
            }
        }
        return { reply: (0, format_1.errorReply)(`Keine Person zu „${(0, format_1.plain)(term)}“ gefunden.`) };
    }
    const names = (exact.length ? exact : page.items).slice(0, 8).map((p) => `${(0, format_1.plain)(p.robloxUsername)} (${p.robloxUserId ?? 'ohne ID'})`).join(', ');
    return { reply: (0, format_1.errorReply)(`Nicht eindeutig. Treffer: ${names}. Bitte exakten Namen oder die Roblox-ID angeben.`) };
}
const DUTY = { an: 'ON_DUTY', pause: 'BREAK', aus: 'OFF_DUTY' };
const UNIT = { verfuegbar: 'AVAILABLE', beschaeftigt: 'BUSY', unterwegs: 'EN_ROUTE', vor_ort: 'ON_SCENE', nicht_verfuegbar: 'UNAVAILABLE', ausser_dienst: 'OFF_DUTY' };
const PRIO = { niedrig: 'LOW', mittel: 'MEDIUM', hoch: 'HIGH', dringend: 'URGENT', kritisch: 'CRITICAL' };
const choices = (m) => Object.keys(m).map((k) => ({ name: k.replace('_', ' '), value: k }));
const INC_STATUS = { bestaetigt: 'ACKNOWLEDGED', unterwegs: 'EN_ROUTE', vor_ort: 'ON_SCENE', in_bearbeitung: 'PROCESSING', abschluss: 'CLEARING', abgebrochen: 'CANCELLED', geschlossen: 'CLOSED' };
const REPORT = { patrouille: 'PATROL', vorfall: 'INCIDENT', verkehr: 'TRAFFIC', festnahme: 'ARREST', zitation: 'CITATION', kollision: 'COLLISION', ermittlung: 'INVESTIGATION', allgemein: 'GENERAL' };
const CHANNEL = { team: 'TEAM', dispatch: 'DISPATCH' };
/** Findet genau einen Einsatz per Einsatznummer (exakt, ohne Groß-/Kleinschreibung). */
async function resolveIncident(c, number) {
    const page = await c.api.asUser(c.discordId, 'GET', `/incidents?q=${q(number)}&pageSize=10`);
    const hit = page.items.find((i) => String(i.number).toLowerCase() === number.toLowerCase()) ?? (page.items.length === 1 ? page.items[0] : undefined);
    return hit ? { incident: hit } : { reply: (0, format_1.errorReply)(page.items.length ? 'Nicht eindeutig – bitte die vollständige Einsatznummer angeben (z. B. I-2026-ABC123).' : `Einsatz „${(0, format_1.plain)(number)}“ nicht gefunden.`) };
}
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
                    return { ephemeral: true, embeds: [{ title: `📣 ${(0, format_1.plain)(s.title)} – offen`, description: `${(0, format_1.plain)(s.description)}\n\nBewerben: \`/bewerbung\``.slice(0, 4000), color: 0x22c55e, fields: [...(s.closesAt ? [{ name: 'Bewerbungsschluss', value: when(s.closesAt), inline: true }] : []), ...(s.remaining !== null ? [{ name: 'Freie Plätze', value: String(s.remaining), inline: true }] : [])] }] };
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
        name: 'hilfe', description: 'Zeigt alle Befehle',
        async run() {
            return { ephemeral: true, embeds: [{ title: 'EN Polizei — Befehle', color: format_1.COLORS.info, fields: [
                            { name: 'Konto', value: '`/dashboard` `/panel` `/entverknuepfen` `/profil` `/benachrichtigungen`' },
                            { name: 'Abfragen', value: '`/person` `/kennzeichen` `/fahndungen` `/einsaetze` `/einsatzinfo` `/einheiten` `/team`' },
                            { name: 'Dienst & Leitstelle', value: '`/dienst` `/dienststunden` `/abmeldung` `/leave manage` `/einheitstatus` `/einsatz` `/einsatzstatus` `/einsatzzuweisen` `/funk` `/funkcode` `/cad`' },
                            { name: 'Erfassen', value: '`/ticket` `/bericht` `/dienstbericht` `/beschwerde` `/ermittlung` `/fahndung` `/beweis`' },
                            { name: 'Leitung & Team', value: '`/ausbildung` `/verwarnen` `/gefahrenstatus` `/funkfreigabe` `/teamliste` `/dienstpanel` `/bewerbungspanel` `/qualipanel` `/teamchance` `/roblox`' },
                            { name: 'Support-Tickets', value: '`/support` öffnet ein Ticket (Team: `/support mitglied:@…` für jemand anderen). Ticket-Panels, Kategorien, Fragen und Buttons werden im Dashboard eingerichtet und von dort in Discord gesendet.' },
                            { name: 'Für alle', value: '`/bewerbung` (auch ohne Verknüpfung; Fragen per Direktnachricht) · SEK/Flugstaffel/Ausbilder über das Qualifikations-Panel' },
                            { name: 'Hinweis', value: 'Alle Befehle laufen mit **deinen** Rechten im System. Antworten sind nur für dich sichtbar.' }
                        ] }] };
        },
    },
    {
        name: 'person', description: 'Sucht eine Person (Roblox-Name oder -ID)',
        options: [{ name: 'suche', description: 'Name oder Roblox-ID', type: 'string', required: true, maxLength: 64 }],
        async run(c) {
            try {
                const page = await c.api.asUser(c.discordId, 'GET', `/persons?q=${q(str(c, 'suche'))}&pageSize=5`);
                if (!page.items.length)
                    return (0, format_1.errorReply)('Keine Person gefunden.');
                if (page.items.length > 1 && !page.items.some((p) => String(p.robloxUsername).toLowerCase() === str(c, 'suche').toLowerCase())) {
                    return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`👥 ${page.total} Treffer`, page.items.map((p) => `• **${(0, format_1.plain)(p.robloxUsername)}** (${p.robloxUserId ?? 'ohne ID'})`), '')] };
                }
                const hit = page.items.find((p) => String(p.robloxUsername).toLowerCase() === str(c, 'suche').toLowerCase()) ?? page.items[0];
                const ov = await c.api.asUser(c.discordId, 'GET', `/persons/${hit.id}`);
                const wanted = ov.links.some((l) => l.entityType === 'Wanted');
                return { ephemeral: true, embeds: [(0, format_1.personEmbed)(ov.person, { tickets: ov.tickets.length, wanted })] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'kennzeichen', description: 'Sucht ein Fahrzeug nach Kennzeichen',
        options: [{ name: 'kennzeichen', description: 'z. B. LC 1001', type: 'string', required: true, maxLength: 16 }],
        async run(c) {
            try {
                const page = await c.api.asUser(c.discordId, 'GET', `/vehicles?q=${q(str(c, 'kennzeichen'))}&pageSize=5`);
                return page.items.length ? { ephemeral: true, embeds: page.items.map(format_1.vehicleEmbed) } : (0, format_1.errorReply)('Kein Fahrzeug gefunden.');
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'fahndungen', description: 'Zeigt aktive Fahndungen',
        async run(c) {
            try {
                const page = await c.api.asUser(c.discordId, 'GET', '/wanted?pageSize=10');
                return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`🔴 Aktive Fahndungen (${page.total})`, page.items.map((w) => `• **${(0, format_1.plain)(w.reason)}** — ${(0, format_1.label)(w.priority)}${w.personId ? '' : ' (Fahrzeug)'}`), 'Keine aktiven Fahndungen.')] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
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
        name: 'einheiten', description: 'Zeigt alle Einheiten und ihren Status',
        async run(c) {
            try {
                const units = await c.api.asUser(c.discordId, 'GET', '/dispatch/units');
                return { ephemeral: true, embeds: [(0, format_1.listEmbed)('📻 Einheiten', units.map((u) => `• **${(0, format_1.plain)(u.callsign)}** — ${(0, format_1.label)(u.status)}`), 'Keine Einheiten angelegt.')] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'einheitstatus', description: 'Ändert den Status einer Einheit',
        options: [
            { name: 'rufzeichen', description: 'z. B. ADAM-1', type: 'string', required: true, maxLength: 16 },
            { name: 'status', description: 'Neuer Status', type: 'string', required: true, choices: choices(UNIT) },
        ],
        async run(c) {
            const status = UNIT[str(c, 'status')];
            if (!status)
                return (0, format_1.errorReply)('Unbekannter Status.');
            try {
                const units = await c.api.asUser(c.discordId, 'GET', '/dispatch/units');
                const unit = units.find((u) => String(u.callsign).toLowerCase() === str(c, 'rufzeichen').toLowerCase());
                if (!unit)
                    return (0, format_1.errorReply)('Einheit nicht gefunden.');
                await c.api.asUser(c.discordId, 'PUT', `/dispatch/units/${unit.id}/status`, { status });
                return (0, format_1.okReply)(`**${(0, format_1.plain)(unit.callsign)}** → ${(0, format_1.label)(status)}`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'einsaetze', description: 'Zeigt offene Einsätze',
        async run(c) {
            try {
                const page = await c.api.asUser(c.discordId, 'GET', '/incidents?active=true&pageSize=10');
                return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`🚨 Offene Einsätze (${page.total})`, page.items.map(format_1.incidentLine), 'Keine offenen Einsätze.')] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'einsatz', description: 'Legt einen neuen Einsatz an',
        options: [
            { name: 'titel', description: 'Kurzbeschreibung', type: 'string', required: true, maxLength: 200 },
            { name: 'prioritaet', description: 'Priorität (Standard: mittel)', type: 'string', choices: choices(PRIO) },
            { name: 'ort', description: 'Einsatzort', type: 'string', maxLength: 200 },
        ],
        async run(c) {
            const title = str(c, 'titel');
            if (title.length < 3)
                return (0, format_1.errorReply)('Der Titel ist zu kurz (mindestens 3 Zeichen).');
            try {
                const prio = PRIO[str(c, 'prioritaet')] ?? 'MEDIUM';
                const inc = await c.api.asUser(c.discordId, 'POST', '/incidents', { title, priority: prio, location: str(c, 'ort') || undefined });
                return (0, format_1.okReply)(`Einsatz **${inc.number}** angelegt (${(0, format_1.label)(prio)}).`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'ticket', description: 'Stellt ein Ticket aus',
        options: [
            { name: 'person', description: 'Roblox-Name oder -ID', type: 'string', required: true, maxLength: 64 },
            { name: 'grund', description: 'Grund', type: 'string', required: true, maxLength: 500 },
            { name: 'betrag', description: 'Betrag', type: 'number', min: 0, max: 1_000_000 },
        ],
        async run(c) {
            const reason = str(c, 'grund');
            if (reason.length < 3)
                return (0, format_1.errorReply)('Der Grund ist zu kurz (mindestens 3 Zeichen).');
            try {
                const { person, reply, created } = await resolvePerson(c, str(c, 'person'), { create: true });
                if (!person)
                    return reply;
                const amount = typeof c.opts.betrag === 'number' ? c.opts.betrag : undefined;
                const t = await c.api.asUser(c.discordId, 'POST', '/tickets', { personId: person.id, reason, ...(amount !== undefined ? { amount } : {}) });
                return (0, format_1.okReply)(`Ticket **${t.number}** für **${(0, format_1.plain)(person.robloxUsername)}** ausgestellt.${created ? ' Die Person war noch nicht im System und wurde nach Roblox-Prüfung neu angelegt.' : ''}`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'profil', description: 'Zeigt dein verknüpftes Konto und deine Rollen',
        async run(c) {
            try {
                const me = await c.api.asUser(c.discordId, 'GET', '/auth/me');
                return { ephemeral: true, embeds: [{ title: `🪪 ${(0, format_1.plain)(me.displayName)}`, color: format_1.COLORS.info, fields: [
                                { name: 'Benutzer', value: `@${(0, format_1.plain)(me.username)}`, inline: true }, { name: 'Roblox-ID', value: String(me.robloxUserId ?? 'nicht hinterlegt'), inline: true },
                                { name: 'Rollen', value: (0, format_1.clip)(me.roles.map(format_1.plain).join(', ') || 'keine', 1024) }, { name: 'Berechtigungen', value: `${me.permissions.length} aktiv`, inline: true }
                            ] }] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'entverknuepfen', description: 'Löst die Verknüpfung deines Discord-Kontos',
        async run(c) {
            try {
                await c.api.asUser(c.discordId, 'DELETE', '/discord/link');
                return (0, format_1.okReply)('Verknüpfung gelöst. Im Dashboard (Chat-Symbol oben rechts) kannst du sie jederzeit neu herstellen.');
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
        name: 'einsatzinfo', description: 'Zeigt Details zu einem Einsatz',
        options: [{ name: 'nummer', description: 'Einsatznummer, z. B. I-2026-ABC123', type: 'string', required: true, maxLength: 32 }],
        async run(c) {
            try {
                const { incident, reply } = await resolveIncident(c, str(c, 'nummer'));
                if (!incident)
                    return reply;
                const d = await c.api.asUser(c.discordId, 'GET', `/incidents/${incident.id}`);
                const i = d.incident;
                const units = (i.units ?? []).filter((u) => !u.clearedAt).map((u) => (0, format_1.plain)(u.unit.callsign)).join(', ') || 'keine';
                return { ephemeral: true, embeds: [{ title: (0, format_1.clip)(`🚨 ${i.number} — ${(0, format_1.plain)(i.title)}`, 256), color: format_1.COLORS.info, description: i.description ? (0, format_1.clip)((0, format_1.plain)(i.description), 1500) : undefined, fields: [
                                { name: 'Priorität', value: (0, format_1.label)(i.priority), inline: true }, { name: 'Status', value: (0, format_1.label)(i.status), inline: true }, { name: 'Ort', value: (0, format_1.clip)((0, format_1.plain)(i.location), 1024), inline: true },
                                { name: 'Einheiten', value: (0, format_1.clip)(units, 1024) }, { name: 'Verlauf', value: (0, format_1.clip)(d.timeline.slice(0, 5).map((t) => `• ${(0, format_1.plain)(t.summary)}`).join('\n') || '—', 1024) }
                            ] }] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'einsatzstatus', description: 'Ändert den Status eines Einsatzes',
        options: [
            { name: 'nummer', description: 'Einsatznummer', type: 'string', required: true, maxLength: 32 },
            { name: 'status', description: 'Neuer Status', type: 'string', required: true, choices: choices(INC_STATUS) },
        ],
        async run(c) {
            const status = INC_STATUS[str(c, 'status')];
            if (!status)
                return (0, format_1.errorReply)('Unbekannter Status.');
            try {
                const { incident, reply } = await resolveIncident(c, str(c, 'nummer'));
                if (!incident)
                    return reply;
                // Schließen läuft über den eigenen Endpunkt (Recht dispatch.close), alles andere über den Status-Endpunkt (dispatch.edit)
                if (status === 'CLOSED')
                    await c.api.asUser(c.discordId, 'POST', `/dispatch/incidents/${incident.id}/close`);
                else
                    await c.api.asUser(c.discordId, 'PUT', `/dispatch/incidents/${incident.id}/status`, { status });
                return (0, format_1.okReply)(`**${incident.number}** → ${(0, format_1.label)(status)}`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'einsatzzuweisen', description: 'Weist eine Einheit einem Einsatz zu',
        options: [
            { name: 'nummer', description: 'Einsatznummer', type: 'string', required: true, maxLength: 32 },
            { name: 'rufzeichen', description: 'z. B. ADAM-1', type: 'string', required: true, maxLength: 16 },
        ],
        async run(c) {
            try {
                const { incident, reply } = await resolveIncident(c, str(c, 'nummer'));
                if (!incident)
                    return reply;
                const units = await c.api.asUser(c.discordId, 'GET', '/dispatch/units');
                const unit = units.find((u) => String(u.callsign).toLowerCase() === str(c, 'rufzeichen').toLowerCase());
                if (!unit)
                    return (0, format_1.errorReply)('Einheit nicht gefunden.');
                await c.api.asUser(c.discordId, 'POST', `/dispatch/incidents/${incident.id}/assign`, { unitId: unit.id });
                return (0, format_1.okReply)(`**${(0, format_1.plain)(unit.callsign)}** wurde **${incident.number}** zugewiesen.`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'bericht', description: 'Schreibt einen Polizeibericht (Entwurf oder direkt einreichen)',
        options: [
            { name: 'titel', description: 'Titel', type: 'string', required: true, maxLength: 200 },
            { name: 'text', description: 'Berichtstext', type: 'string', required: true, maxLength: 4000 },
            { name: 'typ', description: 'Berichtstyp (Standard: allgemein)', type: 'string', choices: choices(REPORT) },
            { name: 'einreichen', description: 'Direkt zur Prüfung einreichen', type: 'boolean' },
        ],
        async run(c) {
            if (str(c, 'titel').length < 3)
                return (0, format_1.errorReply)('Der Titel ist zu kurz (mindestens 3 Zeichen).');
            try {
                const type = REPORT[str(c, 'typ')] ?? 'GENERAL';
                const r = await c.api.asUser(c.discordId, 'POST', '/reports', { type, title: str(c, 'titel'), content: { body: str(c, 'text') } });
                if (c.opts.einreichen === true) {
                    await c.api.asUser(c.discordId, 'POST', `/reports/${r.id}/submit`);
                    return (0, format_1.okReply)(`Bericht **${r.number}** angelegt und **eingereicht**.`);
                }
                return (0, format_1.okReply)(`Bericht **${r.number}** als **Entwurf** gespeichert (im Web bearbeiten/einreichen).`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'beschwerde', description: 'Erfasst eine Beschwerde',
        options: [
            { name: 'kategorie', description: 'z. B. Verhalten', type: 'string', required: true, maxLength: 64 },
            { name: 'beschreibung', description: 'Was ist passiert? (mind. 10 Zeichen)', type: 'string', required: true, maxLength: 4000 },
            { name: 'person', description: 'Betroffene Person (Roblox-Name oder -ID)', type: 'string', maxLength: 64 },
        ],
        async run(c) {
            if (str(c, 'kategorie').length < 2)
                return (0, format_1.errorReply)('Die Kategorie ist zu kurz.');
            if (str(c, 'beschreibung').length < 10)
                return (0, format_1.errorReply)('Die Beschreibung ist zu kurz (mindestens 10 Zeichen).');
            try {
                let subjectId;
                if (str(c, 'person')) {
                    const r = await resolvePerson(c, str(c, 'person'));
                    if (!r.person)
                        return r.reply;
                    subjectId = r.person.id;
                }
                const res = await c.api.asUser(c.discordId, 'POST', '/complaints', { category: str(c, 'kategorie'), description: str(c, 'beschreibung'), ...(subjectId ? { subjectId } : {}) });
                return (0, format_1.okReply)(`Beschwerde **${res.number}** erfasst.`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'ermittlung', description: 'Eröffnet einen Ermittlungsfall',
        options: [
            { name: 'titel', description: 'Titel des Falls', type: 'string', required: true, maxLength: 200 },
            { name: 'beschreibung', description: 'Beschreibung', type: 'string', maxLength: 4000 },
        ],
        async run(c) {
            if (str(c, 'titel').length < 3)
                return (0, format_1.errorReply)('Der Titel ist zu kurz (mindestens 3 Zeichen).');
            try {
                const r = await c.api.asUser(c.discordId, 'POST', '/investigations', { title: str(c, 'titel'), ...(str(c, 'beschreibung') ? { description: str(c, 'beschreibung') } : {}) });
                return (0, format_1.okReply)(`Fall **${r.caseNumber}** eröffnet.`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'fahndung', description: 'Schreibt eine Person zur Fahndung aus',
        options: [
            { name: 'person', description: 'Roblox-Name oder -ID', type: 'string', required: true, maxLength: 64 },
            { name: 'grund', description: 'Fahndungsgrund', type: 'string', required: true, maxLength: 500 },
            { name: 'prioritaet', description: 'Priorität (Standard: mittel)', type: 'string', choices: choices(PRIO) },
        ],
        async run(c) {
            if (str(c, 'grund').length < 3)
                return (0, format_1.errorReply)('Der Grund ist zu kurz (mindestens 3 Zeichen).');
            try {
                const { person, reply } = await resolvePerson(c, str(c, 'person'));
                if (!person)
                    return reply;
                const priority = PRIO[str(c, 'prioritaet')] ?? 'MEDIUM';
                await c.api.asUser(c.discordId, 'POST', '/wanted', { personId: person.id, reason: str(c, 'grund'), priority });
                return (0, format_1.okReply)(`**${(0, format_1.plain)(person.robloxUsername)}** ist zur Fahndung ausgeschrieben (${(0, format_1.label)(priority)}).`);
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    {
        name: 'beweis', description: 'Erfasst ein Beweisstück',
        options: [
            { name: 'typ', description: 'z. B. Waffe, Foto', type: 'string', required: true, maxLength: 64 },
            { name: 'beschreibung', description: 'Beschreibung', type: 'string', required: true, maxLength: 2000 },
            { name: 'fall', description: 'Fallnummer, z. B. CASE-2026-ABC123', type: 'string', maxLength: 40 },
        ],
        async run(c) {
            if (str(c, 'typ').length < 2 || str(c, 'beschreibung').length < 3)
                return (0, format_1.errorReply)('Typ oder Beschreibung sind zu kurz.');
            try {
                const e = await c.api.asUser(c.discordId, 'POST', '/evidence', { type: str(c, 'typ'), description: str(c, 'beschreibung'), ...(str(c, 'fall') ? { caseRef: str(c, 'fall').toUpperCase() } : {}) });
                return (0, format_1.okReply)(`Beweis **${e.number}** erfasst.`);
            }
            catch (err) {
                return (0, errors_1.mapError)(err);
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
        name: 'benachrichtigungen', description: 'Zeigt deine ungelesenen Benachrichtigungen',
        async run(c) {
            try {
                const r = await c.api.asUser(c.discordId, 'GET', '/notifications?filter=unread&pageSize=10');
                return { ephemeral: true, embeds: [(0, format_1.listEmbed)(`🔔 Ungelesen (${r.unread})`, r.items.map((n) => `• ${(0, format_1.plain)(n.title)}`), 'Keine ungelesenen Benachrichtigungen.')] };
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    },
    ...features_1.FEATURE_COMMANDS,
    ...qualifications_1.QUALI_COMMANDS,
    ...leave_1.LEAVE_COMMANDS,
    ...cad_1.CAD_COMMANDS,
    ...duty_reports_1.DUTY_REPORT_COMMANDS,
    ...warnings_1.WARNING_COMMANDS,
    ...trainings_1.TRAINING_COMMANDS,
    tickets_1.TICKET_COMMAND,
];
const byName = (n) => exports.COMMANDS.find((c) => c.name === n);
exports.byName = byName;
//# sourceMappingURL=index.js.map