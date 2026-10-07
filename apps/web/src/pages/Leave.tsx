import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { DecisionButtons } from '../components/DecisionButtons';
import { Badge, Button, Card, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../components/ui';

/** Abwesenheitsarten (Einstellungen → Personal). */
const useAbsenceTypes = () => useQuery({ queryKey: ['absence-types'], queryFn: () => api<{ key: string; label: string; emoji: string }[]>('/hr/absence-types'), staleTime: 60_000 });
import type { LeaveConfig } from './admin/LeaveSettings';

interface LeaveRow {
  id: string; number: string; userId: string; name: string; startsAt: string; endsAt: string; reason: string; type?: string | null; comment?: string | null; status: string; active: boolean;
  decidedByName: string | null; decisionReason: string | null; days: number; createdAt: string;
}
const TABS = [['PENDING', 'Offen'], ['ACTIVE', 'Gerade abgemeldet'], ['UPCOMING', 'Bevorstehend'], ['ALL', 'Alle']] as const;
const STATUS: Record<string, [string, Tone]> = { PENDING: ['Offen', 'warning'], APPROVED: ['Genehmigt', 'success'], DENIED: ['Abgelehnt', 'danger'], CANCELLED: ['Zurückgezogen', 'neutral'], ENDED: ['Beendet', 'neutral'] };
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Organisation → Leave: Abmeldung beantragen, eigene/alle sehen, annehmen/ablehnen (leave.manage). */
export function Leave() {
  const types = useAbsenceTypes();
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const manage = can('leave.manage'), viewAll = can('leave.view');
  const [params] = useSearchParams();
  const [tab, setTab] = useState(viewAll ? 'Offen' : 'Alle');
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
      <PageHeader title="Abmeldungen" subtitle="Abmeldung beantragen (auch in Discord mit /abmeldung). Solange sie genehmigt ist und läuft, bekommst du die Abgemeldet-Rolle." />
      {cfg.data && !cfg.data.enabled && <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">Abmeldungen sind ausgeschaltet.{can('settings.view') && <> Schalte sie unter <Link className="underline" to="/admin/leave">Administration → Abmeldungen</Link> ein.</>}</p>}
      {can('leave.request') && cfg.data?.enabled && <RequestForm maxDays={cfg.data.maxDays} onDone={refresh} />}
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <Tabs tabs={viewAll ? TABS.map(([, l]) => l) : ['Alle', 'Offen']} active={tab} onChange={setTab} />
      <div className="mt-4">
        {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !items.length ? <EmptyState text="Keine Abmeldungen." /> : (
          <div className="grid gap-3">{items.map((r) => {
            const [label, tone] = STATUS[r.status] ?? [r.status, 'neutral'];
            const mine = r.userId === user?.id;
            return (
              <Card key={r.id} className={focus === r.id ? 'ring-2 ring-primary' : undefined}
                title={<span className="flex flex-wrap items-center gap-2">{r.name} · {r.number} <Badge tone={tone}>{label}</Badge>{r.active && <Badge tone="info">Gerade abgemeldet</Badge>}</span>}
                actions={<div className="flex flex-wrap gap-2">
                  {r.status === 'PENDING' && manage && <DecisionButtons busy={decide.isPending} onDecide={(s, reason) => decide.mutate({ id: r.id, status: s === 'ACCEPTED' ? 'APPROVED' : 'DENIED', reason })} />}
                  {['PENDING', 'APPROVED'].includes(r.status) && (mine || manage) && <Button size="sm" variant="secondary" disabled={cancel.isPending} onClick={() => { if (confirm(r.active ? 'Diese Abmeldung jetzt beenden?' : 'Diese Abmeldung zurückziehen?')) cancel.mutate(r.id); }}>{r.active ? 'Jetzt beenden' : 'Zurückziehen'}</Button>}
                </div>}>
                <p className="text-sm"><b>{fmt(r.startsAt)}</b> – <b>{fmt(r.endsAt)}</b> <span className="text-muted">({r.days} {r.days === 1 ? 'Tag' : 'Tage'})</span></p>
                {r.type && <p className="mt-1 text-xs text-muted">Art: {types.data?.find((t) => t.key === r.type)?.label ?? r.type}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm">{r.reason}</p>
                {r.comment && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{r.comment}</p>}
                {(r.decidedByName || r.decisionReason) && <p className="mt-2 text-xs text-muted">{r.decidedByName && `Entschieden von ${r.decidedByName}`}{r.decisionReason && ` · ${r.decisionReason}`}</p>}
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
  const [type, setType] = useState('');
  const [comment, setComment] = useState('');
  const [ok, setOk] = useState<string>();
  const types = useAbsenceTypes();
  const send = useMutation({
    // ganze Tage in der Zeitzone des Browsers: Beginn 00:00, Ende 23:59
    mutationFn: () => api<LeaveRow>('/leave', { method: 'POST', body: { startsAt: new Date(`${from}T00:00`).toISOString(), endsAt: new Date(`${to}T23:59`).toISOString(), reason, ...(type ? { type } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) } }),
    onSuccess: (r) => { setOk(`Beantragt (${r.number}). Du bekommst eine Nachricht, sobald entschieden wurde.`); setReason(''); setComment(''); onDone(); },
  });
  return (
    <Card title="Abmeldung beantragen" className="mb-4">
      <div className="grid gap-3 md:grid-cols-[auto_auto_1fr]">
        <Field label="Von">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Bis">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Field label="Grund">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Urlaub, Prüfungen, Krankheit" />}</Field>
      </div>
      {(types.data?.length ?? 0) > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
          <Field label="Art">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value)}><option value="">– wählen –</option>{types.data!.map((t) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}</Select>}</Field>
          <Field label="Kommentar (optional)">{(id) => <Input id={id} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={send.isPending || reason.trim().length < 3 || !from || !to} onClick={() => { setOk(undefined); send.mutate(); }}>Abmeldung beantragen</Button>
        <span className="text-xs text-muted">Höchstens {maxDays} Tage.</span>
        {ok && <span role="status" className="text-sm text-success">{ok}</span>}
        {send.error && <span role="alert" className="text-sm text-danger">{errText(send.error)}</span>}
      </div>
    </Card>
  );
}
