import { useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, ErrorState, fmt, Field, PageHeader, SkeletonRows, StatusBadge, Tabs, Textarea, Input, Modal } from '../components/ui';
import { Timeline, type TimelineItem } from '../components/Timeline';

interface Version { id: string; version: number; changeSummary: string; content: { body?: string }; contentHash: string; createdAt: string; authorId: string }
interface ReportData { report: { id: string; number: string; type: string; title: string; status: string; authorId: string; version: number; versions: Version[] }; timeline: TimelineItem[] }

export function ReportDetail() {
  const { id = '' } = useParams();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('Content');
  const [editing, setEditing] = useState(false);
  const [reject, setReject] = useState(false);
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<ApiError>();
  const q = useQuery({ queryKey: ['reports', id], queryFn: () => api<ReportData>(`/reports/${id}`) });
  const onDone = () => { setErr(undefined); setEditing(false); setReject(false); void qc.invalidateQueries({ queryKey: ['reports'] }); };
  const act = useMutation({ mutationFn: (v: { path: string; body?: unknown; method?: string }) => api(`/reports/${id}${v.path}`, { method: v.method ?? 'POST', body: v.body }), onSuccess: onDone, onError: (e) => setErr(e instanceof ApiError ? e : undefined) });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data.report;
  const latest = r.versions[0]!;
  const mine = r.authorId === user?.id;
  const editable = (r.status === 'DRAFT' || r.status === 'REJECTED') && (mine || can('reports.edit')) && can('reports.create');
  return (
    <>
      <PageHeader title={`${r.number} — ${r.title}`} subtitle={`${r.type} report · version ${latest.version}`}
        actions={<>
          <StatusBadge status={r.status} />
          {editable && <Button variant="secondary" onClick={() => { setText(latest.content.body ?? ''); setEditing(true); }}>Edit</Button>}
          {editable && can('reports.submit') && <Button onClick={() => act.mutate({ path: '/submit' })}>Submit</Button>}
          {r.status === 'SUBMITTED' && can('reports.review') && <Button onClick={() => act.mutate({ path: '/start-review' })}>Start review</Button>}
          {r.status === 'UNDER_REVIEW' && !mine && can('reports.approve') && <Button onClick={() => act.mutate({ path: '/approve' })}>Approve</Button>}
          {r.status === 'UNDER_REVIEW' && !mine && can('reports.reject') && <Button variant="danger" onClick={() => setReject(true)}>Reject</Button>}
          {r.status === 'APPROVED' && can('reports.archive') && <Button variant="secondary" onClick={() => act.mutate({ path: '/archive' })}>Archive</Button>}
        </>} />
      {err && !editing && !reject && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err.message} {err.requestId && <span className="text-xs opacity-70">Request ID: {err.requestId}</span>}</div>}
      <Tabs tabs={['Content', 'Versions', 'Timeline']} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Content' && <Card><p className="whitespace-pre-wrap text-sm">{latest.content.body ?? JSON.stringify(latest.content, null, 2)}</p></Card>}
        {tab === 'Versions' && <Card><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted"><tr><th className="py-1">Ver.</th><th>Change</th><th>Date</th><th>Hash</th></tr></thead><tbody>{r.versions.map((v) => <tr key={v.id} className="border-t border-line"><td className="py-1.5">{v.version}</td><td>{v.changeSummary}</td><td>{fmt(v.createdAt)}</td><td><code className="text-xs">{v.contentHash.slice(0, 12)}</code></td></tr>)}</tbody></table></Card>}
        {tab === 'Timeline' && <Card><Timeline items={q.data.timeline} /></Card>}
      </div>
      <Modal open={editing} title="Edit report" onClose={() => setEditing(false)} wide>
        <div className="space-y-3">
          <Field label="Report text">{(fid) => <Textarea id={fid} rows={10} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          <Field label="Change summary *" hint="Every save creates a new immutable version.">{(fid) => <Input id={fid} value={summary} onChange={(e) => setSummary(e.target.value)} />}</Field>
          {err && <p role="alert" className="text-sm text-danger">{err.message}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button disabled={summary.trim().length < 3 || act.isPending} onClick={() => act.mutate({ path: '', method: 'PATCH', body: { version: r.version, content: { body: text }, changeSummary: summary } })}>Save new version</Button></div>
        </div>
      </Modal>
      <Modal open={reject} title="Reject report" onClose={() => setReject(false)}>
        <Field label="Reason *">{(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="mt-3 flex justify-end gap-2"><Button variant="secondary" onClick={() => setReject(false)}>Cancel</Button><Button variant="danger" disabled={reason.trim().length < 3} onClick={() => act.mutate({ path: '/reject', body: { reason } })}>Reject</Button></div>
      </Modal>
    </>
  );
}
