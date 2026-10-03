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
      <PageHeader title="Academy" actions={can('academy.manage') && <Button onClick={() => setCreating(true)}>New course</Button>} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState text="No courses yet." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data.map((c) => <Card key={c.id} title={c.title}><p className="text-sm text-muted">{c.description ?? 'No description.'}</p><p className="mt-2 text-xs">Pass score {c.passScore} · {c._count.enrollments} enrolled</p></Card>)}</div>
      )}
      <FormModal open={creating} onClose={() => setCreating(false)} title="New course" endpoint="/academy/courses" invalidate={[['academy']]} fields={[{ name: 'title', label: 'Title', required: true, min: 3 }, { name: 'description', label: 'Description', type: 'textarea' }, { name: 'passScore', label: 'Pass score (1-100)', type: 'number' }]} />
    </>
  );
}
