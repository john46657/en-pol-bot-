import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { ExternalLink, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { Badge, Button } from './ui';

export interface RobloxProfile {
  id: string; name: string; displayName: string; description: string; created: string | null; isBanned: boolean;
  avatarUrl: string | null; profileUrl: string; person: { id: string; robloxUsername: string } | null;
}

/** Sieht die Eingabe wie ein Roblox-Name, eine Roblox-ID oder ein Profil-Link aus? */
export const looksLikeRoblox = (t: string) => /roblox\.com\/users\/\d+/i.test(t) || /^\d{1,19}$/.test(t) || /^@?[A-Za-z0-9_]{3,20}$/.test(t);

/**
 * Roblox-Konto zur Suche (Name oder ID): Avatar, Anzeigename, ID, Erstelldatum – und direkt die Akte öffnen oder anlegen.
 * Erscheint nur, wenn Roblox das Konto kennt.
 */
export function RobloxCard({ term, onNavigate }: { term: string; onNavigate?: () => void }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const enabled = can('persons.view') && looksLikeRoblox(term);
  const q = useQuery({ queryKey: ['roblox', term.toLowerCase()], queryFn: () => api<{ profile: RobloxProfile | null }>('/persons/roblox', { query: { q: term } }), enabled, staleTime: 5 * 60_000 });
  const create = useMutation({
    mutationFn: (p: RobloxProfile) => api<{ person: { id: string } }>('/persons', { method: 'POST', body: { robloxUsername: p.name, robloxUserId: p.id } }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['roblox'] }); onNavigate?.(); nav(`/persons/${r.person.id}`); },
  });
  const p = q.data?.profile;
  if (!enabled || !p) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel-2/50 p-3" aria-label="Roblox-Konto">
      {p.avatarUrl ? <img src={p.avatarUrl} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-md bg-bg" /> : <div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-bg text-lg font-bold text-muted">{p.name.slice(0, 2).toUpperCase()}</div>}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2"><Badge tone="primary">Roblox</Badge><span className="font-semibold">{p.displayName}</span><span className="text-sm text-muted">@{p.name}</span>{p.isBanned && <Badge tone="danger">Auf Roblox gesperrt</Badge>}</p>
        <p className="mt-0.5 text-xs text-muted">ID <span className="font-mono">{p.id}</span>{p.created && ` · Konto erstellt am ${new Date(p.created).toLocaleDateString()}`}</p>
        {p.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{p.description}</p>}
        {create.error && <p role="alert" className="mt-1 text-xs text-danger">{errText(create.error)}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {p.person ? <Link to={`/persons/${p.person.id}`} onClick={onNavigate} className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg">Personenakte öffnen</Link>
          : can('persons.create') && <Button size="sm" disabled={create.isPending} onClick={() => create.mutate(p)}><UserPlus size={14} aria-hidden />Personenakte anlegen</Button>}
        <a href={p.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-panel-2">Roblox-Profil<ExternalLink size={13} aria-hidden /></a>
      </div>
    </div>
  );
}
