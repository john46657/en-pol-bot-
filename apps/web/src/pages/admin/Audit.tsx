import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmt, PageHeader, Select, Button, Badge, Tabs } from '../../components/ui';
import { DataTable } from '../../components/DataTable';

interface A { id: string; createdAt: string; actorUserId: string | null; actor: { id: string; name: string | null; discordId: string | null } | null; summary: string | null; action: string; module: string; entityType: string | null; entityId: string | null; reason: string | null; requestId: string | null }
interface S { id: string; type: string; ip: string | null; detail: string | null; createdAt: string }
const MODULES = ['permissions', 'auth', 'users', 'roles', 'persons', 'vehicles', 'tickets', 'dispatch', 'incidents', 'reports', 'complaints', 'investigations', 'wanted', 'evidence', 'personnel', 'applications', 'academy', 'settings', 'export', 'media', 'discord'];

export function Audit() {
  const { can } = useAuth();
  const [tab, setTab] = useState('Audit log');
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const audit = useQuery({ queryKey: ['audit', page, module], queryFn: () => api<Page<A>>('/audit', { query: { page, module: module || undefined } }), enabled: tab === 'Audit log', placeholderData: (p) => p });
  const sec = useQuery({ queryKey: ['security-events'], queryFn: () => api<S[]>('/admin/security-events', { query: { take: 100 } }), enabled: tab === 'Security events' });
  return (
    <>
      <PageHeader title="Audit" subtitle="Append-only. Entries cannot be edited or deleted." actions={can('audit.export') && <a href="/api/v1/export/audit?format=csv"><Button variant="secondary">Export CSV</Button></a>} />
      <Tabs tabs={['Audit log', 'Security events']} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Audit log' ? (
          <DataTable<A> rows={audit.data?.items} total={audit.data?.total ?? 0} page={page} pageSize={25} onPage={setPage} loading={audit.isLoading} error={audit.error} onRetry={() => void audit.refetch()} empty={{ text: 'No audit entries.' }}
            toolbar={<Select aria-label="Module" className="w-auto" value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}><option value="">All modules</option>{MODULES.map((m) => <option key={m}>{m}</option>)}</Select>}
            columns={[{ key: 'createdAt', label: 'Time', render: (a) => fmt(a.createdAt) }, { key: 'module', label: 'Module', render: (a) => <Badge>{a.module}</Badge> }, { key: 'action', label: 'Action', render: (a) => (a.summary ? <span title={a.action}>{a.module === 'permissions' ? '🛡️ ' : ''}{a.summary}</span> : a.action) }, { key: 'entity', label: 'Entity', render: (a) => (a.entityType ? `${a.entityType} ${a.entityId?.slice(0, 8) ?? ''}` : '—') }, { key: 'actor', label: 'Benutzer', render: (a) => (a.actor ? <span>{a.actor.name ?? a.actor.id.slice(0, 8)}{a.actor.discordId && <span className="block text-[11px] text-muted">Discord {a.actor.discordId}</span>}</span> : 'System') }, { key: 'reason', label: 'Reason', render: (a) => a.reason ?? '—' }, { key: 'requestId', label: 'Request', render: (a) => <code className="text-xs">{a.requestId?.slice(0, 8) ?? '—'}</code> }]} />
        ) : (
          <DataTable<S> rows={sec.data} total={sec.data?.length ?? 0} page={1} pageSize={100} onPage={() => undefined} loading={sec.isLoading} error={sec.error} empty={{ text: 'No security events.' }}
            columns={[{ key: 'createdAt', label: 'Time', render: (e) => fmt(e.createdAt) }, { key: 'type', label: 'Type', render: (e) => <Badge tone={e.type === 'LOGIN_FAILURE' || e.type === 'INVALID_TOKEN' ? 'danger' : 'warning'}>{e.type}</Badge> }, { key: 'ip', label: 'IP', render: (e) => e.ip ?? '—' }, { key: 'detail', label: 'Detail', render: (e) => e.detail ?? '—' }]} />
        )}
      </div>
    </>
  );
}
