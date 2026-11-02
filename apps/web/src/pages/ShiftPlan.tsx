import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Copy, Download, Plus, Send, UserPlus } from 'lucide-react';
import { localParts, zonedTime, RECURRENCE_FREQS } from '@enrp/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { dayKey, download, fetchPeople, fmtDay, fmtTime, fromLocalInput, toLocalInput, TZ } from '../lib/admin';
import { Badge, Button, Card, confirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Textarea, type Tone } from '../components/ui';
import { StaffingPanel } from '../components/StaffingPanel';

export interface ShiftView {
  id: string; name: string; startsAt: string; endsAt: string; department: string | null; description: string | null; unit: string | null; leaderId: string | null; leaderName: string | null;
  minStaff: number; maxStaff: number | null; status: string; statusLabel: string; cancelReason: string | null; version: number; mine: boolean;
  coverage: { assigned: number; min: number; max: number | null; state: 'UNDER' | 'OK' | 'FULL'; missing: number };
  assignees: { userId: string; name: string; source: string; absent: boolean }[];
}
const STATUS_TONE: Record<string, Tone> = { DRAFT: 'neutral', PUBLISHED: 'info', CANCELLED: 'danger', COMPLETED: 'success' };
const COV_TONE: Record<string, Tone> = { UNDER: 'danger', OK: 'warning', FULL: 'success' };
const FREQ_LABEL: Record<string, string> = { DAILY: 'täglich', WEEKLY: 'wöchentlich', BIWEEKLY: 'alle 2 Wochen', MONTHLY: 'monatlich' };

/** Montag 00:00 (Organisationszeit) der Woche von `d`, verschoben um `weeks`. */
function weekStart(weeks: number) {
  const l = localParts(new Date(), TZ);
  return zonedTime(l.y, l.m, l.d - (l.wd - 1) + weeks * 7, 0, 0, TZ);
}

/** Organisation → Schichtplan: Wochenansicht, Filter, an-/abmelden; Planung (shiftplan.manage) erstellt, veröffentlicht, weist zu. */
export function ShiftPlan() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [week, setWeek] = useState(0);
  const [department, setDepartment] = useState('');
  const [mine, setMine] = useState(false);
  const [edit, setEdit] = useState<ShiftView | 'new'>();
  const [assignFor, setAssignFor] = useState<ShiftView>();
  const [err, setErr] = useState<string>();
  const from = weekStart(week), to = weekStart(week + 1);
  const list = useQuery({ queryKey: ['shiftplan', from.toISOString(), department, mine], queryFn: () => api<{ manager: boolean; items: ShiftView[]; departments: string[] }>('/shiftplan', { query: { from: from.toISOString(), to: to.toISOString(), department: department || undefined, mine: mine || undefined } }) });
  const manager = !!list.data?.manager;
  const refresh = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['shiftplan'] }); };
  const act = useMutation({ mutationFn: (v: { id: string; action: string; body?: unknown; method?: string }) => api(`/shiftplan/${v.id}${v.action ? `/${v.action}` : ''}`, { method: v.method ?? 'POST', body: v.body }), onSuccess: refresh, onError: (e) => setErr(errText(e)) });
  const focus = params.get('id');
  const days = useMemo(() => {
    const m = new Map<string, ShiftView[]>();
    for (const s of list.data?.items ?? []) m.set(dayKey(s.startsAt), [...(m.get(dayKey(s.startsAt)) ?? []), s]);
    return [...m.entries()];
  }, [list.data]);

  const ask = async (s: ShiftView, kind: 'cancel' | 'delete' | 'withdraw' | 'report') => {
    if (kind === 'delete') { if (await confirmDialog(`„${s.name}“ endgültig löschen? Das geht nur bei Entwürfen ohne Zuweisungen.`, { confirmLabel: 'Löschen' })) act.mutate({ id: s.id, action: '', method: 'DELETE' }); return; }
    const text = window.prompt(kind === 'cancel' ? 'Grund der Absage (geht an alle Eingeteilten):' : kind === 'withdraw' ? 'Grund (optional, nur für die Schichtleitung):' : 'Was möchtest du melden? (z. B. „komme 15 Minuten später“)');
    if (text === null) return;
    if (kind !== 'withdraw' && text.trim().length < 3) { setErr('Bitte mindestens 3 Zeichen eingeben.'); return; }
    act.mutate({ id: s.id, action: kind, body: kind === 'cancel' ? { reason: text.trim() } : kind === 'report' ? { message: text.trim() } : (text.trim() ? { reason: text.trim() } : {}) });
  };
  const copy = (s: ShiftView) => {
    const v = window.prompt('Neuer Beginn (TT.MM.JJJJ HH:MM):', new Date(new Date(s.startsAt).getTime() + 7 * 86_400_000).toLocaleString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ''));
    const m = v?.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (!v) return;
    if (!m) { setErr('Format: TT.MM.JJJJ HH:MM'); return; }
    act.mutate({ id: s.id, action: 'copy', body: { startsAt: zonedTime(+m[3]!, +m[2]!, +m[1]!, +m[4]!, +m[5]!, TZ).toISOString() } });
  };

  return (
    <>
      <PageHeader title="Schichtplan" subtitle="Geplante Schichten. Der tatsächliche Dienst läuft weiter über die Stempeluhr (/shift) – die Leitstelle vergleicht beides. Auch in Discord: /schichtplan."
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void download(`/shiftplan/export?from=${from.toISOString()}&to=${to.toISOString()}${department ? `&department=${encodeURIComponent(department)}` : ''}`, 'schichtplan.csv').catch((e: Error) => setErr(e.message))}><Download size={16} className="mr-1" />CSV</Button>
          {manager && <Button onClick={() => setEdit('new')}><Plus size={16} className="mr-1" />Schicht planen</Button>}
        </div>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" aria-label="Vorige Woche" onClick={() => setWeek(week - 1)}><ChevronLeft size={16} /></Button>
        <span className="min-w-52 text-center text-sm font-medium">{from.toLocaleDateString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit' })} – {new Date(to.getTime() - 1).toLocaleDateString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
        <Button variant="secondary" size="sm" aria-label="Nächste Woche" onClick={() => setWeek(week + 1)}><ChevronRight size={16} /></Button>
        {week !== 0 && <Button variant="ghost" size="sm" onClick={() => setWeek(0)}>Diese Woche</Button>}
        <Select aria-label="Abteilung" className="w-48" value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">Alle Abteilungen</option>{list.data?.departments.map((d) => <option key={d}>{d}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Nur meine</label>
      </div>
      {err && <p role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</p>}
      {week === 0 && !mine && can('shiftplan.view') && <div className="mb-4"><StaffingPanel compact /></div>}
      {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !days.length ? <EmptyState text="In dieser Woche sind keine Schichten geplant." hint={manager ? 'Mit „Schicht planen“ anlegen – auch wiederkehrend.' : undefined} /> : (
        <div className="space-y-5">{days.map(([day, items]) => (
          <section key={day} aria-label={fmtDay(items[0]!.startsAt)}>
            <h2 className="mb-2 text-sm font-semibold text-muted">{fmtDay(items[0]!.startsAt)}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((s) => {
              const future = new Date(s.startsAt).getTime() > Date.now();
              const open = ['DRAFT', 'PUBLISHED'].includes(s.status);
              return (
                <Card key={s.id} className={focus === s.id ? 'ring-2 ring-primary' : s.status === 'CANCELLED' ? 'opacity-70' : undefined}
                  title={<span className="flex flex-wrap items-center gap-2">{s.name}<Badge tone={STATUS_TONE[s.status] ?? 'neutral'}>{s.statusLabel}</Badge>{s.mine && <Badge tone="success">Du</Badge>}</span>}>
                  <p className="text-sm">{fmtTime(s.startsAt)}–{fmtTime(s.endsAt)} Uhr{s.department && <> · {s.department}</>}{s.unit && <> · {s.unit}</>}</p>
                  <p className="mt-1 text-xs text-muted">Leitung: {s.leaderName ?? '—'}</p>
                  {s.description && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{s.description}</p>}
                  {s.cancelReason && <p className="mt-1 text-xs text-danger">Abgesagt: {s.cancelReason}</p>}
                  <div className="mt-2 flex items-center gap-2 text-xs"><Badge tone={COV_TONE[s.coverage.state] ?? 'neutral'}>Besetzung {s.coverage.assigned}/{s.maxStaff ?? `${s.minStaff}+`}</Badge>{s.coverage.missing > 0 && <span className="text-danger">{s.coverage.missing} fehlen</span>}</div>
                  <ul className="mt-2 flex flex-wrap gap-1 text-xs">{s.assignees.map((a) => (
                    <li key={a.userId} className={`rounded border px-1.5 py-0.5 ${a.absent ? 'border-warning/50 text-warning' : 'border-line'}`} title={a.absent ? 'Abgemeldet (genehmigte Abwesenheit)' : a.source === 'SIGNUP' ? 'Selbst angemeldet' : 'Zugewiesen'}>
                      {a.name}{a.absent && ' · abwesend'}
                      {manager && open && <button type="button" className="ml-1 text-muted hover:text-danger" aria-label={`${a.name} austragen`} onClick={() => act.mutate({ id: s.id, action: 'unassign', body: { userId: a.userId } })}>×</button>}
                    </li>
                  ))}</ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.status === 'PUBLISHED' && future && !s.mine && can('shiftplan.signup') && s.coverage.state !== 'FULL' && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'signup' })}>Anmelden</Button>}
                    {s.mine && future && open && <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => void ask(s, 'withdraw')}>Abmelden</Button>}
                    {s.mine && open && <Button size="sm" variant="ghost" onClick={() => void ask(s, 'report')}>Änderung melden</Button>}
                    {manager && open && <>
                      {s.status === 'DRAFT' && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'publish' })}><Send size={14} className="mr-1" />Veröffentlichen</Button>}
                      <Button size="sm" variant="secondary" onClick={() => setAssignFor(s)}><UserPlus size={14} className="mr-1" />Zuweisen</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>Bearbeiten</Button>
                      <Button size="sm" variant="ghost" onClick={() => void ask(s, 'cancel')}>Absagen</Button>
                      {s.status === 'DRAFT' && !s.assignees.length && <Button size="sm" variant="ghost" onClick={() => void ask(s, 'delete')}>Löschen</Button>}
                    </>}
                    {manager && <Button size="sm" variant="ghost" aria-label="Kopieren" onClick={() => copy(s)}><Copy size={14} /></Button>}
                  </div>
                </Card>
              );
            })}</div>
          </section>
        ))}</div>
      )}
      {edit && <ShiftForm shift={edit === 'new' ? undefined : edit} departments={list.data?.departments ?? []} onClose={() => setEdit(undefined)} onDone={() => { setEdit(undefined); refresh(); }} />}
      {assignFor && <AssignForm shift={assignFor} onClose={() => setAssignFor(undefined)} onDone={() => { setAssignFor(undefined); refresh(); }} />}
    </>
  );
}

function ShiftForm({ shift, departments, onClose, onDone }: { shift?: ShiftView; departments: string[]; onClose: () => void; onDone: () => void }) {
  const people = useQuery({ queryKey: ['shiftplan-people'], queryFn: fetchPeople });
  const start = new Date(Date.now() + 86_400_000); start.setMinutes(0, 0, 0);
  const [v, setV] = useState({
    name: shift?.name ?? '', startsAt: toLocalInput(shift?.startsAt ?? start), endsAt: toLocalInput(shift?.endsAt ?? new Date(start.getTime() + 4 * 3_600_000)),
    department: shift?.department ?? '', description: shift?.description ?? '', leaderId: shift?.leaderId ?? '', unit: shift?.unit ?? '',
    minStaff: String(shift?.minStaff ?? 1), maxStaff: shift?.maxStaff ? String(shift.maxStaff) : '', freq: '', count: '4', publish: false,
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => {
      const base = { name: v.name, startsAt: fromLocalInput(v.startsAt), endsAt: fromLocalInput(v.endsAt), department: v.department || null, description: v.description || null, leaderId: v.leaderId || null, unit: v.unit || null, minStaff: Number(v.minStaff), maxStaff: v.maxStaff ? Number(v.maxStaff) : null };
      return shift ? api(`/shiftplan/${shift.id}`, { method: 'PATCH', body: { ...base, version: shift.version } })
        : api('/shiftplan', { body: { ...base, publish: v.publish, recurrence: v.freq ? { freq: v.freq, count: Number(v.count) } : null } });
    },
    onSuccess: onDone,
  });
  return (
    <Modal open title={shift ? `Schicht bearbeiten: ${shift.name}` : 'Schicht planen'} onClose={onClose} wide>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name">{(id) => <Input id={id} required minLength={2} maxLength={100} value={v.name} onChange={set('name')} placeholder="z. B. Frühschicht Streife" />}</Field>
        <Field label="Abteilung">{(id) => <Select id={id} value={v.department} onChange={set('department')}><option value="">abteilungsübergreifend</option>{departments.map((d) => <option key={d}>{d}</option>)}</Select>}</Field>
        <Field label="Beginn (deutsche Zeit)">{(id) => <Input id={id} type="datetime-local" required value={v.startsAt} onChange={set('startsAt')} />}</Field>
        <Field label="Ende (deutsche Zeit)">{(id) => <Input id={id} type="datetime-local" required value={v.endsAt} onChange={set('endsAt')} />}</Field>
        <Field label="Verantwortlicher Leiter">{(id) => <Select id={id} value={v.leaderId} onChange={set('leaderId')}><option value="">—</option>{people.data?.map((p) => <option key={p.userId} value={p.userId}>{p.name}{p.rank ? ` (${p.rank})` : ''}</option>)}</Select>}</Field>
        <Field label="Einheit / Rufname">{(id) => <Input id={id} maxLength={40} value={v.unit} onChange={set('unit')} placeholder="optional" />}</Field>
        <Field label="Mindestbesetzung">{(id) => <Input id={id} type="number" min={0} max={200} required value={v.minStaff} onChange={set('minStaff')} />}</Field>
        <Field label="Maximale Besetzung" hint="leer = unbegrenzt">{(id) => <Input id={id} type="number" min={1} max={200} value={v.maxStaff} onChange={set('maxStaff')} />}</Field>
        <div className="sm:col-span-2"><Field label="Beschreibung">{(id) => <Textarea id={id} maxLength={2000} rows={3} value={v.description} onChange={set('description')} />}</Field></div>
        {!shift && <>
          <Field label="Wiederholen" hint="gleiche Uhrzeit, auch über die Zeitumstellung">{(id) => <Select id={id} value={v.freq} onChange={set('freq')}><option value="">einmalig</option>{RECURRENCE_FREQS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}</Select>}</Field>
          {v.freq ? <Field label="Anzahl Termine (max. 52)">{(id) => <Input id={id} type="number" min={2} max={52} value={v.count} onChange={set('count')} />}</Field> : <div />}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={v.publish} onChange={(e) => setV({ ...v, publish: e.target.checked })} />Sofort veröffentlichen (sonst als Entwurf – nur für die Planung sichtbar)</label>
        </>}
        {save.error && <p role="alert" className="text-sm text-danger sm:col-span-2">{errText(save.error)}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Speichert …' : 'Speichern'}</Button></div>
      </form>
    </Modal>
  );
}

function AssignForm({ shift, onClose, onDone }: { shift: ShiftView; onClose: () => void; onDone: () => void }) {
  const people = useQuery({ queryKey: ['shiftplan-people'], queryFn: fetchPeople });
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const taken = new Set(shift.assignees.map((a) => a.userId));
  const list = (people.data ?? []).filter((p) => !taken.has(p.userId) && (!q || `${p.name} ${p.rank ?? ''} ${p.department ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const save = useMutation({ mutationFn: () => api(`/shiftplan/${shift.id}/assign`, { body: { userIds: pick } }), onSuccess: onDone });
  return (
    <Modal open title={`Zuweisen: ${shift.name}`} onClose={onClose}>
      <p className="mb-2 text-xs text-muted">Überschneidungen mit anderen Schichten und genehmigte Abwesenheiten werden geprüft – betroffene Personen können nicht eingeteilt werden.</p>
      <Input aria-label="Suche" placeholder="Name, Rang, Abteilung …" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 max-h-72 space-y-1 overflow-auto">{people.isLoading ? <SkeletonRows rows={3} /> : list.map((p) => (
        <li key={p.userId}><label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-panel-2"><input type="checkbox" checked={pick.includes(p.userId)} onChange={(e) => setPick(e.target.checked ? [...pick, p.userId] : pick.filter((x) => x !== p.userId))} />{p.name}<span className="text-xs text-muted">{[p.rank, p.department].filter(Boolean).join(' · ')}</span></label></li>
      ))}</ul>
      {save.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(save.error)}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={!pick.length || save.isPending} onClick={() => save.mutate()}>{pick.length} zuweisen</Button></div>
    </Modal>
  );
}
