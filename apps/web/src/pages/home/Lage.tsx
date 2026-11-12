import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useNavBadges } from '../../lib/badges';
import { ago, useCadLive, type CadOverview } from '../../lib/cad';
import { IncidentCard, Panel, StatTile, UnitRow } from '../../components/ops';
import { MdtDutyPanel } from '../../components/WorkspacePanels';
import { ErrorState, SkeletonRows } from '../../components/ui';

/** Offene Aufgaben (gleiche Zähler wie im Menü) mit kurzer Beschreibung. */
const TODO: { path: string; label: string; hint: string }[] = [
  { path: '/applications', label: 'Bewerbungen prüfen', hint: 'offene Bewerbungen' },
  { path: '/support-tickets', label: 'Support-Tickets', hint: 'offene Tickets' },
  { path: '/reports', label: 'Berichte freigeben', hint: 'eingereichte Berichte' },
  { path: '/promotions', label: 'Anträge entscheiden', hint: 'Beförderungen und Versetzungen' },
  { path: '/leave', label: 'Abmeldungen entscheiden', hint: 'wartende Abmeldungen' },
];

/**
 * Startseite oben: Lage (Einsätze, Einheiten, Notrufe aus der Leitstelle), offene Aufgaben und der eigene Dienst.
 * Jeder Teil erscheint nur mit dem passenden Recht; darunter folgen die persönlichen Widgets.
 */
export function Lage() {
  const { can } = useAuth();
  const badges = useNavBadges();
  const todo = TODO.map((t) => ({ ...t, n: badges[t.path] ?? 0 })).filter((t) => t.n > 0);
  const total = todo.reduce((a, t) => a + t.n, 0);
  const cad = can('cad.view') && can('dashboard.cad.view');
  return (
    <div className="mb-6 grid gap-4">
      {cad ? <CadLage todoTotal={total} /> : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><StatTile label="Für dich zu erledigen" value={total} hint={total ? todo.map((t) => t.label).join(', ') : 'alles erledigt'} /></div>
      )}
      <div className="grid gap-4">
        <Panel title="Für dich zu erledigen" flush>
          {!todo.length ? <p className="px-4 py-6 text-center text-sm text-muted">Nichts offen – alles erledigt.</p> : (
            <ul className="grid md:grid-cols-2">{todo.map((t) => (
              <li key={t.path}><Link to={t.path} className="flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-panel-2">
                <span className="min-w-0 flex-1"><span className="block font-semibold">{t.label}</span><span className="block text-xs text-muted">{t.n} {t.hint}</span></span>
                <span className="grid h-5 min-w-[22px] place-items-center rounded-full bg-panel-2 px-1.5 font-mono text-[11px] font-semibold">{t.n}</span>
              </Link></li>
            ))}</ul>
          )}
        </Panel>
        <div className="[&>section]:mb-0"><MdtDutyPanel /></div>
      </div>
    </div>
  );
}

/** Lage aus der Leitstelle: Kennzahlen, offene Einsätze, Einheiten. */
function CadLage({ todoTotal }: { todoTotal: number }) {
  useCadLive();
  const q = useQuery({ queryKey: ['cad-overview'], queryFn: () => api<CadOverview>('/cad/overview'), refetchInterval: 5_000 });
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data, cfg = d.config;
  const top = d.incidents.filter((i) => i.priority === cfg.priorities[0]?.key).length;
  const operational = d.units.filter((u) => u.operational);
  const ready = operational.filter((u) => u.status === cfg.unitStatuses[0]?.key);
  // höchste Priorität zuerst, dann die neuesten
  const prioIndex = (p: string) => { const i = cfg.priorities.findIndex((x) => x.key === p); return i < 0 ? 99 : i; };
  const incidents = [...d.incidents].sort((a, b) => prioIndex(a.priority) - prioIndex(b.priority) || b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Offene Einsätze" value={d.incidents.length} hint={d.incidents.length ? `davon ${top} mit höchster Priorität` : 'alles ruhig'} to="/cad/incidents" tone={top ? 'alarm' : 'neutral'} />
        <StatTile label="Einheiten im Dienst" value={operational.length} hint={`${ready.length} einsatzbereit`} to="/cad/units" />
        <StatTile label="Offene Notrufe" value={d.calls.length} hint={d.calls.length ? `ältester ${ago(d.calls[d.calls.length - 1]!.startedAt)}` : 'keine'} to="/cad/calls" tone={d.calls.length ? 'warn' : 'neutral'} />
        <StatTile label="Für dich zu erledigen" value={todoTotal} hint={todoTotal ? 'siehe Liste unten' : 'alles erledigt'} />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="Offene Einsätze" className="xl:col-span-3" actions={<Link to="/cad/incidents" className="text-[13px] font-semibold text-primary hover:underline">Zur Leitstelle</Link>}>
          {!incidents.length ? <p className="py-4 text-center text-sm text-muted">Keine offenen Einsätze.</p> : (
            <div className="grid gap-2">{incidents.slice(0, 4).map((i) => <IncidentCard key={i.id} inc={i} cfg={cfg} to={`/cad/incidents?id=${i.id}`} />)}
              {incidents.length > 4 && <Link to="/cad/incidents" className="text-center text-[13px] font-semibold text-primary hover:underline">{incidents.length - 4} weitere Einsätze</Link>}
            </div>
          )}
        </Panel>
        <Panel title="Einheiten" className="xl:col-span-2" flush actions={<span className="text-xs text-muted">{operational.length} im Dienst</span>}>
          {!d.units.length ? <p className="px-4 py-6 text-center text-sm text-muted">Keine Einheiten angelegt.</p> : (
            <ul>{[...d.units].sort((a, b) => Number(b.operational) - Number(a.operational)).slice(0, 8).map((u) => <UnitRow key={u.id} unit={u} cfg={cfg} />)}</ul>
          )}
        </Panel>
      </div>
    </>
  );
}
