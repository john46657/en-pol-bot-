import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pin, Send, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, EmptyState, ErrorState, fmt, Input, PageHeader, SkeletonRows, Tabs } from '../components/ui';
import { useDebounced } from '../components/DataTable';

interface Msg { id: string; authorId: string; body: string; pinned: boolean; createdAt: string; replyToId: string | null }
const CHANNELS = ['TEAM', 'DISPATCH', 'SUPERVISOR', 'ANNOUNCEMENT'];

export function Communication() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const [ch, setCh] = useState('TEAM');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const msgs = useQuery({ queryKey: ['messages', ch, q], queryFn: () => api<Msg[]>(`/communication/channels/${ch}/messages`, { query: { q: q || undefined } }), refetchInterval: 10_000, retry: false });
  const inv = () => qc.invalidateQueries({ queryKey: ['messages'] });
  const send = useMutation({ mutationFn: () => api(`/communication/channels/${ch}/messages`, { body: { body } }), onSuccess: () => { setBody(''); void inv(); } });
  const act = useMutation({ mutationFn: (v: { id: string; a: 'pin' | 'delete' }) => api(`/communication/messages/${v.id}/${v.a}`, { method: 'POST' }), onSuccess: inv });
  const mod = can('communication.moderate');
  return (
    <>
      <PageHeader title="Communication" subtitle="Police-only channels" />
      <Tabs tabs={CHANNELS} active={ch} onChange={setCh} />
      <div className="mt-3 rounded-lg border border-line bg-panel">
        <div className="border-b border-line p-2"><Input aria-label="Search messages" placeholder="Search in channel…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="max-h-[50vh] min-h-48 overflow-y-auto p-3" aria-live="polite">
          {msgs.isLoading ? <SkeletonRows /> : msgs.error ? <ErrorState error={msgs.error} onRetry={() => void msgs.refetch()} /> : !msgs.data?.length ? <EmptyState text="No messages in this channel yet." /> : (
            <ul className="space-y-2">{[...msgs.data].reverse().map((m) => (
              <li key={m.id} className="group rounded border border-line/60 bg-panel-2 p-2">
                <div className="flex items-center justify-between text-xs text-muted"><span>{m.authorId === user?.id ? 'You' : m.authorId.slice(0, 8)} · {fmt(m.createdAt)} {m.pinned && <Pin size={11} className="inline text-warning" aria-label="pinned" />}</span>
                  <span className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">{mod && <Button size="sm" variant="ghost" aria-label="Pin message" onClick={() => act.mutate({ id: m.id, a: 'pin' })}><Pin size={12} /></Button>}{(mod || m.authorId === user?.id) && <Button size="sm" variant="ghost" aria-label="Delete message" onClick={() => act.mutate({ id: m.id, a: 'delete' })}><Trash2 size={12} /></Button>}</span></div>
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              </li>))}</ul>
          )}
        </div>
        <form className="flex gap-2 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}>
          <Input aria-label="Message" placeholder={ch === 'ANNOUNCEMENT' && !mod ? 'Only moderators can post announcements' : 'Write a message…'} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          <Button type="submit" disabled={send.isPending || !body.trim()}><Send size={14} />Send</Button>
        </form>
        {send.error && <p role="alert" className="px-3 pb-2 text-sm text-danger">{(send.error as Error).message}</p>}
      </div>
    </>
  );
}
