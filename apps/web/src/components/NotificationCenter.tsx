import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { NOTIFICATION_EVENTS } from '@enrp/shared';
import { api, type Page } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { Badge, Button, EmptyState, fmt, Modal, Select, Tabs } from './ui';

interface Notification { id: string; type: string; event: string | null; title: string; body: string | null; link: string | null; important: boolean; createdAt: string; readAt: string | null }
type Filter = 'unread' | 'read' | 'archived';
const FILTERS: Filter[] = ['unread', 'read', 'archived'];
const FILTER_LABEL: Record<Filter, string> = { unread: 'Ungelesen', read: 'Gelesen', archived: 'Archiviert' };
const GROUPS = [...new Set(NOTIFICATION_EVENTS.map((e) => e.group))];
const eventLabel = (k: string | null) => (k ? NOTIFICATION_EVENTS.find((e) => e.key === k)?.label : undefined);

/**
 * Zentrales Benachrichtigungscenter (Dashboard): ungelesen/gelesen/archiviert, Filter nach Bereich und „wichtig“,
 * als gelesen markieren (einzeln/alle), direkter Link zum Datensatz. Einstellungen: Persönlich → Benachrichtigungen.
 */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Filter>('unread');
  const [group, setGroup] = useState('');
  const [important, setImportant] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['notifications', tab, group, important], queryFn: () => api<Page<Notification> & { unread: number }>('/notifications', { query: { filter: tab, pageSize: 50, group: group || undefined, important: important || undefined } }), refetchInterval: 5_000 });
  const badge = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api<Page<Notification> & { unread: number }>('/notifications', { query: { filter: 'unread', pageSize: 1 } }), refetchInterval: 5_000 });
  const inv = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: inv });
  const act = useMutation({ mutationFn: (v: { id: string; a: 'read' | 'archive' }) => api(`/notifications/${v.id}/${v.a}`, { method: 'POST' }), onSuccess: inv });
  useRealtime('team', ['duty.changed'], []); // Verbindung/Raum für user:<id> entsteht serverseitig beim Handshake
  const unread = badge.data?.unread ?? 0;
  const go = (n: Notification) => { if (!n.readAt) act.mutate({ id: n.id, a: 'read' }); if (n.link?.startsWith('/')) { setOpen(false); void nav(n.link); } };
  return (
    <>
      <Button variant="ghost" aria-label={`Benachrichtigungen (${unread} ungelesen)`} onClick={() => setOpen(true)} className="relative">
        <Bell size={18} aria-hidden />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </Button>
      <Modal open={open} title="Benachrichtigungen" onClose={() => setOpen(false)}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><Tabs tabs={FILTERS.map((f) => FILTER_LABEL[f])} active={FILTER_LABEL[tab]} onChange={(t) => setTab(FILTERS.find((f) => FILTER_LABEL[f] === t) ?? 'unread')} /><Button size="sm" variant="secondary" onClick={() => readAll.mutate()} disabled={!unread}>Alle als gelesen</Button></div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Select aria-label="Bereich" className="h-8 w-44" value={group} onChange={(e) => setGroup(e.target.value)}><option value="">Alle Bereiche</option>{GROUPS.map((g) => <option key={g}>{g}</option>)}</Select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />Nur wichtige</label>
          <Link to="/me/settings#benachrichtigungen" className="ml-auto text-xs underline" onClick={() => setOpen(false)}>Einstellungen</Link>
        </div>
        {!q.data?.items.length ? <EmptyState text={tab === 'unread' ? 'Keine ungelesenen Benachrichtigungen.' : 'Hier ist nichts.'} /> : (
          <ul className="max-h-96 divide-y divide-line overflow-auto">{q.data.items.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-2 py-2.5">
              <div>
                {n.link ? <button type="button" className={`text-left hover:underline ${n.readAt ? 'text-muted' : 'font-medium'}`} onClick={() => go(n)}>{n.title}</button> : <p className={n.readAt ? 'text-muted' : 'font-medium'}>{n.title}</p>}
                {n.body && <p className="text-xs text-muted">{n.body}</p>}
                <p className="text-xs text-muted">{fmt(n.createdAt)} · {eventLabel(n.event) ?? n.type} {n.important && <Badge tone="warning">wichtig</Badge>}</p>
              </div>
              <div className="flex shrink-0 gap-1">{!n.readAt && <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: n.id, a: 'read' })}>Gelesen</Button>}{tab !== 'archived' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: n.id, a: 'archive' })}>Archivieren</Button>}</div>
            </li>
          ))}</ul>
        )}
      </Modal>
    </>
  );
}

/** Persönliche Einstellungen: welche Ereignisse, welche wichtig, Discord-DMs (nur mit Zustimmung), Erinnerungen. */
export function NotificationSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notification-prefs'], queryFn: () => api<{ muted: string[]; important: string[]; dm: boolean; dmEvents: string[]; reminders: boolean; discordLinked: boolean }>('/notifications/preferences') });
  const save = useMutation({ mutationFn: (b: unknown) => api('/notifications/preferences', { method: 'PUT', body: b }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['notification-prefs'] }) });
  const p = q.data;
  if (!p) return null;
  const put = (x: Partial<typeof p>) => { const n = { ...p, ...x }; save.mutate({ muted: n.muted, important: n.important, dm: n.dm, dmEvents: n.dmEvents, reminders: n.reminders }); };
  const toggle = (list: string[], k: string, on: boolean) => (on ? [...new Set([...list, k])] : list.filter((x) => x !== k));
  return (
    <section id="benachrichtigungen" className="space-y-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={p.dm} disabled={!p.discordLinked} onChange={(e) => put({ dm: e.target.checked })} />Benachrichtigungen zusätzlich per Discord-DM {p.discordLinked ? '' : '(Discord-Konto nicht verknüpft)'}</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={p.reminders} onChange={(e) => put({ reminders: e.target.checked })} />Erinnerungen (Termine, Schichten, Besprechungen)</label>
      <table className="w-full text-xs"><thead><tr className="text-left text-muted"><th className="py-1">Ereignis</th><th>Erhalten</th><th>Wichtig</th><th>Per DM</th></tr></thead>
        <tbody>{NOTIFICATION_EVENTS.map((e) => (
          <tr key={e.key} className="border-t border-line/60"><td className="py-1">{e.label} <span className="text-muted">· {e.group}</span></td>
            <td><input type="checkbox" aria-label={`${e.label} erhalten`} checked={!p.muted.includes(e.key)} onChange={(ev) => put({ muted: toggle(p.muted, e.key, !ev.target.checked) })} /></td>
            <td><input type="checkbox" aria-label={`${e.label} wichtig`} disabled={e.important} checked={!!e.important || p.important.includes(e.key)} onChange={(ev) => put({ important: toggle(p.important, e.key, ev.target.checked) })} /></td>
            <td>{e.dm ? <input type="checkbox" aria-label={`${e.label} per DM`} disabled={!p.dm} checked={p.dm && (!p.dmEvents.length || p.dmEvents.includes(e.key))} onChange={(ev) => { const base = p.dmEvents.length ? p.dmEvents : NOTIFICATION_EVENTS.filter((x) => x.dm).map((x) => x.key); put({ dmEvents: toggle(base, e.key, ev.target.checked) }); }} /> : <span className="text-muted">–</span>}</td>
          </tr>
        ))}</tbody>
      </table>
      {save.isPending && <p className="text-xs text-muted">Speichert …</p>}
    </section>
  );
}
