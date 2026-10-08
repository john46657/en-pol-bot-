import { periodLabel, type ReportField, type ReportTemplate } from '@enrp/shared';
import { COLORS, errorReply, listEmbed, okReply, plain, type ModalSpec, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

interface Report { id: string; number: string; templateId: string; templateName: string; period: ReportTemplate['period']; periodStart: string; values: Record<string, string>; status: string; template: ReportTemplate | null; canEdit: boolean; version: number }
type Mode = 'n' | 'e';

/** Teilantworten mehrseitiger Formulare (Discord: max. 5 Felder je Formular) – 30 Minuten im Speicher. */
const drafts = new Map<string, { values: Record<string, string>; at: number }>();
const key = (c: Ctx, mode: Mode, id: string) => `${c.discordId}:${mode}:${id}`;
const sweep = () => { for (const [k, v] of drafts) if (Date.now() - v.at > 30 * 60_000) drafts.delete(k); };
const PAGE = 5;
const pages = (t: ReportTemplate) => Math.max(1, Math.ceil(t.fields.length / PAGE));

const hint = (f: ReportField) => (f.type === 'select' && f.options.length ? `z. B. ${f.options.join(' / ')}` : f.type === 'number' ? 'Zahl' : f.placeholder).slice(0, 100);
function modal(t: ReportTemplate, mode: Mode, id: string, page: number, values: Record<string, string>): ModalSpec {
  const n = pages(t);
  return {
    id: `drep:sub:${mode}:${id}:${page}`, title: `${t.name}${n > 1 ? ` (${page + 1}/${n})` : ''}`.slice(0, 45),
    fields: t.fields.slice(page * PAGE, page * PAGE + PAGE).map((f) => ({ id: f.id, label: f.label, paragraph: f.type === 'long', required: f.required, maxLength: Math.min(f.maxLength, 4000), ...(hint(f) ? { placeholder: hint(f) } : {}), ...(values[f.id] ? { value: values[f.id]!.slice(0, 4000) } : {}) })),
  };
}

async function templates(c: Ctx) { return c.api.asUser<ReportTemplate[]>(c.discordId, 'GET', '/duty-reports/templates?active=1'); }
async function load(c: Ctx, mode: Mode, id: string): Promise<{ t: ReportTemplate; values: Record<string, string>; report?: Report }> {
  if (mode === 'n') {
    const t = (await templates(c)).find((x) => x.id === id);
    if (!t) throw new Error('Vorlage nicht gefunden oder deaktiviert.');
    return { t, values: {} };
  }
  const r = await c.api.asUser<Report>(c.discordId, 'GET', `/duty-reports/${id}`);
  if (!r.template) throw new Error('Die Vorlage dieses Berichts gibt es nicht mehr – bitte im Dashboard bearbeiten.');
  if (!r.canEdit) throw new Error('Diesen Bericht darfst du nicht bearbeiten.');
  return { t: r.template, values: r.values, report: r };
}

function openModal(c: Ctx, t: ReportTemplate, mode: Mode, id: string, page: number, base: Record<string, string>): Reply {
  const k = key(c, mode, id);
  if (page === 0) drafts.set(k, { values: { ...base }, at: Date.now() });
  return { modal: modal(t, mode, id, page, drafts.get(k)?.values ?? base) };
}

/** Neuer Bericht: Dienstzeit usw. vorbelegen (aus den Dienst-Sitzungen); ohne API einfach leer. */
async function prefill(c: Ctx, t: ReportTemplate): Promise<Record<string, string>> {
  return c.api.asUser<{ values: Record<string, string> }>(c.discordId, 'GET', `/duty-reports/templates/${t.id}/prefill`).then((r) => r.values ?? {}, () => ({}));
}

export const DUTY_REPORT_COMMANDS: CommandDef[] = [{
  name: 'dienstbericht', description: 'Tages-/Wochenbericht ausfüllen, ansehen oder bearbeiten',
  subcommands: [
    { name: 'ausfuellen', description: 'Neuen Bericht nach einer Vorlage ausfüllen' },
    { name: 'meine', description: 'Deine letzten Berichte' },
    { name: 'anzeigen', description: 'Einen Bericht ansehen (und bearbeiten)', options: [{ name: 'nummer', description: 'Berichtsnummer, z. B. TB-2026-K7M2QX', type: 'string', required: true, maxLength: 40 }] },
  ],
  opensModal: true,
  async run(c) {
    sweep();
    try {
      const sub = String(c.opts._sub ?? 'ausfuellen');
      if (sub === 'meine') {
        const r = await c.api.asUser<{ items: Report[] }>(c.discordId, 'GET', '/duty-reports?mine=true&pageSize=10');
        return { ephemeral: true, embeds: [listEmbed('🗓️ Deine Berichte', r.items.map((x) => `**${x.number}** · ${plain(x.templateName)} – ${periodLabel(x.period, x.periodStart)}${x.status === 'REVIEWED' ? ' ✅' : ''}`), 'Noch keine Berichte.')] };
      }
      if (sub === 'anzeigen') {
        const r = await c.api.asUser<Report>(c.discordId, 'GET', `/duty-reports/${encodeURIComponent(String(c.opts.nummer ?? '').trim())}`);
        const t = r.template;
        return {
          ephemeral: true,
          embeds: [{ title: `${t?.emoji ?? '📝'} ${r.templateName} – ${periodLabel(r.period, r.periodStart)}`, color: COLORS.info, description: `**${r.number}**${r.status === 'REVIEWED' ? ' · ✅ geprüft' : ''}`, fields: (t?.fields ?? Object.keys(r.values).map((id) => ({ id, label: id }))).filter((f) => r.values[f.id]).map((f) => ({ name: f.label, value: r.values[f.id]!.slice(0, 1024) })) }],
          ...(r.canEdit ? { buttons: [{ id: `drep:edit:${r.id}`, label: 'Bearbeiten', emoji: '✏️', style: 'secondary' as const }] } : {}),
        };
      }
      const list = await templates(c);
      if (!list.length) return errorReply('Es gibt noch keine aktive Berichtsvorlage. Vorlagen legt man im Dashboard unter „Tages-/Wochenberichte“ an.');
      if (list.length === 1) return openModal(c, list[0]!, 'n', list[0]!.id, 0, await prefill(c, list[0]!));
      return { ephemeral: true, content: 'Welchen Bericht möchtest du ausfüllen?', select: { id: 'drep:pick', placeholder: 'Vorlage wählen …', options: list.slice(0, 25).map((t) => ({ label: t.name.slice(0, 100), value: t.id, ...(t.emoji ? { emoji: t.emoji } : {}), ...(t.description ? { description: t.description.slice(0, 100) } : {}) })) } };
    } catch (e) { return mapError(e); }
  },
}];

/** Buttons/Menüs/Formulare: drep:pick · drep:edit:<id> · drep:next:<n|e>:<id>:<seite> · drep:sub:<n|e>:<id>:<seite> */
export const DUTY_REPORT_INTERACTION: InteractionDef = {
  prefix: 'drep',
  opensModal: (args) => ['pick', 'edit', 'next'].includes(args[0] ?? ''),
  async run(c): Promise<Reply> {
    const [action, a1, a2, a3] = c.args;
    try {
      if (action === 'pick') {
        const id = c.values?.[0] ?? '';
        const { t } = await load(c, 'n', id);
        return openModal(c, t, 'n', id, 0, await prefill(c, t));
      }
      if (action === 'edit') {
        const { t, values } = await load(c, 'e', a1 ?? '');
        return openModal(c, t, 'e', a1 ?? '', 0, values);
      }
      const mode = (a1 === 'e' ? 'e' : 'n') as Mode, id = a2 ?? '', page = Number(a3 ?? 0);
      if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(page) || page < 0) return errorReply('Ungültige Anfrage.');
      const k = key(c, mode, id);
      if (action === 'next') {
        const d = drafts.get(k);
        if (!d) return errorReply('Die Eingabe ist abgelaufen – bitte neu beginnen.');
        const { t } = await load(c, mode, id);
        return openModal(c, t, mode, id, page, d.values);
      }
      if (action !== 'sub') return errorReply('Unbekannte Aktion.');
      const { t, report } = await load(c, mode, id);
      const d = drafts.get(k) ?? { values: { ...(report?.values ?? {}) }, at: Date.now() };
      d.values = { ...d.values, ...(c.fields ?? {}) };
      d.at = Date.now();
      drafts.set(k, d);
      if (page + 1 < pages(t)) return { ephemeral: true, content: `Seite ${page + 1} von ${pages(t)} gespeichert.`, buttons: [{ id: `drep:next:${mode}:${id}:${page + 1}`, label: `Weiter (${page + 2}/${pages(t)})`, emoji: '➡️', style: 'primary' }] };
      drafts.delete(k);
      if (mode === 'e') {
        const r = await c.api.asUser<{ number: string }>(c.discordId, 'PATCH', `/duty-reports/${id}`, { values: d.values });
        return okReply(`Bericht **${r.number}** aktualisiert – auch im Dashboard und in Discord.`);
      }
      const r = await c.api.asUser<{ number: string; merged: boolean }>(c.discordId, 'POST', '/duty-reports', { templateId: id, values: d.values, source: 'DISCORD', guildId: c.guildId ?? null });
      return okReply(r.merged ? `Für diesen Zeitraum gab es schon deinen Bericht **${r.number}** – er wurde aktualisiert.` : `Bericht **${r.number}** eingereicht. Du findest ihn auch im Dashboard; mit „Bearbeiten“ kannst du ihn ändern.`);
    } catch (e) {
      return e instanceof Error && !('status' in e) ? errorReply(e.message) : mapError(e);
    }
  },
};
