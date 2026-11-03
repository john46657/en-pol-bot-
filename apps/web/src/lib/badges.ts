import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import type { CadOverview } from './cad';

/**
 * Offene Vorgänge je Menüpfad (z. B. '/applications' → 3) für die Zähler in der Seitenleiste.
 * Nutzt dieselben Listen wie die Seiten (gleiche Sichtbarkeitsregeln) und fragt nur, was man bearbeiten darf.
 */
export function useNavBadges(): Record<string, number> {
  const { can, user } = useAuth();
  const opts = { staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: false } as const;
  const total = (r: { total?: number } | undefined) => r?.total ?? 0;
  const tickets = useQuery({ queryKey: ['badge', 'tickets'], queryFn: () => api<{ total: number }>('/support-tickets', { query: { kind: 'open', pageSize: 1 } }), enabled: !!user && can('ticket.view') && can('dashboard.tickets.view'), ...opts });
  const apps = useQuery({ queryKey: ['badge', 'apps'], queryFn: () => api<{ total: number }>('/applications', { query: { status: 'OPEN', pageSize: 1 } }), enabled: !!user && can('applications.review') && can('dashboard.applications.view'), ...opts });
  const leave = useQuery({ queryKey: ['badge', 'leave'], queryFn: () => api<{ items: unknown[] }>('/leave', { query: { status: 'PENDING' } }), enabled: !!user && can('leave.manage'), ...opts });
  const reports = useQuery({ queryKey: ['badge', 'reports'], queryFn: () => api<{ total: number }>('/reports', { query: { status: 'SUBMITTED', pageSize: 1 } }), enabled: !!user && can('reports.review'), ...opts });
  const promos = useQuery({ queryKey: ['badge', 'promotions'], queryFn: () => api<{ byStatus: { status: string; count: number }[] }>('/hr/requests/stats'), enabled: !!user && can('promotion.review'), ...opts });
  // offene ER:LC-Notrufe: als Alarm (rot) an der Leitstelle
  const calls = useQuery({ queryKey: ['cad-overview'], queryFn: () => api<CadOverview>('/cad/overview'), enabled: !!user && can('cad.view') && can('dashboard.cad.view'), ...opts, staleTime: 10_000, refetchInterval: 15_000 });
  return {
    '/support-tickets': total(tickets.data),
    '/applications': total(apps.data),
    '/leave': leave.data?.items.length ?? 0,
    '/reports': total(reports.data),
    '/cad': calls.data?.calls.length ?? 0,
    '/promotions': (promos.data?.byStatus ?? []).filter((s) => s.status === 'OPEN' || s.status === 'IN_REVIEW').reduce((a, s) => a + s.count, 0),
  };
}

/** Zähler, die einen Alarm bedeuten (rot statt neutral). */
export const ALARM_PATHS = ['/cad'];

/** Summe der Zähler eines Menüpunkts (bei zusammengefassten Punkten über alle erlaubten Reiter). */
export const badgeFor = (badges: Record<string, number>, paths: string[]) => paths.reduce((a, p) => a + (badges[p] ?? 0), 0);
