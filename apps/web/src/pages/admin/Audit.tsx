import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Download } from 'lucide-react';
import { fmt, Input, PageHeader, Select, Button, Badge, Tabs } from '../../components/ui';
import { DataTable, useDebounced, useTablePageSize } from '../../components/DataTable';
import { downloadApi } from '../../lib/csv';

interface A { id: string; createdAt: string; actorUserId: string | null; actor: { id: string; name: string | null; discordId: string | null } | null; summary: string | null; action: string; module: string; entityType: string | null; entityId: string | null; reason: string | null; requestId: string | null }
interface S { id: string; type: string; ip: string | null; detail: string | null; createdAt: string }
const MODULES = ['permissions', 'auth', 'users', 'roles', 'persons', 'vehicles', 'tickets', 'dispatch', 'incidents', 'reports', 'complaints', 'investigations', 'wanted', 'evidence', 'personnel', 'applications', 'academy', 'settings', 'export', 'media', 'discord'];
const MODULE_LABELS: Record<string, string> = { permissions: 'Rechte', auth: 'Anmeldung', users: 'Benutzer', roles: 'Rollen', persons: 'Personen', vehicles: 'Fahrzeuge', tickets: 'Strafzettel', dispatch: 'Leitstelle', incidents: 'Einsätze', reports: 'Berichte', complaints: 'Beschwerden', investigations: 'Ermittlungen', wanted: 'Fahndungen', evidence: 'Beweismittel', personnel: 'Personal', applications: 'Bewerbungen', academy: 'Akademie', settings: 'Einstellungen', export: 'Export', media: 'Medien', discord: 'Discord' };

export function Audit() {
  const { can } = useAuth();
  const [tab, setTab] = useState('Audit-Log');
  const [page, setPage] = useState(1);
  const [module, setModule] = useState('');
  const [search, setSearch] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exportErr, setExportErr] = useState<string>();
  const q = useDebounced(search.trim(), 300);
  const users = useQuery({ queryKey: ['users', 'pick'], queryFn: () => api<Page<{ id: string; displayName: string; active: boolean }>>('/users', { query: { pageSize: 500 } }), enabled: can('users.view'), staleTime: 60_000 });
  const filters = { module: module || undefined, q: q || undefined, actorUserId: actor || undefined, from: from ? new Date(`${from}T00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined };
  const reset = (fn: () => void) => { fn(); setPage(1); };
  const [pageSize, setPageSize] = useTablePageSize();
  const audit = useQuery({ queryKey: ['audit', page, pageSize, filters], queryFn: () => api<Page<A>>('/audit', { query: { page, pageSize, ...filters } }), enabled: tab === 'Audit-Log', placeholderData: (p) => p });
  const sec = useQuery({ queryKey: ['security-events'], queryFn: () => api<S[]>('/admin/security-events', { query: { take: 100 } }), enabled: tab === 'Sicherheitsereignisse' });
  return (
    <>
      <PageHeader title="Audit" subtitle="Nur anhängend. Einträge können nicht bearbeitet oder gelöscht werden." actions={can('audit.export') && <Button variant="secondary" onClick={() => { setExportErr(undefined); downloadApi('/export/audit?format=csv', 'audit.csv').catch((e: Error) => setExportErr(e.message)); }}><Download size={14} />CSV (neueste 1000)</Button>} />
      {exportErr && <p role="alert" className="mb-3 text-sm text-danger">{exportErr}</p>}
      <Tabs tabs={['Audit-Log', 'Sicherheitsereignisse']} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Audit-Log' ? (
          <DataTable<A> rows={audit.data?.items} total={audit.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} loading={audit.isLoading} error={audit.error} onRetry={() => void audit.refetch()} empty={{ text: 'Keine Audit-Einträge.' }}
            search={search} onSearch={(v) => reset(() => setSearch(v))}
            toolbar={<div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Modul" className="w-auto" value={module} onChange={(e) => reset(() => setModule(e.target.value))}><option value="">Alle Module</option>{MODULES.map((m) => <option key={m} value={m}>{MODULE_LABELS[m] ?? m}</option>)}</Select>
              {can('users.view') && <Select aria-label="Benutzer" className="w-auto max-w-48" value={actor} onChange={(e) => reset(() => setActor(e.target.value))}><option value="">Alle Benutzer</option>{users.data?.items.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}</Select>}
              <span className="flex items-center gap-1 text-xs text-muted"><Input aria-label="Von" type="date" className="w-auto py-1.5" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} />–<Input aria-label="Bis" type="date" className="w-auto py-1.5" value={to} min={from || undefined} onChange={(e) => reset(() => setTo(e.target.value))} /></span>
              {(module || actor || from || to || search) && <Button variant="ghost" size="sm" onClick={() => reset(() => { setModule(''); setActor(''); setFrom(''); setTo(''); setSearch(''); })}>Filter zurücksetzen</Button>}
            </div>}
            columns={[{ key: 'createdAt', label: 'Zeit', render: (a) => fmt(a.createdAt) }, { key: 'module', label: 'Modul', render: (a) => <Badge>{MODULE_LABELS[a.module] ?? a.module}</Badge> }, { key: 'action', label: 'Aktion', render: (a) => (a.summary ? <span title={a.action}>{a.module === 'permissions' ? '🛡️ ' : ''}{a.summary}</span> : a.action) }, { key: 'entity', label: 'Objekt', render: (a) => (a.entityType ? `${a.entityType} ${a.entityId?.slice(0, 8) ?? ''}` : '—') }, { key: 'actor', label: 'Benutzer', render: (a) => (a.actor ? <span>{a.actor.name ?? a.actor.id.slice(0, 8)}{a.actor.discordId && <span className="block text-[11px] text-muted">Discord {a.actor.discordId}</span>}</span> : 'System') }, { key: 'reason', label: 'Grund', render: (a) => a.reason ?? '—' }, { key: 'requestId', label: 'Anfrage', render: (a) => <code className="text-xs">{a.requestId?.slice(0, 8) ?? '—'}</code> }]} />
        ) : (
          <DataTable<S> rows={sec.data} total={sec.data?.length ?? 0} page={1} pageSize={100} onPage={() => undefined} loading={sec.isLoading} error={sec.error} empty={{ text: 'Keine Sicherheitsereignisse.' }}
            columns={[{ key: 'createdAt', label: 'Zeit', render: (e) => fmt(e.createdAt) }, { key: 'type', label: 'Typ', render: (e) => <Badge tone={e.type === 'LOGIN_FAILURE' || e.type === 'INVALID_TOKEN' ? 'danger' : 'warning'}>{e.type}</Badge> }, { key: 'ip', label: 'IP', render: (e) => e.ip ?? '—' }, { key: 'detail', label: 'Details', render: (e) => e.detail ?? '—' }]} />
        )}
      </div>
    </>
  );
}
