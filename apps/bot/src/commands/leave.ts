import { clip, COLORS, errorReply, humanDuration, okReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

/** Zeitpunkt in deutscher Zeit (Europe/Berlin) → Date (berücksichtigt Sommer-/Winterzeit). */
export function berlinTime(y: number, m: number, d: number, h: number, min: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (shown - guess));
}

/**
 * Datum aus Discord-Eingabe: „heute“, „morgen“, „24.12.“, „24.12.2026“, optional mit Uhrzeit „24.12.2026 18:00“.
 * Ohne Uhrzeit: Beginn 00:00, Ende 23:59. `null` bei ungültiger Eingabe.
 */
export function parseLeaveDate(input: string, end: boolean, now = new Date()): Date | null {
  const t = input.trim().toLowerCase();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now).split('-').map(Number) as [number, number, number];
  let y: number, m: number, d: number, rest = '';
  const rel = t.match(/^(heute|morgen|übermorgen)(.*)$/);
  if (rel) {
    const add = rel[1] === 'heute' ? 0 : rel[1] === 'morgen' ? 1 : 2;
    const base = new Date(Date.UTC(today[0], today[1] - 1, today[2] + add));
    [y, m, d] = [base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate()];
    rest = rel[2] ?? '';
  } else {
    const x = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(.*)$/);
    if (!x) return null;
    d = Number(x[1]); m = Number(x[2]);
    y = x[3] ? (x[3].length === 2 ? 2000 + Number(x[3]) : Number(x[3])) : today[0];
    rest = x[4] ?? '';
    // „24.12.“ ohne Jahr, schon vorbei → nächstes Jahr
    if (!x[3] && Date.UTC(y, m - 1, d) < Date.UTC(today[0], today[1] - 1, today[2])) y++;
  }
  const time = rest.trim().replace(/^(um|,)\s*/, '').replace(/\s*uhr$/, '');
  let h = end ? 23 : 0, min = end ? 59 : 0;
  if (time) {
    const tm = time.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!tm) return null;
    h = Number(tm[1]); min = Number(tm[2] ?? 0);
    if (h > 23 || min > 59) return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1) return null; // z. B. 31.02.
  return berlinTime(y, m, d, h, min);
}

const fmt = (iso: string) => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const HOUR = 3_600_000;
const UNIT_MS: Record<string, number> = { m: 60_000, min: 60_000, h: HOUR, std: HOUR, d: 24 * HOUR, t: 24 * HOUR, w: 168 * HOUR };
/**
 * Dauer wie bei Trident: „6h“, „4d“, „2w“, auch kombiniert („1w 2d“) und deutsch („3t“ = 3 Tage, „5std“).
 * Ergebnis in Millisekunden; `null` bei ungültiger Eingabe oder unter einer Stunde.
 */
export function parseDuration(input: string): number | null {
  const t = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!t || !/^(\d+(?:[.,]\d+)?(?:min|std|m|h|d|t|w))+$/.test(t)) return null;
  let ms = 0;
  for (const [, n, u] of t.matchAll(/(\d+(?:[.,]\d+)?)(min|std|m|h|d|t|w)/g)) ms += Number(n!.replace(',', '.')) * UNIT_MS[u!]!;
  return ms >= HOUR && Number.isFinite(ms) ? Math.round(ms) : null;
}

interface LoaRow { id: string; number: string; status: string; active: boolean; startsAt: string; endsAt: string; reason: string; endedAt: string | null; decisionReason: string | null }
const ts = (iso: string, style = 'F') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;

/** Abschnitt „Aktuelle Abmeldung“ wie bei Trident: Status, Beginn, Ende, Dauer, Grund, ID. */
function currentBlock(r: LoaRow): string {
  const status = r.active ? '🟢 Aktiv' : r.status === 'PENDING' ? '🟡 Wartet auf Freigabe' : '📅 Geplant';
  return [`### Aktuelle Abmeldung`, `**Status**: ${status}`, `**Beginn**: ${ts(r.startsAt, 'f')}`, `**Ende**: ${ts(r.endsAt, 'f')} (${ts(r.endsAt, 'R')})`,
    `**Dauer**: ${humanDuration(new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime())}`, `**Grund**: ${clip(plain(r.reason), 800)}`, `-# ID: ${r.number}`].join('\n');
}
/** „Verlängern“ + „Vorzeitig beenden“ / „Antrag zurückziehen“ / „Absagen“ zur aktuellen Abmeldung. */
const currentButtons = (r: LoaRow): ButtonSpec[] => [
  { id: `leave:extend:${r.id}`, label: 'Verlängern', style: 'primary', emoji: '🕒' },
  { id: `leave:cancel:${r.id}`, label: r.active ? 'Vorzeitig beenden' : r.status === 'PENDING' ? 'Antrag zurückziehen' : 'Absagen', style: 'danger', emoji: '⏹️' },
];
/** Offene, laufende oder geplante Abmeldung (in dieser Reihenfolge). */
const currentOf = (items: LoaRow[]) => items.find((r) => r.status === 'APPROVED' && r.active) ?? items.find((r) => r.status === 'PENDING') ?? items.find((r) => r.status === 'APPROVED' && new Date(r.startsAt).getTime() > Date.now());

/** `/leave manage`: eigene Abmeldung ansehen, starten, verlängern, zurückziehen oder vorzeitig beenden (wie Trident). */
export async function manageReply(c: Ctx): Promise<Reply> {
  const { items } = await c.api.asUser<{ items: LoaRow[] }>(c.discordId, 'GET', '/leave?mine=true');
  const current = currentOf(items);
  const last = items.find((r) => r.status === 'ENDED');
  const box = (description: string): EmbedData => ({ box: true, heading: 'small', ...(c.userName ? { author: { name: `@${c.userName}`, ...(c.userAvatar ? { iconUrl: c.userAvatar } : {}) } } : {}), title: 'Abmeldungen verwalten', description });
  if (current) return { ephemeral: true, embeds: [box(currentBlock(current))], buttons: currentButtons(current) };
  const start = [{ id: 'leave:start', label: 'Start', style: 'primary' as const, emoji: '🕒' }];
  if (!items.length) return { ephemeral: true, embeds: [box('Du warst noch nie abgemeldet.\nUm jetzt eine Abmeldung zu starten, klicke auf `Start`.')], buttons: start };
  return { ephemeral: true, embeds: [box(`${last ? `Deine letzte Abmeldung endete ${ts(last.endedAt ?? last.endsAt)}.` : 'Du hast gerade keine Abmeldung.'}\nUm eine neue Abmeldung zu starten, klicke auf \`Start\`.`)], buttons: start };
}

const DAY_MS = 24 * HOUR;
/** Dauer kurz wie bei Trident: „[3 Tage]“, „[6 Std.]“. */
const span = (ms: number) => { const d = Math.round(ms / DAY_MS); if (d >= 1) return `${d} ${d === 1 ? 'Tag' : 'Tage'}`; const h = Math.max(1, Math.round(ms / HOUR)); return `${h} Std.`; };
const STATE_DE: Record<string, string> = { PENDING: '⏳ ausstehend', DENIED: '❌ abgelehnt', CANCELLED: '↩️ zurückgezogen' };
const leaveState = (r: LoaRow) => (r.active ? '🟢 läuft' : r.status === 'APPROVED' && new Date(r.startsAt).getTime() > Date.now() ? '📅 geplant' : STATE_DE[r.status] ?? '');
interface MemberLeave { member?: { userId: string; name: string }; items: LoaRow[] }
const memberHead = async (c: Ctx, discordId: string) => ({ name: `Abmeldungsverwaltung: @${(await c.userNameOf?.(discordId)) ?? discordId}` });

/** `/leave admin`: Abmeldungen eines Mitglieds verwalten (Leitung) – Verlauf, Abmeldung starten, beenden, erweiterter Verlauf (wie Trident). */
export async function adminReply(c: Ctx, discordId: string): Promise<Reply> {
  if (!/^\d{15,25}$/.test(discordId)) return errorReply('Bitte ein Mitglied auswählen.');
  const { items } = await c.api.asUser<MemberLeave>(c.discordId, 'GET', `/leave?discordId=${discordId}&status=ALL`);
  const current = currentOf(items);
  const list = items.slice(0, 10).map((r, i) => {
    const end = r.endedAt && r.status === 'ENDED' ? r.endedAt : r.endsAt;
    const st = leaveState(r);
    return `\`${i + 1}.\` ${ts(r.startsAt, 'f')} [${span(new Date(end).getTime() - new Date(r.startsAt).getTime())}]${st ? ` ${st}` : ''}`;
  });
  const description = current ? currentBlock(current) : `**Verlauf**\n${list.length ? list.join('\n') : 'Noch keine Abmeldungen.'}${items.length > 10 ? `\n… und ${items.length - 10} ältere` : ''}`;
  const buttons: Reply['buttons'] = [
    ...(current ? currentButtons(current) : [{ id: `leave:astart:${discordId}`, label: 'Start', style: 'primary' as const, emoji: '🕒' }]),
    ...(items.length ? [{ id: `leave:ahist:${discordId}`, label: 'Erweiterten Verlauf ansehen', style: 'secondary' as const, emoji: '📜' }] : []),
  ];
  return { ephemeral: true, embeds: [{ box: true, heading: 'small', author: await memberHead(c, discordId), title: 'Abmeldungen verwalten', description }], buttons };
}

/** Erweiterter Verlauf: jede Abmeldung mit ID, Beginn, Ende, Grund und Status. */
async function adminHistory(c: Ctx, discordId: string): Promise<Reply> {
  const { items } = await c.api.asUser<MemberLeave>(c.discordId, 'GET', `/leave?discordId=${discordId}&status=ALL`);
  if (!items.length) return okReply('Noch keine Abmeldungen.');
  const blocks = items.slice(0, 15).map((r) => {
    const st = leaveState(r);
    return clip([`\`${r.number}\`${st ? ` ${st}` : ''}`, `- **Beginn:** ${ts(r.startsAt, 'f')}`, `- **Ende:** ${ts(r.status === 'ENDED' && r.endedAt ? r.endedAt : r.endsAt, 'f')}`, `- **Grund:** ${clip(plain(r.reason), 300)}`,
      ...(r.decisionReason ? [`- **Entscheidung:** ${clip(plain(r.decisionReason), 200)}`] : [])].join('\n'), 900);
  });
  return { ephemeral: true, embeds: [{ box: true, heading: 'small', author: await memberHead(c, discordId), title: 'Verlauf der Abmeldungen', description: clip(blocks.join('\n\n'), 3900) }] };
}

/** Ansichten wie im Dashboard (Abmeldungen → Tabs). */
const LIST_VIEWS = { offen: ['PENDING', 'Offene Anträge'], aktiv: ['ACTIVE', 'Gerade abgemeldet'], geplant: ['UPCOMING', 'Bevorstehend'], kalender: ['CALENDAR', 'Nächste 4 Wochen'], alle: ['ALL', 'Alle Abmeldungen'] } as const;
type ListRow = LoaRow & { name: string; discordId: string | null; days: number };
const who = (r: ListRow) => (r.discordId ? `<@${r.discordId}>` : `**${plain(r.name)}**`);

/** `/leave liste`: Übersicht für die Leitung (ohne „leave.view“ nur die eigenen); bei offenen Anträgen Auswahl zum Entscheiden. */
export async function listReply(c: Ctx, view: string): Promise<Reply> {
  const [status, title] = LIST_VIEWS[view as keyof typeof LIST_VIEWS] ?? LIST_VIEWS.offen;
  const { all, items } = await c.api.asUser<{ all: boolean; items: ListRow[] }>(c.discordId, 'GET', `/leave?status=${status}`);
  // offene Anträge: älteste zuerst (wie eine Warteschlange), sonst nach Beginn
  const rows = status === 'PENDING' ? [...items].reverse() : status === 'CALENDAR' || status === 'UPCOMING' ? [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : items;
  const lines = rows.slice(0, 20).map((r) => `\`${r.number}\` ${all ? `${who(r)} · ` : ''}${ts(r.startsAt, 'd')} – ${ts(r.endsAt, 'd')} [${span(new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime())}]${status === 'ACTIVE' ? ` · bis ${ts(r.endsAt, 'R')}` : ''}${status === 'ALL' || status === 'CALENDAR' ? ` ${leaveState(r)}` : ''}\n> ${clip(plain(r.reason), 120)}`);
  const embed: EmbedData = { title: `📅 ${all ? title : `Deine Abmeldungen – ${title}`} (${items.length})`, color: status === 'PENDING' && items.length ? COLORS.warning : COLORS.info,
    description: clip(lines.length ? `${lines.join('\n')}${rows.length > 20 ? `\n… und ${rows.length - 20} weitere (im Dashboard)` : ''}` : 'Keine Einträge.', 4000) };
  if (status !== 'PENDING' || !all || !rows.length) return { ephemeral: true, embeds: [embed] };
  return { ephemeral: true, embeds: [embed], select: { id: 'leave:pick', placeholder: 'Antrag zum Entscheiden wählen …', options: rows.slice(0, 25).map((r) => ({ label: clip(`${r.number} · ${r.name}`, 100), value: r.id, description: clip(`${fmt(r.startsAt)} – ${fmt(r.endsAt)} · ${r.reason}`, 100) })) } };
}

/** Auswahl aus `/leave liste`: einen offenen Antrag mit „Annehmen“/„Ablehnen“ zeigen. */
async function pickReply(c: Ctx, id: string): Promise<Reply> {
  const { items } = await c.api.asUser<{ items: ListRow[] }>(c.discordId, 'GET', '/leave?status=PENDING');
  const r = items.find((x) => x.id === id);
  if (!r) return errorReply('Dieser Antrag ist nicht mehr offen.');
  return { ephemeral: true, embeds: [{ title: 'Abmeldeantrag', color: COLORS.warning, footer: `ID: ${r.number}`,
    description: `${who(r)}${r.discordId ? ` (${plain(r.name)})` : ''}\n**${ts(r.startsAt, 'f')}** bis **${ts(r.endsAt, 'f')}** (${span(new Date(r.endsAt).getTime() - new Date(r.startsAt).getTime())})`,
    fields: [{ name: 'Grund', value: clip(plain(r.reason), 1024) }] }],
    buttons: [{ id: `leave:decide:${r.id}:APPROVED`, label: 'Annehmen', style: 'success', emoji: '✅' }, { id: `leave:reason:${r.id}:DENIED`, label: 'Ablehnen', style: 'danger', emoji: '❌' }] };
}

export const LEAVE_COMMANDS: CommandDef[] = [
  {
    name: 'abmeldung', description: 'Abmeldung (Urlaub, Abwesenheit) beantragen – die Leitung entscheidet',
    options: [
      { name: 'von', description: 'Beginn, z. B. heute, 24.12. oder 24.12.2026 18:00', type: 'string', required: true, maxLength: 30 },
      { name: 'bis', description: 'Ende, z. B. 31.12. oder 02.01.2027', type: 'string', required: true, maxLength: 30 },
      { name: 'grund', description: 'Grund der Abmeldung', type: 'string', required: true, maxLength: 1000 },
    ],
    async run(c): Promise<Reply> {
      const from = parseLeaveDate(String(c.opts.von ?? ''), false), to = parseLeaveDate(String(c.opts.bis ?? ''), true);
      if (!from) return errorReply('„von“ verstehe ich nicht. Beispiele: `heute`, `24.12.`, `24.12.2026 18:00`.');
      if (!to) return errorReply('„bis“ verstehe ich nicht. Beispiele: `31.12.`, `02.01.2027`, `morgen 20:00`.');
      try {
        const r = await c.api.asUser<{ number: string; startsAt: string; endsAt: string; days: number }>(c.discordId, 'POST', '/leave', { startsAt: from.toISOString(), endsAt: to.toISOString(), reason: String(c.opts.grund ?? ''), ...(c.guildId ? { guildId: c.guildId } : {}) });
        return { ephemeral: true, embeds: [{ title: `📅 Abmeldung ${r.number} beantragt`, color: COLORS.info,
          description: `**${fmt(r.startsAt)}** bis **${fmt(r.endsAt)}** (${r.days} ${r.days === 1 ? 'Tag' : 'Tage'})\n\nDie Leitung entscheidet – du bekommst eine Direktnachricht.` }] };
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'leave', description: 'Abmeldungen (Leave of Absence)',
    subcommands: [
      { name: 'manage', description: 'Deine Abmeldung verwalten: starten, verlängern, beenden' },
      { name: 'liste', description: 'Übersicht: offene Anträge, gerade abgemeldet, bevorstehend, Kalender', options: [{ name: 'ansicht', description: 'Was anzeigen? (Standard: offen)', type: 'string', choices: Object.keys(LIST_VIEWS).map((k) => ({ name: k, value: k })) }] },
      { name: 'admin', description: 'Abmeldung eines Teammitglieds verwalten', options: [{ name: 'user', description: 'Das Teammitglied', type: 'user', required: true }] },
    ],
    async run(c): Promise<Reply> {
      try {
        if (c.opts._sub === 'admin') return await adminReply(c, String(c.opts.user ?? ''));
        if (c.opts._sub === 'liste') return await listReply(c, String(c.opts.ansicht ?? 'offen'));
        return await manageReply(c);
      } catch (e) { return mapError(e); }
    },
  },
];

type Decision = 'APPROVED' | 'DENIED';
async function decide(c: Parameters<InteractionDef['run']>[0], id: string, status: Decision, reason?: string): Promise<Reply> {
  try {
    const r = await c.api.asUser<{ number: string; name: string; decidedByName: string | null; endsAt: string }>(c.discordId, 'POST', `/leave/${id}/decision`, { status, ...(reason ? { reason } : {}) });
    const ok = status === 'APPROVED';
    const now = `<t:${Math.floor(Date.now() / 1000)}:f>`;
    return {
      ephemeral: true,
      embeds: [ok
        ? { title: 'Abmeldung angenommen', color: COLORS.success, description: `Diese Abmeldung endet ungefähr ${ts(r.endsAt)}.\nUm sie anzusehen oder zu ändern, nutze \`/leave admin\`.`, footer: `ID: ${r.number}` }
        : { title: 'Abmeldung abgelehnt', color: COLORS.danger, description: `Die Abmeldung von ${plain(r.name)} wurde abgelehnt. Die Person bekommt eine Direktnachricht.`, footer: `ID: ${r.number}` }],
      // wie Trident: über dem Antrag „Angenommen von @… am …“, statt der Buttons ein ausgegrautes „Angenommen“
      decided: { color: ok ? COLORS.success : COLORS.danger, note: `${ok ? 'Angenommen' : 'Abgelehnt'} von <@${c.discordId}> am ${now}`,
        badge: ok ? { label: 'Angenommen', style: 'success', emoji: '✔️' } : { label: 'Abgelehnt', style: 'danger', emoji: '✖️' },
        text: clip(`${ok ? '✅ Angenommen' : '❌ Abgelehnt'} von <@${c.discordId}>${r.decidedByName ? ` (${plain(r.decidedByName)})` : ''}${reason ? `\n**Grund:** ${plain(reason)}` : ''}`, 1024) },
    };
  } catch (e) { return mapError(e); }
}

/**
 * Buttons/Formulare: `leave:start` (Formular Dauer/Grund) → `leave:create`, `leave:cancel:<id>`,
 * Antrag: `leave:decide:<id>:<status>`, `leave:reason:<id>:DENIED` (Formular) → `leave:reasonsubmit:<id>:<status>`.
 */
export const LEAVE_INTERACTION: InteractionDef = {
  prefix: 'leave',
  opensModal: (args) => args[0] === 'reason' || args[0] === 'start' || args[0] === 'astart' || args[0] === 'extend',
  async run(c): Promise<Reply> {
    const [action, id, st] = c.args;
    // Leitung (/leave admin): Abmeldung für ein Mitglied starten (gilt sofort) bzw. erweiterten Verlauf zeigen
    if (action === 'ahist' && id) { try { return await adminHistory(c, id); } catch (e) { return mapError(e); } }
    if (action === 'astart' && id) return { modal: { id: `leave:acreate:${id}`, title: 'Abmeldung für Mitglied starten', fields: [
      { id: 'duration', label: 'Dauer', required: true, maxLength: 20, placeholder: "Format: '6h', '4d' oder '2w'" },
      { id: 'reason', label: 'Grund', paragraph: true, required: true, minLength: 3, maxLength: 1000, placeholder: 'z. B. Urlaub' },
    ] } };
    if (action === 'acreate' && id && /^\d{15,25}$/.test(id)) {
      const ms = parseDuration(c.fields?.duration ?? '');
      if (!ms) return errorReply('Die Dauer verstehe ich nicht. Beispiele: `6h`, `4d`, `2w` oder `1w 2d` (mindestens 1 Stunde).');
      const reason = (c.fields?.reason ?? '').trim();
      if (reason.length < 3) return errorReply('Bitte einen Grund angeben.');
      const now = Date.now();
      try {
        await c.api.asUser(c.discordId, 'POST', '/leave', { startsAt: new Date(now).toISOString(), endsAt: new Date(now + ms).toISOString(), reason, forDiscordId: id, ...(c.guildId ? { guildId: c.guildId } : {}) });
        return await adminReply(c, id);
      } catch (e) { return mapError(e); }
    }
    if (action === 'start') return { modal: { id: 'leave:create', title: 'Abmeldung erstellen', fields: [
      { id: 'duration', label: 'Dauer', required: true, maxLength: 20, placeholder: "Format: '6h', '4d' oder '2w'" },
      { id: 'reason', label: 'Grund', paragraph: true, required: true, minLength: 3, maxLength: 1000, placeholder: 'z. B. Urlaub, Prüfungsphase' },
    ] } };
    if (action === 'create') {
      const ms = parseDuration(c.fields?.duration ?? '');
      if (!ms) return errorReply('Die Dauer verstehe ich nicht. Beispiele: `6h`, `4d`, `2w` oder `1w 2d` (mindestens 1 Stunde).');
      const reason = (c.fields?.reason ?? '').trim();
      if (reason.length < 3) return errorReply('Bitte einen Grund angeben.');
      const now = Date.now();
      try {
        const r = await c.api.asUser<{ number: string; endsAt: string }>(c.discordId, 'POST', '/leave', { startsAt: new Date(now).toISOString(), endsAt: new Date(now + ms).toISOString(), reason, ...(c.guildId ? { guildId: c.guildId } : {}) });
        return { ephemeral: true, embeds: [{ title: `Abmeldung eingereicht · ${humanDuration(ms)}`, color: COLORS.neutral, footer: `ID: ${r.number}`,
          description: `Deine Abmeldung wurde der Leitung zur Freigabe vorgelegt.\nWenn sie angenommen wird, endet sie ungefähr ${ts(r.endsAt)}.\nUm benachrichtigt zu werden, ob sie angenommen oder abgelehnt wird, lass bitte deine DMs offen.` }] };
      } catch (e) { return mapError(e); }
    }
    if (action === 'pick') {
      const picked = c.values?.[0] ?? '';
      if (!/^[0-9a-f-]{36}$/.test(picked)) return errorReply('Bitte einen Antrag auswählen.');
      try { return await pickReply(c, picked); } catch (e) { return mapError(e); }
    }
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return errorReply('Unbekannte Aktion.');
    if (action === 'extend') return { modal: { id: `leave:extendsubmit:${id}`, title: 'Abmeldung verlängern', fields: [
      { id: 'duration', label: 'Um wie lange verlängern?', required: true, maxLength: 20, placeholder: "Format: '6h', '4d' oder '2w'" },
    ] } };
    if (action === 'extendsubmit') {
      const ms = parseDuration(c.fields?.duration ?? '');
      if (!ms) return errorReply('Die Dauer verstehe ich nicht. Beispiele: `6h`, `4d`, `2w` oder `1w 2d` (mindestens 1 Stunde).');
      try {
        const r = await c.api.asUser<{ number: string; endsAt: string }>(c.discordId, 'POST', `/leave/${id}/extend`, { minutes: Math.round(ms / 60_000) });
        return okReply(`Abmeldung **${r.number}** um ${humanDuration(ms)} verlängert – sie endet jetzt ungefähr ${ts(r.endsAt)} (${ts(r.endsAt, 'R')}).`);
      } catch (e) { return mapError(e); }
    }
    if (action === 'cancel') {
      try {
        const r = await c.api.asUser<{ number: string; status: string; name: string; discordId: string | null }>(c.discordId, 'POST', `/leave/${id}/cancel`);
        if (r.discordId && r.discordId !== c.discordId) return okReply(`Abmeldung **${r.number}** von ${plain(r.name)} ${r.status === 'ENDED' ? 'beendet' : 'abgesagt'}.`); // Leitung (/leave admin)
        return okReply(r.status === 'ENDED' ? `Deine Abmeldung **${r.number}** ist beendet – willkommen zurück!` : `Abmeldung **${r.number}** zurückgezogen.`);
      } catch (e) { return mapError(e); }
    }
    const status = st === 'APPROVED' || st === 'DENIED' ? st : null;
    if (!status) return errorReply('Unbekannte Aktion.');
    if (action === 'decide') return decide(c, id, status);
    if (action === 'reason') return { modal: { id: `leave:reasonsubmit:${id}:${status}`, title: status === 'APPROVED' ? 'Abmeldung annehmen' : 'Abmeldung ablehnen', fields: [{ id: 'reason', label: 'Grund', paragraph: true, required: true, maxLength: 1000 }] } };
    if (action === 'reasonsubmit') {
      const reason = (c.fields?.reason ?? '').trim();
      return reason ? decide(c, id, status, reason) : errorReply('Bitte einen Grund angeben.');
    }
    return errorReply('Unbekannte Aktion.');
  },
};
