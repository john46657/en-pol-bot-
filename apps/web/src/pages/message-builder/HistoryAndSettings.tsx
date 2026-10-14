import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { errText } from '../../lib/tickets';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Select, SkeletonRows } from '../../components/ui';
import { MODE_LABEL, messageLink, StatusTag, type SendRecord, type Webhook } from './SendPanel';
import type { ServerChannel } from './MessageEditor';

export interface Category { id: string; name: string; position: number }

/** Versandhistorie: was wann wohin gesendet wurde, mit Status je Nachricht (fehlgeschlagen ist nie „gesendet“). */
export function History() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['mb-history', page, status], queryFn: () => api<{ items: SendRecord[]; total: number; pageSize: number; guildId: string | null }>('/message-builder/sends', { query: { page, pageSize: 25, status: status || undefined } }), refetchInterval: 10_000 });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <Card title="Versandhistorie" actions={
      <Select aria-label="Status filtern" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-auto py-1 text-xs">
        <option value="">Alle</option><option value="SENT">Gesendet</option><option value="PARTIAL">Teilweise</option><option value="FAILED">Fehlgeschlagen</option><option value="QUEUED">Wartend</option><option value="TEST">Testläufe</option>
      </Select>
    }>
      {q.isLoading ? <SkeletonRows /> : !q.data?.items.length ? <EmptyState text="Noch nichts gesendet." /> : (
        <div className="table-scroll">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-1">Zeitpunkt</th><th>Status</th><th>Weg</th><th>Kanal</th><th>Vorlage/Entwurf</th><th>Von</th><th>Nachrichten</th></tr></thead>
            <tbody>
              {q.data.items.map((s) => (
                <tr key={s.id} className="border-t border-line align-top">
                  <td className="py-1.5">{fmt(s.createdAt)}</td>
                  <td><StatusTag s={s.status} />{s.error && <p className="max-w-xs whitespace-normal text-xs text-danger">{s.error}</p>}</td>
                  <td>{MODE_LABEL[s.mode] ?? s.mode}</td>
                  <td>{s.channelName ? `#${s.channelName}` : s.channelId ?? '—'}</td>
                  <td>{s.documentName}</td>
                  <td>{s.createdByName}</td>
                  <td className="whitespace-normal">
                    <ol className="grid gap-0.5 text-xs">{s.items.map((i) => {
                      const link = messageLink(q.data.guildId, s.channelId, i.messageId);
                      return <li key={i.position} className="flex flex-wrap items-center gap-1">{i.position + 1}. <StatusTag s={i.status} />{link ? <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline" title={`Nachrichten-ID ${i.messageId}`}>öffnen</a> : null}{i.error && <span className="text-danger">{i.error}</span>}</li>;
                    })}</ol>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-xs"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><span>Seite {page}/{pages}</span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button></div>}
    </Card>
  );
}

function Categories({ categories }: { categories: Category[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [del, setDel] = useState<Category | null>(null);
  const done = () => void qc.invalidateQueries({ queryKey: ['mb-categories'] });
  const add = useMutation({ mutationFn: () => api('/message-builder/categories', { method: 'POST', body: { name } }), onSuccess: () => { setName(''); done(); } });
  const rename = useMutation({ mutationFn: (c: Category) => api(`/message-builder/categories/${c.id}`, { method: 'PUT', body: { name: c.name, position: c.position } }), onSuccess: done });
  const remove = useMutation({ mutationFn: (id: string) => api(`/message-builder/categories/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); done(); void qc.invalidateQueries({ queryKey: ['mb-docs'] }); } });
  return (
    <Card title="Vorlagen-Kategorien">
      <ul className="grid gap-1.5">
        {categories.map((c, i) => <CategoryRow key={c.id} c={c} first={i === 0} last={i === categories.length - 1} onSave={(x) => rename.mutate(x)} onSwap={(d) => { const o = categories[i + d]; if (o) { rename.mutate({ ...c, position: o.position }); rename.mutate({ ...o, position: c.position }); } }} onDelete={() => setDel(c)} />)}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
        <Input aria-label="Neue Kategorie" placeholder="Neue Kategorie" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim() || add.isPending}><Plus size={14} />Hinzufügen</Button>
      </form>
      {(add.isError || rename.isError) && <p role="alert" className="mt-2 text-xs text-danger">{errText(add.error ?? rename.error)}</p>}
      <ConfirmDialog open={!!del} danger title="Kategorie löschen?" message={`„${del?.name}“ wird gelöscht. Die Vorlagen darin bleiben erhalten (ohne Kategorie).`} confirmLabel="Löschen" busy={remove.isPending} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} />
    </Card>
  );
}
function CategoryRow({ c, onSave, onDelete, onSwap, first, last }: { c: Category; onSave: (c: Category) => void; onDelete: () => void; onSwap: (d: -1 | 1) => void; first: boolean; last: boolean }) {
  const [name, setName] = useState(c.name);
  useEffect(() => setName(c.name), [c.name]);
  return (
    <li className="flex items-center gap-1.5">
      <Input aria-label={`Kategorie ${c.name}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.name && onSave({ ...c, name: name.trim() })} className="py-1" />
      <Button size="sm" variant="ghost" aria-label={`${c.name} nach oben`} disabled={first} onClick={() => onSwap(-1)}>↑</Button>
      <Button size="sm" variant="ghost" aria-label={`${c.name} nach unten`} disabled={last} onClick={() => onSwap(1)}>↓</Button>
      <Button size="sm" variant="ghost" aria-label={`${c.name} löschen`} className="hover:text-danger" onClick={onDelete}><Trash2 size={14} /></Button>
    </li>
  );
}

function AllowedChannels({ channels }: { channels: ServerChannel[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mb-channels-config'], queryFn: () => api<{ channelIds: string[] }>('/message-builder/channels/config') });
  const [sel, setSel] = useState<string[] | null>(null);
  const cur = sel ?? q.data?.channelIds ?? [];
  const save = useMutation({ mutationFn: () => api('/message-builder/channels/config', { method: 'PUT', body: { channelIds: cur } }), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['mb-channels-config'] }); void qc.invalidateQueries({ queryKey: ['mb-server'] }); } });
  return (
    <Card title="Erlaubte Kanäle" actions={<Button size="sm" disabled={sel === null || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Speichert …' : 'Speichern'}</Button>}>
      <p className="mb-2 text-xs text-muted">Nichts angehakt = alle Textkanäle des Discord-Servers. Sonst darf nur in die angehakten Kanäle gesendet werden (gilt auch für direkte API-Aufrufe).</p>
      {q.isLoading ? <SkeletonRows rows={3} /> : (
        <ul className="grid max-h-80 gap-1 overflow-auto sm:grid-cols-2">
          {channels.map((c) => (
            <li key={c.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cur.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id))} />#{c.name}{c.category && <span className="text-xs text-muted">({c.category})</span>}</label></li>
          ))}
        </ul>
      )}
      {sel !== null && <p className="mt-2 text-xs text-warning">Ungespeicherte Änderung.</p>}
      {save.isError && <p role="alert" className="mt-2 text-xs text-danger">{errText(save.error)}</p>}
    </Card>
  );
}

function Webhooks() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mb-webhooks'], queryFn: () => api<Webhook[]>('/message-builder/webhooks') });
  const [name, setName] = useState(''), [url, setUrl] = useState('');
  const [del, setDel] = useState<Webhook | null>(null);
  const add = useMutation({ mutationFn: () => api('/message-builder/webhooks', { method: 'POST', body: { name, url } }), onSuccess: () => { setName(''); setUrl(''); void qc.invalidateQueries({ queryKey: ['mb-webhooks'] }); } });
  const remove = useMutation({ mutationFn: (id: string) => api(`/message-builder/webhooks/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); void qc.invalidateQueries({ queryKey: ['mb-webhooks'] }); } });
  return (
    <Card title="Webhooks (optional)">
      <p className="mb-2 text-xs text-muted">Standard ist immer der Bot. Ein Webhook wird nur benutzt, wenn er beim Senden ausdrücklich gewählt wird. Die URL enthält ein Geheimnis: Sie wird verschlüsselt gespeichert und nie wieder angezeigt. Nur Webhooks des Discord-Servers der EN Polizei werden angenommen.</p>
      {q.isError ? <ErrorState error={q.error} /> : (
        <ul className="mb-3 grid gap-1">
          {(q.data ?? []).map((w) => <li key={w.id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-sm"><span>{w.name} <span className="text-xs text-muted">{w.channelName ? `#${w.channelName}` : ''} · ID {w.webhookId}{w.readable ? '' : ' · nicht mehr lesbar (Schlüssel geändert)'}</span></span><Button size="sm" variant="ghost" aria-label={`Webhook ${w.name} entfernen`} className="hover:text-danger" onClick={() => setDel(w)}><Trash2 size={14} /></Button></li>)}
          {!q.data?.length && <li className="text-xs text-muted">Keine Webhooks eingerichtet.</li>}
        </ul>
      )}
      <form className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Input aria-label="Webhook-Name" placeholder="Name (z. B. Leitstelle)" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Webhook-URL" type="password" autoComplete="off" placeholder="https://discord.com/api/webhooks/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button type="submit" disabled={!name.trim() || !url.trim() || add.isPending}>{add.isPending ? 'Prüfe …' : 'Hinzufügen'}</Button>
      </form>
      {add.isError && <p role="alert" className="mt-2 text-xs text-danger">{errText(add.error)}</p>}
      <ConfirmDialog open={!!del} danger title="Webhook entfernen?" message={`„${del?.name}“ wird entfernt und die gespeicherte URL gelöscht. Der Webhook selbst bleibt in Discord bestehen.`} confirmLabel="Entfernen" busy={remove.isPending} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} />
    </Card>
  );
}

export function SettingsTab({ can, categories, channels }: { can: (p: string) => boolean; categories: Category[]; channels: ServerChannel[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {can('messagebuilder.templates_edit') && <Categories categories={categories} />}
      {can('messagebuilder.channels') && <AllowedChannels channels={channels} />}
      {can('messagebuilder.webhooks') && <div className="xl:col-span-2"><Webhooks /></div>}
    </div>
  );
}
