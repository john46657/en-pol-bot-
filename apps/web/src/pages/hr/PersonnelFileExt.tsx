import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, FileUp, History, Lock, Plus } from 'lucide-react';
import { PERSONNEL_DOCUMENT_KIND_LABEL, PERSONNEL_DOCUMENT_KINDS, PERSONNEL_NOTE_CATEGORIES, QUALIFICATION_STATUS_LABEL, type QualificationStatus } from '@enrp/shared';
import { api } from '../../lib/api';
import { errText } from '../../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, Modal, Select, SkeletonRows, Textarea, type Tone } from '../../components/ui';

export interface Qual { id: string; name: string; status: QualificationStatus; sourceLabel: string; issuedAt: string | null; issuedBy: string | null; expiresAt: string | null; color: string | null; operational: boolean; statusReason: string | null }
export interface FileSummary {
  id: string; access: 'ALL' | 'UNIT';
  dutyStatus: { status: string; since: string | null; callsign: string | null };
  units: { id: string; name: string; kind: string; role: 'LEADER' | 'DEPUTY' | 'MEMBER'; function: string | null; path: string[]; supervisor: { name: string; rank: string | null } | null }[];
  qualifications: Qual[];
  dutyHistory: { days: number; minutesOnDuty: number; sessions: { id: string; status: string; startedAt: string; endedAt: string | null; callsign: string | null }[] };
  dutyReports: { id: string; number: string; templateName: string; status: string; createdAt: string }[];
  trainings: { id: string; name: string; status: string; progress: number; completedAt: string | null; certificateNo: string | null }[];
  exams: { id: string; title: string; score: number | null; maxScore: number | null; passed: boolean | null; gradedAt: string | null }[];
  practicalExams: { id: string; title: string; total: number | null; maxPoints: number | null; passed: boolean | null; completedAt: string | null }[];
  permissions: { notes: boolean; notesCreate: boolean; confidential: boolean; documents: boolean; activity: boolean; qualificationGrant: boolean; qualificationRevoke: boolean };
}
export const QUAL_TONE: Record<QualificationStatus, Tone> = { ACTIVE: 'success', PENDING: 'warning', SUSPENDED: 'warning', REVOKED: 'danger', EXPIRED: 'neutral' };
const DUTY: Record<string, [string, Tone]> = { ON_DUTY: ['Im Dienst', 'success'], BREAK: ['Pause', 'warning'], OFF_DUTY: ['Außer Dienst', 'neutral'] };
const ROLE = { LEADER: 'Führung', DEPUTY: 'Stellvertretung', MEMBER: 'Mitglied' } as const;
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;

export const useFileSummary = (id: string, enabled = true) => useQuery({ queryKey: ['personnel-file', id], queryFn: () => api<FileSummary>(`/personnel-file/${id}`), enabled, retry: false });

/** Personalakte 2.0 – Dienst & Organisation (Dienststatus, Zugehörigkeit, zuständige Führungskraft, Diensthistorie). */
export function ServiceTab({ s }: { s: FileSummary }) {
  const [label, tone] = DUTY[s.dutyStatus.status] ?? [s.dutyStatus.status, 'neutral' as Tone];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Dienststatus">
        <p><Badge tone={tone}>{label}</Badge>{s.dutyStatus.since && <span className="ml-2 text-sm text-muted">seit {fmt(s.dutyStatus.since)}</span>}{s.dutyStatus.callsign && <span className="ml-2 text-sm">Rufname {s.dutyStatus.callsign}</span>}</p>
        <p className="mt-2 text-sm text-muted">Dienstzeit der letzten {s.dutyHistory.days} Tage: <b className="text-fg">{hm(s.dutyHistory.minutesOnDuty)}</b> in {s.dutyHistory.sessions.length} Abschnitten</p>
      </Card>
      <Card title="Zugehörigkeit (Organigramm)">
        {!s.units.length ? <EmptyState text="Keiner Einheit zugeordnet." hint="Zuordnungen pflegt die Verwaltung im Organigramm." /> : (
          <ul className="grid gap-2 text-sm">{s.units.map((u) => (
            <li key={u.id} className="rounded-md border border-line p-2">
              <p className="font-medium">{u.name} <Badge tone={u.role === 'MEMBER' ? 'neutral' : 'info'}>{ROLE[u.role]}</Badge>{u.function && <span className="ml-1 text-muted">· {u.function}</span>}</p>
              <p className="text-xs text-muted">{u.path.join(' › ')}</p>
              {u.supervisor && <p className="text-xs">Zuständige Führungskraft: <b>{u.supervisor.name}</b>{u.supervisor.rank && ` (${u.supervisor.rank})`}</p>}
            </li>))}</ul>
        )}
      </Card>
      <Card title="Dienstzeiten (letzte 50)" className="overflow-x-auto">
        {!s.dutyHistory.sessions.length ? <EmptyState text="Keine Dienstzeiten im Zeitraum." /> : (
          <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Beginn</th><th className="p-2">Ende</th><th className="p-2">Status</th></tr></thead>
            <tbody>{s.dutyHistory.sessions.map((x) => <tr key={x.id} className="border-b border-line/60"><td className="p-2">{fmt(x.startedAt)}</td><td className="p-2">{x.endedAt ? fmt(x.endedAt) : 'läuft'}</td><td className="p-2">{DUTY[x.status]?.[0] ?? x.status}</td></tr>)}</tbody></table>
        )}
      </Card>
      <Card title="Dienstberichte" className="overflow-x-auto">
        {!s.dutyReports.length ? <EmptyState text="Keine Dienstberichte." /> : (
          <ul className="grid gap-1 text-sm">{s.dutyReports.map((r) => <li key={r.id} className="flex justify-between gap-2 border-b border-line/60 py-1"><span>{r.number} · {r.templateName}</span><span className="text-xs text-muted">{fmt(r.createdAt)}</span></li>)}</ul>
        )}
      </Card>
      <Card title="Abgeschlossene Prüfungen" className="lg:col-span-2 overflow-x-auto">
        {!s.exams.length && !s.practicalExams.length ? <EmptyState text="Noch keine bewerteten Prüfungen." /> : (
          <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Prüfung</th><th className="p-2">Art</th><th className="p-2">Ergebnis</th><th className="p-2">Datum</th></tr></thead>
            <tbody>
              {s.exams.map((e) => <tr key={e.id} className="border-b border-line/60"><td className="p-2">{e.title}</td><td className="p-2">Theorie</td><td className="p-2"><Badge tone={e.passed ? 'success' : 'danger'}>{e.passed ? 'Bestanden' : 'Nicht bestanden'}</Badge> {e.score ?? '—'}/{e.maxScore ?? '—'}</td><td className="p-2">{fmt(e.gradedAt)}</td></tr>)}
              {s.practicalExams.map((e) => <tr key={e.id} className="border-b border-line/60"><td className="p-2">{e.title}</td><td className="p-2">Praxis</td><td className="p-2"><Badge tone={e.passed ? 'success' : 'danger'}>{e.passed ? 'Bestanden' : 'Nicht bestanden'}</Badge> {e.total}/{e.maxPoints}</td><td className="p-2">{fmt(e.completedAt)}</td></tr>)}
            </tbody></table>
        )}
      </Card>
    </div>
  );
}

/** Qualifikationen der Person (Register) – vergeben/ruhen lassen/entziehen nach Recht. */
export function QualificationsTab({ s, personnelId }: { s: FileSummary; personnelId: string }) {
  const qc = useQueryClient();
  const [grant, setGrant] = useState(false);
  const [change, setChange] = useState<{ q: Qual; status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' } | null>(null);
  const [reason, setReason] = useState('');
  const set = useMutation({ mutationFn: () => api(`/qualification-registry/${change!.q.id}/status`, { method: 'POST', body: { status: change!.status, reason: reason.trim() || undefined } }), onSuccess: () => { setChange(null); setReason(''); void qc.invalidateQueries({ queryKey: ['personnel-file', personnelId] }); } });
  return (
    <Card title="Qualifikationen" actions={s.permissions.qualificationGrant ? <Button size="sm" onClick={() => setGrant(true)}><Plus size={14} />Vergeben</Button> : undefined} className="overflow-x-auto">
      {!s.qualifications.length ? <EmptyState text="Keine Qualifikationen eingetragen." /> : (
        <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Qualifikation</th><th className="p-2">Status</th><th className="p-2">Herkunft</th><th className="p-2">Abschluss</th><th className="p-2">Aussteller</th><th className="p-2">Gültig bis</th><th className="p-2" /></tr></thead>
          <tbody>{s.qualifications.map((q) => (
            <tr key={q.id} className="border-b border-line/60">
              <td className="p-2 font-medium"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: q.color ?? '#1e40af' }} aria-hidden />{q.name}{q.statusReason && <span className="block text-xs text-muted">{q.statusReason}</span>}</td>
              <td className="p-2"><Badge tone={QUAL_TONE[q.status]}>{QUALIFICATION_STATUS_LABEL[q.status]}</Badge></td>
              <td className="p-2 text-xs">{q.sourceLabel}</td><td className="p-2 text-xs">{fmt(q.issuedAt)}</td><td className="p-2 text-xs">{q.issuedBy ?? '—'}</td><td className="p-2 text-xs">{q.expiresAt ? fmt(q.expiresAt) : 'unbegrenzt'}</td>
              <td className="p-2 text-right whitespace-nowrap">
                {q.status === 'PENDING' && s.permissions.qualificationGrant && <Button size="sm" onClick={() => setChange({ q, status: 'ACTIVE' })}>Bestätigen</Button>}
                {q.status === 'SUSPENDED' && s.permissions.qualificationGrant && <Button size="sm" variant="secondary" onClick={() => setChange({ q, status: 'ACTIVE' })}>Reaktivieren</Button>}
                {(q.status === 'ACTIVE' || q.status === 'PENDING') && s.permissions.qualificationRevoke && <Button size="sm" variant="ghost" onClick={() => setChange({ q, status: 'SUSPENDED' })}>Ruhen lassen</Button>}
                {q.status !== 'REVOKED' && s.permissions.qualificationRevoke && <Button size="sm" variant="ghost" onClick={() => setChange({ q, status: 'REVOKED' })}>Entziehen</Button>}
              </td>
            </tr>))}</tbody></table>
      )}
      {grant && <GrantModal personnelId={personnelId} onClose={() => setGrant(false)} onDone={() => { setGrant(false); void qc.invalidateQueries({ queryKey: ['personnel-file', personnelId] }); }} />}
      <Modal open={!!change} title={change ? `${change.q.name}: ${change.status === 'ACTIVE' ? 'aktivieren' : change.status === 'SUSPENDED' ? 'ruhen lassen' : 'entziehen'}` : ''} onClose={() => setChange(null)}>
        {change?.status !== 'ACTIVE' && <label className="grid gap-1 text-sm">Grund (Pflicht)<Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label>}
        {set.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(set.error)}</p>}
        <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => setChange(null)}>Abbrechen</Button><Button variant={change?.status === 'REVOKED' ? 'danger' : 'primary'} disabled={set.isPending} onClick={() => set.mutate()}>Speichern</Button></div>
      </Modal>
    </Card>
  );
}

function GrantModal({ personnelId, onClose, onDone }: { personnelId: string; onClose: () => void; onDone: () => void }) {
  const defs = useQuery({ queryKey: ['qual-defs'], queryFn: () => api<{ id: string; name: string; validDays: number | null }[]>('/qualification-registry/definitions') });
  const [v, setV] = useState({ definitionId: '', issuedAt: new Date().toISOString().slice(0, 10), note: '' });
  const m = useMutation({ mutationFn: () => api('/qualification-registry', { method: 'POST', body: { personnelId, definitionId: v.definitionId, issuedAt: v.issuedAt, note: v.note || undefined } }), onSuccess: onDone });
  return (
    <Modal open title="Qualifikation vergeben" onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">Qualifikation<Select value={v.definitionId} onChange={(e) => setV({ ...v, definitionId: e.target.value })}><option value="">– wählen –</option>{(defs.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}{d.validDays ? ` (${d.validDays} Tage gültig)` : ''}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Abschlussdatum<Input type="date" value={v.issuedAt} onChange={(e) => setV({ ...v, issuedAt: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Bemerkung<Input value={v.note} maxLength={500} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
        {!defs.data?.length && <p className="text-xs text-muted">Noch keine Qualifikationen im Katalog – Personal → Qualifikationen → Katalog.</p>}
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={!v.definitionId || m.isPending} onClick={() => m.mutate()}>Vergeben</Button></div>
      </div>
    </Modal>
  );
}

interface Note { id: string; summary: string; details: string | null; category: string | null; confidential: boolean; createdAt: string; updatedAt: string; author: string; revisions: number }
/** Personalvermerke: sachlich, mit Kategorie, optional vertraulich, Änderungsverlauf. */
export function NotesTab({ s, personnelId }: { s: FileSummary; personnelId: string }) {
  const qc = useQueryClient();
  const [cat, setCat] = useState('');
  const notes = useQuery({ queryKey: ['pf-notes', personnelId, cat], queryFn: () => api<Note[]>(`/personnel-file/${personnelId}/notes`, { query: { category: cat || undefined } }) });
  const [edit, setEdit] = useState<Note | 'new' | null>(null);
  const [hist, setHist] = useState<Note | null>(null);
  return (
    <Card title="Personalvermerke" actions={<div className="flex gap-2"><Select aria-label="Kategorie" value={cat} onChange={(e) => setCat(e.target.value)} className="w-40"><option value="">Alle Kategorien</option>{PERSONNEL_NOTE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>{s.permissions.notesCreate && <Button size="sm" onClick={() => setEdit('new')}><Plus size={14} />Vermerk</Button>}</div>}>
      {notes.isLoading ? <SkeletonRows /> : notes.error ? <ErrorState error={notes.error} /> : !notes.data?.length ? <EmptyState text="Keine Vermerke." /> : (
        <ul className="grid gap-2">{notes.data.map((n) => (
          <li key={n.id} className="rounded-md border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><b>{n.summary}</b>{n.category && <Badge>{n.category}</Badge>}{n.confidential && <Badge tone="danger" icon="🔒">Vertraulich</Badge>}
              <span className="ml-auto text-xs text-muted">{n.author} · {fmt(n.createdAt)}{n.updatedAt !== n.createdAt && ` · geändert ${fmt(n.updatedAt)}`}</span></div>
            {n.details && <p className="mt-1 whitespace-pre-wrap text-muted">{n.details}</p>}
            <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => setEdit(n)}>Bearbeiten</Button>{n.revisions > 0 && <Button size="sm" variant="ghost" onClick={() => setHist(n)}><History size={14} />Verlauf ({n.revisions})</Button>}</div>
          </li>))}</ul>
      )}
      {edit && <NoteForm personnelId={personnelId} note={edit === 'new' ? null : edit} canConfidential={s.permissions.confidential} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void qc.invalidateQueries({ queryKey: ['pf-notes', personnelId] }); }} />}
      {hist && <NoteHistory note={hist} onClose={() => setHist(null)} />}
    </Card>
  );
}

function NoteForm({ personnelId, note, canConfidential, onClose, onDone }: { personnelId: string; note: Note | null; canConfidential: boolean; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ summary: note?.summary ?? '', details: note?.details ?? '', category: note?.category ?? 'Allgemein', confidential: note?.confidential ?? false, reason: '' });
  const m = useMutation({
    mutationFn: () => note
      ? api(`/personnel-file/notes/${note.id}`, { method: 'PATCH', body: { summary: v.summary, details: v.details || null, category: v.category, ...(canConfidential ? { confidential: v.confidential } : {}), reason: v.reason || undefined } })
      : api(`/personnel-file/${personnelId}/notes`, { method: 'POST', body: { summary: v.summary, details: v.details || null, category: v.category, confidential: v.confidential } }),
    onSuccess: onDone,
  });
  return (
    <Modal open title={note ? 'Vermerk bearbeiten' : 'Neuer Personalvermerk'} onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">Kurzfassung<Input value={v.summary} maxLength={300} onChange={(e) => setV({ ...v, summary: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Kategorie<Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{PERSONNEL_NOTE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Details (sachlich)<Textarea value={v.details} maxLength={5000} onChange={(e) => setV({ ...v, details: e.target.value })} /></label>
        {canConfidential && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.confidential} onChange={(e) => setV({ ...v, confidential: e.target.checked })} /><Lock size={14} aria-hidden />Vertraulich (nur mit Recht „vertrauliche Vermerke“ sichtbar)</label>}
        {note && <label className="grid gap-1 text-sm">Änderungsgrund<Input value={v.reason} maxLength={300} onChange={(e) => setV({ ...v, reason: e.target.value })} /></label>}
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={v.summary.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>Speichern</Button></div>
      </div>
    </Modal>
  );
}

function NoteHistory({ note, onClose }: { note: Note; onClose: () => void }) {
  const revs = useQuery({ queryKey: ['pf-note-revs', note.id], queryFn: () => api<{ id: string; summary: string; details: string | null; category: string | null; editedBy: string; reason: string | null; createdAt: string }[]>(`/personnel-file/notes/${note.id}/revisions`) });
  return (
    <Modal open wide title="Änderungsverlauf" onClose={onClose}>
      {revs.isLoading ? <SkeletonRows /> : <ul className="grid gap-2 text-sm">{(revs.data ?? []).map((r) => <li key={r.id} className="rounded-md border border-line p-2"><p className="text-xs text-muted">Stand vor der Änderung von {r.editedBy} am {fmt(r.createdAt)}{r.reason && ` – Grund: ${r.reason}`}</p><p className="font-medium">{r.summary}</p>{r.details && <p className="whitespace-pre-wrap text-muted">{r.details}</p>}</li>)}</ul>}
    </Modal>
  );
}

interface Doc { id: string; kind: (typeof PERSONNEL_DOCUMENT_KINDS)[number]; title: string; note: string | null; confidential: boolean; fileName: string; size: number; uploadedBy: string; createdAt: string; archivedAt: string | null }
/** Dokumente der Personalakte: hochladen (PDF, Bild, Text – serverseitig geprüft), geschützt herunterladen, archivieren. */
export function DocumentsTab({ s, personnelId }: { s: FileSummary; personnelId: string }) {
  const qc = useQueryClient();
  const [archived, setArchived] = useState(false);
  const docs = useQuery({ queryKey: ['pf-docs', personnelId, archived], queryFn: () => api<Doc[]>(`/personnel-file/${personnelId}/documents`, { query: { archived: archived ? '1' : undefined } }) });
  const [up, setUp] = useState(false);
  const archive = useMutation({ mutationFn: (id: string) => api(`/personnel-file/documents/${id}/archive`, { method: 'POST' }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['pf-docs', personnelId] }) });
  return (
    <Card title="Dokumente" actions={<div className="flex items-center gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />auch archivierte</label><Button size="sm" onClick={() => setUp(true)}><FileUp size={14} />Hochladen</Button></div>}>
      {docs.isLoading ? <SkeletonRows /> : docs.error ? <ErrorState error={docs.error} /> : !docs.data?.length ? <EmptyState text="Keine Dokumente." /> : (
        <ul className="grid gap-2 text-sm">{docs.data.map((d) => (
          <li key={d.id} className={`flex flex-wrap items-center gap-2 rounded-md border border-line p-2 ${d.archivedAt ? 'opacity-60' : ''}`}>
            <b>{d.title}</b><Badge>{PERSONNEL_DOCUMENT_KIND_LABEL[d.kind]}</Badge>{d.confidential && <Badge tone="danger" icon="🔒">Vertraulich</Badge>}
            <span className="text-xs text-muted">{d.fileName} · {Math.ceil(d.size / 1024)} KB · {d.uploadedBy} · {fmt(d.createdAt)}</span>
            <span className="ml-auto flex gap-1"><a className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-panel-2" href={`/api/v1/personnel-file/documents/${d.id}/download`}><Download size={14} />Herunterladen</a>
              {!d.archivedAt && <Button size="sm" variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate(d.id)}><Archive size={14} />Archivieren</Button>}</span>
          </li>))}</ul>
      )}
      {up && <UploadDoc personnelId={personnelId} canConfidential={s.permissions.confidential} onClose={() => setUp(false)} onDone={() => { setUp(false); void qc.invalidateQueries({ queryKey: ['pf-docs', personnelId] }); }} />}
    </Card>
  );
}

function UploadDoc({ personnelId, canConfidential, onClose, onDone }: { personnelId: string; canConfidential: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState({ title: '', kind: 'PERSONNEL' as Doc['kind'], note: '', confidential: false });
  const m = useMutation({
    mutationFn: async () => {
      const fd = new FormData(); fd.append('file', file!); fd.append('linkedType', 'PersonnelDocument'); fd.append('linkedId', personnelId);
      const media = await api<{ id: string }>('/media', { formData: fd });
      return api(`/personnel-file/${personnelId}/documents`, { method: 'POST', body: { mediaId: media.id, kind: v.kind, title: v.title, note: v.note || null, confidential: v.confidential } });
    },
    onSuccess: onDone,
  });
  return (
    <Modal open title="Dokument hochladen" onClose={onClose}>
      <div className="grid gap-3">
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <label className="grid gap-1 text-sm">Titel<Input value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Art<Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Doc['kind'] })}>{PERSONNEL_DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{PERSONNEL_DOCUMENT_KIND_LABEL[k]}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Bemerkung<Input value={v.note} maxLength={1000} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
        {canConfidential && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.confidential} onChange={(e) => setV({ ...v, confidential: e.target.checked })} />Vertraulich</label>}
        <p className="text-xs text-muted">Erlaubt: PDF, PNG, JPG, WebP, Text – höchstens 10 MB. Der Dateityp wird serverseitig anhand des Inhalts geprüft.</p>
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={!file || v.title.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>Hochladen</Button></div>
      </div>
    </Modal>
  );
}

/** Aktivitäten: wer hat wann was an der Akte geändert (aus dem Audit-Log). */
export function ActivityTab({ personnelId }: { personnelId: string }) {
  const [page, setPage] = useState(1);
  const a = useQuery({ queryKey: ['pf-activity', personnelId, page], queryFn: () => api<{ total: number; page: number; rows: { id: string; action: string; at: string; actor: string; reason: string | null; before: unknown; after: unknown }[] }>(`/personnel-file/${personnelId}/activity`, { query: { page } }) });
  const pages = Math.max(1, Math.ceil((a.data?.total ?? 0) / 50));
  return (
    <Card title="Aktivitäten" className="overflow-x-auto">
      {a.isLoading ? <SkeletonRows /> : a.error ? <ErrorState error={a.error} /> : !a.data?.rows.length ? <EmptyState text="Keine Änderungen protokolliert." /> : (
        <>
          <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Zeitpunkt</th><th className="p-2">Wer</th><th className="p-2">Aktion</th><th className="p-2">Änderung</th></tr></thead>
            <tbody>{a.data.rows.map((r) => <tr key={r.id} className="border-b border-line/60 align-top"><td className="p-2 whitespace-nowrap">{fmt(r.at)}</td><td className="p-2">{r.actor}</td><td className="p-2"><code className="text-xs">{r.action}</code>{r.reason && <span className="block text-xs text-muted">{r.reason}</span>}</td><td className="p-2 text-xs"><Diff before={r.before} after={r.after} /></td></tr>)}</tbody></table>
          <div className="mt-2 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><span>{page}/{pages}</span><Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button></div>
        </>
      )}
    </Card>
  );
}
const short = (v: unknown): ReactNode => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : String(v));
const Diff = ({ before, after }: { before: unknown; after: unknown }) => <span className="[overflow-wrap:anywhere]">{before !== null && before !== undefined && <span className="text-muted line-through">{short(before)} </span>}{short(after)}</span>;
