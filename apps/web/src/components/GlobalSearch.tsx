import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { Modal, Input, EmptyState, Badge } from './ui';
import { useDebounced } from './DataTable';

interface Hit { type: string; id: string; label: string; sub?: string }
const ROUTE: Record<string, string> = { person: 'persons', vehicle: 'vehicles', incident: 'incidents', report: 'reports', ticket: 'tickets', complaint: 'complaints', investigation: 'investigations', wanted: 'wanted', evidence: 'evidence', personnel: 'personnel' };

/** Ctrl/Cmd+K. Die Suche ist serverseitig permission-aware. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const nav = useNavigate();
  const q = useDebounced(term.trim(), 250);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const res = useQuery({ queryKey: ['search', q], queryFn: () => api<{ results: Hit[] }>('/search', { query: { q } }), enabled: open && q.length >= 2 });
  const go = (h: Hit) => { setOpen(false); setTerm(''); nav(`/${ROUTE[h.type]}/${h.id}`); };
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex w-full max-w-sm items-center gap-2 rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-muted hover:border-primary" aria-label="Open search (Ctrl+K)">
        <Search size={14} aria-hidden /><span className="flex-1 text-left">Search persons, plates, cases…</span><kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
      </button>
      <Modal open={open} title="Search" onClose={() => setOpen(false)}>
        <Input autoFocus aria-label="Search term" placeholder="Name, Roblox ID, plate, I-/R-/T-/C-/CASE- number…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <div className="mt-3 max-h-80 overflow-auto" aria-live="polite">
          {q.length < 2 ? <p className="py-6 text-center text-xs text-muted">Type at least 2 characters.</p> : res.isLoading ? <p className="py-6 text-center text-xs text-muted">Searching…</p> : !res.data?.results.length ? <EmptyState text="No results." /> : (
            <ul>{res.data.results.map((h) => (
              <li key={`${h.type}${h.id}`}><button className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-panel-2" onClick={() => go(h)}><Badge>{h.type}</Badge><span className="font-medium">{h.label}</span>{h.sub && <span className="truncate text-xs text-muted">{h.sub}</span>}</button></li>
            ))}</ul>
          )}
        </div>
      </Modal>
    </>
  );
}
