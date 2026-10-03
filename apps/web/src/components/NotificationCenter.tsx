import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api, type Page } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { Button, EmptyState, fmt, Modal, Tabs } from './ui';

interface Notification { id: string; type: string; title: string; body: string | null; createdAt: string; readAt: string | null }
type Filter = 'unread' | 'read' | 'archived';
const FILTERS: Filter[] = ['unread', 'read', 'archived'];

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>('unread');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', tab], queryFn: () => api<Page<Notification> & { unread: number }>('/notifications', { query: { filter: tab, pageSize: 50 } }), refetchInterval: 60_000 });
  const badge = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api<Page<Notification> & { unread: number }>('/notifications', { query: { filter: 'unread', pageSize: 1 } }), refetchInterval: 60_000 });
  const inv = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: inv });
  const act = useMutation({ mutationFn: (v: { id: string; a: 'read' | 'archive' }) => api(`/notifications/${v.id}/${v.a}`, { method: 'POST' }), onSuccess: inv });
  useRealtime('team', ['duty.changed'], []); // Verbindung/Raum für user:<id> entsteht serverseitig beim Handshake
  const unread = badge.data?.unread ?? 0;
  return (
    <>
      <Button variant="ghost" aria-label={`Notifications (${unread} unread)`} onClick={() => setOpen(true)} className="relative">
        <Bell size={18} aria-hidden />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </Button>
      <Modal open={open} title="Notifications" onClose={() => setOpen(false)}>
        <div className="mb-3 flex items-center justify-between"><Tabs tabs={FILTERS} active={tab} onChange={setTab} /><Button size="sm" variant="secondary" onClick={() => readAll.mutate()} disabled={!unread}>Mark all read</Button></div>
        {!q.data?.items.length ? <EmptyState text={tab === 'unread' ? 'No unread notifications.' : 'Nothing here.'} /> : (
          <ul className="max-h-96 divide-y divide-line overflow-auto">{q.data.items.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-2 py-2.5">
              <div><p className={n.readAt ? 'text-muted' : 'font-medium'}>{n.title}</p>{n.body && <p className="text-xs text-muted">{n.body}</p>}<p className="text-xs text-muted">{fmt(n.createdAt)} · {n.type}</p></div>
              <div className="flex shrink-0 gap-1">{!n.readAt && <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: n.id, a: 'read' })}>Read</Button>}{tab !== 'archived' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: n.id, a: 'archive' })}>Archive</Button>}</div>
            </li>
          ))}</ul>
        )}
      </Modal>
    </>
  );
}
