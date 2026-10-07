import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Button } from './ui';

interface Level { key: string; name: string; title: string; emoji: string; color: string }
interface DangerState { level: string; reason: string | null; setByName: string | null; at: string | null; def: Level; levels: Level[] }

/** Gefahrenstatus – live; Ändern mit dispatch.manage. Stufen und Texte kommen aus den Einstellungen (dieselbe Quelle wie das Discord-Panel). */
export function DangerLevel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  useRealtime('dispatch', ['danger.changed'], [['danger-level']]);
  const q = useQuery({ queryKey: ['danger-level'], queryFn: () => api<DangerState>('/danger-level') });
  const set = useMutation({
    mutationFn: (level: string) => api<DangerState>('/danger-level', { method: 'PUT', body: { level } }),
    onSuccess: (s) => qc.setQueryData(['danger-level'], s),
  });
  if (!q.data?.def) return null;
  const cur = q.data.def;
  return (
    <div role="status" aria-label="Gefahrenstatus" className="mb-3 flex flex-wrap items-center gap-2 rounded border p-2 text-sm" style={{ borderColor: `${cur.color}66`, background: `${cur.color}1a` }}>
      <strong>{cur.emoji} {cur.name}{cur.title ? `: ${cur.title}` : ''}</strong>
      {q.data.reason && <span className="text-muted">— {q.data.reason}</span>}
      {q.data.setByName && <span className="text-xs text-muted">(gesetzt von {q.data.setByName})</span>}
      {can('dispatch.manage') && <span className="ml-auto flex flex-wrap gap-1">{q.data.levels.filter((l) => l.key !== q.data!.level).map((l) => <Button key={l.key} size="sm" variant="secondary" disabled={set.isPending} onClick={() => set.mutate(l.key)}>{l.emoji} {l.name}</Button>)}</span>}
    </div>
  );
}
