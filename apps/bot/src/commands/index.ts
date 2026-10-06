import { BotApiError } from '../api';
import { mapError } from './errors';
import { FEATURE_COMMANDS } from './features';
import { SEK_COMMANDS } from './sek';
import { QUALI_COMMANDS } from './qualifications';
import { clip, COLORS, EmbedData, errorReply, incidentLine, label, listEmbed, okReply, personEmbed, plain, Reply, Row, vehicleEmbed } from '../format';
import type { CommandDef, Ctx } from './types';

interface Page { items: Row[]; total: number }

interface HoursRow { name: string; callsign: string | null; minutes: number; byStatus: Record<string, number>; sessions: number }
/** Minuten → „3 h 05 min“. */
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

const q = (s: string) => encodeURIComponent(s.trim());
const str = (c: Ctx, k: string) => String(c.opts[k] ?? '').trim();

/** Findet genau eine Person per Roblox-Name (exakt, ohne Groß-/Kleinschreibung) oder Roblox-ID. */
async function resolvePerson(c: Ctx, term: string, opts: { create?: boolean } = {}): Promise<{ person?: Row; reply?: Reply; created?: boolean }> {
  const page = await c.api.asUser<Page>(c.discordId, 'GET', `/persons?q=${q(term)}&pageSize=10`);
  const exact = page.items.filter((p) => String(p.robloxUsername).toLowerCase() === term.toLowerCase() || p.robloxUserId === term);
  if (exact.length === 1) return { person: exact[0] };
  if (exact.length === 0 && page.items.length === 0) {
    // Unbekannte Person: bei Bedarf nach Roblox-Prüfung selbst anlegen (nur mit dem Recht dazu; Tippfehler fängt Roblox ab)
    if (opts.create && c.robloxLookup) {
      const u = await c.robloxLookup(term);
      if (!u) return { reply: errorReply(`Keine Person zu „${plain(term)}“ gefunden – und bei Roblox gibt es keinen Benutzer mit diesem Namen (oder Roblox ist gerade nicht erreichbar).`) };
      try {
        const created = await c.api.asUser<Row>(c.discordId, 'POST', '/persons', { robloxUsername: u.name, robloxUserId: String(u.id) });
        return { person: created, created: true };
      } catch (e) {
        if (e instanceof BotApiError && e.status === 403) return { reply: errorReply(`„${plain(u.name)}“ ist noch nicht im System, und dir fehlt das Recht, Personen anzulegen. Bitte lass die Person von jemandem mit Berechtigung anlegen.`) };
        throw e;
      }
    }
    return { reply: errorReply(`Keine Person zu „${plain(term)}“ gefunden.`) };
  }
  const names = (exact.length ? exact : page.items).slice(0, 8).map((p) => `${plain(p.robloxUsername)} (${p.robloxUserId ?? 'ohne ID'})`).join(', ');
  return { reply: errorReply(`Nicht eindeutig. Treffer: ${names}. Bitte exakten Namen oder die Roblox-ID angeben.`) };
}

const DUTY = { an: 'ON_DUTY', pause: 'BREAK', training: 'TRAINING', verwaltung: 'ADMINISTRATIVE', aus: 'OFF_DUTY' } as const;
const UNIT = { verfuegbar: 'AVAILABLE', beschaeftigt: 'BUSY', unterwegs: 'EN_ROUTE', vor_ort: 'ON_SCENE', nicht_verfuegbar: 'UNAVAILABLE', ausser_dienst: 'OFF_DUTY' } as const;
const PRIO = { niedrig: 'LOW', mittel: 'MEDIUM', hoch: 'HIGH', dringend: 'URGENT', kritisch: 'CRITICAL' } as const;
const choices = (m: Record<string, string>) => Object.keys(m).map((k) => ({ name: k.replace('_', ' '), value: k }));

const INC_STATUS = { bestaetigt: 'ACKNOWLEDGED', unterwegs: 'EN_ROUTE', vor_ort: 'ON_SCENE', in_bearbeitung: 'PROCESSING', abschluss: 'CLEARING', abgebrochen: 'CANCELLED', geschlossen: 'CLOSED' } as const;
const REPORT = { patrouille: 'PATROL', vorfall: 'INCIDENT', verkehr: 'TRAFFIC', festnahme: 'ARREST', zitation: 'CITATION', kollision: 'COLLISION', ermittlung: 'INVESTIGATION', allgemein: 'GENERAL' } as const;
const CHANNEL = { team: 'TEAM', dispatch: 'DISPATCH' } as const;

/** Findet genau einen Einsatz per Einsatznummer (exakt, ohne Groß-/Kleinschreibung). */
async function resolveIncident(c: Ctx, number: string): Promise<{ incident?: Row; reply?: Reply }> {
  const page = await c.api.asUser<Page>(c.discordId, 'GET', `/incidents?q=${q(number)}&pageSize=10`);
  const hit = page.items.find((i) => String(i.number).toLowerCase() === number.toLowerCase()) ?? (page.items.length === 1 ? page.items[0] : undefined);
  return hit ? { incident: hit } : { reply: errorReply(page.items.length ? 'Nicht eindeutig – bitte die vollständige Einsatznummer angeben (z. B. I-2026-ABC123).' : `Einsatz „${plain(number)}“ nicht gefunden.`) };
}

export const COMMANDS: CommandDef[] = [
  {
    name: 'verknuepfen', description: 'Verknüpft dein Discord-Konto mit deinem EN-Polizei-Benutzer',
    options: [{ name: 'code', description: 'Code aus dem Web („Discord verknüpfen“)', type: 'string', required: true, maxLength: 12 }],
    async run(c) {
      try {
        const r = await c.api.service<{ displayName: string; username: string }>('POST', '/bot/link', { code: str(c, 'code'), discordId: c.discordId });
        return okReply(`Verknüpft mit **${plain(r.displayName)}** (@${plain(r.username)}). Alle Befehle laufen ab jetzt mit deinen Rechten.`);
      } catch (e) {
        if (e instanceof BotApiError && e.status === 400) return errorReply('Ungültiger oder abgelaufener Code. Erzeuge im Web einen neuen.');
        if (e instanceof BotApiError && e.status === 409) return errorReply('Dieses Discord-Konto oder dieser Benutzer ist bereits verknüpft.');
        return mapError(e);
      }
    },
  },
  {
    name: 'hilfe', description: 'Zeigt alle Befehle',
    async run() {
      return { ephemeral: true, embeds: [{ title: 'EN Polizei — Befehle', color: COLORS.info, fields: [
        { name: 'Konto', value: '`/verknuepfen` `/entverknuepfen` `/profil` `/benachrichtigungen`' },
        { name: 'Abfragen', value: '`/person` `/kennzeichen` `/fahndungen` `/einsaetze` `/einsatzinfo` `/einheiten` `/team`' },
        { name: 'Dienst & Leitstelle', value: '`/dienst` `/dienststunden` `/einheitstatus` `/einsatz` `/einsatzstatus` `/einsatzzuweisen` `/funk`' },
        { name: 'Erfassen', value: '`/ticket` `/bericht` `/beschwerde` `/ermittlung` `/fahndung` `/beweis`' },
        { name: 'Leitung & Team', value: '`/gefahrenstatus` `/funkfreigabe` `/teamliste` `/dienstpanel` `/supportpanel` `/bewerbungspanel` `/qualipanel` `/roblox`' },
        { name: 'SEK', value: '`/sek` `/sek-bericht`' },
        { name: 'Für alle', value: '`/bewerbung` (auch ohne Verknüpfung; Fragen per Direktnachricht) · SEK/Flugstaffel/Ausbilder über das Qualifikations-Panel' },
        { name: 'Hinweis', value: 'Alle Befehle laufen mit **deinen** Rechten im System. Antworten sind nur für dich sichtbar.' }] }] };
    },
  },
  {
    name: 'person', description: 'Sucht eine Person (Roblox-Name oder -ID)',
    options: [{ name: 'suche', description: 'Name oder Roblox-ID', type: 'string', required: true, maxLength: 64 }],
    async run(c) {
      try {
        const page = await c.api.asUser<Page>(c.discordId, 'GET', `/persons?q=${q(str(c, 'suche'))}&pageSize=5`);
        if (!page.items.length) return errorReply('Keine Person gefunden.');
        if (page.items.length > 1 && !page.items.some((p) => String(p.robloxUsername).toLowerCase() === str(c, 'suche').toLowerCase())) {
          return { ephemeral: true, embeds: [listEmbed(`👥 ${page.total} Treffer`, page.items.map((p) => `• **${plain(p.robloxUsername)}** (${p.robloxUserId ?? 'ohne ID'})`), '')] };
        }
        const hit = page.items.find((p) => String(p.robloxUsername).toLowerCase() === str(c, 'suche').toLowerCase()) ?? page.items[0]!;
        const ov = await c.api.asUser<{ person: Row; tickets: Row[]; links: Row[] }>(c.discordId, 'GET', `/persons/${hit.id}`);
        const wanted = ov.links.some((l) => l.entityType === 'Wanted');
        return { ephemeral: true, embeds: [personEmbed(ov.person, { tickets: ov.tickets.length, wanted })] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'kennzeichen', description: 'Sucht ein Fahrzeug nach Kennzeichen',
    options: [{ name: 'kennzeichen', description: 'z. B. LC 1001', type: 'string', required: true, maxLength: 16 }],
    async run(c) {
      try {
        const page = await c.api.asUser<Page>(c.discordId, 'GET', `/vehicles?q=${q(str(c, 'kennzeichen'))}&pageSize=5`);
        return page.items.length ? { ephemeral: true, embeds: page.items.map(vehicleEmbed) } : errorReply('Kein Fahrzeug gefunden.');
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'fahndungen', description: 'Zeigt aktive Fahndungen',
    async run(c) {
      try {
        const page = await c.api.asUser<Page>(c.discordId, 'GET', '/wanted?pageSize=10');
        return { ephemeral: true, embeds: [listEmbed(`🔴 Aktive Fahndungen (${page.total})`, page.items.map((w) => `• **${plain(w.reason)}** — ${label(w.priority)}${w.personId ? '' : ' (Fahrzeug)'}`), 'Keine aktiven Fahndungen.')] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'dienst', description: 'Setzt deinen Dienststatus',
    options: [{ name: 'status', description: 'Neuer Status', type: 'string', required: true, choices: choices(DUTY) }],
    async run(c) {
      const status = DUTY[str(c, 'status') as keyof typeof DUTY];
      if (!status) return errorReply('Unbekannter Status.');
      try {
        await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status });
        return okReply(`Dienststatus: **${label(status)}**`);
      } catch (e) { return mapError(e); }
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
        const r = await c.api.asUser<{ users: HoursRow[] }>(c.discordId, 'GET', `${all ? '/team/hours' : '/team/me/hours'}?days=${days}`);
        const period = days === 1 ? 'letzte 24 Stunden' : `letzte ${days} Tage`;
        if (all) {
          const lines = r.users.slice(0, 25).map((u, i) => `${i + 1}. **${plain(u.callsign ?? u.name)}** ${u.callsign ? `(${plain(u.name)}) ` : ''}— ${hm(u.minutes)} · im Dienst ${hm(u.byStatus.ON_DUTY ?? 0)}`);
          return { ephemeral: true, embeds: [listEmbed(`⏱️ Dienststunden Team (${period})`, lines, 'Im Zeitraum war niemand im Dienst.')] };
        }
        const me = r.users[0];
        if (!me) return { ephemeral: true, embeds: [listEmbed(`⏱️ Deine Dienststunden (${period})`, [], 'Im Zeitraum warst du nicht im Dienst.')] };
        const lines = Object.entries(me.byStatus).sort((a, b) => b[1] - a[1]).map(([s, m]) => `• ${label(s)}: ${hm(m)}`);
        return { ephemeral: true, embeds: [listEmbed(`⏱️ Deine Dienststunden (${period})`, [`**Gesamt: ${hm(me.minutes)}** in ${me.sessions} Abschnitt${me.sessions === 1 ? '' : 'en'}`, ...lines], '')] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'einheiten', description: 'Zeigt alle Einheiten und ihren Status',
    async run(c) {
      try {
        const units = await c.api.asUser<Row[]>(c.discordId, 'GET', '/dispatch/units');
        return { ephemeral: true, embeds: [listEmbed('📻 Einheiten', units.map((u) => `• **${plain(u.callsign)}** — ${label(u.status)}`), 'Keine Einheiten angelegt.')] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'einheitstatus', description: 'Ändert den Status einer Einheit',
    options: [
      { name: 'rufzeichen', description: 'z. B. ADAM-1', type: 'string', required: true, maxLength: 16 },
      { name: 'status', description: 'Neuer Status', type: 'string', required: true, choices: choices(UNIT) },
    ],
    async run(c) {
      const status = UNIT[str(c, 'status') as keyof typeof UNIT];
      if (!status) return errorReply('Unbekannter Status.');
      try {
        const units = await c.api.asUser<Row[]>(c.discordId, 'GET', '/dispatch/units');
        const unit = units.find((u) => String(u.callsign).toLowerCase() === str(c, 'rufzeichen').toLowerCase());
        if (!unit) return errorReply('Einheit nicht gefunden.');
        await c.api.asUser(c.discordId, 'PUT', `/dispatch/units/${unit.id}/status`, { status });
        return okReply(`**${plain(unit.callsign)}** → ${label(status)}`);
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'einsaetze', description: 'Zeigt offene Einsätze',
    async run(c) {
      try {
        const page = await c.api.asUser<Page>(c.discordId, 'GET', '/incidents?active=true&pageSize=10');
        return { ephemeral: true, embeds: [listEmbed(`🚨 Offene Einsätze (${page.total})`, page.items.map(incidentLine), 'Keine offenen Einsätze.')] };
      } catch (e) { return mapError(e); }
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
      if (title.length < 3) return errorReply('Der Titel ist zu kurz (mindestens 3 Zeichen).');
      try {
        const prio = PRIO[str(c, 'prioritaet') as keyof typeof PRIO] ?? 'MEDIUM';
        const inc = await c.api.asUser<Row>(c.discordId, 'POST', '/incidents', { title, priority: prio, location: str(c, 'ort') || undefined });
        return okReply(`Einsatz **${inc.number}** angelegt (${label(prio)}).`);
      } catch (e) { return mapError(e); }
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
      if (reason.length < 3) return errorReply('Der Grund ist zu kurz (mindestens 3 Zeichen).');
      try {
        const { person, reply, created } = await resolvePerson(c, str(c, 'person'), { create: true });
        if (!person) return reply!;
        const amount = typeof c.opts.betrag === 'number' ? c.opts.betrag : undefined;
        const t = await c.api.asUser<Row>(c.discordId, 'POST', '/tickets', { personId: person.id, reason, ...(amount !== undefined ? { amount } : {}) });
        return okReply(`Ticket **${t.number}** für **${plain(person.robloxUsername)}** ausgestellt.${created ? ' Die Person war noch nicht im System und wurde nach Roblox-Prüfung neu angelegt.' : ''}`);
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'profil', description: 'Zeigt dein verknüpftes Konto und deine Rollen',
    async run(c) {
      try {
        const me = await c.api.asUser<{ displayName: string; username: string; robloxUserId: string | null; roles: string[]; permissions: string[]; lastLogin: string | null }>(c.discordId, 'GET', '/auth/me');
        return { ephemeral: true, embeds: [{ title: `🪪 ${plain(me.displayName)}`, color: COLORS.info, fields: [
          { name: 'Benutzer', value: `@${plain(me.username)}`, inline: true }, { name: 'Roblox-ID', value: String(me.robloxUserId ?? 'nicht hinterlegt'), inline: true },
          { name: 'Rollen', value: clip(me.roles.map(plain).join(', ') || 'keine', 1024) }, { name: 'Berechtigungen', value: `${me.permissions.length} aktiv`, inline: true }] }] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'entverknuepfen', description: 'Löst die Verknüpfung deines Discord-Kontos',
    async run(c) {
      try { await c.api.asUser(c.discordId, 'DELETE', '/discord/link'); return okReply('Verknüpfung gelöst. Mit `/verknuepfen` kannst du sie jederzeit neu herstellen.'); } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'team', description: 'Zeigt, wer im Dienst ist',
    async run(c) {
      try {
        const rows = await c.api.asUser<Row[]>(c.discordId, 'GET', '/team/overview');
        const on = rows.filter((r) => r.dutyStatus !== 'OFF_DUTY');
        const lines = on.slice(0, 25).map((r) => `• **${plain(r.callsign ?? '—')}** ${plain(r.name)} — ${label(r.dutyStatus)}${r.unit ? ` · ${plain((r.unit as Row).callsign)}` : ''}${r.currentIncident ? ` · 🚨 ${(r.currentIncident as Row).number}` : ''}`);
        return { ephemeral: true, embeds: [listEmbed(`👮 Im Dienst (${on.length} von ${rows.length})`, lines, 'Aktuell ist niemand im Dienst.')] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'einsatzinfo', description: 'Zeigt Details zu einem Einsatz',
    options: [{ name: 'nummer', description: 'Einsatznummer, z. B. I-2026-ABC123', type: 'string', required: true, maxLength: 32 }],
    async run(c) {
      try {
        const { incident, reply } = await resolveIncident(c, str(c, 'nummer'));
        if (!incident) return reply!;
        const d = await c.api.asUser<{ incident: Row & { units?: { clearedAt: string | null; unit: Row }[] }; timeline: Row[] }>(c.discordId, 'GET', `/incidents/${incident.id}`);
        const i = d.incident;
        const units = (i.units ?? []).filter((u) => !u.clearedAt).map((u) => plain(u.unit.callsign)).join(', ') || 'keine';
        return { ephemeral: true, embeds: [{ title: clip(`🚨 ${i.number} — ${plain(i.title)}`, 256), color: COLORS.info, description: i.description ? clip(plain(i.description), 1500) : undefined, fields: [
          { name: 'Priorität', value: label(i.priority), inline: true }, { name: 'Status', value: label(i.status), inline: true }, { name: 'Ort', value: clip(plain(i.location), 1024), inline: true },
          { name: 'Einheiten', value: clip(units, 1024) }, { name: 'Verlauf', value: clip(d.timeline.slice(0, 5).map((t) => `• ${plain(t.summary)}`).join('\n') || '—', 1024) }] }] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'einsatzstatus', description: 'Ändert den Status eines Einsatzes',
    options: [
      { name: 'nummer', description: 'Einsatznummer', type: 'string', required: true, maxLength: 32 },
      { name: 'status', description: 'Neuer Status', type: 'string', required: true, choices: choices(INC_STATUS) },
    ],
    async run(c) {
      const status = INC_STATUS[str(c, 'status') as keyof typeof INC_STATUS];
      if (!status) return errorReply('Unbekannter Status.');
      try {
        const { incident, reply } = await resolveIncident(c, str(c, 'nummer'));
        if (!incident) return reply!;
        // Schließen läuft über den eigenen Endpunkt (Recht dispatch.close), alles andere über den Status-Endpunkt (dispatch.edit)
        if (status === 'CLOSED') await c.api.asUser(c.discordId, 'POST', `/dispatch/incidents/${incident.id}/close`);
        else await c.api.asUser(c.discordId, 'PUT', `/dispatch/incidents/${incident.id}/status`, { status });
        return okReply(`**${incident.number}** → ${label(status)}`);
      } catch (e) { return mapError(e); }
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
        if (!incident) return reply!;
        const units = await c.api.asUser<Row[]>(c.discordId, 'GET', '/dispatch/units');
        const unit = units.find((u) => String(u.callsign).toLowerCase() === str(c, 'rufzeichen').toLowerCase());
        if (!unit) return errorReply('Einheit nicht gefunden.');
        await c.api.asUser(c.discordId, 'POST', `/dispatch/incidents/${incident.id}/assign`, { unitId: unit.id });
        return okReply(`**${plain(unit.callsign)}** wurde **${incident.number}** zugewiesen.`);
      } catch (e) { return mapError(e); }
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
      if (str(c, 'titel').length < 3) return errorReply('Der Titel ist zu kurz (mindestens 3 Zeichen).');
      try {
        const type = REPORT[str(c, 'typ') as keyof typeof REPORT] ?? 'GENERAL';
        const r = await c.api.asUser<Row>(c.discordId, 'POST', '/reports', { type, title: str(c, 'titel'), content: { body: str(c, 'text') } });
        if (c.opts.einreichen === true) {
          await c.api.asUser(c.discordId, 'POST', `/reports/${r.id}/submit`);
          return okReply(`Bericht **${r.number}** angelegt und **eingereicht**.`);
        }
        return okReply(`Bericht **${r.number}** als **Entwurf** gespeichert (im Web bearbeiten/einreichen).`);
      } catch (e) { return mapError(e); }
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
      if (str(c, 'kategorie').length < 2) return errorReply('Die Kategorie ist zu kurz.');
      if (str(c, 'beschreibung').length < 10) return errorReply('Die Beschreibung ist zu kurz (mindestens 10 Zeichen).');
      try {
        let subjectId: unknown;
        if (str(c, 'person')) { const r = await resolvePerson(c, str(c, 'person')); if (!r.person) return r.reply!; subjectId = r.person.id; }
        const res = await c.api.asUser<Row>(c.discordId, 'POST', '/complaints', { category: str(c, 'kategorie'), description: str(c, 'beschreibung'), ...(subjectId ? { subjectId } : {}) });
        return okReply(`Beschwerde **${res.number}** erfasst.`);
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'ermittlung', description: 'Eröffnet einen Ermittlungsfall',
    options: [
      { name: 'titel', description: 'Titel des Falls', type: 'string', required: true, maxLength: 200 },
      { name: 'beschreibung', description: 'Beschreibung', type: 'string', maxLength: 4000 },
    ],
    async run(c) {
      if (str(c, 'titel').length < 3) return errorReply('Der Titel ist zu kurz (mindestens 3 Zeichen).');
      try {
        const r = await c.api.asUser<Row>(c.discordId, 'POST', '/investigations', { title: str(c, 'titel'), ...(str(c, 'beschreibung') ? { description: str(c, 'beschreibung') } : {}) });
        return okReply(`Fall **${r.caseNumber}** eröffnet.`);
      } catch (e) { return mapError(e); }
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
      if (str(c, 'grund').length < 3) return errorReply('Der Grund ist zu kurz (mindestens 3 Zeichen).');
      try {
        const { person, reply } = await resolvePerson(c, str(c, 'person'));
        if (!person) return reply!;
        const priority = PRIO[str(c, 'prioritaet') as keyof typeof PRIO] ?? 'MEDIUM';
        await c.api.asUser(c.discordId, 'POST', '/wanted', { personId: person.id, reason: str(c, 'grund'), priority });
        return okReply(`**${plain(person.robloxUsername)}** ist zur Fahndung ausgeschrieben (${label(priority)}).`);
      } catch (e) { return mapError(e); }
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
      if (str(c, 'typ').length < 2 || str(c, 'beschreibung').length < 3) return errorReply('Typ oder Beschreibung sind zu kurz.');
      try {
        const e = await c.api.asUser<Row>(c.discordId, 'POST', '/evidence', { type: str(c, 'typ'), description: str(c, 'beschreibung'), ...(str(c, 'fall') ? { caseRef: str(c, 'fall').toUpperCase() } : {}) });
        return okReply(`Beweis **${e.number}** erfasst.`);
      } catch (err) { return mapError(err); }
    },
  },
  {
    name: 'funk', description: 'Sendet eine Nachricht in einen Systemkanal',
    options: [
      { name: 'kanal', description: 'Kanal', type: 'string', required: true, choices: choices(CHANNEL) },
      { name: 'text', description: 'Nachricht', type: 'string', required: true, maxLength: 1500 },
    ],
    async run(c) {
      const ch = CHANNEL[str(c, 'kanal') as keyof typeof CHANNEL];
      if (!ch) return errorReply('Unbekannter Kanal.');
      try {
        await c.api.asUser(c.discordId, 'POST', `/communication/channels/${ch}/messages`, { body: str(c, 'text') });
        return okReply(`Nachricht an **${ch}** gesendet.`);
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'benachrichtigungen', description: 'Zeigt deine ungelesenen Benachrichtigungen',
    async run(c) {
      try {
        const r = await c.api.asUser<{ items: Row[]; unread: number }>(c.discordId, 'GET', '/notifications?filter=unread&pageSize=10');
        return { ephemeral: true, embeds: [listEmbed(`🔔 Ungelesen (${r.unread})`, r.items.map((n) => `• ${plain(n.title)}`), 'Keine ungelesenen Benachrichtigungen.')] };
      } catch (e) { return mapError(e); }
    },
  },
  ...FEATURE_COMMANDS,
  ...SEK_COMMANDS,
  ...QUALI_COMMANDS,
];

export { mapError };
export const byName = (n: string) => COMMANDS.find((c) => c.name === n);
export type { EmbedData };
