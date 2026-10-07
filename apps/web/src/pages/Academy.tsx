import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '../components/ui';
import { FormModal } from '../components/FormModal';

interface Course { id: string; title: string; description: string | null; passScore: number; _count: { enrollments: number } }

export function Academy() {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['academy'], queryFn: () => api<Course[]>('/academy/courses') });
  return (
    <>
      <PageHeader title="Akademie" actions={can('academy.manage') && <Button onClick={() => setCreating(true)}>Neuer Kurs</Button>} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState text="Noch keine Kurse." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data.map((c) => <Card key={c.id} title={c.title}><p className="text-sm text-muted">{c.description ?? 'Keine Beschreibung.'}</p><p className="mt-2 text-xs">Bestehensgrenze {c.passScore} · {c._count.enrollments} eingeschrieben</p></Card>)}</div>
      )}
      <FormModal open={creating} onClose={() => setCreating(false)} title="Neuer Kurs" endpoint="/academy/courses" invalidate={[['academy']]} fields={[{ name: 'title', label: 'Titel', required: true, min: 3 }, { name: 'description', label: 'Beschreibung', type: 'textarea' }, { name: 'passScore', label: 'Bestehensgrenze (1-100)', type: 'number' }]} />
    </>
  );
}
