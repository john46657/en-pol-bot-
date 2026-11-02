import { mapError } from './errors';
import { FEATURE_COMMANDS } from './features';
import { LEAVE_COMMANDS } from './leave';
import { shiftPicker } from './features';
import { TICKET_ADMIN_COMMAND, TICKET_COMMAND } from './tickets';
import { DUTY_REPORT_COMMANDS } from './duty-reports';
import { WARNING_COMMANDS } from './warnings';
import { RADIO_WHITELIST_COMMANDS } from './radio-whitelist';
import { TRAINING_COMMANDS } from './trainings';
import { SHIFT_COMMANDS } from './shifts';
import { SETUP_COMMANDS } from './setup';
import { SYSTEM_COMMANDS } from './system';
import { BACKUP_COMMANDS } from './backup';
import { EXAM_COMMANDS } from './exams';
import { BOT_PROFILE_COMMANDS } from './bot-profile';
import { REMINDER_COMMANDS } from './reminders';
import { EXTENSION4_COMMANDS, helpSearch } from './extension4';
import { COLORS, EmbedData, errorReply, label, listEmbed, okReply, plain, Row } from '../format';
import type { CommandDef, Ctx } from './types';

interface HoursRow { name: string; callsign: string | null; minutes: number; byStatus: Record<string, number>; sessions: number }
/** Minuten → „3 h 05 min“. */
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

const q = (s: string) => encodeURIComponent(s.trim());
const str = (c: Ctx, k: string) => String(c.opts[k] ?? '').trim();

const DUTY = { an: 'ON_DUTY', pause: 'BREAK', aus: 'OFF_DUTY' } as const;
const choices = (m: Record<string, string>) => Object.keys(m).map((k) => ({ name: k.replace('_', ' '), value: k }));

const CHANNEL = { team: 'TEAM', dispatch: 'DISPATCH' } as const;

interface RadioCodeRow { code: string; meaning: string; category: string | null; description: string | null }
interface TeamChanceView { isOpen: boolean; reason: string | null; title: string; description: string; opensAt: string | null; closesAt: string | null; remaining: number | null }

export const COMMANDS: CommandDef[] = [
  {
    name: 'funkcode', description: 'Funk-Codes nachschlagen (z. B. 10-4)',
    options: [{ name: 'suche', description: 'Code oder Bedeutung (leer = alle)', type: 'string', maxLength: 64 }],
    async run(c) {
      try {
        const term = str(c, 'suche');
        const rows = await c.api.asUser<RadioCodeRow[]>(c.discordId, 'GET', `/radio-codes${term ? `?q=${q(term)}` : ''}`);
        if (!rows.length) return errorReply(term ? `Kein Funk-Code zu „${plain(term)}“ gefunden.` : 'Es sind noch keine Funk-Codes hinterlegt.');
        const exact = term ? rows.find((r) => r.code.toLowerCase() === term.toLowerCase()) : undefined;
        if (exact) return { ephemeral: true, embeds: [{ title: `📡 ${plain(exact.code)}`, description: `**${plain(exact.meaning)}**${exact.description ? `\n${plain(exact.description)}` : ''}`, color: 0x3b82f6, footer: exact.category ? plain(exact.category) : undefined }] };
        const lines = rows.slice(0, 40).map((r) => `\`${plain(r.code)}\` – ${plain(r.meaning)}`);
        return { ephemeral: true, embeds: [{ title: '📡 Funk-Codes', description: lines.join('\n').slice(0, 4000), color: 0x3b82f6, footer: rows.length > 40 ? `${rows.length - 40} weitere – Suche eingrenzen` : undefined }] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'teamchance', description: 'Zeigt, ob gerade eine Team-Chance (Bewerbungsphase fürs Team) offen ist',
    async run(c) {
      try {
        const s = await c.api.service<TeamChanceView>('GET', `/bot/teamchance${c.guildId ? `?guildId=${c.guildId}` : ''}`);
        const when = (iso: string | null) => (iso ? `<t:${Math.floor(Date.parse(iso) / 1000)}:f>` : null);
        if (s.isOpen) return { ephemeral: true, embeds: [{ title: `📣 ${plain(s.title)} – offen`, description: `${plain(s.description)}\n\nBewerben: über das Bewerbungs-Panel auf dem Server`.slice(0, 4000), color: 0x22c55e, fields: [...(s.closesAt ? [{ name: 'Bewerbungsschluss', value: when(s.closesAt)!, inline: true }] : []), ...(s.remaining !== null ? [{ name: 'Freie Plätze', value: String(s.remaining), inline: true }] : [])] }] };
        const why = s.reason === 'not_started' && s.opensAt ? `Startet ${when(s.opensAt)}.` : s.reason === 'full' ? 'Alle Plätze sind vergeben.' : 'Derzeit ist keine Team-Chance offen.';
        return { ephemeral: true, embeds: [{ title: `🔒 ${plain(s.title)}`, description: why, color: 0xef4444 }] };
      } catch (e) { return mapError(e); }
    },
  },
  ...['dashboard', 'panel'].map((name): CommandDef => ({
    name, description: 'Link zum Web-Dashboard',
    async run(c) {
      try {
        const { url } = await c.api.service<{ url: string }>('GET', '/bot/dashboard-url');
        return { ephemeral: true, embeds: [{ title: '🖥️ EN Polizei – Dashboard', description: `Hier geht's zum Web-Dashboard:\n${url}`, color: COLORS.info }], buttons: [{ id: 'link', label: 'Dashboard öffnen', style: 'secondary', url }] };
      } catch (e) { return mapError(e); }
    },
  })),
  {
    name: 'hilfe', description: 'Zeigt alle Befehle – mit „suche“ durchsucht er das Hilfe-Center',
    options: [{ name: 'suche', description: 'Hilfe-Center durchsuchen, z. B. „Dienst anmelden“', type: 'string', maxLength: 100 }],
    async run(c) {
      if (String(c.opts.suche ?? '').trim()) return helpSearch(c);
      return { ephemeral: true, embeds: [{ title: 'EN Polizei — Befehle', color: COLORS.info, fields: [
        { name: 'Konto', value: '`/dashboard` `/panel` `/benachrichtigungen`' },
        { name: 'Abfragen', value: '`/team` `/personal akte` `/personal qualifikationen` `/organigramm` `/hilfe suche:` (Hilfe-Center)' },
        { name: 'Dienst & Leitstelle', value: '`/shift manage` `/shift active` `/shift admin` `/shift leaderboard` `/dienst` `/dienststunden` `/abmeldung` `/leave manage` `/leave liste` `/funk` `/funkcode` `/funkantrag` `/funkstatus`' },
        { name: 'Erfassen', value: '`/dienstbericht` `/dienstbericht liste`' },
        { name: 'Leitung & Team', value: '`/ausbildung` `/verwarnen` `/funkfreigabe` `/teamliste` `/dienstpanel` `/teamchance` `/roblox`' },
        { name: 'Ausbildung & Prüfungen', value: '`/pruefung liste` `/pruefung ergebnisse` `/pruefung ausbildungen` · Ausbilder: `/pruefung verwalten` `/pruefung bewerten`' },
        { name: 'Administration', value: '`/setup` (Einrichtung) `/system status` `/system diagnose` `/system integrations` `/backup status` `/backup erstellen` `/backup wiederherstellen` `/botprofil name|avatar|status`' },
        { name: 'Support-Tickets', value: '`/support` öffnet ein Ticket (Team: `/support mitglied:@…` für jemand anderen). Team im Ticket-Kanal: `/ticket` (claim, unclaim, schliessen, anfrage, weiterleiten, hinzufuegen, entfernen, umbenennen, erinnern, notiz, automatik, oeffnen). Ticket-Panels, Kategorien, Fragen und Buttons werden im Dashboard eingerichtet und von dort in Discord gesendet.' },
        { name: 'Für alle', value: 'Bewerbung über das Bewerbungs-Panel (auch ohne Verknüpfung; Fragen per Direktnachricht) · SEK/Flugstaffel/Ausbilder über das Qualifikations-Panel · `/remind-me` (Erinnerung, z. B. `in: 30m`) · `/erinnerungen`' },
        { name: 'Hinweis', value: 'Alle Befehle laufen mit **deinen** Rechten im System. Antworten sind nur für dich sichtbar.' }] }] };
    },
  },
  {
    name: 'dienst', description: 'Setzt deinen Dienststatus',
    options: [{ name: 'status', description: 'Neuer Status', type: 'string', required: true, choices: choices(DUTY) }],
    async run(c) {
      const status = DUTY[str(c, 'status') as keyof typeof DUTY];
      if (!status) return errorReply('Unbekannter Status.');
      if (status === 'ON_DUTY') { const pick = await shiftPicker(c); if (pick) return pick; }
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
  ...LEAVE_COMMANDS,
  ...DUTY_REPORT_COMMANDS,
  ...WARNING_COMMANDS,
  ...RADIO_WHITELIST_COMMANDS,
  ...TRAINING_COMMANDS,
  ...SHIFT_COMMANDS,
  TICKET_COMMAND, TICKET_ADMIN_COMMAND,
  ...SETUP_COMMANDS,
  ...SYSTEM_COMMANDS,
  ...BACKUP_COMMANDS,
  ...EXAM_COMMANDS,
  ...BOT_PROFILE_COMMANDS,
  ...REMINDER_COMMANDS,
  ...EXTENSION4_COMMANDS,
];

export { mapError };
export const byName = (n: string) => COMMANDS.find((c) => c.name === n);
export type { EmbedData };
