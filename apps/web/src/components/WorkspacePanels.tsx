import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { fmtDateTime, fmtTime } from '../lib/admin';
import { useAuth } from '../lib/auth';
import { Badge, Card } from './ui';
import { StaffingPanel } from './StaffingPanel';

interface Shift { id: string; name: string; startsAt: string; endsAt: string; leaderName: string | null; unit: string | null; department: string | null }
interface Note { id: string; title: string; link: string | null; important: boolean; createdAt: string }
interface Mdt {
  profile: { rank: string | null; department: string | null; callsign: string | null; serviceNumber: string | null };
  duty: { status: string; since: string; unit: string | null } | null;
  shift: { current: Shift | null; next: Shift | null } | null;
  leave: { number: string; startsAt: string; endsAt: string; active: boolean } | null;
  events: { id: string; title: string; startsAt: string; categoryLabel: string; myStatus: string | null }[] | null;
  notifications: Note[];
  documents: { id: string; title: string; categoryLabel: string }[] | null;
}
const DUTY: Record<string, string> = { ON_DUTY: 'Im Dienst', BREAK: 'Pause', TRAINING: 'Ausbildung', ADMINISTRATIVE: 'Verwaltung' };
const shiftLine = (s: Shift) => `${s.name} · ${fmtDateTime(s.startsAt)}–${fmtTime(s.endsAt)}${s.unit ? ` · ${s.unit}` : ''}${s.leaderName ? ` · Leitung ${s.leaderName}` : ''}`;
const Notes = ({ items }: { items: Note[] }) => (!items.length ? <p className="text-xs text-muted">Keine neuen dienstlichen Benachrichtigungen.</p> : <ul className="space-y-1 text-xs">{items.map((n) => <li key={n.id}>{n.important && <Badge tone="warning">!</Badge>} {n.link ? <Link className="hover:underline" to={n.link}>{n.title}</Link> : n.title}</li>)}</ul>);

/** MDT „Mein Dienst“: Schicht, Abteilung, Abwesenheit, Termine, Benachrichtigungen, Dokumente – nur, wofür Rechte bestehen. */
export function MdtDutyPanel() {
  const q = useQuery({ queryKey: ['workspace', 'mdt'], queryFn: () => api<Mdt>('/workspace/mdt'), refetchInterval: 60_000 });
  const d = q.data;
  if (!d) return null;
  return (
    <Card title="Mein Dienst" className="mb-4">
      <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-xs text-muted">Person</p><p>{[d.profile.rank, d.profile.department].filter(Boolean).join(' · ') || '—'}</p><p className="text-xs text-muted">{[d.profile.callsign, d.profile.serviceNumber].filter(Boolean).join(' · ')}</p>
          <p className="mt-2 text-xs text-muted">Status</p><p>{d.duty ? `${DUTY[d.duty.status] ?? d.duty.status} seit ${fmtTime(d.duty.since)}${d.duty.unit ? ` · Einheit ${d.duty.unit}` : ''}` : 'Außer Dienst'}</p>
          {d.leave && <p className="mt-2"><Badge tone="warning">{d.leave.active ? 'Abgemeldet' : 'Abmeldung geplant'}</Badge> <span className="text-xs">bis {fmtDateTime(d.leave.endsAt)}</span></p>}</div>
        {d.shift && <div><p className="text-xs text-muted">Aktuelle Schicht</p><p>{d.shift.current ? shiftLine(d.shift.current) : '—'}</p><p className="mt-2 text-xs text-muted">Nächste Schicht</p><p>{d.shift.next ? shiftLine(d.shift.next) : '—'}</p><Link to="/shiftplan" className="text-xs underline">Schichtplan</Link></div>}
        {d.events && <div><p className="text-xs text-muted">Anstehende Termine (7 Tage)</p>{!d.events.length ? <p className="text-xs text-muted">Keine.</p> : <ul className="space-y-1 text-xs">{d.events.map((e) => <li key={e.id}><Link className="hover:underline" to={`/calendar?id=${e.id}`}>{fmtDateTime(e.startsAt)} · {e.title}</Link></li>)}</ul>}</div>}
        <div><p className="text-xs text-muted">Dienstliche Benachrichtigungen</p><Notes items={d.notifications} />
          {d.documents && !!d.documents.length && <><p className="mt-2 text-xs text-muted">Dokumente</p><ul className="text-xs">{d.documents.slice(0, 4).map((x) => <li key={x.id}><Link className="hover:underline" to={`/documents?id=${x.id}`}>{x.title}</Link></li>)}</ul></>}</div>
      </div>
    </Card>
  );
}

/** Leitstelle: Besetzung (geplant vs. im Dienst), abwesend (ohne Grund), Termine heute, Systemmeldungen. */
export function DispatchPlanningPanel() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['workspace', 'dispatch'], queryFn: () => api<{ events: { id: string; title: string; startsAt: string; categoryLabel: string }[] | null; notifications: Note[] }>('/workspace/dispatch'), refetchInterval: 60_000 });
  return (
    <div className="mb-3 grid gap-3 lg:grid-cols-3">
      {can('shiftplan.view') && <div className="lg:col-span-2"><StaffingPanel compact /></div>}
      <Card title="Termine & Meldungen (24 h)">
        {q.data?.events && (!q.data.events.length ? <p className="text-xs text-muted">Keine dienstlichen Termine.</p> : <ul className="mb-2 space-y-1 text-xs">{q.data.events.map((e) => <li key={e.id}><Link className="hover:underline" to={`/calendar?id=${e.id}`}>{fmtTime(e.startsAt)} · {e.title}</Link> <span className="text-muted">({e.categoryLabel})</span></li>)}</ul>)}
        <Notes items={q.data?.notifications ?? []} />
      </Card>
    </div>
  );
}
