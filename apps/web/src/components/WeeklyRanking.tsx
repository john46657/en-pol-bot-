import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { errText } from '../lib/tickets';
import { ChannelPicker } from './DiscordPickers';
import { Toggle } from './ApplicationSettings';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, Select, SkeletonRows } from './ui';

export interface WeeklyResetConfig { enabled: boolean; channelId: string | null; topN: number; mention: boolean }
interface RankRow { place: number; userId: string; name: string; rank: string | null; callsign: string | null; minutes: number; breakMinutes: number; sessions: number }
interface CurrentWeek {
  enabled: boolean; timezone: string; weekStart: string; weekKey: string; label: string; nextResetAt: string | null; overdue: boolean; lastResetAt: string | null;
  lastArchive: { id: string; label: string; createdAt: string; discordChannelId: string | null; catchUp: boolean } | null; totalMinutes: number; users: RankRow[];
}
interface ArchiveRow { id: string; weekKey: string; label: string; weekStart: string; weekEnd: string; totalMinutes: number; activeUsers: number; shiftCount: number; ranking: RankRow[]; discordChannelId: string | null; catchUp: boolean; createdAt: string }

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
const MEDALS = ['🥇', '🥈', '🥉'];
/** „Mo, 19.10.2026, 00:00“ in der Zeitzone des Resets */
const at = (iso: string, timeZone: string) => new Date(iso).toLocaleString('de-DE', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Ranking({ rows }: { rows: RankRow[] }) {
  if (!rows.length) return <EmptyState text="In dieser Woche war noch niemand im Dienst." />;
  return (
    <div className="table-scroll">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted"><tr><th className="p-2">Platz</th><th className="p-2">Beamter</th><th className="p-2">Dienstzeit</th><th className="p-2">Pause</th><th className="p-2">Sitzungen</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.userId} className="border-t border-line">
            <td className="p-2">{MEDALS[r.place - 1] ?? `${r.place}.`}</td>
            <td className="p-2 font-medium">{r.name}{r.callsign && <span className="ml-1 text-xs text-muted">({r.callsign})</span>}</td>
            <td className="p-2 font-semibold">{hm(r.minutes)}</td>
            <td className="p-2 text-muted">{r.breakMinutes ? hm(r.breakMinutes) : '—'}</td>
            <td className="p-2 text-muted">{r.sessions}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Team-Seite: Wochenzähler seit Montag 00:00, nächster Reset und abgeschlossene Wochen (Archiv, wird nie gelöscht). */
export function WeeklyRanking() {
  useRealtime('team', ['duty.week.reset', 'duty.changed'], [['duty-week'], ['duty-week-archives']]);
  const q = useQuery({ queryKey: ['duty-week'], queryFn: () => api<CurrentWeek>('/team/week'), refetchInterval: 60_000 });
  const archives = useQuery({ queryKey: ['duty-week-archives'], queryFn: () => api<ArchiveRow[]>('/team/week/archives') });
  const [sel, setSel] = useState('');
  const shown = sel ? archives.data?.find((a) => a.id === sel) : undefined;
  const w = q.data;
  return (
    <Card className="mt-4" title={<span className="flex items-center gap-2"><Trophy size={16} aria-hidden />Wochenrangliste</span>}
      actions={<div className="w-56"><Select aria-label="Woche" className="w-auto py-1 text-xs" value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">Laufende Woche</option>{(archives.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </Select></div>}>
      {q.isLoading ? <SkeletonRows rows={3} /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !w ? null : shown ? (
        <>
          <p className="mb-2 text-xs text-muted">{shown.label} · {hm(shown.totalMinutes)} gesamt · {shown.activeUsers} Beamte · archiviert {fmt(shown.createdAt)}{shown.catchUp && ' (nachgeholt)'} · {shown.discordChannelId ? 'in Discord veröffentlicht' : 'nicht in Discord veröffentlicht'}</p>
          <Ranking rows={shown.ranking} />
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-medium">{w.label}</span>
            <span className="text-muted">{hm(w.totalMinutes)} gesamt</span>
            <span className="flex items-center gap-1" title={`Zeitzone ${w.timezone}, Sommer-/Winterzeit automatisch`}>
              <CalendarClock size={14} aria-hidden />
              {w.nextResetAt ? <>Nächster Reset: <b>{at(w.nextResetAt, w.timezone)}</b>{w.overdue && <Badge tone="warning">wird nachgeholt</Badge>}</> : <span className="text-muted">Wochen-Reset ist aus</span>}
            </span>
          </div>
          <Ranking rows={w.users} />
          <p className="mt-2 text-xs text-muted">Zählt Dienstzeit ab Montag 00:00 ({w.timezone}); Pausen zählen nicht. Beim Reset wird die Woche archiviert und die Rangliste in Discord veröffentlicht – Schichten und Dienstzeiten bleiben vollständig erhalten.{w.lastArchive && ` Letzter Reset: ${w.lastArchive.label}.`}</p>
        </>
      )}
    </Card>
  );
}

/** Admin → Schichten: Einstellungen des automatischen Wochen-Resets. */
export function WeeklyResetSettings({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['duty-week-config'], queryFn: () => api<WeeklyResetConfig>('/team/week/config') });
  const week = useQuery({ queryKey: ['duty-week'], queryFn: () => api<CurrentWeek>('/team/week') });
  const [c, setC] = useState<WeeklyResetConfig>();
  useEffect(() => { if (q.data) setC(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: (v: WeeklyResetConfig) => api<WeeklyResetConfig>('/team/week/config', { method: 'PUT', body: v }),
    onSuccess: (r) => { qc.setQueryData(['duty-week-config'], r); void qc.invalidateQueries({ queryKey: ['duty-week'] }); },
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!c || !q.data) return <SkeletonRows rows={2} />;
  const dirty = JSON.stringify(c) !== JSON.stringify(q.data);
  return (
    <Card className="mt-4" title={<span className="flex items-center gap-2"><Trophy size={16} aria-hidden />Automatischer Wochen-Reset</span>} actions={manage && dirty && <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(c)}>Speichern</Button>}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid content-start gap-2 rounded-lg border border-line bg-panel-2/40 p-3">
          <p className="font-semibold">Wochen-Reset</p>
          <p className="text-xs text-muted">Jeden Montag 00:00 (Europe/Berlin, Sommer-/Winterzeit automatisch): Woche archivieren, Rangliste veröffentlichen, dann Wochenzähler zurücksetzen.</p>
          <div className="flex items-center gap-2">{manage ? <Toggle label="Wochen-Reset aktiv" checked={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} /> : <Badge tone={c.enabled ? 'success' : 'neutral'}>{c.enabled ? 'An' : 'Aus'}</Badge>}<span className="text-sm">{c.enabled ? 'An' : 'Aus'}</span></div>
          {week.data?.nextResetAt && <p className="text-sm">Nächster Reset: <b>{at(week.data.nextResetAt, week.data.timezone)}</b></p>}
        </div>
        <div className="grid content-start gap-2 rounded-lg border border-line bg-panel-2/40 p-3">
          <p className="font-semibold">Discord-Kanal der Rangliste</p>
          <p className="text-xs text-muted">Leer = Dienst-Kanal aus den Einstellungen. Ohne Kanal wird nur archiviert.</p>
          <ChannelPicker ariaLabel="Kanal der Wochenrangliste" value={c.channelId} disabled={!manage} onChange={(id) => setC({ ...c, channelId: id })} />
        </div>
        <div className="grid content-start gap-2 rounded-lg border border-line bg-panel-2/40 p-3">
          <p className="font-semibold">Plätze in der Rangliste</p>
          <div className="flex items-center gap-2"><Input aria-label="Plätze in der Rangliste" type="number" min={1} max={25} disabled={!manage} className="w-24" value={c.topN} onChange={(e) => setC({ ...c, topN: Math.max(1, Math.min(25, Math.floor(Number(e.target.value) || 1))) })} /><span className="text-sm text-muted">(1–25)</span></div>
        </div>
        <div className="grid content-start gap-2 rounded-lg border border-line bg-panel-2/40 p-3">
          <p className="font-semibold">Beamte erwähnen</p>
          <p className="text-xs text-muted">Verknüpfte Beamte erscheinen als @Erwähnung (ohne Ping).</p>
          {manage ? <Toggle label="Beamte erwähnen" checked={c.mention} onChange={(v) => setC({ ...c, mention: v })} /> : <Badge tone={c.mention ? 'success' : 'neutral'}>{c.mention ? 'An' : 'Aus'}</Badge>}
        </div>
      </div>
      {save.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(save.error)}</p>}
      <p className="mt-2 text-xs text-muted">Der Reset setzt nur den Wochenzähler zurück. Schichten, Dienstzeiten und Wochenarchive werden nie gelöscht. Verpasste Resets (z. B. nach einem Neustart) werden einmalig nachgeholt – ohne doppelte Archive oder Discord-Nachrichten.</p>
    </Card>
  );
}
