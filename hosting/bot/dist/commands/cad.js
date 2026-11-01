"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAD_INTERACTION = void 0;
exports.renderCadOutbox = renderCadOutbox;
exports.cadButtons = cadButtons;
const format_1 = require("../format");
const errors_1 = require("./errors");
/** Buttons unter „Notruf eingegangen“: `cad:call:<id>:claim|incident|close|units`, Auswahl `cad:assign:<id>`. */
exports.CAD_INTERACTION = {
    prefix: 'cad',
    async run(c) {
        const [kind, id, action] = c.args;
        if (!id || !/^[0-9a-f-]{36}$/.test(id))
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        try {
            if (kind === 'call') {
                if (action === 'claim') {
                    await c.api.asUser(c.discordId, 'POST', `/cad/calls/${id}/claim`);
                    return (0, format_1.okReply)('Notruf übernommen.');
                }
                if (action === 'close') {
                    await c.api.asUser(c.discordId, 'POST', `/cad/calls/${id}/close`);
                    return (0, format_1.okReply)('Notruf geschlossen.');
                }
                if (action === 'incident') {
                    const r = await c.api.asUser(c.discordId, 'POST', `/cad/calls/${id}/incident`, {});
                    return (0, format_1.okReply)(`Einsatz **${(0, format_1.plain)(r.number)}** aus dem Notruf erstellt.`);
                }
                if (action === 'units') {
                    const units = (await c.api.asUser(c.discordId, 'GET', '/cad/units')).filter((u) => u.operational && !['OFF_DUTY', 'UNAVAILABLE'].includes(u.status));
                    if (!units.length)
                        return (0, format_1.errorReply)('Gerade ist keine Einheit verfügbar.');
                    return { ephemeral: true, content: 'Welche Einheit soll den Notruf übernehmen?', select: { id: `cad:assign:${id}`, placeholder: 'Einheit wählen …', options: units.slice(0, 25).map((u) => ({ label: (0, format_1.clip)(u.callsign, 100), value: u.id, ...(u.current ? { description: (0, format_1.clip)(`im Einsatz ${u.current.number}`, 100) } : u.name ? { description: (0, format_1.clip)(u.name, 100) } : {}) })) } };
                }
            }
            if (kind === 'assign') {
                const unitId = c.values?.[0];
                if (!unitId)
                    return (0, format_1.errorReply)('Keine Einheit gewählt.');
                await c.api.asUser(c.discordId, 'POST', `/cad/calls/${id}/assign`, { unitId });
                return (0, format_1.okReply)('Einheit zugewiesen – der Einsatz steht im CAD.');
            }
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
    },
};
// ---- Meldungen aus dem CAD (Outbox) ----
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : undefined);
const f = (name, value, inline = true) => (value === null || value === undefined || value === '' ? [] : [{ name, value: (0, format_1.clip)((0, format_1.plain)(value), 1024), inline }]);
function renderCadOutbox(type, p) {
    const head = `${p.number ? `${String(p.number)} · ` : ''}${(0, format_1.clip)((0, format_1.plain)(p.title ?? ''), 180)}`;
    const base = [...f('Stichwort', p.keyword), ...f('Einsatzart', p.type), ...f('Priorität', p.priority), ...f('Status', p.status), ...f('Ort', p.location)];
    switch (type) {
        case 'cad.incident.created':
            return { title: (0, format_1.clip)(`🚨 Neuer Einsatz: ${head}`, 256), color: hex(p.priorityColor) ?? format_1.COLORS.danger, description: p.description ? (0, format_1.clip)((0, format_1.plain)(p.description), 1500) : undefined, fields: base };
        case 'cad.incident.status':
            return { title: (0, format_1.clip)(`🔄 ${head}`, 256), color: hex(p.priorityColor) ?? format_1.COLORS.info, description: `Status: **${(0, format_1.plain)(p.previous ?? '—')}** → **${(0, format_1.plain)(p.status)}**${p.note ? `\n${(0, format_1.clip)((0, format_1.plain)(p.note), 500)}` : ''}`, fields: [...f('Ort', p.location)] };
        case 'cad.incident.assigned':
            return { title: (0, format_1.clip)(`📻 ${(0, format_1.plain)(p.callsign)} → ${head}`, 256), color: hex(p.priorityColor) ?? format_1.COLORS.warning, description: p.unitRoleId ? `<@&${String(p.unitRoleId)}>` : undefined, fields: base };
        case 'cad.incident.closed':
            return { title: (0, format_1.clip)(`✅ Einsatz abgeschlossen: ${head}`, 256), color: format_1.COLORS.success, fields: [...f('Status', p.status), ...f('Ort', p.location)] };
        case 'cad.incident.feedback':
            return { title: (0, format_1.clip)(`📟 ${(0, format_1.plain)(p.callsign)}: ${(0, format_1.plain)(p.feedback)}`, 256), color: format_1.COLORS.info, description: (0, format_1.clip)(`**${head}**${p.note ? `\n${(0, format_1.clip)((0, format_1.plain)(p.note), 500)}` : ''}`, 1500), fields: [...f('Ort', p.location)] };
        case 'cad.incident.support':
            return { title: (0, format_1.clip)(`🆘 Unterstützung benötigt: ${(0, format_1.plain)(p.callsign)}`, 256), color: format_1.COLORS.danger, description: (0, format_1.clip)(`**${head}**${p.note ? `\n${(0, format_1.clip)((0, format_1.plain)(p.note), 500)}` : ''}`, 1500), fields: [...f('Priorität', p.priority), ...f('Ort', p.location)] };
        case 'cad.handover': {
            const list = Array.isArray(p.incidents) ? p.incidents.map((x) => `• ${(0, format_1.plain)(x)}`).join('\n') : '';
            return { title: '🔁 Schichtübergabe der Leitstelle', color: format_1.COLORS.info, description: (0, format_1.clip)(`${p.notes ? `${(0, format_1.plain)(p.notes)}\n\n` : ''}${list ? `**Offene Einsätze**\n${list}` : 'Keine offenen Einsätze.'}`, 4000),
                fields: [...f('Offene Einsätze', p.openIncidents), ...f('Einheiten im Einsatz', p.activeUnits), ...f('Offene Notrufe', p.openCalls)], ...(p.by ? { footer: `von ${(0, format_1.clip)(String(p.by), 100)}` } : {}) };
        }
        case 'cad.call.received':
            return { title: (0, format_1.clip)(`🚨 NOTRUF #${String(p.callNumber ?? '?')}`, 256), color: format_1.COLORS.danger, description: p.description ? (0, format_1.clip)((0, format_1.plain)(p.description), 1500) : undefined,
                fields: [...f('Ort', p.location), ...f('Team', p.team), ...(p.startedAt ? [{ name: 'Zeit', value: `<t:${Math.floor(Date.parse(String(p.startedAt)) / 1000)}:t>`, inline: true }] : []), { name: 'Status', value: 'Offen', inline: true }, ...f('Server', p.server)] };
        case 'cad.wanted.hit':
        case 'cad.wanted.possible': {
            // Nur das Nötigste – keine Beschreibung, keine Personalien. Bestätigt nur bei gleicher Roblox-ID.
            const confirmed = type === 'cad.wanted.hit' && p.identified === true;
            return { title: confirmed ? '🚨 FAHNDUNGSTREFFER' : '⚠️ MÖGLICHER FAHNDUNGSTREFFER', color: confirmed ? format_1.COLORS.danger : format_1.COLORS.warning,
                fields: [{ name: 'Spieler', value: (0, format_1.clip)((0, format_1.plain)(p.playerName), 256), inline: true }, { name: 'Identifikator', value: p.robloxUserId ? `Roblox-ID ${(0, format_1.plain)(p.robloxUserId)}` : 'keine ID von ER:LC geliefert', inline: true },
                    ...f('Fahndung', p.wantedNumber), { name: 'Grund', value: (0, format_1.clip)((0, format_1.plain)(p.reason), 1024), inline: false }, ...f('Priorität', p.priority),
                    ...(p.detectedAt ? [{ name: 'Erkannt am', value: `<t:${Math.floor(Date.parse(String(p.detectedAt)) / 1000)}:f>`, inline: true }] : []),
                    { name: 'Identifikation', value: confirmed ? 'Bestätigt (Roblox-ID stimmt überein)' : `Manuelle Prüfung erforderlich${p.matchLabel ? ` – ${(0, format_1.plain)(p.matchLabel)}` : ''}`, inline: false }, ...f('Server', p.server)],
                footer: 'Nur zur Information – keine automatischen Maßnahmen im Spiel.' };
        }
        case 'cad.wanted.erlc':
            // Im Spiel gesucht (ER:LC-Wanted-Sterne): Roblox-ID kommt direkt von der API, keine eigene Fahndung nötig
            return { title: '🚨 IM SPIEL GESUCHT', color: format_1.COLORS.danger,
                fields: [{ name: 'Spieler', value: (0, format_1.clip)((0, format_1.plain)(p.playerName), 256), inline: true }, { name: 'Identifikator', value: p.robloxUserId ? `Roblox-ID ${(0, format_1.plain)(p.robloxUserId)}` : 'keine ID von ER:LC geliefert', inline: true },
                    { name: 'Grund', value: (0, format_1.clip)((0, format_1.plain)(p.reason), 1024), inline: false }, ...f('Priorität', p.priority),
                    ...(p.detectedAt ? [{ name: 'Erkannt am', value: `<t:${Math.floor(Date.parse(String(p.detectedAt)) / 1000)}:f>`, inline: true }] : []), ...f('Server', p.server)],
                footer: 'Nur zur Information – keine automatischen Maßnahmen im Spiel.' };
        case 'cad.announcement':
            return { title: '📢 Leitstellenmeldung', description: (0, format_1.clip)((0, format_1.plain)(p.text), 4000), color: format_1.COLORS.warning, ...(p.from ? { footer: `von ${(0, format_1.clip)(String(p.from), 100)}` } : {}) };
        case 'cad.radio':
            return { title: (0, format_1.clip)(`📻 ${(0, format_1.plain)(p.callsign ?? 'Funk')}${p.incidentNumber ? ` · ${String(p.incidentNumber)}` : ''}`, 256), description: `„${(0, format_1.clip)((0, format_1.plain)(p.text), 1500)}“`, color: format_1.COLORS.neutral };
        default:
            return null;
    }
}
function cadButtons(type, p) {
    const link = typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im CAD öffnen', style: 'secondary', url: p.dashboardUrl }] : [];
    if (type === 'cad.call.received' && typeof p.id === 'string')
        return [
            { id: `cad:call:${p.id}:claim`, label: 'Übernehmen', style: 'primary', emoji: '✋' },
            { id: `cad:call:${p.id}:incident`, label: 'Einsatz erstellen', style: 'success', emoji: '🚨' },
            { id: `cad:call:${p.id}:units`, label: 'Einheit zuweisen', style: 'secondary', emoji: '🚓' },
            { id: `cad:call:${p.id}:close`, label: 'Schließen', style: 'danger', emoji: '✖️' },
            ...(typeof p.mapUrl === 'string' && /^https?:\/\//.test(p.mapUrl) ? [{ id: 'map', label: 'Auf Karte anzeigen', style: 'secondary', url: p.mapUrl }] : []),
        ];
    if (type === 'cad.handover')
        return link.length ? link : undefined;
    if (type === 'cad.wanted.hit' || type === 'cad.wanted.possible' || type === 'cad.wanted.erlc')
        return typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im Dashboard öffnen', style: 'secondary', url: p.dashboardUrl }] : undefined;
    if (type.startsWith('cad.incident.')) {
        const map = type === 'cad.incident.created' && typeof p.mapUrl === 'string' && /^https?:\/\//.test(p.mapUrl) ? [{ id: 'map', label: 'Auf Karte anzeigen', style: 'secondary', url: p.mapUrl }] : [];
        return link.length || map.length ? [...link, ...map] : undefined;
    }
    return undefined;
}
//# sourceMappingURL=cad.js.map