import { Headphones, DoorOpen, MapPinned, Building2, Megaphone, RadioTower, Contact, Palette, CalendarOff, Clock, LifeBuoy, Monitor, BarChart3, BookOpen, Briefcase, Award, Car, ClipboardList, Crosshair, FileText, Fingerprint, Flag, Gavel, LayoutDashboard, MessageSquare, Radio, Scale, Search, Settings, Shield, Siren, Ticket, UserCheck, Users, Wrench, type LucideIcon } from 'lucide-react';

/** `area`: Bereichs-Sichtbarkeit (dashboard.<bereich>.view) – ohne sie erscheint der Menüpunkt nicht, auch mit Modul-Recht. */
export interface NavItem { path: string; label: string; icon: LucideIcon; perm?: string; area?: string; group: 'Operations' | 'Records' | 'Organisation' | 'Administration' }

export const NAV: NavItem[] = [
  { path: '/mdt', label: 'MDT', icon: Monitor, perm: 'dashboard.view', group: 'Operations' },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view', group: 'Operations' },
  { path: '/cad', label: 'CAD-Leitstelle', icon: MapPinned, perm: 'cad.view', area: 'dashboard.cad.view', group: 'Operations' },
  { path: '/dispatch', label: 'Leitstelle (klassisch)', icon: Radio, perm: 'dispatch.view', group: 'Operations' },
  { path: '/incidents', label: 'Einsätze', icon: Siren, perm: 'incidents.view', group: 'Operations' },
  { path: '/team', label: 'Team', icon: Users, perm: 'team.view', area: 'dashboard.team.view', group: 'Operations' },
  { path: '/teamlist', label: 'Teamliste', icon: Contact, perm: 'team.view', area: 'dashboard.team.view', group: 'Operations' },
  { path: '/offices', label: 'Büros', icon: Building2, perm: 'team.view', area: 'dashboard.offices.view', group: 'Operations' },
  { path: '/radio-codes', label: 'Funk-Codes', icon: RadioTower, perm: 'radio.view', area: 'dashboard.radio.view', group: 'Operations' },
  { path: '/communication', label: 'Kommunikation', icon: MessageSquare, perm: 'communication.view', group: 'Operations' },
  { path: '/support-tickets', label: 'Support-Tickets', icon: LifeBuoy, perm: 'ticket.view', area: 'dashboard.tickets.view', group: 'Operations' },
  { path: '/voice-support', label: 'Sprach-Support', icon: Headphones, perm: 'ticket.view', area: 'dashboard.tickets.view', group: 'Operations' },
  { path: '/persons', label: 'Personen', icon: Fingerprint, perm: 'persons.view', group: 'Records' },
  { path: '/vehicles', label: 'Fahrzeuge', icon: Car, perm: 'vehicles.view', group: 'Records' },
  { path: '/reports', label: 'Berichte', icon: FileText, perm: 'reports.view', group: 'Records' },
  { path: '/tickets', label: 'Strafzettel', icon: Ticket, perm: 'tickets.view', group: 'Records' },
  { path: '/complaints', label: 'Beschwerden', icon: Scale, perm: 'complaints.view', group: 'Records' },
  { path: '/investigations', label: 'Ermittlungen', icon: Search, perm: 'investigations.view', group: 'Records' },
  { path: '/wanted', label: 'Fahndungen', icon: Flag, perm: 'wanted.view', group: 'Records' },
  { path: '/evidence', label: 'Beweismittel', icon: Briefcase, perm: 'evidence.view', group: 'Records' },
  { path: '/personnel', label: 'Personal', icon: UserCheck, perm: 'personnel.view', group: 'Organisation' },
  { path: '/applications', label: 'Bewerbungen', icon: ClipboardList, perm: 'applications.view', area: 'dashboard.applications.view', group: 'Organisation' },
  { path: '/qualifications', label: 'Qualifikationen', icon: Award, perm: 'qualifications.view', area: 'dashboard.applications.view', group: 'Organisation' },
  { path: '/teamchance', label: 'Team-Chance', icon: Megaphone, perm: 'teamchance.view', area: 'dashboard.teamchance.view', group: 'Organisation' },
  { path: '/leave', label: 'Abmeldungen', icon: CalendarOff, perm: 'leave.request', group: 'Organisation' },
  { path: '/sek', label: 'SEK', icon: Crosshair, perm: 'team.view', area: 'dashboard.team.view', group: 'Organisation' },
  { path: '/academy', label: 'Akademie', icon: BookOpen, perm: 'academy.view', group: 'Organisation' },
  { path: '/analytics', label: 'Statistiken', icon: BarChart3, perm: 'analytics.view', group: 'Organisation' },
  { path: '/admin/users', label: 'Benutzer', icon: Users, perm: 'users.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/roles', label: 'Rollen & Rechte', icon: Shield, perm: 'roles.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/audit', label: 'Audit-Logs', icon: Gavel, perm: 'audit.view', area: 'dashboard.logs.view', group: 'Administration' },
  { path: '/admin/legal-codes', label: 'Tatbestände', icon: Scale, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/settings', label: 'Einstellungen', icon: Settings, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/shifts', label: 'Schichten', icon: Clock, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/welcome', label: 'Willkommen & Abschied', icon: DoorOpen, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/leave', label: 'Abmeldungen (Einrichtung)', icon: CalendarOff, perm: 'settings.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/admin/studio', label: 'Studio', icon: Wrench, perm: 'studio.view', area: 'dashboard.settings.view', group: 'Administration' },
  { path: '/me/settings', label: 'Persönlich', icon: Palette, perm: 'dashboard.view', group: 'Administration' },
];
/** Sichtbar = Modul-Recht und (falls gesetzt) Bereichs-Recht. Nur Komfort – die API prüft selbst. */
export const visible = (n: NavItem, can: (p: string) => boolean) => (!n.perm || can(n.perm)) && (!n.area || can(n.area));
export const GROUPS = ['Operations', 'Records', 'Organisation', 'Administration'] as const;

/** Deutsche Gruppennamen. Menünamen sind direkt deutsch; das Dashboard ist vollständig deutsch. */
const DE: Record<string, string> = { Operations: 'Betrieb', Records: 'Akten', Organisation: 'Organisation', Administration: 'Verwaltung' };
// `lang` bleibt aus Kompatibilitätsgründen – es wird immer Deutsch ausgegeben.
export const tr = (text: string, _lang?: string) => DE[text] ?? text;
