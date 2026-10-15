import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, FilePlus2, FileText, LayoutTemplate, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { cloneWithNewIds, emptyMbMessage, MB_LIMITS, mbDocumentDataSchema, mbSummary, validateMbDocument, type MbDocumentData } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/guilds';
import { errText } from '../../lib/tickets';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea } from '../../components/ui';
import { MessageEditor, type EditorCtx, type ServerChannel, type ServerRole } from './MessageEditor';
import { MessagePreview } from './Preview';
import { SendPanel, type Webhook } from './SendPanel';
import { History, SettingsTab, type Category } from './HistoryAndSettings';
import { useDocAutosave, type DocSaveStatus, type MbDoc } from './useDocAutosave';

interface DocMeta { id: string; kind: 'DRAFT' | 'TEMPLATE'; name: string; categoryId: string | null; updatedAt: string; messageCount: number; updatedByName: string | null }
interface ServerInfo {
  guild: { id: string; name: string; icon: string | null } | null; channels: ServerChannel[]; roles: ServerRole[]; configured: boolean; restricted?: boolean;
  problem?: 'no_server' | 'no_report';
}
/** Warum keine Kanäle da sind – mit dem, was zu tun ist. */
function channelHint(s: ServerInfo | undefined): string | null {
  if (!s || s.channels.length) return null;
  if (s.problem === 'no_server') return 'Bitte oben links einen Discord-Server wählen – der Message Builder arbeitet je Server.';
  if (s.problem === 'no_report') return 'Der Bot hat für diesen Server noch keine Kanäle gemeldet. Ist der Bot auf dem Server und läuft er? Nach dem Start dauert es einige Sekunden.';
  return `Auf ${s.guild?.name ?? 'dem Discord-Server'} sieht der Bot keine Textkanäle – bitte dem Bot das Recht „Kanäle ansehen“ geben.`;
}

const SAVE_VIEW: Record<DocSaveStatus, [string, string]> = {
  saved: ['Gespeichert', 'text-success'], pending: ['Ungespeicherte Änderungen …', 'text-warning'], saving: ['Speichert …', 'text-muted'], error: ['Speichern fehlgeschlagen', 'text-danger'], conflict: ['Konflikt – neuere Fassung vorhanden', 'text-danger'],
};
const move = <T,>(list: T[], i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= list.length) return list; const c = [...list]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; };

function useMbData() {
  const server = useQuery({ queryKey: ['mb-server'], queryFn: () => api<ServerInfo>('/message-builder/server'), staleTime: 30_000 });
  const categories = useQuery({ queryKey: ['mb-categories'], queryFn: () => api<Category[]>('/message-builder/categories') });
  const templates = useQuery({ queryKey: ['mb-docs', 'TEMPLATE'], queryFn: () => api<DocMeta[]>('/message-builder/documents', { query: { kind: 'TEMPLATE' } }) });
  const drafts = useQuery({ queryKey: ['mb-docs', 'DRAFT'], queryFn: () => api<DocMeta[]>('/message-builder/documents', { query: { kind: 'DRAFT' } }) });
  return { server, categories, templates, drafts };
}

/** Discord Message Builder (Discohook-artig): links Nachrichten/Entwürfe/Vorlagen, Mitte Editor, rechts Live-Vorschau + Versand. */
export function MessageBuilder() {
  const [server] = useServer();
  if (!server) return (<div><PageHeader title="Discord Message Builder" /><EmptyState text="Kein Server gewählt" hint="Der Message Builder arbeitet je Discord-Server – bitte oben links einen Server wählen." /></div>);
  // Server gewechselt → Editor komplett neu (offene Entwürfe gehören zum vorherigen Server)
  return <MessageBuilderFor key={server} />;
}
function MessageBuilderFor() {
  const { can } = useAuth();
  const tabs = ['Editor', ...(can('messagebuilder.history') ? ['Versandhistorie'] : []), ...(can('messagebuilder.templates_edit') || can('messagebuilder.channels') || can('messagebuilder.webhooks') ? ['Einstellungen'] : [])];
  const [tab, setTab] = useState('Editor');
  const d = useMbData();
  return (
    <div>
      <PageHeader title="Discord Message Builder" subtitle={d.server.data?.guild ? `Nachrichten und Embeds für ${d.server.data.guild.name} bauen und über den Bot senden` : 'Nachrichten und Embeds bauen und über den Bot senden'} />
      {tabs.length > 1 && <div className="mb-4"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>}
      {tab === 'Editor' && <EditorTab d={d} />}
      {tab === 'Versandhistorie' && <History />}
      {tab === 'Einstellungen' && <SettingsTab can={can} categories={d.categories.data ?? []} channels={d.server.data?.channels ?? []} />}
    </div>
  );
}

function EditorTab({ d }: { d: ReturnType<typeof useMbData> }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const docId = params.get('doc');
  const open = (id: string | null) => setParams(id ? { doc: id } : {}, { replace: false });
  const refreshLists = () => void qc.invalidateQueries({ queryKey: ['mb-docs'] });

  const docQ = useQuery({ queryKey: ['mb-doc', docId], queryFn: () => api<MbDoc>(`/message-builder/documents/${docId}`), enabled: !!docId, staleTime: Infinity, gcTime: 0, retry: false });
  const create = useMutation({ mutationFn: (b: { kind: 'DRAFT' | 'TEMPLATE'; name: string; categoryId?: string | null; data?: MbDocumentData }) => api<MbDoc>('/message-builder/documents', { method: 'POST', body: b }), onSuccess: (doc) => { refreshLists(); open(doc.id); } });
  const copy = useMutation({ mutationFn: (b: { id: string; kind: 'DRAFT' | 'TEMPLATE'; name?: string; categoryId?: string | null }) => api<MbDoc>(`/message-builder/documents/${b.id}/copy`, { method: 'POST', body: { kind: b.kind, ...(b.name ? { name: b.name } : {}), ...(b.categoryId !== undefined ? { categoryId: b.categoryId } : {}) } }), onSuccess: (doc) => { refreshLists(); open(doc.id); } });
  const remove = useMutation({ mutationFn: (id: string) => api(`/message-builder/documents/${id}`, { method: 'DELETE' }), onSuccess: (_r, id) => { refreshLists(); if (id === docId) open(null); } });

  // Ohne geöffnetes Dokument: zuletzt bearbeiteten eigenen Entwurf öffnen
  useEffect(() => {
    if (!docId && d.drafts.data?.length) open(d.drafts.data[0]!.id);
  }, [docId, d.drafts.data]);

  const loaded = docQ.data && docQ.data.id === docId ? docQ.data : null;
  const readOnly = !loaded || (loaded.kind === 'DRAFT' ? !can('messagebuilder.create') : !can('messagebuilder.templates_edit'));
  const auto = useDocAutosave(loaded, readOnly);
  const doc = auto.doc;
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [docId]);
  const [mode, setMode] = useState<'bot' | 'test' | 'webhook'>(can('messagebuilder.send') ? 'bot' : 'test');
  const [localChannel, setLocalChannel] = useState<string | null>(null);
  useEffect(() => setLocalChannel(loaded?.channelId ?? null), [loaded?.id]);
  const webhooks = useQuery({ queryKey: ['mb-webhooks'], queryFn: () => api<Webhook[]>('/message-builder/webhooks'), enabled: can('messagebuilder.webhooks') });

  const server = d.server.data;
  const ctx: EditorCtx = { roles: server?.roles ?? [], channels: server?.channels ?? [], canRoles: can('messagebuilder.roles'), readOnly };
  const mdCtx = useMemo(() => ({ roleName: (id: string) => server?.roles.find((r) => r.id === id), channelName: (id: string) => server?.channels.find((c) => c.id === id)?.name }), [server]);
  const issues = useMemo(() => (doc ? validateMbDocument(doc.data, { target: mode === 'webhook' ? 'webhook' : 'bot', allowRoleActions: can('messagebuilder.roles'), ...(server?.guild ? { roleIds: server.roles.map((r) => r.id) } : {}) }) : []), [doc, mode, server]);
  const msgs = doc?.data.messages ?? [];
  const cur = msgs[Math.min(sel, Math.max(0, msgs.length - 1))];
  const setData = (fn: (x: MbDocumentData) => MbDocumentData) => auto.setDoc((x) => ({ ...x, data: fn(x.data) }));

  const [confirmDel, setConfirmDel] = useState<DocMeta | null>(null);
  const [asTemplate, setAsTemplate] = useState(false);
  const [rename, setRename] = useState<DocMeta | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  if (d.drafts.isError) return <ErrorState error={d.drafts.error} onRetry={() => void d.drafts.refetch()} />;
  const cats = d.categories.data ?? [];
  const tplByCat = [...cats.map((c) => ({ id: c.id as string | null, name: c.name })), { id: null, name: 'Ohne Kategorie' }]
    .map((c) => ({ ...c, items: (d.templates.data ?? []).filter((t) => t.categoryId === c.id && t.name.toLowerCase().includes(filter.toLowerCase())) }))
    .filter((c) => c.items.length);
  const author = mode === 'webhook' && doc?.data.webhookProfile.username ? { name: doc.data.webhookProfile.username, avatar: doc.data.webhookProfile.avatarUrl || null, app: false } : { name: 'EN | POLIZEI', avatar: server?.guild?.icon ?? null, app: true };

  return (
    <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_minmax(0,1fr)]">
      {/* ───── Links: Nachrichten, Entwürfe, Vorlagen ───── */}
      <div className="grid content-start gap-4">
        {doc && (
          <Card title={<span className="flex items-center gap-1.5">Nachrichten <span className="text-xs font-normal text-muted">{msgs.length}/{MB_LIMITS.messagesPerGroup}</span></span>}
            actions={!readOnly && <Button size="sm" variant="secondary" disabled={msgs.length >= MB_LIMITS.messagesPerGroup} onClick={() => { setData((x) => ({ ...x, messages: [...x.messages, emptyMbMessage()] })); setSel(msgs.length); }}><Plus size={14} />Neu</Button>}>
            <ol className="grid gap-1">
              {msgs.map((m, i) => {
                const errs = issues.filter((x) => x.level === 'error' && x.path[1] === i).length;
                return (
                  <li key={m.id} className={`flex items-center gap-1 rounded border px-1.5 py-1 ${i === sel ? 'border-primary bg-primary/10' : 'border-line'}`}>
                    <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => setSel(i)} aria-current={i === sel}>
                      <span className="block font-medium">Nachricht {i + 1}{errs > 0 && <span className="ml-1 text-xs text-danger">({errs} Fehler)</span>}</span>
                      <span className="block truncate text-xs text-muted">{m.content.trim().split('\n')[0] || mbSummary(m)}</span>
                    </button>
                    {!readOnly && (
                      <span className="flex flex-col">
                        <span className="flex"><Button size="sm" variant="ghost" aria-label={`Nachricht ${i + 1} nach oben`} disabled={i === 0} onClick={() => { setData((x) => ({ ...x, messages: move(x.messages, i, -1) })); setSel(i - 1); }}><ArrowUp size={13} /></Button>
                          <Button size="sm" variant="ghost" aria-label={`Nachricht ${i + 1} nach unten`} disabled={i === msgs.length - 1} onClick={() => { setData((x) => ({ ...x, messages: move(x.messages, i, 1) })); setSel(i + 1); }}><ArrowDown size={13} /></Button></span>
                        <span className="flex"><Button size="sm" variant="ghost" aria-label={`Nachricht ${i + 1} duplizieren`} disabled={msgs.length >= MB_LIMITS.messagesPerGroup} onClick={() => { setData((x) => ({ ...x, messages: [...x.messages.slice(0, i + 1), cloneWithNewIds(x.messages[i]!), ...x.messages.slice(i + 1)] })); setSel(i + 1); }}><Copy size={13} /></Button>
                          <Button size="sm" variant="ghost" aria-label={`Nachricht ${i + 1} entfernen`} disabled={msgs.length <= 1} className="hover:text-danger" onClick={() => { setData((x) => ({ ...x, messages: x.messages.filter((_, j) => j !== i) })); setSel(Math.max(0, i - 1)); }}><Trash2 size={13} /></Button></span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        <Card title="Meine Entwürfe" actions={can('messagebuilder.create') && <Button size="sm" variant="secondary" disabled={create.isPending} onClick={() => create.mutate({ kind: 'DRAFT', name: `Entwurf ${new Date().toLocaleDateString('de-DE')}` })}><FilePlus2 size={14} />Neu</Button>}>
          {d.drafts.isLoading ? <SkeletonRows rows={2} /> : !d.drafts.data?.length ? <p className="text-xs text-muted">Noch keine Entwürfe.{can('messagebuilder.create') ? ' „Neu“ legt einen an – er wird automatisch gespeichert.' : ''}</p> : (
            <ul className="grid max-h-64 gap-1 overflow-auto">
              {d.drafts.data.map((x) => (
                <li key={x.id} className={`flex items-center gap-1 rounded px-1.5 py-1 text-sm ${x.id === docId ? 'bg-primary/10' : 'hover:bg-panel-2'}`}>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => open(x.id)}><FileText size={14} className="shrink-0 text-muted" aria-hidden /><span className="truncate">{x.name}</span></button>
                  <Button size="sm" variant="ghost" aria-label={`Entwurf ${x.name} löschen`} className="hover:text-danger" onClick={() => setConfirmDel(x)}><Trash2 size={13} /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Vorlagen" actions={can('messagebuilder.templates_create') && <Button size="sm" variant="secondary" disabled={create.isPending} onClick={() => create.mutate({ kind: 'TEMPLATE', name: 'Neue Vorlage', categoryId: cats[0]?.id ?? null })}><Plus size={14} />Neu</Button>}>
          <Input aria-label="Vorlagen durchsuchen" placeholder="Suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-2 py-1 text-xs" />
          {d.templates.isLoading ? <SkeletonRows rows={2} /> : !tplByCat.length ? <p className="text-xs text-muted">Keine Vorlagen{filter ? ' gefunden' : ''}.</p> : (
            <div className="grid max-h-[28rem] gap-2 overflow-auto">
              {tplByCat.map((c) => (
                <div key={c.id ?? 'none'}>
                  <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{c.name}</p>
                  <ul className="grid gap-0.5">{c.items.map((t) => (
                    <li key={t.id} className={`rounded px-1.5 py-1 text-sm ${t.id === docId ? 'bg-primary/10' : 'hover:bg-panel-2'}`}>
                      <div className="flex items-center gap-1.5"><LayoutTemplate size={14} className="shrink-0 text-muted" aria-hidden /><span className="min-w-0 flex-1 truncate" title={t.name}>{t.name}</span><span className="text-[11px] text-muted">{t.messageCount}×</span></div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                        {can('messagebuilder.create') && <button type="button" className="text-primary hover:underline" onClick={() => copy.mutate({ id: t.id, kind: 'DRAFT' })}>Laden</button>}
                        <button type="button" className="text-primary hover:underline" onClick={() => open(t.id)}>{can('messagebuilder.templates_edit') ? 'Bearbeiten' : 'Ansehen'}</button>
                        {can('messagebuilder.templates_create') && <button type="button" className="text-primary hover:underline" onClick={() => copy.mutate({ id: t.id, kind: 'TEMPLATE' })}>Duplizieren</button>}
                        {can('messagebuilder.templates_edit') && <button type="button" className="text-primary hover:underline" onClick={() => setRename(t)}>Umbenennen</button>}
                        {can('messagebuilder.templates_delete') && <button type="button" className="text-danger hover:underline" onClick={() => setConfirmDel(t)}>Löschen</button>}
                      </div>
                    </li>
                  ))}</ul>
                </div>
              ))}
            </div>
          )}
        </Card>
        {(create.isError || copy.isError || remove.isError) && <p role="alert" className="text-xs text-danger">{errText(create.error ?? copy.error ?? remove.error)}</p>}
      </div>

      {/* ───── Mitte: Editor ───── */}
      <div className="grid content-start gap-4">
        {!docId ? (
          <Card><EmptyState text="Kein Entwurf geöffnet." hint={can('messagebuilder.create') ? 'Lege links einen Entwurf an oder lade eine Vorlage.' : 'Wähle links eine Vorlage zum Ansehen.'} action={can('messagebuilder.create') ? <Button onClick={() => create.mutate({ kind: 'DRAFT', name: `Entwurf ${new Date().toLocaleDateString('de-DE')}` })}><FilePlus2 size={14} />Neuer Entwurf</Button> : undefined} /></Card>
        ) : docQ.isError ? <Card><ErrorState error={docQ.error} onRetry={() => open(null)} /></Card> : !doc ? <Card><SkeletonRows /></Card> : (
          <>
            <Card title={
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={doc.kind === 'TEMPLATE' ? 'primary' : 'neutral'}>{doc.kind === 'TEMPLATE' ? 'Vorlage' : 'Entwurf'}</Badge>
                {readOnly ? <span className="text-xs text-muted">Nur ansehen</span> : <span role="status" aria-live="polite" className={`text-xs ${SAVE_VIEW[auto.status][1]}`} title={auto.error ?? undefined}>{SAVE_VIEW[auto.status][0]}</span>}
              </span>
            } actions={
              <span className="flex flex-wrap gap-1">
                {!readOnly && auto.status !== 'saved' && auto.status !== 'conflict' && <Button size="sm" variant="ghost" onClick={() => void auto.saveNow()}><Save size={14} />Jetzt speichern</Button>}
                {doc.kind === 'DRAFT' && can('messagebuilder.templates_create') && <Button size="sm" variant="secondary" onClick={() => { void auto.saveNow(); setAsTemplate(true); }}><LayoutTemplate size={14} />Als Vorlage speichern</Button>}
                <Button size="sm" variant="ghost" onClick={() => { setJsonErr(null); setJson(JSON.stringify(doc.data, null, 2)); }}>JSON</Button>
              </span>
            }>
              <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <label className="grid gap-1 text-xs text-muted">Name (nur im Dashboard)<Input aria-label="Name" maxLength={100} readOnly={readOnly} value={doc.name} onChange={(e) => auto.setDoc((x) => ({ ...x, name: e.target.value }))} /></label>
                {doc.kind === 'TEMPLATE' && (
                  <label className="grid gap-1 text-xs text-muted">Kategorie<Select aria-label="Kategorie" disabled={readOnly} value={doc.categoryId ?? ''} onChange={(e) => auto.setDoc((x) => ({ ...x, categoryId: e.target.value || null }))}><option value="">Ohne Kategorie</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
                )}
              </div>
              {doc.kind === 'TEMPLATE' && !readOnly && <p className="mt-2 text-xs text-warning">Du bearbeitest die Vorlage selbst – Änderungen werden automatisch gespeichert und gelten für alle. Zum einmaligen Anpassen lieber „Laden“ (als Entwurf).</p>}
              {auto.status === 'error' && auto.error && <p role="alert" className="mt-2 text-xs text-danger">{auto.error}</p>}
              {auto.restorable && (
                <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded border border-warning/40 bg-warning/10 p-2 text-xs">
                  <span>Im Browser liegen nicht gespeicherte Änderungen vom {new Date(auto.restorable.at).toLocaleString('de-DE')}.</span>
                  <Button size="sm" onClick={auto.restore}>Wiederherstellen</Button><Button size="sm" variant="ghost" onClick={auto.discardBackup}>Verwerfen</Button>
                </div>
              )}
            </Card>
            {cur && (
              <Card title={`Nachricht ${msgs.indexOf(cur) + 1} bearbeiten`}>
                <MessageEditor m={cur} index={msgs.indexOf(cur)} ctx={ctx} issues={issues} onChange={(m) => setData((x) => ({ ...x, messages: x.messages.map((y) => (y.id === m.id ? m : y)) }))} />
              </Card>
            )}
            {mode === 'webhook' && (
              <Card title="Webhook-Profil (nur beim Versand über Webhook)">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-muted">Name<Input aria-label="Webhook-Name im Profil" readOnly={readOnly} maxLength={80} value={doc.data.webhookProfile.username} onChange={(e) => setData((x) => ({ ...x, webhookProfile: { ...x.webhookProfile, username: e.target.value } }))} /></label>
                  <label className="grid gap-1 text-xs text-muted">Profilbild (URL)<Input aria-label="Webhook-Profilbild" type="url" readOnly={readOnly} value={doc.data.webhookProfile.avatarUrl} onChange={(e) => setData((x) => ({ ...x, webhookProfile: { ...x.webhookProfile, avatarUrl: e.target.value } }))} /></label>
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ───── Rechts: Live-Vorschau + Versand ───── */}
      <div className="grid content-start gap-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-auto">
        {doc && (
          <>
            <Card title="Live-Vorschau">
              <MessagePreview data={doc.data} ctx={mdCtx} selected={sel} onSelect={setSel} author={author} webhook={mode === 'webhook'} />
              <p className="mt-2 text-[11px] text-muted">Simulation: Schriften, Bildgrößen und Link-Vorschauen (automatische Embeds aus URLs im Text) können im Discord-Client abweichen. Benutzer-Erwähnungen zeigen hier nur die ID, Erwähnungen von Rollen/Kanälen die Namen vom Server. Klicks auf Aktions-Buttons/-Menüs werden nur simuliert.</p>
            </Card>
            {(can('messagebuilder.send') || can('messagebuilder.create')) && (
              <Card title="Senden">
                <SendPanel data={doc.data} name={doc.name} documentId={doc.id} channelId={localChannel} channels={server?.channels ?? []} channelHint={server ? channelHint(server) : null} issues={issues} can={can} webhooks={webhooks.data ?? []} mode={mode} onMode={setMode}
                  onChannel={(id) => { setLocalChannel(id); if (!readOnly) auto.setDoc((x) => ({ ...x, channelId: id })); }} />
              </Card>
            )}
          </>
        )}
      </div>

      <ConfirmDialog open={!!confirmDel} danger title={confirmDel?.kind === 'TEMPLATE' ? 'Vorlage löschen?' : 'Entwurf löschen?'} message={`„${confirmDel?.name}“ wird gelöscht. (Er bleibt als Archiv in der Datenbank und in Backups erhalten.)`} confirmLabel="Löschen" busy={remove.isPending}
        onClose={() => setConfirmDel(null)} onConfirm={() => { if (confirmDel) remove.mutate(confirmDel.id, { onSettled: () => setConfirmDel(null) }); }} />
      <SaveAsTemplate open={asTemplate} onClose={() => setAsTemplate(false)} name={doc?.name ?? ''} categories={cats} busy={copy.isPending} onSave={(name, categoryId) => doc && copy.mutate({ id: doc.id, kind: 'TEMPLATE', name, categoryId }, { onSuccess: () => setAsTemplate(false) })} />
      <RenameDialog doc={rename} onClose={() => setRename(null)} onDone={() => { refreshLists(); if (rename?.id === docId) void docQ.refetch(); }} />
      <Modal open={json !== null} wide title="JSON exportieren / importieren" onClose={() => setJson(null)}>
        <div className="grid gap-2">
          <p className="text-xs text-muted">Inhalt der Nachrichtengruppe. Kopieren zum Sichern/Teilen, oder geänderten Inhalt einfügen und übernehmen.</p>
          <Textarea aria-label="JSON" rows={14} className="font-mono text-xs" value={json ?? ''} onChange={(e) => setJson(e.target.value)} />
          {jsonErr && <p role="alert" className="text-xs text-danger">{jsonErr}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(json ?? '')}>Kopieren</Button>
            {!readOnly && <Button onClick={() => {
              try {
                const p = mbDocumentDataSchema.safeParse(JSON.parse(json ?? ''));
                if (!p.success) { setJsonErr(`Ungültig: ${p.error.issues[0]?.path.join('.')} – ${p.error.issues[0]?.message}`); return; }
                setData(() => cloneWithNewIds(p.data)); setSel(0); setJson(null);
              } catch { setJsonErr('Kein gültiges JSON.'); }
            }}>Übernehmen</Button>}
          </div>
        </div>
      </Modal>
      <Modal open={auto.status === 'conflict' && !!auto.conflict} title="Neuere Fassung vorhanden" onClose={() => undefined}>
        <p className="mb-3 text-sm">Diese {doc?.kind === 'TEMPLATE' ? 'Vorlage' : 'Nachrichtengruppe'} wurde inzwischen woanders gespeichert (anderer Tab oder andere Person). Es wurde nichts überschrieben.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => auto.resolveConflict('theirs')}>Neuere Fassung laden (meine Änderungen verwerfen)</Button>
          <Button onClick={() => auto.resolveConflict('mine')}>Meine Fassung speichern</Button>
        </div>
      </Modal>
    </div>
  );
}

function SaveAsTemplate({ open, onClose, name, categories, onSave, busy }: { open: boolean; onClose: () => void; name: string; categories: Category[]; onSave: (name: string, categoryId: string | null) => void; busy: boolean }) {
  const [n, setN] = useState(name);
  const [c, setC] = useState<string>('');
  useEffect(() => { if (open) { setN(name); setC(categories[0]?.id ?? ''); } }, [open]);
  return (
    <Modal open={open} title="Als Vorlage speichern" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (n.trim()) onSave(n.trim(), c || null); }}>
        <label className="grid gap-1 text-xs text-muted">Name der Vorlage<Input aria-label="Name der Vorlage" maxLength={100} value={n} onChange={(e) => setN(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Kategorie<Select aria-label="Kategorie der Vorlage" value={c} onChange={(e) => setC(e.target.value)}><option value="">Ohne Kategorie</option>{categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={busy || !n.trim()}>Speichern</Button></div>
      </form>
    </Modal>
  );
}

function RenameDialog({ doc, onClose, onDone }: { doc: DocMeta | null; onClose: () => void; onDone: () => void }) {
  const [n, setN] = useState('');
  useEffect(() => setN(doc?.name ?? ''), [doc]);
  const m = useMutation({
    mutationFn: async () => {
      const full = await api<MbDoc>(`/message-builder/documents/${doc!.id}`);
      return api(`/message-builder/documents/${doc!.id}`, { method: 'PUT', body: { name: n.trim(), categoryId: full.categoryId, channelId: full.channelId, data: full.data, version: full.version } });
    },
    onSuccess: () => { onDone(); onClose(); },
  });
  return (
    <Modal open={!!doc} title="Vorlage umbenennen" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (n.trim()) m.mutate(); }}>
        <Input aria-label="Neuer Name" maxLength={100} value={n} onChange={(e) => setN(e.target.value)} />
        {m.isError && <p role="alert" className="text-xs text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={m.isPending || !n.trim()}><Pencil size={14} />Umbenennen</Button></div>
      </form>
    </Modal>
  );
}
