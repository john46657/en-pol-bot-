import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { STAT_PERIODS, type StatPeriod } from '@enrp/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { download } from '../lib/admin';
import { TrendChart } from '../components/TrendChart';
import { Card, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonRows, Tabs } from '../components/ui';

interface Person { userId: string; name: string; dutyMinutes: number; shifts: number; dutyReports: number; weeklyReports: number; trainings: number; exams: number; tickets: number; meetings: number; absenceDays: number; events: number }
const PERIOD_LABEL: Record<StatPeriod, string> = { today: 'Heute', week: 'Diese Woche', month: 'Dieser Monat', year: 'Dieses Jahr', custom: 'Zeitraum' };
const h = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')} h`;
const COLS: [keyof Person, string][] = [['dutyMinutes', 'Dienstzeit'], ['shifts', 'Schichten'], ['dutyReports', 'Dienstberichte'], ['weeklyReports', 'Wochenberichte'], ['trainings', 'Ausbildungen'], ['exams', 'Prüfungen'], ['tickets', 'Tickets'], ['meetings', 'Besprechungen'], ['absenceDays', 'Abwesenheit (Tage)'], ['events', 'Termine']];

/**
 * Organisation → Statistik & Ranglisten: eigene Kennzahlen (alle), Team (analytics.view), Ranglisten (analytics.leaderboard).
 * Nur Zählwerte aus gespeicherten Daten – keine Bewertung von Leistung oder Qualität; niemand kann Werte von Hand setzen.
 */
export function Statistics() {
  const { can } = useAuth();
  const tabs = ['Meine Statistik', ...(can('analytics.view') ? ['Team'] : []), ...(can('analytics.leaderboard') ? ['Ranglisten'] : [])];
  const [tab, setTab] = useState(tabs[0]!);
  const [period, setPeriod] = useState<StatPeriod>('month');
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const query = { period, ...(period === 'custom' ? { from, to } : {}) };
  const ready = period !== 'custom' || (!!from && !!to);
  const me = useQuery({ queryKey: ['stats', 'me', query], queryFn: () => api<{ stats: Person | null }>('/analytics/personal', { query }), enabled: tab === 'Meine Statistik' && ready });
  const team = useQuery({ queryKey: ['stats', 'team', query], queryFn: () => api<{ totals: Record<string, number>; series: { day: string; hours: number }[]; people: Person[] }>('/analytics/team', { query }), enabled: tab === 'Team' && ready });
  const boards = useQuery({ queryKey: ['stats', 'boards', query], queryFn: () => api<{ boards: { key: string; label: string; unit: string; rows: { userId: string; name: string; value: number; place: number }[] }[] }>('/analytics/leaderboards', { query }), enabled: tab === 'Ranglisten' && ready });
  const [cmp, setCmp] = useState<string[]>([]);
  const fmtV = (k: keyof Person, v: number) => (k === 'dutyMinutes' ? h(v) : String(v));
  return (
    <>
      <PageHeader title="Statistik & Ranglisten" subtitle="Alle Werte stammen aus gespeicherten Daten (Stempeluhr, Schichtplan, Berichte, Ausbildungen, Prüfungen, Tickets, Besprechungen, Abwesenheiten, Termine). Es gibt bewusst keine Leistungsbewertung."
        actions={can('analytics.export') && ready ? <button type="button" className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm" onClick={() => void download(`/analytics/export?${new URLSearchParams(query as Record<string, string>).toString()}`, 'statistik.csv')}><Download size={14} />CSV</button> : undefined} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="my-3 flex flex-wrap items-center gap-2">
        <Select aria-label="Zeitraum" className="w-44" value={period} onChange={(e) => setPeriod(e.target.value as StatPeriod)}>{STAT_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}</Select>
        {period === 'custom' && <><Input aria-label="Von" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /><Input aria-label="Bis" type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></>}
      </div>
      {tab === 'Meine Statistik' && (me.isLoading ? <SkeletonRows /> : me.error ? <ErrorState error={me.error} /> : me.data?.stats ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{COLS.map(([k, l]) => <Card key={k}><p className="text-xs text-muted">{l}</p><p className="text-2xl font-semibold">{fmtV(k, me.data!.stats![k] as number)}</p></Card>)}</div>
      ) : <EmptyState text="Keine Daten." />)}
      {tab === 'Team' && (team.isLoading ? <SkeletonRows /> : team.error ? <ErrorState error={team.error} /> : team.data && (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[['dutyHours', 'Dienststunden'], ['active', 'Aktive Personen'], ['shifts', 'Schichtteilnahmen'], ['dutyReports', 'Dienstberichte'], ['trainings', 'Ausbildungen'], ['meetings', 'Besprechungsteilnahmen'], ['tickets', 'Tickets'], ['exams', 'Prüfungen'], ['absenceDays', 'Abwesenheitstage'], ['events', 'Terminzusagen']].map(([k, l]) => <Card key={k}><p className="text-xs text-muted">{l}</p><p className="text-2xl font-semibold">{team.data.totals[k!] ?? 0}</p></Card>)}</div>
          <Card title="Dienststunden je Tag"><TrendChart days={team.data.series.map((s) => s.day)} values={team.data.series.map((s) => s.hours)} unit="Stunden" label="Dienststunden" /></Card>
          {team.data.people.length > 0 ? (
            <Card title="Je Person" actions={cmp.length ? <button type="button" className="text-xs underline" onClick={() => setCmp([])}>Vergleich leeren</button> : undefined}>
              <p className="mb-2 text-xs text-muted">Zum Vergleichen bis zu 4 Personen anhaken.</p>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted"><th /><th className="p-1">Name</th>{COLS.map(([k, l]) => <th key={k} className="p-1">{l}</th>)}</tr></thead>
                <tbody>{team.data.people.filter((p) => !cmp.length || cmp.includes(p.userId)).map((p) => <tr key={p.userId} className="border-t border-line/60"><td><input type="checkbox" aria-label={`${p.name} vergleichen`} checked={cmp.includes(p.userId)} disabled={!cmp.includes(p.userId) && cmp.length >= 4} onChange={(e) => setCmp(e.target.checked ? [...cmp, p.userId] : cmp.filter((x) => x !== p.userId))} /></td><td className="p-1 font-medium">{p.name}</td>{COLS.map(([k]) => <td key={k} className="p-1">{fmtV(k, p[k] as number)}</td>)}</tr>)}</tbody>
              </table></div>
            </Card>
          ) : <p className="text-xs text-muted">Werte je Person sieht nur, wer „analytics.personal_all“ hat.</p>}
        </div>
      ))}
      {tab === 'Ranglisten' && (boards.isLoading ? <SkeletonRows /> : boards.error ? <ErrorState error={boards.error} /> : !boards.data?.boards.length ? <EmptyState text="Keine Ranglisten eingeschaltet." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{boards.data.boards.map((b) => (
          <Card key={b.key} title={b.label}>{!b.rows.length ? <p className="text-xs text-muted">Noch keine Werte.</p> : <ol className="space-y-1 text-sm">{b.rows.map((r) => <li key={r.userId} className="flex justify-between"><span>{r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : `${r.place}.`} {r.name}</span><span className="text-muted">{b.key === 'dutyMinutes' ? h(r.value) : `${r.value} ${b.unit}`}</span></li>)}</ol>}</Card>
        ))}</div>
      ))}
    </>
  );
}
