import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../../../lib/api';
import { Card, EmptyState, ErrorState, Input, Select, SkeletonRows } from '../../../components/ui';
import { attemptLabel, type AttemptRow } from './common';
import { AttemptTable } from './ExamResults';

/** Bewertung: Warteschlange abgegebener Versuche über alle Prüfungen, bei denen man Prüfer ist. */
export function GradingTab() {
  const [status, setStatus] = useState<string>('SUBMITTED');
  const [exam, setExam] = useState('');
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['hr-attempts'], queryFn: () => api<AttemptRow[]>('/hr/attempts'), refetchInterval: 30_000 });
  const all = useMemo(() => q.data ?? [], [q.data]);
  const exams = useMemo(() => [...new Map(all.map((a) => [a.examId, a.exam.title])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'de')), [all]);
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const needle = search.trim().toLowerCase();
  const list = all.filter((a) => (!status || a.status === status) && (!exam || a.examId === exam) && (!needle || a.personnel.user.displayName.toLowerCase().includes(needle)));
  // älteste Abgabe zuerst bearbeiten
  if (status === 'SUBMITTED') list.sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  const pending = all.filter((a) => a.status === 'SUBMITTED').length;
  return (
    <Card title={`Bewertung${pending ? ` · ${pending} offen` : ''}`} actions={
      <div className="flex flex-wrap gap-2">
        <div className="relative"><Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input aria-label="Person suchen" className="w-44 py-1 pl-8" placeholder="Person …" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select aria-label="Prüfung" className="w-auto py-1" value={exam} onChange={(e) => setExam(e.target.value)}><option value="">Alle Prüfungen</option>{exams.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</Select>
        <Select aria-label="Status" className="w-auto py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="SUBMITTED">Zu bewerten ({pending})</option>
          {(['GRADED', 'IN_PROGRESS', 'VOIDED'] as const).map((s) => <option key={s} value={s}>{attemptLabel(s)} ({all.filter((a) => a.status === s).length})</option>)}
          <option value="">Alle ({all.length})</option>
        </Select>
      </div>
    }>
      {!list.length ? <EmptyState text={status === 'SUBMITTED' ? 'Nichts zu bewerten 🎉' : 'Keine Versuche'} hint={status === 'SUBMITTED' ? 'Abgaben mit Freitext-Fragen erscheinen hier, sobald jemand eine Prüfung abgibt.' : undefined} /> : (
        <AttemptTable rows={list.map((a) => ({ ...a, name: a.personnel.user.displayName, rank: a.personnel.rank, title: a.exam.title }))} />
      )}
    </Card>
  );
}
