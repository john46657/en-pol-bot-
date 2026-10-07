import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, ErrorState, PageHeader, Select, Skeleton } from '../components/ui';

type Section = Record<string, number | null>;
interface Overview { days: number; incidents?: Section; reports?: Section; tickets?: Section; complaints?: Section; applications?: Section; wanted?: Section; personnel?: Section }
const LABELS: Record<string, string> = { created: 'Erstellt', open: 'Offen', closed: 'Geschlossen', avgHandlingMinutes: 'Ø Bearbeitung (min)', issued: 'Ausgestellt', voided: 'Storniert', received: 'Eingegangen', submitted: 'Eingereicht', pending: 'Ausstehend', active: 'Aktiv', totalDutyHours: 'Dienststunden', academyResults: 'Akademie-Ergebnisse' };
const SECTION_LABELS: Record<string, string> = { incidents: 'Einsätze', reports: 'Berichte', tickets: 'Tickets', complaints: 'Beschwerden', applications: 'Bewerbungen', wanted: 'Fahndungen', personnel: 'Personal' };

export function Analytics() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['analytics', days], queryFn: () => api<Overview>('/analytics/overview', { query: { days } }) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const sections = q.data ? (Object.entries(q.data).filter(([k, v]) => k !== 'days' && typeof v === 'object') as [string, Section][]) : [];
  return (
    <>
      <PageHeader title="Statistik" subtitle="Es werden nur Kennzahlen angezeigt, die du sehen darfst." actions={<Select aria-label="Zeitraum" className="w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((d) => <option key={d} value={d}>Letzte {d} Tage</option>)}</Select>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.isLoading ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />) : sections.map(([name, s]) => (
          <Card key={name} title={SECTION_LABELS[name] ?? name[0]!.toUpperCase() + name.slice(1)}><dl className="grid grid-cols-2 gap-3">{Object.entries(s).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{LABELS[k] ?? k}</dt><dd className="text-2xl font-semibold">{v ?? '—'}</dd></div>)}</dl></Card>
        ))}
      </div>
    </>
  );
}
