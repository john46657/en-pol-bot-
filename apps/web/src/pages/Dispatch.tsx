import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, ApiError, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Button, Card, EmptyState, ErrorState, PageHeader, PriorityBadge, Select, SkeletonRows, StatusBadge } from '../components/ui';
import { DISPATCH_TRANSITIONS, UNIT_STATUSES } from '@enrp/shared';
import { FormModal } from '../components/FormModal';
import { DangerLevel } from '../components/DangerLevel';
import { PRIORITIES } from '@enrp/shared';

interface Inc { id: string; number: string; title: string; priority: string; status: string; location: string | null; version: number; units: { unitId: string; clearedAt: string | null; unit: { callsign: string } }[] }
interface Unit { id: string; callsign: string; status: string }

export function Dispatch() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [unitForm, setUnitForm] = useState(false);
  const [err, setErr] = useState<string>();
  useRealtime('dispatch', ['queue.changed', 'unit.status', 'unit.assigned'], [['dispatch-incidents'], ['dispatch-units']]);
  useRealtime('incidents', ['incident.created', 'incident.status'], [['dispatch-incidents']]);
  const inc = useQuery({ queryKey: ['dispatch-incidents'], queryFn: () => api<Page<Inc>>('/incidents', { query: { active: true, pageSize: 50 } }) });
  const units = useQuery({ queryKey: ['dispatch-units'], queryFn: () => api<Unit[]>('/dispatch/units') });
  const done = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['dispatch-incidents'] }); void qc.invalidateQueries({ queryKey: ['dispatch-units'] }); };
  const onError = (e: unknown) => setErr(e instanceof ApiError ? `${e.message}${e.requestId ? ` (Request ID ${e.requestId})` : ''}` : 'Request failed');
  const assign = useMutation({ mutationFn: (v: { id: string; unitId: string }) => api(`/dispatch/incidents/${v.id}/assign`, { body: { unitId: v.unitId } }), onSuccess: done, onError });
  const setStatus = useMutation({ mutationFn: (v: { id: string; status: string }) => (v.status === 'CLOSED' ? api(`/dispatch/incidents/${v.id}/close`, { method: 'POST' }) : api(`/dispatch/incidents/${v.id}/status`, { method: 'PUT', body: { status: v.status } })), onSuccess: done, onError });
  const unitStatus = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/dispatch/units/${v.id}/status`, { method: 'PUT', body: { status: v.status } }), onSuccess: done, onError });
  const canAssign = can('dispatch.assign'), canEdit = can('dispatch.edit');
  const available = units.data?.filter((u) => u.status === 'AVAILABLE') ?? [];

  return (
    <>
      <PageHeader title="Dispatch" subtitle="Live board — updates in real time" actions={<>{can('incidents.create') && <Button onClick={() => setCreating(true)}>New incident</Button>}{can('dispatch.manage') && <Button variant="secondary" onClick={() => setUnitForm(true)}>New unit</Button>}</>} />
      <DangerLevel />
      {err && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title={`Active incidents (${inc.data?.total ?? 0})`}>
            {inc.isLoading ? <SkeletonRows /> : inc.error ? <ErrorState error={inc.error} onRetry={() => void inc.refetch()} /> : !inc.data?.items.length ? <EmptyState text="No open incidents." hint="New calls appear here instantly." /> : (
              <ul className="divide-y divide-line">
                {[...inc.data.items].sort((a, b) => PRIORITIES.indexOf(b.priority as never) - PRIORITIES.indexOf(a.priority as never)).map((i) => {
                  const assigned = i.units.filter((u) => !u.clearedAt);
                  const next = DISPATCH_TRANSITIONS[i.status as keyof typeof DISPATCH_TRANSITIONS] ?? [];
                  return (
                    <li key={i.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link to={`/incidents/${i.id}`} className="font-medium hover:underline">{i.number} · {i.title}</Link>
                        <span className="flex gap-1"><PriorityBadge priority={i.priority} /><StatusBadge status={i.status} /></span>
                      </div>
                      <p className="text-xs text-muted">{i.location ?? 'No location'} · Units: {assigned.length ? assigned.map((u) => u.unit.callsign).join(', ') : 'none'}</p>
                      <div className="flex flex-wrap gap-2">
                        {canAssign && available.length > 0 && <Select aria-label={`Assign unit to ${i.number}`} className="w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && assign.mutate({ id: i.id, unitId: e.target.value })}><option value="">Assign unit…</option>{available.map((u) => <option key={u.id} value={u.id}>{u.callsign}</option>)}</Select>}
                        {canEdit && next.filter((n) => n !== 'CANCELLED' && n !== 'ASSIGNED' && (n !== 'CLOSED' || can('dispatch.close'))).map((n) => <Button key={n} size="sm" variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: i.id, status: n })}>→ {n.replace('_', ' ')}</Button>)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Units">
          {units.isLoading ? <SkeletonRows rows={4} /> : !units.data?.length ? <EmptyState text="No units configured." /> : (
            <ul className="space-y-2">{units.data.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2"><span className="shrink-0 whitespace-nowrap font-medium">{u.callsign}</span>
                {canEdit ? <Select aria-label={`Status of ${u.callsign}`} className="w-auto py-1 text-xs" value={u.status} onChange={(e) => unitStatus.mutate({ id: u.id, status: e.target.value })}>{UNIT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select> : <StatusBadge status={u.status} />}
              </li>))}</ul>
          )}
        </Card>
      </div>
      <FormModal open={creating} onClose={() => setCreating(false)} title="New incident" endpoint="/incidents" invalidate={[['dispatch-incidents']]}
        fields={[{ name: 'title', label: 'Title', required: true, min: 3, max: 200 }, { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES }, { name: 'location', label: 'Location' }, { name: 'description', label: 'Description', type: 'textarea' }]} />
      <FormModal open={unitForm} onClose={() => setUnitForm(false)} title="New unit" endpoint="/dispatch/units" invalidate={[['dispatch-units']]} fields={[{ name: 'callsign', label: 'Callsign', required: true, min: 2, max: 16 }, { name: 'vehicle', label: 'Vehicle' }]} />
    </>
  );
}
