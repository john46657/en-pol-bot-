import { clip, COLORS, errorReply, okReply, plain, type Reply } from '../format';
import type { CommandDef, InteractionDef } from './types';
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
];

type Decision = 'APPROVED' | 'DENIED';
async function decide(c: Parameters<InteractionDef['run']>[0], id: string, status: Decision, reason?: string): Promise<Reply> {
  try {
    const r = await c.api.asUser<{ number: string; name: string; decidedByName: string | null }>(c.discordId, 'POST', `/leave/${id}/decision`, { status, ...(reason ? { reason } : {}) });
    const ok = status === 'APPROVED';
    return {
      ...okReply(`Abmeldung **${r.number}** von ${plain(r.name)} ${ok ? '**angenommen**' : '**abgelehnt**'}. Die Person bekommt eine Direktnachricht.`),
      decided: { color: ok ? COLORS.success : COLORS.danger, text: clip(`${ok ? '✅ Angenommen' : '❌ Abgelehnt'} von <@${c.discordId}>${r.decidedByName ? ` (${plain(r.decidedByName)})` : ''}${reason ? `\n**Grund:** ${plain(reason)}` : ''}`, 1024) },
    };
  } catch (e) { return mapError(e); }
}

/** Buttons unter einem Abmelde-Antrag: `leave:decide:<id>:<status>`, `leave:reason:<id>:DENIED` (Formular), `leave:reasonsubmit:<id>:<status>`. */
export const LEAVE_INTERACTION: InteractionDef = {
  prefix: 'leave',
  opensModal: (args) => args[0] === 'reason',
  async run(c): Promise<Reply> {
    const [action, id, st] = c.args;
    const status = st === 'APPROVED' || st === 'DENIED' ? st : null;
    if (!id || !/^[0-9a-f-]{36}$/.test(id) || !status) return errorReply('Unbekannte Aktion.');
    if (action === 'decide') return decide(c, id, status);
    if (action === 'reason') return { modal: { id: `leave:reasonsubmit:${id}:${status}`, title: status === 'APPROVED' ? 'Annehmen mit Hinweis' : 'Ablehnen mit Grund', fields: [{ id: 'reason', label: 'Grund (geht per DM an die Person)', paragraph: true, required: true, maxLength: 1000 }] } };
    if (action === 'reasonsubmit') {
      const reason = (c.fields?.reason ?? '').trim();
      return reason ? decide(c, id, status, reason) : errorReply('Bitte einen Grund angeben.');
    }
    return errorReply('Unbekannte Aktion.');
  },
};
