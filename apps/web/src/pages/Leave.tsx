import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { DecisionButtons } from '../components/DecisionButtons';
import { Badge, Button, Card, EmptyState, ErrorState, Field, fmt, Input, PageHeader, SkeletonRows, Tabs, Textarea, type Tone } from '../components/ui';
import type { LeaveConfig } from './admin/LeaveSettings';

interface LeaveRow {
  id: string; number: string; userId: string; name: string; startsAt: string; endsAt: string; reason: string; status: string; active: boolean;
  decidedByName: string | null; decisionReason: string | null; days: number; createdAt: string;
}
const TABS = [['PENDING', 'Pending'], ['ACTIVE', 'On leave now'], ['UPCOMING', 'Upcoming'], ['ALL', 'All']] as const;
const STATUS: Record<string, [string, Tone]> = { PENDING: ['Pending', 'warning'], APPROVED: ['Approved', 'success'], DENIED: ['Denied', 'danger'], CANCELLED: ['Cancelled', 'neutral'], ENDED: ['Ended', 'neutral'] };
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Organisation → Leave: Abmeldung beantragen, eigene/alle sehen, annehmen/ablehnen (leave.manage). */
export function Leave() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const manage = can('leave.manage'), viewAll = can('leave.view');
  const [params] = useSearchParams();
  const [tab, setTab] = useState(viewAll ? 'Pending' : 'All');
  const status = TABS.find(([, l]) => l === tab)?.[0] ?? 'ALL';
  const [err, setErr] = useState<string>();
  const cfg = useQuery({ queryKey: ['leave-config'], queryFn: () => api<LeaveConfig>('/leave/config') });
  const list = useQuery({ queryKey: ['leave', status], queryFn: () => api<{ all: boolean; items: LeaveRow[] }>('/leave', { query: { status } }) });
  const refresh = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['leave'] }); };
  const decide = useMutation({ mutationFn: (v: { id: string; status: 'APPROVED' | 'DENIED'; reason?: string }) => api(`/leave/${v.id}/decision`, { method: 'POST', body: { status: v.status, ...(v.reason ? { reason: v.reason } : {}) } }), onSuccess: refresh, onError: (e) => setErr(errText(e)) });
  const cancel = useMutation({ mutationFn: (id: string) => api(`/leave/${id}/cancel`, { method: 'POST' }), onSuccess: refresh, onError: (e) => setErr(errText(e)) });
  const focus = params.get('id');
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader title="Leave of Absence" subtitle="Request leave (also in Discord with /abmeldung). While it is approved and running you get the on-leave role." />
      {cfg.data && !cfg.data.enabled && <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">Leave requests are switched off.{can('settings.view') && <> Turn them on under <Link className="underline" to="/admin/leave">Administration → Leave of Absences</Link>.</>}</p>}
      {can('leave.request') && cfg.data?.enabled && <RequestForm maxDays={cfg.data.maxDays} onDone={refresh} />}
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <Tabs tabs={viewAll ? TABS.map(([, l]) => l) : ['All', 'Pending']} active={tab} onChange={setTab} />
      <div className="mt-4">
        {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !items.length ? <EmptyState text="No leave requests here." /> : (
          <div className="grid gap-3">{items.map((r) => {
            const [label, tone] = STATUS[r.status] ?? [r.status, 'neutral'];
            const mine = r.userId === user?.id;
            return (
              <Card key={r.id} className={focus === r.id ? 'ring-2 ring-primary' : undefined}
                title={<span className="flex flex-wrap items-center gap-2">{r.name} · {r.number} <Badge tone={tone}>{label}</Badge>{r.active && <Badge tone="info">On leave now</Badge>}</span>}
                actions={<div className="flex flex-wrap gap-2">
                  {r.status === 'PENDING' && manage && <DecisionButtons busy={decide.isPending} onDecide={(s, reason) => decide.mutate({ id: r.id, status: s === 'ACCEPTED' ? 'APPROVED' : 'DENIED', reason })} />}
                  {['PENDING', 'APPROVED'].includes(r.status) && (mine || manage) && <Button size="sm" variant="secondary" disabled={cancel.isPending} onClick={() => { if (confirm(r.active ? 'End this leave now?' : 'Withdraw this leave request?')) cancel.mutate(r.id); }}>{r.active ? 'End now' : 'Withdraw'}</Button>}
                </div>}>
                <p className="text-sm"><b>{fmt(r.startsAt)}</b> – <b>{fmt(r.endsAt)}</b> <span className="text-muted">({r.days} {r.days === 1 ? 'day' : 'days'})</span></p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{r.reason}</p>
                {(r.decidedByName || r.decisionReason) && <p className="mt-2 text-xs text-muted">{r.decidedByName && `Decided by ${r.decidedByName}`}{r.decisionReason && ` · ${r.decisionReason}`}</p>}
              </Card>
            );
          })}</div>
        )}
      </div>
    </>
  );
}

function RequestForm({ maxDays, onDone }: { maxDays: number; onDone: () => void }) {
  const [from, setFrom] = useState(day(new Date()));
  const [to, setTo] = useState(day(new Date(Date.now() + 7 * 86_400_000)));
  const [reason, setReason] = useState('');
  const [ok, setOk] = useState<string>();
  const send = useMutation({
    // ganze Tage in der Zeitzone des Browsers: Beginn 00:00, Ende 23:59
    mutationFn: () => api<LeaveRow>('/leave', { method: 'POST', body: { startsAt: new Date(`${from}T00:00`).toISOString(), endsAt: new Date(`${to}T23:59`).toISOString(), reason } }),
    onSuccess: (r) => { setOk(`Requested (${r.number}). You will get a message when it is decided.`); setReason(''); onDone(); },
  });
  return (
    <Card title="Request leave" className="mb-4">
      <div className="grid gap-3 md:grid-cols-[auto_auto_1fr]">
        <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Until">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Field label="Reason">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. holiday, exams, illness" />}</Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={send.isPending || reason.trim().length < 3 || !from || !to} onClick={() => { setOk(undefined); send.mutate(); }}>Request leave</Button>
        <span className="text-xs text-muted">At most {maxDays} days.</span>
        {ok && <span role="status" className="text-sm text-success">{ok}</span>}
        {send.error && <span role="alert" className="text-sm text-danger">{errText(send.error)}</span>}
      </div>
    </Card>
  );
}
