import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button, EmptyState, ErrorState, Input, Select, SkeletonRows } from './ui';
import { usePhone } from '../lib/media';
import { usePrefs } from '../lib/prefs';

/** Ab so vielen Zeilen werden nur die sichtbaren Zeilen gezeichnet (große Seiten bleiben flüssig). */
export const VIRTUAL_FROM = 60;
export const PAGE_SIZES = [25, 50, 100, 250, 500] as const;

export interface Column<T> { key: string; label: string; render?: (row: T) => ReactNode; className?: string }

/** Persönliche Zeilenzahl pro Seite (gilt für alle Tabellen, auf jedem Gerät). */
export function useTablePageSize(): [number, (n: number) => void] {
  const { prefs, update } = usePrefs();
  return [prefs.tablePageSize ?? 25, (n) => update({ tablePageSize: n as 25 })];
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Server-seitig paginierte Tabelle. Große Seiten (ab 60 Zeilen) werden virtualisiert: nur sichtbare Zeilen sind im DOM. */
export function DataTable<T extends { id?: string }>({ columns, rows, total, page, pageSize, onPage, loading, error, onRetry, onRowClick, empty, search, onSearch, toolbar, onPageSize }: {
  columns: Column<T>[]; rows: T[] | undefined; total: number; page: number; pageSize: number; onPage: (p: number) => void; loading: boolean; error?: unknown; onRetry?: () => void;
  onRowClick?: (r: T) => void; empty: { text: string; hint?: string }; search?: string; onSearch?: (q: string) => void; toolbar?: ReactNode;
  /** Zeilen pro Seite wählbar (25 … 500). */
  onPageSize?: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const phone = usePhone();
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = rows?.length ?? 0;
  const virtual = count > VIRTUAL_FROM;
  const v = useVirtualizer({ count: virtual ? count : 0, getScrollElement: () => scrollRef.current, estimateSize: () => (phone ? 112 : 41), overscan: 12 });
  const items = v.getVirtualItems();
  const shown = virtual ? items.map((it) => ({ index: it.index, row: rows![it.index]! })) : (rows ?? []).map((row, index) => ({ index, row }));
  const padTop = virtual ? (items[0]?.start ?? 0) : 0;
  const padBottom = virtual ? v.getTotalSize() - (items.at(-1)?.end ?? 0) : 0;
  const vprops = (index: number) => (virtual ? { ref: v.measureElement, 'data-index': index } : {});
  return (
    <div className="rounded-lg border border-line bg-panel">
      {(onSearch || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          {/* Suchfeld behält seine Breite; viele Filter umbrechen in die nächste Zeile statt das Suchfeld zu quetschen */}
          {onSearch && <div className="relative w-full shrink-0 sm:w-64"><Search size={14} className="absolute left-2.5 top-3 text-muted" aria-hidden /><Input aria-label="Search" placeholder="Suchen…" value={search ?? ''} onChange={(e) => onSearch(e.target.value)} className="pl-8" /></div>}
          {toolbar && <div className="min-w-0 flex-1 basis-64">{toolbar}</div>}
        </div>
      )}
      {error ? <ErrorState error={error} onRetry={onRetry} /> : loading ? <div className="p-3"><SkeletonRows /></div> : !rows?.length ? <EmptyState text={empty.text} hint={empty.hint} /> : (
        phone ? (
        /* Handy: jede Zeile als Karte (erste Spalte als Überschrift, übrige als Beschriftung + Wert) */
        <div ref={scrollRef} className={virtual ? 'max-h-[75vh] overflow-y-auto' : undefined}>
        <ul className="divide-y divide-line/60" style={virtual ? { paddingTop: padTop, paddingBottom: padBottom } : undefined}>
          {shown.map(({ row: r, index: i }) => {
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
              <li key={r.id ?? i} {...vprops(i)}>
                {onRowClick
                  ? <button type="button" className="block w-full px-3 py-3 text-left hover:bg-panel-2 active:bg-panel-2" onClick={() => onRowClick(r)}>{body}</button>
                  : <div className="px-3 py-3">{body}</div>}
              </li>
            );
          })}
        </ul>
        </div>
        ) : (
        <div ref={scrollRef} className={virtual ? 'max-h-[75vh] overflow-auto' : 'overflow-x-auto'}>
          <table className="w-full text-left text-sm" aria-rowcount={virtual ? count + 1 : undefined}>
            <thead className={`border-b border-line text-xs uppercase text-muted ${virtual ? 'sticky top-0 z-10 bg-panel' : ''}`}><tr>{columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 font-medium ${c.className ?? ''}`}>{c.label}</th>)}</tr></thead>
            <tbody>
              {padTop > 0 && <tr aria-hidden style={{ height: padTop }} />}
              {shown.map(({ row: r, index: i }) => (
                <tr key={r.id ?? i} {...vprops(i)} aria-rowindex={virtual ? i + 2 : undefined} className={`border-b border-line/60 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-panel-2' : ''}`} onClick={() => onRowClick?.(r)}
                  tabIndex={onRowClick ? 0 : undefined} onKeyDown={(e) => { if (onRowClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRowClick(r); } }}>
                  {columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.className ?? ''}`}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}</td>)}
                </tr>
              ))}
              {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }} />}
            </tbody>
          </table>
        </div>
        )
      )}
      {(total > pageSize || (onPageSize && total > PAGE_SIZES[0])) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-muted">
          <span className="flex items-center gap-2">{total} records
            {onPageSize && <Select aria-label="Zeilen pro Seite" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-7 w-auto py-0 text-xs">{PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / Seite</option>)}</Select>}
          </span>
          <div className="flex items-center gap-2"><Button variant="ghost" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></Button>Page {page} / {pages}<Button variant="ghost" size="sm" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></Button></div>
        </div>
      )}
    </div>
  );
}
