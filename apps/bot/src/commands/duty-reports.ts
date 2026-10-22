import { periodLabel, type ReportField, type ReportTemplate } from '@enrp/shared';
import { COLORS, errorReply, listEmbed, okReply, plain, type ModalSpec, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';
import { BotApiError } from '../api';

interface Report { id: string; number: string; templateId: string; templateName: string; period: ReportTemplate['period']; periodStart: string; values: Record<string, string>; status: string; template: ReportTemplate | null; canEdit: boolean; canReview?: boolean; version: number; author?: { id: string; displayName: string }; reviewerName?: string | null; reviewNote?: string | null }
const STATUS_DE: Record<string, string> = { SUBMITTED: '🕓 eingereicht', REVIEWED: '✅ geprüft', RETURNED: '↩️ zur Nachbesserung' };
/** Filter für `/dienstbericht liste` (wie im Dashboard). */
const LIST_STATUS = { offen: 'SUBMITTED', zurueckgegeben: 'RETURNED', geprueft: 'REVIEWED', alle: '' } as const;
type Mode = 'n' | 'e';

/** Teilantworten mehrseitiger Formulare (Discord: max. 5 Felder je Formular) – 30 Minuten im Speicher. */
const drafts = new Map<string, { values: Record<string, string>; at: number }>();
const key = (c: Ctx, mode: Mode, id: string) => `${c.discordId}:${mode}:${id}`;
const sweep = () => { for (const [k, v] of drafts) if (Date.now() - v.at > 30 * 60_000) drafts.delete(k); };
const PAGE = 5;
const pages = (t: ReportTemplate) => Math.max(1, Math.ceil(t.fields.length / PAGE));

const hint = (f: ReportField) => (f.type === 'select' && f.options.length ? `z. B. ${f.options.join(' / ')}` : f.type === 'number' ? 'Zahl ab 0, z. B. 3' : f.placeholder).slice(0, 100);
function modal(t: ReportTemplate, mode: Mode, id: string, page: number, values: Record<string, string>): ModalSpec {
  const n = pages(t);
  return {
    id: `drep:sub:${mode}:${id}:${page}`, title: `${t.name}${n > 1 ? ` (${page + 1}/${n})` : ''}`.slice(0, 45),
    fields: t.fields.slice(page * PAGE, page * PAGE + PAGE).map((f) => ({ id: f.id, label: f.label, paragraph: f.type === 'long', required: f.required, maxLength: Math.min(f.maxLength, 4000), ...(hint(f) ? { placeholder: hint(f) } : {}), ...(values[f.id] ? { value: values[f.id]!.slice(0, 4000) } : {}) })),
  };
}

/** Einen Bericht zeigen: Felder, Verfasser, Status; „Bearbeiten“ bzw. für die Leitung „Geprüft“/„Zur Nachbesserung“. */
async function showReport(c: Ctx, idOrNumber: string): Promise<Reply> {
  const r = await c.api.asUser<Report>(c.discordId, 'GET', `/duty-reports/${encodeURIComponent(idOrNumber.trim())}`);
  const t = r.template;
  const head = [`**${r.number}** · ${STATUS_DE[r.status] ?? r.status}`, r.author ? `**Verfasser:** ${plain(r.author.displayName)}` : null, r.reviewerName ? `**Geprüft von:** ${plain(r.reviewerName)}` : null, r.status === 'RETURNED' && r.reviewNote ? `**Nachbessern:** ${plain(r.reviewNote)}` : null].filter(Boolean).join('\n');
  const buttons: NonNullable<Reply['buttons']> = [
    ...(r.canEdit ? [{ id: `drep:edit:${r.id}`, label: 'Bearbeiten', emoji: '✏️', style: 'secondary' as const }] : []),
    ...(r.canReview && r.status !== 'REVIEWED' ? [{ id: `drep:rev:${r.id}`, label: 'Geprüft', emoji: '✅', style: 'success' as const }] : []),
    ...(r.canReview && r.status !== 'RETURNED' ? [{ id: `drep:ret:${r.id}`, label: 'Zur Nachbesserung', emoji: '↩️', style: 'secondary' as const }] : []),
  ];
  return {
    ephemeral: true,
    embeds: [{ title: `${t?.emoji ?? '📝'} ${r.templateName} – ${periodLabel(r.period, r.periodStart)}`.slice(0, 256), color: r.status === 'REVIEWED' ? COLORS.success : r.status === 'RETURNED' ? COLORS.warning : COLORS.info, description: head.slice(0, 4000),
      fields: (t?.fields ?? Object.keys(r.values).map((id) => ({ id, label: id }))).filter((f) => r.values[f.id]).slice(0, 25).map((f) => ({ name: f.label.slice(0, 256), value: r.values[f.id]!.slice(0, 1024) })) }],
    ...(buttons.length ? { buttons } : {}),
  };
}

/** `/dienstbericht liste`: Berichte des Teams (mit „dutyreports.view_all“, sonst nur eigene) – gefiltert; Auswahl öffnet einen Bericht. */
async function listReply(c: Ctx): Promise<Reply> {
  const statusKey = String(c.opts.status ?? 'offen') as keyof typeof LIST_STATUS;
  const status = LIST_STATUS[statusKey] ?? 'SUBMITTED';
  const params = new URLSearchParams({ pageSize: '25' });
  if (status) params.set('status', status);
  if (c.opts.mitglied) params.set('discordId', String(c.opts.mitglied));
  const days = Number(c.opts.tage ?? 0);
  if (days > 0) params.set('from', new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10));
  const name = String(c.opts.vorlage ?? '').trim().toLowerCase();
  if (name) {
    const all = await templates(c, false);
    const t = all.find((x) => x.name.toLowerCase() === name) ?? all.find((x) => x.name.toLowerCase().includes(name));
    if (!t) return errorReply(`Keine Vorlage „${plain(name)}“ gefunden.`);
    params.set('templateId', t.id);
  }
  const r = await c.api.asUser<{ items: (Report & { author: { displayName: string } })[]; total: number; seeAll: boolean }>(c.discordId, 'GET', `/duty-reports?${params}`);
  const label = statusKey in LIST_STATUS ? { offen: 'Offen', zurueckgegeben: 'Zur Nachbesserung', geprueft: 'Geprüft', alle: 'Alle' }[statusKey] : 'Offen';
  const lines = r.items.map((x) => `**${x.number}** · ${r.seeAll ? `${plain(x.author.displayName)} · ` : ''}${plain(x.templateName)} – ${periodLabel(x.period, x.periodStart)}${status ? '' : ` · ${STATUS_DE[x.status] ?? x.status}`}`);
  const embed = listEmbed(`🗓️ ${r.seeAll ? 'Berichte' : 'Deine Berichte'} – ${label} (${r.total})`, lines, 'Keine Berichte gefunden.');
  if (r.total > r.items.length) embed.footer = `${r.total - r.items.length} weitere – Filter eingrenzen oder im Dashboard ansehen`;
  if (!r.items.length) return { ephemeral: true, embeds: [embed] };
  return { ephemeral: true, embeds: [embed], select: { id: 'drep:open', placeholder: 'Bericht öffnen …', options: r.items.slice(0, 25).map((x) => ({ label: `${x.number} · ${r.seeAll ? x.author.displayName : x.templateName}`.slice(0, 100), value: x.id, description: `${x.templateName} – ${periodLabel(x.period, x.periodStart)}`.slice(0, 100) })) } };
}

async function templates(c: Ctx, onlyActive = true) { return c.api.asUser<ReportTemplate[]>(c.discordId, 'GET', `/duty-reports/templates${onlyActive ? '?active=1' : ''}`); }
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
    { name: 'anzeigen', description: 'Einen Bericht ansehen (bearbeiten bzw. prüfen)', options: [{ name: 'nummer', description: 'Berichtsnummer, z. B. TB-2026-K7M2QX', type: 'string', required: true, maxLength: 40 }] },
    { name: 'liste', description: 'Berichte des Teams: offen, zur Nachbesserung, geprüft – zum Ansehen und Prüfen', options: [
      { name: 'status', description: 'Welche Berichte? (Standard: offen)', type: 'string', choices: Object.keys(LIST_STATUS).map((k) => ({ name: k === 'zurueckgegeben' ? 'zur Nachbesserung' : k === 'geprueft' ? 'geprüft' : k, value: k })) },
      { name: 'mitglied', description: 'Nur Berichte dieses Mitglieds', type: 'user' },
      { name: 'vorlage', description: 'Nur diese Vorlage (Name)', type: 'string', maxLength: 64 },
      { name: 'tage', description: 'Nur Zeiträume der letzten … Tage', type: 'integer', min: 1, max: 365 },
    ] },
  ],
  opensModal: true,
  async run(c) {
    sweep();
    try {
      const sub = String(c.opts._sub ?? 'ausfuellen');
      if (sub === 'meine') {
        const r = await c.api.asUser<{ items: Report[] }>(c.discordId, 'GET', '/duty-reports?mine=true&pageSize=10');
        return { ephemeral: true, embeds: [listEmbed('🗓️ Deine Berichte', r.items.map((x) => `**${x.number}** · ${plain(x.templateName)} – ${periodLabel(x.period, x.periodStart)}${x.status === 'REVIEWED' ? ' ✅' : x.status === 'RETURNED' ? ' ↩️ nachbessern' : ''}`), 'Noch keine Berichte.')] };
      }
      if (sub === 'anzeigen') return await showReport(c, String(c.opts.nummer ?? ''));
      if (sub === 'liste') return await listReply(c);
      const list = await templates(c);
      if (!list.length) return errorReply('Es gibt noch keine aktive Berichtsvorlage. Vorlagen legt man im Dashboard unter „Tages-/Wochenberichte“ an.');
      if (list.length === 1) return openModal(c, list[0]!, 'n', list[0]!.id, 0, await prefill(c, list[0]!));
      return { ephemeral: true, content: 'Welchen Bericht möchtest du ausfüllen?', select: { id: 'drep:pick', placeholder: 'Vorlage wählen …', options: list.slice(0, 25).map((t) => ({ label: t.name.slice(0, 100), value: t.id, ...(t.emoji ? { emoji: t.emoji } : {}), ...(t.description ? { description: t.description.slice(0, 100) } : {}) })) } };
    } catch (e) { return mapError(e); }
  },
}];

/** Buttons/Menüs/Formulare: drep:pick · drep:open · drep:edit:<id> · drep:next:<n|e>:<id>:<seite> · drep:sub:<n|e>:<id>:<seite> · drep:rev:<id> · drep:ret:<id> → drep:retsub:<id> */
export const DUTY_REPORT_INTERACTION: InteractionDef = {
  prefix: 'drep',
  opensModal: (args) => ['pick', 'edit', 'next', 'ret'].includes(args[0] ?? ''),
  async run(c): Promise<Reply> {
    const [action, a1, a2, a3] = c.args;
    try {
      if (action === 'open') {
        const id = c.values?.[0] ?? '';
        if (!/^[0-9a-f-]{36}$/.test(id)) return errorReply('Bitte einen Bericht auswählen.');
        return await showReport(c, id);
      }
      if (action === 'pick') {
        const id = c.values?.[0] ?? '';
        const { t } = await load(c, 'n', id);
        return openModal(c, t, 'n', id, 0, await prefill(c, t));
      }
      // Leitung: prüfen bzw. zur Nachbesserung zurückgeben (Recht dutyreports.review prüft das System)
      if (action === 'rev' || action === 'retsub') {
        if (!/^[0-9a-f-]{36}$/.test(a1 ?? '')) return errorReply('Ungültige Anfrage.');
        const note = String(c.fields?.note ?? '').trim();
        const r = await c.api.asUser<{ number: string }>(c.discordId, 'POST', `/duty-reports/${a1}/review`, action === 'rev' ? { decision: 'REVIEWED' } : { decision: 'RETURNED', note });
        return okReply(action === 'rev' ? `Bericht **${r.number}** als geprüft markiert.` : `Bericht **${r.number}** zur Nachbesserung zurückgegeben – der Verfasser wurde benachrichtigt.`);
      }
      if (action === 'ret') {
        if (!/^[0-9a-f-]{36}$/.test(a1 ?? '')) return errorReply('Ungültige Anfrage.');
        return { modal: { id: `drep:retsub:${a1}`, title: 'Zur Nachbesserung', fields: [{ id: 'note', label: 'Was soll nachgebessert werden?', paragraph: true, required: true, maxLength: 1000 }] } };
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
      // Entwurf erst nach dem erfolgreichen Speichern verwerfen – bei ungültigen Eingaben (z. B. negative Zahl) bleibt alles erhalten
      const fix = (e: unknown): Reply => {
        const r = mapError(e);
        return e instanceof BotApiError && e.status === 400 ? { ...r, buttons: [{ id: `drep:next:${mode}:${id}:0`, label: 'Eingaben korrigieren', emoji: '✏️', style: 'primary' }] } : r;
      };
      if (mode === 'e') {
        const r = await c.api.asUser<{ number: string }>(c.discordId, 'PATCH', `/duty-reports/${id}`, { values: d.values }).catch((e: unknown) => fix(e));
        if (!('number' in r)) return r;
        drafts.delete(k);
        return okReply(`Bericht **${r.number}** aktualisiert – auch im Dashboard und in Discord.`);
      }
      const r = await c.api.asUser<{ number: string; merged: boolean }>(c.discordId, 'POST', '/duty-reports', { templateId: id, values: d.values, source: 'DISCORD', guildId: c.guildId ?? null }).catch((e: unknown) => fix(e));
      if (!('number' in r)) return r;
      drafts.delete(k);
      return okReply(r.merged ? `Für diesen Zeitraum gab es schon deinen Bericht **${r.number}** – er wurde aktualisiert.` : `Bericht **${r.number}** eingereicht. Du findest ihn auch im Dashboard; mit „Bearbeiten“ kannst du ihn ändern.`);
    } catch (e) {
      return e instanceof Error && !('status' in e) ? errorReply(e.message) : mapError(e);
    }
  },
};
