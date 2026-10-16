import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { DecisionButtons } from '../components/DecisionButtons';
import { Search } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../components/ui';

/** Abwesenheitsarten (Einstellungen → Personal). */
const useAbsenceTypes = () => useQuery({ queryKey: ['absence-types'], queryFn: () => api<{ key: string; label: string; emoji: string }[]>('/hr/absence-types'), staleTime: 60_000 });
import type { LeaveConfig } from './admin/LeaveSettings';

interface LeaveRow {
  id: string; number: string; userId: string; name: string; startsAt: string; endsAt: string; reason: string; type?: string | null; comment?: string | null; status: string; active: boolean;
  decidedByName: string | null; decisionReason: string | null; days: number; createdAt: string;
}
const TABS = [['PENDING', 'Offen'], ['ACTIVE', 'Gerade abgemeldet'], ['UPCOMING', 'Bevorstehend'], ['CALENDAR', 'Kalender'], ['ALL', 'Alle']] as const;
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
  const [search, setSearch] = useState('');
  const [ending, setEnding] = useState<LeaveRow>();
  const cfg = useQuery({ queryKey: ['leave-config'], queryFn: () => api<LeaveConfig>('/leave/config') });
  const list = useQuery({ queryKey: ['leave', status], queryFn: () => api<{ all: boolean; items: LeaveRow[] }>('/leave', { query: { status } }) });
  const refresh = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['leave'] }); };
  const decide = useMutation({ mutationFn: (v: { id: string; status: 'APPROVED' | 'DENIED'; reason?: string }) => api(`/leave/${v.id}/decision`, { method: 'POST', body: { status: v.status, ...(v.reason ? { reason: v.reason } : {}) } }), onSuccess: refresh, onError: (e) => setErr(errText(e)) });
  const cancel = useMutation({ mutationFn: (id: string) => api(`/leave/${id}/cancel`, { method: 'POST' }), onSuccess: () => { setEnding(undefined); refresh(); }, onError: (e) => { setEnding(undefined); setErr(errText(e)); } });
  const focus = params.get('id');
  const needle = search.trim().toLowerCase();
  const items = (list.data?.items ?? []).filter((r) => !needle || [r.name, r.number, r.reason].some((x) => x.toLowerCase().includes(needle)));

  return (
    <>
      <PageHeader title="Abmeldungen" subtitle="Abmeldung beantragen (auch in Discord mit /abmeldung). Solange sie genehmigt ist und läuft, bekommst du die Abgemeldet-Rolle." />
      {cfg.data && !cfg.data.enabled && <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">Abmeldungen sind ausgeschaltet.{can('settings.view') && <> Schalte sie unter <Link className="underline" to="/admin/leave">Administration → Abmeldungen</Link> ein.</>}</p>}
      {can('leave.request') && cfg.data?.enabled && <RequestForm maxDays={cfg.data.maxDays} onDone={refresh} />}
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <Tabs tabs={viewAll ? TABS.map(([, l]) => l) : ['Alle', 'Offen', 'Kalender']} active={tab} onChange={setTab} />
      {(list.data?.items.length ?? 0) > 3 && <div className="relative mt-3 sm:w-72"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Abmeldungen durchsuchen" placeholder="Name, Nummer, Grund…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} /></div>}
      <div className="mt-4">
        {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !items.length ? <EmptyState text={status === 'CALENDAR' ? 'In den nächsten 4 Wochen ist niemand abgemeldet.' : 'Keine Abmeldungen.'} /> : status === 'CALENDAR' ? <LeaveCalendar items={items} types={types.data} /> : (
          <div className="grid gap-3">{items.map((r) => {
            const [label, tone] = STATUS[r.status] ?? [r.status, 'neutral'];
            const mine = r.userId === user?.id;
            return (
              <Card key={r.id} className={focus === r.id ? 'ring-2 ring-primary' : undefined}
                title={<span className="flex flex-wrap items-center gap-2">{r.name} · {r.number} <Badge tone={tone}>{label}</Badge>{r.active && <Badge tone="info">Gerade abgemeldet</Badge>}</span>}
                actions={<div className="flex flex-wrap gap-2">
                  {r.status === 'PENDING' && manage && <DecisionButtons busy={decide.isPending} onDecide={(s, reason) => decide.mutate({ id: r.id, status: s === 'ACCEPTED' ? 'APPROVED' : 'DENIED', reason })} />}
                  {['PENDING', 'APPROVED'].includes(r.status) && (mine || manage) && <Button size="sm" variant="secondary" disabled={cancel.isPending} onClick={() => setEnding(r)}>{r.active ? 'Jetzt beenden' : 'Zurückziehen'}</Button>}
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
      <ConfirmDialog open={!!ending} title={ending?.active ? 'Abmeldung beenden' : 'Abmeldung zurückziehen'} danger busy={cancel.isPending}
        message={ending ? `${ending.name} · ${ending.number}: ${ending.active ? 'Die Abmeldung endet sofort, die Abgemeldet-Rolle wird entfernt.' : 'Die Abmeldung wird zurückgezogen.'}` : ''}
        confirmLabel={ending?.active ? 'Jetzt beenden' : 'Zurückziehen'} onConfirm={() => ending && cancel.mutate(ending.id)} onClose={() => setEnding(undefined)} />
    </>
  );
}

const DAYS = 28;
/** Kalender der nächsten 4 Wochen: je Person ein Balken (genehmigt = grün, offen = gelb gestrichelt). Auf schmalen Bildschirmen seitlich scrollbar. */
function LeaveCalendar({ items, types }: { items: LeaveRow[]; types?: { key: string; label: string; emoji: string }[] }) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: DAYS }, (_, i) => new Date(start.getTime() + i * 86_400_000));
  const people = [...new Map(items.map((r) => [r.userId, r.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const col = (iso: string) => Math.max(0, Math.min(DAYS, (new Date(iso).getTime() - start.getTime()) / 86_400_000));
  const perDay = days.map((d) => items.filter((r) => r.status === 'APPROVED' && new Date(r.startsAt) < new Date(d.getTime() + 86_400_000) && new Date(r.endsAt) > d).length);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted"><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5 rounded bg-success/70" />Genehmigt</span><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-5 rounded border border-dashed border-warning bg-warning/20" />Offen</span><span>Zahl unter dem Datum: genehmigte Abmeldungen an diesem Tag</span></div>
      <div className="table-scroll">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[140px_1fr] items-end border-b border-line pb-1 text-[10px] text-muted">
            <span className="sticky left-0 z-10 bg-panel">Mitglied</span>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }}>
              {days.map((d, i) => <span key={i} className={`text-center ${[0, 6].includes(d.getDay()) ? 'text-fg/70' : ''} ${i === 0 ? 'font-semibold text-primary' : ''}`}>{d.toLocaleDateString('de-DE', { weekday: 'narrow' })}<br />{d.getDate()}.<br /><b className={perDay[i] ? 'text-warning' : ''}>{perDay[i] || '·'}</b></span>)}
            </div>
          </div>
          {people.map(([uid, name]) => (
            <div key={uid} className="grid grid-cols-[140px_1fr] items-center border-b border-line/50 py-1.5 last:border-0">
              <span className="sticky left-0 z-10 truncate bg-panel pr-2 text-sm">{name}</span>
              <div className="relative h-6">
                {items.filter((r) => r.userId === uid).map((r) => {
                  const a = col(r.startsAt), b = Math.max(a + 0.3, col(r.endsAt));
                  const t = types?.find((x) => x.key === r.type);
                  return <span key={r.id} title={`${r.number} · ${fmt(r.startsAt)} – ${fmt(r.endsAt)} · ${r.reason}`} className={`absolute inset-y-0 flex items-center overflow-hidden rounded px-1 text-[11px] ${r.status === 'APPROVED' ? 'bg-success/70 text-white' : 'border border-dashed border-warning bg-warning/20 text-warning'}`}
                    style={{ left: `${(a / DAYS) * 100}%`, width: `${((b - a) / DAYS) * 100}%` }}><span className="truncate">{t ? `${t.emoji} ` : ''}{r.reason}</span></span>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
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
  const span = from && to ? Math.round((new Date(`${to}T00:00`).getTime() - new Date(`${from}T00:00`).getTime()) / 86_400_000) + 1 : 0;
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
        <Button disabled={send.isPending || reason.trim().length < 3 || !from || !to || span < 1 || span > maxDays} onClick={() => { setOk(undefined); send.mutate(); }}>Abmeldung beantragen</Button>
        <span className={`text-xs ${span < 1 || span > maxDays ? 'text-danger' : 'text-muted'}`}>{span < 1 ? '„Bis“ liegt vor „Von“.' : `${span} ${span === 1 ? 'Tag' : 'Tage'} · höchstens ${maxDays} Tage.`}</span>
        {ok && <span role="status" className="text-sm text-success">{ok}</span>}
        {send.error && <span role="alert" className="text-sm text-danger">{errText(send.error)}</span>}
      </div>
    </Card>
  );
}
