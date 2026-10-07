import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { customFormFields, useStudio, withCustom } from '../lib/studio';
import { DataTable, useDebounced, useTablePageSize, type Column } from './DataTable';
import { FormModal, type FieldDef } from './FormModal';
import { Button, PageHeader, Select, statusLabel } from './ui';

export interface ResourceConfig<T> {
  title: string; subtitle?: string; endpoint: string; queryKey: string; columns: Column<T>[]; emptyText: string; emptyHint?: string;
  detailPath?: (r: T) => string; statusFilter?: readonly string[];
  create?: { perm: string; label: string; fields: FieldDef[]; toBody?: (v: Record<string, unknown>) => unknown; endpoint?: string };
  extraQuery?: Record<string, string>; customEntity?: 'persons' | 'vehicles'; headerExtra?: ReactNode; notice?: ReactNode;
}

/** Generische, serverseitig paginierte Listenseite mit Suche, Statusfilter und permission-aware „Neu“-Aktion. */
export function ResourcePage<T extends { id?: string }>({ cfg }: { cfg: ResourceConfig<T> }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search, 300);
  const [pageSize, setPageSize] = useTablePageSize();
  const studio = useStudio();
  const cf = cfg.customEntity ? customFormFields(studio.data?.customFields[cfg.customEntity]) : [];
  const res = useQuery({ queryKey: [cfg.queryKey, page, pageSize, q, status], queryFn: () => api<Page<T>>(cfg.endpoint, { query: { page, pageSize, q: q || undefined, status: status || undefined, ...cfg.extraQuery } }), placeholderData: (p) => p });
  const canCreate = cfg.create && can(cfg.create.perm);
  return (
    <>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} actions={<>{cfg.headerExtra}{canCreate && <Button onClick={() => setCreating(true)}><Plus size={14} />{cfg.create!.label}</Button>}</>} />
      {cfg.notice}
      <DataTable<T> columns={cfg.columns} rows={res.data?.items} total={res.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
        loading={res.isLoading} error={res.error} onRetry={() => void res.refetch()} search={search} onSearch={(s) => { setSearch(s); setPage(1); }}
        onRowClick={cfg.detailPath ? (r) => nav(cfg.detailPath!(r)) : undefined} empty={{ text: cfg.emptyText, hint: cfg.emptyHint }}
        toolbar={cfg.statusFilter && <Select aria-label="Statusfilter" className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Alle Status</option>{cfg.statusFilter.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</Select>} />
      {canCreate && <FormModal open={creating} onClose={() => setCreating(false)} title={cfg.create!.label} fields={[...cfg.create!.fields, ...cf]} endpoint={cfg.create!.endpoint ?? cfg.endpoint} toBody={cfg.customEntity ? (v) => withCustom(v, cfg.create!.toBody) : cfg.create!.toBody} invalidate={[[cfg.queryKey]]} onDone={(r) => { const id = (r as { id?: string; person?: { id: string } })?.id ?? (r as { person?: { id: string } })?.person?.id; if (id && cfg.detailPath) nav(cfg.detailPath({ id } as T)); }} />}
    </>
  );
}
