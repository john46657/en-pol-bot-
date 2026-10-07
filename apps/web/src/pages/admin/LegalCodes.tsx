import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SkeletonRows } from '../../components/ui';
import { FormModal } from '../../components/FormModal';
import { useState } from 'react';

interface LC { id: string; code: string; title: string; category: string; penalty: { fine?: number; jailMinutes?: number } }

export function LegalCodes() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['legal-codes'], queryFn: () => api<LC[]>('/legal-codes'), enabled: can('tickets.view') });
  return (
    <>
      <PageHeader title="Gesetzeskatalog" subtitle="In der Datenbank gespeichert – nie fest im Frontend hinterlegt." actions={can('settings.manage') && <Button onClick={() => setOpen(true)}>Neuer Paragraf</Button>} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState text="Keine Paragrafen eingerichtet." /> : (
        <div className="table-scroll rounded-lg border border-line bg-panel"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted"><tr><th className="p-2">Code</th><th>Titel</th><th>Kategorie</th><th>Bußgeld</th><th>Haft (Min.)</th></tr></thead>
          <tbody>{q.data.map((c) => <tr key={c.id} className="border-t border-line"><td className="p-2"><Badge>{c.code}</Badge></td><td>{c.title}</td><td>{c.category}</td><td>{c.penalty.fine ?? '—'}</td><td>{c.penalty.jailMinutes ?? '—'}</td></tr>)}</tbody></table></div>
      )}
      <FormModal open={open} onClose={() => setOpen(false)} title="Neuer Paragraf" endpoint="/legal-codes" invalidate={[['legal-codes']]}
        fields={[{ name: 'code', label: 'Code', required: true, max: 32 }, { name: 'title', label: 'Titel', required: true }, { name: 'category', label: 'Kategorie', required: true }, { name: 'fine', label: 'Bußgeld', type: 'number' }, { name: 'jailMinutes', label: 'Haftminuten', type: 'number' }, { name: 'description', label: 'Beschreibung', type: 'textarea' }]}
        toBody={(v) => ({ code: v.code, title: v.title, category: v.category, description: v.description, penalty: { fine: v.fine, jailMinutes: v.jailMinutes } })} />
    </>
  );
}
