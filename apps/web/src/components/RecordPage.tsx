import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
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
        actions={<>{typeof record.status === 'string' && <StatusBadge status={record.status} />}{visible.map((a) => <Button key={a.label} variant={a.danger ? 'danger' : 'secondary'} onClick={() => click(a)} disabled={run.isPending}>{a.label}</Button>)}</>} />
      {err && !pending && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err.message}{err.requestId && <span className="ml-2 text-xs opacity-70">Anfrage-ID: {err.requestId}</span>}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {cfg.fields.map((f) => { const v = record[f.key]; return <div key={f.key}><dt className="text-xs text-muted">{f.label}</dt><dd className="mt-0.5 break-words text-sm">{f.render ? f.render(v, record) : v === null || v === undefined || v === '' ? '—' : typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? fmt(v) : String(v)}</dd></div>; })}
          </dl>
          {cfg.extra?.(record, q.data)}
        </Card>
        <Card title="Verlauf"><Timeline items={timeline} /></Card>
      </div>
      <Modal open={!!pending} title={pending?.label ?? ''} onClose={() => { setPending(undefined); setErr(undefined); }}>
        <Field label={`Begründung${pending?.reason === 'required' ? ' *' : ''}`}>{(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err.message}{err.requestId && <span className="ml-2 text-xs opacity-70">Anfrage-ID: {err.requestId}</span>}</p>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setPending(undefined)}>Abbrechen</Button><Button variant={pending?.danger ? 'danger' : 'primary'} disabled={run.isPending || (pending?.reason === 'required' && reason.trim().length < 3)} onClick={() => pending && run.mutate(pending)}>Bestätigen</Button></div>
      </Modal>
    </>
  );
}
