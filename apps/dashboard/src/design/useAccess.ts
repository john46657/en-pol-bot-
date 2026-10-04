import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

/** Eigene Rechte/Rollen auf dem Server (gleicher Abruf wie im Layout – wird geteilt). */
export function useAccess(guildId: string) {
  const q = useQuery({
    queryKey: ['my-permissions', guildId],
    queryFn: () =>
      api<{
        guildAdmin: boolean;
        roleIds?: string[];
        permissions: string[];
        dashboardAccess: boolean;
      }>(`/auth/me/guilds/${guildId}/permissions`),
  });
  return {
    guildAdmin: q.data?.guildAdmin ?? false,
    roleIds: q.data?.roleIds ?? [],
    permissions: q.data?.permissions ?? [],
    loaded: !!q.data,
  };
}
