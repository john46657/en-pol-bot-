import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Button } from './ui';

interface DangerState { level: 'GREEN' | 'YELLOW' | 'RED'; reason: string | null; setByName: string | null; at: string | null }
const LEVELS = { GREEN: { label: 'Green – normal duty', cls: 'border-emerald-500/40 bg-emerald-500/10' }, YELLOW: { label: 'Yellow – increased caution', cls: 'border-amber-500/40 bg-amber-500/10' }, RED: { label: 'Red – acute danger', cls: 'border-red-500/40 bg-red-500/10' } } as const;

/** Gefahrenstatus (Grün/Gelb/Rot) – live; Ändern mit dispatch.manage. Dieselbe Quelle wie das Discord-Panel. */
export function DangerLevel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  useRealtime('dispatch', ['danger.changed'], [['danger-level']]);
  const q = useQuery({ queryKey: ['danger-level'], queryFn: () => api<DangerState>('/danger-level') });
  const set = useMutation({
    mutationFn: (level: DangerState['level']) => api<DangerState>('/danger-level', { method: 'PUT', body: { level } }),
    onSuccess: (s) => qc.setQueryData(['danger-level'], s),
  });
  if (!q.data) return null;
  const cur = LEVELS[q.data.level];
  return (
    <div role="status" aria-label="Danger level" className={`mb-3 flex flex-wrap items-center gap-2 rounded border p-2 text-sm ${cur.cls}`}>
      <strong>Danger level: {cur.label}</strong>
      {q.data.reason && <span className="text-muted">— {q.data.reason}</span>}
      {q.data.setByName && <span className="text-xs text-muted">(set by {q.data.setByName})</span>}
      {can('dispatch.manage') && <span className="ml-auto flex gap-1">{(Object.keys(LEVELS) as DangerState['level'][]).filter((l) => l !== q.data!.level).map((l) => <Button key={l} size="sm" variant="secondary" disabled={set.isPending} onClick={() => set.mutate(l)}>{l.charAt(0) + l.slice(1).toLowerCase()}</Button>)}</span>}
    </div>
  );
}
