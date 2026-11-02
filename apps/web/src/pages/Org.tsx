import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { buildOrgTree, ORG_UNIT_KIND_LABEL, ORG_UNIT_KINDS, type OrgTree, type OrgUnitKind } from '@enrp/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../components/ui';

interface Person { id: string; name: string; rank: string | null; callsign: string | null; serviceNumber: string | null }
interface Member extends Person { function: string | null; since: string | null; via: 'ASSIGNMENT' | 'DEPARTMENT' }
export interface Unit { id: string; parentId: string | null; name: string; kind: OrgUnitKind; description: string | null; responsibilities: string | null; departmentName: string | null; color: string | null; position: number; active: boolean; version: number; leader: Person | null; deputy: Person | null; memberCount: number; members?: Member[] }

/** Organigramm: Baum mit Auf-/Zuklappen, Personensuche, Filter nach Abteilung, Detailansicht, Editor (Recht org.edit / org.hierarchy). */
export function OrgPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [inactive, setInactive] = useState(false);
  const units = useQuery({ queryKey: ['org-units', inactive], queryFn: () => api<Unit[]>('/org/units', { query: { inactive: inactive ? '1' : undefined } }) });
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Unit | 'new' | null>(null);
  const imp = useMutation({ mutationFn: () => api<{ created: string[] }>('/org/import-departments', { method: 'POST', body: {} }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['org-units'] }) });
  const list = units.data ?? [];
  const term = q.trim().toLowerCase();
  // Treffer: Name der Einheit oder Person (Führung, Stellvertretung, Mitglieder); Vorfahren bleiben sichtbar
  const match = useMemo(() => {
    if (!term && !dept) return null;
    const hit = new Set<string>();
    for (const u of list) {
      const people = [u.leader, u.deputy, ...(u.members ?? [])].filter(Boolean) as Person[];
      const ok = (!term || u.name.toLowerCase().includes(term) || people.some((p) => p.name.toLowerCase().includes(term) || p.callsign?.toLowerCase().includes(term))) && (!dept || u.departmentName === dept || u.name === dept);
      if (ok) { let cur: Unit | undefined = u; while (cur && !hit.has(cur.id)) { hit.add(cur.id); cur = list.find((x) => x.id === cur!.parentId); } }
    }
    return hit;
  }, [list, term, dept]);
  const tree = buildOrgTree(match ? list.filter((u) => match.has(u.id)) : list);
  const selected = list.find((u) => u.id === sel) ?? null;
  const depts = [...new Set(list.map((u) => u.departmentName).filter((x): x is string => !!x))];
  const toggle = (id: string) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <PageHeader title="🏛️ Organigramm" subtitle="Organisationsstruktur von EN | POLIZEI: Führung, Abteilungen, Dienstgruppen und Zuständigkeiten."
        actions={<>{can('org.hierarchy') && <Button variant="secondary" disabled={imp.isPending} onClick={() => imp.mutate()}>Abteilungen übernehmen</Button>}{can('org.edit') && <Button onClick={() => setEdit('new')}><Plus size={16} />Einheit</Button>}</>} />
      {imp.data && <p className="mb-2 text-sm text-muted" role="status">{imp.data.created.length ? `Übernommen: ${imp.data.created.join(', ')}` : 'Alle Abteilungen aus den Personal-Einstellungen sind schon im Organigramm.'}</p>}
      {imp.error && <p role="alert" className="mb-2 text-sm text-danger">{errText(imp.error)}</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72"><Input aria-label="Suche" placeholder="🔍 Einheit oder Person…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Abteilung" className="w-48" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">Alle Abteilungen</option>{depts.map((d) => <option key={d}>{d}</option>)}</Select>
        {can('org.edit') && <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />deaktivierte zeigen</label>}
        <Button size="sm" variant="ghost" onClick={() => setClosed(new Set())}>Alle aufklappen</Button>
        <Button size="sm" variant="ghost" onClick={() => setClosed(new Set(list.map((u) => u.id)))}>Alle zuklappen</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="overflow-x-auto">
          {units.isLoading ? <SkeletonRows /> : units.error ? <ErrorState error={units.error} /> : !tree.length ? <EmptyState text={match ? 'Keine Treffer.' : 'Das Organigramm ist noch leer.'} hint={can('org.edit') ? 'Einheiten anlegen oder die Abteilungen aus den Personal-Einstellungen übernehmen.' : undefined} /> : (
            <ul role="tree" aria-label="Organigramm" className="grid gap-1">{tree.map((n) => <Node key={n.id} n={n} depth={0} closed={match ? new Set() : closed} toggle={toggle} sel={sel} onSelect={setSel} />)}</ul>
          )}
        </Card>
        <div>{selected ? <UnitDetail unit={selected} all={list} onEdit={() => setEdit(selected)} /> : <Card><EmptyState text="Einheit anklicken für Details." /></Card>}</div>
      </div>
      {edit && <UnitForm unit={edit === 'new' ? null : edit} all={list} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void qc.invalidateQueries({ queryKey: ['org-units'] }); }} />}
    </>
  );
}

function Node({ n, depth, closed, toggle, sel, onSelect }: { n: OrgTree<Unit>; depth: number; closed: Set<string>; toggle: (id: string) => void; sel: string | null; onSelect: (id: string) => void }) {
  const open = !closed.has(n.id);
  return (
    <li role="treeitem" aria-expanded={n.children.length ? open : undefined} aria-selected={sel === n.id}>
      <div className={`flex items-center gap-2 rounded-md border-l-4 px-2 py-1.5 ${sel === n.id ? 'bg-panel-2' : 'hover:bg-panel-2/60'} ${n.active ? '' : 'opacity-50'}`} style={{ marginLeft: depth * 16, borderLeftColor: n.color ?? '#1e3a8a' }}>
        {n.children.length ? <button type="button" aria-label={open ? 'Zuklappen' : 'Aufklappen'} onClick={() => toggle(n.id)} className="text-muted">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button> : <span className="w-4" />}
        <button type="button" onClick={() => onSelect(n.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left text-sm">
          <b>{n.name}</b><Badge>{ORG_UNIT_KIND_LABEL[n.kind]}</Badge>
          {n.leader && <span className="text-xs text-muted">Leitung: {n.leader.name}</span>}
          {n.deputy && <span className="text-xs text-muted">Stv.: {n.deputy.name}</span>}
          <span className="ml-auto text-xs text-muted">{n.memberCount} Personen</span>
        </button>
      </div>
      {open && n.children.length > 0 && <ul role="group" className="mt-1 grid gap-1">{n.children.map((c) => <Node key={c.id} n={c} depth={depth + 1} closed={closed} toggle={toggle} sel={sel} onSelect={onSelect} />)}</ul>}
    </li>
  );
}

interface Detail extends Unit { formerMembers: (Person & { function: string | null; startedAt: string; endedAt: string })[]; history: { id: string; action: string; at: string; actor: string }[] }
function UnitDetail({ unit, all, onEdit }: { unit: Unit; all: Unit[]; onEdit: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ['org-unit', unit.id, unit.version], queryFn: () => api<Detail>(`/org/units/${unit.id}`) });
  const [adding, setAdding] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['org-units'] }); void qc.invalidateQueries({ queryKey: ['org-unit', unit.id] }); };
  const active = useMutation({ mutationFn: () => api(`/org/units/${unit.id}/${unit.active ? 'deactivate' : 'activate'}`, { method: 'POST' }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (pid: string) => api(`/org/units/${unit.id}/members/${pid}`, { method: 'DELETE' }), onSuccess: refresh });
  const parent = all.find((u) => u.id === unit.parentId);
  return (
    <Card title={unit.name} actions={can('org.edit') ? <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={onEdit}>Bearbeiten</Button><Button size="sm" variant={unit.active ? 'danger' : 'secondary'} disabled={active.isPending} onClick={() => active.mutate()}>{unit.active ? 'Deaktivieren' : 'Aktivieren'}</Button></div> : undefined}>
      <dl className="grid gap-1 text-sm">
        <div><dt className="inline text-muted">Art: </dt><dd className="inline">{ORG_UNIT_KIND_LABEL[unit.kind]}</dd></div>
        {parent && <div><dt className="inline text-muted">Übergeordnet: </dt><dd className="inline">{parent.name}</dd></div>}
        <div><dt className="inline text-muted">Führung: </dt><dd className="inline">{unit.leader ? `${unit.leader.name}${unit.leader.rank ? ` (${unit.leader.rank})` : ''}` : '—'}</dd></div>
        <div><dt className="inline text-muted">Stellvertretung: </dt><dd className="inline">{unit.deputy ? `${unit.deputy.name}${unit.deputy.rank ? ` (${unit.deputy.rank})` : ''}` : '—'}</dd></div>
        {unit.departmentName && <div><dt className="inline text-muted">Abteilung: </dt><dd className="inline">{unit.departmentName} (Mitglieder aus der Personalakte)</dd></div>}
        {unit.responsibilities && <div><dt className="text-muted">Zuständigkeiten</dt><dd className="whitespace-pre-wrap">{unit.responsibilities}</dd></div>}
        {unit.description && <div><dt className="text-muted">Beschreibung</dt><dd className="whitespace-pre-wrap">{unit.description}</dd></div>}
      </dl>
      {active.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(active.error)}</p>}
      <h3 className="mt-4 mb-1 flex items-center justify-between text-sm font-semibold">Personen ({unit.memberCount}){can('org.edit') && unit.active && <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus size={14} />Zuordnen</Button>}</h3>
      <ul className="grid gap-1 text-sm">{(unit.members ?? []).map((m) => (
        <li key={m.id} className="flex items-center gap-2 border-b border-line/60 py-1"><span>{m.name}</span>{m.rank && <span className="text-xs text-muted">{m.rank}</span>}{m.function && <Badge>{m.function}</Badge>}{m.via === 'DEPARTMENT' && <Badge tone="info">Abteilung</Badge>}
          {m.via === 'ASSIGNMENT' && can('org.edit') && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => remove.mutate(m.id)}>Beenden</Button>}</li>))}</ul>
      {d.data && d.data.formerMembers.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted">Frühere Zuordnungen ({d.data.formerMembers.length})</summary><ul className="mt-1 grid gap-1">{d.data.formerMembers.map((m, i) => <li key={i}>{m.name} · {fmt(m.startedAt)} – {fmt(m.endedAt)}</li>)}</ul></details>}
      {d.data && d.data.history.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted">Änderungsprotokoll</summary><ul className="mt-1 grid gap-1">{d.data.history.map((h) => <li key={h.id} className="text-xs">{fmt(h.at)} · {h.actor} · <code>{h.action}</code></li>)}</ul></details>}
      {adding && <AssignModal unitId={unit.id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
    </Card>
  );
}

function usePersonnelOptions() {
  // ohne personnel.view bleibt die Liste leer (die API prüft die Rechte selbst)
  return useQuery({ queryKey: ['org-people'], queryFn: () => api<{ rows: { id: string; name: string; rank: string | null }[] }>('/hr/people').then((r) => r.rows.map((p) => ({ id: p.id, name: p.name, rank: p.rank }))).catch(() => []) });
}

function AssignModal({ unitId, onClose, onDone }: { unitId: string; onClose: () => void; onDone: () => void }) {
  const people = usePersonnelOptions();
  const [v, setV] = useState({ personnelId: '', function: '' });
  const m = useMutation({ mutationFn: () => api(`/org/units/${unitId}/members`, { method: 'POST', body: { personnelId: v.personnelId, function: v.function || null } }), onSuccess: onDone });
  return (
    <Modal open title="Person zuordnen" onClose={onClose}>
      <div className="grid gap-3">
        <Select aria-label="Person" value={v.personnelId} onChange={(e) => setV({ ...v, personnelId: e.target.value })}><option value="">– wählen –</option>{(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.rank ? ` (${p.rank})` : ''}</option>)}</Select>
        <label className="grid gap-1 text-sm">Funktion (optional)<Input value={v.function} maxLength={80} onChange={(e) => setV({ ...v, function: e.target.value })} /></label>
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={!v.personnelId || m.isPending} onClick={() => m.mutate()}>Zuordnen</Button></div>
      </div>
    </Modal>
  );
}

function UnitForm({ unit, all, onClose, onDone }: { unit: Unit | null; all: Unit[]; onClose: () => void; onDone: () => void }) {
  const { can } = useAuth();
  const people = usePersonnelOptions();
  const [v, setV] = useState({ name: unit?.name ?? '', kind: unit?.kind ?? 'DUTY_GROUP', parentId: unit?.parentId ?? '', description: unit?.description ?? '', responsibilities: unit?.responsibilities ?? '', departmentName: unit?.departmentName ?? '', leaderPersonnelId: unit?.leader?.id ?? '', deputyPersonnelId: unit?.deputy?.id ?? '', color: unit?.color ?? '#1e3a8a', position: unit?.position ?? 0 });
  const hier = can('org.hierarchy');
  const m = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name: v.name, kind: v.kind, description: v.description || null, responsibilities: v.responsibilities || null, departmentName: v.departmentName || null, color: v.color, position: Number(v.position) || 0 };
      if (hier) Object.assign(body, { parentId: v.parentId || null, leaderPersonnelId: v.leaderPersonnelId || null, deputyPersonnelId: v.deputyPersonnelId || null });
      return api(unit ? `/org/units/${unit.id}` : '/org/units', { method: unit ? 'PATCH' : 'POST', body: unit ? { ...body, version: unit.version } : body });
    },
    onSuccess: onDone,
  });
  const opts = (people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.rank ? ` (${p.rank})` : ''}</option>);
  return (
    <Modal open wide title={unit ? 'Einheit bearbeiten' : 'Neue Einheit'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Name<Input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Art<Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as OrgUnitKind })}>{ORG_UNIT_KINDS.map((k) => <option key={k} value={k}>{ORG_UNIT_KIND_LABEL[k]}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Übergeordnete Einheit<Select disabled={!hier} value={v.parentId} onChange={(e) => setV({ ...v, parentId: e.target.value })}><option value="">– oberste Ebene –</option>{all.filter((u) => u.id !== unit?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Verknüpfte Abteilung (Personal-Einstellungen)<Input value={v.departmentName} maxLength={64} onChange={(e) => setV({ ...v, departmentName: e.target.value })} placeholder="leer = keine" /></label>
        <label className="grid gap-1 text-sm">Führung<Select disabled={!hier} value={v.leaderPersonnelId} onChange={(e) => setV({ ...v, leaderPersonnelId: e.target.value })}><option value="">—</option>{opts}</Select></label>
        <label className="grid gap-1 text-sm">Stellvertretung<Select disabled={!hier} value={v.deputyPersonnelId} onChange={(e) => setV({ ...v, deputyPersonnelId: e.target.value })}><option value="">—</option>{opts}</Select></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Zuständigkeiten<Textarea value={v.responsibilities} maxLength={2000} onChange={(e) => setV({ ...v, responsibilities: e.target.value })} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Beschreibung<Textarea value={v.description} maxLength={2000} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Farbe<Input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Reihenfolge<Input type="number" min={0} value={v.position} onChange={(e) => setV({ ...v, position: Number(e.target.value) })} /></label>
      </div>
      {!hier && <p className="mt-2 text-xs text-muted">Übergeordnete Einheit, Führung und Stellvertretung ändern braucht das Recht „Hierarchie bearbeiten“.</p>}
      {m.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(m.error)}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={v.name.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>Speichern</Button></div>
    </Modal>
  );
}

/** Kompakte Führungsstruktur für MDT und Leitstelle (ohne Mitgliederlisten). */
export function OrgSummary() {
  const s = useQuery({ queryKey: ['org-summary'], queryFn: () => api<Unit[]>('/org/summary'), retry: false });
  if (s.isLoading) return <SkeletonRows rows={3} />;
  if (s.error) return null;
  const tree = buildOrgTree(s.data ?? []);
  const render = (n: OrgTree<Unit>, d: number): React.ReactNode => (
    <li key={n.id} style={{ marginLeft: d * 14 }} className="border-b border-line/50 py-1 text-sm"><b>{n.name}</b> <span className="text-xs text-muted">{ORG_UNIT_KIND_LABEL[n.kind]}</span>
      <span className="block text-xs">Leitung: {n.leader?.name ?? '—'}{n.deputy && ` · Stv.: ${n.deputy.name}`}</span>{n.children.map((c) => render(c, d + 1))}</li>
  );
  return <Card title="Führungsstruktur & Ansprechpartner">{tree.length ? <ul>{tree.map((n) => render(n, 0))}</ul> : <EmptyState text="Kein Organigramm hinterlegt." />}</Card>;
}
