import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { Car, ClipboardList, FileText, Fingerprint, Flag, LayoutDashboard, Settings, Siren, Smartphone, Truck, UserCheck, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { SkeletonRows } from '../../components/ui';
import { TabBar } from '../../components/AppShell';

interface Item { to: string; label: string; icon: LucideIcon; perm?: string; end?: boolean; external?: boolean }
/** Menü des MDT (wie ein Streifen-Terminal). Jeder Punkt erscheint nur mit dem passenden Recht. */
export const MDT_NAV: { group: string; items: Item[] }[] = [
  { group: 'Einsatz', items: [
    { to: '/mdt', label: 'Übersicht', icon: LayoutDashboard, end: true },
    { to: '/mdt/unit', label: 'Meine Einheit', icon: Smartphone, perm: 'cad.view' },
    { to: '/cad', label: 'Leitstelle (CAD)', icon: Siren, perm: 'cad.view', external: true },
  ] },
  { group: 'Akten', items: [
    { to: '/mdt/citizens', label: 'Bürger', icon: Fingerprint, perm: 'persons.view' },
    { to: '/mdt/vehicles', label: 'Fahrzeuge', icon: Car, perm: 'vehicles.view' },
    { to: '/mdt/warrants', label: 'Haftbefehle', icon: Flag, perm: 'wanted.view' },
    { to: '/mdt/fleet', label: 'Polizeifahrzeuge', icon: Truck, perm: 'fleet.view' },
  ] },
  { group: 'Vorgänge', items: [
    { to: '/mdt/reports', label: 'Berichte', icon: FileText, perm: 'reports.view' },
    { to: '/mdt/incidents', label: 'Einsätze', icon: ClipboardList, perm: 'incidents.view' },
  ] },
  { group: 'Dienststelle', items: [
    { to: '/mdt/roster', label: 'Dienstliste', icon: Users, perm: 'team.view' },
    { to: '/mdt/officers', label: 'Beamte', icon: UserCheck, perm: 'personnel.view' },
    { to: '/mdt/personnel', label: 'Personal & Qualifikationen', icon: Users, perm: 'team.view' },
    { to: '/mdt/settings', label: 'MDT-Einstellungen', icon: Settings, perm: 'settings.manage' },
  ] },
];

/**
 * Polizei-MDT als Bereich im Dashboard-Rahmen (gleiches Menü, gleiche Kopfzeile wie überall): Unterseiten als Reiter.
 * Jeder Reiter erscheint nur mit dem passenden Recht.
 */
export function MdtShell() {
  const { can } = useAuth();
  const tabs = MDT_NAV.flatMap((g) => g.items).filter((i) => !i.external && (!i.perm || can(i.perm))).map((i) => ({ to: i.to, label: i.label, end: i.end }));
  return (
    <>
      <TabBar label="MDT" tabs={tabs} />
      <Suspense fallback={<SkeletonRows />}><Outlet /></Suspense>
    </>
  );
}
