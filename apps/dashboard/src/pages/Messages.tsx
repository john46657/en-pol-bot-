import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, type DiscordChannel, type DiscordRole } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

interface Payload {
  content?: string;
  embed?: { title?: string; description?: string; color?: string; imageUrl?: string; thumbnailUrl?: string; footer?: string };
  buttons?: { label: string; url: string }[];
  mentionRoleIds?: string[];
}
interface Row {
  id: string;
  name: string;
  channelId: string;
  payload: Payload;
  scheduleType: 'once' | 'interval' | 'daily' | 'weekly';
  runAt: string | null;
  intervalMinutes: number | null;
  timeOfDay: string | null;
  weekdays: number[];
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TYPE = { once: 'Einmalig', interval: 'Alle … Minuten', daily: 'Täglich', weekly: 'An Wochentagen' } as const;
const when = (d: string | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const toLocalInput = (d: string | null) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const empty = (): Omit<Row, 'id' | 'nextRunAt' | 'lastRunAt'> => ({ name: '', channelId: '', payload: { content: '' }, scheduleType: 'daily', runAt: null, intervalMinutes: 60, timeOfDay: '18:00', weekdays: [], enabled: true });

/** Automatische Nachrichten: zu festen Zeiten in einen Kanal (einmalig, Intervall, täglich, an Wochentagen). */
export function Messages() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/scheduled-messages`;
  const list = useQuery({ queryKey: ['scheduled', guildId], queryFn: () => api<Row[]>(base) });
  const channels = useQuery({ queryKey: ['channels', `/guilds/${guildId}`], queryFn: () => api<DiscordChannel[]>(`/guilds/${guildId}/discord/channels`), retry: false });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`), retry: false });
  const [edit, setEdit] = useState<(Omit<Row, 'id' | 'nextRunAt' | 'lastRunAt'> & { id?: string }) | null>(null);
  const done = (msg: string) => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ['scheduled', guildId] });
  };
  const fail = (e: unknown) => toast.error(errorText(e));
  const save = useMutation({
    mutationFn: (v: NonNullable<typeof edit>) => {
      const { id, ...body } = v;
      return id ? api(`${base}/${id}`, { method: 'PUT', body }) : api(base, { method: 'POST', body });
    },
    onSuccess: () => {
      done('Nachricht gespeichert.');
      setEdit(null);
    },
    onError: fail,
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`${base}/${id}`, { method: 'DELETE' }), onSuccess: () => done('Nachricht gelöscht.'), onError: fail });
  const send = useMutation({ mutationFn: (id: string) => api(`${base}/${id}/send`, { method: 'POST' }), onSuccess: () => done('Nachricht gesendet.'), onError: fail });
  const chName = (id: string) => channels.data?.find((c) => c.id === id)?.name ?? id;
  const text = (channels.data ?? []).filter((c) => c.kind === 'text');
  const e = edit;
  const setP = (p: Partial<Payload>) => e && setEdit({ ...e, payload: { ...e.payload, ...p } });
  const setE = (p: Partial<NonNullable<Payload['embed']>>) => e && setEdit({ ...e, payload: { ...e.payload, embed: { ...(e.payload.embed ?? {}), ...p } } });
  return (
    <>
      <h1>Automatische Nachrichten</h1>
      <p className="muted">Nachrichten, die der Bot zu festen Zeiten in einen Kanal sendet (deutsche Zeit). Platzhalter: {'{datum}'}, {'{uhrzeit}'}, {'{wochentag}'}.</p>
      <div className="actions"><button className="btn primary" onClick={() => setEdit(empty())}>+ Neue Nachricht</button></div>
      <QueryState query={list}>
        {(rows) =>
          rows.length === 0 ? <p className="muted">Noch keine automatischen Nachrichten.</p> : (
            <ul className="list" aria-label="Automatische Nachrichten">
              {rows.map((r) => (
                <li key={r.id} className="row" style={{ opacity: r.enabled ? 1 : 0.6 }}>
                  <span className="grow">
                    <strong>{r.name}</strong> · #{chName(r.channelId)} · {TYPE[r.scheduleType]}
                    {r.scheduleType === 'interval' ? ` (${r.intervalMinutes} Min.)` : ''}
                    {r.scheduleType === 'daily' || r.scheduleType === 'weekly' ? ` ${r.timeOfDay} Uhr` : ''}
                    {r.scheduleType === 'weekly' ? ` (${r.weekdays.map((d) => DAYS[d - 1]).join(', ')})` : ''}
                    <br />
                    <small className="muted">{r.enabled ? `Nächster Versand: ${when(r.nextRunAt)}` : 'Pausiert'} · zuletzt: {when(r.lastRunAt)}</small>
                  </span>
                  <button className="btn" onClick={() => setEdit({ ...r })}>Bearbeiten</button>
                  <button className="btn" disabled={send.isPending} onClick={() => send.mutate(r.id)}>Jetzt senden</button>
                  <button className="btn danger" onClick={() => window.confirm(`„${r.name}“ löschen?`) && remove.mutate(r.id)}>Löschen</button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      {e && (
        <div className="card comp">
          <h2>{e.id ? 'Nachricht bearbeiten' : 'Neue Nachricht'}</h2>
          <label className="fld"><span>Name (nur intern)</span><input value={e.name} maxLength={80} onChange={(x) => setEdit({ ...e, name: x.target.value })} /></label>
          <label className="fld"><span>Kanal</span>
            <select value={e.channelId} onChange={(x) => setEdit({ ...e, channelId: x.target.value })}>
              <option value="">– Kanal wählen –</option>
              {text.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </label>
          <label className="fld"><span>Text</span><textarea rows={3} maxLength={2000} value={e.payload.content ?? ''} onChange={(x) => setP({ content: x.target.value })} /></label>
          <details className="fld">
            <summary>Embed (optional)</summary>
            <label className="fld"><span>Embed-Titel</span><input maxLength={256} value={e.payload.embed?.title ?? ''} onChange={(x) => setE({ title: x.target.value })} /></label>
            <label className="fld"><span>Embed-Beschreibung</span><textarea rows={3} maxLength={4000} value={e.payload.embed?.description ?? ''} onChange={(x) => setE({ description: x.target.value })} /></label>
            <label className="fld"><span>Farbe</span><input type="color" value={e.payload.embed?.color ?? '#5865f2'} onChange={(x) => setE({ color: x.target.value })} /></label>
            <label className="fld"><span>Bild (https)</span><input value={e.payload.embed?.imageUrl ?? ''} onChange={(x) => setE({ imageUrl: x.target.value })} /></label>
            <label className="fld"><span>Fußzeile</span><input maxLength={2048} value={e.payload.embed?.footer ?? ''} onChange={(x) => setE({ footer: x.target.value })} /></label>
          </details>
          <details className="fld">
            <summary>Rollen erwähnen: {(e.payload.mentionRoleIds ?? []).length || 'keine'}</summary>
            <ul className="plain">
              {(roles.data ?? []).filter((x) => x.id !== guildId).map((x) => (
                <li key={x.id}><label><input type="checkbox" checked={(e.payload.mentionRoleIds ?? []).includes(x.id)} onChange={(c) => setP({ mentionRoleIds: c.target.checked ? [...(e.payload.mentionRoleIds ?? []), x.id] : (e.payload.mentionRoleIds ?? []).filter((y) => y !== x.id) })} /> @{x.name}</label></li>
              ))}
            </ul>
          </details>
          <label className="fld"><span>Wiederholung</span>
            <select value={e.scheduleType} onChange={(x) => setEdit({ ...e, scheduleType: x.target.value as Row['scheduleType'] })}>
              {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {(e.scheduleType === 'once' || e.scheduleType === 'interval') && (
            <label className="fld"><span>{e.scheduleType === 'once' ? 'Zeitpunkt' : 'Erster Versand (leer = nach dem ersten Intervall)'}</span><input type="datetime-local" value={toLocalInput(e.runAt)} onChange={(x) => setEdit({ ...e, runAt: x.target.value ? new Date(x.target.value).toISOString() : null })} /></label>
          )}
          {e.scheduleType === 'interval' && <label className="fld"><span>Alle … Minuten (10 bis 10080)</span><input type="number" min={10} max={10080} value={e.intervalMinutes ?? 60} onChange={(x) => setEdit({ ...e, intervalMinutes: Number(x.target.value) })} /></label>}
          {(e.scheduleType === 'daily' || e.scheduleType === 'weekly') && <label className="fld"><span>Uhrzeit</span><input type="time" value={e.timeOfDay ?? ''} onChange={(x) => setEdit({ ...e, timeOfDay: x.target.value })} /></label>}
          {e.scheduleType === 'weekly' && (
            <div className="actions" aria-label="Wochentage">
              {DAYS.map((d, i) => (
                <label key={d}><input type="checkbox" checked={e.weekdays.includes(i + 1)} onChange={(x) => setEdit({ ...e, weekdays: x.target.checked ? [...e.weekdays, i + 1] : e.weekdays.filter((w) => w !== i + 1) })} /> {d}</label>
              ))}
            </div>
          )}
          <label className="fld"><span><input type="checkbox" checked={e.enabled} onChange={(x) => setEdit({ ...e, enabled: x.target.checked })} /> Aktiv</span></label>
          <div className="actions">
            <button className="btn primary" disabled={save.isPending || !e.name.trim() || !e.channelId} onClick={() => save.mutate(e)}>{save.isPending ? 'Speichere …' : 'Speichern'}</button>
            <button className="btn" onClick={() => setEdit(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </>
  );
}
