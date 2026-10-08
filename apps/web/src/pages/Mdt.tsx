import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Car, FileText, Fingerprint, Flag, Search, Siren, type LucideIcon } from 'lucide-react';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, PriorityBadge, SkeletonRows, StatusBadge } from '../components/ui';
import { FormModal } from '../components/FormModal';
import { RobloxCard } from '../components/RobloxCard';
import { useDebounced } from '../components/DataTable';
import * as R from './resources';
import type { ResourceConfig } from '../components/ResourcePage';

type Row = Record<string, unknown> & { id: string };
interface Hit { type: string; id: string; label: string; sub?: string }
const ROUTE: Record<string, string> = { person: 'persons', vehicle: 'vehicles', incident: 'incidents', report: 'reports', ticket: 'tickets', complaint: 'complaints', investigation: 'investigations', wanted: 'wanted', evidence: 'evidence', personnel: 'personnel' };
const TYPE_LABELS: Record<string, string> = { person: 'Person', vehicle: 'Fahrzeug', incident: 'Einsatz', report: 'Bericht', ticket: 'Strafzettel', complaint: 'Beschwerde', investigation: 'Ermittlung', wanted: 'Fahndung', evidence: 'Beweismittel', personnel: 'Personal' };

interface Quick { key: string; label: string; icon: LucideIcon; perm: string; cfg: ResourceConfig<Row>; route: string }
const QUICK: Quick[] = [
  { key: 'incident', label: 'Einsatz anlegen', icon: Siren, perm: 'incidents.create', cfg: R.incidents as never, route: 'incidents' },
  { key: 'report', label: 'Bericht anlegen', icon: FileText, perm: 'reports.create', cfg: R.reports as never, route: 'reports' },
  { key: 'investigation', label: 'Ermittlung anlegen', icon: Search, perm: 'investigations.create', cfg: R.investigations as never, route: 'investigations' },
  { key: 'wanted', label: 'Fahndung anlegen', icon: Flag, perm: 'wanted.create', cfg: R.wanted as never, route: 'wanted' },
];

/** MDT: zentrales Polizeiportal – Suche (Person/Kennzeichen/Aktenzeichen), Quick Actions, Lagebild. Alles permission-aware. */
export function Mdt() {
  const { can, user } = useAuth();
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState('');
  const [mode, setMode] = useState<'all' | 'person' | 'vehicle'>('all');
  const [action, setAction] = useState<Quick>();
  const q = useDebounced(term.trim(), 250);
  useRealtime('incidents', ['incident.created', 'incident.status'], [['mdt-incidents']]);
  useRealtime('wanted', ['wanted.changed'], [['mdt-wanted']]);

  const search = useQuery({ queryKey: ['mdt-search', q], queryFn: () => api<{ results: Hit[] }>('/search', { query: { q } }), enabled: q.length >= 2 });
  const wanted = useQuery({ queryKey: ['mdt-wanted'], queryFn: () => api<Page<Row>>('/wanted', { query: { pageSize: 6 } }), enabled: can('wanted.view') });
  const incidents = useQuery({ queryKey: ['mdt-incidents'], queryFn: () => api<Page<Row>>('/incidents', { query: { active: true, pageSize: 6 } }), enabled: can('incidents.view') });
  const reports = useQuery({ queryKey: ['mdt-reports'], queryFn: () => api<Page<Row>>('/reports', { query: { pageSize: 6 } }), enabled: can('reports.view') });
  useEffect(() => { input.current?.focus(); }, [mode]);

  const results = (search.data?.results ?? []).filter((r) => mode === 'all' || r.type === mode);
  const quick = QUICK.filter((a) => can(a.perm));
  const canPerson = can('persons.view'), canVehicle = can('vehicles.view');

  return (
    <>
      <PageHeader title="MDT" subtitle={`Mobiles Datenterminal — ${user?.displayName}`} />
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Suchbereich">
          <Button size="sm" variant={mode === 'all' ? 'primary' : 'secondary'} onClick={() => setMode('all')}>Alles</Button>
          {canPerson && <Button size="sm" variant={mode === 'person' ? 'primary' : 'secondary'} onClick={() => setMode('person')}><Fingerprint size={13} />Person suchen</Button>}
          {canVehicle && <Button size="sm" variant={mode === 'vehicle' ? 'primary' : 'secondary'} onClick={() => setMode('vehicle')}><Car size={13} />Fahrzeug suchen</Button>}
        </div>
        <Input ref={input} aria-label="MDT-Suche" placeholder={mode === 'vehicle' ? 'Kennzeichen, z. B. LC 1001' : mode === 'person' ? 'Roblox-Benutzername oder Roblox-ID' : 'Roblox-Name oder -ID, Kennzeichen, I-/R-/T-/C-/CASE-/E-Nummer…'} value={term}
          onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) nav(`/${ROUTE[results[0].type]}/${results[0].id}`); }} />
        <div className="mt-3" aria-live="polite">
          {q.length >= 2 && mode !== 'vehicle' && <RobloxCard term={q} />}
          {q.length < 2 ? <p className="text-xs text-muted">Mindestens 2 Zeichen eingeben. Es werden nur Datensätze angezeigt, die du sehen darfst.</p>
            : search.isLoading ? <SkeletonRows rows={2} /> : search.error ? <ErrorState error={search.error} onRetry={() => void search.refetch()} />
            : !results.length ? <EmptyState text="Keine passenden Datensätze im System." /> : (
              <ul className="grid gap-1 md:grid-cols-2">{results.map((h) => <li key={`${h.type}${h.id}`}><Link to={`/${ROUTE[h.type]}/${h.id}`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-panel-2"><Badge>{TYPE_LABELS[h.type] ?? h.type}</Badge><span className="font-medium">{h.label}</span>{h.sub && <span className="min-w-0 truncate text-xs text-muted">{h.sub}</span>}</Link></li>)}</ul>
            )}
        </div>
      </Card>

      <Card title="Schnellaktionen" className="mb-4">
        {quick.length === 0 ? <p className="text-sm text-muted">Für deine Rolle sind keine Anlege-Aktionen verfügbar.</p> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {quick.map((a) => <Button key={a.key} variant="secondary" className="justify-start" onClick={() => setAction(a)}><a.icon size={15} aria-hidden />{a.label}</Button>)}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {can('wanted.view') && (
          <Card title="Fahndungen" actions={<Link to="/wanted" className="text-xs text-primary hover:underline">Alle anzeigen</Link>}>
            {wanted.isLoading ? <SkeletonRows rows={3} /> : wanted.error ? <ErrorState error={wanted.error} /> : !wanted.data?.items.length ? <EmptyState text="Keine aktiven Fahndungen." /> : (
              <ul className="space-y-1.5">{wanted.data.items.map((w) => <li key={w.id} className="flex items-center justify-between gap-2"><Link className="min-w-0 truncate hover:underline" to={`/wanted/${w.id}`}>{String(w.reason)}</Link><PriorityBadge priority={String(w.priority)} /></li>)}</ul>
            )}
          </Card>
        )}
        {can('incidents.view') && (
          <Card title="Aktive Einsätze" actions={<Link to="/incidents" className="text-xs text-primary hover:underline">Alle anzeigen</Link>}>
            {incidents.isLoading ? <SkeletonRows rows={3} /> : incidents.error ? <ErrorState error={incidents.error} /> : !incidents.data?.items.length ? <EmptyState text="Keine offenen Einsätze." /> : (
              <ul className="space-y-1.5">{incidents.data.items.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><Link className="min-w-0 truncate hover:underline" to={`/incidents/${i.id}`}>{String(i.number)} · {String(i.title)}</Link><StatusBadge status={String(i.status)} /></li>)}</ul>
            )}
          </Card>
        )}
        {can('reports.view') && (
          <Card title="Neueste Berichte" actions={<Link to="/reports" className="text-xs text-primary hover:underline">Alle anzeigen</Link>}>
            {reports.isLoading ? <SkeletonRows rows={3} /> : reports.error ? <ErrorState error={reports.error} /> : !reports.data?.items.length ? <EmptyState text="Noch keine Berichte." /> : (
              <ul className="space-y-1.5">{reports.data.items.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><Link className="min-w-0 truncate hover:underline" to={`/reports/${r.id}`}>{String(r.number)} · {String(r.title)}</Link><StatusBadge status={String(r.status)} /></li>)}</ul>
            )}
          </Card>
        )}
      </div>

      {action && (
        <FormModal open onClose={() => setAction(undefined)} title={action.label} fields={action.cfg.create!.fields} endpoint={action.cfg.create!.endpoint ?? action.cfg.endpoint} toBody={action.cfg.create!.toBody}
          invalidate={[[action.cfg.queryKey], ['mdt-incidents'], ['mdt-wanted'], ['mdt-reports']]}
          onDone={(r) => { const id = (r as { id?: string; person?: { id: string } })?.id; if (id) nav(`/${action.route}/${id}`); }} />
      )}
    </>
  );
}
