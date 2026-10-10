import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { ChannelPicker, RolePicker } from '../components/DiscordPickers';
import { Badge, Button, Card, EmptyState, ErrorState, Field, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../components/ui';
import type { Overview } from '../lib/hr';

interface Course { id: string; title: string; description: string | null; passScore: number; _count: { enrollments: number } }
interface Enrollment { id: string; personnelId: string; userId: string; name: string; callsign: string | null; rank: string | null; createdAt: string; result: { score: number; passed: boolean; createdAt: string } | null }
interface CourseDetail extends Omit<Course, '_count'> { enrollments: Enrollment[] }
interface AcademyConfig { channelId: string | null; pingRoleIds: string[] }
interface Announce { on: boolean; channelId: string | null; pingRoleIds: string[]; when: string; location: string; remember: boolean }

/** Discord-Ankündigung: Kanal, Rollen-Ping, Termin, Ort (Kanal/Rollen kommen vom gespeicherten Standard). */
function AnnounceFields({ a, set }: { a: Announce; set: (p: Partial<Announce>) => void }) {
  return (
    <div className="grid gap-3 rounded-lg border border-line p-3">
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={a.on} onChange={(e) => set({ on: e.target.checked })} />📣 In Discord ankündigen</label>
      {a.on && (
        <>
          <Field label="Kanal">{() => <ChannelPicker ariaLabel="Discord-Kanal" value={a.channelId} onChange={(id) => set({ channelId: id })} />}</Field>
          <Field label="Rollen pingen">{() => <RolePicker ariaLabel="Rollen pingen" max={10} value={a.pingRoleIds} onChange={(ids) => set({ pingRoleIds: ids })} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Termin (optional)">{(id) => <Input id={id} type="datetime-local" value={a.when} onChange={(e) => set({ when: e.target.value })} />}</Field>
            <Field label="Ort (optional)">{(id) => <Input id={id} maxLength={200} placeholder="z. B. Polizeiwache, Treffpunkt" value={a.location} onChange={(e) => set({ location: e.target.value })} />}</Field>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={a.remember} onChange={(e) => set({ remember: e.target.checked })} />Kanal und Rollen als Standard merken</label>
        </>
      )}
    </div>
  );
}
/** Teilnehmer eines Kurses: einschreiben (Personalakte) und benoten. Bestanden ab der Kurs-Schwelle → Qualifikation. */
function Participants({ course, onClose }: { course: Course; onClose: () => void }) {
  const { can, user } = useAuth();
  const manage = can('academy.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['academy', course.id], queryFn: () => api<CourseDetail>(`/academy/courses/${course.id}`) });
  const people = useQuery({ queryKey: ['hr-people', 'pick'], queryFn: () => api<Overview>('/hr/people'), enabled: manage && can('personnel.view'), staleTime: 60_000 });
  const [pick, setPick] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string>();
  const done = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['academy'] }); };
  const enroll = useMutation({ mutationFn: (personnelId: string) => api(`/academy/courses/${course.id}/enroll`, { body: { personnelId } }), onSuccess: () => { setPick(''); done(); }, onError: (e) => setErr(errText(e)) });
  const grade = useMutation({ mutationFn: (v: { id: string; score: number }) => api(`/academy/enrollments/${v.id}/grade`, { body: { score: v.score } }), onSuccess: (_r, v) => { setScores((s) => ({ ...s, [v.id]: '' })); done(); }, onError: (e) => setErr(errText(e)) });
  const enrolled = new Set(q.data?.enrollments.map((e) => e.personnelId));
  const options = (people.data?.rows ?? []).filter((p) => !enrolled.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <Modal open title={`👥 ${course.title}`} onClose={onClose} wide>
      <div className="grid gap-3">
        <p className="text-xs text-muted">Bestanden ab {course.passScore} Punkten – bestandene Kurse werden automatisch als Qualifikation in der Personalakte eingetragen.</p>
        {manage && (
          <div className="flex flex-wrap items-end gap-2">
            <Select aria-label="Person einschreiben" className="min-w-0 flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{people.isLoading ? 'Lädt …' : options.length ? 'Person auswählen …' : 'Keine weiteren Personen'}</option>
              {options.map((p) => <option key={p.id} value={p.id}>{p.name}{p.rank ? ` · ${p.rank}` : ''}{p.serviceNumber ? ` · ${p.serviceNumber}` : ''}</option>)}
            </Select>
            <Button disabled={!pick || enroll.isPending} onClick={() => enroll.mutate(pick)}>Einschreiben</Button>
          </div>
        )}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        {q.isLoading ? <SkeletonRows rows={3} /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.enrollments.length ? <EmptyState text="Noch niemand eingeschrieben." /> : (
          <ul className="divide-y divide-line">{q.data.enrollments.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{e.name}{e.callsign ? <span className="ml-1 text-xs text-muted">({e.callsign})</span> : null}</div>
                <div className="text-xs text-muted">eingeschrieben {fmt(e.createdAt)}{e.result ? ` · bewertet ${fmt(e.result.createdAt)}` : ''}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {e.result ? <Badge tone={e.result.passed ? 'success' : 'danger'}>{e.result.score} Punkte · {e.result.passed ? 'bestanden' : 'nicht bestanden'}</Badge> : <Badge>offen</Badge>}
                {manage && e.userId !== user?.id && <>
                  <Input aria-label={`Punkte für ${e.name}`} type="number" min={0} max={100} className="w-20" placeholder="0–100" value={scores[e.id] ?? ''} onChange={(ev) => setScores({ ...scores, [e.id]: ev.target.value })} />
                  <Button size="sm" variant="secondary" disabled={grade.isPending || scores[e.id] === undefined || scores[e.id] === '' || Number(scores[e.id]) < 0 || Number(scores[e.id]) > 100} onClick={() => grade.mutate({ id: e.id, score: Math.round(Number(scores[e.id])) })}>{e.result ? 'Neu bewerten' : 'Bewerten'}</Button>
                </>}
              </div>
            </li>
          ))}</ul>
        )}
      </div>
    </Modal>
  );
}

const announceBody = (a: Announce) => ({ ...(a.channelId ? { channelId: a.channelId } : {}), pingRoleIds: a.pingRoleIds, ...(a.when ? { when: new Date(a.when).toISOString() } : {}), ...(a.location.trim() ? { location: a.location.trim() } : {}) });

export function Academy() {
  const { can } = useAuth();
  const manage = can('academy.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['academy'], queryFn: () => api<Course[]>('/academy/courses') });
  const cfg = useQuery({ queryKey: ['academy-config'], queryFn: () => api<AcademyConfig>('/academy/config') });
  const fresh = (): Announce => ({ on: !!cfg.data?.channelId, channelId: cfg.data?.channelId ?? null, pingRoleIds: cfg.data?.pingRoleIds ?? [], when: '', location: '', remember: true });
  const [creating, setCreating] = useState(false);
  const [course, setCourse] = useState({ title: '', description: '', passScore: 70 });
  const [a, setA] = useState<Announce>(fresh);
  const [announceFor, setAnnounceFor] = useState<Course>();
  const [participantsFor, setParticipantsFor] = useState<Course>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  useEffect(() => { if (cfg.data && !creating && !announceFor) setA(fresh()); }, [cfg.data]); // nur bei neuem Standard (offene Formulare nicht überschreiben)
  const remember = async (x: Announce) => { if (x.on && x.remember && (x.channelId !== cfg.data?.channelId || JSON.stringify(x.pingRoleIds) !== JSON.stringify(cfg.data?.pingRoleIds))) { await api('/academy/config', { method: 'PUT', body: { channelId: x.channelId, pingRoleIds: x.pingRoleIds } }); void qc.invalidateQueries({ queryKey: ['academy-config'] }); } };
  const create = useMutation({
    mutationFn: async () => {
      const r = await api<Course & { announced: unknown }>('/academy/courses', { method: 'POST', body: { title: course.title.trim(), ...(course.description.trim() ? { description: course.description.trim() } : {}), passScore: course.passScore, ...(a.on ? { announce: announceBody(a) } : {}) } });
      await remember(a);
      return r;
    },
    onSuccess: (r) => { setCreating(false); setMsg({ ok: true, text: `Kurs „${r.title}“ angelegt${r.announced ? ' – die Ankündigung geht gleich in Discord raus.' : '.'}` }); void qc.invalidateQueries({ queryKey: ['academy'] }); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const announce = useMutation({
    mutationFn: async (c: Course) => { await api(`/academy/courses/${c.id}/announce`, { method: 'POST', body: announceBody(a) }); await remember(a); },
    onSuccess: () => { setMsg({ ok: true, text: `Ankündigung für „${announceFor?.title}“ geht gleich in Discord raus.` }); setAnnounceFor(undefined); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const setAnn = (p: Partial<Announce>) => setA({ ...a, ...p });
  return (
    <>
      <PageHeader title="Akademie" actions={manage && <Button onClick={() => { setCourse({ title: '', description: '', passScore: 70 }); setA(fresh()); setMsg(undefined); setCreating(true); }}>Neuer Kurs</Button>} />
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-3 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState text="Noch keine Kurse." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data.map((c) => (
          <Card key={c.id} title={c.title} actions={manage && <Button size="sm" variant="secondary" onClick={() => { setA({ ...fresh(), on: true }); setMsg(undefined); setAnnounceFor(c); }}>📣 Ankündigen</Button>}>
            <p className="text-sm text-muted">{c.description ?? 'Keine Beschreibung.'}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs">Bestehensgrenze {c.passScore} · {c._count.enrollments} eingeschrieben</p><Button size="sm" variant="ghost" onClick={() => setParticipantsFor(c)}>👥 Teilnehmer</Button></div>
          </Card>
        ))}</div>
      )}
      {participantsFor && <Participants course={participantsFor} onClose={() => setParticipantsFor(undefined)} />}
      <Modal open={creating} title="Neuer Kurs" onClose={() => setCreating(false)}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Titel">{(id) => <Input id={id} required minLength={3} maxLength={120} value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} />}</Field>
          <Field label="Beschreibung">{(id) => <Textarea id={id} rows={3} maxLength={2000} value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })} />}</Field>
          <Field label="Bestehensgrenze (1–100)">{(id) => <Input id={id} type="number" min={1} max={100} value={course.passScore} onChange={(e) => setCourse({ ...course, passScore: Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))) })} />}</Field>
          <AnnounceFields a={a} set={setAnn} />
          {msg && !msg.ok && <p role="alert" className="text-sm text-danger">{msg.text}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>Abbrechen</Button><Button type="submit" disabled={create.isPending || course.title.trim().length < 3}>{a.on ? 'Anlegen & ankündigen' : 'Anlegen'}</Button></div>
        </form>
      </Modal>
      <Modal open={!!announceFor} title={`📣 ${announceFor?.title ?? ''} ankündigen`} onClose={() => setAnnounceFor(undefined)}>
        <div className="grid gap-3">
          <AnnounceFields a={a} set={setAnn} />
          {msg && !msg.ok && <p role="alert" className="text-sm text-danger">{msg.text}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAnnounceFor(undefined)}>Abbrechen</Button><Button disabled={announce.isPending || !a.on} onClick={() => announceFor && announce.mutate(announceFor)}>In Discord senden</Button></div>
        </div>
      </Modal>
    </>
  );
}
