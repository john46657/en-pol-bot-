import { useMemo, useState } from 'react';
import { AreaBanner } from '../components/AreaBanner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { DUTY_STATUSES } from '@enrp/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import type { ShiftsConfig } from './admin/Shifts';
import { idleText, idleTone, useMinutesSince } from '../components/DutyActivity';
import { WeeklyRanking } from '../components/WeeklyRanking';
import { Download, Search } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, fmt, Input, PageHeader, PriorityBadge, Select, SkeletonRows, StatusBadge, statusLabel } from '../components/ui';
import { downloadCsv } from '../lib/csv';
import { usePhone } from '../lib/media';

interface Member {
  userId: string; personnelId: string; name: string; rank: string | null; callsign: string | null; team: string | null;
  dutyStatus: string; onDutySince: string | null; lastStatusChange: string | null; shiftType?: string | null; lastActivityAt?: string | null; reminded?: boolean;
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
  const [search, setSearch] = useState('');
  const phone = usePhone();
  const [err, setErr] = useState<string>();
  useRealtime('team', ['duty.changed', 'unit.status'], [['team-overview'], ['my-duty']]);
  useRealtime('dispatch', ['unit.assigned', 'queue.changed'], [['team-overview']]);
  const overview = useQuery({ queryKey: ['team-overview'], queryFn: () => api<Member[]>('/team/overview') });
  const mine = useQuery({ queryKey: ['my-duty'], queryFn: async () => (await api<Session | null>('/team/me')) ?? null });
  const manage = can('team.manage');
  const assign = can('dispatch.assign');
  const units = useQuery({ queryKey: ['team-units'], queryFn: () => api<Unit[]>('/dispatch/units'), enabled: assign || manage });
  const refresh = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['team-overview'] }); void qc.invalidateQueries({ queryKey: ['my-duty'] }); void qc.invalidateQueries({ queryKey: ['team-units'] }); };
  const onError = (e: unknown) => setErr(e instanceof ApiError ? `${e.message}${e.requestId ? ` (Anfrage-ID ${e.requestId})` : ''}` : 'Fehlgeschlagen');
  // Schicht-Arten (Admin → Shifts): bei mehreren wird beim Dienstbeginn gewählt
  const shifts = useQuery({ queryKey: ['shifts-config'], queryFn: () => api<ShiftsConfig>('/shifts/config') });
  const types = shifts.data?.enabled ? shifts.data.types : [];
  const since = useMinutesSince();
  const idleLimit = shifts.data?.reminder?.enabled ? shifts.data.reminder.afterMinutes : 30;
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
  const needle = search.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === 'ALL' || (filter === 'ON_CALL' ? !!r.currentIncident : filter === 'NO_UNIT' ? r.dutyStatus === 'ON_DUTY' && !r.unit : filter === 'TRAINING' ? r.dutyStatus === 'TRAINING' || r.dutyStatus === 'ADMINISTRATIVE' : r.dutyStatus === filter))
    && (!needle || [r.name, r.rank, r.callsign, r.unit?.callsign, r.team].some((x) => x?.toLowerCase().includes(needle))));
  const current = mine.data?.status ?? 'OFF_DUTY';

  return (
    <>
      <AreaBanner area="team" />
      <PageHeader title="Team-Übersicht" subtitle="Der Dienststatus wird immer ausdrücklich gesetzt – online sein zählt nie als im Dienst." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {/* Kacheln filtern die Liste (nochmals klicken = alle) */}
        {([['ON_DUTY', 'Im Dienst', stats.onDuty], ['BREAK', 'In Pause', stats.break], ['TRAINING', 'Ausbildung / Verwaltung', stats.training], ['ON_CALL', 'Im Einsatz', stats.onCall], ['NO_UNIT', 'Im Dienst, ohne Einheit', stats.noUnit]] as const).map(([k, l, v]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? 'ALL' : k)}
            className={`card rounded-lg border p-3 text-left transition last:col-span-2 hover:border-primary/60 sm:p-4 md:last:col-span-1 ${filter === k ? 'border-primary bg-primary/10' : 'border-line'}`}>
            <p className="text-2xl font-semibold">{v}</p><p className="text-xs text-muted">{l}</p>
          </button>
        ))}
      </div>
      <Card title="Mein Dienststatus" className="mb-4">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={current} />
          {current !== 'OFF_DUTY' && types.find((t) => t.id === mine.data?.shiftType) && <span className="text-sm text-muted">Schicht: {types.find((t) => t.id === mine.data?.shiftType)!.name}</span>}
          {types.length > 1 && <div className="w-56"><Select aria-label="Schichtart" className="py-1 text-sm" value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
            <option value="">Standardschicht ({types.find((t) => t.isDefault)?.name ?? types[0]!.name})</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select></div>}
          {types.length > 1 && current === 'ON_DUTY' && shiftType && shiftType !== mine.data?.shiftType && <Button size="sm" disabled={setMine.isPending} onClick={() => setMine.mutate('ON_DUTY')}>Schicht wechseln</Button>}
          {DUTY_STATUSES.filter((s) => s !== current).map((s) => <Button key={s} size="sm" variant="secondary" disabled={setMine.isPending} onClick={() => setMine.mutate(s)}>→ {statusLabel(s)}</Button>)}
        </div>
      </Card>
      {err && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
      <Card title={`Beamte (${shown.length})`} actions={<div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <div className="relative min-w-0 basis-full sm:w-56 sm:basis-auto"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Beamte suchen" placeholder="Name, Rang, Rufname, Einheit…" className="py-1 pl-8 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select aria-label="Dienststatus-Filter" className="w-auto py-1 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">Alle</option>{DUTY_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}<option value="ON_CALL">Im Einsatz</option><option value="NO_UNIT">Im Dienst, ohne Einheit</option><option value="TRAINING">Ausbildung / Verwaltung</option></Select>
      </div>}>
        {overview.isLoading ? <SkeletonRows /> : overview.error ? <ErrorState error={overview.error} onRetry={() => void overview.refetch()} /> : !shown.length ? <EmptyState text="Keine passenden Beamten." hint={rows.length ? 'Filter oder Suche anpassen.' : 'Leg unter Personal Personalakten an, damit hier Beamte erscheinen.'} /> : phone ? (
          /* Handy: Karten statt breiter Tabelle */
          <ul className="-mx-1 divide-y divide-line/60">
            {shown.map((m) => (
              <li key={m.userId} className="space-y-2 px-1 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-medium">{can('personnel.view') ? <Link className="hover:underline" to={`/personnel/${m.personnelId}`}>{m.name}</Link> : m.name}{m.userId === user?.id && <span className="ml-1 text-xs text-muted">(du)</span>}</p>
                    <p className="text-xs text-muted">{[m.rank, m.callsign, m.unit?.callsign].filter(Boolean).join(' · ') || '—'}</p></div>
                  <StatusBadge status={m.dutyStatus} />
                </div>
                {(m.currentIncident || m.dutyStatus === 'ON_DUTY') && <p className="flex flex-wrap items-center gap-2 text-xs">
                  {m.currentIncident && <Link className="flex items-center gap-1 hover:underline" to={`/incidents/${m.currentIncident.id}`}>{m.currentIncident.number}<PriorityBadge priority={m.currentIncident.priority} /></Link>}
                  {m.dutyStatus === 'ON_DUTY' && <span className={idleTone(since(m.lastActivityAt ?? m.onDutySince), idleLimit, m.reminded)}>inaktiv {idleText(since(m.lastActivityAt ?? m.onDutySince))}</span>}
                </p>}
                {(manage || assign) && <div className="grid grid-cols-2 gap-2">
                  {manage && <Select aria-label={`Dienststatus von ${m.name}`} className="py-1 text-xs" value={m.dutyStatus} onChange={(e) => setOther.mutate({ userId: m.userId, status: e.target.value })}>{DUTY_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</Select>}
                  {assign && <Select aria-label={`Einheit von ${m.name}`} className="py-1 text-xs" value={m.unit?.id ?? ''} onChange={(e) => moveToUnit.mutate({ userId: m.userId, unitId: e.target.value })}><option value="">Keine Einheit</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.callsign}</option>)}</Select>}
                </div>}
              </li>
            ))}
          </ul>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-2">Beamter</th><th>Rang</th><th>Rufname</th><th>Einheit</th><th>Dienststatus</th><th title="Letzte Aktivität im Dashboard/MDT oder per Discord (nur im Dienst)">Inaktiv</th><th>Aktueller Einsatz</th><th>Letzte Änderung</th>{(manage || assign) && <th>Aktionen</th>}</tr></thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.userId} className="border-b border-line/60 last:border-0">
                    <td className="p-2 font-medium">{can('personnel.view') ? <Link className="hover:underline" to={`/personnel/${m.personnelId}`}>{m.name}</Link> : m.name}{m.userId === user?.id && <span className="ml-1 text-xs text-muted">(du)</span>}</td>
                    <td>{m.rank ?? '—'}</td><td>{m.callsign ?? '—'}</td>
                    <td>{m.unit ? <span className="flex items-center gap-1">{m.unit.callsign}<StatusBadge status={m.unit.status} /></span> : '—'}</td>
                    <td><StatusBadge status={m.dutyStatus} />{m.shiftType && m.dutyStatus !== 'OFF_DUTY' && <span className="ml-1 text-xs text-muted">{m.shiftType}</span>}</td>
                    <td className="whitespace-nowrap text-xs">{m.dutyStatus === 'ON_DUTY' ? <span className={idleTone(since(m.lastActivityAt ?? m.onDutySince), idleLimit, m.reminded)}>{m.reminded ? '⏰ ' : ''}{idleText(since(m.lastActivityAt ?? m.onDutySince))}</span> : <span className="text-muted">—</span>}</td>
                    <td>{m.currentIncident ? <Link className="flex items-center gap-1 hover:underline" to={`/incidents/${m.currentIncident.id}`}>{m.currentIncident.number}<PriorityBadge priority={m.currentIncident.priority} /></Link> : '—'}</td>
                    <td className="text-xs text-muted">{fmt(m.lastStatusChange)}</td>
                    {(manage || assign) && (
                      <td className="py-1"><div className="flex flex-col gap-1 2xl:flex-row">{/* gestapelt, damit die Tabelle auch auf Laptops passt */}
                        {manage && <Select aria-label={`Dienststatus von ${m.name}`} className="w-36 py-1 text-xs" value={m.dutyStatus} onChange={(e) => setOther.mutate({ userId: m.userId, status: e.target.value })}>{DUTY_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</Select>}
                        {assign && <Select aria-label={`Einheit von ${m.name}`} className="w-36 py-1 text-xs" value={m.unit?.id ?? ''} onChange={(e) => moveToUnit.mutate({ userId: m.userId, unitId: e.target.value })}><option value="">Keine Einheit</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.callsign}</option>)}</Select>}
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <WeeklyRanking />
      <DutyHours all={manage} />
    </>
  );
}

interface HoursRow { userId: string; name: string; rank: string | null; callsign: string | null; minutes: number; byStatus: Record<string, number>; sessions: number }
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
/** Dienststunden im gewählten Zeitraum – Schichtleitung (team.manage) sieht alle, sonst nur die eigenen. */
function DutyHours({ all }: { all: boolean }) {
  const [days, setDays] = useState(7);
  const q = useQuery({ queryKey: ['duty-hours', all, days], queryFn: () => api<{ users: HoursRow[] }>(all ? '/team/hours' : '/team/me/hours', { query: { days } }) });
  const statuses = useMemo(() => [...new Set((q.data?.users ?? []).flatMap((u) => Object.keys(u.byStatus)))].sort(), [q.data]);
  const total = (q.data?.users ?? []).reduce((a, u) => a + u.minutes, 0);
  return (
    <Card className="mt-4" title={all ? '⏱️ Dienststunden' : '⏱️ Meine Dienststunden'} actions={<div className="flex gap-2">
      <Select aria-label="Zeitraum" className="w-auto py-1 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d === 1 ? 'Letzte 24 h' : `Letzte ${d} Tage`}</option>)}</Select>
      {!!q.data?.users.length && <Button size="sm" variant="secondary" onClick={() => downloadCsv(`dienststunden-${days}d`, ['Name', 'Rang', 'Rufname', 'Minuten gesamt', 'Stunden gesamt', ...statuses.map((st) => `${statusLabel(st)} (Min.)`), 'Sitzungen'], q.data!.users.map((u) => [u.name, u.rank, u.callsign, u.minutes, (u.minutes / 60).toFixed(2).replace('.', ','), ...statuses.map((st) => u.byStatus[st] ?? 0), u.sessions]))}><Download size={14} />CSV</Button>}
    </div>}>
      {q.isLoading ? <SkeletonRows rows={3} /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.users.length ? <EmptyState text="Keine Dienstzeiten in diesem Zeitraum." /> : (
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr>{all && <th className="p-2">Beamter</th>}<th className="p-2">Gesamt</th>{statuses.map((st) => <th key={st} className="p-2">{statusLabel(st)}</th>)}<th className="p-2">Sitzungen</th></tr></thead>
            <tbody>{q.data.users.map((u) => (
              <tr key={u.userId} className="border-t border-line">
                {all && <td className="p-2 font-medium">{u.name}{u.callsign ? <span className="ml-1 text-xs text-muted">({u.callsign})</span> : null}</td>}
                <td className="p-2 font-semibold">{hm(u.minutes)}</td>
                {statuses.map((st) => <td key={st} className="p-2 text-muted">{u.byStatus[st] ? hm(u.byStatus[st]!) : '—'}</td>)}
                <td className="p-2 text-muted">{u.sessions}</td>
              </tr>
            ))}</tbody>
            {all && q.data.users.length > 1 && <tfoot><tr className="border-t border-line text-xs text-muted"><td className="p-2">Summe ({q.data.users.length})</td><td className="p-2 font-semibold">{hm(total)}</td><td colSpan={statuses.length + 1} /></tr></tfoot>}
          </table>
        </div>
      )}
    </Card>
  );
}
