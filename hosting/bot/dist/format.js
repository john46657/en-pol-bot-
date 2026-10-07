"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DUTY_DE = exports.fmtDuration = exports.incidentLine = exports.vehicleEmbed = exports.okReply = exports.errorReply = exports.plain = exports.label = exports.clip = exports.COLORS = void 0;
exports.personEmbed = personEmbed;
exports.listEmbed = listEmbed;
exports.renderOutbox = renderOutbox;
exports.applicationEmbeds = applicationEmbeds;
exports.humanDuration = humanDuration;
exports.leaveDecisionText = leaveDecisionText;
exports.leaveDirectEmbed = leaveDirectEmbed;
exports.renderOutboxEmbeds = renderOutboxEmbeds;
exports.academyCourseEmbed = academyCourseEmbed;
exports.outboxButtons = outboxButtons;
exports.qualificationDecisionText = qualificationDecisionText;
exports.applicationDecisionText = applicationDecisionText;
exports.dangerEmbed = dangerEmbed;
exports.dangerButtons = dangerButtons;
exports.teamlistEmbed = teamlistEmbed;
exports.COLORS = { info: 0x3b82f6, success: 0x22c55e, warning: 0xf59e0b, danger: 0xef4444, neutral: 0x64748b };
const PRIORITY_COLOR = { LOW: exports.COLORS.neutral, MEDIUM: exports.COLORS.info, HIGH: exports.COLORS.warning, URGENT: exports.COLORS.danger, CRITICAL: exports.COLORS.danger };
/** Discord-Limits: Titel 256, Beschreibung 4096, Feldwert 1024. */
const clip = (s, max) => { const t = String(s ?? '—'); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
exports.clip = clip;
const label = (s) => String(s ?? '—').replace(/_/g, ' ');
exports.label = label;
/** Markdown aus Nutzerdaten entschärfen (Backticks, Pings, Formatierung). */
const plain = (s) => String(s ?? '—').replace(/[*_`~|>\\]/g, '\\$&').replace(/@(everyone|here)/g, '@\u200b$1');
exports.plain = plain;
const errorReply = (text) => ({ content: `❌ ${text}`, ephemeral: true });
exports.errorReply = errorReply;
const okReply = (text) => ({ content: `✅ ${text}`, ephemeral: true });
exports.okReply = okReply;
function personEmbed(p, extra = {}) {
    return {
        title: (0, exports.clip)(`👤 ${p.robloxUsername}`, 256), color: extra.wanted ? exports.COLORS.warning : exports.COLORS.info,
        fields: [
            { name: 'Roblox-ID', value: (0, exports.clip)(p.robloxUserId ?? 'unbekannt', 1024), inline: true },
            { name: 'Status', value: (0, exports.label)(p.status), inline: true },
            ...(extra.tickets !== undefined ? [{ name: 'Tickets', value: String(extra.tickets), inline: true }] : []),
            ...(p.aliases?.length ? [{ name: 'Aliase', value: (0, exports.clip)(p.aliases.map(exports.plain).join(', '), 1024) }] : []),
            ...(p.notes ? [{ name: 'Notizen', value: (0, exports.clip)((0, exports.plain)(p.notes), 1024) }] : []),
        ],
        footer: extra.wanted ? '⚠️ Mit Fahndungseintrag verknüpft (ggf. erledigt) — Status im System prüfen' : undefined,
    };
}
const vehicleEmbed = (v) => ({
    title: (0, exports.clip)(`🚗 ${v.plate}`, 256), color: exports.COLORS.info,
    fields: [
        { name: 'Modell', value: (0, exports.clip)((0, exports.plain)(v.model), 1024), inline: true }, { name: 'Farbe', value: (0, exports.clip)((0, exports.plain)(v.color), 1024), inline: true },
        { name: 'Halter', value: (0, exports.clip)((0, exports.plain)(v.owner?.robloxUsername), 1024), inline: true }, { name: 'Status', value: (0, exports.label)(v.status), inline: true },
    ],
});
exports.vehicleEmbed = vehicleEmbed;
const incidentLine = (i) => `**${i.number}** · ${(0, exports.plain)(i.title)} — ${(0, exports.label)(i.priority)} / ${(0, exports.label)(i.status)}${i.location ? ` · ${(0, exports.plain)(i.location)}` : ''}`;
exports.incidentLine = incidentLine;
function listEmbed(title, lines, empty) {
    return { title: (0, exports.clip)(title, 256), description: (0, exports.clip)(lines.length ? lines.join('\n') : empty, 4000), color: exports.COLORS.info };
}
// ---- Outbox-Benachrichtigungen ----
function renderOutbox(type, p) {
    switch (type) {
        case 'workflow.message': {
            // Studio-Workflow: Titel/Text kommen aus der Vorlage im Dashboard (Werte schon eingesetzt)
            const color = typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? parseInt(p.color.slice(1), 16) : exports.COLORS.info;
            return { title: (0, exports.clip)((0, exports.plain)(p.title), 256), ...(p.text ? { description: (0, exports.clip)((0, exports.plain)(p.text), 4000) } : {}), color, footer: (0, exports.clip)(`Workflow: ${String(p.workflow ?? '')}`, 200) };
        }
        case 'incident.created':
            return { title: `🚨 Neuer Einsatz: ${(0, exports.clip)((0, exports.plain)(p.title), 200)}`, color: PRIORITY_COLOR[String(p.priority)] ?? exports.COLORS.info, fields: [{ name: 'Nummer', value: String(p.number), inline: true }, { name: 'Priorität', value: (0, exports.label)(p.priority), inline: true }, { name: 'Ort', value: (0, exports.clip)((0, exports.plain)(p.location ?? 'unbekannt'), 1024), inline: true }] };
        case 'incident.assigned':
            return { title: `📻 ${(0, exports.plain)(p.callsign)} → ${p.number}`, description: (0, exports.clip)((0, exports.plain)(p.title), 4000), color: PRIORITY_COLOR[String(p.priority)] ?? exports.COLORS.info, fields: [{ name: 'Ort', value: (0, exports.clip)((0, exports.plain)(p.location ?? 'unbekannt'), 1024), inline: true }] };
        case 'wanted.created':
            return {
                title: `🚨 Neue Fahndung (${p.kind === 'vehicle' ? 'Fahrzeug' : 'Person'})`, description: `**${(0, exports.clip)((0, exports.plain)(p.subject), 200)}**\n${(0, exports.clip)((0, exports.plain)(p.reason), 1500)}${p.description ? `\n\n${(0, exports.clip)((0, exports.plain)(p.description), 2000)}` : ''}`,
                color: PRIORITY_COLOR[String(p.priority)] ?? exports.COLORS.danger,
                fields: [{ name: 'Priorität', value: (0, exports.label)(p.priority), inline: true }, { name: 'Gültig bis', value: p.expiresAt ? `<t:${Math.floor(Date.parse(String(p.expiresAt)) / 1000)}:f>` : 'unbefristet', inline: true }, ...(p.createdBy ? [{ name: 'Ausgestellt von', value: (0, exports.clip)((0, exports.plain)(p.createdBy), 200), inline: true }] : [])],
            };
        case 'wanted.status': {
            const st = { CLEARED: ['✅ Fahndung aufgehoben', exports.COLORS.success], CANCELLED: ['⚪ Fahndung abgebrochen', exports.COLORS.info], ACTIVE: ['🚨 Fahndung wieder aktiv', exports.COLORS.danger], EXPIRED: ['⌛ Fahndung abgelaufen', exports.COLORS.info] };
            const [title, color] = st[String(p.status)] ?? [`Fahndung: ${(0, exports.label)(p.status)}`, exports.COLORS.info];
            return { title, description: `**${(0, exports.clip)((0, exports.plain)(p.subject), 200)}** – ${(0, exports.clip)((0, exports.plain)(p.reason), 1000)}${p.note ? `\n**Grund:** ${(0, exports.clip)((0, exports.plain)(p.note), 1000)}` : ''}`, color, ...(p.by ? { footer: `von ${(0, exports.clip)((0, exports.plain)(p.by), 100)}` } : {}) };
        }
        case 'teamchance.changed':
            return p.open
                ? { title: `📣 ${(0, exports.clip)((0, exports.plain)(p.title ?? 'Team-Chance'), 200)} – jetzt offen!`, description: (0, exports.clip)((0, exports.plain)(p.description ?? ''), 3500) || undefined, color: exports.COLORS.success,
                    fields: [...(p.closesAt ? [{ name: 'Bewerbungsschluss', value: `<t:${Math.floor(Date.parse(String(p.closesAt)) / 1000)}:f>`, inline: true }] : []), ...(Number(p.slots) > 0 ? [{ name: 'Plätze', value: String(p.slots), inline: true }] : [])] }
                : { title: `🔒 ${(0, exports.clip)((0, exports.plain)(p.title ?? 'Team-Chance'), 200)} – geschlossen`, description: 'Vielen Dank für alle Bewerbungen!', color: exports.COLORS.danger };
        case 'announcement':
            return { title: '📢 Ankündigung', description: (0, exports.clip)((0, exports.plain)(p.body), 4000), color: exports.COLORS.warning, footer: `von ${(0, exports.clip)(p.author, 100)}` };
        case 'danger.changed': {
            // wie im alten Bot: „Status 1: Geringe Kriminalität.“ + Text der Stufe (Ping der eingestellten Rolle macht die Outbox)
            return { title: (0, exports.clip)(`${String(p.name ?? p.level)}${p.title ? `: ${String(p.title)}` : ''}`, 256), color: hexColor(p.color, exports.COLORS.warning),
                description: (0, exports.clip)(`${String(p.text ?? '')}${p.reason ? `\n\n**Hinweis:** ${(0, exports.plain)(p.reason)}` : ''}`, 4000) || undefined,
                footer: (0, exports.clip)(`${p.previous ? `Vorher: ${String(p.previous)} · ` : ''}Gesetzt von ${String(p.setBy ?? 'System')}`, 200) };
        }
        case 'duty.changed': {
            const st = String(p.status), prev = String(p.previous ?? 'OFF_DUTY');
            const who = `${p.callsign ? `${(0, exports.plain)(p.callsign)} · ` : ''}${(0, exports.plain)(p.name)}`;
            const mins = typeof p.previousMinutes === 'number' && prev !== 'OFF_DUTY' ? ` – ${(0, exports.fmtDuration)(p.previousMinutes * 60)}` : '';
            return { title: (0, exports.clip)(`${exports.DUTY_DE[st]?.emoji ?? '•'} ${who} ist jetzt ${exports.DUTY_DE[st]?.label ?? (0, exports.label)(st)}`, 256), color: exports.DUTY_DE[st]?.color ?? exports.COLORS.neutral,
                description: (0, exports.clip)([p.discordId ? `<@${String(p.discordId)}>` : null, p.shiftType ? `Schicht: **${(0, exports.plain)(p.shiftType)}**` : null, `Vorher: ${exports.DUTY_DE[prev]?.label ?? (0, exports.label)(prev)}${mins}`, p.setBy ? `Gesetzt von: ${(0, exports.plain)(p.setBy)}` : null].filter(Boolean).join('\n'), 1000) };
        }
        case 'leave.requested':
            // wie Trident: oben @Benutzer mit Profilbild (setzt der Bot), Grund + Dauer, unten die ID
            return { title: 'Abmeldeantrag', color: exports.COLORS.warning,
                description: (0, exports.clip)(`${p.discordId ? `<@${String(p.discordId)}>` : (0, exports.plain)(p.name)} möchte sich abmelden.`, 4000),
                fields: [{ name: 'Grund', value: (0, exports.clip)((0, exports.plain)(p.reason), 1024) }, { name: 'Dauer', value: leaveSpan(p) }, { name: 'Zeitraum', value: `<t:${unixOf(p.startsAt)}:f> – <t:${unixOf(p.endsAt)}:f>` }],
                footer: `ID: ${String(p.number)}` };
        case 'leave.log': {
            const ev = LEAVE_EVENTS[String(p.event)] ?? { text: String(p.event), color: exports.COLORS.neutral };
            return { title: (0, exports.clip)(`${ev.text}: ${(0, exports.plain)(p.name)} (${String(p.number)})`, 256), color: ev.color,
                description: (0, exports.clip)([p.discordId ? `<@${String(p.discordId)}>` : null, `**Zeitraum:** ${berlinDate(p.startsAt)} – ${berlinDate(p.endsAt)} (${leaveSpan(p)})`, `**Grund:** ${(0, exports.plain)(p.reason)}`, p.decidedByName ? `**Entschieden von:** ${(0, exports.plain)(p.decidedByName)}` : null, p.decisionReason ? `**Begründung:** ${(0, exports.plain)(p.decisionReason)}` : null].filter(Boolean).join('\n'), 4000) };
        }
        case 'sek.report':
            return { title: `🎯 SEK-Einsatzbericht ${p.number}`, color: exports.COLORS.neutral, description: (0, exports.clip)((0, exports.plain)(p.description), 3500), fields: [
                    { name: 'Einsatzart', value: (0, exports.clip)((0, exports.plain)(p.missionType), 200), inline: true }, { name: 'Datum', value: new Date(String(p.occurredAt)).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }), inline: true }, { name: 'Beamter', value: (0, exports.clip)((0, exports.plain)(p.author), 200), inline: true }
                ] };
        default:
            return null;
    }
}
// ---- Eingegangene Bewerbungen im Team-Channel (wie Appy) ----
const unix = (iso) => { const t = Date.parse(String(iso ?? '')); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };
const fmtDuration = (sec) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)} min ${sec % 60}s` : `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`);
exports.fmtDuration = fmtDuration;
/** Gesamtbudget der Embeds einer Nachricht (Discord: 6000 Zeichen) – Platz lassen für das spätere Feld „Entscheidung“. */
const BUDGET = 4800;
/** Fragen fett + nummeriert, Antwort darunter, am Ende die Bewerber-Infos. Lange Bewerbungen werden auf mehrere Embeds verteilt bzw. gekürzt. */
function applicationEmbeds(p, kind) {
    const qa = Array.isArray(p.answers) ? p.answers : [];
    const id = String(p.discordId ?? '');
    const joined = unix(p.joinedAt), submitted = unix(p.createdAt);
    const stats = ['**Bewerber-Infos**',
        ...(id ? [`Discord-ID: \`${id}\``, `Benutzername: \`${(0, exports.plain)(p.discordName ?? '—')}\``, `Benutzer: <@${id}>`] : ['Quelle: Web-Formular (kein Discord)']),
        ...(kind === 'p' ? [`Roblox: \`${(0, exports.plain)(p.robloxUsername)}\`${p.robloxUserId ? ` (\`${String(p.robloxUserId)}\`)` : ''}`] : [p.linkedName ? `Im System: **${(0, exports.plain)(p.linkedName)}**` : 'Im System: nicht verknüpft']),
        ...(typeof p.durationSec === 'number' ? [`Dauer: \`${(0, exports.fmtDuration)(p.durationSec)}\``] : []),
        ...(joined ? [`Server beigetreten: <t:${joined}:R>`] : []),
        ...(submitted ? [`Eingereicht: <t:${submitted}:R>`] : []),
        ...(p.guildName ? [`Server: \`${(0, exports.plain)(p.guildName)}\``] : []),
    ].join('\n');
    const section = (q, i, max) => {
        const a = (0, exports.plain)(q.answer) || '—';
        return `**${i + 1}. ${(0, exports.clip)((0, exports.plain)(q.question), 200)}**\n${max !== undefined && a.length > max ? `${a.slice(0, max)}… *(gekürzt)*` : a}`;
    };
    let sections = qa.map((q, i) => section(q, i));
    // wie bei Appy: „john45346s Bewerbung ‚Flugstaffel‘ eingereicht“
    const who = p.discordName ? `${(0, exports.plain)(p.discordName)}s ` : '';
    const title = (0, exports.clip)(kind === 'p' ? `📋 ${who}Bewerbung bei EN Polizei eingereicht · ${p.number}` : `📋 ${who}Bewerbung „${(0, exports.plain)(p.unitName)}“ eingereicht · ${p.number}`, 256);
    // Platz für Titel (bis zu 10 Embeds) und Bewerber-Infos abziehen
    const room = BUDGET - stats.length - (title.length + 20) * 3;
    const size = (xs) => xs.reduce((n, x) => n + x.length + 2, 0);
    if (size(sections) > room) {
        const questions = qa.reduce((n, q, i) => n + section({ question: q.question, answer: '' }, i).length + 15, 0);
        const per = Math.max(40, Math.floor((room - questions) / Math.max(1, qa.length)));
        sections = qa.map((q, i) => section(q, i, per));
    }
    // passt es immer noch nicht (sehr viele Fragen), den Rest nur als Hinweis – vollständig im Dashboard
    if (size(sections) > room) {
        const kept = [];
        for (const x of sections) {
            if (size(kept) + x.length + 2 > room - 120)
                break;
            kept.push(x);
        }
        kept.push(`*… und ${sections.length - kept.length} weitere Antworten – vollständig im Dashboard.*`);
        sections = kept;
    }
    const embeds = [];
    let cur = '';
    for (const piece of [...sections, stats]) {
        if (cur && cur.length + piece.length + 2 > 4000) {
            embeds.push({ title: embeds.length ? `${title} (Fortsetzung)` : title, color: exports.COLORS.warning, description: cur });
            cur = '';
        }
        cur = cur ? `${cur}\n\n${piece}` : (0, exports.clip)(piece, 4000);
    }
    embeds.push({ title: embeds.length ? `${title} (Fortsetzung)` : title, color: exports.COLORS.warning, description: cur });
    return embeds.slice(0, 10);
}
/** Alle Embeds einer Channel-Benachrichtigung (Bewerbungen ggf. mehrere). */
const berlinDate = (v) => { const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const LEAVE_EVENTS = {
    approved: { text: '✅ Abmeldung angenommen', color: exports.COLORS.success }, denied: { text: '❌ Abmeldung abgelehnt', color: exports.COLORS.danger },
    started: { text: '🏝️ Abmeldung beginnt', color: exports.COLORS.info }, ended: { text: '👋 Abmeldung beendet', color: exports.COLORS.neutral },
    ended_early: { text: '↩️ Abmeldung vorzeitig beendet', color: exports.COLORS.neutral }, cancelled: { text: '↩️ Abmeldung zurückgezogen', color: exports.COLORS.neutral },
};
const unixOf = (v) => Math.floor(new Date(String(v)).getTime() / 1000);
/** Dauer menschenlesbar: „6 Stunden“, „1 Tag“, „2 Wochen“, „1 Woche, 2 Tage“. */
function humanDuration(ms) {
    const H = 3_600_000, D = 24 * H, W = 7 * D;
    const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
    const parts = [];
    let rest = Math.max(H, Math.round(ms / H) * H);
    if (rest >= W && rest % D === 0) {
        parts.push(n(Math.floor(rest / W), 'Woche', 'Wochen'));
        rest %= W;
    }
    if (rest >= D) {
        parts.push(n(Math.floor(rest / D), 'Tag', 'Tage'));
        rest %= D;
    }
    if (rest >= H)
        parts.push(n(Math.round(rest / H), 'Stunde', 'Stunden'));
    return parts.join(', ');
}
const leaveSpan = (p) => humanDuration(new Date(String(p.endsAt)).getTime() - new Date(String(p.startsAt)).getTime());
/** Kopfzeile der DMs: Server, auf dem die Abmeldung beantragt wurde (Name + Icon). */
const guildAuthor = (p) => (p.guildName ? { name: (0, exports.clip)(String(p.guildName), 200), ...(typeof p.guildIcon === 'string' && /^https:\/\//.test(p.guildIcon) ? { iconUrl: p.guildIcon } : {}) } : undefined);
/** Direktnachricht nach der Entscheidung über eine Abmeldung (Textfassung, z. B. für Logs/Tests). */
function leaveDecisionText(p) {
    const when = `${berlinDate(p.startsAt)} – ${berlinDate(p.endsAt)}`;
    return p.status === 'APPROVED'
        ? `✅ Deine Abmeldung **${String(p.number)}** (${when}) wurde **angenommen**.${p.decisionReason ? `\n\n**Hinweis:** ${(0, exports.clip)((0, exports.plain)(p.decisionReason), 1000)}` : ''}`
        : `❌ Deine Abmeldung **${String(p.number)}** (${when}) wurde **abgelehnt**.${p.decisionReason ? `\n\n**Grund:** ${(0, exports.clip)((0, exports.plain)(p.decisionReason), 1000)}` : ''}`;
}
/** DMs zu Abmeldungen als Embed (wie Trident): ausstehend (gelb), angenommen (grün), abgelehnt (rot). */
function leaveDirectEmbed(type, p) {
    const author = guildAuthor(p);
    const server = (0, exports.plain)(p.guildName ?? 'dem Server');
    const end = unixOf(p.endsAt);
    const base = { ...(author ? { author } : {}), footer: `ID: ${String(p.number)}` };
    if (type === 'leave.pending')
        return { ...base, title: 'Abmeldung ausstehend', color: exports.COLORS.warning,
            description: `Deine Abmeldung wurde der Leitung zur Freigabe vorgelegt.\nWenn sie angenommen wird, endet sie ungefähr <t:${end}:F> (<t:${end}:R>).\nUm deine Abmeldung zu verwalten, nutze \`/leave manage\` auf **${server}**.` };
    if (p.status === 'APPROVED')
        return { ...base, title: 'Abmeldung angenommen', color: exports.COLORS.success,
            description: `Deine Abmeldung endet ungefähr <t:${end}:F> (<t:${end}:R>).\nUm deine Abmeldung zu verwalten, nutze \`/leave manage\` auf **${server}**.`,
            ...(p.decisionReason ? { fields: [{ name: 'Hinweis', value: (0, exports.clip)((0, exports.plain)(p.decisionReason), 1024) }] } : {}) };
    return { ...base, title: 'Abmeldung abgelehnt', color: exports.COLORS.danger,
        description: `Falls du denkst, dass das ein Fehler war, wende dich an die Leitung von **${server}**.`,
        ...(p.decisionReason ? { fields: [{ name: 'Grund', value: (0, exports.clip)((0, exports.plain)(p.decisionReason), 1024) }] } : {}) };
}
function renderOutboxEmbeds(type, p) {
    if (type === 'qualification.submitted')
        return applicationEmbeds(p, 'q');
    if (type === 'application.submitted')
        return applicationEmbeds(p, 'p');
    // entschiedene Bewerbung für den Channel „angenommen“/„abgelehnt“ (wie bei Appy)
    if (type === 'qualification.archived' || type === 'application.archived') {
        const accepted = p.status === 'ACCEPTED';
        const embeds = applicationEmbeds(p, type === 'application.archived' ? 'p' : 'q').map((e) => ({ ...e, color: accepted ? exports.COLORS.success : exports.COLORS.danger }));
        const last = embeds[embeds.length - 1];
        last.fields = [{ name: 'Entscheidung', value: (0, exports.clip)(`${accepted ? '✅ Angenommen' : '❌ Abgelehnt'}${p.decidedByName ? ` von ${(0, exports.plain)(p.decidedByName)}` : ''}${p.reason ? `\n**Grund:** ${(0, exports.plain)(p.reason)}` : ''}`, 1024) }];
        return embeds;
    }
    if (type === 'academy.course')
        return [academyCourseEmbed(p)];
    const e = renderOutbox(type, p);
    return e ? [e] : null;
}
/** Ankündigung eines Akademie-Kurses (Rollen-Ping kommt über `pingRoleIds`). */
function academyCourseEmbed(p) {
    const when = typeof p.when === 'string' && !Number.isNaN(Date.parse(p.when)) ? Math.floor(Date.parse(p.when) / 1000) : null;
    const fields = [
        ...(when ? [{ name: '🕒 Termin', value: `<t:${when}:F> (<t:${when}:R>)`, inline: true }] : []),
        ...(p.location ? [{ name: '📍 Ort', value: (0, exports.clip)((0, exports.plain)(p.location), 1024), inline: true }] : []),
        { name: '🎯 Bestehensgrenze', value: `${Number(p.passScore) || 0} Punkte`, inline: true },
        ...(p.instructorName ? [{ name: '👮 Ausbilder', value: (0, exports.clip)((0, exports.plain)(p.instructorName), 1024), inline: true }] : []),
    ];
    return { title: (0, exports.clip)(`🎓 Akademie: ${String(p.title ?? 'Kurs')}`, 256), color: exports.COLORS.info, ...(p.description ? { description: (0, exports.clip)(String(p.description), 4000) } : {}), fields, footer: 'Akademie · EN Polizei' };
}
/** Buttons unter Channel-Benachrichtigungen: Annehmen/Ablehnen (auch mit Grund), Verlauf, Ticket, Dashboard. */
function outboxButtons(type, p) {
    if (type === 'leave.requested' && typeof p.id === 'string')
        return [
            { id: `leave:decide:${p.id}:APPROVED`, label: 'Annehmen', style: 'success', emoji: '✔️' }, { id: `leave:reason:${p.id}:DENIED`, label: 'Ablehnen', style: 'danger', emoji: '✖️' },
            ...(typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary', url: p.dashboardUrl }] : []),
        ];
    if (type === 'academy.course' && typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl))
        return [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary', url: p.dashboardUrl }];
    // Fahndung / Einsatz: Link ins Dashboard
    if (/^wanted\./.test(type) && typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl))
        return [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary', url: p.dashboardUrl }];
    const kind = type === 'qualification.submitted' ? 'q' : type === 'application.submitted' ? 'p' : null;
    if (!kind || typeof p.id !== 'string')
        return undefined;
    const id = p.id, discordId = typeof p.discordId === 'string' && /^\d{15,25}$/.test(p.discordId) ? p.discordId : null;
    return [
        { id: `quali:decide:${kind}:${id}:ACCEPTED`, label: 'Annehmen', style: 'success' },
        { id: `quali:decide:${kind}:${id}:REJECTED`, label: 'Ablehnen', style: 'danger' },
        { id: `quali:reason:${kind}:${id}:ACCEPTED`, label: 'Annehmen mit Grund', style: 'success' },
        { id: `quali:reason:${kind}:${id}:REJECTED`, label: 'Ablehnen mit Grund', style: 'danger' },
        ...(discordId ? [{ id: `quali:history:${discordId}`, label: 'Verlauf', style: 'primary' }, { id: `quali:ticket:${kind}:${id}`, label: 'Ticket mit Bewerber öffnen', emoji: '🎫', style: 'secondary' }] : []),
        ...(typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im Dashboard ansehen', style: 'secondary', url: p.dashboardUrl }] : []),
    ];
}
const reasonText = (p) => (p.reason ? `\n\n**Begründung:** ${(0, exports.clip)((0, exports.plain)(p.reason), 1000)}` : '');
/** Direktnachricht nach der Entscheidung über eine Qualifikations-Bewerbung. */
function qualificationDecisionText(p) {
    if (typeof p.message === 'string' && p.message.trim())
        return (0, exports.clip)(p.message, 2000); // Text aus der Einrichtung (Accepted/Denied Message)
    return p.status === 'ACCEPTED'
        ? `🎉 Deine Bewerbung für **${(0, exports.plain)(p.unitName)}** (${p.number}) wurde **angenommen** – willkommen! Ein Teammitglied meldet sich bei dir.${reasonText(p)}`
        : `Deine Bewerbung für **${(0, exports.plain)(p.unitName)}** (${p.number}) wurde diesmal leider **nicht angenommen**. Du kannst dich später gerne erneut bewerben.${reasonText(p)}`;
}
/** Texte der Entscheidungs-Direktnachricht an Bewerber (ohne internen Grund). */
function applicationDecisionText(p) {
    if (typeof p.message === 'string' && p.message.trim())
        return (0, exports.clip)(p.message, 2000);
    return p.status === 'ACCEPTED'
        ? `🎉 Deine Bewerbung **${p.number}** bei EN Polizei wurde **angenommen**! Ein Teammitglied meldet sich bei dir für die nächsten Schritte.${reasonText(p)}`
        : `Deine Bewerbung **${p.number}** bei EN Polizei wurde diesmal leider **nicht angenommen**. Du kannst dich gerne später erneut bewerben.${reasonText(p)}`;
}
const hexColor = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : fallback);
/** Panel wie im alten Bot: Titel, Erklärung, darunter der aktuelle Stand mit Zeitpunkt. */
function dangerEmbed(s) {
    const d = s.def;
    const current = d ? `**Aktuell:** ${d.emoji} ${(0, exports.plain)(d.name)}${d.title ? ` – ${(0, exports.plain)(d.title)}` : ''}${s.reason ? `\n${(0, exports.clip)((0, exports.plain)(s.reason), 300)}` : ''}` : '';
    const when = s.at ? `\n<t:${Math.floor(new Date(s.at).getTime() / 1000)}:f>` : '';
    return { title: (0, exports.clip)(s.panel?.title ?? 'Gefahrenstatus', 256), color: hexColor(d?.color, exports.COLORS.danger), description: (0, exports.clip)(`${s.panel?.text ?? ''}${current ? `\n\n${current}` : ''}${when}`, 4000),
        ...(s.setByName ? { footer: `Gesetzt von ${(0, exports.clip)(s.setByName, 100)}` } : {}) };
}
function dangerButtons(s) {
    return (s.levels ?? []).slice(0, 10).map((l) => ({ id: `danger:set:${l.key}`, label: (0, exports.clip)(l.name, 80), emoji: s.panel?.buttonEmoji || l.emoji || undefined, style: l.buttonStyle ?? 'danger' }));
}
const DUTY_EMOJI = { ON_DUTY: '🟢', BREAK: '🟡', TRAINING: '🔵', ADMINISTRATIVE: '🔵', OFF_DUTY: '⚪' };
/** Dienststatus auf Deutsch (Meldungen im Dienst-Channel, Dienst-Panel). */
exports.DUTY_DE = {
    ON_DUTY: { label: 'im Dienst', emoji: '🟢', color: 0x22c55e }, BREAK: { label: 'in Pause', emoji: '🟡', color: 0xf59e0b },
    TRAINING: { label: 'im Training', emoji: '🔵', color: 0x3b82f6 }, ADMINISTRATIVE: { label: 'in der Verwaltung', emoji: '🔵', color: 0x06b6d4 },
    OFF_DUTY: { label: 'außer Dienst', emoji: '⚪', color: 0x64748b },
};
function teamlistEmbed(members, rankOrder) {
    const rankOf = (m) => m.rank ?? 'Ohne Rang';
    const known = rankOrder.filter((r) => members.some((m) => rankOf(m) === r));
    const rest = [...new Set(members.map(rankOf))].filter((r) => !rankOrder.includes(r)).sort((a, b) => a.localeCompare(b));
    const fields = [];
    for (const rank of [...known, ...rest]) {
        const people = members.filter((m) => rankOf(m) === rank).sort((a, b) => (a.callsign ?? '~').localeCompare(b.callsign ?? '~'));
        const lines = people.map((m) => `${DUTY_EMOJI[m.dutyStatus] ?? '⚪'} ${m.callsign ? `**${(0, exports.plain)(m.callsign)}** ` : ''}${(0, exports.plain)(m.name)}${m.unit ? ` · ${(0, exports.plain)(m.unit)}` : ''}`);
        // Feldwerte sind auf 1024 Zeichen begrenzt → bei Bedarf auf mehrere Felder aufteilen
        let chunk = '';
        let part = 0;
        for (const l of lines) {
            if ((chunk + '\n' + l).length > 1000) {
                fields.push({ name: part ? `${rank} (Forts.)` : `${rank} (${people.length})`, value: chunk });
                chunk = '';
                part++;
            }
            chunk += (chunk ? '\n' : '') + l;
        }
        if (chunk)
            fields.push({ name: part ? `${rank} (Forts.)` : `${rank} (${people.length})`, value: chunk });
    }
    const onDuty = members.filter((m) => m.dutyStatus === 'ON_DUTY').length;
    return { title: '📋 Teamliste – EN Polizei', color: exports.COLORS.neutral, fields: fields.slice(0, 25), description: members.length ? undefined : 'Noch keine Personalakten angelegt.', footer: `${members.length} Mitglieder · ${onDuty} im Dienst · wird automatisch aktualisiert` };
}
//# sourceMappingURL=format.js.map