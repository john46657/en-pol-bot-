import { clip, COLORS, errorReply, okReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import type { InteractionDef } from './types';
import { mapError } from './errors';

/**
 * CAD im Discord: die Buttons unter Notruf-Meldungen und die Meldungen aus dem CAD.
 * Alles läuft mit den Rechten des verknüpften Benutzers; vom SEK/K9-Server nur, was die Server-Verbindung freigibt.
 */
interface CadUnit { id: string; callsign: string; name: string | null; status: string; operational: boolean; crew: { discordId: string | null }[]; current: { number: string } | null }

/** Buttons unter „Notruf eingegangen“: `cad:call:<id>:claim|incident|close|units`, Auswahl `cad:assign:<id>`. */
export const CAD_INTERACTION: InteractionDef = {
  prefix: 'cad',
  async run(c): Promise<Reply> {
    const [kind, id, action] = c.args;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return errorReply('Unbekannte Aktion.');
    try {
      if (kind === 'call') {
        if (action === 'claim') { await c.api.asUser(c.discordId, 'POST', `/cad/calls/${id}/claim`); return okReply('Notruf übernommen.'); }
        if (action === 'close') { await c.api.asUser(c.discordId, 'POST', `/cad/calls/${id}/close`); return okReply('Notruf geschlossen.'); }
        if (action === 'incident') { const r = await c.api.asUser<{ number: string }>(c.discordId, 'POST', `/cad/calls/${id}/incident`, {}); return okReply(`Einsatz **${plain(r.number)}** aus dem Notruf erstellt.`); }
        if (action === 'units') {
          const units = (await c.api.asUser<CadUnit[]>(c.discordId, 'GET', '/cad/units')).filter((u) => u.operational && !['OFF_DUTY', 'UNAVAILABLE'].includes(u.status));
          if (!units.length) return errorReply('Gerade ist keine Einheit verfügbar.');
          return { ephemeral: true, content: 'Welche Einheit soll den Notruf übernehmen?', select: { id: `cad:assign:${id}`, placeholder: 'Einheit wählen …', options: units.slice(0, 25).map((u) => ({ label: clip(u.callsign, 100), value: u.id, ...(u.current ? { description: clip(`im Einsatz ${u.current.number}`, 100) } : u.name ? { description: clip(u.name, 100) } : {}) })) } };
        }
      }
      if (kind === 'assign') {
        const unitId = c.values?.[0];
        if (!unitId) return errorReply('Keine Einheit gewählt.');
        await c.api.asUser(c.discordId, 'POST', `/cad/calls/${id}/assign`, { unitId });
        return okReply('Einheit zugewiesen – der Einsatz steht im CAD.');
      }
      return errorReply('Unbekannte Aktion.');
    } catch (e) { return mapError(e); }
  },
};

// ---- Meldungen aus dem CAD (Outbox) ----
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : undefined);
const f = (name: string, value: unknown, inline = true) => (value === null || value === undefined || value === '' ? [] : [{ name, value: clip(plain(value), 1024), inline }]);

export function renderCadOutbox(type: string, p: Record<string, unknown>): EmbedData | null {
  const head = `${p.number ? `${String(p.number)} · ` : ''}${clip(plain(p.title ?? ''), 180)}`;
  const base = [...f('Stichwort', p.keyword), ...f('Einsatzart', p.type), ...f('Priorität', p.priority), ...f('Status', p.status), ...f('Ort', p.location)];
  switch (type) {
    case 'cad.incident.created':
      return { title: clip(`🚨 Neuer Einsatz: ${head}`, 256), color: hex(p.priorityColor) ?? COLORS.danger, description: p.description ? clip(plain(p.description), 1500) : undefined, fields: base };
    case 'cad.incident.status':
      return { title: clip(`🔄 ${head}`, 256), color: hex(p.priorityColor) ?? COLORS.info, description: `Status: **${plain(p.previous ?? '—')}** → **${plain(p.status)}**${p.note ? `\n${clip(plain(p.note), 500)}` : ''}`, fields: [...f('Ort', p.location)] };
    case 'cad.incident.assigned':
      return { title: clip(`📻 ${plain(p.callsign)} → ${head}`, 256), color: hex(p.priorityColor) ?? COLORS.warning, description: p.unitRoleId ? `<@&${String(p.unitRoleId)}>` : undefined, fields: base };
    case 'cad.incident.closed':
      return { title: clip(`✅ Einsatz abgeschlossen: ${head}`, 256), color: COLORS.success, fields: [...f('Status', p.status), ...f('Ort', p.location)] };
    case 'cad.incident.feedback':
      return { title: clip(`📟 ${plain(p.callsign)}: ${plain(p.feedback)}`, 256), color: COLORS.info, description: clip(`**${head}**${p.note ? `\n${clip(plain(p.note), 500)}` : ''}`, 1500), fields: [...f('Ort', p.location)] };
    case 'cad.incident.support':
      return { title: clip(`🆘 Unterstützung benötigt: ${plain(p.callsign)}`, 256), color: COLORS.danger, description: clip(`**${head}**${p.note ? `\n${clip(plain(p.note), 500)}` : ''}`, 1500), fields: [...f('Priorität', p.priority), ...f('Ort', p.location)] };
    case 'cad.handover': {
      const list = Array.isArray(p.incidents) ? p.incidents.map((x) => `• ${plain(x)}`).join('\n') : '';
      return { title: '🔁 Schichtübergabe der Leitstelle', color: COLORS.info, description: clip(`${p.notes ? `${plain(p.notes)}\n\n` : ''}${list ? `**Offene Einsätze**\n${list}` : 'Keine offenen Einsätze.'}`, 4000),
        fields: [...f('Offene Einsätze', p.openIncidents), ...f('Einheiten im Einsatz', p.activeUnits), ...f('Offene Notrufe', p.openCalls)], ...(p.by ? { footer: `von ${clip(String(p.by), 100)}` } : {}) };
    }
    case 'cad.call.received':
      return { title: clip(`🚨 NOTRUF #${String(p.callNumber ?? '?')}`, 256), color: COLORS.danger, description: p.description ? clip(plain(p.description), 1500) : undefined,
        fields: [...f('Ort', p.location), ...f('Team', p.team), ...(p.startedAt ? [{ name: 'Zeit', value: `<t:${Math.floor(Date.parse(String(p.startedAt)) / 1000)}:t>`, inline: true }] : []), { name: 'Status', value: 'Offen', inline: true }, ...f('Server', p.server)] };
    case 'cad.wanted.hit':
    case 'cad.wanted.possible': {
      // Nur das Nötigste – keine Beschreibung, keine Personalien. Bestätigt nur bei gleicher Roblox-ID.
      const confirmed = type === 'cad.wanted.hit' && p.identified === true;
      return { title: confirmed ? '🚨 FAHNDUNGSTREFFER' : '⚠️ MÖGLICHER FAHNDUNGSTREFFER', color: confirmed ? COLORS.danger : COLORS.warning,
        fields: [{ name: 'Spieler', value: clip(plain(p.playerName), 256), inline: true }, { name: 'Identifikator', value: p.robloxUserId ? `Roblox-ID ${plain(p.robloxUserId)}` : 'keine ID von ER:LC geliefert', inline: true },
          ...f('Fahndung', p.wantedNumber), { name: 'Grund', value: clip(plain(p.reason), 1024), inline: false }, ...f('Priorität', p.priority),
          ...(p.detectedAt ? [{ name: 'Erkannt am', value: `<t:${Math.floor(Date.parse(String(p.detectedAt)) / 1000)}:f>`, inline: true }] : []),
          { name: 'Identifikation', value: confirmed ? 'Bestätigt (Roblox-ID stimmt überein)' : `Manuelle Prüfung erforderlich${p.matchLabel ? ` – ${plain(p.matchLabel)}` : ''}`, inline: false }, ...f('Server', p.server)],
        footer: 'Nur zur Information – keine automatischen Maßnahmen im Spiel.' };
    }
    case 'cad.wanted.erlc':
      // Im Spiel gesucht (ER:LC-Wanted-Sterne): Roblox-ID kommt direkt von der API, keine eigene Fahndung nötig
      return { title: '🚨 IM SPIEL GESUCHT', color: COLORS.danger,
        fields: [{ name: 'Spieler', value: clip(plain(p.playerName), 256), inline: true }, { name: 'Identifikator', value: p.robloxUserId ? `Roblox-ID ${plain(p.robloxUserId)}` : 'keine ID von ER:LC geliefert', inline: true },
          { name: 'Grund', value: clip(plain(p.reason), 1024), inline: false }, ...f('Priorität', p.priority),
          ...(p.detectedAt ? [{ name: 'Erkannt am', value: `<t:${Math.floor(Date.parse(String(p.detectedAt)) / 1000)}:f>`, inline: true }] : []), ...f('Server', p.server)],
        footer: 'Nur zur Information – keine automatischen Maßnahmen im Spiel.' };
    case 'cad.announcement':
      return { title: '📢 Leitstellenmeldung', description: clip(plain(p.text), 4000), color: COLORS.warning, ...(p.from ? { footer: `von ${clip(String(p.from), 100)}` } : {}) };
    case 'cad.radio':
      return { title: clip(`📻 ${plain(p.callsign ?? 'Funk')}${p.incidentNumber ? ` · ${String(p.incidentNumber)}` : ''}`, 256), description: `„${clip(plain(p.text), 1500)}“`, color: COLORS.neutral };
    default:
      return null;
  }
}

export function cadButtons(type: string, p: Record<string, unknown>): ButtonSpec[] | undefined {
  const link = typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im CAD öffnen', style: 'secondary' as const, url: p.dashboardUrl }] : [];
  if (type === 'cad.call.received' && typeof p.id === 'string') return [
    { id: `cad:call:${p.id}:claim`, label: 'Übernehmen', style: 'primary', emoji: '✋' },
    { id: `cad:call:${p.id}:incident`, label: 'Einsatz erstellen', style: 'success', emoji: '🚨' },
    { id: `cad:call:${p.id}:units`, label: 'Einheit zuweisen', style: 'secondary', emoji: '🚓' },
    { id: `cad:call:${p.id}:close`, label: 'Schließen', style: 'danger', emoji: '✖️' },
    ...(typeof p.mapUrl === 'string' && /^https?:\/\//.test(p.mapUrl) ? [{ id: 'map', label: 'Auf Karte anzeigen', style: 'secondary' as const, url: p.mapUrl }] : []),
  ];
  if (type === 'cad.handover') return link.length ? link : undefined;
  if (type === 'cad.wanted.hit' || type === 'cad.wanted.possible' || type === 'cad.wanted.erlc') return typeof p.dashboardUrl === 'string' && /^https?:\/\//.test(p.dashboardUrl) ? [{ id: 'link', label: 'Im Dashboard öffnen', style: 'secondary', url: p.dashboardUrl }] : undefined;
  if (type.startsWith('cad.incident.')) {
    const map = type === 'cad.incident.created' && typeof p.mapUrl === 'string' && /^https?:\/\//.test(p.mapUrl) ? [{ id: 'map', label: 'Auf Karte anzeigen', style: 'secondary' as const, url: p.mapUrl }] : [];
    return link.length || map.length ? [...link, ...map] : undefined;
  }
  return undefined;
}
