import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Clock, Music, Plus, Trash2, Upload } from 'lucide-react';
import { MUSIC_TRACKS, newVoiceRoom, VOICE_CASE_STATUS, WEEKDAYS, type SupportTime, type VoiceSupportRoom } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { GuildTag, useGuilds, useServer } from '../../lib/guilds';
import { useAutosaveDraft } from '../../lib/autosave';
import { ChannelPicker, ChannelsPicker, RolePicker } from '../../components/DiscordPickers';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, PageHeader, Select, SkeletonRows, Tabs } from '../../components/ui';

interface VoiceCase { id: string; number: string; roomName: string; guildId: string; userId: string; userName: string; status: keyof typeof VOICE_CASE_STATUS; claimedByName: string | null; closedByName: string | null; closeReason: string | null; messages: number; rating: number | null; createdAt: string; claimedAt: string | null; closedAt: string | null }
const TONE = { WAITING: 'warning', CLAIMED: 'success', DECLINED: 'danger', ABANDONED: 'neutral', CLOSED: 'neutral' } as const;

/** Feld mit Titel, Beschreibung und Pflicht-Stern – wie in den Raum-Einstellungen von GalaxyBot. */
function Row({ title, desc, required, children }: { title: string; desc: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <div><p className="font-semibold">{title}{required && <span className="text-danger"> *</span>}</p><p className="text-sm text-muted">{desc}</p></div>
      {children}
    </div>
  );
}

function Times({ value, onChange }: { value: SupportTime[]; onChange: (t: SupportTime[]) => void }) {
  const set = (i: number, p: Partial<SupportTime>) => onChange(value.map((t, j) => (j === i ? { ...t, ...p } : t)));
  return (
    <Card title="Zeiten" actions={<Button size="sm" variant="secondary" aria-label="Supportzeit hinzufügen" onClick={() => onChange([...value, { days: [1, 2, 3, 4, 5], from: '16:00', to: '22:00' }])}><Plus size={16} /></Button>}>
      {!value.length ? (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-panel-2/40 p-3 font-semibold"><Clock size={18} aria-hidden /> Es existieren noch keine Supportzeiten – der Support ist immer geöffnet.</p>
      ) : (
        <ul className="grid gap-2">{value.map((t, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label={`Tage für Zeit ${i + 1}`}>
              {WEEKDAYS.map((d, n) => (
                <button key={d} type="button" aria-pressed={t.days.includes(n)} onClick={() => set(i, { days: t.days.includes(n) ? t.days.filter((x) => x !== n) : [...t.days, n].sort() })}
                  className={`rounded px-2 py-1 text-xs ${t.days.includes(n) ? 'bg-primary text-primary-fg' : 'bg-panel-2'}`}>{d}</button>
              ))}
            </div>
            <Input type="time" aria-label={`Von (Zeit ${i + 1})`} className="w-28" value={t.from} onChange={(e) => set(i, { from: e.target.value })} />
            <span className="text-muted">bis</span>
            <Input type="time" aria-label={`Bis (Zeit ${i + 1})`} className="w-28" value={t.to} onChange={(e) => set(i, { to: e.target.value })} />
            <Button size="sm" variant="ghost" aria-label={`Zeit ${i + 1} entfernen`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={16} /></Button>
          </li>
        ))}</ul>
      )}
      <p className="mt-2 text-xs text-muted">Zeiten in deutscher Zeit. „Bis“ vor „Von“ geht über Mitternacht. Außerhalb der Zeiten bekommt die Person die Supportzeiten per DM; das Team wird nicht gepingt.</p>
    </Card>
  );
}

/** Raum-Einstellungen (Name, Warteraum, Benachrichtigung, Team-Rolle, Prefix, Notizen, eigene Kanäle, Zeiten, Bewertung, Wartemusik). */
function RoomEditor({ room, onChange, onBack, onDelete, onPrimary, canManage }: { room: VoiceSupportRoom; onChange: (r: VoiceSupportRoom) => void; onBack: () => void; onDelete: () => void; onPrimary: () => void; canManage: boolean }) {
  const set = (p: Partial<VoiceSupportRoom>) => onChange({ ...room, ...p });
  const guilds = useGuilds().data ?? [];
  const [server] = useServer();
  const track = (key: 'openTrack' | 'closedTrack', label: string) => (
    <div className="grid gap-2">
      <p className="font-semibold">{label}</p>
      <div className="flex items-center gap-2"><Music size={16} aria-hidden className="text-muted" />
        <Select aria-label={label} value={room.music[key]} onChange={(e) => set({ music: { ...room.music, [key]: e.target.value } })}>{Object.entries(MUSIC_TRACKS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </div>
      {room.music[key] === 'custom' && <p className="flex items-center gap-2 rounded border border-dashed border-line p-2 text-sm text-muted"><Upload size={14} aria-hidden /> Eigene Audiodateien kommen mit der Wiedergabe.</p>}
    </div>
  );
  return (
    <div className="grid gap-4">
      <Card title={<span className="flex items-center gap-2">Raum-Einstellungen <Badge tone="info">{room.name || 'Neuer Raum'}</Badge><GuildTag id={room.guildId} /></span>}
        actions={<span className="flex gap-1">{canManage && <Button size="sm" variant="danger" aria-label="Raum löschen" onClick={onDelete}><Trash2 size={16} /></Button>}<Button size="sm" variant="secondary" aria-label="Zurück zur Liste" onClick={onBack}><ArrowLeft size={16} /></Button></span>}>
        <div className="grid gap-5 md:grid-cols-2">
          {!server && (
            <Row title="Server" desc="Discord-Server, auf dem der Raum liegt" required>
              {guilds.length ? <Select aria-label="Server" value={room.guildId} onChange={(e) => set({ guildId: e.target.value })}><option value="">— wählen —</option>{guilds.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
                : <Input aria-label="Server-ID" inputMode="numeric" placeholder="Discord-Server-ID" value={room.guildId} onChange={(e) => set({ guildId: e.target.value.replace(/\D/g, '') })} />}
            </Row>
          )}
          <Row title="Name des Raums" desc="Name, wie der Raum benannt sein soll" required>
            <div className="relative"><Input aria-label="Name des Raums" maxLength={100} value={room.name} onChange={(e) => set({ name: e.target.value })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{room.name.length} / 100</span></div>
          </Row>
          <Row title="Raum aktivieren?" desc="Regelt, ob der Raum aktiviert sein soll" required><Toggle label="Raum aktivieren" checked={room.enabled} onChange={(v) => set({ enabled: v })} /></Row>
          <Row title="Warteraum" desc="Kanal, dem der Nutzer beitritt, um einen neuen Supportfall zu erstellen" required><ChannelPicker kind="voice" ariaLabel="Warteraum" value={room.waitingChannelId} onChange={(id) => set({ waitingChannelId: id ?? '' })} /></Row>
          <Row title="Benachrichtigungs-Kanal" desc="Kanal, in dem Teammitglieder über neue Supportfälle benachrichtigt werden" required><ChannelPicker ariaLabel="Benachrichtigungs-Kanal" value={room.notifyChannelId} onChange={(id) => set({ notifyChannelId: id ?? '' })} /></Row>
          <Row title="Team Rolle" desc="Rolle, die bei neuen Supportfällen markiert wird und Supportfälle übernehmen kann" required>
            <RolePicker ariaLabel="Team Rolle" max={1} value={room.teamRoleId ? [room.teamRoleId] : []} onChange={(ids) => set({ teamRoleId: ids[ids.length - 1] ?? '' })} />
          </Row>
          <Row title="Support-Kanal Prefix" desc="Zeichen, die vor den Kanalnamen gesetzt werden"><Input aria-label="Support-Kanal Prefix" maxLength={20} value={room.channelPrefix} placeholder="z. B. 🎧 " onChange={(e) => set({ channelPrefix: e.target.value })} /></Row>
          <Row title="Support Notizen aktivieren" desc="Aktiviere, dass ein Thread für einen Support-Fall erstellt wird, wo Notizen geschrieben werden können"><Toggle label="Support Notizen aktivieren" checked={room.notes} onChange={(v) => set({ notes: v })} /></Row>
          <Row title="Eigene Kanäle verwenden" desc="Nutze existierende Kanäle, anstatt dass der Bot einen neuen Kanal erstellt">
            <Toggle label="Eigene Kanäle verwenden" checked={room.ownChannels} onChange={(v) => set({ ownChannels: v })} />
            {room.ownChannels && <ChannelsPicker kind="voice" ariaLabel="Eigene Support-Kanäle" max={25} value={room.ownChannelIds.join(',')} onChange={(v) => set({ ownChannelIds: v.split(/[\s,;]+/).filter(Boolean) })} />}
          </Row>
        </div>
      </Card>
      <Times value={room.times} onChange={(times) => set({ times })} />
      <Card title="Bewertung">
        <Row title="Bewertungen aktivieren" desc="Ermögliche Nutzern, eine Bewertung abzugeben (1–5 Sterne per DM, wenn der Fall geschlossen ist)"><Toggle label="Bewertungen aktivieren" checked={room.rating} onChange={(v) => set({ rating: v })} /></Row>
      </Card>
      <Card title="Wartemusik">
        <div className="grid gap-4">
          <Row title="Wartemusik aktivieren" desc="Spiele Wartemusik, sobald ein Nutzer den Warteraum betritt"><Toggle label="Wartemusik aktivieren" checked={room.music.enabled} onChange={(v) => set({ music: { ...room.music, enabled: v } })} /></Row>
          {track('openTrack', 'Support geöffnet')}
          {track('closedTrack', 'Support geschlossen')}
          <p className="rounded-lg border border-line bg-panel-2/40 p-3 text-sm text-muted">Die Einstellung wird schon gespeichert – die Wiedergabe im Warteraum kommt in einem späteren Update.</p>
          {!room.primary && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} aria-hidden /> Der Raum ist nicht als Primär-Kanal gesetzt.</p>
              <p className="mt-1 text-sm">Die Warteraum-Musik funktioniert nur für einen Support-Warteraum. Setze diesen Raum als primär, um die Musik nutzen zu können.</p>
              <Button size="sm" className="mt-2 bg-warning text-black" onClick={onPrimary}>Primär setzen</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

const missing = (r: VoiceSupportRoom) => [!/^\d{15,25}$/.test(r.guildId) && 'Server', !r.name.trim() && 'Name', !r.waitingChannelId && 'Warteraum', !r.notifyChannelId && 'Benachrichtigungs-Kanal', !r.teamRoleId && 'Team Rolle', r.ownChannels && !r.ownChannelIds.length && 'eigene Kanäle'].filter(Boolean) as string[];

/** Support → Sprach-Support: Räume einrichten und Fälle ansehen. */
export function VoiceSupport({ embedded = false }: { embedded?: boolean } = {}) {
  const { can } = useAuth();
  const manage = can('ticket.settings');
  const qc = useQueryClient();
  const [server] = useServer();
  const guilds = useGuilds();
  const [tab, setTab] = useState('Räume');
  const key = ['voice-rooms', server];
  const q = useQuery({ queryKey: key, queryFn: () => api<VoiceSupportRoom[]>('/voice-support/rooms') });
  const [rooms, setRooms] = useState<VoiceSupportRoom[]>();
  const [open, setOpen] = useState<string>();
  const [del, setDel] = useState<string>();
  const [status, setStatus] = useState('OPEN');
  const cases = useQuery({ queryKey: ['voice-cases', server, status], queryFn: () => api<VoiceCase[]>('/voice-support/cases', { query: { status } }), enabled: tab === 'Fälle', refetchInterval: 5_000 });
  useEffect(() => { if (q.data) setRooms(q.data); }, [q.data]);
  const valid = (rs: VoiceSupportRoom[]) => rs.every((r) => !missing(r).length);
  const save = useMutation({ mutationFn: (rs: VoiceSupportRoom[]) => api<VoiceSupportRoom[]>('/voice-support/rooms', { method: 'PUT', body: rs }), onSuccess: (r) => qc.setQueryData(key, r) });
  useAutosaveDraft(manage ? `voice-rooms:${server || 'all'}` : null, rooms, (rs) => (valid(rs) ? { method: 'PUT', path: '/voice-support/rooms', body: rs, label: 'Sprach-Support' } : null));
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!rooms) return <SkeletonRows />;
  const current = rooms.find((r) => r.id === open);
  const update = (r: VoiceSupportRoom) => setRooms(rooms.map((x) => (x.id === r.id ? r : x)));
  const guildId = server || (guilds.data?.length === 1 ? guilds.data[0]!.id : '');
  const add = () => { const r = newVoiceRoom(crypto.randomUUID(), guildId); setRooms([...rooms, r]); setOpen(r.id); };
  const dirty = JSON.stringify(rooms) !== JSON.stringify(q.data);
  const problems = rooms.filter((r) => missing(r).length);
  return (
    <>
      {!embedded && <PageHeader title="🎧 Sprach-Support" subtitle="Wer den Warteraum betritt, eröffnet einen Support-Fall. Das Team bekommt eine Meldung mit Übernehmen / Ablehnen / Nachricht; Übernehmen verschiebt die Person in einen eigenen Sprachkanal." />}
      {embedded && <p className="mb-3 text-sm text-muted">Wer den Warteraum betritt, eröffnet einen Support-Fall. Das Team bekommt eine Meldung mit <b>Übernehmen</b> / <b>Ablehnen</b> / <b>Nachricht</b>; Übernehmen verschiebt die Person in einen eigenen Sprachkanal.</p>}
      <Tabs tabs={['Räume', 'Fälle']} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Räume' && (current ? (
          <RoomEditor room={current} canManage={manage} onChange={update} onBack={() => setOpen(undefined)} onDelete={() => setDel(current.id)}
            onPrimary={() => setRooms(rooms.map((x) => (x.guildId === current.guildId ? { ...x, primary: x.id === current.id } : x)))} />
        ) : (
          <Card title="Räume" actions={manage && <Button size="sm" onClick={add}><Plus size={16} className="mr-1" />Raum anlegen</Button>}>
            {!rooms.length ? <EmptyState text="Noch keine Räume." hint="Lege einen Raum an und wähle Warteraum, Benachrichtigungs-Kanal und Team-Rolle. Der Bot braucht „Kanäle verwalten“ und „Mitglieder verschieben“." /> : (
              <ul className="grid gap-2">{rooms.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                  <span className="font-semibold">{r.name || 'Neuer Raum'}</span>
                  <Badge tone={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'Aktiv' : 'Aus'}</Badge>
                  {r.primary && <Badge tone="info">Primär</Badge>}
                  {missing(r).length > 0 && <Badge tone="warning">Fehlt: {missing(r).join(', ')}</Badge>}
                  <GuildTag id={r.guildId} />
                  <span className="ml-auto"><Button size="sm" variant="secondary" onClick={() => setOpen(r.id)}>Bearbeiten</Button></span>
                </li>
              ))}</ul>
            )}
          </Card>
        ))}
        {tab === 'Fälle' && (
          <Card title="Support-Fälle" actions={<Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Offen</option>{Object.entries(VOICE_CASE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="">Alle</option></Select>}>
            {cases.isLoading ? <SkeletonRows /> : cases.error ? <ErrorState error={cases.error} onRetry={() => void cases.refetch()} /> : !cases.data?.length ? <EmptyState text="Keine Support-Fälle." /> : (
              <ul className="grid gap-2">{cases.data.map((c) => (
                <li key={c.id} className="grid gap-1 rounded-lg border border-line p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2"><code>#{c.number}</code> · {c.roomName} <Badge tone={TONE[c.status]}>{VOICE_CASE_STATUS[c.status]}</Badge><GuildTag id={c.guildId} />{c.rating && <span title="Bewertung">{'⭐'.repeat(c.rating)}</span>}</p>
                  <p className="text-muted">👤 {c.userName} · erstellt {fmt(c.createdAt)}{c.claimedByName && ` · übernommen von ${c.claimedByName}`}{c.closedAt && ` · ${c.status === 'DECLINED' ? 'abgelehnt' : 'beendet'} ${fmt(c.closedAt)}${c.closedByName ? ` von ${c.closedByName}` : ''}`}{c.closeReason && ` (${c.closeReason})`}{c.messages ? ` · ${c.messages} Nachricht(en)` : ''}</p>
                </li>
              ))}</ul>
            )}
          </Card>
        )}
      </div>
      {save.error && <p role="alert" className="mt-3 text-sm text-danger">{errText(save.error)}</p>}
      {problems.length > 0 && <p role="alert" className="mt-3 text-sm text-warning">Noch nicht gespeichert – bitte ausfüllen: {problems.map((r) => `${r.name || 'Neuer Raum'} (${missing(r).join(', ')})`).join('; ')}.</p>}
      {manage && tab === 'Räume' && (
        <div className="sticky bottom-2 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
          <span className="text-sm text-muted">Änderungen werden automatisch gespeichert.</span>
          <Button variant="secondary" disabled={save.isPending || !dirty || !valid(rooms)} onClick={() => save.mutate(rooms)}>Jetzt speichern</Button>
        </div>
      )}
      <ConfirmDialog open={!!del} danger title="Raum löschen?" message="Offene Support-Fälle dieses Raums bleiben bestehen." confirmLabel="Löschen" onConfirm={() => { setRooms(rooms.filter((r) => r.id !== del)); setOpen(undefined); setDel(undefined); }} onClose={() => setDel(undefined)} />
    </>
  );
}
