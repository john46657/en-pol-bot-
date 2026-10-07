import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasPending, onSaved, pendingBody, queueSave } from '../lib/autosave';
import { guildName, useGuilds, useServer } from '../lib/guilds';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, Textarea } from '../components/ui';
import { useAutosaveDraft } from '../lib/autosave';
import { errText } from '../lib/tickets';
import { ChannelPicker } from '../components/DiscordPickers';
import { Toggle } from '../components/ApplicationSettings';
import { Send } from 'lucide-react';

interface DiscordCfg { channelId: string | null; title: string; description: string; color: string; groupByCategory: boolean; showDescription: boolean; autoUpdate: boolean; posted?: { channelId: string; messageId: string } | null }

const strip = (c: DiscordCfg) => ({ channelId: c.channelId, title: c.title, description: c.description, color: c.color, groupByCategory: c.groupByCategory, showDescription: c.showDescription, autoUpdate: c.autoUpdate });

/** Funk-Codes als Nachricht in einen Discord-Kanal senden (und später dieselbe Nachricht aktualisieren). */
function RadioDiscordCard({ manage }: { manage: boolean }) {
  const [server] = useServer();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['radio-discord', server], queryFn: () => api<DiscordCfg>('/radio-codes/discord') });
  const [cfg, setCfg] = useState<DiscordCfg>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  useEffect(() => { if (q.data) setCfg((c) => c ?? q.data); }, [q.data]);
  useEffect(() => setCfg(undefined), [server]);
  useAutosaveDraft(manage && cfg ? `radio-discord:${server || 'all'}` : null, cfg, (c) => ({ method: 'PUT', path: '/radio-codes/discord', body: strip(c), label: 'Funk-Codes in Discord' }));
  const send = useMutation({
    mutationFn: async (mode: 'update' | 'new') => { await api('/radio-codes/discord', { method: 'PUT', body: strip(cfg!) }); return api('/radio-codes/discord/send', { method: 'POST', body: { mode } }); },
    onSuccess: (_r, mode) => { setMsg({ ok: true, text: mode === 'update' && cfg?.posted ? 'Wird aktualisiert …' : 'Wird gesendet …' }); setTimeout(() => void qc.invalidateQueries({ queryKey: ['radio-discord', server] }), 4000); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  if (!cfg) return null;
  const set = (p: Partial<DiscordCfg>) => setCfg({ ...cfg, ...p });
  const posted = q.data?.posted;
  return (
    <Card title="In Discord senden" className="mb-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Kanal<ChannelPicker ariaLabel="Kanal für Funk-Codes" disabled={!manage} value={cfg.channelId} onChange={(id) => set({ channelId: id })} /></label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="grid gap-1 text-sm">Titel<Input aria-label="Titel der Funk-Code-Nachricht" disabled={!manage} maxLength={256} value={cfg.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Farbe<input type="color" aria-label="Farbe" disabled={!manage} value={cfg.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-16 rounded border border-line bg-transparent" /></label>
        </div>
        <label className="grid gap-1 text-sm md:col-span-2">Text oben (optional)<Textarea aria-label="Text oben" rows={2} disabled={!manage} maxLength={2000} value={cfg.description} onChange={(e) => set({ description: e.target.value })} /></label>
        <div className="flex flex-wrap gap-4 text-sm md:col-span-2">
          <label className="flex items-center gap-2"><Toggle label="Nach Kategorie gruppieren" checked={cfg.groupByCategory} onChange={(v) => set({ groupByCategory: v })} />Nach Kategorie gruppieren</label>
          <label className="flex items-center gap-2"><Toggle label="Beschreibung anzeigen" checked={cfg.showDescription} onChange={(v) => set({ showDescription: v })} />Beschreibung anzeigen</label>
          <label className="flex items-center gap-2"><Toggle label="Automatisch aktualisieren" checked={cfg.autoUpdate} onChange={(v) => set({ autoUpdate: v })} />Bei Änderungen automatisch aktualisieren</label>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {posted && posted.channelId === cfg.channelId
          ? <><Button disabled={!manage || send.isPending} onClick={() => send.mutate('update')}><Send size={14} className="mr-1" />Nachricht aktualisieren</Button><Button variant="secondary" disabled={!manage || send.isPending} onClick={() => send.mutate('new')}>Neu senden</Button></>
          : <Button disabled={!manage || send.isPending || !cfg.channelId} onClick={() => send.mutate('new')}><Send size={14} className="mr-1" />{cfg.channelId ? 'In Discord senden' : 'Erst Kanal wählen'}</Button>}
        {posted && <span className="text-xs text-muted">Steht in <code>#{posted.channelId}</code> · Nachricht {posted.messageId}</span>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
    </Card>
  );
}

export interface RadioCode { id: string; guildId: string | null; code: string; meaning: string; category: string | null; description: string | null; position: number }
type Patch = Partial<Pick<RadioCode, 'code' | 'meaning' | 'category' | 'description'>>;
const KEY = ['radio-codes'];

export const useRadioCodes = () => useQuery({ queryKey: KEY, queryFn: () => api<RadioCode[]>('/radio-codes'), staleTime: 60_000 });

/** Kurze Liste mit Suche (Widget „📡 Funk“). */
export function RadioCodeList({ limit = 12 }: { limit?: number }) {
  const q = useRadioCodes();
  const [t, setT] = useState('');
  const rows = (q.data ?? []).filter((r) => !t || `${r.code} ${r.meaning} ${r.category ?? ''}`.toLowerCase().includes(t.toLowerCase()));
  return (
    <div>
      <Input aria-label="Funk-Code suchen" placeholder="Funk-Code suchen, z. B. 10-4" className="mb-2 py-1.5 text-sm" value={t} onChange={(e) => setT(e.target.value)} />
      {q.isLoading ? <SkeletonRows rows={3} /> : q.error ? <ErrorState error={q.error} /> : !rows.length ? <p className="text-sm text-muted">Keine Funk-Codes.</p> : (
        <ul className="space-y-1 text-sm">{rows.slice(0, limit).map((r) => <li key={r.id} className="flex gap-2"><code className="shrink-0 rounded bg-panel-2 px-1.5 font-semibold">{r.code}</code><span className="min-w-0">{r.meaning}</span></li>)}</ul>
      )}
    </div>
  );
}

/** 📡 Funk-Codes: ansehen und suchen (alle mit radio.view), bearbeiten mit radio.manage – automatisch gespeichert. */
export function RadioCodes() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [server] = useServer();
  const guilds = useGuilds();
  const [params] = useSearchParams();
  const [t, setT] = useState(params.get('q') ?? '');
  const [newCode, setNewCode] = useState({ code: '', meaning: '', category: '' });
  const [del, setDel] = useState<RadioCode>();
  const [drag, setDrag] = useState<string>();
  const [err, setErr] = useState<string>();
  const manage = can('radio.manage');
  const q = useRadioCodes();
  useEffect(() => onSaved('radio:', () => { if (!hasPending('radio:')) void qc.invalidateQueries({ queryKey: KEY }); }), [qc]);
  const rows = useMemo(() => (q.data ?? []).map((r) => ({ ...r, ...(pendingBody<Patch>(`radio:${r.id}`) ?? {}) })), [q.data, q.dataUpdatedAt]);
  const shown = rows.filter((r) => !t || `${r.code} ${r.meaning} ${r.category ?? ''} ${r.description ?? ''}`.toLowerCase().includes(t.toLowerCase()));
  const editable = (r: RadioCode) => manage && (!server || r.guildId === server || r.guildId === null);
  const onError = (e: unknown) => setErr(e instanceof ApiError ? e.message : 'Fehlgeschlagen');
  const add = useMutation({ mutationFn: () => api<RadioCode>('/radio-codes', { body: { code: newCode.code.trim(), meaning: newCode.meaning.trim(), category: newCode.category.trim() || null } }), onSuccess: () => { setErr(undefined); setNewCode({ code: '', meaning: '', category: '' }); void qc.invalidateQueries({ queryKey: KEY }); }, onError });
  const defaults = useMutation({ mutationFn: () => api<{ added: number }>('/radio-codes/defaults', { method: 'POST' }), onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }), onError });
  const remove = useMutation({ mutationFn: (r: RadioCode) => api(`/radio-codes/${r.id}`, { method: 'DELETE' }), onSuccess: () => { setDel(undefined); void qc.invalidateQueries({ queryKey: KEY }); }, onError });
  const patch = (r: RadioCode, p: Patch) => {
    qc.setQueryData<RadioCode[]>(KEY, (l) => l?.map((x) => (x.id === r.id ? { ...x, ...p } : x)));
    const merged = { ...(pendingBody<Patch>(`radio:${r.id}`) ?? {}), ...p };
    if (merged.code !== undefined && !merged.code.trim()) return;
    if (merged.meaning !== undefined && !merged.meaning.trim()) return;
    queueSave(`radio:${r.id}`, { method: 'PATCH', path: `/radio-codes/${r.id}`, body: merged, label: `Funk-Code ${r.code}` });
  };
  const moveTo = (from: string, to: string) => {
    const ids = rows.map((r) => r.id);
    ids.splice(ids.indexOf(to), 0, ...ids.splice(ids.indexOf(from), 1));
    qc.setQueryData<RadioCode[]>(KEY, (l) => [...(l ?? [])].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
    queueSave('radio:order', { method: 'PUT', path: '/radio-codes/order', body: { ids: ids.filter((id) => { const r = rows.find((x) => x.id === id); return r && editable(r); }) }, label: 'Reihenfolge der Funk-Codes' });
  };
  return (
    <>
      <PageHeader title="📡 Funk-Codes" subtitle={`${server ? `Server ${guildName(guilds.data, server)}: eigene Codes überdecken gemeinsame.` : 'Gemeinsame Codes für alle Server.'}${manage ? ' Änderungen werden automatisch gespeichert.' : ''} In Discord: /funkcode`}
        actions={manage && <Button variant="secondary" onClick={() => defaults.mutate()} disabled={defaults.isPending}>Standard-Codes einfügen</Button>} />
      {err && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
      {manage && <RadioDiscordCard manage={manage} />}
      <Card>
        <Input aria-label="Funk-Codes durchsuchen" placeholder="🔍 Code, Bedeutung oder Kategorie" className="mb-3" value={t} onChange={(e) => setT(e.target.value)} />
        {manage && (
          <form className="mb-4 grid gap-2 rounded-md border border-dashed border-line p-2 sm:grid-cols-[120px_1fr_160px_auto]" onSubmit={(e) => { e.preventDefault(); if (newCode.code.trim() && newCode.meaning.trim()) add.mutate(); }}>
            <Input aria-label="Neuer Code" placeholder="10-4" value={newCode.code} maxLength={32} onChange={(e) => setNewCode({ ...newCode, code: e.target.value })} />
            <Input aria-label="Bedeutung" placeholder="Bedeutung" value={newCode.meaning} maxLength={200} onChange={(e) => setNewCode({ ...newCode, meaning: e.target.value })} />
            <Input aria-label="Kategorie" placeholder="Kategorie (optional)" value={newCode.category} maxLength={64} onChange={(e) => setNewCode({ ...newCode, category: e.target.value })} />
            <Button type="submit" disabled={add.isPending || !newCode.code.trim() || !newCode.meaning.trim()}><Plus size={14} />Hinzufügen</Button>
          </form>
        )}
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !shown.length ? <EmptyState text={t ? 'Kein Funk-Code passt.' : 'Noch keine Funk-Codes.'} hint={manage && !t ? '„Standard-Codes einfügen“ legt gängige 10-Codes an.' : undefined} /> : (
          <div className="table-scroll"><table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-muted"><tr>{manage && <th className="w-6" />}<th className="p-2">Code</th><th>Bedeutung</th><th>Kategorie</th><th>Beschreibung</th>{manage && <th />}</tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id} className={`border-b border-line/60 ${drag === r.id ? 'opacity-50' : ''}`} draggable={editable(r) && !t} onDragStart={() => setDrag(r.id)} onDragEnd={() => setDrag(undefined)} onDragOver={(e) => { if (drag) e.preventDefault(); }} onDrop={() => { if (drag && drag !== r.id) moveTo(drag, r.id); setDrag(undefined); }}>
                {manage && <td className="text-muted">{editable(r) && !t && <GripVertical size={14} className="cursor-grab" aria-hidden />}</td>}
                {editable(r) ? <>
                  <td className="p-1"><Input aria-label={`Code ${r.code}`} className="w-28 py-1 font-semibold" value={r.code} maxLength={32} onChange={(e) => patch(r, { code: e.target.value })} /></td>
                  <td className="p-1"><Input aria-label={`Bedeutung ${r.code}`} className="py-1" value={r.meaning} maxLength={200} onChange={(e) => patch(r, { meaning: e.target.value })} /></td>
                  <td className="p-1"><Input aria-label={`Kategorie ${r.code}`} className="w-36 py-1" value={r.category ?? ''} maxLength={64} onChange={(e) => patch(r, { category: e.target.value || null })} /></td>
                  <td className="p-1"><Input aria-label={`Beschreibung ${r.code}`} className="py-1" value={r.description ?? ''} maxLength={1000} onChange={(e) => patch(r, { description: e.target.value || null })} /></td>
                </> : <>
                  <td className="p-2"><code className="rounded bg-panel-2 px-1.5 font-semibold">{r.code}</code></td><td>{r.meaning}</td><td>{r.category ?? '—'}</td><td className="text-muted">{r.description ?? ''}</td>
                </>}
                {manage && <td className="whitespace-nowrap">{server && r.guildId === null && <Badge>alle Server</Badge>}{editable(r) && <Button size="sm" variant="ghost" aria-label={`${r.code} löschen`} onClick={() => setDel(r)}><Trash2 size={13} /></Button>}</td>}
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
      <ConfirmDialog open={!!del} danger title="Funk-Code löschen" message={`„${del?.code} – ${del?.meaning}“ löschen?`} confirmLabel="Löschen" busy={remove.isPending} onClose={() => setDel(undefined)} onConfirm={() => del && remove.mutate(del)} />
    </>
  );
}
