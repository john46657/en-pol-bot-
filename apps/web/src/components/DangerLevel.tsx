import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { fmt, Button, Input } from './ui';

interface Level { key: string; name: string; title: string; emoji: string; color: string }
interface DangerState { level: string; reason: string | null; setByName: string | null; at: string | null; def: Level; levels: Level[] }

/**
 * Gefahrenstatus – live; Ändern mit dispatch.manage (optional mit Grund).
 * Stufen und Texte kommen aus den Einstellungen (CAD → Einstellungen), dieselbe Quelle wie das Discord-Panel.
 */
export function DangerLevel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  useRealtime('dispatch', ['danger.changed'], [['danger-level']]);
  const q = useQuery({ queryKey: ['danger-level'], queryFn: () => api<DangerState>('/danger-level'), refetchInterval: 30_000 });
  const set = useMutation({
    mutationFn: (level: string) => api<DangerState>('/danger-level', { method: 'PUT', body: { level, ...(reason.trim() ? { reason: reason.trim() } : {}) } }),
    onSuccess: (s) => { setReason(''); qc.setQueryData(['danger-level'], s); },
  });
  if (!q.data?.def) return null;
  const cur = q.data.def;
  return (
    <section aria-label="Gefahrenstatus" className="mb-3 rounded-lg border p-3 text-sm" style={{ borderColor: `${cur.color}88`, background: `${cur.color}1f` }}>
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: cur.color }} />
        <strong className="text-base">{cur.emoji} {cur.name}{cur.title ? `: ${cur.title}` : ''}</strong>
        {q.data.reason && <span>— {q.data.reason}</span>}
        {q.data.setByName && <span className="text-xs text-muted">gesetzt von {q.data.setByName}{q.data.at ? ` · ${fmt(q.data.at)}` : ''}</span>}
      </div>
      {can('dispatch.manage') && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Input aria-label="Grund (optional)" placeholder="Grund (optional)" maxLength={200} className="max-w-xs py-1" value={reason} onChange={(e) => setReason(e.target.value)} />
          {q.data.levels.filter((l) => l.key !== q.data!.level).map((l) => (
            <Button key={l.key} size="sm" variant="secondary" disabled={set.isPending} onClick={() => set.mutate(l.key)} style={{ borderColor: `${l.color}aa` }}>{l.emoji} {l.name}</Button>
          ))}
        </div>
      )}
      {set.error && <p role="alert" className="mt-1 text-xs text-danger">Status konnte nicht gesetzt werden.</p>}
    </section>
  );
}
