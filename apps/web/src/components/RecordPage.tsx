import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import { FormModal, type FieldDef } from './FormModal';
import type { LockType } from '../lib/locks';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorState, fmt, Modal, PageHeader, SkeletonRows, StatusBadge, Textarea, Field } from './ui';
import { Timeline, type TimelineItem } from './Timeline';

export interface RecordAction { label: string; perm: string; path: (id: string) => string; method?: string; danger?: boolean; reason?: 'required' | 'optional'; reasonField?: string; body?: Record<string, unknown>; show?: (r: Record<string, unknown>) => boolean }
export interface RecordConfig {
  endpoint: string; queryKey: string; back: string; title: (r: Record<string, unknown>) => string;
  /** Extrahiert Datensatz + Timeline aus der API-Antwort */
  pick: (d: Record<string, unknown>) => { record: Record<string, unknown>; timeline?: TimelineItem[] };
  fields: { key: string; label: string; render?: (v: unknown, r: Record<string, unknown>) => ReactNode }[];
  actions?: RecordAction[]; extra?: (r: Record<string, unknown>, d: Record<string, unknown>) => ReactNode;
  /** Zusätzliche Schaltflächen im Seitenkopf (z. B. Bearbeiten). */
  headerExtra?: (r: Record<string, unknown>) => ReactNode;
  /** Notizen in den Verlauf schreiben (unveränderlich, mit Verfasser). */
  notes?: { perm: string; path: (id: string) => string; show?: (r: Record<string, unknown>) => boolean };
}

export function RecordPage({ cfg }: { cfg: RecordConfig }) {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [cfg.queryKey, id], queryFn: () => api<Record<string, unknown>>(`${cfg.endpoint}/${id}`) });
  const [pending, setPending] = useState<RecordAction>();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<ApiError>();
  const run = useMutation({
    mutationFn: (a: RecordAction) => api(a.path(id), { method: a.method ?? 'POST', body: a.reasonField || a.reason || a.body ? { ...a.body, ...(a.reasonField || a.reason ? { [a.reasonField ?? 'reason']: reason || undefined } : {}) } : undefined }),
    onSuccess: () => { setPending(undefined); setReason(''); setErr(undefined); void qc.invalidateQueries({ queryKey: [cfg.queryKey] }); },
    onError: (e) => setErr(e instanceof ApiError ? e : undefined),
  });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { record, timeline } = cfg.pick(q.data);
  const visible = (cfg.actions ?? []).filter((a) => can(a.perm) && (a.show?.(record) ?? true));
  const click = (a: RecordAction) => (a.reason ? setPending(a) : run.mutate(a));
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => nav(cfg.back)} className="mb-2"><ArrowLeft size={14} />Zurück</Button>
      <PageHeader title={cfg.title(record)} subtitle={typeof record.status === 'string' ? undefined : undefined}
        actions={<>{typeof record.status === 'string' && <StatusBadge status={record.status} />}{cfg.headerExtra?.(record)}{visible.map((a) => <Button key={a.label} variant={a.danger ? 'danger' : 'secondary'} onClick={() => click(a)} disabled={run.isPending}>{a.label}</Button>)}</>} />
      {err && !pending && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err.message}{err.requestId && <span className="ml-2 text-xs opacity-70">Anfrage-ID: {err.requestId}</span>}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {cfg.fields.map((f) => { const v = record[f.key]; return <div key={f.key}><dt className="text-xs text-muted">{f.label}</dt><dd className="mt-0.5 break-words text-sm">{f.render ? f.render(v, record) : v === null || v === undefined || v === '' ? '—' : typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? fmt(v) : String(v)}</dd></div>; })}
          </dl>
          {cfg.extra?.(record, q.data)}
        </Card>
        <Card title="Verlauf">
          {cfg.notes && can(cfg.notes.perm) && (cfg.notes.show?.(record) ?? true) && <NoteForm path={cfg.notes.path(id)} onDone={() => void qc.invalidateQueries({ queryKey: [cfg.queryKey] })} />}
          <Timeline items={timeline} />
        </Card>
      </div>
      <Modal open={!!pending} title={pending?.label ?? ''} onClose={() => { setPending(undefined); setErr(undefined); }}>
        <Field label={`Begründung${pending?.reason === 'required' ? ' *' : ''}`}>{(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err.message}{err.requestId && <span className="ml-2 text-xs opacity-70">Anfrage-ID: {err.requestId}</span>}</p>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPending(undefined)}>Abbrechen</Button><Button variant={pending?.danger ? 'danger' : 'primary'} disabled={run.isPending || (pending?.reason === 'required' && reason.trim().length < 3)} onClick={() => pending && run.mutate(pending)}>Bestätigen</Button></div>
      </Modal>
    </>
  );
}

function NoteForm({ path, onDone }: { path: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const add = useMutation({ mutationFn: () => api(path, { method: 'POST', body: { text: text.trim() } }), onSuccess: () => { setText(''); onDone(); } });
  return (
    <form className="mb-4 space-y-2" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 2) add.mutate(); }}>
      <Textarea aria-label="Notiz" rows={2} maxLength={2000} placeholder="Notiz zum Verlauf hinzufügen…" value={text} onChange={(e) => setText(e.target.value)} />
      {add.error && <p role="alert" className="text-xs text-danger">{add.error instanceof ApiError ? add.error.message : 'Fehlgeschlagen'}</p>}
      <div className="flex justify-end"><Button size="sm" type="submit" disabled={add.isPending || text.trim().length < 2}>Notiz speichern</Button></div>
    </form>
  );
}

/**
 * „Bearbeiten“ für Detailseiten: Formular mit den aktuellen Werten, PATCH mit Versionsprüfung.
 * Geleerte Felder werden als `null` gesendet (Wert entfernen), Pflichtfelder bleiben Pflicht.
 */
export function RecordEdit({ record, perm, endpoint, queryKey, fields, title = 'Bearbeiten', show = true, lock }: {
  record: Record<string, unknown>; perm: string; endpoint: string; queryKey: string; fields: (FieldDef & { from?: (r: Record<string, unknown>) => unknown })[]; title?: string; show?: boolean; lock?: { type: LockType; id: string };
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!show || !can(perm)) return null;
  const defaults = Object.fromEntries(fields.map((f) => { const v = f.from ? f.from(record) : record[f.name]; return [f.name, v === null || v === undefined ? '' : f.type === 'datetime' && typeof v === 'string' ? toLocalInput(v) : String(v)]; }));
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Pencil size={14} />Bearbeiten</Button>
      {open && <FormModal open title={title} onClose={() => setOpen(false)} fields={fields} endpoint={endpoint} method="PATCH" defaults={defaults} lock={lock} invalidate={[[queryKey]]}
        toBody={(v) => ({ ...Object.fromEntries(fields.map((f) => [f.name, v[f.name] === undefined ? (f.required ? undefined : null) : f.type === 'datetime' ? new Date(String(v[f.name])).toISOString() : v[f.name]])), version: record.version })} />}
    </>
  );
}
const toLocalInput = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
