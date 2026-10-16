import { isValidElement, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Download, Plus } from 'lucide-react';
import { downloadCsv } from '../lib/csv';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { customFormFields, useStudio, withCustom } from '../lib/studio';
import { DataTable, useDebounced, useTablePageSize, type Column } from './DataTable';
import { FormModal, type FieldDef } from './FormModal';
import { Button, optionLabel, PageHeader, Select, statusLabel } from './ui';

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
  // Suche, Filter und Seite stehen in der Adresse: Zurück aus der Detailansicht behält die Liste, Links lassen sich teilen
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = params.get('status') ?? '';
  const [search, setSearchState] = useState(params.get('q') ?? '');
  const setParam = (patch: Record<string, string | number | undefined>) => setParams((prev) => {
    const n = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === '' || (k === 'page' && v === 1)) n.delete(k); else n.set(k, String(v)); }
    return n;
  }, { replace: true });
  const setPage = (p: number) => setParam({ page: p });
  const setStatus = (v: string) => setParam({ status: v, page: 1 });
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search, 300);
  useEffect(() => { if ((params.get('q') ?? '') !== q) setParam({ q, page: 1 }); }, [q]);
  const [pageSize, setPageSize] = useTablePageSize();
  const studio = useStudio();
  const cf = cfg.customEntity ? customFormFields(studio.data?.customFields[cfg.customEntity]) : [];
  const res = useQuery({ queryKey: [cfg.queryKey, page, pageSize, q, status], queryFn: () => api<Page<T>>(cfg.endpoint, { query: { page, pageSize, q: q || undefined, status: status || undefined, ...cfg.extraQuery } }), placeholderData: (p) => p });
  const canCreate = cfg.create && can(cfg.create.perm);
  /** Alle Treffer der aktuellen Suche/Filter als CSV (über dieselbe Liste wie oben – gleiche Rechte, max. 5000 Zeilen). */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: T[] = [];
      for (let p = 1; p <= 10; p++) {
        const r = await api<Page<T>>(cfg.endpoint, { query: { page: p, pageSize: 500, q: q || undefined, status: status || undefined, ...cfg.extraQuery } });
        rows.push(...r.items);
        if (rows.length >= r.total || !r.items.length) break;
      }
      downloadCsv(cfg.queryKey, cfg.columns.map((c) => c.label), rows.map((r) => cfg.columns.map((c) => csvValue(c, r))));
    } finally { setExporting(false); }
  };
  return (
    <>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} actions={<>{cfg.headerExtra}{!!res.data?.total && <Button variant="secondary" disabled={exporting} onClick={() => void exportCsv()} title="Alle Treffer als CSV (Excel) herunterladen"><Download size={14} />{exporting ? 'Exportiert…' : 'CSV'}</Button>}{canCreate && <Button onClick={() => setCreating(true)}><Plus size={14} />{cfg.create!.label}</Button>}</>} />
      {cfg.notice}
      <DataTable<T> columns={cfg.columns} rows={res.data?.items} total={res.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
        loading={res.isLoading} error={res.error} onRetry={() => void res.refetch()} search={search} onSearch={setSearchState}
        onRowClick={cfg.detailPath ? (r) => nav(cfg.detailPath!(r)) : undefined} empty={{ text: cfg.emptyText, hint: cfg.emptyHint }}
        toolbar={cfg.statusFilter && <Select aria-label="Statusfilter" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Alle Status</option>{cfg.statusFilter.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</Select>} />
      {canCreate && <FormModal open={creating} onClose={() => setCreating(false)} title={cfg.create!.label} fields={[...cfg.create!.fields, ...cf]} endpoint={cfg.create!.endpoint ?? cfg.endpoint} toBody={cfg.customEntity ? (v) => withCustom(v, cfg.create!.toBody) : cfg.create!.toBody} invalidate={[[cfg.queryKey]]} onDone={(r) => { const id = (r as { id?: string; person?: { id: string } })?.id ?? (r as { person?: { id: string } })?.person?.id; if (id && cfg.detailPath) nav(cfg.detailPath({ id } as T)); }} />}
    </>
  );
}

/** CSV-Zelle: eigener Exportwert, sonst angezeigter Text, sonst Rohwert (Status/Priorität deutsch). */
function csvValue<T>(c: Column<T>, r: T): unknown {
  if (c.csv) return c.csv(r);
  const shown = c.render?.(r);
  if (typeof shown === 'string' || typeof shown === 'number') return shown;
  if (isValidElement(shown) && typeof (shown.props as { status?: unknown; priority?: unknown }).status === 'string') return statusLabel((shown.props as { status: string }).status);
  if (isValidElement(shown) && typeof (shown.props as { priority?: unknown }).priority === 'string') return optionLabel((shown.props as { priority: string }).priority);
  const raw = (r as Record<string, unknown>)[c.key];
  return raw !== null && typeof raw === 'object' ? '' : typeof raw === 'string' ? optionLabel(raw) : raw;
}
