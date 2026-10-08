import { NavLink } from 'react-router';
import { useAuth } from '../lib/auth';

/** Umschalter zwischen Einsatzberichten und Tages-/Wochenberichten (ein gemeinsamer Menüpunkt „Berichte“). */
export function ReportTabs() {
  const { can } = useAuth();
  if (!can('reports.view') || !can('dutyreports.view')) return null;
  const tab = ({ isActive }: { isActive: boolean }) => `whitespace-nowrap border-b-2 px-3 py-2 text-sm ${isActive ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg'}`;
  return (
    <nav aria-label="Berichtsart" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      <NavLink to="/reports" end className={tab}>📄 Einsatzberichte</NavLink>
      <NavLink to="/duty-reports" className={tab}>🗓️ Tages-/Wochenberichte</NavLink>
    </nav>
  );
}
