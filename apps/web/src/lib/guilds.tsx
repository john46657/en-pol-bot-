import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useOptionalAuth } from './auth';
import { getServer, setServer, subscribeServer } from './server';

/** Discord-Server des Bots mit Channels und Rollen (meldet der Bot automatisch). */
export interface GuildInfo {
  id: string; name: string; icon: string | null;
  channels: { id: string; name: string; type: 'text' | 'category' | 'voice' | 'other'; parentId: string | null; position: number }[];
  roles: { id: string; name: string; color: number; position: number }[];
}

export function useGuilds() {
  const auth = useOptionalAuth();
  return useQuery({ queryKey: ['discord-guilds'], queryFn: async () => { const r = await api<GuildInfo[]>('/discord/guilds'); return Array.isArray(r) ? r : []; }, staleTime: 60_000, enabled: !!auth?.can('dashboard.view') });
}
/** Name eines Servers (oder die ID, solange der Bot ihn noch nicht gemeldet hat). */
export const guildName = (guilds: GuildInfo[] | undefined, id: string | null | undefined) => (id ? guilds?.find((g) => g.id === id)?.name ?? id : null);

/** Kleines Server-Abzeichen (Icon + Name) – nur wenn der Bot auf mehreren Servern ist. */
export function GuildTag({ id }: { id: string | null | undefined }) {
  const g = useGuilds();
  if (!id || (g.data?.length ?? 0) < 2) return null;
  const info = g.data?.find((x) => x.id === id);
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-muted" title="Discord-Server">
      {info?.icon && <img src={info.icon} alt="" className="h-3.5 w-3.5 rounded-full" />}{info?.name ?? id}
    </span>
  );
}

// ---- Ausgewählter Server (Dropdown oben links) – gilt für alles: Rechte, Teamliste, Voice, Tickets, Bewerbungen, Einstellungen ----
export { setServer };
/** Gewählter Server ('' = alle Server). Ist der gespeicherte Server nicht mehr da, gilt „alle“. */
export function useServer(): [string, (id: string) => void] {
  const id = useSyncExternalStore(subscribeServer, getServer, getServer);
  const g = useGuilds();
  const valid = !id || !g.data || g.data.some((x) => x.id === id);
  return [valid ? id : '', setServer];
}
