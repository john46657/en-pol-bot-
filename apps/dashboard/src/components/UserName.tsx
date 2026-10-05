import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '../api';

export interface NameInfo {
  name: string | null;
  username: string | null;
  rpName: string | null;
  avatarUrl: string | null;
  inGuild: boolean;
}

/** Sammelt alle Namensabfragen eines Moments (15 ms) zu einer Anfrage je Server (höchstens 100 IDs je Anfrage). */
const queues = new Map<string, Map<string, ((i: NameInfo | null) => void)[]>>();
function loadName(guildId: string, id: string): Promise<NameInfo | null> {
  return new Promise((resolve) => {
    let q = queues.get(guildId);
    if (!q) {
      q = new Map();
      queues.set(guildId, q);
      setTimeout(() => void flush(guildId), 15);
    }
    q.set(id, [...(q.get(id) ?? []), resolve]);
  });
}
async function flush(guildId: string) {
  const q = queues.get(guildId);
  queues.delete(guildId);
  if (!q) return;
  const ids = [...q.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data = await api<Record<string, NameInfo>>(`/guilds/${guildId}/discord/names?ids=${chunk.join(',')}`).catch(() => ({}) as Record<string, NameInfo>);
    for (const id of chunk) for (const r of q.get(id) ?? []) r(data[id] ?? null);
  }
}

/** Name zu einer Discord-ID (für Texte außerhalb von JSX, z. B. Bestätigungsfragen). */
export function useUserName(id: string | null | undefined): NameInfo | null | undefined {
  const { guildId = '' } = useParams();
  const valid = !!id && /^\d{5,25}$/.test(id);
  const q = useQuery({ queryKey: ['user-name', guildId, id], queryFn: () => loadName(guildId, id!), enabled: valid && !!guildId, staleTime: 10 * 60_000, gcTime: 30 * 60_000, retry: false });
  return valid ? q.data : null;
}

/**
 * Anzeige einer Person statt ihrer Discord-ID: RP-Name (falls Personalakte) bzw. Spitzname/Discord-Name; im Tooltip
 * @Benutzername und ID. `variant="discord"` zeigt immer den Discord-Namen (wenn der RP-Name schon daneben steht).
 * Bis zur Antwort – oder wenn Discord die Person nicht kennt – erscheint die ID.
 */
export function UserName({ id, variant = 'auto', avatar = false }: { id: string | null | undefined; variant?: 'auto' | 'discord'; avatar?: boolean }) {
  const info = useUserName(id);
  if (!id) return <span className="muted">–</span>;
  if (!info?.name) return <code title={info === null ? 'Unbekannt' : undefined}>{id}</code>;
  const label = variant === 'auto' && info.rpName ? info.rpName : info.name;
  const title = [variant === 'auto' && info.rpName ? info.name : null, info.username ? `@${info.username}` : null, id, info.inGuild ? null : 'nicht mehr auf dem Server'].filter(Boolean).join(' · ');
  return (
    <span className="user-name" title={title} data-user-id={id}>
      {avatar && info.avatarUrl && <img src={info.avatarUrl} alt="" width={16} height={16} style={{ borderRadius: '50%', verticalAlign: 'text-bottom', marginRight: 4 }} />}
      {label}
      {!info.inGuild && <small className="muted"> (ausgetreten)</small>}
    </span>
  );
}
