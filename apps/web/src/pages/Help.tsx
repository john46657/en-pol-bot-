import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Plus } from 'lucide-react';
import { HELP_ARTICLE_KIND_LABEL, HELP_ARTICLE_KINDS, HELP_ARTICLE_STATUS_LABEL, HELP_ARTICLE_STATUSES } from '@enrp/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../components/ui';

type Kind = (typeof HELP_ARTICLE_KINDS)[number]; type Status = (typeof HELP_ARTICLE_STATUSES)[number];
interface Category { id: string; name: string; description: string | null; icon: string | null; position: number; _count: { articles: number } }
interface ArticleRow { id: string; slug: string; title: string; kind: Kind; summary: string | null; status: Status; tags: string[]; categoryId: string | null; version: number; updatedAt: string; category: { name: string } | null }
interface Article extends ArticleRow { body: string; mediaIds: string[] }

/** Hilfe-Center: Kategorien, Artikel/Anleitungen/FAQ, Suche; Bearbeiten mit Veröffentlichungsstatus und Änderungsverlauf (help.manage). */
export function HelpCenter() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = can('help.manage');
  const [f, setF] = useState({ q: '', categoryId: '', kind: '', status: '', page: 1 });
  const cats = useQuery({ queryKey: ['help-cats'], queryFn: () => api<Category[]>('/help/categories') });
  const list = useQuery({ queryKey: ['help-articles', f], queryFn: () => api<{ total: number; pageSize: number; rows: ArticleRow[] }>('/help/articles', { query: { q: f.q || undefined, categoryId: f.categoryId || undefined, kind: f.kind || undefined, status: f.status || undefined, page: f.page } }) });
  const [open, setOpen] = useState<string | null>(null);
  const art = useQuery({ queryKey: ['help-article', open], queryFn: () => api<Article>(`/help/articles/${open}`), enabled: !!open });
  const [edit, setEdit] = useState<Article | 'new' | null>(null);
  const [cat, setCat] = useState<Category | 'new' | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / (list.data?.pageSize ?? 30)));
  return (
    <>
      <PageHeader title="❓ Hilfe-Center" subtitle="Anleitungen, häufige Fragen und Wissen rund um MDT, Leitstelle, Dienst, Ausbildung und Support. Technisches Problem? Über „Support-Tickets“ bzw. /support in Discord melden."
        actions={manage ? <><Button variant="secondary" onClick={() => setCat('new')}>Kategorie</Button><Button onClick={() => setEdit('new')}><Plus size={16} />Artikel</Button></> : undefined} />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-full sm:w-80"><Input aria-label="Hilfe durchsuchen" placeholder="🔍 Wie melde ich mich zum Dienst?" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} /></div>
        <Select aria-label="Kategorie" className="w-48" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value, page: 1 })}><option value="">Alle Kategorien</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}</Select>
        <Select aria-label="Art" className="w-40" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, page: 1 })}><option value="">Alle Arten</option>{HELP_ARTICLE_KINDS.map((k) => <option key={k} value={k}>{HELP_ARTICLE_KIND_LABEL[k]}</option>)}</Select>
        {manage && <Select aria-label="Status" className="w-40" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">Entwürfe + veröffentlicht</option>{HELP_ARTICLE_STATUSES.map((k) => <option key={k} value={k}>{HELP_ARTICLE_STATUS_LABEL[k]}</option>)}</Select>}
      </div>
      {manage && (cats.data?.length ?? 0) > 0 && <div className="mb-3 flex flex-wrap gap-2 text-xs">{cats.data!.map((c) => <button key={c.id} type="button" className="rounded-full border border-line px-2 py-1 hover:bg-panel-2" onClick={() => setCat(c)}>{c.icon} {c.name} ({c._count.articles}) ✎</button>)}</div>}
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} /> : !list.data?.rows.length ? <EmptyState text={f.q ? 'Nichts gefunden.' : 'Noch keine Artikel.'} hint={f.q ? 'Anderen Begriff versuchen oder ein Support-Ticket erstellen.' : undefined} /> : (
            <>
              <ul className="grid gap-1">{list.data.rows.map((a) => (
                <li key={a.id}><button type="button" onClick={() => setOpen(a.id)} className={`w-full rounded-md px-2 py-2 text-left text-sm hover:bg-panel-2 ${open === a.id ? 'bg-panel-2' : ''}`}>
                  <b>{a.title}</b> <Badge>{HELP_ARTICLE_KIND_LABEL[a.kind]}</Badge>{a.status !== 'PUBLISHED' && <Badge tone="warning">{HELP_ARTICLE_STATUS_LABEL[a.status]}</Badge>}
                  {a.summary && <span className="block text-xs text-muted">{a.summary}</span>}{a.category && <span className="block text-xs text-muted">{a.category.name}</span>}
                </button></li>))}</ul>
              {pages > 1 && <div className="mt-2 flex justify-end gap-2 text-sm"><Button size="sm" variant="ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Zurück</Button><span>{f.page}/{pages}</span><Button size="sm" variant="ghost" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Weiter</Button></div>}
            </>
          )}
        </Card>
        <Card title={art.data?.title ?? 'Artikel'} actions={art.data && manage ? <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setHist(art.data!.id)}><History size={14} />Verlauf</Button><Button size="sm" variant="secondary" onClick={() => setEdit(art.data!)}>Bearbeiten</Button></div> : undefined}>
          {!open ? <EmptyState text="Links einen Artikel wählen." /> : art.isLoading ? <SkeletonRows /> : art.error ? <ErrorState error={art.error} /> : art.data && (
            <article className="text-sm">
              {art.data.summary && <p className="mb-2 text-muted">{art.data.summary}</p>}
              <div className="whitespace-pre-wrap leading-relaxed">{art.data.body}</div>
              {art.data.mediaIds.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{art.data.mediaIds.map((m) => <img key={m} src={`/api/v1/media/${m}`} alt="" className="max-h-48 rounded-md border border-line" />)}</div>}
              <p className="mt-3 text-xs text-muted">{art.data.tags.map((t) => `#${t}`).join(' ')} · Version {art.data.version} · {fmt(art.data.updatedAt)}</p>
            </article>
          )}
        </Card>
      </div>
      {edit && <ArticleForm a={edit === 'new' ? null : edit} cats={cats.data ?? []} onClose={() => setEdit(null)} onDone={(id) => { setEdit(null); setOpen(id); void qc.invalidateQueries({ queryKey: ['help-articles'] }); void qc.invalidateQueries({ queryKey: ['help-article'] }); void qc.invalidateQueries({ queryKey: ['help-cats'] }); }} />}
      {cat && <CategoryForm c={cat === 'new' ? null : cat} onClose={() => setCat(null)} onDone={() => { setCat(null); void qc.invalidateQueries({ queryKey: ['help-cats'] }); }} />}
      {hist && <Revisions id={hist} onClose={() => setHist(null)} />}
    </>
  );
}

function ArticleForm({ a, cats, onClose, onDone }: { a: Article | null; cats: Category[]; onClose: () => void; onDone: (id: string) => void }) {
  const [v, setV] = useState({ title: a?.title ?? '', categoryId: a?.categoryId ?? '', kind: a?.kind ?? 'ARTICLE' as Kind, summary: a?.summary ?? '', body: a?.body ?? '', tags: (a?.tags ?? []).join(', '), status: a?.status ?? 'DRAFT' as Status, changeNote: '' });
  const [media, setMedia] = useState<string[]>(a?.mediaIds ?? []);
  const upload = useMutation({ mutationFn: async (file: File) => { const fd = new FormData(); fd.append('file', file); fd.append('linkedType', 'HelpAsset'); fd.append('linkedId', a?.id ?? 'new'); return api<{ id: string }>('/media', { formData: fd }); }, onSuccess: (m) => setMedia([...media, m.id]) });
  const m = useMutation({ mutationFn: () => api<{ id: string }>(a ? `/help/articles/${a.id}` : '/help/articles', { method: a ? 'PUT' : 'POST', body: { title: v.title, categoryId: v.categoryId || null, kind: v.kind, summary: v.summary || null, body: v.body, tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean), mediaIds: media, status: v.status, changeNote: v.changeNote || undefined, ...(a ? { version: a.version } : {}) } }), onSuccess: (r) => onDone(r.id) });
  return (
    <Modal open wide title={a ? 'Artikel bearbeiten' : 'Neuer Artikel'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm sm:col-span-2">Titel<Input value={v.title} maxLength={160} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Kategorie<Select value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}><option value="">– keine –</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Art<Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Kind })}>{HELP_ARTICLE_KINDS.map((k) => <option key={k} value={k}>{HELP_ARTICLE_KIND_LABEL[k]}</option>)}</Select></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Kurzfassung<Input value={v.summary} maxLength={500} onChange={(e) => setV({ ...v, summary: e.target.value })} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Inhalt<Textarea rows={12} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Schlagwörter (Komma)<Input value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Status<Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as Status })}>{HELP_ARTICLE_STATUSES.map((k) => <option key={k} value={k}>{HELP_ARTICLE_STATUS_LABEL[k]}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Bilder/Dokumente<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = ''; }} /><span className="text-xs text-muted">{media.length} angehängt</span></label>
        {a && <label className="grid gap-1 text-sm">Änderungsgrund<Input value={v.changeNote} maxLength={300} onChange={(e) => setV({ ...v, changeNote: e.target.value })} /></label>}
      </div>
      {(m.error || upload.error) && <p role="alert" className="mt-2 text-sm text-danger">{errText(m.error ?? upload.error)}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={v.title.trim().length < 3 || m.isPending} onClick={() => m.mutate()}>Speichern</Button></div>
    </Modal>
  );
}

function CategoryForm({ c, onClose, onDone }: { c: Category | null; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ name: c?.name ?? '', description: c?.description ?? '', icon: c?.icon ?? '', position: c?.position ?? 0 });
  const m = useMutation({ mutationFn: () => api(c ? `/help/categories/${c.id}` : '/help/categories', { method: c ? 'PUT' : 'POST', body: { ...v, description: v.description || null, icon: v.icon || null } }), onSuccess: onDone });
  return (
    <Modal open title={c ? 'Kategorie bearbeiten' : 'Neue Kategorie'} onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">Name<Input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Symbol (Emoji)<Input value={v.icon} maxLength={8} onChange={(e) => setV({ ...v, icon: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Beschreibung<Input value={v.description} maxLength={500} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Reihenfolge<Input type="number" min={0} value={v.position} onChange={(e) => setV({ ...v, position: Number(e.target.value) })} /></label>
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={v.name.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>Speichern</Button></div>
      </div>
    </Modal>
  );
}

function Revisions({ id, onClose }: { id: string; onClose: () => void }) {
  const r = useQuery({ queryKey: ['help-revs', id], queryFn: () => api<{ id: string; version: number; title: string; status: Status; changeNote: string | null; editedBy: string; createdAt: string; body: string }[]>(`/help/articles/${id}/revisions`) });
  return (
    <Modal open wide title="Änderungsverlauf" onClose={onClose}>
      {r.isLoading ? <SkeletonRows /> : !r.data?.length ? <EmptyState text="Noch keine früheren Fassungen." /> : <ul className="grid gap-2 text-sm">{r.data.map((x) => <li key={x.id} className="rounded-md border border-line p-2"><p className="text-xs text-muted">Version {x.version} ({HELP_ARTICLE_STATUS_LABEL[x.status]}) – ersetzt von {x.editedBy} am {fmt(x.createdAt)}{x.changeNote && ` · ${x.changeNote}`}</p><p className="font-medium">{x.title}</p><details><summary className="cursor-pointer text-xs text-muted">Inhalt</summary><p className="whitespace-pre-wrap text-xs">{x.body}</p></details></li>)}</ul>}
    </Modal>
  );
}
