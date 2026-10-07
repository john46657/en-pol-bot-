import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { Badge, Card, fmt } from './ui';

interface Server { id: string; name: string; status: string; lastSyncAt: string | null }
interface PersonRow { serverName: string; name: string; robloxUserId: string | null; team: string | null; callsign: string | null; wantedStars: number; personId: string | null }
interface VehicleRow { serverName: string; name: string; owner: string; plate: string | null; colorName: string | null; colorHex: string | null; vehicleId: string | null; ownerPersonId: string | null }

/**
 * „Gerade im Spiel“ aus der ER:LC-API über der Personen- bzw. Fahrzeugliste. Neue Spieler und Fahrzeuge mit Kennzeichen
 * übernimmt das System automatisch in Akte/Register; hier geht es per Klick direkt dorthin. Ohne ER:LC-Server unsichtbar.
 */
export function ErlcLiveCard({ kind }: { kind: 'persons' | 'vehicles' }) {
  const [open, setOpen] = useState(true);
  const q = useQuery({ queryKey: ['erlc-live', kind], queryFn: () => api<{ servers: Server[]; items: (PersonRow | VehicleRow)[] }>(`/erlc/live/${kind}`), refetchInterval: 5_000 });
  useRealtime('cad', ['erlc.snapshot', 'erlc.records'], [['erlc-live', kind], [kind]]);
  if (!q.data?.servers.length) return null;
  const items = q.data.items;
  const last = q.data.servers.map((s) => s.lastSyncAt).filter(Boolean).sort().pop();
  return (
    <Card className="mb-4" title={<button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-2">🎮 Gerade im Spiel (ER:LC) <Badge tone="info">{items.length}</Badge></button>}
      actions={<span className="text-xs text-muted">{q.data.servers.map((s) => `${s.name}: ${s.status === 'CONNECTED' ? 'verbunden' : s.status}`).join(' · ')}{last ? ` · Stand ${fmt(last)}` : ''}</span>}>
      {!open ? null : !items.length ? <p className="text-sm text-muted">{kind === 'persons' ? 'Gerade ist niemand auf dem Server.' : 'Gerade sind keine Fahrzeuge gespawnt.'}</p> : (
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {kind === 'persons' ? (items as PersonRow[]).map((p) => (
            <li key={`${p.serverName}-${p.robloxUserId ?? p.name}`} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-sm">
              {p.personId ? <Link className="font-medium text-primary hover:underline" to={`/persons/${p.personId}`}>{p.name}</Link> : <span className="font-medium">{p.name}</span>}
              {p.team && <span className="text-xs text-muted">{p.team}{p.callsign ? ` · ${p.callsign}` : ''}</span>}
              {p.wantedStars > 0 && <span title="Fahndungssterne" className="ml-auto text-xs text-warning">{'★'.repeat(Math.min(5, p.wantedStars))}</span>}
            </li>
          )) : (items as VehicleRow[]).map((v, i) => (
            <li key={`${v.serverName}-${v.plate ?? i}`} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-2 py-1.5 text-sm">
              {v.colorHex && <span aria-hidden className="h-3 w-3 rounded-full border border-line" style={{ background: `#${v.colorHex.replace('#', '')}` }} />}
              {v.vehicleId ? <Link className="font-medium text-primary hover:underline" to={`/vehicles/${v.vehicleId}`}>{v.name}</Link> : <span className="font-medium">{v.name}</span>}
              <code className="text-xs">{v.plate ?? 'ohne Kennzeichen'}</code>
              <span className="text-xs text-muted">👤 {v.ownerPersonId ? <Link className="hover:underline" to={`/persons/${v.ownerPersonId}`}>{v.owner}</Link> : v.owner}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">{kind === 'persons' ? 'Neue Spieler bekommen automatisch eine Personenakte (Roblox-Name + ID).' : 'Fahrzeuge mit Kennzeichen kommen automatisch ins Register – Modell, Farbe und Halter (über den Roblox-Namen).'}</p>
    </Card>
  );
}
