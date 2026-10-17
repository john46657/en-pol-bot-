import { BotApiError } from '../api';
import { clip, COLORS, DUTY_DE, errorReply, okReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

/** Eine Schicht aus `/team/me/shifts` bzw. `/team/shifts` (zusammenhängende Dienst-Sitzungen bis „Außer Dienst“). */
interface ShiftRow { id: string; userId: string; name: string; callsign: string | null; shiftType: string | null; startedAt: string; endedAt: string | null; active: boolean; status: string; minutes: number; breakMinutes: number; breaks: number; startedBy: string | null; endedBy: string | null }
interface ShiftLog { days: number; items: ShiftRow[]; member?: { userId: string; name: string } | null }
interface ShiftTypeInfo { id: string; name: string; isDefault: boolean }
interface OverviewRow { userId: string; name: string; callsign: string | null; dutyStatus: string; onDutySince: string | null; shiftType: string | null }

/** Minuten → „3 h 05 min“. */
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const ts = (iso: string, style = 'f') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
const days = (c: Ctx) => Number(c.opts.tage ?? 7);
const period = (d: number) => (d === 1 ? 'letzte 24 Stunden' : `letzte ${d} Tage`);

async function shiftTypes(c: Ctx): Promise<ShiftTypeInfo[]> {
  const cfg = await c.api.service<{ enabled: boolean; types: ShiftTypeInfo[] }>('GET', '/bot/shifts').catch(() => null);
  return cfg?.enabled ? cfg.types : [];
}

/** Eine Zeile im Verlauf: Beginn, Dauer, Schichtart, Pausen. */
const line = (s: ShiftRow, i: number) => `\`${i + 1}.\` ${ts(s.startedAt)} · **${hm(s.minutes - s.breakMinutes)}**${s.shiftType ? ` · ${plain(s.shiftType)}` : ''}${s.breaks ? ` · ${s.breaks}× Pause (${hm(s.breakMinutes)})` : ''}${s.active ? ` · ${DUTY_DE[s.status]?.emoji ?? '🟢'} läuft` : ''}`;

/** Übersicht: laufende Schicht oben, darunter Summe und die letzten Schichten. */
function logEmbed(title: string, log: ShiftLog, emptyText: string): EmbedData {
  const items = log.items;
  const current = items.find((s) => s.active);
  const total = items.reduce((n, s) => n + s.minutes - s.breakMinutes, 0);
  const fields: EmbedData['fields'] = [];
  if (current) fields.push({ name: 'Aktuelle Schicht', value: clip([`${DUTY_DE[current.status]?.emoji ?? '🟢'} **${DUTY_DE[current.status]?.label ?? current.status}** seit ${ts(current.startedAt, 'R')}`, current.shiftType ? `Schicht: **${plain(current.shiftType)}**` : null, `Dauer: ${hm(current.minutes)}${current.breakMinutes ? ` (davon Pause ${hm(current.breakMinutes)})` : ''}`].filter(Boolean).join('\n'), 1024) });
  fields.push({ name: `Gesamt (${period(log.days)})`, value: `**${hm(total)}** in ${items.length} ${items.length === 1 ? 'Schicht' : 'Schichten'}`, inline: true });
  const lines = items.slice(0, 15).map(line);
  return { title, color: current ? COLORS.success : COLORS.info, fields,
    description: clip(lines.length ? `${lines.join('\n')}${items.length > 15 ? `\n… und ${items.length - 15} weitere` : ''}` : emptyText, 4000) };
}

async function setStatus(c: Ctx, status: 'ON_DUTY' | 'BREAK' | 'OFF_DUTY', shiftType?: string): Promise<Reply> {
  try {
    await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status, ...(shiftType ? { shiftType } : {}) });
    return okReply(`${DUTY_DE[status]!.emoji} Du bist jetzt **${DUTY_DE[status]!.label}**.`);
  } catch (e) {
    if (e instanceof BotApiError && e.status === 409) return okReply(`Du bist bereits **${DUTY_DE[status]!.label}**.`);
    return mapError(e);
  }
}

async function start(c: Ctx): Promise<Reply> {
  const types = await shiftTypes(c);
  const wanted = String(c.opts.art ?? '').trim().toLowerCase();
  if (wanted) {
    const t = types.find((x) => x.id === wanted || x.name.toLowerCase() === wanted);
    if (!t) return errorReply(types.length ? `Unbekannte Schichtart. Verfügbar: ${types.map((x) => `**${plain(x.name)}**`).join(', ')}.` : 'Auf diesem Server sind keine Schichtarten eingerichtet – einfach `/schicht start` ohne Art.');
    try {
      await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status: 'ON_DUTY', shiftType: t.id });
      return okReply(`🟢 Schicht **${plain(t.name)}** gestartet.`);
    } catch (e) {
      if (e instanceof BotApiError && e.status === 409) return okReply(`Deine Schicht **${plain(t.name)}** läuft bereits.`);
      return mapError(e);
    }
  }
  // Mehrere Arten: Auswahlmenü (wird vom Dienst-Panel-Handler `duty:type` verarbeitet)
  if (types.length >= 2) return { ephemeral: true, content: 'Welche Schicht beginnst du?', select: { id: 'duty:type', placeholder: 'Schicht wählen …', options: types.slice(0, 25).map((t) => ({ label: clip(t.name, 100), value: t.id, ...(t.isDefault ? { description: 'Standard' } : {}) })) } };
  return setStatus(c, 'ON_DUTY');
}

/** Pause umschalten: im Dienst → Pause, in der Pause → zurück in den Dienst (gleiche Schichtart). */
async function pause(c: Ctx): Promise<Reply> {
  try {
    const me = await c.api.asUser<{ status: string } | null>(c.discordId, 'GET', '/team/me');
    if (!me) return errorReply('Du bist gerade nicht im Dienst. Starte mit `/schicht start`.');
    return setStatus(c, me.status === 'BREAK' ? 'ON_DUTY' : 'BREAK');
  } catch (e) { return mapError(e); }
}

async function active(c: Ctx): Promise<Reply> {
  try {
    const rows = await c.api.asUser<OverviewRow[]>(c.discordId, 'GET', '/team/overview');
    const on = rows.filter((r) => r.dutyStatus !== 'OFF_DUTY').sort((a, b) => (a.onDutySince ?? '').localeCompare(b.onDutySince ?? ''));
    const lines = on.slice(0, 30).map((r) => `${DUTY_DE[r.dutyStatus]?.emoji ?? '•'} **${plain(r.callsign ?? r.name)}**${r.callsign ? ` (${plain(r.name)})` : ''}${r.shiftType ? ` · ${plain(r.shiftType)}` : ''}${r.onDutySince ? ` · seit ${ts(r.onDutySince, 'R')}` : ''}`);
    const onBreak = on.filter((r) => r.dutyStatus === 'BREAK').length;
    return { ephemeral: true, embeds: [{ title: `👮 Laufende Schichten (${on.length})`, color: on.length ? COLORS.success : COLORS.neutral,
      description: clip(lines.length ? `${lines.join('\n')}${on.length > 30 ? `\n… und ${on.length - 30} weitere` : ''}` : 'Gerade ist niemand im Dienst.', 4000),
      ...(onBreak ? { footer: `${onBreak} davon in der Pause` } : {}) }] };
  } catch (e) { return mapError(e); }
}

/** Leitung: Schichten eines Mitglieds; läuft eine, gibt es „Schicht beenden“. */
export async function adminReply(c: Ctx, discordId: string, d = 7): Promise<Reply> {
  if (!/^\d{15,25}$/.test(discordId)) return errorReply('Bitte ein Mitglied auswählen.');
  const log = await c.api.asUser<ShiftLog>(c.discordId, 'GET', `/team/shifts?discordId=${discordId}&days=${d}`);
  if (!log.member) return errorReply(`<@${discordId}> ist mit keinem Konto im System verknüpft.`);
  const current = log.items.find((s) => s.active);
  const buttons: ButtonSpec[] = current ? [{ id: `shift:end:${log.member.userId}:${discordId}`, label: 'Schicht beenden', style: 'danger', emoji: '⏹️' }] : [];
  return { ephemeral: true, embeds: [logEmbed(clip(`🕒 Schichten von ${plain(log.member.name)}`, 256), log, 'Im Zeitraum keine Schichten.')], ...(buttons.length ? { buttons } : {}) };
}

export const SHIFT_COMMANDS: CommandDef[] = [
  {
    name: 'schicht', description: 'Schichten: starten, Pause, beenden, Verlauf und wer gerade im Dienst ist',
    subcommands: [
      { name: 'start', description: 'Schicht beginnen', options: [{ name: 'art', description: 'Schichtart (leer = Auswahl bzw. Standard)', type: 'string', maxLength: 40 }] },
      { name: 'pause', description: 'Pause beginnen bzw. beenden' },
      { name: 'ende', description: 'Schicht beenden (außer Dienst)' },
      { name: 'status', description: 'Deine aktuelle Schicht und deine Zeit der letzten 7 Tage' },
      { name: 'verlauf', description: 'Deine letzten Schichten', options: [{ name: 'tage', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 }] },
      { name: 'aktiv', description: 'Wer gerade eine Schicht hat' },
      { name: 'admin', description: 'Leitung: Schichten eines Mitglieds ansehen und beenden', options: [
        { name: 'mitglied', description: 'Discord-Mitglied', type: 'user', required: true },
        { name: 'tage', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 },
      ] },
    ],
    async run(c): Promise<Reply> {
      switch (c.opts._sub) {
        case 'start': return start(c);
        case 'pause': return pause(c);
        case 'ende': return setStatus(c, 'OFF_DUTY');
        case 'aktiv': return active(c);
        case 'admin': try { return await adminReply(c, String(c.opts.mitglied ?? ''), days(c)); } catch (e) { return mapError(e); }
        case 'status':
        case 'verlauf':
          try {
            const d = c.opts._sub === 'status' ? 7 : days(c);
            const log = await c.api.asUser<ShiftLog>(c.discordId, 'GET', `/team/me/shifts?days=${d}`);
            return { ephemeral: true, embeds: [logEmbed('🕒 Deine Schichten', log, 'Im Zeitraum hattest du keine Schicht. Starte mit `/schicht start`.')] };
          } catch (e) { return mapError(e); }
        default: return errorReply('Unbekannter Unterbefehl.');
      }
    },
  },
];

/** Button `shift:end:<userId>:<discordId>` aus `/schicht admin`: Schicht eines Mitglieds beenden. */
export const SHIFT_INTERACTION: InteractionDef = {
  prefix: 'shift',
  async run(c): Promise<Reply> {
    const [action, userId, discordId] = c.args;
    if (action !== 'end' || !userId || !/^[0-9a-f-]{36}$/i.test(userId)) return errorReply('Unbekannte Aktion.');
    try {
      await c.api.asUser(c.discordId, 'PUT', `/team/${userId}/status`, { status: 'OFF_DUTY' });
    } catch (e) {
      if (!(e instanceof BotApiError && e.status === 409)) return mapError(e);
    }
    try { return discordId ? { ...(await adminReply(c, discordId)), content: '✅ Schicht beendet.' } : okReply('Schicht beendet.'); } catch { return okReply('Schicht beendet.'); }
  },
};
