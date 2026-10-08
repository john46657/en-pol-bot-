import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCircle2, Copy, Inbox, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PERIOD_LABEL, periodLabel, reportMessage, type ReportField, type ReportTemplate } from '@enrp/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { useServer } from '../lib/guilds';
import { useDocList } from '../lib/doclist';
import { ChannelPicker, RolePicker } from '../components/DiscordPickers';
import { ReportTabs } from '../components/ReportTabs';
import { DiscordPreview } from '../components/DiscordPreview';
import { Toggle } from '../components/ApplicationSettings';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea } from '../components/ui';

interface Report {
  id: string; number: string; templateId: string; templateName: string; period: ReportTemplate['period']; periodStart: string; values: Record<string, string>; status: 'SUBMITTED' | 'REVIEWED' | 'RETURNED'; reviewNote?: string | null; reviewedAt?: string | null;
  source: string; version: number; createdAt: string; updatedAt: string; author: { id: string; displayName: string };
}
interface Detail extends Report { template: ReportTemplate | null; canEdit: boolean; reviewerName?: string | null; posted: { channelId: string; messageId: string } | null }
const today = () => new Date().toISOString().slice(0, 10);

/** Ein Feld im Formular (Dashboard). */
function FieldInput({ f, value, onChange, disabled }: { f: ReportField; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const label = `${f.label}${f.required ? ' *' : ''}`;
  if (f.type === 'select' && f.options.length) return <label className="grid gap-1 text-sm">{label}<Select aria-label={f.label} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}><option value="">– wählen –</option>{f.options.map((o) => <option key={o}>{o}</option>)}</Select></label>;
  if (f.type === 'long') return <label className="grid gap-1 text-sm">{label}<Textarea aria-label={f.label} disabled={disabled} rows={4} maxLength={f.maxLength} placeholder={f.placeholder} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
  return <label className="grid gap-1 text-sm">{label}<Input aria-label={f.label} disabled={disabled} inputMode={f.type === 'number' ? 'decimal' : undefined} maxLength={f.maxLength} placeholder={f.placeholder} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
const missing = (t: ReportTemplate, v: Record<string, string>) => t.fields.filter((f) => f.required && !v[f.id]?.trim()).map((f) => f.label);

/** Neuer Bericht bzw. Bericht bearbeiten. */
function ReportForm({ template, initial, onDone, reportId, version }: { template: ReportTemplate; initial?: Record<string, string>; reportId?: string; version?: number; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(initial ?? {});
  const [date, setDate] = useState(today());
  const [err, setErr] = useState<string>();
  // Neuer Bericht: Dienstzeit automatisch aus den Dienst-Sitzungen (bleibt änderbar; Tag/Woche wechseln → neu berechnet)
  const auto = useQuery({ queryKey: ['duty-report-prefill', template.id, date], queryFn: () => api<{ values: Record<string, string> }>(`/duty-reports/templates/${template.id}/prefill`, { query: { date } }), enabled: !reportId && template.period !== 'FREE' });
  const [autoSet, setAutoSet] = useState<Record<string, string>>({});
  useEffect(() => {
    const v = auto.data?.values;
    if (!v) return;
    setValues((cur) => { const next = { ...cur }; for (const [k, x] of Object.entries(v)) if (!cur[k]?.trim() || cur[k] === autoSet[k]) next[k] = x; return next; });
    setAutoSet(v);
  }, [auto.data]);
  const save = useMutation({
    mutationFn: () => (reportId ? api<Report>(`/duty-reports/${reportId}`, { method: 'PATCH', body: { values, version } }) : api<Report & { merged: boolean }>('/duty-reports', { method: 'POST', body: { templateId: template.id, values, ...(template.period !== 'FREE' ? { periodStart: date } : {}) } })),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['duty-reports'] }); onDone(reportId ? `${r.number} gespeichert.` : 'merged' in r && r.merged ? `Für diesen Zeitraum gab es schon ${r.number} – aktualisiert.` : `${r.number} eingereicht.`); },
    onError: (e) => setErr(errText(e)),
  });
  const miss = missing(template, values);
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (!miss.length) save.mutate(); }}>
      {!reportId && template.period !== 'FREE' && <label className="grid gap-1 text-sm">{template.period === 'WEEKLY' ? 'Woche (ein Tag daraus)' : 'Tag'}<Input type="date" aria-label="Zeitraum" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /><span className="text-xs text-muted">{periodLabel(template.period, date)}</span></label>}
      {template.fields.map((f) => <div key={f.id}><FieldInput f={f} value={values[f.id] ?? ''} onChange={(v) => setValues({ ...values, [f.id]: v })} />{autoSet[f.id] && values[f.id] === autoSet[f.id] && <p className="mt-0.5 text-[11px] text-success">⏱️ automatisch aus deinen Dienstzeiten – du kannst es ändern.</p>}</div>)}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending || !!miss.length}>{reportId ? 'Speichern' : 'Einreichen'}</Button>
        {miss.length > 0 && <span className="text-xs text-muted">Noch offen: {miss.join(', ')}</span>}
      </div>
    </form>
  );
}

const StatusBadge = ({ status }: { status: string }) => (status === 'REVIEWED' ? <Badge tone="success">geprüft</Badge> : status === 'RETURNED' ? <Badge tone="warning">nachbessern</Badge> : <Badge tone="info">eingereicht</Badge>);

function ReportDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['duty-reports', 'detail', id], queryFn: () => api<Detail>(`/duty-reports/${id}`) });
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [note, setNote] = useState('');
  const review = useMutation({
    mutationFn: (decision: 'REVIEWED' | 'RETURNED' | 'SUBMITTED') => api(`/duty-reports/${id}/review`, { method: 'POST', body: { decision, ...(note.trim() ? { note: note.trim() } : {}) } }),
    onSuccess: (_r, d) => { setNote(''); setMsg(d === 'REVIEWED' ? 'Als geprüft markiert.' : d === 'RETURNED' ? 'Zur Nachbesserung zurückgegeben – der Verfasser wurde benachrichtigt.' : 'Prüfung zurückgenommen.'); void qc.invalidateQueries({ queryKey: ['duty-reports'] }); void q.refetch(); },
    onError: (e) => setMsg(errText(e)),
  });
  const remove = useMutation({ mutationFn: () => api(`/duty-reports/${id}`, { method: 'DELETE' }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['duty-reports'] }); onClose(); } });
  const r = q.data;
  const fields = r ? (r.template?.fields ?? Object.keys(r.values).map((k) => ({ id: k, label: k }) as ReportField)) : [];
  return (
    <Modal open title={r ? `${r.templateName} – ${periodLabel(r.period, r.periodStart)}` : 'Bericht'} onClose={onClose} wide>
      {q.isLoading ? <SkeletonRows /> : q.error || !r ? <ErrorState error={q.error} /> : edit && r.template ? (
        <ReportForm template={r.template} initial={r.values} reportId={r.id} version={r.version} onDone={(m) => { setEdit(false); setMsg(m); void q.refetch(); }} />
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="neutral">{r.number}</Badge>
            <StatusBadge status={r.status} />
            <span className="text-muted">von <b>{r.author.displayName}</b> · {r.source === 'DISCORD' ? 'über Discord' : 'im Dashboard'} · zuletzt {fmt(r.updatedAt)}{r.version > 1 ? ` · ${r.version - 1}× bearbeitet` : ''}</span>
          </div>
          <dl className="grid gap-3 md:grid-cols-2">{fields.filter((f) => r.values[f.id]).map((f) => <div key={f.id} className={f.type === 'long' ? 'md:col-span-2' : ''}><dt className="text-xs text-muted">{f.label}</dt><dd className="whitespace-pre-wrap">{r.values[f.id]}</dd></div>)}</dl>
          {r.status !== 'SUBMITTED' && (
            <div className={`rounded-md border p-2 text-sm ${r.status === 'RETURNED' ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10'}`}>
              <p className="font-medium">{r.status === 'RETURNED' ? '↩️ Zur Nachbesserung' : '✅ Geprüft'}{r.reviewerName ? ` von ${r.reviewerName}` : ''}{r.reviewedAt ? <span className="font-normal text-muted"> · {fmt(r.reviewedAt)}</span> : null}</p>
              {r.reviewNote && <p className="mt-1 whitespace-pre-wrap">{r.reviewNote}</p>}
              {r.status === 'RETURNED' && r.author.id === user?.id && <p className="mt-1 text-xs text-muted">Bearbeite den Bericht – danach ist er wieder eingereicht und die Leitung prüft erneut.</p>}
            </div>
          )}
          {can('dutyreports.review') && r.author.id !== user?.id && (
            <div className="grid gap-2 rounded-md border border-line p-2">
              <p className="text-xs font-medium text-muted">Leitung: Bericht bearbeiten</p>
              <Textarea aria-label="Anmerkung der Leitung" rows={2} maxLength={1000} placeholder="Anmerkung an den Verfasser (bei „Zur Nachbesserung“ Pflicht)…" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {r.status !== 'REVIEWED' && <Button size="sm" disabled={review.isPending} onClick={() => review.mutate('REVIEWED')}><CheckCircle2 size={14} className="mr-1" />Geprüft</Button>}
                {r.status !== 'RETURNED' && <Button size="sm" variant="secondary" disabled={review.isPending || !note.trim()} title={!note.trim() ? 'Erst eine Anmerkung schreiben' : undefined} onClick={() => review.mutate('RETURNED')}>↩️ Zur Nachbesserung</Button>}
                {r.status !== 'SUBMITTED' && <Button size="sm" variant="ghost" disabled={review.isPending} onClick={() => review.mutate('SUBMITTED')}>Prüfung zurücknehmen</Button>}
              </div>
            </div>
          )}
          {r.posted && <p className="text-xs text-muted">Steht auch in Discord – Änderungen werden dort automatisch übernommen.</p>}
          {msg && <p role="status" className="text-sm text-success">{msg}</p>}
          <div className="flex flex-wrap gap-2">
            {r.canEdit && r.template && <Button onClick={() => setEdit(true)}><Pencil size={14} className="mr-1" />Bearbeiten</Button>}
            {can('dutyreports.edit_all') && <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} className="mr-1" />Löschen</Button>}
          </div>
        </div>
      )}
      <ConfirmDialog open={del} danger title="Bericht löschen?" message="Der Bericht wird auch in Discord entfernt." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDel(false)} />
    </Modal>
  );
}

function ReportList({ templates }: { templates: ReportTemplate[] }) {
  const { can } = useAuth();
  const [server] = useServer();
  const [f, setF] = useState<{ templateId?: string; status?: string; q?: string; from?: string; to?: string; mine?: boolean }>({});
  const [open, setOpen] = useState<string>();
  const [create, setCreate] = useState<ReportTemplate>();
  const [msg, setMsg] = useState<string>();
  const q = useQuery({ queryKey: ['duty-reports', 'list', f, server], queryFn: () => api<{ items: Report[]; total: number; seeAll: boolean }>('/duty-reports', { query: { ...f, mine: f.mine ? 'true' : undefined, pageSize: 100 } }) });
  const active = templates.filter((t) => t.active);
  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="relative min-w-[200px] flex-1"><Search size={14} className="absolute left-3 top-3 text-muted" aria-hidden /><Input aria-label="Suchen" className="pl-8" placeholder="Suchen …" value={f.q ?? ''} onChange={(e) => setF({ ...f, q: e.target.value || undefined })} /></label>
          <Select aria-label="Vorlage" className="w-auto" value={f.templateId ?? ''} onChange={(e) => setF({ ...f, templateId: e.target.value || undefined })}><option value="">Alle Vorlagen</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}</Select>
          <Select aria-label="Status" className="w-auto" value={f.status ?? ''} onChange={(e) => setF({ ...f, status: e.target.value || undefined })}><option value="">Alle Status</option><option value="SUBMITTED">Eingereicht</option><option value="REVIEWED">Geprüft</option><option value="RETURNED">Zur Nachbesserung</option></Select>
          <Input type="date" aria-label="Von" className="w-auto" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} />
          <Input type="date" aria-label="Bis" className="w-auto" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} />
          {q.data?.seeAll && <label className="flex items-center gap-2 text-sm"><Toggle label="Nur meine" checked={!!f.mine} onChange={(v) => setF({ ...f, mine: v })} />Nur meine</label>}
          {can('dutyreports.create') && active.length > 0 && (
            <Select aria-label="Neuer Bericht" className="w-auto" value="" onChange={(e) => { const t = active.find((x) => x.id === e.target.value); if (t) { setCreate(t); setMsg(undefined); } }}>
              <option value="">＋ Neuer Bericht …</option>{active.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
            </Select>
          )}
        </div>
        {msg && <p role="status" className="mb-2 text-sm text-success">{msg}</p>}
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.items.length ? (
          <div className="py-10 text-center text-muted"><Inbox className="mx-auto mb-2" size={28} aria-hidden /><p>Keine Berichte.</p>{!templates.length && can('dutyreports.manage') && <p className="mt-1 text-xs">Lege zuerst unter „Vorlagen“ einen Tages- oder Wochenbericht an.</p>}</div>
        ) : (
          <div className="table-scroll"><table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-2">Nummer</th><th>Bericht</th><th>Zeitraum</th><th>Verfasser</th><th>Status</th><th>Aktualisiert</th></tr></thead>
            <tbody>{q.data.items.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-line/60 hover:bg-panel-2" onClick={() => setOpen(r.id)}>
                <td className="p-2 font-mono text-xs">{r.number}</td><td>{r.templateName}</td><td>{periodLabel(r.period, r.periodStart)}</td><td>{r.author.displayName}</td>
                <td><StatusBadge status={r.status} />{r.source === 'DISCORD' && <span className="ml-1 text-xs text-muted">Discord</span>}</td><td className="text-muted">{fmt(r.updatedAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {open && <ReportDetail id={open} onClose={() => setOpen(undefined)} />}
      {create && <Modal open title={`${create.emoji} ${create.name}`} onClose={() => setCreate(undefined)} wide><ReportForm template={create} onDone={(m) => { setCreate(undefined); setMsg(m); }} /></Modal>}
    </>
  );
}

// ───────────── Vorlagen ─────────────

const blankTemplate = (guildId: string | null, period: ReportTemplate['period'] = 'DAILY'): ReportTemplate => ({
  id: crypto.randomUUID(), name: period === 'WEEKLY' ? 'Wochenbericht' : 'Tagesbericht', emoji: period === 'WEEKLY' ? '📅' : '📝', description: '', period, active: true, guildId, channelId: null, color: '#3b82f6',
  fields: period === 'WEEKLY'
    ? [{ id: 'zusammenfassung', label: 'Zusammenfassung der Woche', type: 'long', placeholder: '', required: true, options: [], maxLength: 2000, inline: false }, { id: 'einsaetze', label: 'Anzahl Einsätze', type: 'number', placeholder: '', required: false, options: [], maxLength: 10, inline: true }, { id: 'besonderheiten', label: 'Besonderheiten', type: 'long', placeholder: '', required: false, options: [], maxLength: 2000, inline: false }]
    : [{ id: 'dienstzeit', label: 'Dienstzeit', type: 'short', placeholder: 'z. B. 18:00–21:00', required: true, options: [], maxLength: 50, inline: true }, { id: 'taetigkeiten', label: 'Tätigkeiten', type: 'long', placeholder: 'Was hast du gemacht?', required: true, options: [], maxLength: 2000, inline: false }, { id: 'vorkommnisse', label: 'Besondere Vorkommnisse', type: 'long', placeholder: '', required: false, options: [], maxLength: 2000, inline: false }],
  onePerPeriod: true, authorCanEdit: true, pingRoleIds: [],
});
const templateProblems = (t: ReportTemplate) => [!t.name.trim() && 'Name fehlt', !t.fields.length && 'Mindestens ein Feld', t.fields.some((f) => !/^[a-z0-9_]{1,30}$/.test(f.id)) && 'Kürzel: nur a–z, 0–9, _', new Set(t.fields.map((f) => f.id)).size !== t.fields.length && 'Kürzel doppelt', t.fields.some((f) => !f.label.trim()) && 'Feld ohne Beschriftung', t.fields.some((f) => f.type === 'select' && !f.options.length) && 'Auswahl ohne Möglichkeiten'].filter(Boolean) as string[];

function TemplateEditor({ t, set, manage }: { t: ReportTemplate; set: (p: Partial<ReportTemplate>) => void; manage: boolean }) {
  const field = (i: number, p: Partial<ReportField>) => set({ fields: t.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const move = (i: number, d: -1 | 1) => { const l = [...t.fields]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x!); set({ fields: l }); };
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[80px_1fr_180px]">
        <label className="grid gap-1 text-sm">Emoji<Input aria-label="Emoji" disabled={!manage} maxLength={16} value={t.emoji} onChange={(e) => set({ emoji: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Name<Input aria-label="Name" disabled={!manage} maxLength={60} value={t.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Zeitraum<Select aria-label="Zeitraum" disabled={!manage} value={t.period} onChange={(e) => set({ period: e.target.value as ReportTemplate['period'] })}><option value="DAILY">Täglich</option><option value="WEEKLY">Wöchentlich</option><option value="FREE">Frei</option></Select></label>
      </div>
      <label className="grid gap-1 text-sm">Beschreibung (optional)<Input aria-label="Beschreibung" disabled={!manage} maxLength={500} value={t.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <section className="grid gap-2">
        <h3 className="font-semibold">Felder ({t.fields.length}/20)</h3>
        {t.fields.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-line p-2">
            <div className="grid gap-2 md:grid-cols-[130px_1fr_140px_auto]">
              <Input aria-label={`Kürzel Feld ${i + 1}`} disabled={!manage} maxLength={30} value={f.id} onChange={(e) => field(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
              <Input aria-label={`Beschriftung Feld ${i + 1}`} disabled={!manage} maxLength={45} placeholder="Beschriftung" value={f.label} onChange={(e) => field(i, { label: e.target.value })} />
              <Select aria-label={`Art Feld ${i + 1}`} disabled={!manage} value={f.type} onChange={(e) => field(i, { type: e.target.value as ReportField['type'] })}><option value="short">Kurzer Text</option><option value="long">Langer Text</option><option value="number">Zahl</option><option value="select">Auswahl</option></Select>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label={`Feld ${i + 1} nach oben`} disabled={!manage || i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
                <Button size="sm" variant="ghost" aria-label={`Feld ${i + 1} nach unten`} disabled={!manage || i === t.fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
                <Button size="sm" variant="ghost" aria-label={`Feld ${i + 1} löschen`} disabled={!manage || t.fields.length <= 1} onClick={() => set({ fields: t.fields.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_110px_auto]">
              {f.type === 'select'
                ? <Input aria-label={`Möglichkeiten Feld ${i + 1}`} disabled={!manage} placeholder="Möglichkeiten, mit Komma getrennt" value={f.options.join(', ')} onChange={(e) => field(i, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 25) })} />
                : <Input aria-label={`Platzhalter Feld ${i + 1}`} disabled={!manage} maxLength={100} placeholder="Platzhalter (optional)" value={f.placeholder} onChange={(e) => field(i, { placeholder: e.target.value })} />}
              <Input aria-label={`Max. Länge Feld ${i + 1}`} type="number" min={1} max={4000} disabled={!manage} value={f.maxLength} onChange={(e) => field(i, { maxLength: Math.max(1, Math.min(4000, Number(e.target.value) || 1)) })} />
              <span className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1"><Toggle label={`Pflicht Feld ${i + 1}`} checked={f.required} onChange={(v) => field(i, { required: v })} />Pflicht</label>
                <label className="flex items-center gap-1"><Toggle label={`Nebeneinander Feld ${i + 1}`} checked={f.inline} onChange={(v) => field(i, { inline: v })} />nebeneinander</label>
              </span>
            </div>
          </div>
        ))}
        <Button size="sm" variant="secondary" className="w-fit" disabled={!manage || t.fields.length >= 20} onClick={() => set({ fields: [...t.fields, { id: `feld${t.fields.length + 1}`, label: 'Neues Feld', type: 'short', placeholder: '', required: false, options: [], maxLength: 500, inline: false }] })}><Plus size={14} className="mr-1" />Feld</Button>
        <p className="text-xs text-muted">In Discord kommen je 5 Felder auf eine Formularseite („Weiter“-Button dazwischen). Auswahl-Felder sind dort ein Textfeld mit Hinweis auf die Möglichkeiten.</p>
      </section>
      <details open className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm font-semibold">Discord & Regeln</summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Kanal für Berichte (leer = nur Dashboard)<ChannelPicker ariaLabel="Kanal für Berichte" disabled={!manage} value={t.channelId} onChange={(id) => set({ channelId: id })} /></label>
          <label className="grid gap-1 text-sm">Farbe<input type="color" aria-label="Farbe" disabled={!manage} value={t.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-16 rounded border border-line bg-transparent" /></label>
          <label className="grid gap-1 text-sm md:col-span-2">Rollen bei neuem Bericht erwähnen<RolePicker ariaLabel="Rollen erwähnen" disabled={!manage} max={10} value={t.pingRoleIds} onChange={(ids) => set({ pingRoleIds: ids })} /></label>
          <div className="grid gap-2 text-sm md:col-span-2">
            <label className="flex items-center gap-2"><Toggle label="Aktiv" checked={t.active} onChange={(v) => set({ active: v })} />Aktiv (kann ausgefüllt werden)</label>
            <label className="flex items-center gap-2"><Toggle label="Ein Bericht je Zeitraum" checked={t.onePerPeriod} onChange={(v) => set({ onePerPeriod: v })} />Ein Bericht je Person und Zeitraum (erneutes Ausfüllen aktualisiert ihn)</label>
            <label className="flex items-center gap-2"><Toggle label="Verfasser darf bearbeiten" checked={t.authorCanEdit} onChange={(v) => set({ authorCanEdit: v })} />Verfasser darf den Bericht nachträglich bearbeiten</label>
          </div>
        </div>
      </details>
    </div>
  );
}

function Templates() {
  const { can } = useAuth();
  const manage = can('dutyreports.manage');
  const L = useDocList<ReportTemplate>({ path: '/duty-reports/templates', key: 'report-templates', manage, valid: (t) => !templateProblems(t).length, label: 'Berichtsvorlage' });
  const [del, setDel] = useState<string>();
  const dup = useMutation({ mutationFn: (id: string) => api<ReportTemplate>(`/duty-reports/templates/${id}/duplicate`, { method: 'POST' }), onSuccess: (d) => L.add(d) });
  if (L.q.error) return <ErrorState error={L.q.error} onRetry={() => void L.q.refetch()} />;
  if (!L.docs) return <SkeletonRows />;
  const cur = L.current;
  if (!cur) return (
    <Card title="Vorlagen" actions={manage && <span className="flex gap-1"><Button size="sm" onClick={() => L.add(blankTemplate(L.server || null, 'DAILY'))}><Plus size={14} className="mr-1" />Tagesbericht</Button><Button size="sm" variant="secondary" onClick={() => L.add(blankTemplate(L.server || null, 'WEEKLY'))}><Plus size={14} className="mr-1" />Wochenbericht</Button></span>}>
      {!L.docs.length ? <EmptyState text="Noch keine Vorlagen." hint="Lege einen Tages- oder Wochenbericht an und stelle die Felder selbst zusammen." /> : (
        <ul className="grid gap-2">{L.docs.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
            <span aria-hidden className="h-8 w-1.5 rounded" style={{ background: t.color }} />
            <span className="font-semibold">{t.emoji} {t.name}</span>
            <Badge tone="info">{PERIOD_LABEL[t.period]}</Badge><Badge tone="neutral">{t.fields.length} Felder</Badge>
            {!t.active && <Badge tone="warning">inaktiv</Badge>}
            <span className="ml-auto flex gap-1">
              {manage && <Button size="sm" variant="ghost" aria-label={`${t.name} duplizieren`} onClick={() => dup.mutate(t.id)}><Copy size={14} /></Button>}
              <Button size="sm" variant="secondary" onClick={() => L.setOpen(t.id)}>Bearbeiten</Button>
            </span>
          </li>
        ))}</ul>
      )}
    </Card>
  );
  const sample = Object.fromEntries(cur.fields.map((f) => [f.id, f.type === 'number' ? '3' : f.type === 'select' ? f.options[0] ?? '' : f.placeholder || '…']));
  const preview = reportMessage(cur, { number: 'TB-2026-XXXXXX', period: cur.period, periodStart: new Date(), values: sample, authorName: 'Max Mustermann', status: 'SUBMITTED', updatedAt: new Date(), edited: false }, 'x');
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <Card title={`${cur.emoji} ${cur.name}`} actions={<span className="flex gap-1">{manage && <Button size="sm" variant="danger" aria-label="Vorlage löschen" onClick={() => setDel(cur.id)}><Trash2 size={14} /></Button>}<Button size="sm" variant="secondary" onClick={() => L.setOpen(undefined)}>Zurück</Button></span>}>
        <TemplateEditor t={cur} manage={manage} set={(p) => L.update({ ...cur, ...p })} />
        {templateProblems(cur).length > 0 && <p role="alert" className="mt-2 text-sm text-warning">{templateProblems(cur).join(' · ')}</p>}
      </Card>
      <div className="grid content-start gap-2 xl:sticky xl:top-4">
        <p className="text-xs font-semibold uppercase text-muted">So sieht ein Bericht in Discord aus</p>
        <DiscordPreview message={{ ...preview, embeds: preview.embeds?.map((e) => ({ ...e, description: e.description?.replace(/<@\d+>/g, '@Max') })) }} />
        <p className="text-xs text-muted">Änderungen werden automatisch gespeichert. In Discord: <code>/dienstbericht ausfuellen</code>.</p>
      </div>
      <ConfirmDialog open={!!del} danger title="Vorlage löschen?" message="Vorhandene Berichte bleiben erhalten." confirmLabel="Löschen" busy={L.remove.isPending} onConfirm={() => del && L.remove.mutate(del, { onSuccess: () => setDel(undefined) })} onClose={() => setDel(undefined)} />
    </div>
  );
}

/** 🗓️ Tages-/Wochenberichte: nach eigenen Vorlagen ausfüllen, ansehen und bearbeiten – im Dashboard und in Discord. */
export function DutyReports() {
  const { can } = useAuth();
  const [server] = useServer();
  const [tab, setTab] = useState('Berichte');
  const t = useQuery({ queryKey: ['report-templates', server], queryFn: () => api<ReportTemplate[]>('/duty-reports/templates') });
  const tabs = ['Berichte', ...(can('dutyreports.manage') ? ['Vorlagen'] : [])];
  return (
    <>
      <ReportTabs />
      <PageHeader title="🗓️ Tages-/Wochenberichte" subtitle="Eigene Vorlagen mit frei wählbaren Feldern. Ausfüllen, ansehen und bearbeiten im Dashboard und in Discord (/dienstbericht) – Änderungen erscheinen überall." />
      {tabs.length > 1 && <div className="mb-3"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>}
      {tab === 'Vorlagen' ? <Templates /> : t.error ? <ErrorState error={t.error} /> : !t.data ? <SkeletonRows /> : <ReportList templates={t.data} />}
    </>
  );
}
