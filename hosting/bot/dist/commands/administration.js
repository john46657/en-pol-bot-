"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMINISTRATION_COMMANDS = exports.DOCUMENT_COMMAND = exports.MEETING_INTERACTION = exports.CALENDAR_INTERACTION = exports.EVENTS_COMMAND = exports.REQUEST_COMMAND = exports.SHIFTPLAN_INTERACTION = exports.SHIFTPLAN_COMMAND = void 0;
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
/**
 * Verwaltung 3.0 im Bot: Schichtplan, Anträge, Termine/Besprechungen, Dokumente, Benachrichtigungen.
 * Alles läuft mit den Rechten des verknüpften Benutzers über die API (Allowlist); Antworten sind nur für den Aufrufer sichtbar.
 * Bewusst keine neuen öffentlichen Befehle für Planung/Verwaltung – das bleibt im Dashboard.
 */
const ts = (iso, style = 'f') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
const span = (a, b) => `${ts(a, 'f')} – ${ts(b, 't')}`;
const str = (c, k) => String(c.opts[k] ?? '').trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const covText = (s) => `${s.coverage.state === 'UNDER' ? '🔴' : s.coverage.state === 'FULL' ? '🟢' : '🟡'} ${s.coverage.assigned}/${s.coverage.max ?? `${s.coverage.min}+`}`;
const shiftLine = (s) => `**${(0, format_1.plain)(s.name)}** ${s.mine ? '· ✅ du' : ''}\n${span(s.startsAt, s.endsAt)} · ${covText(s)}${s.department ? ` · ${(0, format_1.plain)(s.department)}` : ''}${s.leaderName ? ` · Leitung: ${(0, format_1.plain)(s.leaderName)}` : ''}${s.status === 'CANCELLED' ? ' · ❌ abgesagt' : ''}`;
async function shifts(c, days, mine = false) {
    const from = new Date(), to = new Date(Date.now() + days * 86_400_000);
    const r = await c.api.asUser(c.discordId, 'GET', `/shiftplan?from=${from.toISOString()}&to=${to.toISOString()}${mine ? '&mine=true' : ''}`);
    return r.items.filter((s) => new Date(s.endsAt).getTime() > Date.now());
}
function planReply(items, title, empty) {
    if (!items.length)
        return { ephemeral: true, embeds: [{ title, description: empty, color: format_1.COLORS.neutral }] };
    const open = items.filter((s) => s.status === 'PUBLISHED' && !s.mine && s.coverage.state !== 'FULL' && new Date(s.startsAt).getTime() > Date.now());
    const mine = items.filter((s) => s.mine && new Date(s.startsAt).getTime() > Date.now());
    const embed = { title, description: (0, format_1.clip)(items.slice(0, 15).map(shiftLine).join('\n\n'), 4000), color: format_1.COLORS.info, footer: items.length > 15 ? `${items.length - 15} weitere im Dashboard` : 'Zeiten in deiner Ortszeit' };
    const selects = [
        ...(open.length ? [{ id: 'splan:signup', placeholder: 'Für eine Schicht anmelden …', options: open.slice(0, 25).map((s) => ({ label: (0, format_1.clip)(s.name, 90), value: s.id, description: (0, format_1.clip)(new Date(s.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 90) })) }] : []),
        ...(mine.length ? [{ id: 'splan:withdraw', placeholder: 'Von einer Schicht abmelden …', options: mine.slice(0, 25).map((s) => ({ label: (0, format_1.clip)(s.name, 90), value: s.id, description: (0, format_1.clip)(new Date(s.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 90) })) }] : []),
    ];
    return { ephemeral: true, embeds: [embed], ...(selects.length ? { selects } : {}) };
}
async function signup(c, id) {
    if (!uuid.test(id))
        return (0, format_1.errorReply)('Bitte eine Schicht aus der Liste wählen.');
    try {
        const s = await c.api.asUser(c.discordId, 'POST', `/shiftplan/${id}/signup`);
        return (0, format_1.okReply)(`✅ Du bist für **${(0, format_1.plain)(s.name)}** angemeldet (${span(s.startsAt, s.endsAt)}).`);
    }
    catch (e) {
        if (e instanceof api_1.BotApiError && e.status === 409)
            return (0, format_1.errorReply)(e.message);
        return (0, errors_1.mapError)(e);
    }
}
async function withdraw(c, id, reason) {
    if (!uuid.test(id))
        return (0, format_1.errorReply)('Bitte eine Schicht aus der Liste wählen.');
    try {
        const s = await c.api.asUser(c.discordId, 'POST', `/shiftplan/${id}/withdraw`, reason ? { reason } : {});
        return (0, format_1.okReply)(`Du bist von **${(0, format_1.plain)(s.name)}** abgemeldet. Die Schichtleitung wurde informiert.`);
    }
    catch (e) {
        if (e instanceof api_1.BotApiError && e.status === 409)
            return (0, format_1.errorReply)(e.message);
        return (0, errors_1.mapError)(e);
    }
}
const shiftOption = { name: 'schicht', description: 'Schicht (Vorschläge beim Tippen)', type: 'string', required: true, autocomplete: true, maxLength: 64 };
exports.SHIFTPLAN_COMMAND = {
    name: 'schichtplan', description: 'Schichtplan: ansehen, anmelden, abmelden, eigene Schichten, Änderungen melden',
    subcommands: [
        { name: 'anzeigen', description: 'Geplante Schichten der nächsten Tage', options: [{ name: 'tage', description: 'Zeitraum in Tagen (Standard 7)', type: 'integer', min: 1, max: 31 }] },
        { name: 'meine', description: 'Deine eingeteilten Schichten' },
        { name: 'uebersicht', description: 'Besetzung heute (geplant vs. im Dienst)' },
        { name: 'anmelden', description: 'Für eine Schicht anmelden', options: [shiftOption] },
        { name: 'abmelden', description: 'Von einer Schicht abmelden', options: [shiftOption, { name: 'grund', description: 'Grund (optional, nur für die Schichtleitung)', type: 'string', maxLength: 300 }] },
        { name: 'melden', description: 'Änderung zu deiner Schicht melden (z. B. später da)', options: [shiftOption, { name: 'nachricht', description: 'Was ist los?', type: 'string', required: true, maxLength: 500 }] },
    ],
    async complete(c, option, value) {
        if (option !== 'schicht')
            return [];
        try {
            const sub = String(c.opts._sub ?? '');
            const items = await shifts(c, 31, sub !== 'anmelden');
            const v = value.toLowerCase();
            return items.filter((s) => (sub === 'anmelden' ? s.status === 'PUBLISHED' && !s.mine : s.mine) && s.name.toLowerCase().includes(v)).slice(0, 25)
                .map((s) => ({ name: (0, format_1.clip)(`${s.name} · ${new Date(s.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, 100), value: s.id }));
        }
        catch {
            return [];
        }
    },
    async run(c) {
        const sub = String(c.opts._sub ?? 'anzeigen');
        try {
            if (sub === 'anzeigen') {
                const days = Number(c.opts.tage ?? 7);
                return planReply(await shifts(c, days), `🗓️ Schichtplan – nächste ${days} Tage`, 'Keine geplanten Schichten in diesem Zeitraum.');
            }
            if (sub === 'meine') {
                const items = await c.api.asUser(c.discordId, 'GET', '/shiftplan/mine');
                return planReply(items, '🗓️ Deine Schichten', 'Du bist für keine kommende Schicht eingeteilt.');
            }
            if (sub === 'uebersicht') {
                const today = await shifts(c, 1);
                if (!today.length)
                    return { ephemeral: true, embeds: [{ title: '📋 Schichtübersicht heute', description: 'Heute sind keine Schichten geplant.', color: format_1.COLORS.neutral }] };
                return { ephemeral: true, embeds: [{ title: '📋 Schichtübersicht heute', color: format_1.COLORS.info, fields: today.slice(0, 20).map((s) => ({ name: (0, format_1.clip)(`${s.name} (${covText(s)})`, 256), value: (0, format_1.clip)(`${span(s.startsAt, s.endsAt)}\n${s.assignees.map((a) => (0, format_1.plain)(a.name)).join(', ') || '— noch niemand eingeteilt —'}`, 1024) })) }] };
            }
            if (sub === 'anmelden')
                return signup(c, str(c, 'schicht'));
            if (sub === 'abmelden')
                return withdraw(c, str(c, 'schicht'), str(c, 'grund') || undefined);
            if (sub === 'melden') {
                const id = str(c, 'schicht');
                if (!uuid.test(id))
                    return (0, format_1.errorReply)('Bitte eine Schicht aus der Liste wählen.');
                const r = await c.api.asUser(c.discordId, 'POST', `/shiftplan/${id}/report`, { message: str(c, 'nachricht') });
                return (0, format_1.okReply)(r.delivered ? 'Deine Meldung ist bei der Schichtleitung angekommen.' : 'Gemeldet und protokolliert (keine Schichtleitung hinterlegt).');
            }
            return (0, format_1.errorReply)('Unbekannter Unterbefehl.');
        }
        catch (e) {
            if (e instanceof api_1.BotApiError && e.status === 409)
                return (0, format_1.errorReply)(e.message);
            return (0, errors_1.mapError)(e);
        }
    },
};
exports.SHIFTPLAN_INTERACTION = {
    prefix: 'splan',
    async run(c) {
        const id = c.values?.[0] ?? c.args[1] ?? '';
        if (c.args[0] === 'signup')
            return signup(c, id);
        if (c.args[0] === 'withdraw')
            return withdraw(c, id);
        return (0, format_1.errorReply)('Unbekannte Aktion.');
    },
};
const KIND = { befoerderung: 'PROMOTION', versetzung: 'TRANSFER' };
async function requestTargets(c) { return c.api.asUser(c.discordId, 'GET', '/hr/requests/targets'); }
async function myRequests(c) { return c.api.asUser(c.discordId, 'GET', '/hr/requests/mine'); }
exports.REQUEST_COMMAND = {
    name: 'antrag', description: 'Beförderung oder Versetzung beantragen, Status abrufen, Rückfragen beantworten',
    subcommands: [
        { name: 'befoerderung', description: 'Beförderung beantragen (nur mit erfüllten Voraussetzungen)', options: [{ name: 'rang', description: 'Gewünschter Rang', type: 'string', required: true, autocomplete: true, maxLength: 64 }, { name: 'begruendung', description: 'Begründung (mind. 10 Zeichen)', type: 'string', required: true, maxLength: 1500 }] },
        { name: 'versetzung', description: 'Versetzung in eine andere Abteilung beantragen', options: [{ name: 'abteilung', description: 'Gewünschte Abteilung', type: 'string', required: true, autocomplete: true, maxLength: 64 }, { name: 'begruendung', description: 'Begründung (mind. 10 Zeichen)', type: 'string', required: true, maxLength: 1500 }] },
        { name: 'status', description: 'Deine Anträge und ihr Status' },
        { name: 'antworten', description: 'Offene Rückfrage zu deinem Antrag beantworten', options: [{ name: 'antrag', description: 'Antrag mit Rückfrage', type: 'string', required: true, autocomplete: true, maxLength: 64 }, { name: 'antwort', description: 'Deine Antwort', type: 'string', required: true, maxLength: 1500 }] },
        { name: 'zurueckziehen', description: 'Eigenen offenen Antrag zurückziehen', options: [{ name: 'antrag', description: 'Antrag', type: 'string', required: true, autocomplete: true, maxLength: 64 }] },
    ],
    async complete(c, option, value) {
        const v = value.toLowerCase();
        try {
            if (option === 'rang')
                return (await requestTargets(c)).ranks.filter((r) => r.name.toLowerCase().includes(v)).slice(0, 25).map((r) => ({ name: (0, format_1.clip)(`${r.name}${r.eligible ? ' ✅' : ` (${r.met}/${r.total} Voraussetzungen)`}`, 100), value: r.id }));
            if (option === 'abteilung')
                return (await requestTargets(c)).departments.filter((d) => d.toLowerCase().includes(v)).slice(0, 25).map((d) => ({ name: (0, format_1.clip)(d, 100), value: d }));
            if (option === 'antrag') {
                const sub = String(c.opts._sub ?? '');
                return (await myRequests(c)).filter((r) => (sub === 'antworten' ? !!r.openQuery : r.canWithdraw) && `${r.number} ${r.toLabel ?? ''}`.toLowerCase().includes(v)).slice(0, 25).map((r) => ({ name: (0, format_1.clip)(`${r.number} · ${r.kind === 'PROMOTION' ? 'Beförderung' : 'Versetzung'} → ${r.toLabel ?? '—'}`, 100), value: r.id }));
            }
        }
        catch { /* keine Vorschläge */ }
        return [];
    },
    async run(c) {
        const sub = String(c.opts._sub ?? 'status');
        try {
            if (sub === 'befoerderung' || sub === 'versetzung') {
                const to = str(c, sub === 'befoerderung' ? 'rang' : 'abteilung');
                const r = await c.api.asUser(c.discordId, 'POST', '/hr/requests/self', { kind: KIND[sub], to, reason: str(c, 'begruendung') });
                return (0, format_1.okReply)(`📨 Dein ${sub === 'befoerderung' ? 'Beförderungs' : 'Versetzungs'}antrag **${(0, format_1.plain)(r.number)}** ist eingereicht. Eine berechtigte Führungskraft entscheidet – du bekommst Bescheid. Status: \`/antrag status\``);
            }
            if (sub === 'status') {
                const rows = await myRequests(c);
                if (!rows.length)
                    return { ephemeral: true, embeds: [{ title: '📨 Deine Anträge', description: 'Du hast noch keine Anträge gestellt.', color: format_1.COLORS.neutral }] };
                return { ephemeral: true, embeds: [{ title: '📨 Deine Anträge', color: format_1.COLORS.info, fields: rows.slice(0, 10).map((r) => ({
                                name: (0, format_1.clip)(`${r.number} · ${r.kind === 'PROMOTION' ? 'Beförderung' : 'Versetzung'} – ${r.statusLabel}`, 256),
                                value: (0, format_1.clip)([`${(0, format_1.plain)(r.fromLabel ?? '—')} → **${(0, format_1.plain)(r.toLabel ?? '—')}** · eingereicht ${ts(r.createdAt, 'd')}`, r.openQuery ? `❓ **Rückfrage von ${(0, format_1.plain)(r.openQuery.askedByName)}:** ${(0, format_1.plain)(r.openQuery.question)}\nAntworten: \`/antrag antworten\`` : null, ...r.decisions.filter((d) => d.comment && ['REJECT', 'APPROVE'].includes(d.decision)).map((d) => `${d.decision === 'REJECT' ? '❌' : '✅'} ${(0, format_1.plain)(d.by)}: ${(0, format_1.plain)(d.comment)}`)].filter(Boolean).join('\n'), 1024),
                            })) }] };
            }
            if (sub === 'antworten') {
                const id = str(c, 'antrag');
                if (!uuid.test(id))
                    return (0, format_1.errorReply)('Bitte einen Antrag aus der Liste wählen.');
                await c.api.asUser(c.discordId, 'POST', `/hr/requests/${id}/answer`, { answer: str(c, 'antwort') });
                return (0, format_1.okReply)('Danke! Deine Antwort ist bei der prüfenden Person angekommen – der Antrag ist wieder in Prüfung.');
            }
            if (sub === 'zurueckziehen') {
                const id = str(c, 'antrag');
                if (!uuid.test(id))
                    return (0, format_1.errorReply)('Bitte einen Antrag aus der Liste wählen.');
                await c.api.asUser(c.discordId, 'POST', `/hr/requests/${id}/withdraw`);
                return (0, format_1.okReply)('Dein Antrag wurde zurückgezogen.');
            }
            return (0, format_1.errorReply)('Unbekannter Unterbefehl.');
        }
        catch (e) {
            if (e instanceof api_1.BotApiError && (e.status === 409 || e.status === 400))
                return (0, format_1.errorReply)(e.message);
            return (0, errors_1.mapError)(e);
        }
    },
};
const MY = { INVITED: '📨 eingeladen', ACCEPTED: '✅ zugesagt', DECLINED: '✖️ abgesagt', EXCUSED: '🌴 abwesend gemeldet' };
async function respond(c, id, status) {
    if (!uuid.test(id))
        return (0, format_1.errorReply)('Bitte einen Termin aus der Liste wählen.');
    try {
        const e = await c.api.asUser(c.discordId, 'POST', `/calendar/${id}/respond`, { status });
        return (0, format_1.okReply)(`${status === 'ACCEPTED' ? '✅ Zugesagt' : status === 'DECLINED' ? '✖️ Abgesagt' : '🌴 Abwesenheit gemeldet'}: **${(0, format_1.plain)(e.title)}** (${ts(e.startsAt, 'f')}).`);
    }
    catch (e) {
        if (e instanceof api_1.BotApiError && e.status === 409)
            return (0, format_1.errorReply)(e.message);
        return (0, errors_1.mapError)(e);
    }
}
exports.EVENTS_COMMAND = {
    name: 'termine', description: 'Kommende Termine und Besprechungen: ansehen, zusagen, absagen',
    subcommands: [
        { name: 'liste', description: 'Kommende Termine', options: [{ name: 'tage', description: 'Zeitraum in Tagen (Standard 14)', type: 'integer', min: 1, max: 60 }, { name: 'nur_meine', description: 'Nur Termine, zu denen du eingeladen bist', type: 'boolean' }] },
        { name: 'anmelden', description: 'Für einen Termin zusagen', options: [{ name: 'termin', description: 'Termin', type: 'string', required: true, autocomplete: true, maxLength: 64 }] },
        { name: 'absagen', description: 'Für einen Termin absagen bzw. Abwesenheit melden', options: [{ name: 'termin', description: 'Termin', type: 'string', required: true, autocomplete: true, maxLength: 64 }, { name: 'abwesend', description: 'Als Abwesenheit melden (statt einfach absagen)', type: 'boolean' }] },
    ],
    async complete(c, option, value) {
        if (option !== 'termin')
            return [];
        try {
            const rows = await c.api.asUser(c.discordId, 'GET', '/calendar/upcoming?days=60');
            return rows.filter((e) => e.title.toLowerCase().includes(value.toLowerCase())).slice(0, 25).map((e) => ({ name: (0, format_1.clip)(`${e.title} · ${new Date(e.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, 100), value: e.id }));
        }
        catch {
            return [];
        }
    },
    async run(c) {
        const sub = String(c.opts._sub ?? 'liste');
        try {
            if (sub === 'liste') {
                const days = Number(c.opts.tage ?? 14);
                const rows = await c.api.asUser(c.discordId, 'GET', `/calendar/upcoming?days=${days}&scope=${c.opts.nur_meine ? 'mine' : 'all'}`);
                if (!rows.length)
                    return { ephemeral: true, embeds: [{ title: '📅 Kommende Termine', description: 'Keine Termine in diesem Zeitraum.', color: format_1.COLORS.neutral }] };
                const open = rows.filter((e) => e.myStatus !== 'ACCEPTED' && (e.openSignup || e.myStatus));
                return {
                    ephemeral: true,
                    embeds: [{ title: `📅 Kommende Termine (${days} Tage)`, color: format_1.COLORS.info, description: (0, format_1.clip)(rows.slice(0, 15).map((e) => `**${(0, format_1.plain)(e.title)}** · ${(0, format_1.plain)(e.categoryLabel)}${e.mandatory ? ' · Pflicht' : ''}\n${e.allDay ? ts(e.startsAt, 'D') : ts(e.startsAt, 'f')}${e.location ? ` · ${(0, format_1.plain)(e.location)}` : ''}${e.myStatus ? ` · ${MY[e.myStatus] ?? e.myStatus}` : ''}`).join('\n\n'), 4000) }],
                    ...(open.length ? { select: { id: 'cal:accept', placeholder: 'Zusagen für …', options: open.slice(0, 25).map((e) => ({ label: (0, format_1.clip)(e.title, 90), value: e.id, description: (0, format_1.clip)(new Date(e.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 90) })) } } : {}),
                };
            }
            if (sub === 'anmelden')
                return respond(c, str(c, 'termin'), 'ACCEPTED');
            if (sub === 'absagen')
                return respond(c, str(c, 'termin'), c.opts.abwesend ? 'EXCUSED' : 'DECLINED');
            return (0, format_1.errorReply)('Unbekannter Unterbefehl.');
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
    },
};
/** Auswahl aus `/termine liste` und Buttons unter Besprechungs-Ankündigungen (`meet:accept:<terminId>`). */
exports.CALENDAR_INTERACTION = {
    prefix: 'cal',
    async run(c) { return c.args[0] === 'accept' ? respond(c, c.values?.[0] ?? '', 'ACCEPTED') : (0, format_1.errorReply)('Unbekannte Aktion.'); },
};
exports.MEETING_INTERACTION = {
    prefix: 'meet',
    async run(c) {
        const status = { accept: 'ACCEPTED', decline: 'DECLINED', excuse: 'EXCUSED' }[c.args[0]];
        return status ? respond(c, c.args[1] ?? '', status) : (0, format_1.errorReply)('Unbekannte Aktion.');
    },
};
exports.DOCUMENT_COMMAND = {
    name: 'dokument', description: 'Freigegebene Dokumente finden (Antwort nur für dich, Link ins Dashboard)',
    options: [
        { name: 'suche', description: 'Titel oder Stichwort', type: 'string', maxLength: 100 },
        { name: 'kategorie', description: 'Kategorie', type: 'string', choices: [['DIRECTIVE', 'Dienstanweisung'], ['RULES', 'Regelwerk'], ['TRAINING', 'Ausbildungsunterlage'], ['EXAM', 'Prüfungsunterlage'], ['DISPATCH', 'Leitstelleninformation'], ['POLICY', 'Interne Richtlinie'], ['TEMPLATE', 'Vorlage'], ['OTHER', 'Sonstiges']].map(([value, name]) => ({ name: name, value: value })) },
    ],
    async run(c) {
        try {
            const q = str(c, 'suche'), cat = str(c, 'kategorie');
            const r = await c.api.asUser(c.discordId, 'GET', `/documents?${new URLSearchParams({ ...(q ? { q } : {}), ...(cat ? { category: cat } : {}) }).toString()}`);
            if (!r.items.length)
                return { ephemeral: true, embeds: [{ title: '📄 Dokumente', description: q ? `Nichts zu „${(0, format_1.plain)(q)}“ gefunden (oder kein Zugriff).` : 'Keine Dokumente für dich freigegeben.', color: format_1.COLORS.neutral }] };
            // Immer privat und nur als Link: die Datei selbst gibt es nur nach Anmeldung (Zugriff wird dort erneut geprüft und protokolliert)
            return { ephemeral: true, embeds: [{ title: '📄 Dokumente', color: format_1.COLORS.info, description: (0, format_1.clip)(r.items.slice(0, 15).map((d) => `**[${(0, format_1.plain)(d.title)}](${d.url})** · ${(0, format_1.plain)(d.categoryLabel)} · v${d.currentVersion}${d.access !== 'ALL' ? ' · 🔒' : ''}${d.description ? `\n-# ${(0, format_1.plain)((0, format_1.clip)(d.description, 120))}` : ''}`).join('\n'), 4000), footer: r.items.length > 15 ? `${r.items.length - 15} weitere – Suche eingrenzen` : 'Öffnen im Dashboard (Anmeldung nötig)' }] };
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
    },
};
exports.ADMINISTRATION_COMMANDS = [exports.SHIFTPLAN_COMMAND, exports.REQUEST_COMMAND, exports.EVENTS_COMMAND, exports.DOCUMENT_COMMAND];
//# sourceMappingURL=administration.js.map