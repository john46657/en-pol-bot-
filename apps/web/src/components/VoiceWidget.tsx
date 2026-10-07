import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Headphones, HeadphoneOff, Mic, MicOff, MonitorUp, Settings2 } from 'lucide-react';
import { api } from '../lib/api';
import { usePrefs } from '../lib/prefs';
import { useRealtime } from '../lib/realtime';
import { Avatar } from './TeamRoster';
import { Button, EmptyState, ErrorState, Select, SkeletonRows } from './ui';

interface VoiceMember { id: string; displayName: string; avatar: string | null; selfMute: boolean; selfDeaf: boolean; serverMute: boolean; serverDeaf: boolean; video: boolean; streaming: boolean; since: string | null }
interface VoiceChannel { id: string; guildId: string; name: string; parentId: string | null; parentName: string | null; position: number; members: VoiceMember[] }

const since = (iso: string | null) => {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

/** 🎙️ Aktive Sprachkanäle – vollständig getrennt von der Teamliste; Darstellung persönlich einstellbar. */
export function VoiceWidget() {
  useRealtime('team', ['team.voice'], [['team-voice']]);
  const q = useQuery({ queryKey: ['team-voice'], queryFn: () => api<{ channels: VoiceChannel[]; updatedAt: string | null }>('/team/voice'), refetchInterval: 5_000 });
  const { prefs, update } = usePrefs();
  const v = prefs.voice;
  const [setup, setSetup] = useState(false);
  const all = q.data?.channels ?? [];
  const categories = useMemo(() => [...new Map(all.filter((c) => c.parentId).map((c) => [c.parentId!, c.parentName ?? c.parentId!])).entries()], [all]);
  // Filter nur mit Kanälen/Kategorien, die es (noch) gibt – alte IDs (gelöscht, anderer Server) blenden sonst alles aus
  const channelFilter = useMemo(() => v.channelIds.filter((id) => all.some((c) => c.id === id)), [all, v.channelIds]);
  const categoryFilter = useMemo(() => v.categoryIds.filter((id) => all.some((c) => c.parentId === id)), [all, v.categoryIds]);
  const shown = useMemo(() => {
    let list = all.filter((c) => (v.showEmpty || c.members.length > 0) && (!channelFilter.length || channelFilter.includes(c.id)) && (!categoryFilter.length || (c.parentId && categoryFilter.includes(c.parentId))));
    list = [...list].sort((a, b) => (v.sort === 'name' ? a.name.localeCompare(b.name) : v.sort === 'position' ? a.position - b.position : b.members.length - a.members.length));
    return list.slice(0, v.maxChannels);
  }, [all, v, channelFilter, categoryFilter]);
  const people = all.reduce((n, c) => n + c.members.length, 0), busy = all.filter((c) => c.members.length).length;
  const hidden = all.reduce((n, c) => n + c.members.length, 0) - shown.reduce((n, c) => n + c.members.length, 0);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>{people} {people === 1 ? 'Person' : 'Personen'} in {busy} {busy === 1 ? 'Kanal' : 'Kanälen'}</span>
        <Button size="sm" variant="ghost" aria-expanded={setup} aria-label="Voice-Widget einstellen" onClick={() => setSetup(!setup)}><Settings2 size={14} /></Button>
      </div>
      {setup && (
        <div className="mb-3 space-y-2 rounded-md border border-line p-2 text-xs">
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1">Sortierung <Select className="w-auto py-1 text-xs" value={v.sort} onChange={(e) => update({ voice: { ...v, sort: e.target.value as typeof v.sort } })}><option value="members">Meiste Personen</option><option value="name">Name</option><option value="position">Discord-Reihenfolge</option></Select></label>
            <label className="flex items-center gap-1">Anzahl <Select className="w-auto py-1 text-xs" value={v.maxChannels} onChange={(e) => update({ voice: { ...v, maxChannels: Number(e.target.value) } })}>{[3, 5, 10, 20, 50].map((n) => <option key={n}>{n}</option>)}</Select></label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.compact} onChange={(e) => update({ voice: { ...v, compact: e.target.checked } })} />Kompakt</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!v.showEmpty} onChange={(e) => update({ voice: { ...v, showEmpty: e.target.checked } })} />Leere Kanäle</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={v.showDuration !== false} onChange={(e) => update({ voice: { ...v, showDuration: e.target.checked } })} />Aufenthaltsdauer</label>
          </div>
          {categories.length > 0 && <div><p className="mb-1 text-muted">Nur diese Kategorien (keine = alle)</p><div className="flex flex-wrap gap-1">{categories.map(([id, name]) => <button key={id} type="button" aria-pressed={v.categoryIds.includes(id)} onClick={() => update({ voice: { ...v, categoryIds: toggle(v.categoryIds, id) } })} className={`rounded border px-1.5 py-0.5 ${v.categoryIds.includes(id) ? 'border-primary bg-primary/15' : 'border-line'}`}>📁 {name}</button>)}</div></div>}
          {all.length > 0 && <div><p className="mb-1 text-muted">Nur diese Kanäle (keine = alle)</p><div className="flex max-h-24 flex-wrap gap-1 overflow-auto">{all.map((c) => <button key={c.id} type="button" aria-pressed={v.channelIds.includes(c.id)} onClick={() => update({ voice: { ...v, channelIds: toggle(v.channelIds, c.id) } })} className={`rounded border px-1.5 py-0.5 ${v.channelIds.includes(c.id) ? 'border-primary bg-primary/15' : 'border-line'}`}>🔊 {c.name}</button>)}</div></div>}
        </div>
      )}
      {hidden > 0 && !q.isLoading && (
        <p className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
          {hidden} {hidden === 1 ? 'Person ist' : 'Personen sind'} durch deine Filter bzw. die Anzahl ausgeblendet.
          <button type="button" className="underline" onClick={() => update({ voice: { ...v, channelIds: [], categoryIds: [], maxChannels: Math.max(v.maxChannels, 10) } })}>Filter zurücksetzen</button>
        </p>
      )}
      {q.isLoading ? <SkeletonRows rows={3} /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !shown.length ? <EmptyState text={hidden ? 'Keine passenden Sprachkanäle für deine Filter.' : 'Gerade ist niemand in einem Sprachkanal.'} hint={q.data?.updatedAt ? undefined : 'Der Bot hat noch keine Voice-Daten gemeldet.'} /> : (
        <ul className="space-y-3">{shown.map((c) => (
          <li key={c.id}>
            <p className="text-sm font-semibold">🔊 {c.name} <span className="font-normal text-muted">· {c.members.length} {c.members.length === 1 ? 'Person' : 'Personen'}</span>{c.parentName && <span className="ml-1 text-xs font-normal text-muted">({c.parentName})</span>}</p>
            {v.compact ? <p className="text-xs text-muted">{c.members.map((m) => m.displayName).join(', ') || '—'}</p> : (
              <ul className="mt-1 space-y-1">{c.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <Avatar src={m.avatar} name={m.displayName} size={22} />
                  <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                  <span className="flex shrink-0 items-center gap-1 text-muted">
                    {m.selfMute || m.serverMute ? <MicOff size={13} className="text-danger" aria-label="Mikrofon aus" /> : <Mic size={13} aria-label="Mikrofon an" />}
                    {m.selfDeaf || m.serverDeaf ? <HeadphoneOff size={13} className="text-danger" aria-label="Kopfhörer aus" /> : <Headphones size={13} aria-label="Kopfhörer an" />}
                    {m.video && <Camera size={13} className="text-success" aria-label="Kamera an" />}
                    {m.streaming && <MonitorUp size={13} className="text-primary" aria-label="Streamt" />}
                    {v.showDuration !== false && since(m.since) && <span className="text-[11px]">{since(m.since)}</span>}
                  </span>
                </li>))}</ul>
            )}
          </li>))}</ul>
      )}
    </div>
  );
}
