import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago, optColor, optLabel, useCadConfig, type CadIncidentRow } from '../../lib/cad';
import { InternalStatus, useFleetConfig, VehicleDetail, VehicleIcon, type FleetVehicle } from './Fleet';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, Textarea, fmt } from '../../components/ui';

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Fehlgeschlagen');

// ───────── MDT ─────────
interface MdtLog { id: string; kind: string; text: string; createdAt: string }
interface MdtIncident extends CadIncidentRow { log: MdtLog[] }
interface Mdt {
  units: { id: string; callsign: string; name: string | null; type: string | null; status: string; color: string | null; icon: string | null; vehicle: string | null; operational: boolean; incidents: MdtIncident[] }[];
  radio: { id: string; callsign: string | null; text: string; createdAt: string }[];
  notifications: { id: string; title: string; body: string | null; createdAt: string; readAt: string | null; entityType: string | null; entityId: string | null }[];
  history: { incidentId: string; number: string; type: string | null; status: string; createdAt: string; closedAt: string }[];
  feedback: { key: string; label: string; emoji: string }[];
  /** intern zugewiesene Polizeifahrzeuge der eigenen Einheiten */
  vehicles?: FleetVehicle[];
}

/** MDT für SEK/K9 und andere Einheiten: eigener Status, Einsatzaufträge, Rückmeldungen an die Leitstelle. Gut bedienbar auf dem Handy. */
export function CadMdt() {
  const { cfg } = useCadConfig();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cad-mdt'], queryFn: () => api<Mdt>('/cad/mdt'), refetchInterval: 5_000 });
  const [note, setNote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [vehicle, setVehicle] = useState<string | null>(null);
  const fleetCfg = useFleetConfig();
  const refresh = () => { for (const k of ['cad-mdt', 'cad-units', 'cad-incident', 'cad-overview']) void qc.invalidateQueries({ queryKey: [k] }); };
  const status = useMutation({
    mutationFn: (v: { unitId: string; status: string }) => api(`/cad/units/${v.unitId}/status`, { body: { status: v.status } }),
    onSuccess: () => { setMsg(undefined); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const feedback = useMutation({
    mutationFn: (v: { unitId: string; incidentId: string; kind: string }) => api<{ number: string }>(`/cad/units/${v.unitId}/feedback`, { body: { kind: v.kind, incidentId: v.incidentId, note: note[v.incidentId]?.trim() || undefined } }),
    onSuccess: (r, v) => { setNote((n) => ({ ...n, [v.incidentId]: '' })); setMsg({ ok: true, text: `Rückmeldung zu ${r.number} gesendet.` }); refresh(); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageHeader title="📱 MDT" subtitle="Eigene Einheit, Einsatzaufträge und Rückmeldungen an die Leitstelle" />
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-3 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      {!d.units.length && <Card><EmptyState text="Du bist keiner Einheit zugeordnet." hint="Die Leitstelle ordnet dich unter CAD → Teamübersicht einer Einheit zu." /></Card>}
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {d.units.map((u) => (
            <Card key={u.id} title={<span className="flex items-center gap-2"><span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: u.color ?? optColor(cfg.unitStatuses, u.status) ?? 'var(--color-muted)' }} />{u.icon} {u.callsign}{u.name ? ` · ${u.name}` : ''}</span>}
              actions={<span className="text-xs text-muted">{u.type ? optLabel(cfg.unitTypes, u.type) : ''}{u.vehicle ? ` · 🚓 ${u.vehicle}` : ''}</span>}>
              <div className="mb-3">
                <p className="mb-1 text-xs text-muted">Dienststatus: <b className="text-fg">{optLabel(cfg.unitStatuses, u.status)}</b></p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Status ${u.callsign}`}>
                  {cfg.unitStatuses.map((s) => (
                    <Button key={s.key} size="sm" variant={u.status === s.key ? 'primary' : 'secondary'} aria-pressed={u.status === s.key} disabled={status.isPending}
                      onClick={() => { if (u.status !== s.key) status.mutate({ unitId: u.id, status: s.key }); }}>{s.emoji} {s.label}</Button>
                  ))}
                </div>
              </div>
              {!u.incidents.length ? <p className="py-3 text-center text-sm text-muted">Kein aktueller Einsatzauftrag.</p> : u.incidents.map((i) => (
                <article key={i.id} className="mb-3 rounded-md border border-line p-3 last:mb-0" aria-label={`Einsatz ${i.number}`}>
                  <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base"><b>{i.number}</b> · {i.title}</h3>
                    <span className="flex gap-2 text-xs"><span>{optLabel(cfg.priorities, i.priority)}</span><span className="text-muted">{optLabel(cfg.incidentStatuses, i.status)}</span></span>
                  </header>
                  <dl className="mb-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    {i.keyword && <div><dt className="inline text-muted">Stichwort: </dt><dd className="inline">{i.keyword}</dd></div>}
                    {i.type && <div><dt className="inline text-muted">Einsatzart: </dt><dd className="inline">{optLabel(cfg.incidentTypes, i.type)}</dd></div>}
                    {i.location && <div><dt className="inline text-muted">Ort: </dt><dd className="inline">{i.location}{i.mapX !== null && <> · <Link className="underline" to={`/cad/map?incident=${i.id}`}>Karte</Link></>}</dd></div>}
                    <div><dt className="inline text-muted">Einheiten: </dt><dd className="inline">{i.units.filter((x) => !x.clearedAt).map((x) => x.unit.callsign).join(', ') || '—'}</dd></div>
                  </dl>
                  {i.description && <p className="mb-2 whitespace-pre-wrap text-sm">{i.description}</p>}
                  <Input aria-label="Zusatz zur Rückmeldung" placeholder="Zusatz (optional), z. B. „2 Verdächtige flüchtig“" maxLength={500} className="mb-2" value={note[i.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [i.id]: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label="Rückmeldung an die Leitstelle">
                    {d.feedback.map((f) => (
                      <Button key={f.key} size="sm" variant={f.key === 'support' ? 'danger' : 'secondary'} disabled={feedback.isPending} onClick={() => feedback.mutate({ unitId: u.id, incidentId: i.id, kind: f.key })}>{f.emoji} {f.label}</Button>
                    ))}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted">Einsatzchronik ({i.log.length})</summary>
                    <ul className="mt-1 max-h-60 space-y-0.5 overflow-auto text-xs">{[...i.log].reverse().map((l) => <li key={l.id}><span className="text-muted">{ago(l.createdAt)}</span> · {l.text}</li>)}</ul>
                  </details>
                </article>
              ))}
            </Card>
          ))}
        </div>
        <div className="space-y-3">
          {d.vehicles && d.vehicles.length > 0 && (
            <Card title="🚓 Zugewiesene Fahrzeuge (intern)">
              <ul className="space-y-1.5 text-sm">{d.vehicles.map((v) => (
                <li key={v.id}><button type="button" className="flex w-full items-center gap-2 text-left hover:underline" onClick={() => setVehicle(v.id)}>
                  <VehicleIcon v={v} cfg={fleetCfg} size="h-8 w-8" />
                  <span className="min-w-0 flex-1"><b>{v.api.name}</b>{v.internal.internalCode && <span className="text-muted"> · {v.internal.internalCode}</span>}<span className="block text-xs text-muted">{v.internal.unit?.callsign} · Besitzer {v.api.owner} · {v.active ? 'in ER:LC gemeldet' : 'gerade nicht in ER:LC gemeldet'}</span></span>
                  <InternalStatus cfg={fleetCfg} status={v.internal.status} />
                </button></li>
              ))}</ul>
              <p className="mt-1 text-[11px] text-muted">Interne Zuweisung – sagt nicht, wer das Fahrzeug gerade fährt.</p>
            </Card>
          )}
          <Card title="📻 Funkmeldungen">{d.radio.length ? <ul className="max-h-72 space-y-1 overflow-auto text-sm">{d.radio.map((r) => <li key={r.id}><span className="text-xs text-muted">{ago(r.createdAt)}</span> {r.callsign && <b>{r.callsign}: </b>}{r.text}</li>)}</ul> : <p className="text-sm text-muted">Keine Funkmeldungen.</p>}</Card>
          <Card title="🔔 Letzte Benachrichtigungen">{d.notifications.length ? <ul className="space-y-1 text-sm">{d.notifications.map((n) => <li key={n.id} className={n.readAt ? 'text-muted' : ''}><span className="text-xs text-muted">{ago(n.createdAt)}</span> {n.title}</li>)}</ul> : <p className="text-sm text-muted">Keine Benachrichtigungen.</p>}</Card>
          <Card title="🗂️ Einsatzhistorie">{d.history.length ? <ul className="space-y-1 text-sm">{d.history.map((h) => <li key={h.incidentId}><b>{h.number}</b> · {h.type ? optLabel(cfg.incidentTypes, h.type) : 'Einsatz'} · <span className="text-muted">{optLabel(cfg.incidentStatuses, h.status)} {fmt(h.closedAt)}</span></li>)}</ul> : <p className="text-sm text-muted">Noch keine abgeschlossenen Einsätze.</p>}</Card>
        </div>
      </div>
      <VehicleDetail id={vehicle} onClose={() => setVehicle(null)} />
    </>
  );
}

// ───────── Schichtübergabe ─────────
interface Snapshot {
  incidents: { id: string; number: string; title: string; status: string; priority: string; location: string | null; units: string[]; createdAt: string }[];
  confidentialIncidents: number;
  units: { id: string; callsign: string; name: string | null; status: string; incident: string | null }[];
  calls: { id: string; callNumber: number; description: string | null; location: string | null; status: string; startedAt: string }[];
  changes: { incident: string; text: string; createdAt: string }[];
}
interface Handover { id: string; notes: string; snapshot: Snapshot; createdAt: string; createdById: string | null; createdByName: string | null; acknowledgedAt: string | null; acknowledgedByName: string | null; ackNote: string | null }

function SnapshotView({ s }: { s: Snapshot }) {
  const Section = ({ title, n, children }: { title: string; n: number; children: React.ReactNode }) => <section><h3 className="mb-1 text-sm font-semibold">{title} <span className="text-muted">({n})</span></h3>{children}</section>;
  const none = <p className="text-sm text-muted">—</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="🚨 Offene Einsätze" n={s.incidents.length + s.confidentialIncidents}>
        {s.incidents.length ? <ul className="space-y-1 text-sm">{s.incidents.map((i) => <li key={i.id}><Link className="hover:underline" to={`/cad/incidents?id=${i.id}`}><b>{i.number}</b> · {i.title}</Link> <span className="text-xs text-muted">{i.priority} · {i.status}{i.location ? ` · ${i.location}` : ''}{i.units.length ? ` · ${i.units.join(', ')}` : ''}</span></li>)}</ul> : none}
        {s.confidentialIncidents > 0 && <p className="mt-1 text-xs text-muted">🔒 dazu {s.confidentialIncidents} vertrauliche(r) Einsatz/Einsätze</p>}
      </Section>
      <Section title="🚓 Einheiten im Dienst" n={s.units.length}>
        {s.units.length ? <ul className="space-y-1 text-sm">{s.units.map((u) => <li key={u.id}><b>{u.callsign}</b> <span className="text-muted">{u.status}</span>{u.incident && <> · {u.incident}</>}</li>)}</ul> : none}
      </Section>
      <Section title="📞 Offene Notrufe ohne Einsatz" n={s.calls.length}>
        {s.calls.length ? <ul className="space-y-1 text-sm">{s.calls.map((c) => <li key={c.id}><b>#{c.callNumber}</b> {c.description ?? ''} <span className="text-xs text-muted">{c.location ?? ''} · {ago(c.startedAt)}</span></li>)}</ul> : none}
      </Section>
      <Section title="🔄 Letzte Statusänderungen" n={s.changes.length}>
        {s.changes.length ? <ul className="max-h-60 space-y-0.5 overflow-auto text-xs">{s.changes.map((c, i) => <li key={i}><span className="text-muted">{ago(c.createdAt)}</span> · <b>{c.incident}</b> {c.text}</li>)}</ul> : none}
      </Section>
    </div>
  );
}

/** Schichtübergabe der Leitstelle: aktuellen Stand festhalten, Notizen für die nächste Schicht, Bestätigung durch die Übernehmenden. */
export function CadHandover() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const allowed = can('cad.handover');
  const list = useQuery({ queryKey: ['cad-handovers'], queryFn: () => api<Handover[]>('/cad/handovers'), refetchInterval: 15_000 });
  const draft = useQuery({ queryKey: ['cad-handover-draft'], queryFn: () => api<{ snapshot: Snapshot; previous: Handover | null }>('/cad/handovers/draft'), enabled: allowed, refetchInterval: 15_000 });
  const [notes, setNotes] = useState('');
  const [ackNote, setAckNote] = useState('');
  const [err, setErr] = useState<string>();
  const done = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['cad-handovers'] }); void qc.invalidateQueries({ queryKey: ['cad-handover-draft'] }); };
  const create = useMutation({ mutationFn: () => api('/cad/handovers', { body: { notes: notes.trim() } }), onSuccess: () => { setNotes(''); done(); }, onError: (e) => setErr(errText(e)) });
  const ack = useMutation({ mutationFn: (id: string) => api(`/cad/handovers/${id}/acknowledge`, { body: { note: ackNote.trim() || null } }), onSuccess: () => { setAckNote(''); done(); }, onError: (e) => setErr(errText(e)) });
  if (list.isLoading) return <SkeletonRows />;
  if (list.error || !list.data) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const open = list.data.find((h) => !h.acknowledgedAt);
  return (
    <>
      <PageHeader title="🔁 Schichtübergabe" subtitle="Offene Einsätze, eingesetzte Einheiten, offene Meldungen und Notizen an die nächste Schicht" />
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      {open && (
        <Card className="mb-3 border-warning/60" title={<span>⏳ Offene Übergabe von <b>{open.createdByName ?? '—'}</b> · {fmt(open.createdAt)}</span>}>
          <p className="mb-3 whitespace-pre-wrap rounded-md bg-panel-2 p-2 text-sm">{open.notes}</p>
          <SnapshotView s={open.snapshot} />
          {allowed && open.createdById !== user?.id && (
            <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); ack.mutate(open.id); }}>
              <Input aria-label="Notiz zur Übernahme" placeholder="Notiz zur Übernahme (optional)" maxLength={1000} className="min-w-0 flex-1" value={ackNote} onChange={(e) => setAckNote(e.target.value)} />
              <Button type="submit" disabled={ack.isPending}>✅ Übernahme bestätigen</Button>
            </form>
          )}
          {open.createdById === user?.id && <p className="mt-3 text-xs text-muted">Die nächste Schicht bestätigt die Übernahme.</p>}
        </Card>
      )}
      {allowed && draft.data && (
        <Card className="mb-3" title="Neue Übergabe – aktueller Stand">
          {draft.data.previous && <p className="mb-3 text-xs text-muted">Notizen der vorigen Übergabe ({draft.data.previous.createdByName ?? '—'}, {fmt(draft.data.previous.createdAt)}): <span className="whitespace-pre-wrap text-fg">{draft.data.previous.notes}</span></p>}
          {open ? <details><summary className="cursor-pointer text-sm text-muted">Aktuellen Stand anzeigen</summary><div className="mt-2"><SnapshotView s={draft.data.snapshot} /></div></details> : <SnapshotView s={draft.data.snapshot} />}
          <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (notes.trim()) create.mutate(); }}>
            <Field label="Notizen für die nächste Schicht">{(fid) => <Textarea id={fid} rows={4} maxLength={5000} required value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Was muss die nächste Schicht wissen? z. B. laufende Fahndungen, Absprachen mit SEK/K9 …" />}</Field>
            <Button type="submit" disabled={!notes.trim() || create.isPending}>🔁 Übergabe erstellen</Button>
          </form>
        </Card>
      )}
      <Card title="Verlauf">
        {list.data.length ? <ul className="divide-y divide-line">{list.data.map((h) => (
          <li key={h.id} className="py-2 text-sm">
            <details>
              <summary className="cursor-pointer"><b>{fmt(h.createdAt)}</b> · {h.createdByName ?? '—'} · {h.snapshot.incidents.length + h.snapshot.confidentialIncidents} offene Einsätze · {h.acknowledgedAt ? <Badge tone="success">bestätigt von {h.acknowledgedByName ?? '—'} · {fmt(h.acknowledgedAt)}</Badge> : <Badge tone="warning">offen</Badge>}</summary>
              <p className="my-2 whitespace-pre-wrap rounded-md bg-panel-2 p-2">{h.notes}</p>
              {h.ackNote && <p className="mb-2 text-xs text-muted">Notiz zur Übernahme: {h.ackNote}</p>}
              <SnapshotView s={h.snapshot} />
            </details>
          </li>
        ))}</ul> : <EmptyState text="Noch keine Schichtübergaben." />}
      </Card>
    </>
  );
}

// ───────── Statistik ─────────
interface Bucket { key: string; label?: string; value: number }
interface Stats {
  days: number; since: string; generatedAt: string;
  totals: { created: number; closed: number; openNow: number; avgHandlingMin: number | null; medianHandlingMin: number | null };
  byDay: Bucket[]; byWeek: Bucket[]; byMonth: Bucket[]; byType: Bucket[]; byPriority: Bucket[]; byClosedStatus: Bucket[]; bySource: Bucket[]; units: Bucket[]; unitTypes: Bucket[];
  duty: { totalHours: number; officers: number; sessions: number; top: { userId: string; name: string; hours: number }[] };
}
const minutes = (m: number | null) => (m === null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="card border border-line p-3"><p className="text-xs text-muted">{label}</p><p className="text-2xl font-semibold tabular-nums">{value}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>;
}

/** Waagerechte Balken, ein Farbton; Wert steht immer als Text daneben (nicht nur über die Farbe/Länge). */
function Bars({ rows, unit = '' }: { rows: Bucket[]; unit?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">Keine Daten im Zeitraum.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <table className="w-full text-sm">
      <tbody>{rows.map((r) => (
        <tr key={r.key} title={`${r.label ?? r.key}: ${r.value}${unit}`} className="hover:bg-panel-2">
          <th scope="row" className="w-2/5 max-w-0 truncate py-0.5 pr-2 text-left font-normal">{r.label ?? r.key}</th>
          <td className="py-0.5"><div className="flex items-center gap-2"><div className="h-3 flex-1"><div className="h-3 rounded-r bg-primary" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 2 : 0 }} /></div><span className="w-12 text-right tabular-nums text-muted">{r.value}{unit}</span></div></td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/** Säulen über die Zeit (Einsätze je Tag/Woche/Monat) mit Tabelle als Alternative. */
function Columns({ rows }: { rows: Bucket[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const [table, setTable] = useState(false);
  return (
    <>
      <div className="mb-1 flex justify-end"><Button size="sm" variant="ghost" onClick={() => setTable(!table)}>{table ? 'Diagramm' : 'Tabelle'}</Button></div>
      {table ? <Bars rows={rows} /> : (
        <div className="flex h-40 items-end gap-0.5 border-b border-line" role="img" aria-label={`Einsätze: ${rows.map((r) => `${r.key} ${r.value}`).join(', ')}`}>
          {rows.map((r) => (
            <div key={r.key} className="group relative flex h-full flex-1 items-end" title={`${r.key}: ${r.value}`}>
              <div className="w-full rounded-t bg-primary group-hover:opacity-80" style={{ height: `${(r.value / max) * 100}%`, minHeight: r.value ? 2 : 0 }} />
            </div>
          ))}
        </div>
      )}
      {!table && <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{rows[0]?.key}</span><span>max. {max}</span><span>{rows.at(-1)?.key}</span></div>}
    </>
  );
}

/** Leitstellenstatistik – nachvollziehbar aus gespeicherten Einsätzen und intern erfassten Dienstzeiten. */
export function CadStats() {
  const [days, setDays] = useState(30);
  const [grain, setGrain] = useState<'byDay' | 'byWeek' | 'byMonth'>('byDay');
  const q = useQuery({ queryKey: ['cad-stats', days], queryFn: () => api<Stats>('/cad/stats', { query: { days } }), refetchInterval: 60_000 });
  return (
    <>
      <PageHeader title="📊 Leitstellenstatistik" subtitle="Aus gespeicherten CAD-Einsätzen (auch nach dem automatischen Löschen) und den im System erfassten Dienstzeiten"
        actions={<div className="flex gap-2">
          <Select aria-label="Zeitraum" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 7, 30, 90, 365].map((d) => <option key={d} value={d}>{d === 1 ? 'Letzte 24 Stunden' : `Letzte ${d} Tage`}</option>)}</Select>
        </div>} />
      {q.isLoading ? <SkeletonRows /> : q.error || !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (() => {
        const s = q.data;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Tile label="Neue Einsätze" value={s.totals.created} hint="im Zeitraum angelegt" />
              <Tile label="Abgeschlossen" value={s.totals.closed} hint="im Zeitraum beendet" />
              <Tile label="Offen (jetzt)" value={s.totals.openNow} />
              <Tile label="Ø Bearbeitungszeit" value={minutes(s.totals.avgHandlingMin)} hint={`Median ${minutes(s.totals.medianHandlingMin)}`} />
              <Tile label="Dienstzeit gesamt" value={`${s.duty.totalHours} h`} hint={`${s.duty.officers} Beamte · ${s.duty.sessions} Schichten`} />
            </div>
            <Card title="Einsätze im Zeitverlauf" actions={<div className="w-32"><Select aria-label="Einteilung" value={grain} onChange={(e) => setGrain(e.target.value as typeof grain)}><option value="byDay">je Tag</option><option value="byWeek">je Woche</option><option value="byMonth">je Monat</option></Select></div>}>
              <Columns rows={s[grain]} />
            </Card>
            <div className="grid gap-3 md:grid-cols-2">
              <Card title="Einsatzarten"><Bars rows={s.byType} /></Card>
              <Card title="Prioritäten"><Bars rows={s.byPriority} /></Card>
              <Card title="Beteiligung der Einheiten"><Bars rows={s.units} /></Card>
              <Card title="Einheitentypen"><Bars rows={s.unitTypes} /></Card>
              <Card title="Abschluss"><Bars rows={s.byClosedStatus} /></Card>
              <Card title="Herkunft"><Bars rows={s.bySource} /></Card>
              <Card title="Dienstzeiten (intern erfasst)" className="md:col-span-2"><Bars rows={s.duty.top.map((t) => ({ key: t.userId, label: t.name, value: t.hours }))} unit=" h" /></Card>
            </div>
            <p className="text-xs text-muted">Stand {fmt(s.generatedAt)} · Zeitraum ab {fmt(s.since)}. Dienstzeiten stammen aus den Dienst-Ein-/Austragungen im System, nicht aus der ER:LC-Onlinezeit.</p>
          </div>
        );
      })()}
    </>
  );
}
