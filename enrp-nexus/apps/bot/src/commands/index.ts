import { BotApiError } from '../api';
import { COLORS, EmbedData, errorReply, incidentLine, label, listEmbed, okReply, personEmbed, plain, Reply, Row, vehicleEmbed } from '../format';
import type { CommandDef, Ctx } from './types';

interface Page { items: Row[]; total: number }

/** Übersetzt API-Fehler in kurze, verständliche Antworten (keine Stacktraces, Request-ID zur Fehlersuche). */
export function mapError(e: unknown): Reply {
  if (!(e instanceof BotApiError)) return errorReply('Unerwarteter Fehler im Bot.');
  const rid = e.requestId ? ` (Request-ID \`${e.requestId}\`)` : '';
  if (e.status === 0) return errorReply('Das System ist gerade nicht erreichbar. Bitte später erneut versuchen.');
  if (e.status === 401 && e.reason === 'NOT_LINKED') return errorReply('Dein Discord-Konto ist nicht verknüpft. Erzeuge im Web (Menü → „Discord verknüpfen“) einen Code und nutze `/verknuepfen`.');
  if (e.status === 401) return errorReply(`Authentifizierung fehlgeschlagen.${rid}`);
  if (e.status === 403) return errorReply('Dazu hast du keine Berechtigung.');
  if (e.status === 404) return errorReply('Nicht gefunden.');
  if (e.status === 429) return errorReply('Zu viele Anfragen – bitte kurz warten.');
  if (e.status === 400 || e.status === 409) return errorReply(`${e.message}${rid}`);
  return errorReply(`Serverfehler.${rid}`);
}

const q = (s: string) => encodeURIComponent(s.trim());
const str = (c: Ctx, k: string) => String(c.opts[k] ?? '').trim();

/** Findet genau eine Person per Roblox-Name (exakt, ohne Groß-/Kleinschreibung) oder Roblox-ID. */
async function resolvePerson(c: Ctx, term: string): Promise<{ person?: Row; reply?: Reply }> {
  const page = await c.api.asUser<Page>(c.discordId, 'GET', `/persons?q=${q(term)}&pageSize=10`);
  const exact = page.items.filter((p) => String(p.robloxUsername).toLowerCase() === term.toLowerCase() || p.robloxUserId === term);
  if (exact.length === 1) return { person: exact[0] };
  if (exact.length === 0 && page.items.length === 0) return { reply: errorReply(`Keine Person zu „${plain(term)}“ gefunden.`) };
  const names = (exact.length ? exact : page.items).slice(0, 8).map((p) => `${plain(p.robloxUsername)} (${p.robloxUserId ?? 'ohne ID'})`).join(', ');
  return { reply: errorReply(`Nicht eindeutig. Treffer: ${names}. Bitte exakten Namen oder die Roblox-ID angeben.`) };
}

const DUTY = { an: 'ON_DUTY', pause: 'BREAK', training: 'TRAINING', verwaltung: 'ADMINISTRATIVE', aus: 'OFF_DUTY' } as const;
const UNIT = { verfuegbar: 'AVAILABLE', beschaeftigt: 'BUSY', unterwegs: 'EN_ROUTE', vor_ort: 'ON_SCENE', nicht_verfuegbar: 'UNAVAILABLE', ausser_dienst: 'OFF_DUTY' } as const;
const PRIO = { niedrig: 'LOW', mittel: 'MEDIUM', hoch: 'HIGH', dringend: 'URGENT', kritisch: 'CRITICAL' } as const;
const choices = (m: Record<string, string>) => Object.keys(m).map((k) => ({ name: k.replace('_', ' '), value: k }));

export const COMMANDS: CommandDef[] = [
  {
    name: 'verknuepfen', description: 'Verknüpft dein Discord-Konto mit deinem ENRP-NEXUS-Benutzer',
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
      return { ephemeral: true, embeds: [{ title: 'ENRP NEXUS — Befehle', color: COLORS.info, description: [
        '`/verknuepfen` – Konto verknüpfen', '`/person` – Person suchen', '`/kennzeichen` – Fahrzeug suchen', '`/fahndungen` – aktive Fahndungen',
        '`/dienst` – Dienststatus setzen', '`/einheiten` – Einheiten & Status', '`/einheitstatus` – Einheitenstatus ändern',
        '`/einsaetze` – offene Einsätze', '`/einsatz` – Einsatz anlegen', '`/ticket` – Ticket ausstellen',
        '', 'Alle Befehle laufen mit **deinen** Rechten im System. Antworten sind nur für dich sichtbar.'].join('\n') }] };
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
        const { person, reply } = await resolvePerson(c, str(c, 'person'));
        if (!person) return reply!;
        const amount = typeof c.opts.betrag === 'number' ? c.opts.betrag : undefined;
        const t = await c.api.asUser<Row>(c.discordId, 'POST', '/tickets', { personId: person.id, reason, ...(amount !== undefined ? { amount } : {}) });
        return okReply(`Ticket **${t.number}** für **${plain(person.robloxUsername)}** ausgestellt.`);
      } catch (e) { return mapError(e); }
    },
  },
];

export const byName = (n: string) => COMMANDS.find((c) => c.name === n);
export type { EmbedData };
