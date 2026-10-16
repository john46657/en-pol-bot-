import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

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
  // Mitteilungen, die man noch bestätigen muss (dieselbe Liste wie die Seite; ohne „alle“ nur aktuelle)
  const ann = useQuery({ queryKey: ['hr-announcements', false], queryFn: () => api<{ requireAck: boolean; readAt: string | null; publishAt: string }[]>('/hr/announcements'), enabled: !!user && can('announcements.view'), ...opts });
  return {
    '/announcements': (ann.data ?? []).filter((a) => a.requireAck && !a.readAt && new Date(a.publishAt).getTime() <= Date.now()).length,
    '/support-tickets': total(tickets.data),
    '/applications': total(apps.data),
    '/leave': leave.data?.items.length ?? 0,
    '/reports': total(reports.data),
    '/promotions': (promos.data?.byStatus ?? []).filter((s) => s.status === 'OPEN' || s.status === 'IN_REVIEW').reduce((a, s) => a + s.count, 0),
  };
}

/** Summe der Zähler eines Menüpunkts (bei zusammengefassten Punkten über alle erlaubten Reiter). */
export const badgeFor = (badges: Record<string, number>, paths: string[]) => paths.reduce((a, p) => a + (badges[p] ?? 0), 0);
