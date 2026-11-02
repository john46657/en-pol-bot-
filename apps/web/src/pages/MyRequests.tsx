import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { fmtDateTime } from '../lib/admin';
import { Badge, Button, Card, confirmDialog, EmptyState, ErrorState, Field, PageHeader, Select, SkeletonRows, Textarea, type Tone } from '../components/ui';

interface Targets { canPromotion: boolean; canTransfer: boolean; rank: string | null; department: string | null; ranks: { id: string; name: string; eligible: boolean; met: number; total: number; missing: string[] }[]; departments: string[] }
interface Mine {
  id: string; number: string; kind: 'PROMOTION' | 'TRANSFER'; status: string; statusLabel: string; fromLabel: string | null; toLabel: string | null; reason: string; createdAt: string;
  decisions: { decision: string; comment: string | null; at: string; by: string }[]; queries: { id: string; question: string; askedByName: string; askedAt: string; answer: string | null }[]; openQuery: { id: string; question: string } | null; canWithdraw: boolean;
}
const TONE: Record<string, Tone> = { OPEN: 'warning', IN_REVIEW: 'info', NEEDS_INFO: 'warning', DEFERRED: 'neutral', APPROVED: 'success', EXECUTED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };
const DEC: Record<string, string> = { APPROVE: '✅ Genehmigt', REJECT: '❌ Abgelehnt', REVIEW: '🔵 In Prüfung genommen', DEFER: '⚫ Zurückgestellt' };

/**
 * Organisation → Meine Anträge: Beförderung (nur mit erfüllten Voraussetzungen) oder Versetzung beantragen, Status und Rückfragen.
 * Ausgeführt wird erst nach ausdrücklicher Genehmigung durch eine berechtigte Führungskraft. Auch in Discord: /antrag.
 */
export function MyRequests() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const targets = useQuery({ queryKey: ['hr-targets'], queryFn: () => api<Targets>('/hr/requests/targets'), retry: false });
  const mine = useQuery({ queryKey: ['hr-mine'], queryFn: () => api<Mine[]>('/hr/requests/mine') });
  const [kind, setKind] = useState<'PROMOTION' | 'TRANSFER'>('PROMOTION');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string>();
  const [ok, setOk] = useState<string>();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['hr-mine'] }); void qc.invalidateQueries({ queryKey: ['hr-targets'] }); };
  const submit = useMutation({ mutationFn: () => api<{ number: string }>('/hr/requests/self', { body: { kind, to, reason } }), onSuccess: (r) => { setOk(`Antrag ${r.number} eingereicht.`); setErr(undefined); setReason(''); setTo(''); refresh(); }, onError: (e) => { setOk(undefined); setErr(errText(e)); } });
  const answer = useMutation({ mutationFn: (v: { id: string; text: string }) => api(`/hr/requests/${v.id}/answer`, { body: { answer: v.text } }), onSuccess: () => { setAnswers({}); refresh(); }, onError: (e) => setErr(errText(e)) });
  const withdraw = useMutation({ mutationFn: (id: string) => api(`/hr/requests/${id}/withdraw`, { method: 'POST' }), onSuccess: refresh, onError: (e) => setErr(errText(e)) });
  const t = targets.data;
  const rank = t?.ranks.find((r) => r.id === to);
  const focus = params.get('id');

  return (
    <>
      <PageHeader title="Meine Anträge" subtitle="Beförderung oder Versetzung beantragen. Eine berechtigte Führungskraft entscheidet; erst danach werden Rang, Abteilung und Rollen geändert. Auch in Discord: /antrag." />
      <Card title="Neuer Antrag">
        {targets.isLoading ? <SkeletonRows rows={2} /> : targets.error ? <p className="text-sm text-muted">{errText(targets.error)}</p> : t && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
            <p className="text-sm text-muted sm:col-span-2">Aktuell: <strong>{t.rank ?? '—'}</strong> · {t.department ?? 'keine Abteilung'}</p>
            <Field label="Art">{(id) => <Select id={id} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setTo(''); }}>{t.canPromotion && <option value="PROMOTION">Beförderung</option>}{t.canTransfer && <option value="TRANSFER">Versetzung</option>}</Select>}</Field>
            <Field label={kind === 'PROMOTION' ? 'Gewünschter Rang' : 'Gewünschte Abteilung'}>{(id) => (
              <Select id={id} required value={to} onChange={(e) => setTo(e.target.value)}><option value="">— wählen —</option>
                {kind === 'PROMOTION' ? t.ranks.map((r) => <option key={r.id} value={r.id}>{r.name} {r.eligible ? '✅' : `(${r.met}/${r.total})`}</option>) : t.departments.map((d) => <option key={d}>{d}</option>)}
              </Select>
            )}</Field>
            {rank && !rank.eligible && <p role="note" className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm sm:col-span-2">Noch nicht erfüllt: {rank.missing.join(', ')}</p>}
            <div className="sm:col-span-2"><Field label="Begründung (mind. 10 Zeichen)">{(id) => <Textarea id={id} required minLength={10} maxLength={2000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field></div>
            {err && <p role="alert" className="text-sm text-danger sm:col-span-2">{err}</p>}
            {ok && <p role="status" className="text-sm text-success sm:col-span-2">{ok}</p>}
            <div className="sm:col-span-2"><Button type="submit" disabled={submit.isPending || !to || (kind === 'PROMOTION' && !!rank && !rank.eligible) || (!t.canPromotion && !t.canTransfer)}>{submit.isPending ? 'Sendet …' : 'Antrag einreichen'}</Button></div>
          </form>
        )}
      </Card>
      <h2 className="mb-2 mt-6 font-semibold">Verlauf</h2>
      {mine.isLoading ? <SkeletonRows /> : mine.error ? <ErrorState error={mine.error} /> : !mine.data?.length ? <EmptyState text="Noch keine Anträge." /> : (
        <div className="grid gap-3">{mine.data.map((r) => (
          <Card key={r.id} className={focus === r.id ? 'ring-2 ring-primary' : undefined} title={<span className="flex flex-wrap items-center gap-2">{r.kind === 'PROMOTION' ? 'Beförderung' : 'Versetzung'} {r.number}<Badge tone={TONE[r.status] ?? 'neutral'}>{r.statusLabel}</Badge></span>}
            actions={r.canWithdraw ? <Button size="sm" variant="ghost" disabled={withdraw.isPending} onClick={async () => { if (await confirmDialog('Antrag wirklich zurückziehen?', { confirmLabel: 'Zurückziehen' })) withdraw.mutate(r.id); }}>Zurückziehen</Button> : undefined}>
            <p className="text-sm">{r.fromLabel ?? '—'} → <strong>{r.toLabel ?? '—'}</strong> · eingereicht {fmtDateTime(r.createdAt)}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{r.reason}</p>
            {r.queries.map((q) => (
              <div key={q.id} className="mt-2 rounded-md border border-line p-2 text-sm"><p>❓ <strong>{q.askedByName}:</strong> {q.question}</p>
                {q.answer ? <p className="mt-1 text-muted">💬 {q.answer}</p> : r.openQuery?.id === q.id && (
                  <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); answer.mutate({ id: r.id, text: answers[r.id] ?? '' }); }}>
                    <Textarea aria-label="Antwort" rows={2} required minLength={2} maxLength={2000} value={answers[r.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [r.id]: e.target.value })} />
                    <Button type="submit" disabled={answer.isPending}>Antworten</Button>
                  </form>
                )}
              </div>
            ))}
            {!!r.decisions.length && <ul className="mt-2 space-y-1 text-xs text-muted">{r.decisions.map((d, i) => <li key={i}>{DEC[d.decision] ?? d.decision} · {d.by} · {fmtDateTime(d.at)}{d.comment && ` – ${d.comment}`}</li>)}</ul>}
          </Card>
        ))}</div>
      )}
    </>
  );
}
