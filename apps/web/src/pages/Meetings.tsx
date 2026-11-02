import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Download, Plus } from 'lucide-react';
import { REMINDER_CHOICES } from '@enrp/shared';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { download, fetchPeople, fmtDateTime, fmtTime, fromLocalInput, toLocalInput } from '../lib/admin';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea } from '../components/ui';
import { EventDetail } from './Calendar';

interface Row { id: string; eventId: string; title: string; startsAt: string; endsAt: string; location: string | null; status: string; organizerName: string; mandatory: boolean; private: boolean; conductedAt: string | null; hasMinutes: boolean; openTasks: number; myStatus: string | null; counts: { invited: number; accepted: number; attended: number } }
interface Detail {
  id: string; eventId: string; mandatory: boolean; private: boolean; conductedAt: string | null; version: number; discordChannelId: string | null;
  event: { title: string; startsAt: string; endsAt: string; status: string; location: string | null; organizerName: string; participants: { userId: string; name: string; statusLabel: string }[] };
  minutes: { agenda: string | null; notes: string | null; decisions: string | null; followUp: string | null; hidden?: boolean };
  tasks: { id: string; title: string; assigneeName: string | null; dueAt: string | null; status: string }[];
  can: { minutes: boolean; organize: boolean; readMinutes: boolean };
}
interface Task { id: string; title: string; meetingId: string; meetingTitle: string; assigneeName: string | null; dueAt: string | null; overdue: boolean }
const TABS = ['Kommende', 'Vergangene', 'Offene Aufgaben'] as const;
const REM = (m: number) => (m >= 1440 ? `${m / 1440} T` : m >= 60 ? `${m / 60} h` : `${m} min`);

/** Organisation → Besprechungen: planen, Discord-Ankündigung, Teilnahme, Anwesenheit, Protokoll, Aufgaben. */
export function Meetings() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Kommende');
  const [creating, setCreating] = useState(false);
  const scope = tab === 'Vergangene' ? 'past' : 'upcoming';
  const list = useQuery({ queryKey: ['meetings', scope], queryFn: () => api<{ canOrganize: boolean; items: Row[] }>('/meetings', { query: { scope } }), enabled: tab !== 'Offene Aufgaben' });
  const tasks = useQuery({ queryKey: ['meetings', 'tasks'], queryFn: () => api<Task[]>('/meetings/tasks'), enabled: tab === 'Offene Aufgaben' });
  const open = params.get('id');
  return (
    <>
      <PageHeader title="Besprechungen" subtitle="Besprechungen sind Kalendertermine: Teilnahme und Anwesenheit laufen über dieselbe Teilnehmerliste. Private Protokolle sehen nur Berechtigte."
        actions={list.data?.canOrganize ? <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-1" />Besprechung</Button> : undefined} />
      <Tabs tabs={[...TABS]} active={tab} onChange={(t) => setTab(t as typeof tab)} />
      <div className="mt-4">
        {tab === 'Offene Aufgaben' ? (tasks.isLoading ? <SkeletonRows /> : tasks.error ? <ErrorState error={tasks.error} /> : !tasks.data?.length ? <EmptyState text="Keine offenen Aufgaben." /> : (
          <Card><ul className="divide-y divide-line text-sm">{tasks.data.map((t) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><strong>{t.title}</strong> <span className="text-xs text-muted">aus „{t.meetingTitle}“ · {t.assigneeName ?? 'niemand'}</span></span><span className="flex items-center gap-2">{t.dueAt && <Badge tone={t.overdue ? 'danger' : 'neutral'}>Frist {fmtDateTime(t.dueAt)}</Badge>}<Button size="sm" variant="ghost" onClick={() => setParams({ id: t.meetingId })}>Öffnen</Button></span></li>)}</ul></Card>
        )) : list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} /> : !list.data?.items.length ? <EmptyState text={scope === 'past' ? 'Noch keine vergangenen Besprechungen.' : 'Keine kommenden Besprechungen.'} /> : (
          <div className="grid gap-3 md:grid-cols-2">{list.data.items.map((m) => (
            <Card key={m.id} title={<span className="flex flex-wrap items-center gap-2">{m.title}{m.mandatory && <Badge tone="warning">Pflicht</Badge>}{m.private && <Badge>Privat</Badge>}{m.status === 'CANCELLED' && <Badge tone="danger">Abgesagt</Badge>}{m.conductedAt && <Badge tone="success">Durchgeführt</Badge>}</span>}
              actions={<Button size="sm" variant="secondary" onClick={() => setParams({ id: m.id })}>Öffnen</Button>}>
              <p className="text-sm">{fmtDateTime(m.startsAt)} – {fmtTime(m.endsAt)}{m.location && ` · ${m.location}`}</p>
              <p className="text-xs text-muted">Organisation: {m.organizerName} · {m.counts.accepted}/{m.counts.invited} Zusagen{m.conductedAt ? ` · ${m.counts.attended} anwesend` : ''}{m.openTasks ? ` · ${m.openTasks} offene Aufgaben` : ''}{m.myStatus ? ` · du: ${m.myStatus.toLowerCase()}` : ''}</p>
            </Card>
          ))}</div>
        )}
      </div>
      {open && <MeetingDetail id={open} onClose={() => setParams({})} />}
      {creating && <MeetingForm onClose={() => setCreating(false)} />}
    </>
  );
}

function MeetingDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meetings', 'detail', id], queryFn: () => api<Detail>(`/meetings/${id}`), retry: false });
  const [showEvent, setShowEvent] = useState(false);
  const [mins, setMins] = useState<Detail['minutes']>();
  const [task, setTask] = useState({ title: '', assigneeId: '', dueAt: '' });
  const [err, setErr] = useState<string>();
  const people = useQuery({ queryKey: ['shiftplan-people'], queryFn: fetchPeople, retry: false, enabled: !!q.data?.can.minutes });
  const refresh = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['meetings'] }); };
  const saveMin = useMutation({ mutationFn: () => api(`/meetings/${id}/minutes`, { method: 'PATCH', body: { ...mins, version: q.data!.version } }), onSuccess: () => { setMins(undefined); refresh(); }, onError: (e) => setErr(errText(e)) });
  const conduct = useMutation({ mutationFn: () => api(`/meetings/${id}/conduct`, { method: 'POST' }), onSuccess: refresh, onError: (e) => setErr(errText(e)) });
  const addTask = useMutation({ mutationFn: () => api(`/meetings/${id}/tasks`, { body: { title: task.title, assigneeId: task.assigneeId || null, dueAt: task.dueAt ? fromLocalInput(task.dueAt) : null } }), onSuccess: () => { setTask({ title: '', assigneeId: '', dueAt: '' }); refresh(); }, onError: (e) => setErr(errText(e)) });
  const setStatus = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/meetings/tasks/${v.id}`, { method: 'PATCH', body: { status: v.status } }), onSuccess: refresh, onError: (e) => setErr(errText(e)) });
  const m = q.data;
  if (showEvent && m) return <EventDetail id={m.eventId} onClose={() => { setShowEvent(false); void q.refetch(); }} />;
  const ed = mins ?? m?.minutes;
  return (
    <Modal open wide title={m?.event.title ?? 'Besprechung'} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error || !m || !ed ? <ErrorState error={q.error} /> : (
        <div className="grid gap-4 text-sm">
          <p>{fmtDateTime(m.event.startsAt)} – {fmtTime(m.event.endsAt)}{m.event.location && ` · ${m.event.location}`} · Organisation: {m.event.organizerName}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowEvent(true)}>Teilnahme & Anwesenheit</Button>
            <Button size="sm" variant="ghost" onClick={() => void download(`/meetings/${id}/participants.csv`, 'teilnehmer.csv').catch((e: Error) => setErr(e.message))}><Download size={14} className="mr-1" />Teilnehmerliste</Button>
            {m.can.organize && !m.conductedAt && m.event.status !== 'CANCELLED' && new Date(m.event.startsAt).getTime() <= Date.now() && <Button size="sm" onClick={() => conduct.mutate()}>Als durchgeführt markieren</Button>}
          </div>
          <section aria-label="Protokoll"><h3 className="mb-1 font-semibold">Protokoll {m.private && <Badge>Privat</Badge>}</h3>
            {ed.hidden ? <p className="text-xs text-muted">🔒 Das Protokoll dieser privaten Besprechung ist nur für Berechtigte sichtbar.</p> : m.can.minutes ? (
              <div className="grid gap-2">
                {(['agenda', 'notes', 'decisions', 'followUp'] as const).map((k) => <Field key={k} label={{ agenda: 'Tagesordnung', notes: 'Besprechungsnotizen', decisions: 'Entscheidungen', followUp: 'Nachbereitung' }[k]}>{(fid) => <Textarea id={fid} rows={k === 'notes' ? 5 : 3} maxLength={k === 'notes' ? 20000 : 8000} value={ed[k] ?? ''} onChange={(e) => setMins({ ...ed, [k]: e.target.value })} />}</Field>)}
                <div><Button size="sm" disabled={!mins || saveMin.isPending} onClick={() => saveMin.mutate()}>{saveMin.isPending ? 'Speichert …' : 'Protokoll speichern'}</Button></div>
              </div>
            ) : (
              <dl className="grid gap-2">{(['agenda', 'notes', 'decisions', 'followUp'] as const).filter((k) => ed[k]).map((k) => <div key={k}><dt className="text-xs text-muted">{{ agenda: 'Tagesordnung', notes: 'Notizen', decisions: 'Entscheidungen', followUp: 'Nachbereitung' }[k]}</dt><dd className="whitespace-pre-wrap">{ed[k]}</dd></div>)}</dl>
            )}
          </section>
          <section aria-label="Aufgaben"><h3 className="mb-1 font-semibold">Aufgaben</h3>
            {!m.tasks.length ? <p className="text-xs text-muted">Keine Aufgaben.</p> : <ul className="divide-y divide-line">{m.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1"><span className={t.status !== 'OPEN' ? 'line-through opacity-60' : ''}>{t.title} <span className="text-xs text-muted">· {t.assigneeName ?? '—'}{t.dueAt && ` · Frist ${fmtDateTime(t.dueAt)}`}</span></span>
                {t.status === 'OPEN' ? <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: t.id, status: 'DONE' })}>Erledigt</Button> : <Badge tone={t.status === 'DONE' ? 'success' : 'neutral'}>{t.status === 'DONE' ? 'erledigt' : 'verworfen'}</Badge>}
              </li>
            ))}</ul>}
            {m.can.minutes && (
              <form className="mt-2 grid gap-2 sm:grid-cols-[1fr_12rem_12rem_auto]" onSubmit={(e) => { e.preventDefault(); addTask.mutate(); }}>
                <Input aria-label="Aufgabe" required minLength={2} placeholder="Neue Aufgabe …" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
                <Select aria-label="Zuständig" value={task.assigneeId} onChange={(e) => setTask({ ...task, assigneeId: e.target.value })}><option value="">zuständig …</option>{people.data?.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</Select>
                <Input aria-label="Frist" type="datetime-local" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} />
                <Button type="submit" disabled={addTask.isPending}>Hinzufügen</Button>
              </form>
            )}
          </section>
          {err && <p role="alert" className="text-danger">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

function MeetingForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ['shiftplan-people'], queryFn: fetchPeople, retry: false });
  const start = new Date(Date.now() + 86_400_000); start.setMinutes(0, 0, 0);
  const [key] = useState(() => `meet-${crypto.randomUUID()}`);
  const [v, setV] = useState({ title: '', description: '', startsAt: toLocalInput(start), endsAt: toLocalInput(new Date(start.getTime() + 3_600_000)), location: '', discordChannelId: '', mandatory: false, private: false, agenda: '', reminders: [1440, 60] as number[], participantIds: [] as string[] });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const save = useMutation({ mutationFn: () => api('/meetings', { body: { ...v, startsAt: fromLocalInput(v.startsAt), endsAt: fromLocalInput(v.endsAt), description: v.description || null, location: v.location || null, discordChannelId: v.discordChannelId || null, agenda: v.agenda || null, idempotencyKey: key } }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['meetings'] }); void qc.invalidateQueries({ queryKey: ['calendar'] }); onClose(); } });
  return (
    <Modal open wide title="Besprechung planen" onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Titel">{(id) => <Input id={id} required minLength={2} maxLength={150} value={v.title} onChange={set('title')} />}</Field>
        <Field label="Ort">{(id) => <Input id={id} maxLength={150} value={v.location} onChange={set('location')} />}</Field>
        <Field label="Beginn (deutsche Zeit)">{(id) => <Input id={id} type="datetime-local" required value={v.startsAt} onChange={set('startsAt')} />}</Field>
        <Field label="Ende (deutsche Zeit)">{(id) => <Input id={id} type="datetime-local" required value={v.endsAt} onChange={set('endsAt')} />}</Field>
        <Field label="Discord-Kanal (ID, optional)" hint="Ankündigung, Erinnerung und Änderungen erscheinen dort – ohne Massen-Ping">{(id) => <Input id={id} inputMode="numeric" pattern="\d{15,25}" value={v.discordChannelId} onChange={set('discordChannelId')} />}</Field>
        <fieldset className="text-sm"><legend className="text-xs font-medium text-muted">Erinnerungen</legend><div className="mt-1 flex flex-wrap gap-2">{REMINDER_CHOICES.map((m) => <label key={m} className="flex items-center gap-1"><input type="checkbox" checked={v.reminders.includes(m)} onChange={(e) => setV({ ...v, reminders: e.target.checked ? [...v.reminders, m].slice(0, 4) : v.reminders.filter((x) => x !== m) })} />{REM(m)}</label>)}</div></fieldset>
        <div className="sm:col-span-2"><Field label="Tagesordnung">{(id) => <Textarea id={id} rows={3} maxLength={8000} value={v.agenda} onChange={set('agenda')} />}</Field></div>
        <div className="sm:col-span-2"><Field label="Teilnehmer">{(id) => <select id={id} multiple className="h-32 w-full rounded-md border border-line bg-panel-2 p-1 text-sm" value={v.participantIds} onChange={(e) => setV({ ...v, participantIds: [...e.target.selectedOptions].map((o) => o.value) })}>{people.data?.map((p) => <option key={p.userId} value={p.userId}>{p.name}{p.department ? ` · ${p.department}` : ''}</option>)}</select>}</Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.mandatory} onChange={(e) => setV({ ...v, mandatory: e.target.checked })} />Teilnahme verpflichtend</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.private} onChange={(e) => setV({ ...v, private: e.target.checked })} />Privat (nur Eingeladene, Protokoll geschützt)</label>
        {save.error && <p role="alert" className="text-sm text-danger sm:col-span-2">{errText(save.error)}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={save.isPending}>Planen</Button></div>
      </form>
    </Modal>
  );
}
