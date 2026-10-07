import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, Plus, Send, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { guildName, useGuilds, useServer } from '../../lib/guilds';
import { useAutosaveDraft } from '../../lib/autosave';
import { ChannelPicker } from '../../components/DiscordPickers';
import { DiscordPreview } from '../../components/DiscordPreview';
import { Toggle } from '../../components/ApplicationSettings';
import { useRoster } from '../../components/TeamRoster';
import { ImageInput, useImageUrls } from '../../components/ImageInput';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, PageHeader, SkeletonRows, Textarea } from '../../components/ui';

interface Field { name: string; value: string; inline: boolean }
interface EmbedDoc {
  id: string; name: string; guildId: string | null; channelId: string | null; content: string; title: string; url: string; description: string; color: string;
  author: string; authorIcon: string; thumbnail: string; image: string; images: string[]; footer: string; footerIcon: string; timestamp: boolean; timestampAt: string | null;
  reactions: string[]; pingRoles: boolean; fields: Field[]; posted: { channelId: string; messageId: string; at: string } | null;
}
/** Ältere gespeicherte Embeds ohne die neuen Felder. */
const withDefaults = (d: Partial<EmbedDoc> & { id: string }): EmbedDoc => ({ authorIcon: '', images: [], footerIcon: '', timestampAt: null, reactions: [], pingRoles: true, ...d } as EmbedDoc);
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localTime = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const joinStamp = (date: string, time: string) => (date ? new Date(`${date}T${time}`).toISOString() : null);
const blank = (guildId: string | null): EmbedDoc => ({ id: crypto.randomUUID(), name: 'Neues Embed', guildId, channelId: null, content: '', title: 'Rang Ordnung und Aufgaben', url: '', description: '', color: '#8b5cf6', author: '', authorIcon: '', thumbnail: '', image: '', images: [], footer: '', footerIcon: '', timestamp: true, timestampAt: null, reactions: [], pingRoles: true, fields: [{ name: '👑 | Kommandant:', value: 'Trägt die Gesamtverantwortung …', inline: false }], posted: null });
const https = (u: string) => !u || /^(https:\/\/\S+|media:[0-9a-f-]{36})$/.test(u);
const total = (e: EmbedDoc) => e.title.length + e.description.length + e.author.length + e.footer.length + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
const problems = (e: EmbedDoc) => [
  !e.name.trim() && 'Name fehlt',
  !e.title && !e.description && !e.fields.length && !e.image && !e.images.length && 'Titel, Text, Abschnitt oder Bild nötig',
  e.fields.some((f) => !f.name.trim() || !f.value.trim()) && 'Jeder Abschnitt braucht Überschrift und Text',
  ![e.url, e.thumbnail, e.image, e.authorIcon, e.footerIcon, ...e.images].every(https) && 'Links/Bilder müssen mit https:// beginnen',
  e.images.some((i) => !i) && 'Leeres Zusatzbild entfernen',
  total(e) > 6000 && `Zu lang (${total(e)}/6000 Zeichen)`,
].filter(Boolean) as string[];

function Editor({ doc, onChange, manage }: { doc: EmbedDoc; onChange: (d: EmbedDoc) => void; manage: boolean }) {
  const set = (p: Partial<EmbedDoc>) => onChange({ ...doc, ...p });
  const field = (i: number, p: Partial<Field>) => set({ fields: doc.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const move = (i: number, d: -1 | 1) => { const f = [...doc.fields]; const [x] = f.splice(i, 1); f.splice(i + d, 0, x!); set({ fields: f }); };
  const roster = useRoster();
  const ranks = roster.data?.structure.ranks ?? [];
  const txt = (label: string, key: 'title' | 'author' | 'url', max: number, placeholder?: string) => (
    <label className="grid gap-1 text-sm">{label}<Input aria-label={label} disabled={!manage} maxLength={max} placeholder={placeholder} value={doc[key]} onChange={(e) => set({ [key]: e.target.value })} /></label>
  );
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Name (nur im Dashboard)<Input aria-label="Name" disabled={!manage} maxLength={80} value={doc.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Kanal<ChannelPicker ariaLabel="Kanal" disabled={!manage} value={doc.channelId} onChange={(id) => set({ channelId: id })} /></label>
      </div>
      <label className="grid gap-1 text-sm">Text über dem Embed (optional)<Textarea aria-label="Text über dem Embed" disabled={!manage} rows={2} maxLength={2000} value={doc.content} onChange={(e) => set({ content: e.target.value })} /></label>
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        {txt('Titel', 'title', 256)}
        <label className="grid gap-1 text-sm">Farbe<input type="color" aria-label="Farbe" disabled={!manage} value={doc.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-16 rounded border border-line bg-transparent" /></label>
      </div>
      <label className="grid gap-1 text-sm">Beschreibung<Textarea aria-label="Beschreibung" disabled={!manage} rows={4} maxLength={4096} value={doc.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Abschnitte ({doc.fields.length}/25)</h3>
          <span className="flex flex-wrap gap-2">
            {ranks.length > 0 && <Button size="sm" variant="ghost" disabled={!manage || doc.fields.length + ranks.length > 25} title="Je Dienstgrad (Einstellungen → Teamstruktur) einen Abschnitt anhängen" onClick={() => set({ fields: [...doc.fields, ...ranks.map((r) => ({ name: `🎖️ | ${r}:`, value: 'Aufgaben …', inline: false }))] })}>Aus Dienstgraden</Button>}
            <Button size="sm" variant="secondary" disabled={!manage || doc.fields.length >= 25} onClick={() => set({ fields: [...doc.fields, { name: '⭐ | Neuer Abschnitt:', value: 'Text …', inline: false }] })}><Plus size={14} className="mr-1" />Abschnitt</Button>
          </span>
        </div>
        {doc.fields.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-line p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Überschrift Abschnitt ${i + 1}`} disabled={!manage} className="min-w-0 flex-1" maxLength={256} value={f.name} onChange={(e) => field(i, { name: e.target.value })} />
              <label className="flex items-center gap-1 text-xs"><Toggle label={`Abschnitt ${i + 1} nebeneinander`} checked={f.inline} onChange={(v) => field(i, { inline: v })} />nebeneinander</label>
              <Button size="sm" variant="ghost" aria-label={`Abschnitt ${i + 1} nach oben`} disabled={!manage || i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
              <Button size="sm" variant="ghost" aria-label={`Abschnitt ${i + 1} nach unten`} disabled={!manage || i === doc.fields.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
              <Button size="sm" variant="ghost" aria-label={`Abschnitt ${i + 1} löschen`} disabled={!manage} onClick={() => set({ fields: doc.fields.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
            </div>
            <Textarea aria-label={`Text Abschnitt ${i + 1}`} disabled={!manage} rows={3} maxLength={1024} value={f.value} onChange={(e) => field(i, { value: e.target.value })} />
          </div>
        ))}
      </section>
      <details open className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm font-semibold">Bilder</summary>
        <div className="mt-2 grid gap-3">
          <ImageInput label="Großes Bild URL" disabled={!manage} value={doc.image} onChange={(v) => set({ image: v })} />
          {doc.images.map((img, i) => (
            <div key={i} className="grid gap-1">
              <ImageInput label={`Weiteres Bild ${i + 2}`} disabled={!manage} value={img} onChange={(v) => set({ images: doc.images.map((x, j) => (j === i ? v : x)) })} />
              <Button size="sm" variant="ghost" className="w-fit" disabled={!manage} onClick={() => set({ images: doc.images.filter((_, j) => j !== i) })}><Trash2 size={14} className="mr-1" />Bild {i + 2} entfernen</Button>
            </div>
          ))}
          <Button size="sm" variant="secondary" className="w-fit" disabled={!manage || doc.images.length >= 3 || !doc.image} onClick={() => set({ images: [...doc.images, ''] })}><Plus size={14} className="mr-1" />Weiteres hinzufügen</Button>
          {doc.images.length > 0 && !doc.url && <p className="text-xs text-muted">Tipp: Mit „Link des Titels“ zeigt Discord bis zu 4 Bilder als Galerie; ohne Link erscheinen sie einzeln untereinander.</p>}
          <ImageInput label="Thumbnail URL" disabled={!manage} value={doc.thumbnail} onChange={(v) => set({ thumbnail: v })} />
        </div>
      </details>
      <details open className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm font-semibold">Fußzeile</summary>
        <div className="mt-2 grid gap-3">
          <label className="grid gap-1 text-sm">Text <span className="text-xs italic text-muted">{doc.footer.length}/2048</span><Textarea aria-label="Fußzeile" disabled={!manage} rows={2} maxLength={2048} value={doc.footer} onChange={(e) => set({ footer: e.target.value })} /></label>
          <ImageInput label="Icon" disabled={!manage || !doc.footer} value={doc.footerIcon} onChange={(v) => set({ footerIcon: v })} />
          <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr] md:items-end">
            <label className="flex items-center gap-2 text-sm"><Toggle label="Zeitstempel" checked={doc.timestamp} onChange={(v) => set({ timestamp: v })} />Zeitstempel</label>
            <label className="grid gap-1 text-sm">Datum<Input type="date" aria-label="Datum" disabled={!manage || !doc.timestamp} value={doc.timestampAt ? localDate(doc.timestampAt) : ''} onChange={(e) => set({ timestampAt: joinStamp(e.target.value, doc.timestampAt ? localTime(doc.timestampAt) : '12:00') })} /></label>
            <label className="grid gap-1 text-sm">Zeit<Input type="time" aria-label="Zeit" disabled={!manage || !doc.timestamp || !doc.timestampAt} value={doc.timestampAt ? localTime(doc.timestampAt) : ''} onChange={(e) => doc.timestampAt && set({ timestampAt: joinStamp(localDate(doc.timestampAt), e.target.value || '00:00') })} /></label>
          </div>
          <p className="text-xs text-muted">{doc.timestamp ? (doc.timestampAt ? 'Eigener Zeitpunkt – Datum leeren für „Zeitpunkt des Sendens“.' : 'Ohne Datum: Zeitpunkt des Sendens.') : 'Kein Zeitstempel.'}{doc.timestampAt && <Button size="sm" variant="ghost" className="ml-2" disabled={!manage} onClick={() => set({ timestampAt: null })}>Datum leeren</Button>}</p>
        </div>
      </details>
      <details className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm font-semibold">Autor, Link, Reaktionen</summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {txt('Autor (Zeile über dem Titel)', 'author', 256)}
          {txt('Link des Titels', 'url', 500, 'https://…')}
          <div className="md:col-span-2"><ImageInput label="Autor-Icon" disabled={!manage || !doc.author} value={doc.authorIcon} onChange={(v) => set({ authorIcon: v })} /></div>
          <label className="grid gap-1 text-sm md:col-span-2">Reaktionen unter der Nachricht (Emojis mit Leerzeichen getrennt, z. B. ✅ ❌ ⏳)
            <Input aria-label="Reaktionen" disabled={!manage} placeholder="✅ ❌ ⏳" value={doc.reactions.join(' ')} onChange={(e) => set({ reactions: e.target.value.split(/\s+/).filter(Boolean).slice(0, 20) })} />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2"><Toggle label="Rollen pingen" checked={doc.pingRoles} onChange={(v) => set({ pingRoles: v })} />Rollen-Erwähnungen im Text oben (&lt;@&amp;ID&gt;) wirklich pingen</label>
        </div>
      </details>
      <p className="text-xs text-muted">{total(doc)} / 6000 Zeichen · Markdown wie in Discord (**fett**, *kursiv*, `Code`, Erwähnungen wie &lt;@&amp;Rollen-ID&gt;).</p>
    </div>
  );
}

/** Vorschau mit hochgeladenen Bildern, Zusatzbildern und Reaktionen. */
function EmbedPreview({ doc }: { doc: EmbedDoc }) {
  const urls = useImageUrls([doc.image, doc.thumbnail, doc.authorIcon, doc.footerIcon, ...doc.images]);
  const u = (r: string) => (r ? urls[r] : undefined);
  const color = parseInt(doc.color.slice(1), 16);
  return (
    <div className="grid gap-1">
      <DiscordPreview message={{ content: doc.content || undefined, embeds: [
        { title: doc.title || undefined, description: doc.description || undefined, color, author: doc.author || undefined, authorIcon: u(doc.authorIcon), thumbnail: u(doc.thumbnail), image: u(doc.image), footer: [doc.footer, doc.timestamp ? new Date(doc.timestampAt ?? Date.now()).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : ''].filter(Boolean).join(' • ') || undefined, footerIcon: doc.footer ? u(doc.footerIcon) : undefined, fields: doc.fields },
        ...doc.images.filter(Boolean).map((r) => ({ color, image: u(r) })),
      ] }} />
      {doc.reactions.length > 0 && <div className="flex flex-wrap gap-1 pl-14">{doc.reactions.map((r, i) => <span key={i} className="rounded-md bg-[#2b2d31] px-2 py-0.5 text-sm">{r} 1</span>)}</div>}
    </div>
  );
}

/** Administration → Embeds: Nachrichten wie bei Sapphire bauen, in einen Kanal senden und später aktualisieren. */
export function Embeds() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const qc = useQueryClient();
  const [server] = useServer();
  const guilds = useGuilds();
  const key = ['embeds', server];
  const [waiting, setWaiting] = useState(false);
  const q = useQuery({ queryKey: key, queryFn: () => api<EmbedDoc[]>('/embeds').then((l) => l.map(withDefaults)), refetchInterval: waiting ? 3000 : false });
  const [docs, setDocs] = useState<EmbedDoc[]>();
  const [open, setOpen] = useState<string>();
  const [del, setDel] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  useEffect(() => {
    if (!q.data) return;
    // lokale Bearbeitung hat Vorrang (Autosave läuft), „gesendet“ kommt immer vom Server
    setDocs((cur) => {
      const local = new Map((cur ?? []).map((c) => [c.id, c]));
      return [...q.data.map((d) => (local.has(d.id) ? { ...local.get(d.id)!, posted: d.posted } : d)), ...(cur ?? []).filter((c) => !q.data.some((d) => d.id === c.id))];
    });
  }, [q.data]);
  const current = docs?.find((d) => d.id === open);
  const saved = q.data?.find((d) => d.id === open);
  useEffect(() => { if (waiting && saved?.posted && Date.parse(saved.posted.at) > Date.now() - 60_000) { setWaiting(false); setMsg({ ok: true, text: 'Gesendet ✔' }); } }, [saved?.posted, waiting]);
  useAutosaveDraft(manage && current ? `embed:${current.id}` : null, current, (d) => (problems(d).length ? null : { method: 'PUT', path: `/embeds/${d.id}`, body: d, label: `Embed „${d.name}“` }));
  const save = useMutation({ mutationFn: (d: EmbedDoc) => api<EmbedDoc>(`/embeds/${d.id}`, { method: 'PUT', body: d }), onSuccess: () => void qc.invalidateQueries({ queryKey: key }) });
  const send = useMutation({
    mutationFn: async (v: { d: EmbedDoc; mode: 'update' | 'new' }) => { await api(`/embeds/${v.d.id}`, { method: 'PUT', body: v.d }); return api<{ edit: boolean }>(`/embeds/${v.d.id}/send`, { method: 'POST', body: { mode: v.mode } }); },
    onSuccess: (r) => { setWaiting(true); setMsg({ ok: true, text: r.edit ? 'Wird aktualisiert – der Bot bearbeitet die vorhandene Nachricht …' : 'Wird gesendet …' }); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const dup = useMutation({ mutationFn: (id: string) => api<EmbedDoc>(`/embeds/${id}/duplicate`, { method: 'POST' }), onSuccess: (d) => { void qc.invalidateQueries({ queryKey: key }); setOpen(d.id); } });
  const remove = useMutation({ mutationFn: (id: string) => (q.data?.some((d) => d.id === id) ? api(`/embeds/${id}`, { method: 'DELETE' }) : Promise.resolve()), onSuccess: (_r, id) => { setDocs(docs?.filter((d) => d.id !== id)); setOpen(undefined); setDel(undefined); void qc.invalidateQueries({ queryKey: key }); } });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!docs) return <SkeletonRows />;
  const chName = (id: string) => { for (const g of guilds.data ?? []) { const c = g.channels.find((x) => x.id === id); if (c) return `#${c.name}`; } return id; };
  const update = (d: EmbedDoc) => { setDocs(docs.map((x) => (x.id === d.id ? d : x))); setMsg(undefined); };
  return (
    <>
      <PageHeader title="Embeds" subtitle="Nachrichten mit Embed bauen (z. B. „Rang Ordnung und Aufgaben“ für #karriereweg), in einen Kanal senden und später aktualisieren – der Bot bearbeitet dann dieselbe Nachricht." />
      {!current ? (
        <Card title="Embeds" actions={manage && <Button size="sm" onClick={() => { const d = blank(server || null); setDocs([...docs, d]); setOpen(d.id); }}><Plus size={16} className="mr-1" />Embed anlegen</Button>}>
          {!docs.length ? <EmptyState text="Noch keine Embeds." hint="Lege ein Embed an, wähle den Kanal und sende es." /> : (
            <ul className="grid gap-2">{docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                <span aria-hidden className="h-8 w-1.5 rounded" style={{ background: d.color }} />
                <span className="font-semibold">{d.name}</span>
                {d.posted ? <Badge tone="success">gesendet in {chName(d.posted.channelId)}</Badge> : <Badge tone="neutral">nicht gesendet</Badge>}
                {d.guildId && <Badge tone="info">{guildName(guilds.data, d.guildId)}</Badge>}
                {problems(d).length > 0 && <Badge tone="warning">{problems(d)[0]}</Badge>}
                <span className="ml-auto flex gap-1">
                  {manage && <Button size="sm" variant="ghost" aria-label={`${d.name} duplizieren`} onClick={() => dup.mutate(d.id)}><Copy size={14} /></Button>}
                  <Button size="sm" variant="secondary" onClick={() => { setOpen(d.id); setMsg(undefined); }}>Bearbeiten</Button>
                </span>
              </li>
            ))}</ul>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
          <Card title={current.name} actions={<span className="flex gap-1">{manage && <Button size="sm" variant="danger" aria-label="Embed löschen" onClick={() => setDel(current.id)}><Trash2 size={14} /></Button>}<Button size="sm" variant="secondary" onClick={() => setOpen(undefined)}>Zurück</Button></span>}>
            <Editor doc={current} onChange={update} manage={manage} />
          </Card>
          <div className="grid content-start gap-3 xl:sticky xl:top-4">
            <EmbedPreview doc={current} />
            <Card title="Senden">
              {problems(current).length > 0 && <p role="alert" className="mb-2 text-sm text-warning">{problems(current).join(' · ')}</p>}
              {current.posted ? <p className="mb-2 text-sm text-muted">Zuletzt gesendet in <b>{chName(current.posted.channelId)}</b> am {fmt(current.posted.at)}.</p> : <p className="mb-2 text-sm text-muted">Noch nicht gesendet.</p>}
              <div className="flex flex-wrap gap-2">
                {current.posted && current.posted.channelId === current.channelId ? (
                  <>
                    <Button disabled={!manage || send.isPending || !!problems(current).length} onClick={() => send.mutate({ d: current, mode: 'update' })}><Send size={14} className="mr-1" />Nachricht aktualisieren</Button>
                    <Button variant="secondary" disabled={!manage || send.isPending || !!problems(current).length} onClick={() => send.mutate({ d: current, mode: 'new' })}>Neu senden</Button>
                  </>
                ) : <Button disabled={!manage || send.isPending || !current.channelId || !!problems(current).length} onClick={() => send.mutate({ d: current, mode: 'new' })}><Send size={14} className="mr-1" />{current.channelId ? `In ${chName(current.channelId)} senden` : 'Erst Kanal wählen'}</Button>}
                {manage && <Button variant="ghost" disabled={save.isPending || !!problems(current).length} onClick={() => save.mutate(current)}>Speichern</Button>}
              </div>
              {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
              <p className="mt-2 text-xs text-muted">Der Bot braucht im Kanal „Nachrichten senden“ und „Links einbetten“. Änderungen werden automatisch gespeichert; in Discord ändert sich die Nachricht erst mit „Nachricht aktualisieren“.</p>
            </Card>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!del} danger title="Embed löschen?" message="Die schon gesendete Nachricht in Discord bleibt stehen." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del)} onClose={() => setDel(undefined)} />
    </>
  );
}
