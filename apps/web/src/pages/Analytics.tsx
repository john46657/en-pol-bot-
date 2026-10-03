import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, ErrorState, PageHeader, Select, Skeleton } from '../components/ui';

type Section = Record<string, number | null>;
interface Overview { days: number; incidents?: Section; reports?: Section; tickets?: Section; complaints?: Section; applications?: Section; wanted?: Section; personnel?: Section }
const LABELS: Record<string, string> = { created: 'Created', open: 'Open', closed: 'Closed', avgHandlingMinutes: 'Avg. handling (min)', issued: 'Issued', voided: 'Voided', received: 'Received', submitted: 'Submitted', pending: 'Pending', active: 'Active', totalDutyHours: 'Duty hours', academyResults: 'Academy results' };

export function Analytics() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['analytics', days], queryFn: () => api<Overview>('/analytics/overview', { query: { days } }) });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const sections = q.data ? (Object.entries(q.data).filter(([k, v]) => k !== 'days' && typeof v === 'object') as [string, Section][]) : [];
  return (
    <>
      <PageHeader title="Analytics" subtitle="Only metrics you are permitted to see are shown." actions={<Select aria-label="Period" className="w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</Select>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.isLoading ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />) : sections.map(([name, s]) => (
          <Card key={name} title={name[0]!.toUpperCase() + name.slice(1)}><dl className="grid grid-cols-2 gap-3">{Object.entries(s).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{LABELS[k] ?? k}</dt><dd className="text-2xl font-semibold">{v ?? '—'}</dd></div>)}</dl></Card>
        ))}
      </div>
    </>
  );
}
