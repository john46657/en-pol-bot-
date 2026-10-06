import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Hinweis, wenn für diese Art kein Discord-Channel eingestellt ist (dann wird nichts in Discord gepostet). */
export function DiscordChannelHint({ channel, what }: { channel: string; what: string }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['discord-channel-status'], queryFn: () => api<Record<string, boolean>>('/discord/channel-status'), staleTime: 60_000 });
  if (!q.data || q.data[channel] !== false) return null;
  return (
    <div role="note" className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm">
      ⚠️ Es ist kein Discord-Channel für {what} eingestellt – neue Einträge werden deshalb nicht in Discord gepostet.{' '}
      {can('settings.manage') ? <Link className="text-primary underline" to="/admin/settings">Jetzt in den Einstellungen festlegen</Link> : 'Bitte die Leitung, ihn in den Einstellungen festzulegen.'}
    </div>
  );
}
