import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { LayoutGrid, RefreshCw, Search, Table2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { useRealtime } from '../lib/realtime';
import { Badge, Button, EmptyState, ErrorState, fmt, Input, Modal, Select, SkeletonRows } from './ui';

/** Teammitglied – bewusst ohne Voice-Daten (die stehen nur im Voice-Widget). */
export interface RosterMember {
  key: string; userId: string | null; discordId: string | null; name: string; username: string | null; avatar: string | null;
  team: string | null; rank: string | null; office: string | null; serviceNumber: string | null; callsign: string | null;
  status: 'online' | 'idle' | 'dnd' | 'offline' | 'unknown'; joinedAt: string | null; discordRoles: string[];
}
interface Roster { members: RosterMember[]; structure: { teams: string[]; ranks: string[]; offices: string[] }; discordUpdatedAt: string | null; generatedAt: string }

/** Verbindlich: spätestens alle 60 Sekunden neu laden (auch im Hintergrund-Tab). */
export const ROSTER_REFRESH_MS = 60_000;
export const STATUS: Record<RosterMember['status'], { dot: string; label: string }> = {
  online: { dot: '🟢', label: 'Online' }, idle: { dot: '🟡', label: 'Abwesend' }, dnd: { dot: '🔴', label: 'Nicht stören' }, offline: { dot: '⚫', label: 'Offline' }, unknown: { dot: '⚪', label: 'Unbekannt' },
};

export function useRoster() {
  useRealtime('team', ['team.roster'], [['team-roster']]);
  return useQuery({ queryKey: ['team-roster'], queryFn: () => api<Roster>('/team/roster'), refetchInterval: ROSTER_REFRESH_MS, refetchIntervalInBackground: true, staleTime: 15_000 });
}

export const Avatar = ({ src, name, size = 32 }: { src: string | null; name: string; size?: number }) => (src
  ? <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size }} loading="lazy" />
  : <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-primary/20 text-[11px] font-bold text-primary" style={{ width: size, height: size }}>{name.slice(0, 2).toUpperCase()}</span>);

/** Teamliste mit Suche, Filtern, Karten-/Tabellenansicht (persönlich gespeichert) und Profil. `compact` = Widget. */
export function TeamRoster({ compact = false, limit, initialOpen }: { compact?: boolean; limit?: number; initialOpen?: string }) {
  const q = useRoster();
  const qc = useQueryClient();
  const { prefs, update } = usePrefs();
  const tl = prefs.teamList;
  const [search, setSearch] = useState(tl.search ?? '');
  const [open, setOpen] = useState<string | undefined>(initialOpen);
  const f = tl.filters ?? {};
  const setFilter = (k: keyof NonNullable<typeof tl.filters>, v: string) => update({ teamList: { ...tl, filters: { ...f, [k]: v || undefined } } });
  const refresh = useMutation({ mutationFn: () => api<Roster>('/team/roster/refresh', { method: 'POST' }), onSuccess: (d) => { qc.setQueryData(['team-roster'], d); setTimeout(() => void qc.invalidateQueries({ queryKey: ['team-roster'] }), 3000); } });
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (q.data?.members ?? []).filter((m) =>
      (!f.team || m.team === f.team) && (!f.rank || m.rank === f.rank) && (!f.office || m.office === f.office) && (!f.status || m.status === f.status)
      && (!t || [m.name, m.username, m.serviceNumber, m.callsign, m.team, m.rank, m.office].some((v) => v?.toLowerCase().includes(t))));
  }, [q.data, search, f.team, f.rank, f.office, f.status]);
  const list = limit ? shown.slice(0, limit) : shown;
  const s = q.data?.structure;
  const online = (q.data?.members ?? []).filter((m) => m.status === 'online' || m.status === 'idle' || m.status === 'dnd').length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Teammitglied suchen" placeholder="🔍 Teammitglied suchen" className="py-1.5 pl-8 text-sm" value={search} onChange={(e) => { setSearch(e.target.value); update({ teamList: { ...tl, search: e.target.value } }); }} /></div>
        {!compact && s && <>
          <Select aria-label="Team" className="w-auto py-1.5 text-xs" value={f.team ?? ''} onChange={(e) => setFilter('team', e.target.value)}><option value="">Alle Teams</option>{s.teams.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select aria-label="Dienstgrad" className="w-auto py-1.5 text-xs" value={f.rank ?? ''} onChange={(e) => setFilter('rank', e.target.value)}><option value="">Alle Dienstgrade</option>{s.ranks.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select aria-label="Büro" className="w-auto py-1.5 text-xs" value={f.office ?? ''} onChange={(e) => setFilter('office', e.target.value)}><option value="">Alle Büros</option>{s.offices.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select aria-label="Online-Status" className="w-auto py-1.5 text-xs" value={f.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}><option value="">Jeder Status</option>{(Object.keys(STATUS) as RosterMember['status'][]).map((x) => <option key={x} value={x}>{STATUS[x].dot} {STATUS[x].label}</option>)}</Select>
        </>}
        <div className="flex rounded-md border border-line" role="group" aria-label="Ansicht">
          <Button size="sm" variant={tl.view === 'cards' ? 'secondary' : 'ghost'} aria-pressed={tl.view === 'cards'} aria-label="Kartenansicht" onClick={() => update({ teamList: { ...tl, view: 'cards' } })}><LayoutGrid size={14} /></Button>
          <Button size="sm" variant={tl.view === 'table' ? 'secondary' : 'ghost'} aria-pressed={tl.view === 'table'} aria-label="Tabellenansicht" onClick={() => update({ teamList: { ...tl, view: 'table' } })}><Table2 size={14} /></Button>
        </div>
        <Button size="sm" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw size={14} className={refresh.isPending || q.isFetching ? 'animate-spin' : undefined} />Jetzt aktualisieren</Button>
      </div>
      <p className="mb-2 text-xs text-muted">{q.data ? `${q.data.members.length} Mitglieder · ${online} online · Stand ${fmt(q.data.generatedAt)}${q.data.discordUpdatedAt ? '' : ' · Discord-Daten noch nicht gemeldet (Bot)'}` : ' '} · aktualisiert sich automatisch alle 60 s</p>
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !list.length ? <EmptyState text="Keine Teammitglieder gefunden." hint="Teammitglieder kommen aus den Personalakten und den Discord-Teamrollen." /> : tl.view === 'table' ? (
        <div className="table-scroll"><table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-2">Mitglied</th><th>Team</th><th>Dienstgrad</th><th>Büro</th><th>Status</th><th>Dienstnummer</th></tr></thead>
          <tbody>{list.map((m) => (
            <tr key={m.key} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2" onClick={() => setOpen(m.key)}>
              <td className="p-2"><span className="flex items-center gap-2"><Avatar src={m.avatar} name={m.name} size={24} /><span className="font-medium">{m.name}</span></span></td>
              <td>{m.team ?? '—'}</td><td>{m.rank ?? '—'}</td><td>{m.office ?? '—'}</td><td title={STATUS[m.status].label}>{STATUS[m.status].dot}</td><td>{m.serviceNumber ?? '—'}</td>
            </tr>))}</tbody>
        </table></div>
      ) : (
        <ul className={`grid gap-2 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>{list.map((m) => (
          <li key={m.key}><button type="button" onClick={() => setOpen(m.key)} className="flex w-full items-start gap-3 rounded-md border border-line bg-panel-2/40 p-2.5 text-left hover:border-primary">
            <Avatar src={m.avatar} name={m.name} size={36} />
            <span className="min-w-0 text-sm"><span className="block truncate font-medium">👤 {m.name}</span>
              {m.rank && <span className="block font-semibold">{m.rank}</span>}
              {m.team && <span className="block text-muted">{m.team}{m.office ? ` · ${m.office}` : ''}</span>}
              {m.serviceNumber && <span className="block text-xs text-muted">Dienstnummer: {m.serviceNumber}</span>}
              <span className="block text-xs">{STATUS[m.status].dot} {STATUS[m.status].label}</span></span>
          </button></li>))}</ul>
      )}
      {limit && shown.length > limit && <Link to="/teamlist" className="mt-2 block text-xs text-primary hover:underline">Alle {shown.length} anzeigen</Link>}
      {open && <MemberProfile id={open} onClose={() => setOpen(undefined)} />}
    </div>
  );
}

function MemberProfile({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['team-member', id], queryFn: () => api<RosterMember & { personnelId: string | null; detailed: boolean }>(`/team/roster/${encodeURIComponent(id)}`) });
  const m = q.data;
  return (
    <Modal open title={m?.name ?? 'Teammitglied'} onClose={onClose}>
      {q.isLoading ? <SkeletonRows rows={3} /> : q.error || !m ? <ErrorState error={q.error} /> : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3"><Avatar src={m.avatar} name={m.name} size={56} /><div><p className="text-base font-semibold">{m.name}</p>{m.username && <p className="text-muted">@{m.username}</p>}<p>{STATUS[m.status].dot} {STATUS[m.status].label}</p></div></div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {([['Team', m.team], ['Dienstgrad', m.rank], ['Büro', m.office], ['Dienstnummer', m.serviceNumber], ['Rufname', m.callsign], ...(m.detailed ? [['Discord-ID', m.discordId], ['Beitritt', m.joinedAt ? fmt(m.joinedAt) : null]] : [])] as [string, string | null][]).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd>{v ?? '—'}</dd></div>)}
          </dl>
          {m.detailed && m.discordRoles.length > 0 && <div><p className="mb-1 text-xs text-muted">Discord-Rollen</p><div className="flex flex-wrap gap-1">{m.discordRoles.map((r) => <Badge key={r}>{r}</Badge>)}</div></div>}
          {m.personnelId && can('personnel.view') && <Link className="text-primary hover:underline" to={`/personnel/${m.personnelId}`}>Personalakte öffnen</Link>}
        </div>
      )}
    </Modal>
  );
}
