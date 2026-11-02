import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Download, Search, Upload } from 'lucide-react';
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL } from '@enrp/shared';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { download, fmtDateTime } from '../lib/admin';
import { Badge, Button, Card, confirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../components/ui';

interface Doc { id: string; title: string; category: string; categoryLabel: string; description: string | null; access: string; roleIds: string[]; status: string; currentVersion: number; updatedAt: string; createdByName: string; updatedByName: string | null; version: number; versions?: { number: number; note: string | null; createdAt: string; by: string; restoredFrom: number | null; file: { originalName: string; size: number } | null }[] }
const ACCESS: Record<string, string> = { ALL: 'Alle mit Dokumentenzugriff', ROLES: 'Nur bestimmte Rollen', CONFIDENTIAL: 'Vertraulich' };
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
const ACCEPT = '.pdf,.txt,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,image/png,image/jpeg,image/webp';

/** Organisation → Dokumente: suchen, ansehen/herunterladen, hochladen, Versionen, Zugriff, Archiv. Zugriff wird bei jedem Abruf serverseitig geprüft. */
export function Documents() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [archived, setArchived] = useState(false);
  const [uploading, setUploading] = useState(false);
  const list = useQuery({ queryKey: ['documents', q, category, archived], queryFn: () => api<{ canUpload: boolean; canManage: boolean; canConfidential: boolean; items: Doc[] }>('/documents', { query: { q: q.trim() || undefined, category: category || undefined, archived: archived || undefined } }) });
  const open = params.get('id');
  return (
    <>
      <PageHeader title="Dokumente" subtitle="Dienstanweisungen, Regelwerke, Ausbildungs- und Prüfungsunterlagen, Leitstelleninformationen, Richtlinien und Vorlagen. Erlaubt: PDF, Text, Bilder bis 10 MB."
        actions={list.data?.canUpload ? <Button onClick={() => setUploading(true)}><Upload size={16} className="mr-1" />Hochladen</Button> : undefined} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Suche" className="pl-8" placeholder="Titel oder Beschreibung …" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Kategorie" className="w-52" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Alle Kategorien</option>{DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>)}</Select>
        {list.data?.canManage && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Archiv</label>}
      </div>
      {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} /> : !list.data?.items.length ? <EmptyState text="Keine Dokumente gefunden." /> : (
        <Card className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Dokument</th><th className="p-2">Kategorie</th><th className="p-2">Version</th><th className="p-2">Zugriff</th><th className="p-2">Letzte Änderung</th><th /></tr></thead>
          <tbody>{list.data.items.map((d) => (
            <tr key={d.id} className="border-b border-line/60">
              <td className="p-2"><button type="button" className="font-medium hover:underline" onClick={() => setParams({ id: d.id })}>{d.title}</button>{d.description && <span className="block text-xs text-muted">{d.description}</span>}</td>
              <td className="p-2">{d.categoryLabel}</td><td className="p-2">v{d.currentVersion}</td>
              <td className="p-2">{d.access === 'ALL' ? <Badge>alle</Badge> : <Badge tone={d.access === 'CONFIDENTIAL' ? 'danger' : 'warning'}>{d.access === 'CONFIDENTIAL' ? 'vertraulich' : 'Rollen'}</Badge>}</td>
              <td className="p-2 text-xs">{fmtDateTime(d.updatedAt)}<span className="block text-muted">{d.updatedByName ?? d.createdByName}</span></td>
              <td className="p-2 text-right"><Button size="sm" variant="ghost" aria-label={`${d.title} herunterladen`} onClick={() => void download(`/documents/${d.id}/download`, d.title)}><Download size={14} /></Button></td>
            </tr>
          ))}</tbody>
        </table></Card>
      )}
      {open && <DocDetail id={open} canManage={!!list.data?.canManage} canUpload={!!list.data?.canUpload} canConfidential={!!list.data?.canConfidential} onClose={() => setParams({})} />}
      {uploading && <UploadForm canConfidential={!!list.data?.canConfidential} onClose={() => setUploading(false)} />}
    </>
  );
}

function DocDetail({ id, canManage, canUpload, canConfidential, onClose }: { id: string; canManage: boolean; canUpload: boolean; canConfidential: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['documents', 'detail', id], queryFn: () => api<Doc>(`/documents/${id}`), retry: false });
  const roles = useQuery({ queryKey: ['roles-min'], queryFn: () => api<{ id: string; name: string }[]>('/roles').catch(() => []), enabled: canManage });
  const [err, setErr] = useState<string>();
  const [file, setFile] = useState<File>();
  const [note, setNote] = useState('');
  const [meta, setMeta] = useState<{ access: string; roleIds: string[] }>();
  const inv = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['documents'] }); };
  const act = useMutation({ mutationFn: (v: { path: string; body?: unknown; method?: string }) => api(`/documents/${id}${v.path}`, { method: v.method ?? 'POST', body: v.body ?? {} }), onSuccess: () => { setMeta(undefined); inv(); }, onError: (e) => setErr(errText(e)) });
  const upload = useMutation({ mutationFn: () => { const fd = new FormData(); fd.append('file', file!); if (note) fd.append('note', note); return api(`/documents/${id}/versions`, { formData: fd }); }, onSuccess: () => { setFile(undefined); setNote(''); inv(); }, onError: (e) => setErr(errText(e)) });
  const d = q.data;
  const m = meta ?? (d ? { access: d.access, roleIds: d.roleIds } : undefined);
  return (
    <Modal open wide title={d?.title ?? 'Dokument'} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error || !d || !m ? <ErrorState error={q.error} /> : (
        <div className="grid gap-4 text-sm">
          <p className="flex flex-wrap items-center gap-2"><Badge>{d.categoryLabel}</Badge><Badge tone={d.access === 'CONFIDENTIAL' ? 'danger' : d.access === 'ROLES' ? 'warning' : 'neutral'}>{ACCESS[d.access]}</Badge>{d.status === 'ARCHIVED' && <Badge tone="warning">Archiviert</Badge>}</p>
          {d.description && <p className="whitespace-pre-wrap text-muted">{d.description}</p>}
          <Button className="w-fit" onClick={() => void download(`/documents/${id}/download`, d.title).catch((e: Error) => setErr(e.message))}><Download size={14} className="mr-1" />Aktuelle Version (v{d.currentVersion}) herunterladen</Button>
          <section aria-label="Versionen"><h3 className="mb-1 font-semibold">Versionen</h3>
            <ul className="divide-y divide-line">{d.versions?.map((v) => (
              <li key={v.number} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>v{v.number}{v.number === d.currentVersion && <Badge tone="success">aktuell</Badge>} · {fmtDateTime(v.createdAt)} · {v.by}{v.file && <span className="text-xs text-muted"> · {v.file.originalName} ({size(v.file.size)})</span>}{v.note && <span className="block text-xs text-muted">{v.note}</span>}</span>
                <span className="flex gap-1">{canUpload && v.number !== d.currentVersion && <Button size="sm" variant="ghost" onClick={() => void download(`/documents/${id}/download?version=${v.number}`, `${d.title}-v${v.number}`)}>Laden</Button>}{canManage && v.number !== d.currentVersion && d.status === 'ACTIVE' && <Button size="sm" variant="ghost" onClick={async () => { if (await confirmDialog(`Version ${v.number} als neue aktuelle Version übernehmen? Bisherige Versionen bleiben erhalten.`, { confirmLabel: 'Wiederherstellen', danger: false })) act.mutate({ path: `/versions/${v.number}/restore` }); }}>Wiederherstellen</Button>}</span>
              </li>
            ))}</ul>
          </section>
          {canUpload && d.status === 'ACTIVE' && (
            <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); upload.mutate(); }}>
              <Input aria-label="Neue Version" type="file" accept={ACCEPT} required onChange={(e) => setFile(e.target.files?.[0])} />
              <Input aria-label="Änderungsnotiz" placeholder="Was hat sich geändert?" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" disabled={!file || upload.isPending}>Neue Version</Button>
            </form>
          )}
          {canManage && (
            <section className="grid gap-2 border-t border-line pt-3" aria-label="Zugriff">
              <Field label="Zugriffsgruppe">{(fid) => <Select id={fid} value={m.access} onChange={(e) => setMeta({ ...m, access: e.target.value })}>{Object.entries(ACCESS).filter(([k]) => k !== 'CONFIDENTIAL' || canConfidential || d.access === 'CONFIDENTIAL').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
              {m.access === 'ROLES' && <div className="flex flex-wrap gap-2">{roles.data?.map((r) => <label key={r.id} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={m.roleIds.includes(r.id)} onChange={(e) => setMeta({ ...m, roleIds: e.target.checked ? [...m.roleIds, r.id] : m.roleIds.filter((x) => x !== r.id) })} />{r.name}</label>)}</div>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!meta || act.isPending} onClick={() => act.mutate({ path: '', method: 'PATCH', body: { title: d.title, category: d.category, description: d.description, access: m.access, roleIds: m.access === 'ROLES' ? m.roleIds : [], version: d.version } })}>Zugriff speichern</Button>
                <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: '/archive', body: { archived: d.status === 'ACTIVE' } })}>{d.status === 'ACTIVE' ? 'Archivieren' : 'Aus dem Archiv holen'}</Button>
              </div>
            </section>
          )}
          {err && <p role="alert" className="text-danger">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

function UploadForm({ canConfidential, onClose }: { canConfidential: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ title: '', category: 'DIRECTIVE', description: '', access: 'ALL', note: '' });
  const [file, setFile] = useState<File>();
  const save = useMutation({
    mutationFn: () => { const fd = new FormData(); fd.append('file', file!); for (const [k, x] of Object.entries(v)) if (x) fd.append(k, x); return api('/documents', { formData: fd }); },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['documents'] }); onClose(); },
  });
  return (
    <Modal open title="Dokument hochladen" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Datei (PDF, Text, PNG/JPG/WebP, max. 10 MB)">{(id) => <Input id={id} type="file" accept={ACCEPT} required onChange={(e) => setFile(e.target.files?.[0])} />}</Field>
        {file && file.size > 10 * 1048576 && <p role="alert" className="text-xs text-danger">Die Datei ist größer als 10 MB.</p>}
        <Field label="Dokumentname">{(id) => <Input id={id} required minLength={2} maxLength={150} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        <Field label="Kategorie">{(id) => <Select id={id} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>)}</Select>}</Field>
        <Field label="Beschreibung">{(id) => <Textarea id={id} rows={2} maxLength={2000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <Field label="Zugriffsgruppe" hint="Rollen-Zugriff nach dem Hochladen im Dokument festlegen">{(id) => <Select id={id} value={v.access} onChange={(e) => setV({ ...v, access: e.target.value })}><option value="ALL">{ACCESS.ALL}</option>{canConfidential && <option value="CONFIDENTIAL">{ACCESS.CONFIDENTIAL}</option>}</Select>}</Field>
        {save.error && <p role="alert" className="text-sm text-danger">{errText(save.error)}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!file || save.isPending || file.size > 10 * 1048576}>{save.isPending ? 'Lädt hoch …' : 'Hochladen'}</Button></div>
      </form>
    </Modal>
  );
}
