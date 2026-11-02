import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { ANNOUNCEMENT_TYPE_INFO, ANNOUNCEMENT_TYPES, MAX_MENTION_ROLES, type AnnouncementType } from '@enrp/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { fmtDateTime, fromLocalInput, toLocalInput } from '../lib/admin';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../components/ui';

interface Content { title: string; description: string; color?: string | null; imageUrl?: string | null; thumbnailUrl?: string | null; footer?: string | null; timestamp?: boolean; fields: { name: string; value: string; inline: boolean }[]; links: { label: string; url: string }[] }
interface Ann { id: string; type: AnnouncementType; typeLabel: string; title: string; content: Content; channelId: string; audience: string; audienceRoleIds: string[]; audienceDepartments: string[]; mentionRoleIds: string[]; status: string; scheduledAt: string | null; recurrence: string; publishedAt: string | null; retractedAt: string | null; retractReason: string | null; version: number; updatedAt: string; createdByName?: string; deliveries?: { kind: string; at: string; by: string; slot: string | null }[] }
const STATUS: Record<string, [string, Tone]> = { DRAFT: ['Entwurf', 'neutral'], SCHEDULED: ['Geplant', 'info'], PUBLISHED: ['Veröffentlicht', 'success'], RETRACTED: ['Zurückgezogen', 'warning'], FAILED: ['Fehlgeschlagen', 'danger'] };
const TABS = [['', 'Alle'], ['SCHEDULED', 'Geplant'], ['PUBLISHED', 'Veröffentlicht'], ['RETRACTED', 'Zurückgezogen'], ['DRAFT', 'Entwürfe']] as const;
const REC: Record<string, string> = { NONE: 'einmalig', DAILY: 'täglich', WEEKLY: 'wöchentlich', MONTHLY: 'monatlich' };
const KIND: Record<string, string> = { PUBLISH: 'Veröffentlicht', UPDATE: 'Aktualisiert', RETRACT: 'Zurückgezogen' };

/** Verwaltung → Ankündigungen: über den Bot in Discord veröffentlichen, planen, wiederholen, zurückziehen. Keine Lesebestätigung. */
export function Announcements() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('Alle');
  const [edit, setEdit] = useState<Ann | 'new'>();
  const status = TABS.find(([, l]) => l === tab)?.[0] ?? '';
  const list = useQuery({ queryKey: ['announcements', status], queryFn: () => api<Ann[]>('/announcements', { query: { status: status || undefined } }) });
  const open = params.get('id');
  return (
    <>
      <PageHeader title="Ankündigungen" subtitle="Ankündigungen erscheinen über den Bot im gewählten Discord-Kanal. Erwähnt werden nur ausgewählte Rollen (höchstens 3) – nie @everyone oder @here."
        actions={can('announce.create') ? <Button onClick={() => setEdit('new')}><Plus size={16} className="mr-1" />Ankündigung</Button> : undefined} />
      <Tabs tabs={TABS.map(([, l]) => l)} active={tab} onChange={setTab} />
      <div className="mt-4">{list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} /> : !list.data?.length ? <EmptyState text="Keine Ankündigungen." /> : (
        <div className="grid gap-3 md:grid-cols-2">{list.data.map((a) => { const [l, t] = STATUS[a.status] ?? [a.status, 'neutral']; return (
          <Card key={a.id} title={<span className="flex flex-wrap items-center gap-2">{ANNOUNCEMENT_TYPE_INFO[a.type]?.emoji} {a.title}<Badge tone={t}>{l}</Badge></span>} actions={<Button size="sm" variant="secondary" onClick={() => setParams({ id: a.id })}>Öffnen</Button>}>
            <p className="text-xs text-muted">{a.typeLabel} · Kanal {a.channelId}{a.scheduledAt && a.status !== 'RETRACTED' ? ` · ${a.recurrence !== 'NONE' ? `${REC[a.recurrence]}, nächster Termin` : 'geplant'} ${fmtDateTime(a.scheduledAt)}` : ''}{a.publishedAt ? ` · veröffentlicht ${fmtDateTime(a.publishedAt)}` : ''}</p>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{a.content.description}</p>
          </Card>
        ); })}</div>
      )}</div>
      {open && <AnnDetail id={open} onClose={() => setParams({})} onEdit={(a) => { setParams({}); setEdit(a); }} />}
      {edit && <AnnForm ann={edit === 'new' ? undefined : edit} onClose={() => setEdit(undefined)} />}
    </>
  );
}

function AnnDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (a: Ann) => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['announcements', 'detail', id], queryFn: () => api<Ann>(`/announcements/${id}`) });
  const [err, setErr] = useState<string>();
  const act = useMutation({ mutationFn: (v: { path: string; body?: unknown }) => api(`/announcements/${id}/${v.path}`, { body: v.body ?? {} }), onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['announcements'] }); }, onError: (e) => setErr(errText(e)) });
  const a = q.data;
  return (
    <Modal open wide title={a?.title ?? 'Ankündigung'} onClose={onClose}>
      {!a ? <SkeletonRows /> : (
        <div className="grid gap-3 text-sm">
          <Preview type={a.type} content={a.content} mentions={a.mentionRoleIds} />
          {a.retractReason && <p className="text-warning">Zurückgezogen: {a.retractReason}</p>}
          <p className="text-xs text-muted">Zielgruppe: {a.audience === 'ROLES' ? `Rollen ${a.audienceRoleIds.join(', ')}` : a.audience === 'DEPARTMENTS' ? `Abteilungen ${a.audienceDepartments.join(', ')}` : 'gesamter Server'} · Wiederholung: {REC[a.recurrence]} · erstellt von {a.createdByName}</p>
          <div className="flex flex-wrap gap-2">
            {can('announce.publish') && ['DRAFT', 'SCHEDULED', 'FAILED'].includes(a.status) && <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ path: 'publish' })}>{a.scheduledAt && new Date(a.scheduledAt).getTime() > Date.now() ? 'Planen' : 'Jetzt veröffentlichen'}</Button>}
            {can('announce.create') && a.status !== 'RETRACTED' && <Button size="sm" variant="secondary" onClick={() => onEdit(a)}>Bearbeiten</Button>}
            {can('announce.publish') && a.status !== 'RETRACTED' && <Button size="sm" variant="danger" onClick={() => { const r = window.prompt('Grund für das Zurückziehen:'); if (r && r.trim().length >= 3) act.mutate({ path: 'retract', body: { reason: r.trim() } }); }}>Zurückziehen</Button>}
          </div>
          {err && <p role="alert" className="text-danger">{err}</p>}
          <section aria-label="Versandhistorie"><h3 className="mb-1 font-semibold">Versandhistorie</h3>
            {!a.deliveries?.length ? <p className="text-xs text-muted">Noch nicht versendet.</p> : <ul className="text-xs">{a.deliveries.map((d, i) => <li key={i}>{KIND[d.kind] ?? d.kind} · {fmtDateTime(d.at)} · {d.by}</li>)}</ul>}
          </section>
        </div>
      )}
    </Modal>
  );
}

/** Vorschau wie in Discord (serverseitig berechnet – exakt das, was gesendet wird). */
function Preview({ type, content, mentions }: { type: AnnouncementType; content: Content; mentions: string[] }) {
  const [p, setP] = useState<{ content?: string; embeds: { title: string; description: string; color: number; footer?: string; image?: string; thumbnail?: string; fields?: { name: string; value: string }[] }[]; buttons?: { label: string; url?: string }[] }>();
  useEffect(() => {
    const t = setTimeout(() => { if (content.title.length >= 2 && content.description) void api<typeof p>('/announcements/preview', { body: { type, content, mentionRoleIds: mentions } }).then(setP).catch(() => setP(undefined)); }, 300);
    return () => clearTimeout(t);
  }, [type, JSON.stringify(content), mentions.join()]);
  const e = p?.embeds[0];
  if (!e) return <p className="text-xs text-muted">Vorschau erscheint, sobald Titel und Text ausgefüllt sind.</p>;
  return (
    <div aria-label="Vorschau" className="rounded-md bg-[#313338] p-3 text-[#dbdee1]">
      {p?.content && <p className="mb-1 text-sm text-[#c9cdfb]">{p.content.replace(/<@&(\d+)>/g, '@Rolle($1)')}</p>}
      <div className="rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderColor: `#${e.color.toString(16).padStart(6, '0')}` }}>
        <p className="font-semibold">{e.title}</p><p className="mt-1 whitespace-pre-wrap text-sm">{e.description}</p>
        {e.fields?.map((f, i) => <div key={i} className="mt-2 text-sm"><p className="font-semibold">{f.name}</p><p>{f.value}</p></div>)}
        {e.image && <img src={e.image} alt="" className="mt-2 max-h-48 rounded" />}
        {e.footer && <p className="mt-2 text-[11px] opacity-70">{e.footer}</p>}
      </div>
      {!!p?.buttons?.length && <div className="mt-2 flex gap-2">{p.buttons.map((b, i) => <span key={i} className="rounded bg-[#4e5058] px-3 py-1 text-xs">{b.label} ↗</span>)}</div>}
    </div>
  );
}

function AnnForm({ ann, onClose }: { ann?: Ann; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['announcement-templates'], queryFn: () => api<{ type: AnnouncementType; name: string; content: Content }[]>('/announcements/templates') });
  const [type, setType] = useState<AnnouncementType>(ann?.type ?? 'GENERAL');
  const [c, setC] = useState<Content>(ann?.content ?? { title: '', description: '', fields: [], links: [], timestamp: true });
  const [v, setV] = useState({ channelId: ann?.channelId ?? '', audience: ann?.audience ?? 'SERVER', audienceRoleIds: ann?.audienceRoleIds.join(', ') ?? '', audienceDepartments: ann?.audienceDepartments.join(', ') ?? '', mentionRoleIds: ann?.mentionRoleIds.join(', ') ?? '', scheduledAt: ann?.scheduledAt ? toLocalInput(ann.scheduledAt) : '', recurrence: ann?.recurrence ?? 'NONE' });
  const ids = (s: string) => s.split(/[\s,;]+/).filter(Boolean);
  const mentions = ids(v.mentionRoleIds);
  const save = useMutation({
    mutationFn: () => {
      const body = { type, content: { ...c, color: c.color || null, imageUrl: c.imageUrl || null, thumbnailUrl: c.thumbnailUrl || null, footer: c.footer || null }, channelId: v.channelId, audience: v.audience, audienceRoleIds: ids(v.audienceRoleIds), audienceDepartments: v.audienceDepartments.split(',').map((x) => x.trim()).filter(Boolean), mentionRoleIds: mentions, scheduledAt: v.scheduledAt ? fromLocalInput(v.scheduledAt) : null, recurrence: v.recurrence };
      return ann ? api(`/announcements/${ann.id}`, { method: 'PATCH', body: { ...body, version: ann.version } }) : api('/announcements', { body });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['announcements'] }); onClose(); },
  });
  return (
    <Modal open wide title={ann ? 'Ankündigung bearbeiten' : 'Neue Ankündigung'} onClose={onClose}>
      <form className="grid gap-3 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid gap-3">
          {!ann && <Field label="Vorlage">{(id) => <Select id={id} value="" onChange={(e) => { const t = templates.data?.find((x) => x.type === e.target.value); if (t) { setType(t.type); setC(t.content); } }}><option value="">— Vorlage wählen —</option>{templates.data?.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}</Select>}</Field>}
          <Field label="Art">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as AnnouncementType)}>{ANNOUNCEMENT_TYPES.map((t) => <option key={t} value={t}>{ANNOUNCEMENT_TYPE_INFO[t].emoji} {ANNOUNCEMENT_TYPE_INFO[t].label}</option>)}</Select>}</Field>
          <Field label="Titel">{(id) => <Input id={id} required minLength={2} maxLength={240} value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} />}</Field>
          <Field label="Beschreibung (Markdown)">{(id) => <Textarea id={id} required rows={6} maxLength={4000} value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Farbe">{(id) => <Input id={id} type="color" value={c.color || ANNOUNCEMENT_TYPE_INFO[type].color} onChange={(e) => setC({ ...c, color: e.target.value })} />}</Field>
            <Field label="Footer">{(id) => <Input id={id} maxLength={200} value={c.footer ?? ''} onChange={(e) => setC({ ...c, footer: e.target.value })} />}</Field>
            <Field label="Bild (https)">{(id) => <Input id={id} type="url" value={c.imageUrl ?? ''} onChange={(e) => setC({ ...c, imageUrl: e.target.value })} />}</Field>
            <Field label="Thumbnail (https)">{(id) => <Input id={id} type="url" value={c.thumbnailUrl ?? ''} onChange={(e) => setC({ ...c, thumbnailUrl: e.target.value })} />}</Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.timestamp !== false} onChange={(e) => setC({ ...c, timestamp: e.target.checked })} />Zeitstempel</label>
          <fieldset className="grid gap-1 text-sm"><legend className="text-xs font-medium text-muted">Felder</legend>
            {c.fields.map((f, i) => <div key={i} className="flex gap-1"><Input aria-label="Feldname" placeholder="Name" value={f.name} onChange={(e) => setC({ ...c, fields: c.fields.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /><Input aria-label="Feldwert" placeholder="Wert" value={f.value} onChange={(e) => setC({ ...c, fields: c.fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} /><Button type="button" variant="ghost" size="sm" aria-label="Feld entfernen" onClick={() => setC({ ...c, fields: c.fields.filter((_, j) => j !== i) })}>×</Button></div>)}
            {c.fields.length < 25 && <Button type="button" size="sm" variant="ghost" onClick={() => setC({ ...c, fields: [...c.fields, { name: '', value: '', inline: false }] })}>+ Feld</Button>}
          </fieldset>
          <fieldset className="grid gap-1 text-sm"><legend className="text-xs font-medium text-muted">Link-Buttons (https)</legend>
            {c.links.map((l, i) => <div key={i} className="flex gap-1"><Input aria-label="Beschriftung" placeholder="Beschriftung" value={l.label} onChange={(e) => setC({ ...c, links: c.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /><Input aria-label="URL" type="url" placeholder="https://…" value={l.url} onChange={(e) => setC({ ...c, links: c.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} /><Button type="button" variant="ghost" size="sm" aria-label="Link entfernen" onClick={() => setC({ ...c, links: c.links.filter((_, j) => j !== i) })}>×</Button></div>)}
            {c.links.length < 5 && <Button type="button" size="sm" variant="ghost" onClick={() => setC({ ...c, links: [...c.links, { label: '', url: '' }] })}>+ Link</Button>}
          </fieldset>
        </div>
        <div className="grid content-start gap-3">
          <Preview type={type} content={c} mentions={mentions} />
          <Field label="Discord-Kanal (ID)">{(id) => <Input id={id} required inputMode="numeric" pattern="\d{15,25}" disabled={ann?.status === 'PUBLISHED'} value={v.channelId} onChange={(e) => setV({ ...v, channelId: e.target.value })} />}</Field>
          <Field label="Zielgruppe">{(id) => <Select id={id} value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value })}><option value="SERVER">Gesamter Server</option><option value="ROLES">Bestimmte Discord-Rollen</option><option value="DEPARTMENTS">Bestimmte Abteilungen</option></Select>}</Field>
          {v.audience === 'ROLES' && <Field label="Discord-Rollen (IDs, Komma)">{(id) => <Input id={id} value={v.audienceRoleIds} onChange={(e) => setV({ ...v, audienceRoleIds: e.target.value })} />}</Field>}
          {v.audience === 'DEPARTMENTS' && <Field label="Abteilungen (Komma)">{(id) => <Input id={id} value={v.audienceDepartments} onChange={(e) => setV({ ...v, audienceDepartments: e.target.value })} />}</Field>}
          <Field label={`Rollen erwähnen (IDs, max. ${MAX_MENTION_ROLES})`} hint={can('announce.mention') ? 'Leer = niemand wird gepingt' : 'Dafür fehlt dir das Recht „announce.mention“'}>{(id) => <Input id={id} disabled={!can('announce.mention')} value={v.mentionRoleIds} onChange={(e) => setV({ ...v, mentionRoleIds: e.target.value })} />}</Field>
          {mentions.length > MAX_MENTION_ROLES && <p role="alert" className="text-xs text-danger">Höchstens {MAX_MENTION_ROLES} Rollen.</p>}
          <Field label="Veröffentlichung planen (deutsche Zeit)" hint="leer = beim Veröffentlichen sofort">{(id) => <Input id={id} type="datetime-local" value={v.scheduledAt} onChange={(e) => setV({ ...v, scheduledAt: e.target.value })} />}</Field>
          <Field label="Wiederholen">{(id) => <Select id={id} value={v.recurrence} onChange={(e) => setV({ ...v, recurrence: e.target.value })}>{Object.entries(REC).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
          {save.error && <p role="alert" className="text-sm text-danger">{errText(save.error)}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={save.isPending || mentions.length > MAX_MENTION_ROLES}>{ann ? 'Speichern' : 'Als Entwurf speichern'}</Button></div>
        </div>
      </form>
    </Modal>
  );
}
