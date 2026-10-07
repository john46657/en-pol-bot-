import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, LayoutGrid, Plus, Search, Table2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { fmtDate, statusInfo, useHrConfig, useRanks, type Overview, type PersonRow } from '../../lib/hr';
import { Toggle } from '../../components/ApplicationSettings';
import { Avatar } from '../../components/TeamRoster';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows } from '../../components/ui';

type SortKey = 'name' | 'rank' | 'department' | 'status' | 'trainings' | 'promotions' | 'awards' | 'warnings';
type State = '' | 'active' | 'inactive' | 'absent';
interface ViewPrefs { view: 'cards' | 'table'; sort: SortKey; dir: 'asc' | 'desc'; compact: boolean; filters: { status: string; rank: string; department: string; state: State } }
const DEFAULT_VIEW: ViewPrefs = { view: 'table', sort: 'rank', dir: 'asc', compact: false, filters: { status: '', rank: '', department: '', state: '' } };
const COLS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' }, { key: 'rank', label: 'Rang' }, { key: 'department', label: 'Abteilung' }, { key: 'status', label: 'Status' },
  { key: 'trainings', label: 'Ausbildungen' }, { key: 'promotions', label: 'Beförderungen' }, { key: 'awards', label: 'Auszeichnungen' }, { key: 'warnings', label: 'Verwarnungen' },
];

/** Persönliche Ansicht (nur dieser Benutzer, nur dieser Browser). */
function loadView(key: string): ViewPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<ViewPrefs> | null;
    return raw ? { ...DEFAULT_VIEW, ...raw, filters: { ...DEFAULT_VIEW.filters, ...raw.filters } } : DEFAULT_VIEW;
  } catch { return DEFAULT_VIEW; }
}

const sortValue = (r: PersonRow, k: SortKey): string | number => {
  switch (k) {
    case 'name': return r.name.toLowerCase();
    case 'rank': return r.rankPosition;
    case 'department': return (r.department ?? '').toLowerCase();
    case 'status': return r.status ?? '';
    case 'warnings': return r.counts.warnings ?? 0;
    default: return r.counts[k];
  }
};

export const RankLabel = ({ name, color, icon }: { name: string | null; color: string | null; icon: string | null }) =>
  name ? <span className="inline-flex items-center gap-1.5">{icon ? <span aria-hidden>{icon}</span> : <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color ?? '#64748b' }} />}{name}</span> : <span className="text-muted">—</span>;

export function PersonnelOverview() {
  const { can, user } = useAuth();
  const nav = useNavigate();
  const cfg = useHrConfig().data;
  const storeKey = `hr.overview.${user?.id ?? 'anon'}`;
  const [st, setSt] = useState(() => ({ key: storeKey, v: loadView(storeKey) }));
  if (st.key !== storeKey) setSt({ key: storeKey, v: loadView(storeKey) }); // anderer Benutzer → dessen Ansicht
  const v = st.v;
  const setV = (nv: ViewPrefs) => {
    setSt({ key: storeKey, v: nv });
    try { localStorage.setItem(storeKey, JSON.stringify(nv)); } catch { /* privater Modus */ }
  };
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [create, setCreate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const f = v.filters;
  const setF = (p: Partial<ViewPrefs['filters']>) => setV({ ...v, filters: { ...f, ...p } });

  const list = useQuery({
    queryKey: ['hr-people', term, f],
    queryFn: () => api<Overview>('/hr/people', { query: { q: term || undefined, status: f.status || undefined, rank: f.rank || undefined, department: f.department || undefined, state: f.state || undefined } }),
    placeholderData: (prev) => prev,
  });
  const data = list.data;
  const showWarn = !!data?.rows.some((r) => r.counts.warnings !== null);
  const cols = COLS.filter((c) => c.key !== 'warnings' || showWarn);
  const rows = useMemo(() => {
    const r = [...(data?.rows ?? [])];
    const m = v.dir === 'asc' ? 1 : -1;
    r.sort((a, b) => { const x = sortValue(a, v.sort), y = sortValue(b, v.sort); return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name, 'de')) * m; });
    return r;
  }, [data, v.sort, v.dir]);
  const sortBy = (k: SortKey) => setV({ ...v, sort: k, dir: v.sort === k && v.dir === 'asc' ? 'desc' : 'asc' });
  const open = (r: PersonRow) => nav(`/personnel/${r.id}`);
  const pad = v.compact ? 'px-2 py-1' : 'p-2';

  const status = (r: PersonRow) => { const s = statusInfo(cfg, r.status); return r.status ? <span style={{ color: s.color }}>{s.emoji} {s.label}</span> : <span className="text-muted">—</span>; };
  const away = (r: PersonRow) => r.absentUntil && <Badge tone="warning">abwesend bis {fmtDate(r.absentUntil)}</Badge>;

  return (
    <div>
      <PageHeader title="Personal" subtitle={data ? `${rows.length} Personalakten` : undefined}
        actions={can('personnel.create') && <Button onClick={() => setCreate(true)}><Plus size={16} aria-hidden />Personalakte anlegen</Button>} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="relative min-w-[16rem] flex-1">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input aria-label="Suche" className="pl-8" placeholder="Discord-/Roblox-Name oder -ID, Rang, Abteilung, Status, Dienstnummer …" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <Select aria-label="Status" className="w-auto" value={f.status} onChange={(e) => setF({ status: e.target.value })}>
            <option value="">Alle Status</option>{(cfg?.statuses ?? data?.statuses ?? []).map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
          </Select>
          <Select aria-label="Rang" className="w-auto" value={f.rank} onChange={(e) => setF({ rank: e.target.value })}>
            <option value="">Alle Ränge</option>{(data?.ranks ?? []).map((r) => <option key={r.id} value={r.name}>{r.icon ? `${r.icon} ` : ''}{r.name}</option>)}
          </Select>
          <Select aria-label="Abteilung" className="w-auto" value={f.department} onChange={(e) => setF({ department: e.target.value })}>
            <option value="">Alle Abteilungen</option>{(data?.departments ?? cfg?.departments ?? []).map((d) => <option key={d.name}>{d.name}</option>)}
          </Select>
          <Select aria-label="Zustand" className="w-auto" value={f.state} onChange={(e) => setF({ state: e.target.value as State })}>
            <option value="">Alle</option><option value="active">Aktiv</option><option value="inactive">Inaktiv</option><option value="absent">Abwesend</option>
          </Select>
          <div className="flex items-center gap-1" role="group" aria-label="Ansicht">
            <Button size="sm" variant={v.view === 'cards' ? 'primary' : 'secondary'} aria-pressed={v.view === 'cards'} onClick={() => setV({ ...v, view: 'cards' })}><LayoutGrid size={14} aria-hidden />Karten</Button>
            <Button size="sm" variant={v.view === 'table' ? 'primary' : 'secondary'} aria-pressed={v.view === 'table'} onClick={() => setV({ ...v, view: 'table' })}><Table2 size={14} aria-hidden />Tabelle</Button>
          </div>
          <span className="flex items-center gap-2 text-sm text-muted"><Toggle checked={v.compact} onChange={(c) => setV({ ...v, compact: c })} label="Kompakt" />Kompakt</span>
          {v.view === 'cards' && (
            <Select aria-label="Sortierung" className="w-auto" value={`${v.sort}:${v.dir}`} onChange={(e) => { const [s, d] = e.target.value.split(':'); setV({ ...v, sort: s as SortKey, dir: d as 'asc' | 'desc' }); }}>
              {cols.flatMap((c) => [<option key={`${c.key}:asc`} value={`${c.key}:asc`}>{c.label} ↑</option>, <option key={`${c.key}:desc`} value={`${c.key}:desc`}>{c.label} ↓</option>])}
            </Select>
          )}
        </div>
      </Card>

      {list.isLoading ? <SkeletonRows rows={8} /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !rows.length ? (
        <Card><EmptyState text="Keine Personalakten gefunden." hint={term || Object.values(f).some(Boolean) ? 'Suche oder Filter anpassen.' : undefined} /></Card>
      ) : v.view === 'table' ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted">
              {cols.map((c) => (
                <th key={c.key} className={pad} aria-sort={v.sort === c.key ? (v.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => sortBy(c.key)}>{c.label}{v.sort === c.key && (v.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}</button>
                </th>
              ))}
              <th className={pad}>Dienstnummer</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} tabIndex={0} className="cursor-pointer border-b border-line/50 hover:bg-panel-2" onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter') open(r); }}>
                  <td className={pad}><span className="flex items-center gap-2"><Avatar src={r.avatar} name={r.name} size={v.compact ? 20 : 28} /><span className="min-w-0"><span className="block font-medium">{r.name}</span>{!v.compact && (r.discordName || r.robloxName) && <span className="block text-xs text-muted">{[r.discordName, r.robloxName && `Roblox: ${r.robloxName}`].filter(Boolean).join(' · ')}</span>}</span>{away(r)}</span></td>
                  <td className={pad}><RankLabel name={r.rank} color={r.rankColor} icon={r.rankIcon} /></td>
                  <td className={pad}>{r.department ?? <span className="text-muted">—</span>}</td>
                  <td className={pad}>{status(r)}</td>
                  <td className={pad}>{r.counts.trainings}</td>
                  <td className={pad}>{r.counts.promotions}</td>
                  <td className={pad}>{r.counts.awards}</td>
                  {showWarn && <td className={pad}>{r.counts.warnings ?? '—'}</td>}
                  <td className={pad}>{r.serviceNumber ?? <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className={`grid gap-3 ${v.compact ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
          {rows.map((r) => (
            <button key={r.id} type="button" onClick={() => open(r)} className="card border border-line p-3 text-left text-sm transition hover:border-primary">
              <div className="flex items-center gap-3">
                <Avatar src={r.avatar} name={r.name} size={v.compact ? 32 : 44} />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.name}</p><p className="text-xs"><RankLabel name={r.rank} color={r.rankColor} icon={r.rankIcon} /></p></div>
                {away(r)}
              </div>
              {!v.compact && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted">Abteilung</dt><dd>{r.department ?? '—'}</dd>
                  <dt className="text-muted">Status</dt><dd>{status(r)}</dd>
                  <dt className="text-muted">Dienstnummer</dt><dd>{r.serviceNumber ?? '—'}</dd>
                </dl>
              )}
              <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                <span title="Ausbildungen">📚 {r.counts.trainings}</span><span title="Beförderungen">🎖️ {r.counts.promotions}</span><span title="Auszeichnungen">🏅 {r.counts.awards}</span>
                {r.counts.warnings !== null && <span title="Verwarnungen">⚠️ {r.counts.warnings}</span>}
              </p>
            </button>
          ))}
        </div>
      )}
      {create && <CreateModal onClose={() => setCreate(false)} onCreated={(id) => nav(`/personnel/${id}`)} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const cfg = useHrConfig().data;
  const ranks = useRanks().data ?? [];
  const [d, setD] = useState({ discordId: '', name: '', rank: '', department: '', status: 'ACTIVE', joinDate: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState<string>();
  const save = useMutation({
    mutationFn: () => api<{ id: string }>('/hr/people', { method: 'POST', body: { discordId: d.discordId.trim(), name: d.name.trim() || undefined, rank: d.rank || null, department: d.department || null, status: d.status || undefined, joinDate: d.joinDate || undefined } }),
    onSuccess: (p) => onCreated(p.id),
    onError: (e) => setErr(errText(e)),
  });
  const valid = /^\d{15,25}$/.test(d.discordId.trim());
  return (
    <Modal open title="Personalakte anlegen" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
        <label className="grid gap-1 text-sm">Discord-ID *<Input aria-label="Discord-ID" inputMode="numeric" value={d.discordId} onChange={(e) => setD({ ...d, discordId: e.target.value })} placeholder="z. B. 123456789012345678" /></label>
        <label className="grid gap-1 text-sm">Name<Input aria-label="Name" maxLength={64} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Anzeigename (falls noch kein Benutzer existiert)" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Rang<Select aria-label="Rang" value={d.rank} onChange={(e) => setD({ ...d, rank: e.target.value })}><option value="">– kein Rang –</option>{ranks.filter((r) => r.active).map((r) => <option key={r.id} value={r.name}>{r.icon ? `${r.icon} ` : ''}{r.name}</option>)}</Select></label>
          <label className="grid gap-1 text-sm">Abteilung<Select aria-label="Abteilung" value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })}><option value="">– keine –</option>{(cfg?.departments ?? []).map((x) => <option key={x.id}>{x.name}</option>)}</Select></label>
          <label className="grid gap-1 text-sm">Status<Select aria-label="Status" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>{(cfg?.statuses ?? []).filter((s) => s.active).map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}</Select></label>
          <label className="grid gap-1 text-sm">Eintrittsdatum<Input type="date" aria-label="Eintrittsdatum" value={d.joinDate} onChange={(e) => setD({ ...d, joinDate: e.target.value })} /></label>
        </div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!valid || save.isPending}>Anlegen</Button></div>
      </form>
    </Modal>
  );
}
