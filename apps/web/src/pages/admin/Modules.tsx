import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Card, ErrorState, PageHeader, SkeletonRows } from '../../components/ui';

interface ModuleRow { key: string; name: string; description: string; system: boolean; enabled: boolean }
interface Modules { version: number; modules: ModuleRow[] }
const conflictText = (e: unknown) => (e instanceof ApiError && e.status === 409 ? 'Inzwischen von jemand anderem geändert – Ansicht wurde neu geladen, deine Änderung ist NICHT gespeichert.' : errText(e));

/** Administration → Module: Bereiche zentral an- und ausschalten. Die Sperre setzt das Backend durch (Dashboard, API, Discord-Befehle). */
export function Modules() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['modules'], queryFn: () => api<Modules>('/modules') });
  const [saved, setSaved] = useState<string>();
  const toggle = useMutation({
    mutationFn: (m: ModuleRow) => api<Modules>(`/modules/${m.key}`, { method: 'PATCH', body: { enabled: !m.enabled, version: q.data!.version } }),
    // „Gespeichert“ erst nach Antwort des Servers; bei Fehler/Konflikt Stand neu laden
    onSuccess: (_r, m) => { setSaved(`${m.name}: gespeichert`); void qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: () => setSaved(undefined),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['modules'] }),
  });
  const manage = can('modules.manage');
  return (
    <>
      <PageHeader title="Module" subtitle="Bereiche an- oder ausschalten. Ein abgeschaltetes Modul ist im Dashboard, in der API und bei Discord-Befehlen gesperrt – auch für Administratoren. Daten bleiben erhalten." />
      <Card title="Module" actions={toggle.isPending ? <span className="text-xs text-muted">Speichert…</span> : saved ? <span className="text-xs text-success">{saved}</span> : null}>
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.isLoading || !q.data ? <SkeletonRows rows={4} /> : (
          <ul className="grid gap-2 md:grid-cols-2">{q.data.modules.map((m) => (
            <li key={m.key} className="flex items-start gap-3 rounded-lg border border-line p-3">
              {m.system ? <Badge tone="info">System</Badge> : manage ? <Toggle label={`${m.name} aktiv`} checked={m.enabled} onChange={() => toggle.mutate(m)} /> : <Badge tone={m.enabled ? 'success' : 'neutral'}>{m.enabled ? 'An' : 'Aus'}</Badge>}
              <div className="min-w-0"><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.description}</p></div>
            </li>
          ))}</ul>
        )}
        {toggle.error && <p role="alert" className="mt-2 text-sm text-danger">{conflictText(toggle.error)}</p>}
      </Card>
    </>
  );
}
