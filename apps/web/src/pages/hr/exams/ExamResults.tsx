import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Pencil, Search } from 'lucide-react';
import { EXAM_QUESTION_TYPE_LABEL, type ExamAttemptStatus } from '@enrp/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, PageHeader, Select, SkeletonRows, Tabs, type Tone } from '../../../components/ui';
import { ATTEMPT_TONE, attemptLabel, download, fileSafe, Meter, resultText, StatTile, type AttemptRow, type ExamStats } from './common';

interface Results {
  exam: { id: string; title: string; passPercent: number; maxAttempts: number; questionTotal: number; category: string | null };
  stats: ExamStats & { voided: number; avgMinutes: number | null; bestPercent: number | null };
  people: { personnelId: string; name: string; rank: string | null; attempts: number; bestPercent: number | null; passed: boolean; pending: boolean; running: boolean; lastAt: string }[];
  attempts: { id: string; personnelId: string; name: string; rank: string | null; own: boolean; status: ExamAttemptStatus; score: number | null; maxScore: number | null; percent: number | null; passed: boolean | null; startedAt: string; submittedAt: string | null; gradedAt: string | null; voidReason: string | null; minutes: number | null }[];
  questions: { id: string; text: string; type: keyof typeof EXAM_QUESTION_TYPE_LABEL; points: number; asked: number; avgPercent: number | null; correctRate: number | null }[];
}
const TABS = ['Personen', 'Versuche', 'Fragen'];
const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Auswertung einer Prüfung: Kennzahlen, Personen, Versuche und Fragenstatistik. */
export function ExamResultsPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['hr-exam-results', id], queryFn: () => api<Results>(`/hr/exams/${id}/results`) });
  const [tab, setTab] = useState(TABS[0]!);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const needle = search.trim().toLowerCase();
  const people = useMemo(() => (q.data?.people ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle)), [q.data, needle]);
  const attempts = useMemo(() => (q.data?.attempts ?? []).filter((a) => (!needle || a.name.toLowerCase().includes(needle)) && (!status || a.status === status)), [q.data, needle, status]);
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <div><Link to="/trainings?tab=Prüfungen" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} />Prüfungen</Link><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>;
  const r = q.data!;
  const s = r.stats;
  const exportCsv = () => {
    const head = ['Name', 'Rang', 'Status', 'Punkte', 'Max', 'Prozent', 'Ergebnis', 'Begonnen', 'Abgegeben', 'Minuten', 'Annulliert wegen'];
    const rows = r.attempts.map((a) => [a.name, a.rank, attemptLabel(a.status), a.score, a.maxScore, a.percent, a.passed === null ? '' : a.passed ? 'bestanden' : 'nicht bestanden', fmt(a.startedAt), fmt(a.submittedAt), a.minutes, a.voidReason]);
    download(`ergebnisse-${fileSafe(r.exam.title)}.csv`, `﻿${[head, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')}`, 'text/csv;charset=utf-8');
  };
  const hardest = [...r.questions].filter((x) => x.correctRate !== null).sort((a, b) => (a.correctRate ?? 0) - (b.correctRate ?? 0))[0];
  return (
    <div className="grid gap-4">
      <div>
        <Link to="/trainings?tab=Prüfungen" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} />Prüfungen</Link>
        <PageHeader title={`📊 ${r.exam.title}`} subtitle={`Auswertung${r.exam.category ? ` · ${r.exam.category}` : ''} · bestanden ab ${r.exam.passPercent} % · ${r.exam.questionTotal} Fragen`}
          actions={<>
            {r.attempts.length > 0 && <Button variant="secondary" onClick={exportCsv}><Download size={14} />CSV</Button>}
            {can('exam.manage') && <Button variant="secondary" onClick={() => nav(`/trainings/exams/${id}/edit`)}><Pencil size={14} />Bearbeiten</Button>}
          </>} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Teilnehmer" value={s.participants} hint={`${s.attempts} Versuche${s.voided ? ` · ${s.voided} annulliert` : ''}`} />
        <StatTile label="Bestanden" value={s.passed} tone="success" hint={s.participants ? `${Math.round((s.passed / s.participants) * 100)} % der Personen` : '—'} />
        <StatTile label="Bestehensquote" value={s.passRate === null ? '—' : `${s.passRate} %`} hint="je bewertetem Versuch" tone="primary" />
        <StatTile label="Ø Ergebnis" value={s.avgPercent === null ? '—' : `${s.avgPercent} %`} hint={s.bestPercent !== null ? `bestes: ${s.bestPercent} %` : undefined} />
        <StatTile label="Zu bewerten" value={s.pending} tone={s.pending ? 'warning' : undefined} hint={s.running ? `${s.running} laufen gerade` : 'keine laufenden'} />
        <StatTile label="Ø Dauer" value={s.avgMinutes === null ? '—' : `${s.avgMinutes} Min.`} hint={hardest ? `schwerste Frage: ${hardest.correctRate} % richtig` : undefined} />
      </div>
      <Card title={<Tabs tabs={TABS} active={tab} onChange={setTab} />} actions={tab !== 'Fragen' && (
        <div className="flex flex-wrap gap-2">
          <div className="relative"><Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input aria-label="Person suchen" className="w-48 py-1 pl-8" placeholder="Person suchen …" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          {tab === 'Versuche' && <Select aria-label="Status" className="w-auto py-1" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Alle Status</option>{(['SUBMITTED', 'GRADED', 'IN_PROGRESS', 'VOIDED'] as const).map((x) => <option key={x} value={x}>{attemptLabel(x)}</option>)}</Select>}
        </div>
      )}>
        {tab === 'Personen' && (!people.length ? <EmptyState text="Noch keine Teilnehmer" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="p-2">Person</th><th className="p-2">Status</th><th className="p-2">Versuche</th><th className="w-56 p-2">Bestes Ergebnis</th><th className="p-2">Zuletzt</th></tr></thead>
              <tbody>
                {people.map((p) => {
                  const [label, tone]: [string, Tone] = p.passed ? ['Bestanden', 'success'] : p.pending ? ['Wird bewertet', 'info'] : p.running ? ['Läuft', 'warning'] : p.attempts >= r.exam.maxAttempts ? ['Keine Versuche mehr', 'danger'] : ['Nicht bestanden', 'neutral'];
                  return (
                    <tr key={p.personnelId} className="border-t border-line">
                      <td className="p-2"><Link className="font-medium hover:text-primary hover:underline" to={`/personnel/${p.personnelId}`}>{p.name}</Link>{p.rank && <span className="text-xs text-muted"> · {p.rank}</span>}</td>
                      <td className="p-2"><Badge tone={tone}>{label}</Badge></td>
                      <td className="p-2 tabular-nums">{p.attempts} / {r.exam.maxAttempts}</td>
                      <td className="p-2">{p.bestPercent === null ? '—' : <div className="flex items-center gap-2"><span className="w-12 shrink-0 whitespace-nowrap text-right tabular-nums">{p.bestPercent} %</span><Meter value={p.bestPercent} pass={r.exam.passPercent} label={`${p.name}: ${p.bestPercent} Prozent`} /></div>}</td>
                      <td className="p-2 text-xs text-muted">{fmt(p.lastAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {tab === 'Versuche' && (!attempts.length ? <EmptyState text="Keine Versuche" /> : <AttemptTable rows={attempts.map((a) => ({ ...a, title: null }))} />)}
        {tab === 'Fragen' && (!r.questions.length ? <EmptyState text="Keine Fragen" /> : (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-muted">Grundlage: alle bewerteten Versuche. Niedrige Quoten deuten auf schwere oder missverständliche Fragen hin.</p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="p-2">#</th><th className="p-2">Frage</th><th className="p-2">Typ</th><th className="p-2">gestellt</th><th className="w-56 p-2">voll richtig</th><th className="p-2">Ø Punkte</th></tr></thead>
              <tbody>
                {r.questions.map((x, i) => (
                  <tr key={x.id} className="border-t border-line">
                    <td className="p-2 text-xs text-muted">{i + 1}</td>
                    <td className="max-w-md p-2"><span className="line-clamp-2">{x.text.replace(/\{\{\}\}/g, '___')}</span></td>
                    <td className="p-2 text-xs">{EXAM_QUESTION_TYPE_LABEL[x.type] ?? x.type}</td>
                    <td className="p-2 tabular-nums">{x.asked}</td>
                    <td className="p-2">{x.correctRate === null ? '—' : <div className="flex items-center gap-2"><span className={`w-12 shrink-0 whitespace-nowrap text-right tabular-nums ${x.correctRate < 40 ? 'text-danger' : ''}`}>{x.correctRate} %</span><Meter value={x.correctRate} label={`Frage ${i + 1}: ${x.correctRate} Prozent richtig`} /></div>}</td>
                    <td className="p-2 tabular-nums">{x.avgPercent === null ? '—' : `${x.avgPercent} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>
    </div>
  );
}

type Row = Pick<AttemptRow, 'id' | 'status' | 'score' | 'maxScore' | 'percent' | 'passed' | 'startedAt' | 'submittedAt' | 'voidReason' | 'own'> & { name: string; rank: string | null; title: string | null };

/** Tabelle der Versuche (Auswertung und Bewertungs-Warteschlange). */
export function AttemptTable({ rows }: { rows: Row[] }) {
  const nav = useNavigate();
  const withExam = rows.some((r) => r.title);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted"><tr><th className="p-2">Person</th>{withExam && <th className="p-2">Prüfung</th>}<th className="p-2">Status</th><th className="p-2">Ergebnis</th><th className="p-2">Abgegeben</th><th className="p-2"><span className="sr-only">Aktion</span></th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-line">
              <td className="p-2"><span className="font-medium">{a.name}</span>{a.rank && <span className="text-xs text-muted"> · {a.rank}</span>}</td>
              {withExam && <td className="p-2">{a.title}</td>}
              <td className="p-2"><Badge tone={ATTEMPT_TONE[a.status]}>{attemptLabel(a.status)}</Badge>{a.voidReason && <div className="text-xs text-muted">{a.voidReason}</div>}</td>
              <td className="p-2 tabular-nums">{a.status === 'GRADED' ? <>{resultText(a.passed)} <span className="text-xs text-muted">{a.score}/{a.maxScore} ({a.percent} %)</span></> : '—'}</td>
              <td className="p-2 text-xs text-muted">{a.status === 'IN_PROGRESS' ? `läuft seit ${fmt(a.startedAt)}` : fmt(a.submittedAt)}</td>
              <td className="p-2 text-right">{!a.own && <Button size="sm" variant={a.status === 'SUBMITTED' ? 'primary' : 'secondary'} onClick={() => nav(`/trainings/attempts/${a.id}`)}>{a.status === 'SUBMITTED' ? 'Bewerten' : 'Ansehen'}</Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
