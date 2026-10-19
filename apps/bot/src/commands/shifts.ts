import { BotApiError } from '../api';
import { clip, COLORS, DUTY_DE, errorReply, okReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

/** Eine Schicht aus `/team/me/shifts` bzw. `/team/shifts` (zusammenhängende Dienst-Sitzungen bis „Außer Dienst“). */
interface ShiftRow { id: string; userId: string; name: string; callsign: string | null; shiftType: string | null; startedAt: string; endedAt: string | null; active: boolean; status: string; minutes: number; breakMinutes: number; breaks: number; startedBy: string | null; endedBy: string | null }
interface ShiftLog { days: number; items: ShiftRow[]; member?: { userId: string; name: string } | null }
interface ShiftTypeInfo { id: string; name: string; isDefault: boolean; permittedRoleIds?: string[] }
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
/** Darf der Aufrufer die Schichtart nutzen (erlaubte Rollen)? Außerhalb eines Servers entscheidet die API. */
export const permittedFor = (c: Ctx, t: ShiftTypeInfo) => !t.permittedRoleIds?.length || !c.memberRoleIds || t.permittedRoleIds.some((r) => c.memberRoleIds!.includes(r));

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

/** Minuten → „2 Stunden, 5 Minuten“ (wie bei Trident ausgeschrieben). */
const long = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  const parts = [...(h ? [`${h} ${h === 1 ? 'Stunde' : 'Stunden'}`] : []), ...(m || !h ? [`${m} ${m === 1 ? 'Minute' : 'Minuten'}`] : [])];
  return parts.join(', ');
};

/** Schichtart fürs Panel: gewählte, sonst Standard bzw. erste (wie Trident „Shift Type“); ohne eingerichtete Arten keine. */
const pickType = (c: Ctx, types: ShiftTypeInfo[], wanted?: string) => {
  if (wanted) return findType(types, wanted);
  const usable = types.filter((t) => permittedFor(c, t));
  return usable.find((t) => t.isDefault) ?? usable[0];
};

/**
 * `/shift manage`: Panel wie bei Trident – laufende Schicht, Gesamtübersicht (Anzahl, Gesamt- und Durchschnittsdauer),
 * Schichtart und immer „Start“, „Pause“, „Beenden“ (was gerade nicht geht, ist ausgegraut). Das Panel ist für alle im
 * Channel sichtbar; Klicks des Besitzers zeichnen es neu, die Buttons tragen dafür seine Discord-ID.
 */
export async function manageReply(c: Ctx, type?: ShiftTypeInfo, notice?: string): Promise<Reply> {
  const [log, stats] = await Promise.all([
    c.api.asUser<ShiftLog>(c.discordId, 'GET', '/team/me/shifts?days=1'),
    c.api.asUser<{ count: number; minutes: number }>(c.discordId, 'GET', '/team/me/shift-stats'),
  ]);
  const current = log.items.find((s) => s.active);
  const onBreak = current?.status === 'BREAK';
  const st = current ? DUTY_DE[current.status] : undefined;
  const typeName = current ? current.shiftType : type?.name ?? null;
  const description = [
    `**Mitglied**: <@${c.discordId}>`, '',
    ...(notice ? [notice, ''] : []),
    ...(current ? ['### 🕒 Aktuelle Schicht', `**Status**: ${st?.emoji ?? '🟢'} ${st?.label ?? current.status}`, `**Begonnen**: ${ts(current.startedAt, 'R')}`,
      `**Dauer**: ${long(current.minutes - current.breakMinutes)}`, `**Pausen**: ${current.breaks ? `${current.breaks} (${long(current.breakMinutes)})` : 'keine'}`, ''] : []),
    '### 📋 Gesamtübersicht',
    `**Anzahl Schichten**: ${stats.count}`,
    `**Gesamtdauer**: ${long(stats.minutes)}`,
    `**Durchschnittliche Dauer**: ${long(stats.count ? stats.minutes / stats.count : 0)}`,
    ...(typeName ? ['', `-# Schichtart: ${plain(typeName)}`] : []),
  ].join('\n');
  const buttons: ButtonSpec[] = [
    { id: `shift:on:${!current && type ? type.id : ''}:${c.discordId}`, label: 'Start', style: 'success', emoji: '▶️', disabled: !!current },
    { id: `shift:break:${c.discordId}`, label: onBreak ? 'Pause beenden' : 'Pause', style: 'primary', emoji: '⏸️', disabled: !current },
    { id: `shift:off:${c.discordId}`, label: 'Beenden', style: 'danger', emoji: '⏹️', disabled: !current },
  ];
  return { ephemeral: false, buttons, embeds: [{ box: true, heading: 'small', title: 'Schichtverwaltung', description: clip(description, 3900) }] };
}

/** Status setzen und das Panel neu zeichnen; „schon so“ (409) und Fehler stehen oben im Panel. */
async function switchTo(c: Ctx, status: 'ON_DUTY' | 'BREAK' | 'OFF_DUTY', type?: ShiftTypeInfo): Promise<Reply> {
  let notice: string;
  try {
    await c.api.asUser(c.discordId, 'PUT', '/team/me/status', { status, ...(type ? { shiftType: type.id } : {}) });
    notice = status === 'ON_DUTY' && type ? `🟢 Schicht **${plain(type.name)}** gestartet.` : `${DUTY_DE[status]!.emoji} Jetzt **${DUTY_DE[status]!.label}**.`;
  } catch (e) {
    notice = e instanceof BotApiError && e.status === 409 ? `Du bist bereits **${DUTY_DE[status]!.label}**.` : mapError(e).content ?? '❌ Das hat nicht geklappt.';
  }
  return manageReply(c, type, notice);
}

async function active(c: Ctx): Promise<Reply> {
  try {
    const rows = await c.api.asUser<OverviewRow[]>(c.discordId, 'GET', '/team/overview');
    const on = rows.filter((r) => r.dutyStatus !== 'OFF_DUTY').sort((a, b) => (a.onDutySince ?? '').localeCompare(b.onDutySince ?? ''));
    const lines = on.slice(0, 30).map((r) => `${DUTY_DE[r.dutyStatus]?.emoji ?? '•'} **${plain(r.callsign ?? r.name)}**${r.callsign ? ` (${plain(r.name)})` : ''}${r.shiftType ? ` · ${plain(r.shiftType)}` : ''}${r.onDutySince ? ` · seit ${ts(r.onDutySince, 'R')}` : ''}`);
    const onBreak = on.filter((r) => r.dutyStatus === 'BREAK').length;
    return { ephemeral: false, embeds: [{ title: `👮 Laufende Schichten (${on.length})`, color: on.length ? COLORS.success : COLORS.neutral,
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
    return { ephemeral: false, embeds: [{ title: `🏆 Rangliste (${period(r.days)})`, color: COLORS.info,
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
  return { ephemeral: false, embeds: [logEmbed(clip(`🕒 Schichten von ${plain(log.member.name)}`, 256), log, 'Im Zeitraum keine Schichten.')], ...(buttons.length ? { buttons } : {}) };
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
    publicReply: () => true, // alles rund um Schichten ist für alle im Channel sichtbar
    async complete(c, option, value) {
      if (option !== 'type') return [];
      const v = value.trim().toLowerCase();
      return (await shiftTypes(c)).filter((t) => permittedFor(c, t)).filter((t) => !v || t.name.toLowerCase().includes(v) || t.id.includes(v)).map((t) => ({ name: t.name, value: t.id }));
    },
    async run(c): Promise<Reply> {
      switch (c.opts._sub) {
        case 'active': return active(c);
        case 'leaderboard': return leaderboard(c);
        case 'admin': try { return await adminReply(c, String(c.opts.member ?? ''), days(c)); } catch (e) { return mapError(e); }
        case 'manage': {
          const wanted = String(c.opts.type ?? '').trim();
          try {
            const types = await shiftTypes(c);
            const t = pickType(c, types, wanted || undefined);
            if (t && !permittedFor(c, t)) return errorReply(`Für die Schichtart **${plain(t.name)}** fehlt dir die passende Rolle.`);
            if (wanted && !t) return errorReply(types.length ? `Unbekannte Schichtart. Verfügbar: ${types.map((x) => `**${plain(x.name)}**`).join(', ')}.` : 'Auf diesem Server sind keine Schichtarten eingerichtet – einfach `/shift manage` ohne Schichtart.');
            return await manageReply(c, t);
          } catch (e) { return mapError(e); }
        }
        default: return errorReply('Unbekannter Unterbefehl.');
      }
    },
  },
];

/**
 * Buttons aus `/shift manage` (zeichnen das Panel neu): `shift:on:<schichtart|leer>:<besitzer>`, `shift:break:<besitzer>` (Pause an/aus),
 * `shift:off:<besitzer>` – nur der Besitzer des Panels darf sie benutzen (ältere Panels ohne Besitzer: wer klickt);
 * aus `/shift admin`: `shift:end:<userId>:<discordId>` (Schicht eines Mitglieds beenden).
 */
export const SHIFT_INTERACTION: InteractionDef = {
  prefix: 'shift',
  updatesMessage: (args) => args[0] === 'on' || args[0] === 'break' || args[0] === 'off',
  async run(c): Promise<Reply> {
    const [action, userId, discordId] = c.args;
    const owner = action === 'on' ? discordId : action === 'break' || action === 'off' ? userId : undefined;
    if (owner && owner !== c.discordId) return errorReply(`Das ist die Schichtverwaltung von <@${owner}>. Für deine eigene Schicht: \`/shift manage\`.`);
    try {
      if (action === 'on') {
        const types = await shiftTypes(c);
        const t = userId ? findType(types, userId) : undefined;
        return await switchTo(c, 'ON_DUTY', t);
      }
      if (action === 'break') {
        const me = await c.api.asUser<{ status: string } | null>(c.discordId, 'GET', '/team/me');
        return await switchTo(c, me?.status === 'BREAK' ? 'ON_DUTY' : 'BREAK');
      }
      if (action === 'off') return await switchTo(c, 'OFF_DUTY');
    } catch (e) { return mapError(e); }
    if (action !== 'end' || !userId || !/^[0-9a-f-]{36}$/i.test(userId)) return errorReply('Unbekannte Aktion.');
    try {
      await c.api.asUser(c.discordId, 'PUT', `/team/${userId}/status`, { status: 'OFF_DUTY' });
    } catch (e) {
      if (!(e instanceof BotApiError && e.status === 409)) return mapError(e);
    }
    // öffentliche Nachricht aus `/shift admin` neu zeichnen, Bestätigung nur für den Klickenden
    try { return discordId ? { ...okReply('Schicht beendet.'), update: await adminReply(c, discordId) } : okReply('Schicht beendet.'); } catch { return okReply('Schicht beendet.'); }
  },
};
