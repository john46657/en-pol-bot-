import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileText, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, SkeletonRows, Textarea } from '../../components/ui';
import { age, Counts, dt, readLocal, Source, Stat, writeLocal } from './common';

interface Finding { code: string; level: string; message: string }
interface Section { asOf: string; source: string }
interface Situation {
  generatedAt: string;
  incidents: Section & { total: number; unassigned: number; byPriority: Record<string, number>; byStatus: Record<string, number>; items: { id: string; number: string; title: string; priorityLabel: string; statusLabel: string; location: string | null; units: string[]; ageMinutes: number; hasPosition: boolean; errors: Finding[]; warnings: Finding[] }[] };
  units: Section & { total: number; byStatus: Record<string, number>; assigned: { id: string; callsign: string; current: { id: string; number: string }; crew: string[] }[]; unassigned: { id: string; callsign: string; statusLabel: string }[] };
  officers: Section & { onDuty: number; available: number; byStatus: Record<string, number>; items: { userId: string; name: string; statusLabel: string; rank: string | null; department: string | null; callsign: string | null; unit: string | null; sinceMinutes: number }[] };
  wanted: Section & { total: number; hitsToReview: number; byPriority: Record<string, number>; expiringSoon: { id: string; number: string | null; reason: string; expiresAt: string }[]; newest: { id: string; number: string | null; reason: string; priority: string }[] };
  reports: Section & { byStatus: Record<string, number>; visibleAll: boolean; incomplete: { id: string; number: string; title: string; status: string; errors: string[] }[] };
  calls: (Section & { enabled: boolean; open: number; withoutIncident: number; withoutPosition: number; servers: { id: string; name: string; status: string; lastSyncAt: string | null; emergencyCalls: boolean; lastError: string | null }[]; items: { id: string; callNumber: number; description: string | null; location: string | null; startedAt: string; incident: string | null; hasPosition: boolean }[] }) | null;
  disruptions: Section & { items: { id: string; source: string; sourceName: string | null; step: string | null; message: string; count: number; firstAt: string; lastAt: string; acknowledgedAt: string | null }[] };
  tasks: Section & { items: { key: string; label: string; count: number; href: string }[] };
  critical: { kind: string; id: string; text: string }[];
}
interface SavedReport { id: string; number: string; note: string | null; createdAt: string; createdBy: string; text?: string }
const AUTO_KEY = 'enrp.situation.auto';

/** Automatischer Lageassistent: Zusammenfassung ausschließlich vorhandener Daten mit Quelle und Stand. */
export function SituationPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [auto, setAuto] = useState<number>(() => readLocal(AUTO_KEY, 0));
  const q = useQuery({ queryKey: ['situation'], queryFn: () => api<Situation>('/situation'), refetchInterval: auto ? auto * 1000 : false });
  const reports = useQuery({ queryKey: ['situation-reports'], queryFn: () => api<SavedReport[]>('/situation/reports') });
  const [show, setShow] = useState<SavedReport | null>(null);
  const [note, setNote] = useState('');
  const [compose, setCompose] = useState(false);
  const create = useMutation({ mutationFn: () => api<SavedReport>('/situation/reports', { body: { note: note.trim() || null } }), onSuccess: (r) => { setCompose(false); setNote(''); setShow(r); void qc.invalidateQueries({ queryKey: ['situation-reports'] }); } });
  const open = useMutation({ mutationFn: (id: string) => api<SavedReport>(`/situation/reports/${id}`), onSuccess: setShow });
  const o = q.data;
  return (
    <>
      <PageHeader title="🧭 Lageassistent" subtitle="Aktuelle Lage aus CAD, Dienst, Fahndungen, Berichten und Technik – nur erfasste Daten, jeweils mit Quelle und Stand."
        actions={<>
          <label className="flex items-center gap-1 text-xs">Automatisch aktualisieren
            <select aria-label="Automatisch aktualisieren" className="rounded border border-line bg-panel px-1 py-0.5" value={auto} onChange={(e) => { const v = Number(e.target.value); setAuto(v); writeLocal(AUTO_KEY, v); }}>
              <option value={0}>aus</option><option value={30}>alle 30 s</option><option value={60}>jede Minute</option><option value={300}>alle 5 Min.</option>
            </select></label>
          <Button variant="secondary" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw size={14} />Aktualisieren</Button>
          {can('situation.create') && <Button onClick={() => setCompose(true)}><FileText size={14} />Lagebericht erzeugen</Button>}
        </>} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : o && (
        <div className="grid gap-4">
          <p className="text-xs text-muted">Datenstand: {dt(o.generatedAt)} ({age(o.generatedAt)}){q.isFetching ? ' · wird aktualisiert …' : ''}</p>
          {o.critical.length > 0 && (
            <Card title="⚠️ Kritisch / fehlende Pflichtangaben">
              <ul className="grid gap-1 text-sm">{o.critical.map((c) => <li key={`${c.kind}-${c.id}`} className="rounded border border-danger/40 bg-danger/10 px-2 py-1">{c.kind === 'INCIDENT' || c.kind === 'MISSING' ? <Link className="underline" to={`/cad/incidents?id=${c.id}`}>{c.text}</Link> : c.kind === 'CALL' ? <Link className="underline" to={`/cad/calls?id=${c.id}`}>{c.text}</Link> : c.text}</li>)}</ul>
            </Card>
          )}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Im Dienst" value={o.officers.onDuty} hint={`${o.officers.available} ohne Einheit`} />
            <Stat label="Aktive Einsätze" value={o.incidents.total} tone={o.incidents.unassigned ? 'warning' : undefined} hint={`${o.incidents.unassigned} ohne Einheit`} />
            <Stat label="Einheiten im Einsatz" value={o.units.assigned.length} hint={`${o.units.total} gesamt`} />
            <Stat label="Aktive Fahndungen" value={o.wanted.total} hint={`${o.wanted.hitsToReview} Treffer zur Prüfung`} />
            <Stat label="Unvollständige Berichte" value={o.reports.incomplete.length} tone={o.reports.incomplete.length ? 'warning' : 'success'} />
            <Stat label="Technische Störungen" value={o.disruptions.items.length} tone={o.disruptions.items.length ? 'danger' : 'success'} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title={`Offene Einsätze (${o.incidents.total})`}>
              <div className="mb-2 flex flex-wrap gap-2 text-xs"><Counts data={o.incidents.byPriority} /></div>
              {!o.incidents.items.length ? <EmptyState text="Keine aktiven Einsätze." /> : (
                <ul className="divide-y divide-line text-sm">{o.incidents.items.map((i) => (
                  <li key={i.id} className="py-1.5">
                    <Link className="font-medium underline" to={`/cad/incidents?id=${i.id}`}>{i.number}</Link> · {i.title} <Badge>{i.priorityLabel}</Badge> <Badge>{i.statusLabel}</Badge>
                    <p className="text-xs text-muted">{i.location ?? 'ohne Ort'} · Einheiten: {i.units.join(', ') || <span className="text-warning">keine</span>} · seit {i.ageMinutes} Min.{!i.hasPosition && ' · keine Kartenposition'}</p>
                    {i.errors.map((e) => <p key={e.code} className="text-xs text-danger">✗ {e.message}</p>)}
                    {i.warnings.map((e) => <p key={e.code} className="text-xs text-warning">⚠ {e.message}</p>)}
                  </li>
                ))}</ul>
              )}
              <Source source={o.incidents.source} asOf={o.incidents.asOf} />
            </Card>
            <Card title={`Personal (${o.officers.onDuty} im Dienst)`}>
              <div className="mb-2"><Counts data={o.officers.byStatus} /></div>
              {!o.officers.items.length ? <EmptyState text="Niemand im Dienst erfasst." /> : (
                <div className="table-scroll"><table className="w-full text-sm"><thead className="text-left text-xs text-muted"><tr><th>Name</th><th>Status</th><th>Abteilung</th><th>Einheit</th><th>Seit</th></tr></thead>
                  <tbody>{o.officers.items.map((x) => <tr key={x.userId} className="border-t border-line"><td className="py-1">{x.name}{x.rank && <span className="text-xs text-muted"> · {x.rank}</span>}{x.callsign && <span className="text-xs text-muted"> · {x.callsign}</span>}</td><td>{x.statusLabel}</td><td>{x.department ?? '—'}</td><td>{x.unit ?? <span className="text-muted">frei</span>}</td><td className="tabular-nums">{x.sinceMinutes} Min.</td></tr>)}</tbody></table></div>
              )}
              <p className="mt-2 text-xs">Einheiten: <Counts data={o.units.byStatus} /></p>
              {o.units.unassigned.length > 0 && <p className="mt-1 text-xs text-muted">Ohne Einsatz: {o.units.unassigned.map((u) => `${u.callsign} (${u.statusLabel})`).join(', ')}</p>}
              <Source source={o.officers.source} asOf={o.officers.asOf} />
            </Card>
            <Card title={`Fahndungen (${o.wanted.total})`}>
              <Counts data={o.wanted.byPriority} />
              <ul className="mt-2 grid gap-0.5 text-sm">{o.wanted.newest.map((w) => <li key={w.id}><Link className="underline" to={`/wanted/${w.id}`}>{w.number ?? 'Fahndung'}</Link> · {w.reason} <Badge>{w.priority}</Badge></li>)}</ul>
              {o.wanted.expiringSoon.length > 0 && <p className="mt-2 text-xs text-warning">Läuft in 24 h ab: {o.wanted.expiringSoon.map((w) => `${w.number ?? w.reason} (${dt(w.expiresAt)})`).join(', ')}</p>}
              <Source source={o.wanted.source} asOf={o.wanted.asOf} />
            </Card>
            <Card title="Ausstehende Berichte">
              <Counts data={o.reports.byStatus} />
              {!o.reports.visibleAll && <p className="mt-1 text-xs text-muted">Ohne Prüfrecht nur eigene Entwürfe.</p>}
              <ul className="mt-2 grid gap-1 text-sm">{o.reports.incomplete.map((r) => <li key={r.id}><Link className="underline" to={`/reports/${r.id}`}>{r.number}</Link> · {r.title}<p className="text-xs text-danger">{r.errors.join(' ')}</p></li>)}</ul>
              <Source source={o.reports.source} asOf={o.reports.asOf} />
            </Card>
            {o.calls && (
              <Card title={`Notrufe aus ER:LC (${o.calls.open} offen)`}>
                {!o.calls.enabled ? <p className="text-sm text-muted">Kein ER:LC-Server eingerichtet – es werden keine Notrufdaten angezeigt.</p> : <>
                  <ul className="text-xs">{o.calls.servers.map((s) => <li key={s.id}>{s.name}: {s.status} · letzte Synchronisierung {age(s.lastSyncAt)}{!s.emergencyCalls && ' · Notrufe nicht freigegeben'}{s.lastError && <span className="text-danger"> · {s.lastError}</span>}</li>)}</ul>
                  <p className="mt-1 text-sm">Ohne Einsatz: {o.calls.withoutIncident} · ohne genaue Position: {o.calls.withoutPosition}</p>
                  <ul className="mt-1 grid gap-0.5 text-sm">{o.calls.items.map((c) => <li key={c.id}>#{c.callNumber} {c.description ?? ''} · {c.location ?? 'Ort unbekannt'} · {dt(c.startedAt)}{c.incident ? ` → ${c.incident}` : ''}{!c.hasPosition && <span className="text-warning"> · keine genaue Position</span>}</li>)}</ul>
                </>}
                <Source source={o.calls.source} asOf={o.calls.asOf} />
              </Card>
            )}
            <Card title="Technische Störungen">
              {!o.disruptions.items.length ? <p className="text-sm text-success">Keine offenen Störungen.</p> : <ul className="grid gap-1 text-sm">{o.disruptions.items.map((d) => <li key={d.id}><b>{d.sourceName ?? d.source}{d.step ? ` (${d.step})` : ''}</b>: {d.message} <span className="text-xs text-muted">{d.count}× seit {dt(d.firstAt)}{d.acknowledgedAt ? ' · quittiert' : ''}</span></li>)}</ul>}
              <Source source={o.disruptions.source} asOf={o.disruptions.asOf} />
            </Card>
            <Card title="Offene Aufgaben der Führungsebene">
              <ul className="grid gap-1 text-sm">{o.tasks.items.map((t) => <li key={t.key} className="flex justify-between gap-2"><Link className={t.count ? 'underline' : 'text-muted'} to={t.href}>{t.label}</Link><Badge tone={t.count ? 'warning' : 'neutral'}>{t.count}</Badge></li>)}</ul>
              <Source source={o.tasks.source} asOf={o.tasks.asOf} />
            </Card>
          </div>
          <Card title="Gespeicherte Lageberichte">
            {!reports.data?.length ? <EmptyState text="Noch keine Lageberichte." /> : <ul className="divide-y divide-line text-sm">{reports.data.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-1.5"><span><b>{r.number}</b> · {dt(r.createdAt)} · {r.createdBy}{r.note && <span className="text-xs text-muted"> · {r.note.slice(0, 80)}</span>}</span><Button size="sm" variant="ghost" onClick={() => open.mutate(r.id)}>Ansehen</Button></li>)}</ul>}
          </Card>
        </div>
      )}
      <Modal open={compose} title="Lagebericht erzeugen" onClose={() => setCompose(false)}>
        <div className="grid gap-2 text-sm">
          <p className="text-xs text-muted">Der Bericht enthält den aktuellen Datenstand (Personal, Einsätze, Fahndungen, Berichte, Störungen, offene Aufgaben) und wird unveränderlich gespeichert.</p>
          <Textarea aria-label="Anmerkung" rows={3} maxLength={2000} placeholder="Anmerkung der Führung (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {create.error && <p role="alert" className="text-danger">{errText(create.error)}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCompose(false)}>Abbrechen</Button><Button disabled={create.isPending} onClick={() => create.mutate()}>Erzeugen</Button></div>
        </div>
      </Modal>
      <Modal open={!!show} wide title={show ? `Lagebericht ${show.number}` : ''} onClose={() => setShow(null)}>
        {show?.text && <div className="grid gap-2"><pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-line bg-panel-2 p-3 text-xs">{show.text}</pre><div className="flex justify-end"><Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(show.text ?? '')}><Copy size={14} />Kopieren</Button></div></div>}
      </Modal>
    </>
  );
}
