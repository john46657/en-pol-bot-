import { z } from 'zod';
import type { EmbedSpec, MessageSpec } from './tickets';

const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');

export const REPORT_FIELD_TYPES = ['short', 'long', 'number', 'select'] as const;
export const reportFieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,30}$/, 'Kürzel: a–z, 0–9, _'),
  label: z.string().trim().min(1).max(45),
  type: z.enum(REPORT_FIELD_TYPES).default('short'),
  placeholder: z.string().max(100).default(''),
  required: z.boolean().default(true),
  /** nur bei Auswahl */
  options: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  maxLength: z.number().int().min(1).max(4000).default(1000),
  /** in Discord nebeneinander anzeigen */
  inline: z.boolean().default(false),
});
export const reportTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  emoji: z.string().max(16).default('📝'),
  description: z.string().max(500).default(''),
  period: z.enum(['DAILY', 'WEEKLY', 'FREE']).default('DAILY'),
  active: z.boolean().default(true),
  guildId: sf.nullable().default(null),
  /** Kanal, in den jeder Bericht gepostet wird (leer = nur Dashboard) */
  channelId: sf.nullable().default(null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  fields: z.array(reportFieldSchema).min(1).max(20),
  /** pro Person und Zeitraum nur ein Bericht (erneutes Ausfüllen bearbeitet den vorhandenen) */
  onePerPeriod: z.boolean().default(true),
  /** Verfasser darf nach dem Einreichen noch bearbeiten */
  authorCanEdit: z.boolean().default(true),
  /** Rollen, die beim neuen Bericht erwähnt werden */
  pingRoleIds: z.array(sf).max(10).default([]),
});
export type ReportTemplate = z.infer<typeof reportTemplateSchema>;
export type ReportField = z.infer<typeof reportFieldSchema>;

export const PERIOD_LABEL: Record<ReportTemplate['period'], string> = { DAILY: 'Tagesbericht', WEEKLY: 'Wochenbericht', FREE: 'Bericht' };

/** Beginn des Zeitraums (Europe/Berlin-nah: lokale Mitternacht des Servers; Woche ab Montag). */
export function periodStart(period: ReportTemplate['period'], d = new Date()): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (period === 'WEEKLY') x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}
const dd = (d: Date) => d.toLocaleDateString('de-DE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
/** ISO-Kalenderwoche */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}
export function periodLabel(period: ReportTemplate['period'], start: Date | string) {
  const s = new Date(start);
  if (period === 'WEEKLY') { const e = new Date(s); e.setUTCDate(e.getUTCDate() + 6); return `KW ${isoWeek(s)} (${dd(s).slice(0, 6)}–${dd(e)})`; }
  return dd(s);
}

/** Werte prüfen/zuschneiden; liefert Fehlertext oder die bereinigten Werte. */
export function cleanReportValues(t: ReportTemplate, input: Record<string, unknown>): { values: Record<string, string> } | { error: string } {
  const values: Record<string, string> = {};
  for (const f of t.fields) {
    const v = String(input[f.id] ?? '').trim().slice(0, f.maxLength);
    if (f.required && !v) return { error: `„${f.label}“ fehlt.` };
    if (v && f.type === 'number' && !/^-?\d+([.,]\d+)?$/.test(v)) return { error: `„${f.label}“ muss eine Zahl sein.` };
    if (v && f.type === 'select' && f.options.length && !f.options.includes(v)) return { error: `„${f.label}“: bitte eine der Möglichkeiten wählen (${f.options.join(', ')}).` };
    values[f.id] = v;
  }
  return { values };
}

export interface ReportView { number: string; period: ReportTemplate['period']; periodStart: string | Date; values: Record<string, string>; authorName: string; authorDiscordId?: string | null; status: string; updatedAt: string | Date; edited: boolean }

/** Bericht als Discord-Nachricht (mit „Bearbeiten“-Button). */
export function reportMessage(t: ReportTemplate, r: ReportView, id: string): MessageSpec {
  const fields = t.fields.filter((f) => r.values[f.id]).map((f) => ({ name: f.label, value: r.values[f.id]!.slice(0, 1024), inline: f.inline }));
  const embed: EmbedSpec = {
    title: `${t.emoji ? `${t.emoji} ` : ''}${t.name} – ${periodLabel(t.period, r.periodStart)}`.slice(0, 256),
    description: `**Verfasser:** ${r.authorDiscordId ? `<@${r.authorDiscordId}>` : r.authorName}${r.status === 'REVIEWED' ? '\n✅ **Geprüft**' : ''}`,
    color: parseInt(t.color.slice(1), 16), fields: fields.slice(0, 25),
    footer: `${r.number}${r.edited ? ' · bearbeitet' : ''}`, timestamp: new Date(r.updatedAt).toISOString(),
  };
  return { embeds: [embed], buttons: [{ id: `drep:edit:${id}`, label: 'Bearbeiten', emoji: '✏️', style: 'secondary' }] };
}
