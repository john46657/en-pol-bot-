import { Building2, Megaphone, RadioTower, Contact, Palette, CalendarOff, Clock, LifeBuoy, Monitor, BarChart3, BookOpen, Briefcase, Award, Car, ClipboardList, Crosshair, FileText, Fingerprint, Flag, Gavel, LayoutDashboard, MessageSquare, Radio, Scale, Search, Settings, Shield, Siren, Ticket, UserCheck, Users, Wrench, type LucideIcon } from 'lucide-react';

/** `area`: Bereichs-Sichtbarkeit (dashboard.<bereich>.view) – ohne sie erscheint der Menüpunkt nicht, auch mit Modul-Recht. */
export interface NavItem { path: string; label: string; icon: LucideIcon; perm?: string; area?: string; group: 'Operations' | 'Records' | 'Organisation' | 'Administration' }

export const NAV: NavItem[] = [
  { path: '/mdt', label: 'MDT', icon: Monitor, perm: 'dashboard.view', group: 'Operations' },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view', group: 'Operations' },
  { path: '/dispatch', label: 'Dispatch', icon: Radio, perm: 'dispatch.view', group: 'Operations' },
  { path: '/incidents', label: 'Incidents', icon: Siren, perm: 'incidents.view', group: 'Operations' },
  { path: '/team', label: 'Team', icon: Users, perm: 'team.view', area: 'dashboard.team.view', group: 'Operations' },
  { path: '/teamlist', label: 'Team list', icon: Contact, perm: 'team.view', area: 'dashboard.team.view', group: 'Operations' },
  { path: '/offices', label: 'Offices', icon: Building2, perm: 'team.view', area: 'dashboard.offices.view', group: 'Operations' },
  { path: '/radio-codes', label: 'Radio codes', icon: RadioTower, perm: 'radio.view', area: 'dashboard.radio.view', group: 'Operations' },
  { path: '/communication', label: 'Communication', icon: MessageSquare, perm: 'communication.view', group: 'Operations' },
  { path: '/support-tickets', label: 'Support Tickets', icon: LifeBuoy, perm: 'ticket.view', area: 'dashboard.tickets.view', group: 'Operations' },
  { path: '/persons', label: 'Persons', icon: Fingerprint, perm: 'persons.view', group: 'Records' },
  { path: '/vehicles', label: 'Vehicles', icon: Car, perm: 'vehicles.view', group: 'Records' },
  { path: '/reports', label: 'Reports', icon: FileText, perm: 'reports.view', group: 'Records' },
  { path: '/tickets', label: 'Tickets', icon: Ticket, perm: 'tickets.view', group: 'Records' },
  { path: '/complaints', label: 'Complaints', icon: Scale, perm: 'complaints.view', group: 'Records' },
  { path: '/investigations', label: 'Investigations', icon: Search, perm: 'investigations.view', group: 'Records' },
  { path: '/wanted', label: 'Wanted', icon: Flag, perm: 'wanted.view', group: 'Records' },
  { path: '/evidence', label: 'Evidence', icon: Briefcase, perm: 'evidence.view', group: 'Records' },
  { path: '/personnel', label: 'Personnel', icon: UserCheck, perm: 'personnel.view', group: 'Organisation' },
  { path: '/applications', label: 'Applications', icon: ClipboardList, perm: 'applications.view', area: 'dashboard.applications.view', group: 'Organisation' },
  { path: '/qualifications', label: 'Qualifications', icon: Award, perm: 'qualifications.view', area: 'dashboard.applications.view', group: 'Organisation' },
  { path: '/teamchance', label: 'Team chance', icon: Megaphone, perm: 'teamchance.view', area: 'dashboard.teamchance.view', group: 'Organisation' },
  { path: '/leave', label: 'Leave', icon: CalendarOff, perm: 'leave.request', group: 'Organisation' },
  { path: '/sek', label: 'SEK', icon: Crosshair, perm: 'team.view', area: 'dashboard.team.view', group: 'Organisation' },
  { path: '/academy', label: 'Academy', icon: BookOpen, perm: 'academy.view', group: 'Organisation' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics.view', group: 'Organisation' },
  { path: '/admin/users', label: 'Users', icon: Users, perm: 'users.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/roles', label: 'Roles & Permissions', icon: Shield, perm: 'roles.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/audit', label: 'Audit', icon: Gavel, perm: 'audit.view', area: 'dashboard.logs.view', group: 'Administration' },
  { path: '/admin/legal-codes', label: 'Legal Codes', icon: Scale, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/settings', label: 'Settings', icon: Settings, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/shifts', label: 'Shifts', icon: Clock, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/leave', label: 'Leave of Absences', icon: CalendarOff, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/studio', label: 'Studio', icon: Wrench, perm: 'studio.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/me/settings', label: 'Personal', icon: Palette, perm: 'dashboard.view', group: 'Administration' },
];
/** Sichtbar = Modul-Recht und (falls gesetzt) Bereichs-Recht. Nur Komfort – die API prüft selbst. */
export const visible = (n: NavItem, can: (p: string) => boolean) => (!n.perm || can(n.perm)) && (!n.area || can(n.area));
export const GROUPS = ['Operations', 'Records', 'Organisation', 'Administration'] as const;

/** Deutsche Menünamen (Sprache unter Persönlich; Standard Deutsch). */
const DE: Record<string, string> = {
  Dispatch: 'Leitstelle', Incidents: 'Einsätze', 'Team list': 'Teamliste', Offices: 'Büros', 'Radio codes': 'Funk-Codes', Communication: 'Kommunikation',
  'Support Tickets': 'Support-Tickets', Persons: 'Personen', Vehicles: 'Fahrzeuge', Reports: 'Berichte', Tickets: 'Strafzettel', Complaints: 'Beschwerden',
  Investigations: 'Ermittlungen', Wanted: 'Fahndungen', Evidence: 'Beweismittel', Personnel: 'Personal', Applications: 'Bewerbungen', Qualifications: 'Qualifikationen',
  'Team chance': 'Team-Chance', Leave: 'Abmeldungen', Analytics: 'Statistiken', Users: 'Benutzer', 'Roles & Permissions': 'Rollen & Rechte', Audit: 'Audit-Logs',
  'Legal Codes': 'Tatbestände', Settings: 'Einstellungen', Shifts: 'Schichten', 'Leave of Absences': 'Abmeldungen (Einrichtung)', Personal: 'Persönlich',
  Operations: 'Betrieb', Records: 'Akten', Organisation: 'Organisation', Administration: 'Verwaltung',
};
export const tr = (text: string, lang: string) => (lang === 'en' ? text : DE[text] ?? text);
