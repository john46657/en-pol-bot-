"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAD_INTERACTION = exports.CAD_COMMANDS = void 0;
exports.renderCadOutbox = renderCadOutbox;
exports.cadButtons = cadButtons;
const format_1 = require("../format");
const errors_1 = require("./errors");
const shared_1 = require("@enrp/shared");
const lbl = (list, key) => { const o = list.find((x) => x.key === key); return o ? `${o.emoji ? `${o.emoji} ` : ''}${o.label}` : key; };
const norm = (s) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');
const config = (c) => c.api.asUser(c.discordId, 'GET', '/cad/config');
async function myUnit(c, callsign) {
    const units = await c.api.asUser(c.discordId, 'GET', '/cad/units');
    if (callsign)
        return units.find((u) => norm(u.callsign) === norm(callsign)) ?? null;
    return units.find((u) => u.crew.some((m) => m.discordId === c.discordId)) ?? null;
}
exports.CAD_COMMANDS = [{
        name: 'cad', description: 'CAD-Leitstelle: Einheitenstatus, Funkmeldung, aktive Einsätze',
        subcommands: [
            { name: 'status', description: 'Status deiner Einheit an die Leitstelle melden', options: [
                    { name: 'status', description: 'z. B. Verfügbar, Unterwegs, Am Einsatzort', type: 'string', required: true, maxLength: 40 },
                    { name: 'einheit', description: 'Rufname (leer = deine Einheit)', type: 'string', maxLength: 16 },
                ] },
            { name: 'funk', description: 'Funkmeldung an die Leitstelle (landet in der Einsatzchronik)', options: [
                    { name: 'text', description: 'z. B. „Am Einsatzort.“', type: 'string', required: true, maxLength: 500 },
                    { name: 'einsatz', description: 'Einsatznummer (leer = aktueller Einsatz deiner Einheit)', type: 'string', maxLength: 32 },
                ] },
            { name: 'rueckmeldung', description: 'Rückmeldung deiner Einheit zum Einsatz an die Leitstelle (Chronik)', options: [
                    { name: 'art', description: 'Was meldest du?', type: 'string', required: true, choices: shared_1.CAD_FEEDBACK.map((x) => ({ name: x.label, value: x.key })) },
                    { name: 'notiz', description: 'Zusatz, z. B. „2 Verdächtige flüchtig Richtung Norden“', type: 'string', maxLength: 500 },
                    { name: 'einheit', description: 'Rufname (leer = deine Einheit)', type: 'string', maxLength: 16 },
                ] },
            { name: 'einsaetze', description: 'Aktive Einsätze der Leitstelle' },
            { name: 'fahrzeuge', description: 'Gerade in ER:LC gemeldete Polizeifahrzeuge (Besitzer, Einheit)' },
        ],
        async run(c) {
            try {
                const sub = String(c.opts._sub ?? '');
                if (sub === 'status') {
                    const cfg = await config(c);
                    const want = String(c.opts.status ?? '');
                    const st = cfg.unitStatuses.find((s) => norm(s.key) === norm(want) || norm(s.label) === norm(want));
                    if (!st)
                        return (0, format_1.errorReply)(`Unbekannter Status. Möglich: ${cfg.unitStatuses.map((s) => `\`${s.label}\``).join(', ')}`);
                    const unit = await myUnit(c, c.opts.einheit ? String(c.opts.einheit) : undefined);
                    if (!unit)
                        return (0, format_1.errorReply)(c.opts.einheit ? 'Diese Einheit gibt es nicht.' : 'Du bist keiner Einheit zugeordnet. Gib den Rufnamen mit `einheit:` an.');
                    await c.api.asUser(c.discordId, 'POST', `/cad/units/${unit.id}/status`, { status: st.key });
                    return (0, format_1.okReply)(`**${(0, format_1.plain)(unit.callsign)}** ist jetzt ${lbl(cfg.unitStatuses, st.key)}.`);
                }
                if (sub === 'rueckmeldung') {
                    const unit = await myUnit(c, c.opts.einheit ? String(c.opts.einheit) : undefined);
                    if (!unit)
                        return (0, format_1.errorReply)(c.opts.einheit ? 'Diese Einheit gibt es nicht.' : 'Du bist keiner Einheit zugeordnet. Gib den Rufnamen mit `einheit:` an.');
                    const r = await c.api.asUser(c.discordId, 'POST', `/cad/units/${unit.id}/feedback`, { kind: String(c.opts.art ?? ''), ...(c.opts.notiz ? { note: String(c.opts.notiz) } : {}) });
                    const fb = shared_1.CAD_FEEDBACK.find((x) => x.key === c.opts.art);
                    return (0, format_1.okReply)(`${fb ? `${fb.emoji} ${fb.label}` : 'Rückmeldung'} – **${(0, format_1.plain)(r.callsign)}** · Einsatz **${(0, format_1.plain)(r.number)}** an die Leitstelle gemeldet.`);
                }
                if (sub === 'funk') {
                    const r = await c.api.asUser(c.discordId, 'POST', '/cad/radio', { text: String(c.opts.text ?? ''), ...(c.opts.einsatz ? { incidentNumber: String(c.opts.einsatz) } : {}) });
                    return (0, format_1.okReply)(`📻 ${r.callsign ? `**${(0, format_1.plain)(r.callsign)}**: ` : ''}„${(0, format_1.plain)(c.opts.text)}“ gesendet${r.incidentNumber ? ` – Einsatz **${(0, format_1.plain)(r.incidentNumber)}**` : ''}.`);
                }
                if (sub === 'einsaetze') {
                    const [cfg, list] = await Promise.all([config(c), c.api.asUser(c.discordId, 'GET', '/cad/incidents?active=true&take=20')]);
                    const lines = list.map((i) => `**${(0, format_1.plain)(i.number)}** · ${(0, format_1.clip)((0, format_1.plain)(i.title), 80)} — ${lbl(cfg.priorities, i.priority)} / ${lbl(cfg.incidentStatuses, i.status)}${i.location ? ` · ${(0, format_1.clip)((0, format_1.plain)(i.location), 60)}` : ''}${i.units.filter((u) => !u.clearedAt).length ? `\n   ↳ ${i.units.filter((u) => !u.clearedAt).map((u) => (0, format_1.plain)(u.unit.callsign)).join(', ')}` : ''}`);
                    return { ephemeral: true, embeds: [{ title: `🚨 Aktive Einsätze (${list.length})`, description: (0, format_1.clip)(lines.join('\n') || 'Keine aktiven Einsätze.', 4000), color: format_1.COLORS.info }] };
                }
                if (sub === 'fahrzeuge') {
                    const r = await c.api.asUser(c.discordId, 'GET', '/fleet/vehicles');
                    // ER:LC meldet keinen Fahrer und keine Fahrzeugposition – nur, wer das Fahrzeug gespawnt hat
                    const lines = r.items.slice(0, 30).map((v) => `🚓 **${(0, format_1.clip)((0, format_1.plain)(v.api.name), 60)}**${v.api.plate ? ` · ${(0, format_1.plain)(v.api.plate)}` : ''}${v.internal.internalCode ? ` · ${(0, format_1.plain)(v.internal.internalCode)}` : ''}\n   ↳ Besitzer ${(0, format_1.plain)(v.api.owner)}${v.ownerOnline ? '' : ' (nicht im Spiel)'}${v.internal.unit ? ` · Einheit ${(0, format_1.plain)(v.internal.unit.callsign)}` : ''}${v.stale ? ' · ⚠️ veraltet' : ''}`);
                    return { ephemeral: true, embeds: [{ title: `🚓 Polizeifahrzeuge (${r.items.length})`, description: (0, format_1.clip)(lines.join('\n') || 'Gerade meldet ER:LC keine Polizeifahrzeuge.', 4000), color: format_1.COLORS.info, footer: 'Fahrer: nicht verfügbar – ER:LC meldet nur den Besitzer.' }] };
                }
                return (0, format_1.errorReply)('Unbekannter Unterbefehl.');
            }
            catch (e) {
                return (0, errors_1.mapError)(e);
            }
        },
    }];
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
    if (type.startsWith('cad.incident.')) {
        const map = type === 'cad.incident.created' && typeof p.mapUrl === 'string' && /^https?:\/\//.test(p.mapUrl) ? [{ id: 'map', label: 'Auf Karte anzeigen', style: 'secondary', url: p.mapUrl }] : [];
        return link.length || map.length ? [...link, ...map] : undefined;
    }
    return undefined;
}
//# sourceMappingURL=cad.js.map