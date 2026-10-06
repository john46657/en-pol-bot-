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
      <PageHeader title="Legal Codes" subtitle="Stored in the database — never hard-coded in the frontend." actions={can('settings.manage') && <Button onClick={() => setOpen(true)}>New legal code</Button>} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState text="No legal codes configured." /> : (
        <div className="table-scroll rounded-lg border border-line bg-panel"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-muted"><tr><th className="p-2">Code</th><th>Title</th><th>Category</th><th>Fine</th><th>Jail (min)</th></tr></thead>
          <tbody>{q.data.map((c) => <tr key={c.id} className="border-t border-line"><td className="p-2"><Badge>{c.code}</Badge></td><td>{c.title}</td><td>{c.category}</td><td>{c.penalty.fine ?? '—'}</td><td>{c.penalty.jailMinutes ?? '—'}</td></tr>)}</tbody></table></div>
      )}
      <FormModal open={open} onClose={() => setOpen(false)} title="New legal code" endpoint="/legal-codes" invalidate={[['legal-codes']]}
        fields={[{ name: 'code', label: 'Code', required: true, max: 32 }, { name: 'title', label: 'Title', required: true }, { name: 'category', label: 'Category', required: true }, { name: 'fine', label: 'Fine', type: 'number' }, { name: 'jailMinutes', label: 'Jail minutes', type: 'number' }, { name: 'description', label: 'Description', type: 'textarea' }]}
        toBody={(v) => ({ code: v.code, title: v.title, category: v.category, description: v.description, penalty: { fine: v.fine, jailMinutes: v.jailMinutes } })} />
    </>
  );
}
