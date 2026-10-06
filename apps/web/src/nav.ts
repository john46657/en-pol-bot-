import { Monitor, BarChart3, BookOpen, Briefcase, Car, ClipboardList, Crosshair, FileText, Fingerprint, Flag, Gavel, LayoutDashboard, MessageSquare, Radio, Scale, Search, Settings, Shield, Siren, Ticket, UserCheck, Users, Wrench, type LucideIcon } from 'lucide-react';

export interface NavItem { path: string; label: string; icon: LucideIcon; perm?: string; group: 'Operations' | 'Records' | 'Organisation' | 'Administration' }

export const NAV: NavItem[] = [
  { path: '/mdt', label: 'MDT', icon: Monitor, perm: 'dashboard.view', group: 'Operations' },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view', group: 'Operations' },
  { path: '/dispatch', label: 'Dispatch', icon: Radio, perm: 'dispatch.view', group: 'Operations' },
  { path: '/incidents', label: 'Incidents', icon: Siren, perm: 'incidents.view', group: 'Operations' },
  { path: '/team', label: 'Team', icon: Users, perm: 'team.view', group: 'Operations' },
  { path: '/communication', label: 'Communication', icon: MessageSquare, perm: 'communication.view', group: 'Operations' },
  { path: '/persons', label: 'Persons', icon: Fingerprint, perm: 'persons.view', group: 'Records' },
  { path: '/vehicles', label: 'Vehicles', icon: Car, perm: 'vehicles.view', group: 'Records' },
  { path: '/reports', label: 'Reports', icon: FileText, perm: 'reports.view', group: 'Records' },
  { path: '/tickets', label: 'Tickets', icon: Ticket, perm: 'tickets.view', group: 'Records' },
  { path: '/complaints', label: 'Complaints', icon: Scale, perm: 'complaints.view', group: 'Records' },
  { path: '/investigations', label: 'Investigations', icon: Search, perm: 'investigations.view', group: 'Records' },
  { path: '/wanted', label: 'Wanted', icon: Flag, perm: 'wanted.view', group: 'Records' },
  { path: '/evidence', label: 'Evidence', icon: Briefcase, perm: 'evidence.view', group: 'Records' },
  { path: '/personnel', label: 'Personnel', icon: UserCheck, perm: 'personnel.view', group: 'Organisation' },
  { path: '/applications', label: 'Applications', icon: ClipboardList, perm: 'applications.view', group: 'Organisation' },
  { path: '/sek', label: 'SEK', icon: Crosshair, perm: 'team.view', group: 'Organisation' },
  { path: '/academy', label: 'Academy', icon: BookOpen, perm: 'academy.view', group: 'Organisation' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics.view', group: 'Organisation' },
  { path: '/admin/users', label: 'Users', icon: Users, perm: 'users.view', group: 'Administration' },
  { path: '/admin/roles', label: 'Roles & Permissions', icon: Shield, perm: 'roles.view', group: 'Administration' },
  { path: '/admin/audit', label: 'Audit', icon: Gavel, perm: 'audit.view', group: 'Administration' },
  { path: '/admin/legal-codes', label: 'Legal Codes', icon: Scale, perm: 'settings.view', group: 'Administration' },
  { path: '/admin/settings', label: 'Settings', icon: Settings, perm: 'settings.view', group: 'Administration' },
  { path: '/admin/studio', label: 'Studio', icon: Wrench, perm: 'studio.view', group: 'Administration' },
];
export const GROUPS = ['Operations', 'Records', 'Organisation', 'Administration'] as const;
