import { BotApiError } from '../api';
import { clip, COLORS, errorReply, okReply, plain, type EmbedData, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

/**
 * Verwaltung 3.0 im Bot: Schichtplan, Anträge, Termine/Besprechungen, Dokumente, Benachrichtigungen.
 * Alles läuft mit den Rechten des verknüpften Benutzers über die API (Allowlist); Antworten sind nur für den Aufrufer sichtbar.
 * Bewusst keine neuen öffentlichen Befehle für Planung/Verwaltung – das bleibt im Dashboard.
 */

const ts = (iso: string, style = 'f') => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
const span = (a: string, b: string) => `${ts(a, 'f')} – ${ts(b, 't')}`;
const str = (c: Ctx, k: string) => String(c.opts[k] ?? '').trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ───────────── Schichtplan ─────────────

interface ShiftRow {
  id: string; name: string; startsAt: string; endsAt: string; department: string | null; unit: string | null; leaderName: string | null; status: string; statusLabel: string;
  coverage: { assigned: number; min: number; max: number | null; state: 'UNDER' | 'OK' | 'FULL' }; assignees: { userId: string; name: string }[]; mine: boolean;
}
const covText = (s: ShiftRow) => `${s.coverage.state === 'UNDER' ? '🔴' : s.coverage.state === 'FULL' ? '🟢' : '🟡'} ${s.coverage.assigned}/${s.coverage.max ?? `${s.coverage.min}+`}`;
const shiftLine = (s: ShiftRow) => `**${plain(s.name)}** ${s.mine ? '· ✅ du' : ''}\n${span(s.startsAt, s.endsAt)} · ${covText(s)}${s.department ? ` · ${plain(s.department)}` : ''}${s.leaderName ? ` · Leitung: ${plain(s.leaderName)}` : ''}${s.status === 'CANCELLED' ? ' · ❌ abgesagt' : ''}`;

async function shifts(c: Ctx, days: number, mine = false) {
  const from = new Date(), to = new Date(Date.now() + days * 86_400_000);
  const r = await c.api.asUser<{ items: ShiftRow[] }>(c.discordId, 'GET', `/shiftplan?from=${from.toISOString()}&to=${to.toISOString()}${mine ? '&mine=true' : ''}`);
  return r.items.filter((s) => new Date(s.endsAt).getTime() > Date.now());
}

function planReply(items: ShiftRow[], title: string, empty: string): Reply {
  if (!items.length) return { ephemeral: true, embeds: [{ title, description: empty, color: COLORS.neutral }] };
  const open = items.filter((s) => s.status === 'PUBLISHED' && !s.mine && s.coverage.state !== 'FULL' && new Date(s.startsAt).getTime() > Date.now());
  const mine = items.filter((s) => s.mine && new Date(s.startsAt).getTime() > Date.now());
  const embed: EmbedData = { title, description: clip(items.slice(0, 15).map(shiftLine).join('\n\n'), 4000), color: COLORS.info, footer: items.length > 15 ? `${items.length - 15} weitere im Dashboard` : 'Zeiten in deiner Ortszeit' };
  const selects = [
    ...(open.length ? [{ id: 'splan:signup', placeholder: 'Für eine Schicht anmelden …', options: open.slice(0, 25).map((s) => ({ label: clip(s.name, 90), value: s.id, description: clip(new Date(s.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 90) })) }] : []),
    ...(mine.length ? [{ id: 'splan:withdraw', placeholder: 'Von einer Schicht abmelden …', options: mine.slice(0, 25).map((s) => ({ label: clip(s.name, 90), value: s.id, description: clip(new Date(s.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 90) })) }] : []),
  ];
  return { ephemeral: true, embeds: [embed], ...(selects.length ? { selects } : {}) };
}

async function signup(c: Ctx, id: string): Promise<Reply> {
  if (!uuid.test(id)) return errorReply('Bitte eine Schicht aus der Liste wählen.');
  try {
    const s = await c.api.asUser<ShiftRow>(c.discordId, 'POST', `/shiftplan/${id}/signup`);
    return okReply(`✅ Du bist für **${plain(s.name)}** angemeldet (${span(s.startsAt, s.endsAt)}).`);
  } catch (e) {
    if (e instanceof BotApiError && e.status === 409) return errorReply(e.message);
    return mapError(e);
  }
}
async function withdraw(c: Ctx, id: string, reason?: string): Promise<Reply> {
  if (!uuid.test(id)) return errorReply('Bitte eine Schicht aus der Liste wählen.');
  try {
    const s = await c.api.asUser<ShiftRow>(c.discordId, 'POST', `/shiftplan/${id}/withdraw`, reason ? { reason } : {});
    return okReply(`Du bist von **${plain(s.name)}** abgemeldet. Die Schichtleitung wurde informiert.`);
  } catch (e) {
    if (e instanceof BotApiError && e.status === 409) return errorReply(e.message);
    return mapError(e);
  }
}

const shiftOption = { name: 'schicht', description: 'Schicht (Vorschläge beim Tippen)', type: 'string' as const, required: true, autocomplete: true, maxLength: 64 };

export const SHIFTPLAN_COMMAND: CommandDef = {
  name: 'schichtplan', description: 'Schichtplan: ansehen, anmelden, abmelden, eigene Schichten, Änderungen melden',
  subcommands: [
    { name: 'anzeigen', description: 'Geplante Schichten der nächsten Tage', options: [{ name: 'tage', description: 'Zeitraum in Tagen (Standard 7)', type: 'integer', min: 1, max: 31 }] },
    { name: 'meine', description: 'Deine eingeteilten Schichten' },
    { name: 'uebersicht', description: 'Besetzung heute (geplant vs. im Dienst)' },
    { name: 'anmelden', description: 'Für eine Schicht anmelden', options: [shiftOption] },
    { name: 'abmelden', description: 'Von einer Schicht abmelden', options: [shiftOption, { name: 'grund', description: 'Grund (optional, nur für die Schichtleitung)', type: 'string', maxLength: 300 }] },
    { name: 'melden', description: 'Änderung zu deiner Schicht melden (z. B. später da)', options: [shiftOption, { name: 'nachricht', description: 'Was ist los?', type: 'string', required: true, maxLength: 500 }] },
  ],
  async complete(c, option, value) {
    if (option !== 'schicht') return [];
    try {
      const sub = String(c.opts._sub ?? '');
      const items = await shifts(c, 31, sub !== 'anmelden');
      const v = value.toLowerCase();
      return items.filter((s) => (sub === 'anmelden' ? s.status === 'PUBLISHED' && !s.mine : s.mine) && s.name.toLowerCase().includes(v)).slice(0, 25)
        .map((s) => ({ name: clip(`${s.name} · ${new Date(s.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, 100), value: s.id }));
    } catch { return []; }
  },
  async run(c) {
    const sub = String(c.opts._sub ?? 'anzeigen');
    try {
      if (sub === 'anzeigen') {
        const days = Number(c.opts.tage ?? 7);
        return planReply(await shifts(c, days), `🗓️ Schichtplan – nächste ${days} Tage`, 'Keine geplanten Schichten in diesem Zeitraum.');
      }
      if (sub === 'meine') {
        const items = await c.api.asUser<ShiftRow[]>(c.discordId, 'GET', '/shiftplan/mine');
        return planReply(items, '🗓️ Deine Schichten', 'Du bist für keine kommende Schicht eingeteilt.');
      }
      if (sub === 'uebersicht') {
        const today = await shifts(c, 1);
        if (!today.length) return { ephemeral: true, embeds: [{ title: '📋 Schichtübersicht heute', description: 'Heute sind keine Schichten geplant.', color: COLORS.neutral }] };
        return { ephemeral: true, embeds: [{ title: '📋 Schichtübersicht heute', color: COLORS.info, fields: today.slice(0, 20).map((s) => ({ name: clip(`${s.name} (${covText(s)})`, 256), value: clip(`${span(s.startsAt, s.endsAt)}\n${s.assignees.map((a) => plain(a.name)).join(', ') || '— noch niemand eingeteilt —'}`, 1024) })) }] };
      }
      if (sub === 'anmelden') return signup(c, str(c, 'schicht'));
      if (sub === 'abmelden') return withdraw(c, str(c, 'schicht'), str(c, 'grund') || undefined);
      if (sub === 'melden') {
        const id = str(c, 'schicht');
        if (!uuid.test(id)) return errorReply('Bitte eine Schicht aus der Liste wählen.');
        const r = await c.api.asUser<{ delivered: number }>(c.discordId, 'POST', `/shiftplan/${id}/report`, { message: str(c, 'nachricht') });
        return okReply(r.delivered ? 'Deine Meldung ist bei der Schichtleitung angekommen.' : 'Gemeldet und protokolliert (keine Schichtleitung hinterlegt).');
      }
      return errorReply('Unbekannter Unterbefehl.');
    } catch (e) {
      if (e instanceof BotApiError && e.status === 409) return errorReply(e.message);
      return mapError(e);
    }
  },
};

export const SHIFTPLAN_INTERACTION: InteractionDef = {
  prefix: 'splan',
  async run(c) {
    const id = c.values?.[0] ?? c.args[1] ?? '';
    if (c.args[0] === 'signup') return signup(c, id);
    if (c.args[0] === 'withdraw') return withdraw(c, id);
    return errorReply('Unbekannte Aktion.');
  },
};

// ───────────── Anträge (Beförderung/Versetzung) ─────────────

interface Targets { canPromotion: boolean; canTransfer: boolean; rank: string | null; department: string | null; ranks: { id: string; name: string; eligible: boolean; met: number; total: number; missing: string[] }[]; departments: string[] }
interface MyRequest { id: string; number: string; kind: string; statusLabel: string; status: string; fromLabel: string | null; toLabel: string | null; createdAt: string; openQuery: { question: string; askedByName: string } | null; decisions: { decision: string; comment: string | null; by: string }[]; canWithdraw: boolean }
const KIND = { befoerderung: 'PROMOTION', versetzung: 'TRANSFER' } as const;

async function requestTargets(c: Ctx) { return c.api.asUser<Targets>(c.discordId, 'GET', '/hr/requests/targets'); }
async function myRequests(c: Ctx) { return c.api.asUser<MyRequest[]>(c.discordId, 'GET', '/hr/requests/mine'); }

export const REQUEST_COMMAND: CommandDef = {
  name: 'antrag', description: 'Beförderung oder Versetzung beantragen, Status abrufen, Rückfragen beantworten',
  subcommands: [
    { name: 'befoerderung', description: 'Beförderung beantragen (nur mit erfüllten Voraussetzungen)', options: [{ name: 'rang', description: 'Gewünschter Rang', type: 'string', required: true, autocomplete: true, maxLength: 64 }, { name: 'begruendung', description: 'Begründung (mind. 10 Zeichen)', type: 'string', required: true, maxLength: 1500 }] },
    { name: 'versetzung', description: 'Versetzung in eine andere Abteilung beantragen', options: [{ name: 'abteilung', description: 'Gewünschte Abteilung', type: 'string', required: true, autocomplete: true, maxLength: 64 }, { name: 'begruendung', description: 'Begründung (mind. 10 Zeichen)', type: 'string', required: true, maxLength: 1500 }] },
    { name: 'status', description: 'Deine Anträge und ihr Status' },
    { name: 'antworten', description: 'Offene Rückfrage zu deinem Antrag beantworten', options: [{ name: 'antrag', description: 'Antrag mit Rückfrage', type: 'string', required: true, autocomplete: true, maxLength: 64 }, { name: 'antwort', description: 'Deine Antwort', type: 'string', required: true, maxLength: 1500 }] },
    { name: 'zurueckziehen', description: 'Eigenen offenen Antrag zurückziehen', options: [{ name: 'antrag', description: 'Antrag', type: 'string', required: true, autocomplete: true, maxLength: 64 }] },
  ],
  async complete(c, option, value) {
    const v = value.toLowerCase();
    try {
      if (option === 'rang') return (await requestTargets(c)).ranks.filter((r) => r.name.toLowerCase().includes(v)).slice(0, 25).map((r) => ({ name: clip(`${r.name}${r.eligible ? ' ✅' : ` (${r.met}/${r.total} Voraussetzungen)`}`, 100), value: r.id }));
      if (option === 'abteilung') return (await requestTargets(c)).departments.filter((d) => d.toLowerCase().includes(v)).slice(0, 25).map((d) => ({ name: clip(d, 100), value: d }));
      if (option === 'antrag') {
        const sub = String(c.opts._sub ?? '');
        return (await myRequests(c)).filter((r) => (sub === 'antworten' ? !!r.openQuery : r.canWithdraw) && `${r.number} ${r.toLabel ?? ''}`.toLowerCase().includes(v)).slice(0, 25).map((r) => ({ name: clip(`${r.number} · ${r.kind === 'PROMOTION' ? 'Beförderung' : 'Versetzung'} → ${r.toLabel ?? '—'}`, 100), value: r.id }));
      }
    } catch { /* keine Vorschläge */ }
    return [];
  },
  async run(c) {
    const sub = String(c.opts._sub ?? 'status');
    try {
      if (sub === 'befoerderung' || sub === 'versetzung') {
        const to = str(c, sub === 'befoerderung' ? 'rang' : 'abteilung');
        const r = await c.api.asUser<{ number: string }>(c.discordId, 'POST', '/hr/requests/self', { kind: KIND[sub], to, reason: str(c, 'begruendung') });
        return okReply(`📨 Dein ${sub === 'befoerderung' ? 'Beförderungs' : 'Versetzungs'}antrag **${plain(r.number)}** ist eingereicht. Eine berechtigte Führungskraft entscheidet – du bekommst Bescheid. Status: \`/antrag status\``);
      }
      if (sub === 'status') {
        const rows = await myRequests(c);
        if (!rows.length) return { ephemeral: true, embeds: [{ title: '📨 Deine Anträge', description: 'Du hast noch keine Anträge gestellt.', color: COLORS.neutral }] };
        return { ephemeral: true, embeds: [{ title: '📨 Deine Anträge', color: COLORS.info, fields: rows.slice(0, 10).map((r) => ({
          name: clip(`${r.number} · ${r.kind === 'PROMOTION' ? 'Beförderung' : 'Versetzung'} – ${r.statusLabel}`, 256),
          value: clip([`${plain(r.fromLabel ?? '—')} → **${plain(r.toLabel ?? '—')}** · eingereicht ${ts(r.createdAt, 'd')}`, r.openQuery ? `❓ **Rückfrage von ${plain(r.openQuery.askedByName)}:** ${plain(r.openQuery.question)}\nAntworten: \`/antrag antworten\`` : null, ...r.decisions.filter((d) => d.comment && ['REJECT', 'APPROVE'].includes(d.decision)).map((d) => `${d.decision === 'REJECT' ? '❌' : '✅'} ${plain(d.by)}: ${plain(d.comment!)}`)].filter(Boolean).join('\n'), 1024),
        })) }] };
      }
      if (sub === 'antworten') {
        const id = str(c, 'antrag');
        if (!uuid.test(id)) return errorReply('Bitte einen Antrag aus der Liste wählen.');
        await c.api.asUser(c.discordId, 'POST', `/hr/requests/${id}/answer`, { answer: str(c, 'antwort') });
        return okReply('Danke! Deine Antwort ist bei der prüfenden Person angekommen – der Antrag ist wieder in Prüfung.');
      }
      if (sub === 'zurueckziehen') {
        const id = str(c, 'antrag');
        if (!uuid.test(id)) return errorReply('Bitte einen Antrag aus der Liste wählen.');
        await c.api.asUser(c.discordId, 'POST', `/hr/requests/${id}/withdraw`);
        return okReply('Dein Antrag wurde zurückgezogen.');
      }
      return errorReply('Unbekannter Unterbefehl.');
    } catch (e) {
      if (e instanceof BotApiError && (e.status === 409 || e.status === 400)) return errorReply(e.message);
      return mapError(e);
    }
  },
};

// ───────────── Termine & Besprechungen ─────────────

interface EventRow { id: string; title: string; categoryLabel: string; startsAt: string; endsAt: string; allDay: boolean; location: string | null; status: string; myStatus: string | null; mandatory?: boolean; counts: { accepted: number }; maxParticipants: number | null; openSignup: boolean }
const MY: Record<string, string> = { INVITED: '📨 eingeladen', ACCEPTED: '✅ zugesagt', DECLINED: '✖️ abgesagt', EXCUSED: '🌴 abwesend gemeldet' };

async function respond(c: Ctx, id: string, status: 'ACCEPTED' | 'DECLINED' | 'EXCUSED'): Promise<Reply> {
  if (!uuid.test(id)) return errorReply('Bitte einen Termin aus der Liste wählen.');
  try {
    const e = await c.api.asUser<EventRow>(c.discordId, 'POST', `/calendar/${id}/respond`, { status });
    return okReply(`${status === 'ACCEPTED' ? '✅ Zugesagt' : status === 'DECLINED' ? '✖️ Abgesagt' : '🌴 Abwesenheit gemeldet'}: **${plain(e.title)}** (${ts(e.startsAt, 'f')}).`);
  } catch (e) {
    if (e instanceof BotApiError && e.status === 409) return errorReply(e.message);
    return mapError(e);
  }
}

export const EVENTS_COMMAND: CommandDef = {
  name: 'termine', description: 'Kommende Termine und Besprechungen: ansehen, zusagen, absagen',
  subcommands: [
    { name: 'liste', description: 'Kommende Termine', options: [{ name: 'tage', description: 'Zeitraum in Tagen (Standard 14)', type: 'integer', min: 1, max: 60 }, { name: 'nur_meine', description: 'Nur Termine, zu denen du eingeladen bist', type: 'boolean' }] },
    { name: 'anmelden', description: 'Für einen Termin zusagen', options: [{ name: 'termin', description: 'Termin', type: 'string', required: true, autocomplete: true, maxLength: 64 }] },
    { name: 'absagen', description: 'Für einen Termin absagen bzw. Abwesenheit melden', options: [{ name: 'termin', description: 'Termin', type: 'string', required: true, autocomplete: true, maxLength: 64 }, { name: 'abwesend', description: 'Als Abwesenheit melden (statt einfach absagen)', type: 'boolean' }] },
  ],
  async complete(c, option, value) {
    if (option !== 'termin') return [];
    try {
      const rows = await c.api.asUser<EventRow[]>(c.discordId, 'GET', '/calendar/upcoming?days=60');
      return rows.filter((e) => e.title.toLowerCase().includes(value.toLowerCase())).slice(0, 25).map((e) => ({ name: clip(`${e.title} · ${new Date(e.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`, 100), value: e.id }));
    } catch { return []; }
  },
  async run(c) {
    const sub = String(c.opts._sub ?? 'liste');
    try {
      if (sub === 'liste') {
        const days = Number(c.opts.tage ?? 14);
        const rows = await c.api.asUser<EventRow[]>(c.discordId, 'GET', `/calendar/upcoming?days=${days}&scope=${c.opts.nur_meine ? 'mine' : 'all'}`);
        if (!rows.length) return { ephemeral: true, embeds: [{ title: '📅 Kommende Termine', description: 'Keine Termine in diesem Zeitraum.', color: COLORS.neutral }] };
        const open = rows.filter((e) => e.myStatus !== 'ACCEPTED' && (e.openSignup || e.myStatus));
        return {
          ephemeral: true,
          embeds: [{ title: `📅 Kommende Termine (${days} Tage)`, color: COLORS.info, description: clip(rows.slice(0, 15).map((e) => `**${plain(e.title)}** · ${plain(e.categoryLabel)}${e.mandatory ? ' · Pflicht' : ''}\n${e.allDay ? ts(e.startsAt, 'D') : ts(e.startsAt, 'f')}${e.location ? ` · ${plain(e.location)}` : ''}${e.myStatus ? ` · ${MY[e.myStatus] ?? e.myStatus}` : ''}`).join('\n\n'), 4000) }],
          ...(open.length ? { select: { id: 'cal:accept', placeholder: 'Zusagen für …', options: open.slice(0, 25).map((e) => ({ label: clip(e.title, 90), value: e.id, description: clip(new Date(e.startsAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 90) })) } } : {}),
        };
      }
      if (sub === 'anmelden') return respond(c, str(c, 'termin'), 'ACCEPTED');
      if (sub === 'absagen') return respond(c, str(c, 'termin'), c.opts.abwesend ? 'EXCUSED' : 'DECLINED');
      return errorReply('Unbekannter Unterbefehl.');
    } catch (e) { return mapError(e); }
  },
};

/** Auswahl aus `/termine liste` und Buttons unter Besprechungs-Ankündigungen (`meet:accept:<terminId>`). */
export const CALENDAR_INTERACTION: InteractionDef = {
  prefix: 'cal',
  async run(c) { return c.args[0] === 'accept' ? respond(c, c.values?.[0] ?? '', 'ACCEPTED') : errorReply('Unbekannte Aktion.'); },
};
export const MEETING_INTERACTION: InteractionDef = {
  prefix: 'meet',
  async run(c) {
    const status = ({ accept: 'ACCEPTED', decline: 'DECLINED', excuse: 'EXCUSED' } as const)[c.args[0] as 'accept' | 'decline' | 'excuse'];
    return status ? respond(c, c.args[1] ?? '', status) : errorReply('Unbekannte Aktion.');
  },
};

export const ADMINISTRATION_COMMANDS: CommandDef[] = [SHIFTPLAN_COMMAND, REQUEST_COMMAND, EVENTS_COMMAND];
