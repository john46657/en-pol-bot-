import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, type Tone } from '../../components/ui';
import { OrgSummary } from '../Org';

interface Row { id: string; name: string; rank: string | null; department: string | null; callsign: string | null; serviceNumber: string | null; dutyStatus: string; onDutySince: string | null; qualifications: { name: string; color: string | null }[]; units: { id: string; name: string; role: 'LEADER' | 'DEPUTY' | 'MEMBER' }[] }
const DUTY: Record<string, [string, Tone]> = { ON_DUTY: ['Im Dienst', 'success'], BREAK: ['Pause', 'warning'], OFF_DUTY: ['Außer Dienst', 'neutral'] };

/**
 * MDT/Leitstelle: dienstrelevante Personal-Auskunft (Rang, Abteilung, Dienststatus, einsatzrelevante Qualifikationen,
 * Zugehörigkeit) und Führungsstruktur. Keine Vermerke, Verwarnungen oder Dokumente.
 */
export function MdtPersonnel({ title = '👮 Personal & Qualifikationen' }: { title?: string }) {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [onDuty, setOnDuty] = useState(false);
  const [page, setPage] = useState(1);
  const d = useQuery({ queryKey: ['directory', q, onDuty, page], queryFn: () => api<{ total: number; page: number; pageSize: number; rows: Row[] }>('/personnel-file/directory', { query: { q: q.trim() || undefined, onDuty: onDuty ? '1' : undefined, page } }) });
  const pages = Math.max(1, Math.ceil((d.data?.total ?? 0) / (d.data?.pageSize ?? 50)));
  return (
    <>
      <PageHeader title={title} subtitle="Für die Einsatzkoordination: Dienststatus, Zugehörigkeit und einsatzrelevante Qualifikationen. Vertrauliche Personalinformationen stehen nur in der Personalakte." />
      <div className="grid gap-4 xl:grid-cols-[3fr_1fr]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2"><div className="w-full sm:w-72"><Input aria-label="Suche" placeholder="🔍 Name, Rufname, Dienstnummer, Rang…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={onDuty} onChange={(e) => { setOnDuty(e.target.checked); setPage(1); }} />nur im Dienst</label></div>
          <Card className="overflow-x-auto">
            {d.isLoading ? <SkeletonRows /> : d.error ? <ErrorState error={d.error} /> : !d.data?.rows.length ? <EmptyState text="Keine Treffer." /> : (
              <>
                <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Name</th><th className="p-2">Rang / Abteilung</th><th className="p-2">Rufname</th><th className="p-2">Dienst</th><th className="p-2">Qualifikationen</th><th className="p-2">Einheit</th></tr></thead>
                  <tbody>{d.data.rows.map((r) => {
                    const [l, t] = DUTY[r.dutyStatus] ?? [r.dutyStatus, 'neutral' as Tone];
                    return (
                      <tr key={r.id} className="border-b border-line/60 align-top">
                        <td className="p-2 font-medium">{r.name}{r.serviceNumber && <span className="block text-xs text-muted">{r.serviceNumber}</span>}</td>
                        <td className="p-2">{r.rank ?? '—'}<span className="block text-xs text-muted">{r.department ?? ''}</span></td>
                        <td className="p-2">{r.callsign ?? '—'}</td>
                        <td className="p-2"><Badge tone={t}>{l}</Badge></td>
                        <td className="p-2"><div className="flex flex-wrap gap-1">{r.qualifications.length ? r.qualifications.map((x) => <span key={x.name} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: x.color ?? '#1e40af' }}>{x.name}</span>) : <span className="text-xs text-muted">—</span>}</div></td>
                        <td className="p-2 text-xs">{r.units.map((u) => `${u.name}${u.role === 'LEADER' ? ' (Leitung)' : u.role === 'DEPUTY' ? ' (Stv.)' : ''}`).join(', ') || '—'}</td>
                      </tr>
                    );
                  })}</tbody></table>
                <div className="mt-2 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><span>{page}/{pages}</span><Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button></div>
              </>
            )}
          </Card>
        </div>
        {can('org.view') && <OrgSummary />}
      </div>
    </>
  );
}
