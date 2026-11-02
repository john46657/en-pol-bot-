import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { localParts, zonedTime, EVENT_CATEGORIES, EVENT_CATEGORY_LABEL, RECURRENCE_FREQS, REMINDER_CHOICES } from '@enrp/shared';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { dayKey, fetchPeople, fmtDateTime, fmtTime, fromLocalInput, toLocalInput, TZ } from '../lib/admin';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../components/ui';

export interface CalItem {
  id: string; source: 'calendar' | 'shiftplan'; title: string; category: string; categoryLabel: string; startsAt: string; endsAt: string; allDay: boolean; department?: string | null; status: string;
  myStatus: string | null; location?: string | null; organizerName?: string; mandatory?: boolean; meetingId?: string | null; counts: Record<string, number>; maxParticipants?: number | null; openSignup?: boolean; version?: number;
  description?: string | null; reminders?: number[];
}
interface Detail extends CalItem { participants: { userId: string; name: string; status: string; statusLabel: string; note: string | null }[]; canEdit: boolean; cancelReason: string | null }
const CAT_TONE: Record<string, Tone> = { MEETING: 'info', TRAINING: 'success', EXAM: 'warning', SHIFT: 'neutral', EVENT: 'info', INTERNAL: 'neutral', DEADLINE: 'danger' };
const MY: Record<string, string> = { INVITED: 'eingeladen', ACCEPTED: 'zugesagt', DECLINED: 'abgesagt', EXCUSED: 'abwesend', ATTENDED: 'anwesend', ABSENT: 'nicht erschienen' };
const VIEWS = ['Monat', 'Woche', 'Tag', 'Übersicht'] as const;
type View = (typeof VIEWS)[number];
const REM_LABEL = (m: number) => (m >= 1440 ? `${m / 1440} Tag(e)` : m >= 60 ? `${m / 60} Std.` : `${m} Min.`);

/** Zeitraum der Ansicht (Organisationszeit). `offset` = Schritte vor/zurück. */
function rangeOf(view: View, offset: number) {
  const l = localParts(new Date(), TZ);
  if (view === 'Monat') { const from = zonedTime(l.y, l.m + offset, 1, 0, 0, TZ); const f = localParts(from, TZ); return { from: zonedTime(f.y, f.m, 1 - (f.wd - 1), 0, 0, TZ), to: zonedTime(f.y, f.m, 1 - (f.wd - 1) + 42, 0, 0, TZ), month: f.m }; }
  if (view === 'Woche') { const from = zonedTime(l.y, l.m, l.d - (l.wd - 1) + offset * 7, 0, 0, TZ); return { from, to: zonedTime(l.y, l.m, l.d - (l.wd - 1) + offset * 7 + 7, 0, 0, TZ), month: 0 }; }
  if (view === 'Tag') return { from: zonedTime(l.y, l.m, l.d + offset, 0, 0, TZ), to: zonedTime(l.y, l.m, l.d + offset + 1, 0, 0, TZ), month: 0 };
  return { from: zonedTime(l.y, l.m, l.d + offset * 30, 0, 0, TZ), to: zonedTime(l.y, l.m, l.d + offset * 30 + 30, 0, 0, TZ), month: 0 };
}

/** Organisation → Kalender: Monat/Woche/Tag/Übersicht, Filter, Teilnahme; Kalenderverwaltung legt Termine an. Schichten kommen aus dem Schichtplan. */
export function Calendar() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('Monat');
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const r = rangeOf(view, offset);
  const list = useQuery({ queryKey: ['calendar', r.from.toISOString(), r.to.toISOString(), category, department, mine], queryFn: () => api<{ items: CalItem[]; canManage: boolean; departments: string[] }>('/calendar', { query: { from: r.from.toISOString(), to: r.to.toISOString(), category: category || undefined, department: department || undefined, mine: mine || undefined } }) });
  const byDay = useMemo(() => { const m = new Map<string, CalItem[]>(); for (const e of list.data?.items ?? []) m.set(dayKey(e.startsAt), [...(m.get(dayKey(e.startsAt)) ?? []), e]); return m; }, [list.data]);
  const open = params.get('id');
  const pick = (e: CalItem) => (e.source === 'shiftplan' ? undefined : setParams({ id: e.id }));
  const label = view === 'Monat' ? new Date(r.from.getTime() + 15 * 86_400_000).toLocaleDateString('de-DE', { timeZone: TZ, month: 'long', year: 'numeric' }) : `${r.from.toLocaleDateString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit' })}${view === 'Tag' ? '' : ` – ${new Date(r.to.getTime() - 1).toLocaleDateString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })}`}`;
  const chip = (e: CalItem) => {
    const inner = <><span className="font-medium">{e.allDay ? '' : `${fmtTime(e.startsAt)} `}{e.title}</span>{e.myStatus && <span className="ml-1 text-muted">· {MY[e.myStatus]}</span>}</>;
    const cls = `block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] ${e.status === 'CANCELLED' ? 'line-through opacity-60' : ''} ${e.category === 'SHIFT' ? 'border-line bg-panel-2' : 'border-primary/30 bg-primary/10'}`;
    return e.source === 'shiftplan' ? <Link key={`s-${e.id}`} to={`/shiftplan?id=${e.id}`} className={cls} title="Schicht (Schichtplan)">🗓️ {inner}</Link> : <button key={e.id} type="button" className={cls} onClick={() => pick(e)}>{inner}</button>;
  };
  const days = (n: number) => Array.from({ length: n }, (_, i) => zonedTime(localParts(r.from, TZ).y, localParts(r.from, TZ).m, localParts(r.from, TZ).d + i, 12, 0, TZ));

  return (
    <>
      <PageHeader title="Kalender" subtitle="Dienstbesprechungen, Ausbildungen, Prüfungen, Schichten, Veranstaltungen, interne Termine und Fristen. Auch in Discord: /termine."
        actions={list.data?.canManage ? <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-1" />Termin</Button> : undefined} />
      <Tabs tabs={[...VIEWS]} active={view} onChange={(v) => { setView(v as View); setOffset(0); }} />
      <div className="my-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" aria-label="Zurück" onClick={() => setOffset(offset - 1)}><ChevronLeft size={16} /></Button>
        <span className="min-w-48 text-center text-sm font-medium">{label}</span>
        <Button variant="secondary" size="sm" aria-label="Weiter" onClick={() => setOffset(offset + 1)}><ChevronRight size={16} /></Button>
        {offset !== 0 && <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>Heute</Button>}
        <Select aria-label="Kategorie" className="w-48" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Alle Kategorien</option>{EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{EVENT_CATEGORY_LABEL[c]}</option>)}</Select>
        <Select aria-label="Abteilung" className="w-44" value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">Alle Abteilungen</option>{list.data?.departments.map((d) => <option key={d}>{d}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Nur meine</label>
      </div>
      {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : view === 'Monat' ? (
        <div className="overflow-x-auto"><div className="grid min-w-[700px] grid-cols-7 gap-px rounded-md border border-line bg-line text-xs">
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => <div key={d} className="bg-panel-2 p-1 text-center font-medium">{d}</div>)}
          {days(42).map((d) => { const k = dayKey(d); const l = localParts(d, TZ); const items = byDay.get(k) ?? []; return (
            <div key={k} className={`min-h-24 bg-panel p-1 ${l.m !== r.month ? 'opacity-50' : ''} ${k === dayKey(new Date()) ? 'ring-1 ring-inset ring-primary' : ''}`}>
              <button type="button" className="mb-1 text-[11px] text-muted hover:underline" onClick={() => { setView('Tag'); const today = localParts(new Date(), TZ); setOffset(Math.round((zonedTime(l.y, l.m, l.d, 0, 0, TZ).getTime() - zonedTime(today.y, today.m, today.d, 0, 0, TZ).getTime()) / 86_400_000)); }}>{l.d}</button>
              <div className="space-y-0.5">{items.slice(0, 4).map(chip)}{items.length > 4 && <p className="text-[10px] text-muted">+{items.length - 4} weitere</p>}</div>
            </div>
          ); })}
        </div></div>
      ) : view === 'Woche' ? (
        <div className="grid gap-2 md:grid-cols-7">{days(7).map((d) => { const k = dayKey(d); return (
          <div key={k} className="rounded-md border border-line p-2"><p className="mb-1 text-xs font-medium">{d.toLocaleDateString('de-DE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' })}</p><div className="space-y-1">{(byDay.get(k) ?? []).map(chip)}</div></div>
        ); })}</div>
      ) : !(list.data?.items.length) ? <EmptyState text="Keine Termine in diesem Zeitraum." /> : (
        <div className="grid gap-2">{list.data.items.map((e) => (
          <Card key={`${e.source}-${e.id}`} title={<span className="flex flex-wrap items-center gap-2">{e.title}<Badge tone={CAT_TONE[e.category] ?? 'neutral'}>{e.categoryLabel}</Badge>{e.mandatory && <Badge tone="warning">Pflicht</Badge>}{e.status === 'CANCELLED' && <Badge tone="danger">Abgesagt</Badge>}{e.myStatus && <Badge tone="success">{MY[e.myStatus]}</Badge>}</span>}
            actions={e.source === 'shiftplan' ? <Link className="text-xs underline" to={`/shiftplan?id=${e.id}`}>Schichtplan</Link> : <Button size="sm" variant="secondary" onClick={() => pick(e)}>Details</Button>}>
            <p className="text-sm">{e.allDay ? new Date(e.startsAt).toLocaleDateString('de-DE', { timeZone: TZ }) : `${fmtDateTime(e.startsAt)} – ${fmtTime(e.endsAt)}`}{e.location && ` · ${e.location}`}{e.department && ` · ${e.department}`}</p>
            <p className="text-xs text-muted">{e.organizerName ? `Organisation: ${e.organizerName} · ` : ''}{e.counts.accepted ?? 0} Zusagen{e.maxParticipants ? ` / ${e.maxParticipants} Plätze` : ''}</p>
          </Card>
        ))}</div>
      )}
      {open && <EventDetail id={open} onClose={() => setParams({})} />}
      {creating && <EventForm departments={list.data?.departments ?? []} onClose={() => setCreating(false)} />}
    </>
  );
}

export function EventDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['calendar', 'detail', id], queryFn: () => api<Detail>(`/calendar/${id}`), retry: false });
  const [err, setErr] = useState<string>();
  const [editing, setEditing] = useState(false);
  const act = useMutation({ mutationFn: (v: { path: string; body?: unknown }) => api(`/calendar/${id}/${v.path}`, { body: v.body ?? {} }), onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['calendar'] }); void qc.invalidateQueries({ queryKey: ['meetings'] }); }, onError: (e) => setErr(errText(e)) });
  const e = q.data;
  const started = e ? new Date(e.startsAt).getTime() <= Date.now() : false;
  if (editing && e) return <EventForm event={e} departments={[]} onClose={() => { setEditing(false); void q.refetch(); }} />;
  return (
    <Modal open wide title={e?.title ?? 'Termin'} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error || !e ? <ErrorState error={q.error} /> : (
        <div className="grid gap-3 text-sm">
          <p className="flex flex-wrap items-center gap-2"><Badge tone={CAT_TONE[e.category] ?? 'neutral'}>{e.categoryLabel}</Badge>{e.mandatory && <Badge tone="warning">Teilnahme verpflichtend</Badge>}{e.status === 'CANCELLED' && <Badge tone="danger">Abgesagt: {e.cancelReason}</Badge>}</p>
          <p>{fmtDateTime(e.startsAt)} – {fmtTime(e.endsAt)} Uhr{e.location && ` · ${e.location}`}{e.department && ` · ${e.department}`}</p>
          {e.description && <p className="whitespace-pre-wrap text-muted">{e.description}</p>}
          <p className="text-xs text-muted">Organisation: {e.organizerName}{e.reminders?.length ? ` · Erinnerung ${e.reminders.map(REM_LABEL).join(', ')} vorher` : ''}{e.meetingId && <> · <Link className="underline" to={`/meetings?id=${e.meetingId}`}>Besprechung öffnen</Link></>}</p>
          {e.status === 'SCHEDULED' && !started && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={act.isPending || e.myStatus === 'ACCEPTED'} onClick={() => act.mutate({ path: 'respond', body: { status: 'ACCEPTED' } })}>Zusagen</Button>
              <Button size="sm" variant="secondary" disabled={act.isPending || e.myStatus === 'DECLINED'} onClick={() => act.mutate({ path: 'respond', body: { status: 'DECLINED' } })}>Absagen</Button>
              <Button size="sm" variant="secondary" disabled={act.isPending || e.myStatus === 'EXCUSED'} onClick={() => { const n = window.prompt('Abwesenheit melden – Hinweis (optional, nur für die Organisation):'); if (n !== null) act.mutate({ path: 'respond', body: { status: 'EXCUSED', ...(n.trim() ? { note: n.trim() } : {}) } }); }}>Abwesenheit melden</Button>
              {e.myStatus && <span className="self-center text-xs text-muted">Dein Status: {MY[e.myStatus]}</span>}
            </div>
          )}
          {err && <p role="alert" className="text-danger">{err}</p>}
          <section aria-label="Teilnehmer"><h3 className="mb-1 font-semibold">Teilnehmer ({e.participants.length})</h3>
            {!e.participants.length ? <p className="text-xs text-muted">Noch niemand.</p> : (
              <table className="w-full text-xs"><tbody>{e.participants.map((p) => (
                <tr key={p.userId} className="border-b border-line/60"><td className="py-1">{p.name}</td><td>{p.statusLabel}</td><td className="text-muted">{p.note}</td>
                  {e.canEdit && started && e.status !== 'CANCELLED' && <td className="text-right"><Select aria-label={`Anwesenheit ${p.name}`} className="h-7 w-36 text-xs" value={['ATTENDED', 'ABSENT', 'EXCUSED'].includes(p.status) ? p.status : ''} onChange={(ev) => ev.target.value && act.mutate({ path: 'attendance', body: { entries: [{ userId: p.userId, status: ev.target.value }] } })}><option value="">Anwesenheit …</option><option value="ATTENDED">Anwesend</option><option value="ABSENT">Nicht erschienen</option><option value="EXCUSED">Entschuldigt</option></Select></td>}
                </tr>
              ))}</tbody></table>
            )}
          </section>
          {e.canEdit && e.status === 'SCHEDULED' && <ManageBar id={id} onEdit={() => setEditing(true)} onDone={() => void q.refetch()} />}
        </div>
      )}
    </Modal>
  );
}

function ManageBar({ id, onEdit, onDone }: { id: string; onEdit: () => void; onDone: () => void }) {
  const people = useQuery({ queryKey: ['shiftplan-people'], queryFn: fetchPeople, retry: false });
  const [who, setWho] = useState('');
  const [err, setErr] = useState<string>();
  const m = useMutation({ mutationFn: (v: { path: string; body: unknown }) => api(`/calendar/${id}/${v.path}`, { body: v.body }), onSuccess: () => { setErr(undefined); setWho(''); onDone(); }, onError: (e) => setErr(errText(e)) });
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
      <Button size="sm" variant="secondary" onClick={onEdit}>Bearbeiten / verschieben</Button>
      <Button size="sm" variant="danger" onClick={() => { const r = window.prompt('Grund der Absage (geht an alle Teilnehmer):'); if (r && r.trim().length >= 3) m.mutate({ path: 'cancel', body: { reason: r.trim() } }); }}>Absagen</Button>
      {people.data && <><Select aria-label="Teilnehmer hinzufügen" className="w-56" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Teilnehmer zuweisen …</option>{people.data.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</Select><Button size="sm" disabled={!who || m.isPending} onClick={() => m.mutate({ path: 'invite', body: { userIds: [who] } })}>Einladen</Button></>}
      {err && <p role="alert" className="w-full text-xs text-danger">{err}</p>}
    </div>
  );
}

function EventForm({ event, departments, onClose }: { event?: Detail; departments: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const start = new Date(Date.now() + 86_400_000); start.setMinutes(0, 0, 0);
  const [key] = useState(() => `dash-${crypto.randomUUID()}`); // ein Klick = ein Termin, auch bei doppeltem Absenden
  const [v, setV] = useState({ title: event?.title ?? '', description: event?.description ?? '', category: event?.category ?? 'EVENT', startsAt: toLocalInput(event?.startsAt ?? start), endsAt: toLocalInput(event?.endsAt ?? new Date(start.getTime() + 3_600_000)), allDay: event?.allDay ?? false, location: event?.location ?? '', department: event?.department ?? '', reminders: event?.reminders ?? [60], maxParticipants: event?.maxParticipants ? String(event.maxParticipants) : '', openSignup: event?.openSignup ?? true, freq: '', count: '4' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => {
      const body = { title: v.title, description: v.description || null, category: v.category, startsAt: fromLocalInput(v.startsAt), endsAt: fromLocalInput(v.endsAt), allDay: v.allDay, location: v.location || null, department: v.department || null, reminders: v.reminders, maxParticipants: v.maxParticipants ? Number(v.maxParticipants) : null, openSignup: v.openSignup };
      return event ? api(`/calendar/${event.id}`, { method: 'PATCH', body: { ...body, version: event.version } }) : api('/calendar', { body: { ...body, idempotencyKey: key, recurrence: v.freq ? { freq: v.freq, count: Number(v.count) } : null } });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['calendar'] }); onClose(); },
  });
  return (
    <Modal open wide title={event ? 'Termin bearbeiten' : 'Neuer Termin'} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Titel">{(id) => <Input id={id} required minLength={2} maxLength={150} value={v.title} onChange={set('title')} />}</Field>
        <Field label="Kategorie" hint={event?.category === 'MEETING' ? 'Besprechung' : 'Besprechungen über den Besprechungsmanager'}>{(id) => <Select id={id} disabled={event?.category === 'MEETING'} value={v.category} onChange={set('category')}>{EVENT_CATEGORIES.filter((c) => c !== 'SHIFT' && (c !== 'MEETING' || event?.category === 'MEETING')).map((c) => <option key={c} value={c}>{EVENT_CATEGORY_LABEL[c]}</option>)}</Select>}</Field>
        <Field label="Beginn (deutsche Zeit)">{(id) => <Input id={id} type="datetime-local" required value={v.startsAt} onChange={set('startsAt')} />}</Field>
        <Field label="Ende (deutsche Zeit)">{(id) => <Input id={id} type="datetime-local" required value={v.endsAt} onChange={set('endsAt')} />}</Field>
        <Field label="Ort">{(id) => <Input id={id} maxLength={150} value={v.location} onChange={set('location')} />}</Field>
        <Field label="Abteilung">{(id) => <Select id={id} value={v.department} onChange={set('department')}><option value="">alle</option>{departments.map((d) => <option key={d}>{d}</option>)}{v.department && !departments.includes(v.department) && <option>{v.department}</option>}</Select>}</Field>
        <Field label="Höchstzahl Teilnehmer" hint="leer = unbegrenzt">{(id) => <Input id={id} type="number" min={1} max={500} value={v.maxParticipants} onChange={set('maxParticipants')} />}</Field>
        <fieldset className="text-sm"><legend className="text-xs font-medium text-muted">Erinnerungen</legend><div className="mt-1 flex flex-wrap gap-2">{REMINDER_CHOICES.map((m) => <label key={m} className="flex items-center gap-1"><input type="checkbox" checked={v.reminders.includes(m)} onChange={(e) => setV({ ...v, reminders: e.target.checked ? [...v.reminders, m].slice(0, 4) : v.reminders.filter((x) => x !== m) })} />{REM_LABEL(m)}</label>)}</div></fieldset>
        <div className="sm:col-span-2"><Field label="Beschreibung">{(id) => <Textarea id={id} rows={3} maxLength={4000} value={v.description} onChange={set('description')} />}</Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.allDay} onChange={(e) => setV({ ...v, allDay: e.target.checked })} />Ganztägig</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.openSignup} onChange={(e) => setV({ ...v, openSignup: e.target.checked })} />Jeder darf sich anmelden</label>
        {!event && <><Field label="Wiederholen">{(id) => <Select id={id} value={v.freq} onChange={set('freq')}><option value="">einmalig</option>{RECURRENCE_FREQS.map((f) => <option key={f} value={f}>{({ DAILY: 'täglich', WEEKLY: 'wöchentlich', BIWEEKLY: 'alle 2 Wochen', MONTHLY: 'monatlich' } as Record<string, string>)[f]}</option>)}</Select>}</Field>{v.freq && <Field label="Anzahl (max. 52)">{(id) => <Input id={id} type="number" min={2} max={52} value={v.count} onChange={set('count')} />}</Field>}</>}
        {save.error && <p role="alert" className="text-sm text-danger sm:col-span-2">{errText(save.error)}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Speichert …' : 'Speichern'}</Button></div>
      </form>
    </Modal>
  );
}
