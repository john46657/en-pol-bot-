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
const days = (c: Ctx) => Number(c.opts.days ?? 7);
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

/** Schichtart aus der Eingabe (ID oder Name, ohne Groß-/Kleinschreibung). */
const findType = (types: ShiftTypeInfo[], wanted: string) => { const w = wanted.trim().toLowerCase(); return types.find((x) => x.id === w || x.name.toLowerCase() === w); };

/**
 * `/shift manage`: eigene Schicht wie bei Trident – Status, laufende Schicht und Zeit der letzten 7 Tage,
 * darunter je nach Status „Schicht starten“ bzw. „Pause“ / „Pause beenden“ und „Schicht beenden“.
 */
export async function manageReply(c: Ctx, type?: ShiftTypeInfo, notice?: string): Promise<Reply> {
  const log = await c.api.asUser<ShiftLog>(c.discordId, 'GET', '/team/me/shifts?days=7');
  const current = log.items.find((s) => s.active);
  const total = log.items.reduce((n, s) => n + s.minutes - s.breakMinutes, 0);
  const st = current ? DUTY_DE[current.status] : DUTY_DE.OFF_DUTY!;
  const fields: EmbedData['fields'] = [{ name: 'Status', value: `${st?.emoji ?? '🟢'} ${st?.label ?? current?.status}`, inline: true }];
  if (current) {
    fields.push({ name: 'Seit', value: ts(current.startedAt, 'R'), inline: true });
    if (current.shiftType) fields.push({ name: 'Schicht', value: plain(current.shiftType), inline: true });
    fields.push({ name: 'Dauer', value: hm(current.minutes - current.breakMinutes), inline: true }, { name: 'Pausen', value: current.breaks ? `${current.breaks}× (${hm(current.breakMinutes)})` : 'keine', inline: true });
  } else if (type) fields.push({ name: 'Schicht', value: plain(type.name), inline: true });
  fields.push({ name: 'Letzte 7 Tage', value: `**${hm(total)}** in ${log.items.length} ${log.items.length === 1 ? 'Schicht' : 'Schichten'}` });
  const buttons: ButtonSpec[] = !current
    ? [{ id: `shift:on${type ? `:${type.id}` : ''}`, label: 'Schicht starten', style: 'success', emoji: '🟢' }]
    : [current.status === 'BREAK' ? { id: 'shift:on', label: 'Pause beenden', style: 'success', emoji: '🟢' } : { id: 'shift:break', label: 'Pause', style: 'secondary', emoji: '🟡' },
      { id: 'shift:off', label: 'Schicht beenden', style: 'danger', emoji: '⏹️' }];
  const head: Pick<EmbedData, 'author'> = c.userName ? { author: { name: `@${c.userName}`, ...(c.userAvatar ? { iconUrl: c.userAvatar } : {}) } } : {};
  return { ephemeral: true, ...(notice ? { content: notice } : {}), buttons,
    embeds: [{ ...head, title: 'Schicht verwalten', color: current ? st?.color ?? COLORS.success : COLORS.neutral, fields,
      description: current ? undefined : 'Du bist gerade nicht im Dienst. Um eine Schicht zu beginnen, klicke auf `Schicht starten`.' }] };
}

/** Status setzen und das Verwaltungs-Panel neu zeigen; „schon so“ (409) ist kein Fehler. */
async function switchTo(c: Ctx, status: 'ON_DUTY' | 'BREAK' | 'OFF_DUTY', type?: ShiftTypeInfo): Promise<Reply> {
  let notice: string;
  try {
    await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status, ...(type ? { shiftType: type.id } : {}) });
    notice = status === 'ON_DUTY' && type ? `🟢 Schicht **${plain(type.name)}** gestartet.` : `${DUTY_DE[status]!.emoji} Du bist jetzt **${DUTY_DE[status]!.label}**.`;
  } catch (e) {
    if (!(e instanceof BotApiError && e.status === 409)) return mapError(e);
    notice = `Du bist bereits **${DUTY_DE[status]!.label}**.`;
  }
  try { return await manageReply(c, undefined, notice); } catch { return okReply(notice.replace(/^\S+ /, '')); }
}

/** „Schicht starten“ / „Pause beenden“: aus der Pause zurück (gleiche Schichtart), sonst ggf. erst die Schichtart wählen. */
async function goOnDuty(c: Ctx, typeId?: string): Promise<Reply> {
  const types = await shiftTypes(c);
  if (typeId) {
    const t = findType(types, typeId);
    if (!t) return errorReply('Diese Schichtart gibt es nicht mehr.');
    return switchTo(c, 'ON_DUTY', t);
  }
  const me = await c.api.asUser<{ status: string } | null>(c.discordId, 'GET', '/team/me');
  if (!me && types.length >= 2) return { ephemeral: true, content: 'Welche Schicht beginnst du?', select: { id: 'shift:type', placeholder: 'Schicht wählen …', options: types.slice(0, 25).map((t) => ({ label: clip(t.name, 100), value: t.id, ...(t.isDefault ? { description: 'Standard' } : {}) })) } };
  return switchTo(c, 'ON_DUTY');
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

interface BoardRow { userId: string; name: string; callsign: string | null; minutes: number }
const MEDALS = ['🥇', '🥈', '🥉'];
/** `/shift leaderboard`: alle nach Zeit im Dienst (ohne Pausen), eigene Platzierung unten. */
async function leaderboard(c: Ctx): Promise<Reply> {
  try {
    const d = days(c);
    const r = await c.api.asUser<{ days: number; me: string; users: BoardRow[] }>(c.discordId, 'GET', `/team/leaderboard?days=${d}`);
    const lines = r.users.slice(0, 20).map((u, i) => `${MEDALS[i] ?? `\`${i + 1}.\``} **${plain(u.callsign ?? u.name)}**${u.callsign ? ` (${plain(u.name)})` : ''} · ${hm(u.minutes)}${u.userId === r.me ? ' ← du' : ''}`);
    const mine = r.users.findIndex((u) => u.userId === r.me);
    return { ephemeral: true, embeds: [{ title: `🏆 Rangliste (${period(r.days)})`, color: COLORS.info,
      description: clip(lines.length ? `${lines.join('\n')}${r.users.length > 20 ? `\n… und ${r.users.length - 20} weitere` : ''}` : 'Im Zeitraum war niemand im Dienst.', 4000),
      ...(r.users.length ? { footer: mine >= 0 ? `Dein Platz: ${mine + 1} von ${r.users.length} · ${hm(r.users[mine]!.minutes)}` : 'Du warst im Zeitraum nicht im Dienst.' } : {}) }] };
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
    name: 'shift', description: 'Schichten: starten, Pause, beenden, wer im Dienst ist und Rangliste',
    subcommands: [
      { name: 'manage', description: 'Deine Schicht verwalten: starten, Pause machen, beenden', options: [{ name: 'type', description: 'Die Schichtart (leer = Auswahl bzw. Standard)', type: 'string', maxLength: 40, autocomplete: true }] },
      { name: 'active', description: 'Alle, die gerade eine Schicht haben' },
      { name: 'admin', description: 'Schichten eines Mitglieds verwalten und Infos ansehen', options: [
        { name: 'member', description: 'Discord-Mitglied', type: 'user', required: true },
        { name: 'days', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 },
      ] },
      { name: 'leaderboard', description: 'Alle Mitglieder nach ihrer Zeit im Dienst', options: [{ name: 'days', description: 'Zeitraum in Tagen (Standard: 7)', type: 'integer', min: 1, max: 90 }] },
    ],
    async complete(c, option, value) {
      if (option !== 'type') return [];
      const v = value.trim().toLowerCase();
      return (await shiftTypes(c)).filter((t) => !v || t.name.toLowerCase().includes(v) || t.id.includes(v)).map((t) => ({ name: t.name, value: t.id }));
    },
    async run(c): Promise<Reply> {
      switch (c.opts._sub) {
        case 'active': return active(c);
        case 'leaderboard': return leaderboard(c);
        case 'admin': try { return await adminReply(c, String(c.opts.member ?? ''), days(c)); } catch (e) { return mapError(e); }
        case 'manage': {
          const wanted = String(c.opts.type ?? '').trim();
          try {
            if (!wanted) return await manageReply(c);
            const types = await shiftTypes(c);
            const t = findType(types, wanted);
            if (!t) return errorReply(types.length ? `Unbekannte Schichtart. Verfügbar: ${types.map((x) => `**${plain(x.name)}**`).join(', ')}.` : 'Auf diesem Server sind keine Schichtarten eingerichtet – einfach `/shift manage` ohne Schichtart.');
            return await manageReply(c, t);
          } catch (e) { return mapError(e); }
        }
        default: return errorReply('Unbekannter Unterbefehl.');
      }
    },
  },
];

/**
 * Buttons aus `/shift manage`: `shift:on[:<schichtart>]`, `shift:break`, `shift:off`, Auswahl `shift:type`;
 * aus `/shift admin`: `shift:end:<userId>:<discordId>` (Schicht eines Mitglieds beenden).
 */
export const SHIFT_INTERACTION: InteractionDef = {
  prefix: 'shift',
  async run(c): Promise<Reply> {
    const [action, userId, discordId] = c.args;
    try {
      if (action === 'on') return await goOnDuty(c, userId);
      if (action === 'type') return c.values?.[0] ? await goOnDuty(c, c.values[0]) : errorReply('Bitte eine Schicht wählen.');
      if (action === 'break') return await switchTo(c, 'BREAK');
      if (action === 'off') return await switchTo(c, 'OFF_DUTY');
    } catch (e) { return mapError(e); }
    if (action !== 'end' || !userId || !/^[0-9a-f-]{36}$/i.test(userId)) return errorReply('Unbekannte Aktion.');
    try {
      await c.api.asUser(c.discordId, 'PUT', `/team/${userId}/status`, { status: 'OFF_DUTY' });
    } catch (e) {
      if (!(e instanceof BotApiError && e.status === 409)) return mapError(e);
    }
    try { return discordId ? { ...(await adminReply(c, discordId)), content: '✅ Schicht beendet.' } : okReply('Schicht beendet.'); } catch { return okReply('Schicht beendet.'); }
  },
};
