import { clip, COLORS, errorReply, okReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

/**
 * CAD im Discord: `/cad status|funk|einsaetze` und die Buttons unter Notruf-Meldungen.
 * Alles läuft mit den Rechten des verknüpften Benutzers; vom SEK/K9-Server nur, was die Server-Verbindung freigibt.
 */
interface CadOption { key: string; label: string; emoji?: string }
interface CadConfig { unitStatuses: CadOption[]; incidentStatuses: (CadOption & { closed?: boolean })[]; priorities: CadOption[] }
interface CadUnit { id: string; callsign: string; name: string | null; status: string; operational: boolean; crew: { discordId: string | null }[]; current: { number: string } | null }
interface CadIncident { id: string; number: string; title: string; priority: string; status: string; location: string | null; units: { clearedAt: string | null; unit: { callsign: string } }[] }

const lbl = (list: CadOption[], key: string) => { const o = list.find((x) => x.key === key); return o ? `${o.emoji ? `${o.emoji} ` : ''}${o.label}` : key; };
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');
const config = (c: Ctx) => c.api.asUser<CadConfig>(c.discordId, 'GET', '/cad/config');

async function myUnit(c: Ctx, callsign?: string): Promise<CadUnit | null> {
  const units = await c.api.asUser<CadUnit[]>(c.discordId, 'GET', '/cad/units');
  if (callsign) return units.find((u) => norm(u.callsign) === norm(callsign)) ?? null;
  return units.find((u) => u.crew.some((m) => m.discordId === c.discordId)) ?? null;
}

export const CAD_COMMANDS: CommandDef[] = [{
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
    { name: 'einsaetze', description: 'Aktive Einsätze der Leitstelle' },
  ],
  async run(c): Promise<Reply> {
    try {
      const sub = String(c.opts._sub ?? '');
      if (sub === 'status') {
        const cfg = await config(c);
        const want = String(c.opts.status ?? '');
        const st = cfg.unitStatuses.find((s) => norm(s.key) === norm(want) || norm(s.label) === norm(want));
        if (!st) return errorReply(`Unbekannter Status. Möglich: ${cfg.unitStatuses.map((s) => `\`${s.label}\``).join(', ')}`);
        const unit = await myUnit(c, c.opts.einheit ? String(c.opts.einheit) : undefined);
        if (!unit) return errorReply(c.opts.einheit ? 'Diese Einheit gibt es nicht.' : 'Du bist keiner Einheit zugeordnet. Gib den Rufnamen mit `einheit:` an.');
        await c.api.asUser(c.discordId, 'POST', `/cad/units/${unit.id}/status`, { status: st.key });
        return okReply(`**${plain(unit.callsign)}** ist jetzt ${lbl(cfg.unitStatuses, st.key)}.`);
      }
      if (sub === 'funk') {
        const r = await c.api.asUser<{ callsign: string | null; incidentNumber: string | null }>(c.discordId, 'POST', '/cad/radio', { text: String(c.opts.text ?? ''), ...(c.opts.einsatz ? { incidentNumber: String(c.opts.einsatz) } : {}) });
        return okReply(`📻 ${r.callsign ? `**${plain(r.callsign)}**: ` : ''}„${plain(c.opts.text)}“ gesendet${r.incidentNumber ? ` – Einsatz **${plain(r.incidentNumber)}**` : ''}.`);
      }
      if (sub === 'einsaetze') {
        const [cfg, list] = await Promise.all([config(c), c.api.asUser<CadIncident[]>(c.discordId, 'GET', '/cad/incidents?active=true&take=20')]);
        const lines = list.map((i) => `**${plain(i.number)}** · ${clip(plain(i.title), 80)} — ${lbl(cfg.priorities, i.priority)} / ${lbl(cfg.incidentStatuses, i.status)}${i.location ? ` · ${clip(plain(i.location), 60)}` : ''}${i.units.filter((u) => !u.clearedAt).length ? `\n   ↳ ${i.units.filter((u) => !u.clearedAt).map((u) => plain(u.unit.callsign)).join(', ')}` : ''}`);
        return { ephemeral: true, embeds: [{ title: `🚨 Aktive Einsätze (${list.length})`, description: clip(lines.join('\n') || 'Keine aktiven Einsätze.', 4000), color: COLORS.info }] };
      }
      return errorReply('Unbekannter Unterbefehl.');
    } catch (e) { return mapError(e); }
  },
}];

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
    case 'cad.call.received':
      return { title: clip(`🚨 NOTRUF #${String(p.callNumber ?? '?')}`, 256), color: COLORS.danger, description: p.description ? clip(plain(p.description), 1500) : undefined,
        fields: [...f('Ort', p.location), ...f('Team', p.team), ...(p.startedAt ? [{ name: 'Zeit', value: `<t:${Math.floor(Date.parse(String(p.startedAt)) / 1000)}:t>`, inline: true }] : []), { name: 'Status', value: 'Offen', inline: true }, ...f('Server', p.server)] };
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
  if (type.startsWith('cad.incident.')) return link.length ? link : undefined;
  return undefined;
}
