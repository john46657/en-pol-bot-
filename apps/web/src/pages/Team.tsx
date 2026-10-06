import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { DUTY_STATUSES } from '@enrp/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import type { ShiftsConfig } from './admin/Shifts';
import { Button, Card, EmptyState, ErrorState, fmt, PageHeader, PriorityBadge, Select, SkeletonRows, StatusBadge } from '../components/ui';

interface Member {
  userId: string; personnelId: string; name: string; rank: string | null; callsign: string | null; team: string | null;
  dutyStatus: string; onDutySince: string | null; lastStatusChange: string | null; shiftType?: string | null;
  unit: { id: string; callsign: string; status: string } | null;
  currentIncident: { id: string; number: string; title: string; status: string; priority: string } | null;
}
interface Unit { id: string; callsign: string; status: string; members: { userId: string }[] }
interface Session { status: string; shiftType?: string | null }

/** Team Dashboard: Officer, Rank, Callsign, Unit, Duty Status, aktueller Einsatz, letzte Statusänderung. Supervisor-Aktionen sind permission-abhängig. */
export function Team() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('ALL');
  const [err, setErr] = useState<string>();
  useRealtime('team', ['duty.changed', 'unit.status'], [['team-overview'], ['my-duty']]);
  useRealtime('dispatch', ['unit.assigned', 'queue.changed'], [['team-overview']]);
  const overview = useQuery({ queryKey: ['team-overview'], queryFn: () => api<Member[]>('/team/overview') });
  const mine = useQuery({ queryKey: ['my-duty'], queryFn: () => api<Session | null>('/team/me') });
  const manage = can('team.manage');
  const assign = can('dispatch.assign');
  const units = useQuery({ queryKey: ['team-units'], queryFn: () => api<Unit[]>('/dispatch/units'), enabled: assign || manage });
  const refresh = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['team-overview'] }); void qc.invalidateQueries({ queryKey: ['my-duty'] }); void qc.invalidateQueries({ queryKey: ['team-units'] }); };
  const onError = (e: unknown) => setErr(e instanceof ApiError ? `${e.message}${e.requestId ? ` (Request ID ${e.requestId})` : ''}` : 'Failed');
  // Schicht-Arten (Admin → Shifts): bei mehreren wird beim Dienstbeginn gewählt
  const shifts = useQuery({ queryKey: ['shifts-config'], queryFn: () => api<ShiftsConfig>('/shifts/config') });
  const types = shifts.data?.enabled ? shifts.data.types : [];
  const [shiftType, setShiftType] = useState('');
  const setMine = useMutation({ mutationFn: (status: string) => api('/team/me/status', { method: 'PUT', body: { status, ...(status === 'ON_DUTY' && shiftType ? { shiftType } : {}) } }), onSuccess: refresh, onError });
  const setOther = useMutation({ mutationFn: (v: { userId: string; status: string }) => api(`/team/${v.userId}/status`, { method: 'PUT', body: { status: v.status } }), onSuccess: refresh, onError });
  const moveToUnit = useMutation({
    mutationFn: async (v: { userId: string; unitId: string }) => {
      // aus bisheriger Einheit entfernen, in neue aufnehmen (volle Besetzung wird ersetzt)
      const all = units.data ?? [];
      for (const u of all.filter((x) => x.members.some((m) => m.userId === v.userId) && x.id !== v.unitId)) await api(`/dispatch/units/${u.id}/members`, { method: 'PUT', body: { userIds: u.members.map((m) => m.userId).filter((id) => id !== v.userId) } });
      if (v.unitId) { const t = all.find((x) => x.id === v.unitId)!; await api(`/dispatch/units/${t.id}/members`, { method: 'PUT', body: { userIds: [...new Set([...t.members.map((m) => m.userId), v.userId])] } }); }
    },
    onSuccess: refresh, onError,
  });

  const rows = overview.data ?? [];
  const stats = useMemo(() => ({
    onDuty: rows.filter((r) => r.dutyStatus === 'ON_DUTY').length,
    break: rows.filter((r) => r.dutyStatus === 'BREAK').length,
    training: rows.filter((r) => r.dutyStatus === 'TRAINING' || r.dutyStatus === 'ADMINISTRATIVE').length,
    onCall: rows.filter((r) => r.currentIncident).length,
    noUnit: rows.filter((r) => r.dutyStatus === 'ON_DUTY' && !r.unit).length,
  }), [rows]);
  const shown = rows.filter((r) => filter === 'ALL' || r.dutyStatus === filter);
  const current = mine.data?.status ?? 'OFF_DUTY';

  return (
    <>
      <PageHeader title="Team Dashboard" subtitle="Duty status is always set explicitly — being online never counts as being on duty." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['On duty', stats.onDuty], ['On break', stats.break], ['Training / admin', stats.training], ['On an incident', stats.onCall], ['On duty, no unit', stats.noUnit]].map(([l, v]) => (
          <Card key={String(l)}><p className="text-2xl font-semibold">{v}</p><p className="text-xs text-muted">{l}</p></Card>
        ))}
      </div>
      <Card title="My duty status" className="mb-4">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={current} />
          {current !== 'OFF_DUTY' && types.find((t) => t.id === mine.data?.shiftType) && <span className="text-sm text-muted">Shift: {types.find((t) => t.id === mine.data?.shiftType)!.name}</span>}
          {types.length > 1 && <div className="w-56"><Select aria-label="Shift type" className="py-1 text-sm" value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
            <option value="">Default shift ({types.find((t) => t.isDefault)?.name ?? types[0]!.name})</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select></div>}
          {types.length > 1 && current === 'ON_DUTY' && shiftType && shiftType !== mine.data?.shiftType && <Button size="sm" disabled={setMine.isPending} onClick={() => setMine.mutate('ON_DUTY')}>Switch shift</Button>}
          {DUTY_STATUSES.filter((s) => s !== current).map((s) => <Button key={s} size="sm" variant="secondary" disabled={setMine.isPending} onClick={() => setMine.mutate(s)}>Go {s.replace('_', ' ')}</Button>)}
        </div>
      </Card>
      {err && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
      <Card title={`Officers (${shown.length})`} actions={<Select aria-label="Duty filter" className="w-auto py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">All</option>{DUTY_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>}>
        {overview.isLoading ? <SkeletonRows /> : overview.error ? <ErrorState error={overview.error} onRetry={() => void overview.refetch()} /> : !shown.length ? <EmptyState text="No officers match." hint="Create personnel files under Personnel to see officers here." /> : (
          <div className="table-scroll">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-2">Officer</th><th>Rank</th><th>Callsign</th><th>Unit</th><th>Duty status</th><th>Current incident</th><th>Last change</th>{(manage || assign) && <th>Actions</th>}</tr></thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.userId} className="border-b border-line/60 last:border-0">
                    <td className="p-2 font-medium">{can('personnel.view') ? <Link className="hover:underline" to={`/personnel/${m.personnelId}`}>{m.name}</Link> : m.name}{m.userId === user?.id && <span className="ml-1 text-xs text-muted">(you)</span>}</td>
                    <td>{m.rank ?? '—'}</td><td>{m.callsign ?? '—'}</td>
                    <td>{m.unit ? <span className="flex items-center gap-1">{m.unit.callsign}<StatusBadge status={m.unit.status} /></span> : '—'}</td>
                    <td><StatusBadge status={m.dutyStatus} />{m.shiftType && m.dutyStatus !== 'OFF_DUTY' && <span className="ml-1 text-xs text-muted">{m.shiftType}</span>}</td>
                    <td>{m.currentIncident ? <Link className="flex items-center gap-1 hover:underline" to={`/incidents/${m.currentIncident.id}`}>{m.currentIncident.number}<PriorityBadge priority={m.currentIncident.priority} /></Link> : '—'}</td>
                    <td className="text-xs text-muted">{fmt(m.lastStatusChange)}</td>
                    {(manage || assign) && (
                      <td className="space-x-1 whitespace-nowrap py-1">
                        {manage && <Select aria-label={`Duty status of ${m.name}`} className="inline-block w-auto min-w-36 py-1 text-xs" value={m.dutyStatus} onChange={(e) => setOther.mutate({ userId: m.userId, status: e.target.value })}>{DUTY_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>}
                        {assign && <Select aria-label={`Unit of ${m.name}`} className="inline-block w-auto min-w-36 py-1 text-xs" value={m.unit?.id ?? ''} onChange={(e) => moveToUnit.mutate({ userId: m.userId, unitId: e.target.value })}><option value="">No unit</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.callsign}</option>)}</Select>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
