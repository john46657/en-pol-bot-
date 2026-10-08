import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ClipboardCheck, Pencil, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { useRanks } from '../../lib/hr';
import { ChannelPicker } from '../../components/DiscordPickers';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Select, SkeletonRows, Textarea } from '../../components/ui';

interface Signup { discordId: string; userId?: string | null; name: string; at: string }
interface Session {
  id: string; number: string; trainingId: string | null; title: string; startsAt: string; forRank: string | null; duration: string | null; location: string | null; notes: string | null;
  channelId: string | null; promoteRankId: string | null; maxSignups: number | null; status: 'PLANNED' | 'DONE' | 'CANCELLED'; signups: Signup[]; attended: string[]; passed: string[];
  actualDuration: string | null; evaluationNote: string | null; evaluatedAt: string | null; training: { id: string; name: string } | null; promoteRank: { id: string; name: string } | null; instructorName: string | null;
}
type Draft = { trainingId: string; title: string; when: string; forRank: string; duration: string; location: string; notes: string; channelId: string | null; promoteRankId: string; maxSignups: string };

const when = (iso: string) => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const localInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const STATUS: Record<Session['status'], [string, 'info' | 'success' | 'neutral']> = { PLANNED: ['angesetzt', 'info'], DONE: ['ausgewertet', 'success'], CANCELLED: ['abgesagt', 'neutral'] };

/** Ausbildungstermine: ankündigen (Discord mit Anmeldung + Thread), anmelden, auswerten (erschienen/bestanden/Dauer) mit Beförderung. */
export function TrainingSessionsTab() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [edit, setEdit] = useState<Session | 'new' | null>(null);
  const q = useQuery({ queryKey: ['training-sessions', scope], queryFn: () => api<Session[]>('/hr/training-sessions', { query: { scope } }), refetchInterval: 15_000 });
  const open = sp.get('session');
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label="Zeitraum">{(['upcoming', 'past'] as const).map((k) => <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)} className={`px-3 py-1.5 ${scope === k ? 'bg-primary text-white' : 'hover:bg-panel-2'}`}>{k === 'upcoming' ? 'Anstehend' : 'Vergangen'}</button>)}</div>
        {can('training.create') && <Button className="ml-auto" onClick={() => setEdit('new')}><CalendarPlus size={16} className="mr-1" />Termin ansetzen</Button>}
      </div>
      <p className="text-xs text-muted">Auch in Discord: <code>/ausbildung ansetzen</code> im gewünschten Kanal. Die Ankündigung hat „Anmelden“/„Abmelden“ und einen Thread; nach dem Auswerten erscheint die Auswertung darunter.</p>
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState text={scope === 'upcoming' ? 'Keine Termine angesetzt.' : 'Noch keine vergangenen Termine.'} /></Card> : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{q.data.map((s) => (
          <button key={s.id} type="button" onClick={() => setSp({ session: s.id })} className="card border border-line p-3 text-left transition hover:bg-panel-2/60">
            <p className="flex items-center justify-between gap-2"><b className="truncate">📚 {s.title}</b><Badge tone={STATUS[s.status][1]}>{STATUS[s.status][0]}</Badge></p>
            <p className="mt-1 text-sm">{when(s.startsAt)}</p>
            <p className="text-xs text-muted">{[s.forRank && `für ${s.forRank}`, s.duration, s.instructorName && `Ausbilder: ${s.instructorName}`].filter(Boolean).join(' · ')}</p>
            <p className="mt-1 text-xs">{s.status === 'DONE' ? `✅ ${s.passed.length} von ${s.attended.length} bestanden` : `👥 ${s.signups.length}${s.maxSignups ? `/${s.maxSignups}` : ''} angemeldet`}{s.promoteRank ? ` · ⬆️ ${s.promoteRank.name}` : ''}</p>
          </button>
        ))}</div>
      )}
      {open && <SessionDetail id={open} onClose={() => setSp({})} onEdit={(s) => setEdit(s)} />}
      {edit && <SessionForm session={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={(s) => { setEdit(null); setSp({ session: s.id }); }} />}
    </div>
  );
}

function SessionForm({ session, onClose, onSaved }: { session: Session | null; onClose: () => void; onSaved: (s: Session) => void }) {
  const qc = useQueryClient();
  const trainings = useQuery({ queryKey: ['hr-trainings'], queryFn: () => api<{ id: string; name: string; active: boolean }[]>('/hr/trainings') });
  const ranks = useRanks();
  const [d, setD] = useState<Draft>(() => ({
    trainingId: session?.trainingId ?? '', title: session?.title ?? 'Grundausbildung', when: session ? localInput(session.startsAt) : '', forRank: session?.forRank ?? '', duration: session?.duration ?? '60–120 Minuten',
    location: session?.location ?? '', notes: session?.notes ?? '', channelId: session?.channelId ?? null, promoteRankId: session?.promoteRankId ?? '', maxSignups: session?.maxSignups ? String(session.maxSignups) : '',
  }));
  const save = useMutation({
    mutationFn: () => {
      const body = { trainingId: d.trainingId || null, title: d.title.trim(), startsAt: new Date(d.when).toISOString(), forRank: d.forRank || null, duration: d.duration || null, location: d.location || null, notes: d.notes || null, channelId: d.channelId, promoteRankId: d.promoteRankId || null, maxSignups: d.maxSignups ? Number(d.maxSignups) : null };
      return session ? api<Session>(`/hr/training-sessions/${session.id}`, { method: 'PUT', body }) : api<Session>('/hr/training-sessions', { body });
    },
    onSuccess: (s) => { void qc.invalidateQueries({ queryKey: ['training-sessions'] }); void qc.invalidateQueries({ queryKey: ['training-session', s.id] }); onSaved(s); },
  });
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  return (
    <Modal open wide title={session ? 'Termin bearbeiten' : 'Ausbildung ansetzen'} onClose={onClose}>
      <form className="grid gap-3 text-sm sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="grid gap-1">Ausbildung (optional)<Select aria-label="Ausbildung" value={d.trainingId} onChange={(e) => { const t = trainings.data?.find((x) => x.id === e.target.value); set({ trainingId: e.target.value, ...(t && !session ? { title: t.name } : {}) }); }}><option value="">– keine Zuordnung –</option>{(trainings.data ?? []).filter((t) => t.active || t.id === d.trainingId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
        <label className="grid gap-1">Titel<Input aria-label="Titel" required minLength={2} maxLength={120} value={d.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="grid gap-1">Wann<Input aria-label="Wann" type="datetime-local" required value={d.when} onChange={(e) => set({ when: e.target.value })} /></label>
        <label className="grid gap-1">Für den Rang<Input aria-label="Für den Rang" list="session-ranks" maxLength={60} placeholder="z. B. Polizeianwärter" value={d.forRank} onChange={(e) => set({ forRank: e.target.value })} /><datalist id="session-ranks">{(ranks.data ?? []).map((r) => <option key={r.id} value={r.name} />)}</datalist></label>
        <label className="grid gap-1">Ungefähre Dauer<Input aria-label="Ungefähre Dauer" maxLength={60} value={d.duration} onChange={(e) => set({ duration: e.target.value })} /></label>
        <label className="grid gap-1">Ort<Input aria-label="Ort" maxLength={120} placeholder="z. B. Wache Emden, Treffpunkt Parkplatz" value={d.location} onChange={(e) => set({ location: e.target.value })} /></label>
        <label className="grid gap-1">Ankündigen in Kanal<ChannelPicker ariaLabel="Kanal" value={d.channelId} onChange={(v) => set({ channelId: v })} /></label>
        <label className="grid gap-1">Bei Bestehen befördern zu<Select aria-label="Beförderung" value={d.promoteRankId} onChange={(e) => set({ promoteRankId: e.target.value })}><option value="">– nicht befördern –</option>{(ranks.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
        <label className="grid gap-1">Max. Teilnehmer<Input aria-label="Max. Teilnehmer" type="number" min={1} max={200} placeholder="unbegrenzt" value={d.maxSignups} onChange={(e) => set({ maxSignups: e.target.value })} /></label>
        <label className="grid gap-1 sm:col-span-2">Hinweise<Textarea aria-label="Hinweise" rows={3} maxLength={1500} value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
        {save.error && <p role="alert" className="text-danger sm:col-span-2">{errText(save.error)}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!d.when || d.title.trim().length < 2 || save.isPending}>{session ? 'Speichern' : 'Ansetzen'}</Button></div>
      </form>
    </Modal>
  );
}

function SessionDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (s: Session) => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['training-session', id], queryFn: () => api<Session>(`/hr/training-sessions/${id}`), refetchInterval: 10_000 });
  const [evaluating, setEvaluating] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const done = () => { void qc.invalidateQueries({ queryKey: ['training-sessions'] }); void q.refetch(); };
  const signup = useMutation({ mutationFn: (join: boolean) => api<{ message: string }>(`/hr/training-sessions/${id}/signup`, { body: { join } }), onSuccess: (r) => { setMsg({ ok: true, text: r.message }); done(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const cancel = useMutation({ mutationFn: () => api(`/hr/training-sessions/${id}/cancel`, { body: {} }), onSuccess: done, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const s = q.data;
  return (
    <Modal open wide title={s ? `📚 ${s.title}` : 'Ausbildung'} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error || !s ? <ErrorState error={q.error} /> : evaluating ? <Evaluate s={s} onDone={(t) => { setEvaluating(false); setMsg({ ok: true, text: t }); done(); }} onCancel={() => setEvaluating(false)} /> : (
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS[s.status][1]}>{STATUS[s.status][0]}</Badge><span className="text-muted">{s.number}{s.training ? ` · ${s.training.name}` : ''}</span></div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted">Wann</dt><dd>{when(s.startsAt)}</dd>
            {s.forRank && <><dt className="text-muted">Für den Rang</dt><dd>{s.forRank}</dd></>}
            {s.duration && <><dt className="text-muted">Ungefähre Dauer</dt><dd>{s.duration}</dd></>}
            {s.location && <><dt className="text-muted">Ort</dt><dd>{s.location}</dd></>}
            {s.instructorName && <><dt className="text-muted">Ausbilder</dt><dd>{s.instructorName}</dd></>}
            {s.promoteRank && <><dt className="text-muted">Bei Bestehen</dt><dd>Beförderung zu {s.promoteRank.name}</dd></>}
            {s.notes && <><dt className="text-muted">Hinweise</dt><dd className="whitespace-pre-wrap">{s.notes}</dd></>}
          </dl>
          <section><h3 className="mb-1 font-semibold">Angemeldet ({s.signups.length}{s.maxSignups ? `/${s.maxSignups}` : ''})</h3>
            {s.signups.length ? <ul className="flex flex-wrap gap-1">{s.signups.map((x) => <li key={x.discordId} className={`rounded border px-2 py-0.5 text-xs ${s.passed.includes(x.discordId) ? 'border-success/50 bg-success/10' : s.status === 'DONE' && !s.attended.includes(x.discordId) ? 'border-line opacity-60' : 'border-line'}`}>{x.name}{s.passed.includes(x.discordId) ? ' ✅' : s.status === 'DONE' && s.attended.includes(x.discordId) ? ' ❌' : ''}</li>)}</ul> : <p className="text-muted">noch niemand</p>}</section>
          {s.status === 'DONE' && <p className="rounded-md border border-success/40 bg-success/10 p-2">✅ Ausgewertet: {s.passed.length} von {s.attended.length} bestanden · Dauer: {s.actualDuration ?? '—'}{s.evaluationNote ? <span className="mt-1 block whitespace-pre-wrap">{s.evaluationNote}</span> : null}</p>}
          {s.status === 'CANCELLED' && <p className="rounded-md border border-line p-2">❌ Abgesagt{s.evaluationNote ? `: ${s.evaluationNote}` : ''}</p>}
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-success' : 'text-danger'}>{msg.text}</p>}
          <div className="flex flex-wrap gap-2">
            {s.status === 'PLANNED' && <><Button size="sm" disabled={signup.isPending} onClick={() => signup.mutate(true)}>✅ Anmelden</Button><Button size="sm" variant="secondary" disabled={signup.isPending} onClick={() => signup.mutate(false)}>Abmelden</Button></>}
            {can('training.create') && s.status !== 'CANCELLED' && <Button size="sm" variant="secondary" onClick={() => setEvaluating(true)}><ClipboardCheck size={14} className="mr-1" />{s.status === 'DONE' ? 'Auswertung ändern' : 'Auswerten'}</Button>}
            {can('training.create') && s.status === 'PLANNED' && <Button size="sm" variant="ghost" onClick={() => onEdit(s)}><Pencil size={14} className="mr-1" />Bearbeiten</Button>}
            {can('training.create') && s.status === 'PLANNED' && <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}><X size={14} className="mr-1" />Absagen</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Auswertung: je angemeldeter Person „erschienen“ und „bestanden“ anhaken (weitere per Discord-ID ergänzbar), Dauer, Notiz. */
function Evaluate({ s, onDone, onCancel }: { s: Session; onDone: (t: string) => void; onCancel: () => void }) {
  // Angemeldete plus alle, die bei einer früheren Auswertung ergänzt wurden
  const [people, setPeople] = useState<{ discordId: string; name: string }[]>(() => [...s.signups.map((x) => ({ discordId: x.discordId, name: x.name })), ...[...new Set([...s.attended, ...s.passed])].filter((id) => !s.signups.some((x) => x.discordId === id)).map((id) => ({ discordId: id, name: id }))]);
  const [attended, setAttended] = useState<string[]>(s.status === 'DONE' ? s.attended : s.signups.map((x) => x.discordId));
  const [passed, setPassed] = useState<string[]>(s.passed);
  const [duration, setDuration] = useState(s.actualDuration ?? '');
  const [note, setNote] = useState(s.evaluationNote ?? '');
  const [extra, setExtra] = useState('');
  const run = useMutation({
    mutationFn: () => api<{ results: { promoted: boolean; problem?: string }[] }>(`/hr/training-sessions/${s.id}/evaluate`, { body: { attended, passed: passed.filter((x) => attended.includes(x)), actualDuration: duration || null, note: note || null } }),
    onSuccess: (r) => { const promoted = r.results.filter((x) => x.promoted).length, problems = r.results.filter((x) => x.problem).length; onDone(`Ausgewertet – die Auswertung steht in Discord.${promoted ? ` ${promoted} befördert.` : ''}${problems ? ` ${problems} ohne Personalakte (nicht befördert).` : ''}`); },
  });
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));
  return (
    <div className="grid gap-3 text-sm">
      <table className="w-full"><thead><tr className="text-left text-xs text-muted"><th className="p-1">Person</th><th className="p-1">Erschienen</th><th className="p-1">Bestanden</th></tr></thead>
        <tbody>{people.map((p) => (
          <tr key={p.discordId} className="border-t border-line">
            <td className="p-1">{p.name}</td>
            <td className="p-1"><input type="checkbox" aria-label={`${p.name} erschienen`} checked={attended.includes(p.discordId)} onChange={(e) => { setAttended(toggle(attended, p.discordId, e.target.checked)); if (!e.target.checked) setPassed(toggle(passed, p.discordId, false)); }} /></td>
            <td className="p-1"><input type="checkbox" aria-label={`${p.name} bestanden`} disabled={!attended.includes(p.discordId)} checked={passed.includes(p.discordId)} onChange={(e) => setPassed(toggle(passed, p.discordId, e.target.checked))} /></td>
          </tr>
        ))}</tbody></table>
      <div className="flex gap-2"><div className="flex-1"><Input aria-label="Weitere Person (Discord-ID)" placeholder="Nicht angemeldet, aber da? Discord-ID eintragen" value={extra} onChange={(e) => setExtra(e.target.value.replace(/\D/g, ''))} /></div><Button variant="secondary" disabled={!/^\d{15,25}$/.test(extra)} onClick={() => { setPeople([...people, { discordId: extra, name: extra }]); setAttended([...attended, extra]); setExtra(''); }}>Hinzufügen</Button></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">Dauer war<Input aria-label="Dauer war" maxLength={60} placeholder="z. B. 1 Std" value={duration} onChange={(e) => setDuration(e.target.value)} /></label>
        <label className="grid gap-1">Notiz (optional)<Input aria-label="Notiz" maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {s.promoteRank && <p className="text-xs text-muted">Bestandene werden zu <b>{s.promoteRank.name}</b> befördert (Rang, Discord-Rollen, Personalakte).</p>}
      {run.error && <p role="alert" className="text-danger">{errText(run.error)}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Zurück</Button><Button disabled={run.isPending} onClick={() => run.mutate()}>Auswertung speichern</Button></div>
    </div>
  );
}
