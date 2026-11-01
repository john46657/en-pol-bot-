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

export const ADMINISTRATION_COMMANDS: CommandDef[] = [SHIFTPLAN_COMMAND];
