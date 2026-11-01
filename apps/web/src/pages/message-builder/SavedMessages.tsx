import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Copy, ExternalLink, Link2, MousePointerClick, Pencil, RefreshCw, Send, Trash2 } from 'lucide-react';
import { cloneWithNewIds, validateMbDocument, type MbDocumentData } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Modal, SkeletonRows } from '../../components/ui';
import { MessageEditor, type EditorCtx } from './MessageEditor';
import { MessagePreview } from './Preview';
import { JsonEditor, type JsonState } from './JsonEditor';
import { SendResult, type SendRecord } from './SendPanel';
import type { ServerInfo } from './MessageBuilder';

export interface SavedMessage {
  id: string; name: string; channelId: string; channelName: string | null; threadId: string | null; messageId: string; mode: 'BOT' | 'WEBHOOK'; webhookId: string | null;
  sendId: string | null; status: 'READY' | 'LOADING' | 'FAILED'; error: string | null; sentById: string | null; createdByName: string; createdAt: string; lastEditedAt: string | null;
  link: string | null; canEdit: boolean; foreignComponents: number; data?: MbDocumentData | null;
}

/**
 * Gesendete Discord-Nachrichten: Links zu allem, was über den Embed Builder gesendet wurde, plus per Link geladene
 * Bot-/Webhook-Nachrichten. Bearbeiten (mit Vorschau vor dem Speichern), Duplizieren/erneut senden (als neuer Entwurf),
 * neu aus Discord laden, Link entfernen.
 */
export function SavedMessages({ server, onOpenDraft }: { server: ServerInfo | undefined; onOpenDraft: (docId: string) => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [link, setLink] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [del, setDel] = useState<SavedMessage | null>(null);
  const q = useQuery({
    queryKey: ['mb-messages', page, search], queryFn: () => api<{ items: SavedMessage[]; total: number; pageSize: number }>('/message-builder/messages', { query: { page, pageSize: 25, q: search || undefined } }),
    refetchInterval: (query) => (query.state.data?.items.some((m) => m.status === 'LOADING') ? 2000 : 15_000),
  });
  const done = () => void qc.invalidateQueries({ queryKey: ['mb-messages'] });
  const load = useMutation({ mutationFn: () => api<SavedMessage>('/message-builder/messages/load', { method: 'POST', body: { link: link.trim() } }), onSuccess: () => { setLink(''); done(); } });
  const reload = useMutation({ mutationFn: (id: string) => api(`/message-builder/messages/${id}/reload`, { method: 'POST' }), onSuccess: done });
  const remove = useMutation({ mutationFn: (id: string) => api(`/message-builder/messages/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); done(); } });
  /** Duplizieren bzw. erneut senden: Inhalt als neuer Entwurf (der Versand geht dann normal über den Editor). */
  const toDraft = useMutation({
    mutationFn: async (m: SavedMessage) => {
      const full = await api<SavedMessage>(`/message-builder/messages/${m.id}`);
      if (!full.data) throw new Error('Für diese Nachricht ist kein Inhalt gespeichert.');
      // übernommene fremde custom_ids gelten nur für die Originalnachricht → im Entwurf eigene Aktion nötig
      const data = cloneWithNewIds(full.data);
      data.messages.forEach((x) => x.rows.forEach((r) => { if (r.type === 'select') r.keepCustomId = ''; else r.buttons.forEach((b) => { b.keepCustomId = ''; }); }));
      const d = await api<{ id: string }>('/message-builder/documents', { method: 'POST', body: { kind: 'DRAFT', name: `${m.name} (Kopie)`.slice(0, 100), data } });
      const doc = await api<{ id: string; name: string; categoryId: string | null; version: number; data: MbDocumentData }>(`/message-builder/documents/${d.id}`);
      // Zielkanal vorbelegen (erneut senden)
      await api(`/message-builder/documents/${d.id}`, { method: 'PUT', body: { name: doc.name, categoryId: doc.categoryId, channelId: server?.channels.some((c) => c.id === m.channelId) ? m.channelId : null, data: doc.data, version: doc.version } });
      return d.id;
    },
    onSuccess: (id) => onOpenDraft(id),
  });

  if (editing) return <EditMessage id={editing} server={server} onClose={() => { setEditing(null); done(); }} />;
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <div className="grid gap-4">
      {can('messagebuilder.edit') && (
        <Card title="Nachricht per Link laden">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); load.mutate(); }}>
            <Input aria-label="Discord-Nachrichtenlink" className="min-w-0 flex-1" placeholder="https://discord.com/channels/…/…/…" value={link} onChange={(e) => setLink(e.target.value)} />
            <Button type="submit" disabled={!link.trim() || load.isPending}><Link2 size={14} />{load.isPending ? 'Lade …' : 'Laden'}</Button>
          </form>
          <p className="mt-1 text-[11px] text-muted">Nur Nachrichten des gewählten Servers, die vom Bot oder von einem hier eingerichteten Webhook stammen, können bearbeitet werden. Nachrichten anderer brauchen das Recht „Nachrichten anderer bearbeiten“.</p>
          {load.isError && <p role="alert" className="mt-1 text-xs text-danger">{errText(load.error)}</p>}
        </Card>
      )}
      <Card title="Gesendete Nachrichten" actions={<Input aria-label="Gesendete Nachrichten durchsuchen" placeholder="Suchen …" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-48 py-1 text-xs" />}>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.items.length ? <EmptyState text="Noch keine gespeicherten Nachrichten." hint="Über den Embed Builder gesendete Nachrichten erscheinen hier automatisch mit Link." /> : (
          <ul className="grid gap-2">
            {q.data.items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">{m.name}
                    <Badge tone={m.mode === 'WEBHOOK' ? 'info' : 'neutral'}>{m.mode === 'WEBHOOK' ? 'Webhook' : 'Bot'}</Badge>
                    {m.status === 'LOADING' && <Badge tone="warning">Wird geladen …</Badge>}
                    {m.status === 'FAILED' && <Badge tone="danger">Nicht bearbeitbar</Badge>}
                    {m.foreignComponents > 0 && <Badge tone="neutral">{m.foreignComponents} übernommene Komponente{m.foreignComponents > 1 ? 'n' : ''}</Badge>}
                  </p>
                  <p className="text-xs text-muted">{m.channelName ? `#${m.channelName}` : m.channelId}{m.threadId ? ' (Thread)' : ''} · von {m.createdByName} · {fmt(m.createdAt)}{m.lastEditedAt ? ` · bearbeitet ${fmt(m.lastEditedAt)}` : ''}</p>
                  {m.error && <p className="text-xs text-danger">{m.error}</p>}
                </div>
                <span className="flex flex-wrap gap-1">
                  {m.link && <a href={m.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-panel-2"><ExternalLink size={13} />In Discord</a>}
                  {m.canEdit && <Button size="sm" onClick={() => setEditing(m.id)}><Pencil size={13} />Bearbeiten</Button>}
                  {can('messagebuilder.create') && m.status === 'READY' && <Button size="sm" variant="secondary" title="Als neuen Entwurf öffnen (Zielkanal vorbelegt)" disabled={toDraft.isPending} onClick={() => toDraft.mutate(m)}><Copy size={13} />Duplizieren / erneut senden</Button>}
                  {m.canEdit || m.status === 'FAILED' ? <Button size="sm" variant="ghost" title="Inhalt neu aus Discord laden" disabled={reload.isPending || m.status === 'LOADING'} onClick={() => reload.mutate(m.id)}><RefreshCw size={13} /></Button> : null}
                  {(m.canEdit || m.status === 'FAILED') && <Button size="sm" variant="ghost" aria-label={`Link ${m.name} entfernen`} className="hover:text-danger" onClick={() => setDel(m)}><Trash2 size={13} /></Button>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(toDraft.isError || reload.isError) && <p role="alert" className="mt-2 text-xs text-danger">{toDraft.error instanceof Error && !(toDraft.error as { status?: number }).status ? toDraft.error.message : errText(toDraft.error ?? reload.error)}</p>}
        {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-xs"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><span>Seite {page}/{pages}</span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button></div>}
      </Card>
      <ConfirmDialog open={!!del} danger title="Link entfernen?" message={`„${del?.name}“ wird aus der Liste entfernt. Die Nachricht in Discord bleibt unverändert.`} confirmLabel="Entfernen" busy={remove.isPending} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} />
    </div>
  );
}

/** Bestehende Discord-Nachricht bearbeiten: Editor (grafisch/JSON) + Live-Vorschau; Speichern erst nach Vorschau-Bestätigung. */
export function EditMessage({ id, server, onClose }: { id: string; server: ServerInfo | undefined; onClose: () => void }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['mb-message', id], queryFn: () => api<SavedMessage>(`/message-builder/messages/${id}`), staleTime: Infinity, gcTime: 0 });
  const [data, setData] = useState<MbDocumentData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'visual' | 'json'>('visual');
  const [jsonState, setJsonState] = useState<JsonState>({ valid: true, error: null });
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<SendRecord | null>(null);
  useEffect(() => { if (q.data?.data && !data) setData(q.data.data); }, [q.data]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const m = q.data;
  const kept = useMemo(() => {
    const ids: string[] = [];
    m?.data?.messages[0]?.rows.forEach((r) => { if (r.type === 'select' && r.keepCustomId) ids.push(r.keepCustomId); if (r.type === 'buttons') r.buttons.forEach((b) => b.keepCustomId && ids.push(b.keepCustomId)); });
    return ids;
  }, [m]);
  const issues = useMemo(() => (data ? validateMbDocument(data, { target: m?.mode === 'WEBHOOK' ? 'webhook' : 'bot', keptCustomIds: kept, allowRoleActions: can('messagebuilder.roles'), ...(server?.guild ? { roleIds: server.roles.map((r) => r.id) } : {}) }) : []), [data, m, kept, server]);
  const errors = issues.filter((i) => i.level === 'error');
  const save = useMutation({ mutationFn: () => api<SendRecord>(`/message-builder/messages/${id}/edit`, { method: 'POST', body: { data, confirm: true } }), onSuccess: (r) => { setResult(r); setConfirm(false); setDirty(false); } });
  const mdCtx = useMemo(() => ({ roleName: (rid: string) => server?.roles.find((r) => r.id === rid), channelName: (cid: string) => server?.channels.find((c) => c.id === cid)?.name }), [server]);
  const ctx: EditorCtx = { roles: server?.roles ?? [], channels: server?.channels ?? [], canRoles: can('messagebuilder.roles'), readOnly: !m?.canEdit };
  const author = m?.mode === 'WEBHOOK' ? { name: data?.webhookProfile.username || 'Webhook', avatar: data?.webhookProfile.avatarUrl || null, app: false } : { name: 'EN | POLIZEI', avatar: server?.guild?.icon ?? null, app: true };
  const change = (d: MbDocumentData) => { setData(d); setDirty(true); };
  const blocked = !data || errors.length > 0 || (view === 'json' && !jsonState.valid) || !m?.canEdit;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => { if (!dirty || window.confirm('Ungespeicherte Änderungen verwerfen?')) onClose(); }}>← Zurück zur Liste</Button>
        <h2 className="text-lg font-semibold">Nachricht bearbeiten: {m?.name ?? '…'}</h2>
        {m?.link && <a href={m.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink size={13} />Original in Discord</a>}
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !m || !data ? <Card><SkeletonRows /></Card> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            {m.mode === 'WEBHOOK' && <p className="rounded border border-warning/40 bg-warning/10 p-2 text-xs">Diese Nachricht stammt von einem Webhook und wird über diesen Webhook bearbeitet. Name und Profilbild einer gesendeten Webhook-Nachricht lassen sich in Discord nicht mehr ändern.</p>}
            {kept.length > 0 && <p className="rounded border border-line bg-panel-2/40 p-2 text-xs">{kept.length} Komponente(n) stammen von einer anderen Bot-Funktion (z. B. Ticket-Panel) und behalten ihre Funktion unverändert.</p>}
            <div className="flex gap-1" role="tablist" aria-label="Editor-Ansicht">
              <Button size="sm" role="tab" aria-selected={view === 'visual'} variant={view === 'visual' ? 'primary' : 'secondary'} disabled={view === 'json' && !jsonState.valid} onClick={() => setView('visual')}><MousePointerClick size={14} />Grafisch</Button>
              <Button size="sm" role="tab" aria-selected={view === 'json'} variant={view === 'json' ? 'primary' : 'secondary'} onClick={() => setView('json')}><Braces size={14} />JSON-Editor</Button>
            </div>
            <Card>
              {view === 'json'
                ? <JsonEditor data={data} readOnly={!m.canEdit} onState={setJsonState} onChange={change} fileName={`nachricht-${m.messageId}.json`} />
                : <MessageEditor m={data.messages[0]!} index={0} ctx={ctx} issues={issues} onChange={(x) => change({ ...data, messages: [x] })} />}
              {view === 'json' && errors.length > 0 && <ul className="mt-2 grid gap-0.5 text-xs text-danger">{errors.map((i, k) => <li key={k}>✖ {i.where}: {i.message}</li>)}</ul>}
            </Card>
          </div>
          <div className="grid content-start gap-4 xl:sticky xl:top-4">
            <Card title="Live-Vorschau"><MessagePreview data={data} ctx={mdCtx} author={author} webhook={m.mode === 'WEBHOOK'} /></Card>
            <Card title="Änderungen speichern">
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={blocked || save.isPending} onClick={() => { save.reset(); setConfirm(true); }}><Send size={14} />Nachricht aktualisieren …</Button>
                {errors.length > 0 && <span className="text-xs text-danger">{errors.length} Fehler – erst beheben</span>}
                {view === 'json' && !jsonState.valid && <span className="text-xs text-danger">Ungültiges JSON</span>}
              </div>
              {result && <div className="mt-3"><SendResult key={result.id} id={result.id} initial={result} /></div>}
            </Card>
          </div>
        </div>
      )}
      <Modal open={confirm} wide title="Vorschau & Bearbeitung bestätigen" onClose={() => setConfirm(false)}>
        <div className="grid gap-3 text-sm">
          <p>Die bestehende Nachricht in {m?.channelName ? <b>#{m.channelName}</b> : 'Discord'} wird so ersetzt. Die alte Fassung lässt sich nicht automatisch wiederherstellen.</p>
          {data && <div className="max-h-[50vh] overflow-auto rounded-lg"><MessagePreview data={data} ctx={mdCtx} author={author} webhook={m?.mode === 'WEBHOOK'} /></div>}
          {save.isError && <p role="alert" className="text-xs text-danger">{errText(save.error)}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirm(false)}>Abbrechen</Button><Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Speichere …' : 'Jetzt aktualisieren'}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
