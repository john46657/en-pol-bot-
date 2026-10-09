import { ScrollText, BellRing, GraduationCap, PanelTop, MapPinned, RadioTower, Palette, CalendarOff, LifeBuoy, Monitor, BarChart3, Car, ClipboardList, FileText, Fingerprint, Flag, LayoutDashboard, Search, Settings, UserCheck, Users, Wrench, type LucideIcon } from 'lucide-react';

/** Reiter eines zusammengefassten Menüpunkts: eigene Seite mit eigenem Recht. */
export interface NavTab { path: string; label: string; perm?: string; area?: string }
/**
 * `area`: Bereichs-Sichtbarkeit (dashboard.<bereich>.view) – ohne sie erscheint der Menüpunkt nicht, auch mit Modul-Recht.
 * `tabs`: mehrere Seiten unter einem Menüpunkt; sichtbar, wenn mindestens ein Reiter erlaubt ist. Der Menüpunkt führt
 * zum ersten erlaubten Reiter, oben auf der Seite erscheint die Reiterleiste.
 */
export interface NavItem { path: string; label: string; icon: LucideIcon; perm?: string; area?: string; tabs?: NavTab[]; group: 'Operations' | 'Records' | 'Organisation' | 'Administration' }

const grp = (label: string, icon: LucideIcon, group: NavItem['group'], tabs: NavTab[]): NavItem => ({ path: tabs[0]!.path, label, icon, group, tabs });

export const NAV: NavItem[] = [
  { path: '/mdt', label: 'MDT', icon: Monitor, perm: 'dashboard.view', group: 'Operations' },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view', group: 'Operations' },
  grp('Leitstelle', MapPinned, 'Operations', [
    { path: '/cad', label: 'CAD-Leitstelle', perm: 'cad.view', area: 'dashboard.cad.view' },
    { path: '/incidents', label: 'Einsätze', perm: 'incidents.view' },
  ]),
  grp('Team', Users, 'Operations', [
    { path: '/team', label: 'Team', perm: 'team.view', area: 'dashboard.team.view' },
    { path: '/teamlist', label: 'Teamliste', perm: 'team.view', area: 'dashboard.team.view' },
    { path: '/staff-lists', label: 'Staff-Liste (Discord)', perm: 'team.view', area: 'dashboard.team.view' },
    { path: '/offices', label: 'Büros', perm: 'team.view', area: 'dashboard.offices.view' },
  ]),
  { path: '/radio-codes', label: 'Funk-Codes', icon: RadioTower, perm: 'radio.view', area: 'dashboard.radio.view', group: 'Operations' },
  { path: '/support-tickets', label: 'Support-Tickets', icon: LifeBuoy, perm: 'ticket.view', area: 'dashboard.tickets.view', group: 'Operations' },
  { path: '/persons', label: 'Personen', icon: Fingerprint, perm: 'persons.view', group: 'Records' },
  { path: '/vehicles', label: 'Fahrzeuge', icon: Car, perm: 'vehicles.view', group: 'Records' },
  grp('Berichte', FileText, 'Records', [
    { path: '/reports', label: '📄 Einsatzberichte', perm: 'reports.view' },
    { path: '/duty-reports', label: '🗓️ Tages-/Wochenberichte', perm: 'dutyreports.view' },
  ]),
  { path: '/investigations', label: 'Ermittlungen', icon: Search, perm: 'investigations.view', group: 'Records' },
  { path: '/wanted', label: 'Fahndungen', icon: Flag, perm: 'wanted.view', group: 'Records' },
  grp('Personal', UserCheck, 'Organisation', [
    { path: '/personnel', label: 'Personal', perm: 'personnel.view' },
    { path: '/warnings', label: 'Verwarnungen', perm: 'warning.view' },
    { path: '/promotions', label: 'Beförderungen', perm: 'promotion.view' },
    { path: '/service-numbers', label: 'Dienstnummern', perm: 'dienstnummer.view' },
  ]),
  grp('Ausbildung', GraduationCap, 'Organisation', [
    { path: '/trainings', label: 'Ausbildungen & Prüfungen', perm: 'training.view' },
    { path: '/academy', label: 'Akademie', perm: 'academy.view' },
  ]),
  grp('Bewerbungen', ClipboardList, 'Organisation', [
    { path: '/applications', label: 'Bewerbungen', perm: 'applications.view', area: 'dashboard.applications.view' },
    { path: '/application-bans', label: '⛔ Sperren', perm: 'applications.view', area: 'dashboard.applications.view' },
    { path: '/qualifications', label: 'Qualifikationen', perm: 'qualifications.view', area: 'dashboard.applications.view' },
    { path: '/teamchance', label: 'Team-Chance', perm: 'teamchance.view', area: 'dashboard.teamchance.view' },
  ]),
  { path: '/announcements', label: 'Meldungen & Abstimmungen', icon: BellRing, perm: 'announcements.view', group: 'Organisation' },
  { path: '/leave', label: 'Abmeldungen', icon: CalendarOff, perm: 'leave.request', group: 'Organisation' },
  { path: '/analytics', label: 'Statistiken', icon: BarChart3, perm: 'analytics.view', group: 'Organisation' },
  grp('Benutzer & Rollen', Users, 'Administration', [
    { path: '/admin/users', label: 'Benutzer', perm: 'users.view', area: 'dashboard.settings.view' },
    { path: '/admin/roles', label: 'Rollen & Rechte', perm: 'roles.view', area: 'dashboard.settings.view' },
  ]),
  grp('Einstellungen', Settings, 'Administration', [
    { path: '/admin/settings', label: 'Allgemein', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/legal-codes', label: 'Tatbestände', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/shifts', label: 'Schichten', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/servers', label: 'Server-Verbund', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/personnel', label: 'Personal', perm: 'promotion.manage_settings', area: 'dashboard.settings.view' },
    { path: '/admin/leave', label: 'Abmeldungen', perm: 'settings.view', area: 'dashboard.settings.view' },
  ]),
  grp('Discord-Nachrichten', PanelTop, 'Administration', [
    { path: '/admin/embeds', label: 'Embeds', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/form-panels', label: 'Formular-Panels', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/info-panels', label: 'Info-Panels', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/welcome', label: 'Willkommen & Abschied', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/danger-level', label: 'Gefahrenstatus', perm: 'settings.manage', area: 'dashboard.settings.view' },
  ]),
  grp('Protokolle & Backups', ScrollText, 'Administration', [
    { path: '/admin/audit', label: 'Audit-Logs', perm: 'audit.view', area: 'dashboard.logs.view' },
    { path: '/admin/logging', label: 'Logging (Discord)', perm: 'settings.view', area: 'dashboard.settings.view' },
    { path: '/admin/backups', label: 'Backups', perm: 'settings.manage', area: 'dashboard.settings.view' },
  ]),
  { path: '/admin/studio', label: 'Studio', icon: Wrench, perm: 'studio.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/me/settings', label: 'Persönlich', icon: Palette, perm: 'dashboard.view', group: 'Administration' },
];
type Can = (p: string) => boolean;
/** Sichtbar = Modul-Recht und (falls gesetzt) Bereichs-Recht. Nur Komfort – die API prüft selbst. */
const allowed = (n: { perm?: string; area?: string }, can: Can) => (!n.perm || can(n.perm)) && (!n.area || can(n.area));
export const visibleTabs = (n: NavItem, can: Can) => (n.tabs ?? []).filter((t) => allowed(t, can));
export const visible = (n: NavItem, can: Can) => (n.tabs ? visibleTabs(n, can).length > 0 : allowed(n, can));
/** Ziel des Menüpunkts: bei Reitern der erste erlaubte. */
export const href = (n: NavItem, can: Can) => (n.tabs ? visibleTabs(n, can)[0]?.path ?? n.path : n.path);
const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`);
/** Gehört die aktuelle Seite zu diesem Menüpunkt (auch Unterseiten und Reiter)? */
export const isActive = (n: NavItem, pathname: string) => (n.tabs ? n.tabs.map((t) => t.path) : [n.path]).some((p) => under(pathname, p));
/** Menüpunkt zu einem (auch alten) Pfad, z. B. für gespeicherte Favoriten. */
export const navFor = (items: NavItem[], path: string) => items.find((n) => n.path === path || n.tabs?.some((t) => t.path === path));
/** Zusammengefasster Menüpunkt, zu dem die aktuelle Seite gehört (für die Reiterleiste). */
export const sectionFor = (pathname: string) => NAV.find((n) => n.tabs && isActive(n, pathname));
export const GROUPS = ['Operations', 'Records', 'Organisation', 'Administration'] as const;

/** Deutsche Gruppennamen. Menünamen sind direkt deutsch; das Dashboard ist vollständig deutsch. */
const DE: Record<string, string> = { Operations: 'Betrieb', Records: 'Akten', Organisation: 'Organisation', Administration: 'Verwaltung' };
// `lang` bleibt aus Kompatibilitätsgründen – es wird immer Deutsch ausgegeben.
export const tr = (text: string, _lang?: string) => DE[text] ?? text;
