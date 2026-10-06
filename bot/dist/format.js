"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DANGER_BUTTONS = exports.DANGER = exports.incidentLine = exports.vehicleEmbed = exports.okReply = exports.errorReply = exports.plain = exports.label = exports.clip = exports.COLORS = void 0;
exports.personEmbed = personEmbed;
exports.listEmbed = listEmbed;
exports.renderOutbox = renderOutbox;
exports.sekDecisionText = sekDecisionText;
exports.applicationDecisionText = applicationDecisionText;
exports.dangerEmbed = dangerEmbed;
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
        case 'incident.created':
            return { title: `🚨 Neuer Einsatz: ${(0, exports.clip)((0, exports.plain)(p.title), 200)}`, color: PRIORITY_COLOR[String(p.priority)] ?? exports.COLORS.info, fields: [{ name: 'Nummer', value: String(p.number), inline: true }, { name: 'Priorität', value: (0, exports.label)(p.priority), inline: true }, { name: 'Ort', value: (0, exports.clip)((0, exports.plain)(p.location ?? 'unbekannt'), 1024), inline: true }] };
        case 'incident.assigned':
            return { title: `📻 ${(0, exports.plain)(p.callsign)} → ${p.number}`, description: (0, exports.clip)((0, exports.plain)(p.title), 4000), color: PRIORITY_COLOR[String(p.priority)] ?? exports.COLORS.info, fields: [{ name: 'Ort', value: (0, exports.clip)((0, exports.plain)(p.location ?? 'unbekannt'), 1024), inline: true }] };
        case 'wanted.created':
            return { title: `🔴 Neue Fahndung (${p.kind === 'vehicle' ? 'Fahrzeug' : 'Person'})`, description: `**${(0, exports.clip)((0, exports.plain)(p.subject), 200)}**\n${(0, exports.clip)((0, exports.plain)(p.reason), 3000)}`, color: PRIORITY_COLOR[String(p.priority)] ?? exports.COLORS.danger, fields: [{ name: 'Priorität', value: (0, exports.label)(p.priority), inline: true }] };
        case 'announcement':
            return { title: '📢 Ankündigung', description: (0, exports.clip)((0, exports.plain)(p.body), 4000), color: exports.COLORS.warning, footer: `von ${(0, exports.clip)(p.author, 100)}` };
        case 'danger.changed': {
            const d = exports.DANGER[String(p.level)] ?? exports.DANGER.GREEN;
            return { title: `${d.emoji} Gefahrenstatus: ${d.label}`, description: p.reason ? (0, exports.clip)((0, exports.plain)(p.reason), 1000) : undefined, color: d.color, fields: [{ name: 'Vorher', value: (exports.DANGER[String(p.previous)]?.label) ?? '—', inline: true }, { name: 'Gesetzt von', value: (0, exports.clip)((0, exports.plain)(p.setBy ?? 'System'), 200), inline: true }] };
        }
        case 'application.submitted':
            return { title: `📋 Neue Bewerbung ${p.number}`, color: exports.COLORS.info, description: 'Prüfung und Entscheidung im System (Bereich *Applications*).', fields: [
                    { name: 'Roblox-Name', value: (0, exports.clip)((0, exports.plain)(p.robloxUsername), 200), inline: true }, { name: 'Quelle', value: p.source === 'DISCORD' ? 'Discord' : 'Web', inline: true },
                    ...(p.discordId ? [{ name: 'Discord', value: `<@${String(p.discordId)}>`, inline: true }] : [])
                ] };
        case 'sek.report':
            return { title: `🎯 SEK-Einsatzbericht ${p.number}`, color: exports.COLORS.neutral, description: (0, exports.clip)((0, exports.plain)(p.description), 3500), fields: [
                    { name: 'Einsatzart', value: (0, exports.clip)((0, exports.plain)(p.missionType), 200), inline: true }, { name: 'Datum', value: new Date(String(p.occurredAt)).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }), inline: true }, { name: 'Beamter', value: (0, exports.clip)((0, exports.plain)(p.author), 200), inline: true }
                ] };
        case 'sek.application':
            return { title: `🎯 Neue SEK-Bewerbung ${p.number}`, color: exports.COLORS.neutral, description: 'Entscheidung im System (Bereich *SEK*).', fields: [
                    { name: 'Bewerber', value: (0, exports.clip)(`${p.callsign ? `${(0, exports.plain)(p.callsign)} · ` : ''}${(0, exports.plain)(p.applicant)}${p.discordId ? ` (<@${String(p.discordId)}>)` : ''}`, 300), inline: true },
                    { name: 'Dienstzeit', value: (0, exports.clip)((0, exports.plain)(p.serviceTime), 200), inline: true },
                    { name: 'Motivation', value: (0, exports.clip)((0, exports.plain)(p.motivation), 1024) },
                    ...(p.experience ? [{ name: 'Erfahrung', value: (0, exports.clip)((0, exports.plain)(p.experience), 1024) }] : [])
                ] };
        default:
            return null;
    }
}
/** Direktnachricht nach der Entscheidung über eine SEK-Bewerbung. */
function sekDecisionText(p) {
    return p.status === 'ACCEPTED'
        ? `🎯 Deine SEK-Bewerbung **${p.number}** wurde **angenommen** – willkommen im SEK!`
        : `Deine SEK-Bewerbung **${p.number}** wurde diesmal leider **nicht angenommen**.`;
}
/** Texte der Entscheidungs-Direktnachricht an Bewerber (ohne internen Grund). */
function applicationDecisionText(p) {
    return p.status === 'ACCEPTED'
        ? `🎉 Deine Bewerbung **${p.number}** bei EN Polizei wurde **angenommen**! Ein Teammitglied meldet sich bei dir für die nächsten Schritte.`
        : `Deine Bewerbung **${p.number}** bei EN Polizei wurde diesmal leider **nicht angenommen**. Du kannst dich gerne später erneut bewerben.`;
}
// ---- Gefahrenstatus ----
exports.DANGER = {
    GREEN: { label: 'Grün – Normaler Dienst', emoji: '🟢', color: 0x2ecc71 },
    YELLOW: { label: 'Gelb – Erhöhte Vorsicht', emoji: '🟡', color: 0xf1c40f },
    RED: { label: 'Rot – Akute Gefahrenlage', emoji: '🔴', color: 0xe74c3c },
};
function dangerEmbed(s) {
    const d = exports.DANGER[s.level] ?? exports.DANGER.GREEN;
    return { title: `${d.emoji} Aktueller Gefahrenstatus: ${d.label}`, color: d.color, description: s.reason ? (0, exports.clip)((0, exports.plain)(s.reason), 1000) : undefined,
        fields: [...(s.setByName ? [{ name: 'Gesetzt von', value: (0, exports.clip)((0, exports.plain)(s.setByName), 200), inline: true }] : []), ...(s.at ? [{ name: 'Seit', value: `<t:${Math.floor(new Date(s.at).getTime() / 1000)}:R>`, inline: true }] : [])],
        footer: 'Buttons: Status ändern (nur mit Berechtigung)' };
}
exports.DANGER_BUTTONS = [
    { id: 'danger:set:GREEN', label: 'Grün', emoji: '🟢', style: 'success' }, { id: 'danger:set:YELLOW', label: 'Gelb', emoji: '🟡', style: 'primary' }, { id: 'danger:set:RED', label: 'Rot', emoji: '🔴', style: 'danger' },
];
const DUTY_EMOJI = { ON_DUTY: '🟢', BREAK: '🟡', TRAINING: '🔵', ADMINISTRATIVE: '🔵', OFF_DUTY: '⚪' };
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