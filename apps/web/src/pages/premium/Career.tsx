import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Badge, Card, EmptyState, ErrorState, SkeletonRows } from '../../components/ui';
import { dt } from './common';

interface Req { id: string; type: string; label: string; met: boolean; current: string; needed: string; manual: boolean }
interface Career {
  name: string; rank: string | null; rankSince: string; joinDate: string;
  totals: { dutyMinutes: number; reports: number; incidentsCreated: number; promotions: number; trainings: number };
  next: { rankId: string; rankName: string; results: Req[]; met: number; total: number; eligible: boolean }[];
  entries: { at: string; kind: string; title: string; description: string | null; actor: string | null; source: string; sensitive?: boolean }[];
}
interface Progress {
  weakTopics: string[];
  exams: { examId: string; title: string; category: string | null; passPercent: number; attemptsUsed: number; attemptsLeft: number; passed: boolean; bestPercent: number | null; pending: boolean; lastAt: string | null; lastPercent: number | null; weakTopics: string[]; feedback: string | null }[];
  trainings: { id: string; name: string; status: string; progress: number; modules: number; doneModules: number; completedAt: string | null; expiresAt: string | null }[];
  summary: { examsPassed: number; examsTotal: number; trainingsPassed: number; trainingsTotal: number };
}
const ICON: Record<string, string> = { JOINED: '🎉', PROMOTION: '🎖️', TRANSFER: '🔀', TRAINING: '🎓', EXAM: '📝', AWARD: '🏅', WARNING: '⚠️', DISCIPLINE: '⚖️', RECOMMENDATION: '👍', NOTE: '🗒️', SERVICE_NUMBER: '🪪', STATUS: '🔄', DECISION: '✅', DUTY: '🕒', ACTIVITY: '📄', ABSENCE: '🏖️' };
const STATUS: Record<string, string> = { NOT_STARTED: 'nicht begonnen', IN_PROGRESS: 'in Ausbildung', PASSED: 'bestanden', FAILED: 'nicht bestanden', ABORTED: 'abgebrochen', EXPIRED: 'abgelaufen' };

/** Digitale Beamtenlaufbahn: chronologisch, mit Bearbeiter und Quelle; Beförderungsvoraussetzungen der möglichen nächsten Dienstgrade. */
export function CareerTab({ personnelId }: { personnelId: string }) {
  const q = useQuery({ queryKey: ['career', personnelId], queryFn: () => api<Career>(`/hr/people/${personnelId}/career`) });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const c = q.data;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card title="Laufbahn">
        {!c.entries.length ? <EmptyState text="Keine Einträge." /> : (
          <ol className="relative grid gap-3 border-l border-line pl-4">{c.entries.map((e, i) => (
            <li key={i} className="relative">
              <span aria-hidden className="absolute -left-[1.6rem] top-0 grid h-6 w-6 place-items-center rounded-full bg-panel-2 text-xs">{ICON[e.kind] ?? '•'}</span>
              <p className="text-xs text-muted">{dt(e.at)} · {e.source}{e.actor ? ` · Bearbeiter: ${e.actor}` : ''}{e.sensitive && ' · geschützt'}</p>
              <p className="text-sm font-medium">{e.title}</p>
              {e.description && <p className="whitespace-pre-wrap text-xs text-muted">{e.description}</p>}
            </li>
          ))}</ol>
        )}
        <p className="mt-2 text-[11px] text-muted">Frühere Dienstgrade und Einträge werden nie überschrieben – jede Änderung erscheint als eigener Eintrag.</p>
      </Card>
      <div className="grid content-start gap-4">
        <Card title="Kennzahlen">
          <ul className="text-sm"><li>Dienstzeit gesamt: {Math.floor(c.totals.dutyMinutes / 60)} h {c.totals.dutyMinutes % 60} min</li><li>Berichte: {c.totals.reports}</li><li>Angelegte Einsätze (Protokoll): {c.totals.incidentsCreated}</li><li>Beförderungen: {c.totals.promotions} · Ausbildungen: {c.totals.trainings}</li><li>Im Dienstgrad seit: {dt(c.rankSince)}</li></ul>
        </Card>
        <Card title="Beförderungsvoraussetzungen">
          {!c.next.length ? <p className="text-sm text-muted">Kein nächster Dienstgrad eingerichtet.</p> : c.next.map((n) => (
            <div key={n.rankId} className="mb-2">
              <p className="text-sm font-medium">{n.rankName} <Badge tone={n.eligible ? 'success' : 'warning'}>{n.met}/{n.total} erfüllt</Badge></p>
              <ul className="mt-1 grid gap-0.5 text-xs">{n.results.map((r) => <li key={r.id} className={r.met ? 'text-success' : 'text-warning'}>{r.met ? '✓' : '✗'} {r.label} <span className="text-muted">({r.current} / benötigt {r.needed})</span></li>)}</ul>
            </div>
          ))}
          <p className="mt-1 text-[11px] text-muted">Die Entscheidung trifft die zuständige Führungskraft im Beförderungsantrag. Erst nach bestätigter Durchführung werden Dienstgrad und Rollen aktualisiert.</p>
        </Card>
      </div>
    </div>
  );
}

/** Ausbildungs- und Prüfungsfortschritt eines Beamten (bzw. `self` = eigener). */
export function ProgressTab({ personnelId, self }: { personnelId?: string; self?: boolean }) {
  const q = useQuery({ queryKey: ['exam-progress', personnelId ?? 'me'], queryFn: () => api<Progress>(self ? '/hr/me/exam-progress' : `/hr/people/${personnelId}/exam-progress`) });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const p = q.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`Prüfungen (${p.summary.examsPassed}/${p.summary.examsTotal} bestanden)`}>
        {p.weakTopics.length > 0 && <p className="mb-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">Zum Wiederholen markiert: <b>{p.weakTopics.join(', ')}</b></p>}
        {!p.exams.length ? <EmptyState text="Noch keine Prüfungsversuche." /> : <ul className="divide-y divide-line text-sm">{p.exams.map((e) => (
          <li key={e.examId} className="py-1.5">
            <p className="font-medium">{e.title} {e.passed ? <Badge tone="success">bestanden</Badge> : e.pending ? <Badge tone="info">wird bewertet</Badge> : <Badge tone="warning">offen</Badge>}</p>
            <p className="text-xs text-muted">Bestes Ergebnis {e.bestPercent ?? '—'} % (ab {e.passPercent} %) · {e.attemptsUsed} Versuch(e), {e.attemptsLeft} übrig{e.lastAt ? ` · zuletzt ${dt(e.lastAt)}` : ''}</p>
            {e.weakTopics.length > 0 && <p className="text-xs text-warning">Schwache Themen: {e.weakTopics.join(', ')}</p>}
            {e.feedback && <p className="text-xs">Rückmeldung: {e.feedback}</p>}
          </li>
        ))}</ul>}
      </Card>
      <Card title={`Ausbildungen (${p.summary.trainingsPassed}/${p.summary.trainingsTotal} abgeschlossen)`}>
        {!p.trainings.length ? <EmptyState text="Keine Ausbildungen." /> : <ul className="grid gap-2 text-sm">{p.trainings.map((t) => (
          <li key={t.id}><p>{t.name} <span className="text-xs text-muted">· {STATUS[t.status] ?? t.status}{t.modules ? ` · ${t.doneModules}/${t.modules} Module` : ''}</span></p>
            <div className="h-2 rounded bg-panel-2"><div className="h-2 rounded bg-primary" style={{ width: `${t.status === 'PASSED' ? 100 : t.progress}%` }} /></div></li>
        ))}</ul>}
      </Card>
    </div>
  );
}
