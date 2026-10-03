import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Button, Card, EmptyState, ErrorState, PageHeader, PriorityBadge, Skeleton, StatusBadge } from '../components/ui';

type Row = Record<string, unknown> & { id: string };
interface LayoutItem { widget: string; visible: boolean; order: number }

function useList<T = Row>(key: string, path: string, query: Record<string, string | number | boolean>, enabled: boolean) {
  return useQuery({ queryKey: [key, 'dash'], queryFn: () => api<Page<T>>(path, { query }), enabled });
}

function Widget({ title, to, q, children, empty }: { title: string; to?: string; q: { isLoading: boolean; error: unknown; refetch: () => unknown }; children: ReactNode; empty?: boolean }) {
  return (
    <Card title={title} actions={to && <Link to={to} className="text-xs text-primary hover:underline">View all</Link>}>
      {q.isLoading ? <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5" /><Skeleton className="h-5" /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : empty ? <p className="py-2 text-sm text-muted">Nothing to show.</p> : children}
    </Card>
  );
}

const WIDGETS: { id: string; title: string; perm: string }[] = [
  { id: 'incidents', title: 'Active Incidents', perm: 'incidents.view' },
  { id: 'queue', title: 'Dispatch Queue', perm: 'dispatch.view' },
  { id: 'duty', title: 'Officers On Duty', perm: 'team.view' },
  { id: 'units', title: 'Unit Status', perm: 'dispatch.view' },
  { id: 'wanted', title: 'Wanted Alerts', perm: 'wanted.view' },
  { id: 'reports', title: 'Open Reports', perm: 'reports.review' },
  { id: 'complaints', title: 'Open Complaints', perm: 'complaints.view' },
  { id: 'applications', title: 'Pending Applications', perm: 'applications.view' },
];

export function Dashboard() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const [customizing, setCustomizing] = useState(false);
  const layoutQ = useQuery({ queryKey: ['layout'], queryFn: () => api<{ layout: LayoutItem[] | null; isDefault: boolean }>('/admin/dashboard/layout') });
  const save = useMutation({ mutationFn: (layout: LayoutItem[] | null) => api('/admin/dashboard/layout', { method: 'PUT', body: { layout } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['layout'] }) });
  useRealtime('incidents', ['incident.created', 'incident.status'], [['incidents', 'dash'], ['queue', 'dash']]);
  useRealtime('dispatch', ['queue.changed', 'unit.status', 'unit.assigned'], [['queue', 'dash'], ['units', 'dash'], ['incidents', 'dash']]);
  useRealtime('team', ['duty.changed'], [['duty', 'dash']]);

  const allowed = WIDGETS.filter((w) => can(w.perm));
  const saved = layoutQ.data?.layout ?? [];
  const order = [...allowed].sort((a, b) => (saved.find((l) => l.widget === a.id)?.order ?? 999) - (saved.find((l) => l.widget === b.id)?.order ?? 999));
  const hidden = (id: string) => saved.find((l) => l.widget === id)?.visible === false;
  const persist = (ids: string[], hide: Set<string>) => save.mutate(ids.map((id, order) => ({ widget: id, visible: !hide.has(id), order })));
  const move = (id: string, d: -1 | 1) => { const ids = order.map((w) => w.id); const i = ids.indexOf(id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j]!, ids[i]!]; persist(ids, new Set(order.filter((w) => hidden(w.id)).map((w) => w.id))); };
  const toggle = (id: string) => { const h = new Set(order.filter((w) => hidden(w.id)).map((w) => w.id)); if (h.has(id)) h.delete(id); else h.add(id); persist(order.map((w) => w.id), h); };

  const inc = useList('incidents', '/incidents', { active: true, pageSize: 8 }, can('incidents.view'));
  const queue = useList('queue', '/incidents', { status: 'NEW', pageSize: 8 }, can('dispatch.view'));
  const units = useQuery({ queryKey: ['units', 'dash'], queryFn: () => api<Row[]>('/dispatch/units'), enabled: can('dispatch.view') });
  const duty = useQuery({ queryKey: ['duty', 'dash'], queryFn: () => api<Row[]>('/team'), enabled: can('team.view') });
  const wanted = useList('wanted', '/wanted', { pageSize: 6 }, can('wanted.view'));
  const reports = useQuery({ queryKey: ['reports', 'dash'], queryFn: async () => ({ items: [...(await api<Page<Row>>('/reports', { query: { status: 'SUBMITTED', pageSize: 5 } })).items, ...(await api<Page<Row>>('/reports', { query: { status: 'UNDER_REVIEW', pageSize: 5 } })).items] }), enabled: can('reports.review') });
  const complaints = useList('complaints', '/complaints', { status: 'RECEIVED', pageSize: 6 }, can('complaints.view'));
  const apps = useList('applications', '/applications', { status: 'SUBMITTED', pageSize: 6 }, can('applications.view'));

  const render = (id: string): ReactNode => {
    switch (id) {
      case 'incidents': return <Widget title="Active Incidents" to="/incidents" q={inc} empty={!inc.data?.items.length}><ul className="space-y-1.5">{inc.data?.items.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><Link to={`/incidents/${i.id}`} className="truncate hover:underline">{String(i.number)} · {String(i.title)}</Link><span className="flex shrink-0 gap-1"><PriorityBadge priority={String(i.priority)} /><StatusBadge status={String(i.status)} /></span></li>)}</ul></Widget>;
      case 'queue': return <Widget title="Dispatch Queue" to="/dispatch" q={queue} empty={!queue.data?.items.length}><ul className="space-y-1.5">{queue.data?.items.map((i) => <li key={i.id} className="flex items-center justify-between"><span className="truncate">{String(i.title)}</span><PriorityBadge priority={String(i.priority)} /></li>)}</ul></Widget>;
      case 'duty': return <Widget title="Officers On Duty" to="/team" q={duty} empty={!duty.data?.length}><p className="text-3xl font-semibold">{duty.data?.filter((d) => d.status === 'ON_DUTY').length}</p><p className="text-xs text-muted">on duty · {duty.data?.length} active sessions</p></Widget>;
      case 'units': return <Widget title="Unit Status" to="/dispatch" q={units} empty={!units.data?.length}><ul className="space-y-1.5">{units.data?.map((u) => <li key={u.id} className="flex justify-between"><span>{String(u.callsign)}</span><StatusBadge status={String(u.status)} /></li>)}</ul></Widget>;
      case 'wanted': return <Widget title="Wanted Alerts" to="/wanted" q={wanted} empty={!wanted.data?.items.length}><ul className="space-y-1.5">{wanted.data?.items.map((w) => <li key={w.id} className="flex justify-between gap-2"><Link to={`/wanted/${w.id}`} className="truncate hover:underline">{String(w.reason)}</Link><PriorityBadge priority={String(w.priority)} /></li>)}</ul></Widget>;
      case 'reports': return <Widget title="Open Reports" to="/reports" q={reports} empty={!reports.data?.items.length}><ul className="space-y-1.5">{reports.data?.items.map((r) => <li key={r.id} className="flex justify-between gap-2"><Link to={`/reports/${r.id}`} className="truncate hover:underline">{String(r.number)} · {String(r.title)}</Link><StatusBadge status={String(r.status)} /></li>)}</ul></Widget>;
      case 'complaints': return <Widget title="Open Complaints" to="/complaints" q={complaints} empty={!complaints.data?.items.length}><p className="text-3xl font-semibold">{complaints.data?.total}</p><p className="text-xs text-muted">awaiting screening</p></Widget>;
      case 'applications': return <Widget title="Pending Applications" to="/applications" q={apps} empty={!apps.data?.items.length}><p className="text-3xl font-semibold">{apps.data?.total}</p><p className="text-xs text-muted">new submissions</p></Widget>;
      default: return null;
    }
  };

  return (
    <>
      <PageHeader title={`Welcome, ${user?.displayName}`} subtitle="Police Operations Center"
        actions={can('dashboard.customize') && <><Button variant="secondary" onClick={() => setCustomizing((c) => !c)}>{customizing ? 'Done' : 'Customize'}</Button>{customizing && <Button variant="ghost" onClick={() => save.mutate(null)}><RotateCcw size={14} />Reset layout</Button>}</>} />
      {layoutQ.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div> : !order.length ? <EmptyState text="No widgets available for your role." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {order.map((w) => (hidden(w.id) && !customizing ? null : (
            <div key={w.id} className={hidden(w.id) ? 'opacity-50' : undefined}>
              {customizing && <div className="mb-1 flex items-center justify-between text-xs text-muted"><span>{w.title}</span><span className="flex gap-1"><Button size="sm" variant="ghost" aria-label={`Move ${w.title} up`} onClick={() => move(w.id, -1)}><ArrowUp size={12} /></Button><Button size="sm" variant="ghost" aria-label={`Move ${w.title} down`} onClick={() => move(w.id, 1)}><ArrowDown size={12} /></Button><Button size="sm" variant="ghost" aria-label={hidden(w.id) ? `Show ${w.title}` : `Hide ${w.title}`} onClick={() => toggle(w.id)}>{hidden(w.id) ? <EyeOff size={12} /> : <Eye size={12} />}</Button></span></div>}
              {render(w.id)}
            </div>
          )))}
        </div>
      )}
    </>
  );
}
