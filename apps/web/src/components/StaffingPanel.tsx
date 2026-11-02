import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { fmtTime } from '../lib/admin';
import { Badge, Card, EmptyState, ErrorState, SkeletonRows } from './ui';

interface P { userId: string; name: string; status?: string | null; callsign?: string | null }
interface Staffing {
  totals: { onDuty: number; plannedNow: number; absentNow: number };
  shifts: { id: string; name: string; startsAt: string; endsAt: string; department: string | null; unit: string | null; running: boolean; leaderName: string | null; coverage: { assigned: number; min: number; max: number | null; state: string }; presentCount: number; plannedPresent: P[]; plannedMissing: P[]; plannedAbsent: P[] }[];
  unplannedOnDuty: P[];
}

/**
 * Leitstelle/Schichtplan: geplante Besetzung ↔ tatsächlicher Dienststatus (Stempeluhr). Klar getrennt markiert:
 * ✅ geplant und im Dienst · ⭕ geplant, nicht im Dienst · 🌴 geplant, abwesend (ohne Grund) · ➕ im Dienst, nicht geplant.
 */
export function StaffingPanel({ compact }: { compact?: boolean }) {
  const q = useQuery({ queryKey: ['shiftplan-staffing'], queryFn: () => api<Staffing>('/shiftplan/staffing'), refetchInterval: 30_000 });
  const chip = (p: P, kind: 'present' | 'missing' | 'absent' | 'extra') => {
    const cls = { present: 'border-success/40 bg-success/10', missing: 'border-danger/40 bg-danger/10', absent: 'border-warning/40 bg-warning/10', extra: 'border-info/40 bg-info/10' }[kind];
    const icon = { present: '✅', missing: '⭕', absent: '🌴', extra: '➕' }[kind];
    const title = { present: 'Geplant und im Dienst', missing: 'Geplant, aber nicht im Dienst', absent: 'Geplant, aber abgemeldet', extra: 'Im Dienst, aber nicht eingeplant' }[kind];
    return <li key={`${kind}-${p.userId}`} title={title} className={`rounded border px-1.5 py-0.5 text-xs ${cls}`}>{icon} {p.name}{p.callsign ? ` · ${p.callsign}` : ''}</li>;
  };
  return (
    <Card title="Besetzung: geplant vs. im Dienst" actions={<Link to="/shiftplan" className="text-xs underline">Schichtplan</Link>}>
      {q.isLoading ? <SkeletonRows rows={2} /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data ? null : (
        <>
          <div className="mb-2 flex flex-wrap gap-2 text-xs"><Badge tone="success">Im Dienst: {q.data.totals.onDuty}</Badge><Badge tone="info">Jetzt geplant: {q.data.totals.plannedNow}</Badge><Badge tone="warning">Abgemeldet: {q.data.totals.absentNow}</Badge></div>
          {!q.data.shifts.length ? <EmptyState text="In den nächsten 12 Stunden ist keine Schicht geplant." /> : (
            <div className="space-y-3">{q.data.shifts.slice(0, compact ? 4 : 20).map((s) => (
              <div key={s.id} className="rounded-md border border-line p-2">
                <p className="text-sm font-medium">{s.name} <span className="text-xs font-normal text-muted">{fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}{s.unit ? ` · ${s.unit}` : ''}{s.leaderName ? ` · Leitung ${s.leaderName}` : ''}</span> {s.running ? <Badge tone="info">läuft</Badge> : <Badge>geplant</Badge>} <Badge tone={s.coverage.state === 'UNDER' ? 'danger' : 'success'}>{s.running ? `${s.presentCount} von ${s.coverage.assigned} da` : `${s.coverage.assigned}/${s.coverage.max ?? `${s.coverage.min}+`} eingeteilt`}</Badge></p>
                <ul className="mt-1 flex flex-wrap gap-1">{s.plannedPresent.map((p) => chip(p, 'present'))}{s.plannedMissing.map((p) => chip(p, s.running ? 'missing' : 'present'))}{s.plannedAbsent.map((p) => chip(p, 'absent'))}</ul>
              </div>
            ))}</div>
          )}
          {!!q.data.unplannedOnDuty.length && <div className="mt-3"><p className="mb-1 text-xs text-muted">Im Dienst ohne Schichtplanung</p><ul className="flex flex-wrap gap-1">{q.data.unplannedOnDuty.map((p) => chip(p, 'extra'))}</ul></div>}
          <p className="mt-2 text-[11px] text-muted">✅ geplant + im Dienst · ⭕ geplant, nicht im Dienst · 🌴 abgemeldet · ➕ im Dienst, nicht geplant</p>
        </>
      )}
    </Card>
  );
}
