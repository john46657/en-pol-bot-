import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button, EmptyState, ErrorState, Input, SkeletonRows } from './ui';
import { usePhone } from '../lib/media';

export interface Column<T> { key: string; label: string; render?: (row: T) => ReactNode; className?: string }

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Server-seitig paginierte Tabelle (keine riesigen Tabellen im Client). */
export function DataTable<T extends { id?: string }>({ columns, rows, total, page, pageSize, onPage, loading, error, onRetry, onRowClick, empty, search, onSearch, toolbar }: {
  columns: Column<T>[]; rows: T[] | undefined; total: number; page: number; pageSize: number; onPage: (p: number) => void; loading: boolean; error?: unknown; onRetry?: () => void;
  onRowClick?: (r: T) => void; empty: { text: string; hint?: string }; search?: string; onSearch?: (q: string) => void; toolbar?: ReactNode;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const phone = usePhone();
  return (
    <div className="rounded-lg border border-line bg-panel">
      {(onSearch || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          {onSearch && <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search size={14} className="absolute left-2.5 top-3 text-muted" aria-hidden /><Input aria-label="Search" placeholder="Search…" value={search ?? ''} onChange={(e) => onSearch(e.target.value)} className="pl-8" /></div>}
          {toolbar}
        </div>
      )}
      {error ? <ErrorState error={error} onRetry={onRetry} /> : loading ? <div className="p-3"><SkeletonRows /></div> : !rows?.length ? <EmptyState text={empty.text} hint={empty.hint} /> : (
        phone ? (
        /* Handy: jede Zeile als Karte (erste Spalte als Überschrift, übrige als Beschriftung + Wert) */
        <ul className="divide-y divide-line/60">
          {rows.map((r, i) => {
            const cell = (c: Column<T>) => (c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—'));
            const [head, ...rest] = columns;
            const body = (
              <>
                {head && <div className="mb-1 font-medium">{cell(head)}</div>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {rest.map((c) => <div key={c.key} className="contents"><dt className="text-xs uppercase text-muted">{c.label}</dt><dd className="min-w-0 break-words">{cell(c)}</dd></div>)}
                </dl>
              </>
            );
            return (
              <li key={r.id ?? i}>
                {onRowClick
                  ? <button type="button" className="block w-full px-3 py-3 text-left hover:bg-panel-2 active:bg-panel-2" onClick={() => onRowClick(r)}>{body}</button>
                  : <div className="px-3 py-3">{body}</div>}
              </li>
            );
          })}
        </ul>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-muted"><tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 font-medium ${c.className ?? ''}`}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? i} className={`border-b border-line/60 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-panel-2' : ''}`} onClick={() => onRowClick?.(r)}
                  tabIndex={onRowClick ? 0 : undefined} onKeyDown={(e) => { if (onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(r); } }}>
                  {columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.className ?? ''}`}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )
      )}
      {total > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-muted">
          <span>{total} records</span>
          <div className="flex items-center gap-2"><Button variant="ghost" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></Button>Page {page} / {pages}<Button variant="ghost" size="sm" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></Button></div>
        </div>
      )}
    </div>
  );
}
