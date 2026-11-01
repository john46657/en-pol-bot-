import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw, Stethoscope } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Button, Card, ErrorState, fmt, PageHeader, SkeletonRows, type Tone } from '../../components/ui';

export type CheckState = 'ok' | 'warn' | 'error' | 'off';
export interface StatusCheck { key: string; group: string; label: string; state: CheckState; detail: string; hint?: string; at?: string | null }
export interface SystemStatusData { overall: CheckState; checkedAt: string; deep: boolean; canDiagnose: boolean; checks: StatusCheck[] }

/** Einheitliche Statusanzeige (Farbe + Text, nie nur Farbe). */
export const STATE: Record<CheckState, { tone: Tone; label: string; dot: string }> = {
  ok: { tone: 'success', label: 'OK', dot: 'bg-success' },
  warn: { tone: 'warning', label: 'Eingeschränkt', dot: 'bg-warning' },
  error: { tone: 'danger', label: 'Gestört', dot: 'bg-danger' },
  off: { tone: 'neutral', label: 'Nicht eingerichtet', dot: 'bg-muted' },
};
const GROUP_ORDER = ['Anwendungen', 'Infrastruktur', 'Integrationen', 'Betrieb', 'Konfiguration'];
const OVERALL: Record<CheckState, string> = { ok: 'Alle Dienste arbeiten normal.', warn: 'Einzelne Dienste sind eingeschränkt.', error: 'Mindestens ein Dienst ist gestört.', off: '—' };

/**
 * Zentrale Systemstatus-Übersicht (MDT, Leitstelle, Dashboard, Datenbank, Discord, KI, Tickets, Backups). Jede Zeile beruht
 * auf einer echten Prüfung der API – nicht eingerichtete Dienste erscheinen als „Nicht eingerichtet“, nie als „OK“.
 */
export function SystemStatus() {
  const [deep, setDeep] = useState(false);
  const q = useQuery({ queryKey: ['system-status', deep], queryFn: () => api<SystemStatusData>('/system/status', { query: { deep: deep ? '1' : undefined } }), refetchInterval: 30_000 });
  const d = q.data;
  const groups = GROUP_ORDER.map((g) => ({ g, items: (d?.checks ?? []).filter((c) => c.group === g) })).filter((x) => x.items.length);
  return (
    <div className="space-y-4">
      <PageHeader title="Systemstatus" icon={Activity} subtitle="Verbindungen und Dienste von MDT, Leitstelle und Dashboard – wird alle 30 Sekunden geprüft."
        actions={<div className="flex flex-wrap gap-2">
          {d?.canDiagnose && <Button variant={deep ? 'primary' : 'secondary'} size="sm" onClick={() => setDeep(!deep)}><Stethoscope size={14} aria-hidden className="mr-1 inline" />{deep ? 'Diagnose aktiv' : 'Diagnose ausführen'}</Button>}
          <Button variant="secondary" size="sm" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw size={14} aria-hidden className={`mr-1 inline ${q.isFetching ? 'animate-spin' : ''}`} />Jetzt prüfen</Button>
        </div>} />
      {q.isLoading && <SkeletonRows rows={8} />}
      {q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {d && (
        <>
          <div role="status" className={`card flex flex-wrap items-center gap-3 border p-4 ${d.overall === 'ok' ? 'border-success/40' : d.overall === 'warn' ? 'border-warning/40' : 'border-danger/40'}`}>
            <span className={`size-3 rounded-full ${STATE[d.overall].dot}`} aria-hidden />
            <p className="font-medium">{OVERALL[d.overall]}</p>
            <p className="ml-auto text-xs text-muted">Geprüft {fmt(d.checkedAt)}</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map(({ g, items }) => (
              <Card key={g} title={g}>
                <ul className="divide-y divide-line">
                  {items.map((c) => (
                    <li key={c.key} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium"><span className={`size-2 shrink-0 rounded-full ${STATE[c.state].dot}`} aria-hidden />{c.label}</p>
                        <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
                        {c.hint && <p className="mt-1 text-xs text-warning">→ {c.hint}</p>}
                      </div>
                      <div className="shrink-0"><Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge></div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          {!d.canDiagnose && <p className="text-xs text-muted">Die erweiterte Diagnose (Konfiguration, Speicher, Administratorzugang) steht nur globalen Systemadministratoren zur Verfügung.</p>}
        </>
      )}
    </div>
  );
}
