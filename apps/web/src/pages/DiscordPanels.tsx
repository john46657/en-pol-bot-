import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, Plus, Send, Trash2 } from 'lucide-react';
import { renderPanelTemplate, renderStaffList, formPanelResult, formPanelMessage, type FormPanel, type MessageSpec, type StaffList } from '@enrp/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { useGuilds } from '../lib/guilds';
import { useDocList } from '../lib/doclist';
import { ChannelPicker, RolePicker } from '../components/DiscordPickers';
import { DiscordPreview } from '../components/DiscordPreview';
import { Toggle } from '../components/ApplicationSettings';
import { ImageInput, useImageUrls } from '../components/ImageInput';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, PageHeader, Select, SkeletonRows, Textarea } from '../components/ui';

type Posted = { posted?: { channelId: string; messageId: string } | null };
const sfOk = (v: string | null) => !v || /^\d{15,25}$/.test(v);

/** Kanal-Name aus den bekannten Servern. */
function useChannelName() {
  const guilds = useGuilds();
  return (id: string) => { for (const g of guilds.data ?? []) { const c = g.channels.find((x) => x.id === id); if (c) return `#${c.name}`; } return id; };
}
function useRoleName() {
  const guilds = useGuilds();
  return (id: string) => { for (const g of guilds.data ?? []) { const r = g.roles.find((x) => x.id === id); if (r) return `@${r.name}`; } return `@${id}`; };
}

/** Vorschau: Rollen-/Mitglieds-Erwähnungen lesbar machen und hochgeladene Bilder anzeigen. */
function Preview({ message, names = {} }: { message: MessageSpec; names?: Record<string, string> }) {
  const roleName = useRoleName();
  const urls = useImageUrls((message.embeds ?? []).flatMap((e) => [e.image ?? '', e.thumbnail ?? '']));
  const readable = (t?: string) => t?.replace(/<@&(\d+)>/g, (_m, id: string) => `**${roleName(id)}**`).replace(/<@(\d+)>/g, (_m, id: string) => `@${names[id] ?? 'Mitglied'}`);
  return <DiscordPreview message={{ ...message, content: readable(message.content), embeds: message.embeds?.map((e) => ({ ...e, title: readable(e.title), description: readable(e.description), image: e.image ? urls[e.image] : undefined, thumbnail: e.thumbnail ? urls[e.thumbnail] : undefined })) }} />;
}

function SendBox({ posted, channelId, disabled, busy, onSend, msg, problems }: { posted?: Posted['posted']; channelId: string | null; disabled: boolean; busy: boolean; onSend: (m: 'update' | 'new') => void; msg?: { ok: boolean; text: string }; problems: string[] }) {
  const ch = useChannelName();
  return (
    <Card title="Senden">
      {problems.length > 0 && <p role="alert" className="mb-2 text-sm text-warning">{problems.join(' · ')}</p>}
      <p className="mb-2 text-sm text-muted">{posted ? <>Steht in <b>{ch(posted.channelId)}</b>.</> : 'Noch nicht gesendet.'}</p>
      <div className="flex flex-wrap gap-2">
        {posted && posted.channelId === channelId
          ? <><Button disabled={disabled || busy || !!problems.length} onClick={() => onSend('update')}><Send size={14} className="mr-1" />Nachricht aktualisieren</Button><Button variant="secondary" disabled={disabled || busy || !!problems.length} onClick={() => onSend('new')}>Neu senden</Button></>
          : <Button disabled={disabled || busy || !channelId || !!problems.length} onClick={() => onSend('new')}><Send size={14} className="mr-1" />{channelId ? `In ${ch(channelId)} senden` : 'Erst Kanal wählen'}</Button>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      <p className="mt-2 text-xs text-muted">Änderungen werden automatisch gespeichert. Der Bot braucht im Kanal „Nachrichten senden“ und „Links einbetten“.</p>
    </Card>
  );
}

// ───────────────────────── Staff-Liste ─────────────────────────

type StaffDoc = StaffList & Posted;
const blankStaff = (guildId: string | null): StaffDoc => ({
  id: crypto.randomUUID(), name: 'Staff-Team', guildId, channelId: null, title: 'EN | Staff-Team', intro: '', color: '#2b2d31', sections: [], emptyText: '/', dividerText: '━━━━━━━━━━━━━━━━━━━━',
  mention: true, onlyHighest: false, bullet: '•', footer: '', timestamp: true, autoUpdate: true, image: '', posted: null,
});
const staffProblems = (d: StaffDoc) => [!d.name.trim() && 'Name fehlt', !d.sections.length && 'Mindestens eine Rolle eintragen', !sfOk(d.channelId) && 'Kanal ungültig'].filter(Boolean) as string[];
const stripStaff = ({ posted: _p, ...d }: StaffDoc) => d;

function StaffEditor({ doc, set, manage }: { doc: StaffDoc; set: (p: Partial<StaffDoc>) => void; manage: boolean }) {
  const roleName = useRoleName();
  const sec = (i: number, p: Partial<StaffDoc['sections'][number]>) => set({ sections: doc.sections.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const move = (i: number, d: -1 | 1) => { const l = [...doc.sections]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x!); set({ sections: l }); };
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Name (nur im Dashboard)<Input aria-label="Name" disabled={!manage} maxLength={80} value={doc.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Kanal<ChannelPicker ariaLabel="Kanal" disabled={!manage} value={doc.channelId} onChange={(id) => set({ channelId: id })} /></label>
        <label className="grid gap-1 text-sm">Titel<Input aria-label="Titel" disabled={!manage} maxLength={256} value={doc.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Farbe<input type="color" aria-label="Farbe" disabled={!manage} value={doc.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-16 rounded border border-line bg-transparent" /></label>
      </div>
      <label className="grid gap-1 text-sm">Text oben (optional)<Textarea aria-label="Text oben" rows={2} disabled={!manage} maxLength={1000} value={doc.intro} onChange={(e) => set({ intro: e.target.value })} /></label>
      <section className="grid gap-2">
        <h3 className="font-semibold">Rollen ({doc.sections.length}/40) – Reihenfolge = Reihenfolge in Discord</h3>
        {doc.sections.map((s, i) => (
          <div key={`${s.roleId}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
            <Badge tone="info">{roleName(s.roleId)}</Badge>
            <Input aria-label={`Überschrift für ${roleName(s.roleId)}`} className="min-w-0 flex-1" disabled={!manage} maxLength={100} placeholder="Überschrift (leer = Rolle erwähnen)" value={s.label} onChange={(e) => sec(i, { label: e.target.value })} />
            <label className="flex items-center gap-1 text-xs"><Toggle label={`Trennlinie nach ${roleName(s.roleId)}`} checked={s.divider} onChange={(v) => sec(i, { divider: v })} />Trennlinie danach</label>
            <Button size="sm" variant="ghost" aria-label="nach oben" disabled={!manage || i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
            <Button size="sm" variant="ghost" aria-label="nach unten" disabled={!manage || i === doc.sections.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
            <Button size="sm" variant="ghost" aria-label={`${roleName(s.roleId)} entfernen`} disabled={!manage} onClick={() => set({ sections: doc.sections.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
          </div>
        ))}
        {manage && doc.sections.length < 40 && <RolePicker ariaLabel="Rolle hinzufügen" value={[]} onChange={(ids) => set({ sections: [...doc.sections, ...ids.filter((id) => !doc.sections.some((s) => s.roleId === id)).map((roleId) => ({ roleId, label: '', divider: true }))] })} />}
      </section>
      <details className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm font-semibold">Darstellung</summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Text bei leerer Rolle<Input aria-label="Text bei leerer Rolle" disabled={!manage} maxLength={50} value={doc.emptyText} onChange={(e) => set({ emptyText: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Aufzählungszeichen<Input aria-label="Aufzählungszeichen" disabled={!manage} maxLength={8} value={doc.bullet} onChange={(e) => set({ bullet: e.target.value })} /></label>
          <label className="grid gap-1 text-sm md:col-span-2">Trennlinie<Input aria-label="Trennlinie" disabled={!manage} maxLength={60} value={doc.dividerText} onChange={(e) => set({ dividerText: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Fußzeile<Input aria-label="Fußzeile" disabled={!manage} maxLength={200} value={doc.footer} onChange={(e) => set({ footer: e.target.value })} /></label>
          <ImageInput label="Bild unten (optional)" disabled={!manage} value={doc.image} onChange={(v) => set({ image: v })} />
          <div className="grid gap-2 text-sm md:col-span-2">
            <label className="flex items-center gap-2"><Toggle label="Mitglieder erwähnen" checked={doc.mention} onChange={(v) => set({ mention: v })} />Mitglieder als @Erwähnung (sonst Anzeigename)</label>
            <label className="flex items-center gap-2"><Toggle label="Nur höchste Rolle" checked={doc.onlyHighest} onChange={(v) => set({ onlyHighest: v })} />Wer mehrere Rollen hat, nur unter der obersten zeigen</label>
            <label className="flex items-center gap-2"><Toggle label="Zeitstempel" checked={doc.timestamp} onChange={(v) => set({ timestamp: v })} />Zeitstempel „zuletzt aktualisiert“</label>
            <label className="flex items-center gap-2"><Toggle label="Automatisch aktualisieren" checked={doc.autoUpdate} onChange={(v) => set({ autoUpdate: v })} />Automatisch aktualisieren, sobald sich Rollen ändern</label>
          </div>
        </div>
      </details>
    </div>
  );
}

/** 📋 Staff-Liste: Teamliste nach Discord-Rollen als selbst aktualisierende Nachricht (wie „EN | Staff-Team“). */
export function StaffLists() {
  const { can } = useAuth();
  const manage = can('team.manage');
  const ch = useChannelName();
  const L = useDocList<StaffDoc>({ path: '/discord-panels/staff', key: 'staff-lists', manage, valid: (d) => !staffProblems(d).length, serverKeys: ['posted'], strip: stripStaff, label: 'Staff-Liste' });
  const [del, setDel] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const preview = useQuery({ queryKey: ['staff-members', L.server], queryFn: () => api<{ members: { id: string; name: string; roleIds: string[] }[] }>('/discord-panels/staff-members'), enabled: !!L.open, refetchInterval: 30_000 });
  const send = useMutation({
    mutationFn: async (v: { d: StaffDoc; mode: 'update' | 'new' }) => { await L.saveNow(v.d); return api(`/discord-panels/staff/${v.d.id}/send`, { method: 'POST', body: { mode: v.mode } }); },
    onSuccess: () => { setMsg({ ok: true, text: 'Wird gesendet – der Bot rechnet die Mitglieder der Rollen selbst …' }); L.refetchSoon(); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const dup = useMutation({ mutationFn: (id: string) => api<StaffDoc>(`/discord-panels/staff/${id}/duplicate`, { method: 'POST' }), onSuccess: (d) => { L.add(d); } });
  if (L.q.error) return <ErrorState error={L.q.error} onRetry={() => void L.q.refetch()} />;
  if (!L.docs) return <SkeletonRows />;
  const cur = L.current;
  // lokale Vorschau: Struktur sofort, Mitglieder aus der Server-Vorschau
  const members = preview.data?.members ?? [];
  const local = cur ? renderStaffList(cur, members) : null;
  return (
    <>
      <PageHeader title="📋 Staff-Liste (Discord)" subtitle="Teamliste nach Discord-Rollen als Nachricht – Rollen, Reihenfolge, Überschriften und Aussehen frei einstellbar. Der Bot aktualisiert sie automatisch." />
      {!cur ? (
        <Card title="Listen" actions={manage && <Button size="sm" onClick={() => L.add(blankStaff(L.server || null))}><Plus size={16} className="mr-1" />Liste anlegen</Button>}>
          {!L.docs.length ? <EmptyState text="Noch keine Staff-Liste." hint="Lege eine Liste an, trage die Rollen in der gewünschten Reihenfolge ein und sende sie in einen Kanal." /> : (
            <ul className="grid gap-2">{L.docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                <span className="font-semibold">{d.name}</span>
                <Badge tone="neutral">{d.sections.length} Rollen</Badge>
                {d.posted ? <Badge tone="success">in {ch(d.posted.channelId)}</Badge> : <Badge tone="neutral">nicht gesendet</Badge>}
                {d.autoUpdate && <Badge tone="info">automatisch</Badge>}
                <span className="ml-auto flex gap-1">
                  {manage && <Button size="sm" variant="ghost" aria-label={`${d.name} duplizieren`} onClick={() => dup.mutate(d.id)}><Copy size={14} /></Button>}
                  <Button size="sm" variant="secondary" onClick={() => { L.setOpen(d.id); setMsg(undefined); }}>Bearbeiten</Button>
                </span>
              </li>
            ))}</ul>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <Card title={cur.name} actions={<span className="flex gap-1">{manage && <Button size="sm" variant="danger" aria-label="Liste löschen" onClick={() => setDel(cur.id)}><Trash2 size={14} /></Button>}<Button size="sm" variant="secondary" onClick={() => L.setOpen(undefined)}>Zurück</Button></span>}>
            <StaffEditor doc={cur} manage={manage} set={(p) => { L.update({ ...cur, ...p }); setMsg(undefined); }} />
          </Card>
          <div className="grid content-start gap-3 xl:sticky xl:top-4">
            {local && <Preview message={local} names={Object.fromEntries(members.map((m) => [m.id, m.name]))} />}
            <p className="text-xs text-muted">Vorschau mit den Teammitgliedern, die der Bot gerade meldet. In Discord zählen alle Mitglieder der Rollen.</p>
            <SendBox posted={cur.posted} channelId={cur.channelId} disabled={!manage} busy={send.isPending} onSend={(mode) => send.mutate({ d: cur, mode })} msg={msg} problems={staffProblems(cur)} />
          </div>
        </div>
      )}
      <ConfirmDialog open={!!del} danger title="Staff-Liste löschen?" message="Die Nachricht in Discord bleibt stehen, wird aber nicht mehr aktualisiert." confirmLabel="Löschen" busy={L.remove.isPending} onConfirm={() => del && L.remove.mutate(del, { onSuccess: () => setDel(undefined) })} onClose={() => setDel(undefined)} />
    </>
  );
}

// ───────────────────────── Formular-Panels ─────────────────────────

type FormDoc = FormPanel & Posted & { submissions?: number };
const blankForm = (guildId: string | null): FormDoc => ({
  id: crypto.randomUUID(), name: 'Funk- und Roblox-Daten', guildId, active: true, channelId: null, panelTitle: 'Funk- und Roblox-Daten', panelText: 'Klicke unten auf den Button und trage deinen Zello-Namen und deinen Roblox-Namen ein.', panelColor: '#22c55e', panelImage: '',
  buttonLabel: 'Daten eintragen', buttonEmoji: '📝', buttonStyle: 'success', modalTitle: 'Deine Daten',
  fields: [{ id: 'zello', label: 'Zello Funk', placeholder: 'Zello-Name', long: false, required: true, maxLength: 100 }, { id: 'roblox', label: 'Roblox User', placeholder: 'Roblox-Name', long: false, required: true, maxLength: 100 }],
  targetChannelId: null, template: 'Zello Funk: {zello}\n\nRoblox User: {roblox}', asEmbed: false, embedTitle: '', embedColor: '#3b82f6', asUser: true, reactions: ['✅'], pingRoleIds: [], onePerUser: true,
  confirmText: '✅ Danke! Deine Angaben wurden gepostet.', grantRoleIds: [], posted: null,
});
const formProblems = (d: FormDoc) => [
  !d.name.trim() && 'Name fehlt', !d.fields.length && 'Mindestens ein Feld', d.fields.some((f) => !/^[a-z0-9_]{1,30}$/.test(f.id)) && 'Kürzel: nur a–z, 0–9, _',
  new Set(d.fields.map((f) => f.id)).size !== d.fields.length && 'Kürzel doppelt', d.fields.some((f) => !f.label.trim()) && 'Feld ohne Beschriftung', !d.template.trim() && 'Nachrichtentext fehlt',
  !d.buttonLabel.trim() && 'Button-Text fehlt', !d.modalTitle.trim() && 'Formular-Titel fehlt',
].filter(Boolean) as string[];
const stripForm = ({ posted: _p, submissions: _s, ...d }: FormDoc) => d;

function FormEditor({ doc, set, manage }: { doc: FormDoc; set: (p: Partial<FormDoc>) => void; manage: boolean }) {
  const field = (i: number, p: Partial<FormDoc['fields'][number]>) => set({ fields: doc.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Name (nur im Dashboard)<Input aria-label="Name" disabled={!manage} maxLength={80} value={doc.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><Toggle label="Aktiv" checked={doc.active} onChange={(v) => set({ active: v })} />Aktiv (inaktiv: Button antwortet „nicht mehr aktiv“)</label>
      </div>
      <details open className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm font-semibold">1 · Panel-Nachricht mit Button</summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Kanal für das Panel<ChannelPicker ariaLabel="Kanal für das Panel" disabled={!manage} value={doc.channelId} onChange={(id) => set({ channelId: id })} /></label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="grid gap-1 text-sm">Titel<Input aria-label="Panel-Titel" disabled={!manage} maxLength={256} value={doc.panelTitle} onChange={(e) => set({ panelTitle: e.target.value })} /></label>
            <label className="grid gap-1 text-sm">Farbe<input type="color" aria-label="Panel-Farbe" disabled={!manage} value={doc.panelColor} onChange={(e) => set({ panelColor: e.target.value })} className="h-9 w-16 rounded border border-line bg-transparent" /></label>
          </div>
          <label className="grid gap-1 text-sm md:col-span-2">Text<Textarea aria-label="Panel-Text" rows={3} disabled={!manage} maxLength={4000} value={doc.panelText} onChange={(e) => set({ panelText: e.target.value })} /></label>
          <div className="md:col-span-2"><ImageInput label="Bild (optional)" disabled={!manage} value={doc.panelImage} onChange={(v) => set({ panelImage: v })} /></div>
          <label className="grid gap-1 text-sm">Button-Text<Input aria-label="Button-Text" disabled={!manage} maxLength={80} value={doc.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm">Emoji<Input aria-label="Button-Emoji" disabled={!manage} maxLength={64} value={doc.buttonEmoji} onChange={(e) => set({ buttonEmoji: e.target.value })} /></label>
            <label className="grid gap-1 text-sm">Farbe<Select aria-label="Button-Farbe" disabled={!manage} value={doc.buttonStyle} onChange={(e) => set({ buttonStyle: e.target.value as FormDoc['buttonStyle'] })}><option value="success">Grün</option><option value="primary">Blau</option><option value="secondary">Grau</option><option value="danger">Rot</option></Select></label>
          </div>
        </div>
      </details>
      <details open className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm font-semibold">2 · Formular ({doc.fields.length}/5 Felder)</summary>
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1 text-sm">Titel des Formulars<Input aria-label="Formular-Titel" disabled={!manage} maxLength={45} value={doc.modalTitle} onChange={(e) => set({ modalTitle: e.target.value })} /></label>
          {doc.fields.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-2 md:grid-cols-[120px_1fr_1fr_90px_auto]">
              <Input aria-label={`Kürzel Feld ${i + 1}`} disabled={!manage} maxLength={30} value={f.id} onChange={(e) => field(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
              <Input aria-label={`Beschriftung Feld ${i + 1}`} disabled={!manage} maxLength={45} placeholder="Beschriftung" value={f.label} onChange={(e) => field(i, { label: e.target.value })} />
              <Input aria-label={`Platzhalter Feld ${i + 1}`} disabled={!manage} maxLength={100} placeholder="Platzhalter" value={f.placeholder} onChange={(e) => field(i, { placeholder: e.target.value })} />
              <Input aria-label={`Max. Länge Feld ${i + 1}`} type="number" min={1} max={4000} disabled={!manage} value={f.maxLength} onChange={(e) => field(i, { maxLength: Math.max(1, Math.min(4000, Number(e.target.value) || 1)) })} />
              <span className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1"><Toggle label={`Pflicht Feld ${i + 1}`} checked={f.required} onChange={(v) => field(i, { required: v })} />Pflicht</label>
                <label className="flex items-center gap-1"><Toggle label={`Lang Feld ${i + 1}`} checked={f.long} onChange={(v) => field(i, { long: v })} />lang</label>
                <Button size="sm" variant="ghost" aria-label={`Feld ${i + 1} löschen`} disabled={!manage || doc.fields.length <= 1} onClick={() => set({ fields: doc.fields.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
              </span>
            </div>
          ))}
          <Button size="sm" variant="secondary" className="w-fit" disabled={!manage || doc.fields.length >= 5} onClick={() => set({ fields: [...doc.fields, { id: `feld${doc.fields.length + 1}`, label: 'Neues Feld', placeholder: '', long: false, required: true, maxLength: 200 }] })}><Plus size={14} className="mr-1" />Feld</Button>
          <p className="text-xs text-muted">Discord erlaubt höchstens 5 Felder je Formular. Das Kürzel benutzt du im Nachrichtentext als <code>{'{kürzel}'}</code>.</p>
        </div>
      </details>
      <details open className="rounded-lg border border-line p-2">
        <summary className="cursor-pointer text-sm font-semibold">3 · Nachricht nach dem Absenden</summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Zielkanal (leer = Kanal des Panels)<ChannelPicker ariaLabel="Zielkanal" disabled={!manage} value={doc.targetChannelId} onChange={(id) => set({ targetChannelId: id })} /></label>
          <label className="grid gap-1 text-sm">Reaktionen (mit Leerzeichen getrennt)<Input aria-label="Reaktionen" disabled={!manage} value={doc.reactions.join(' ')} onChange={(e) => set({ reactions: e.target.value.split(/\s+/).filter(Boolean).slice(0, 10) })} /></label>
          <label className="grid gap-1 text-sm md:col-span-2">Text – Platzhalter: {doc.fields.map((f) => `{${f.id}}`).join(' ')} {'{user} {user.name} {datum} {zeit}'}
            <Textarea aria-label="Nachrichtentext" rows={4} disabled={!manage} maxLength={2000} value={doc.template} onChange={(e) => set({ template: e.target.value })} />
          </label>
          <div className="grid gap-2 text-sm md:col-span-2">
            <label className="flex items-center gap-2"><Toggle label="Als Person posten" checked={doc.asUser} onChange={(v) => set({ asUser: v })} />Mit Name und Profilbild der Person posten (wie im Screenshot; Bot braucht „Webhooks verwalten“)</label>
            <label className="flex items-center gap-2"><Toggle label="Einmal je Person" checked={doc.onePerUser} onChange={(v) => set({ onePerUser: v })} />Jede Person nur einmal – erneutes Absenden ersetzt die alte Nachricht</label>
            <label className="flex items-center gap-2"><Toggle label="Als Embed" checked={doc.asEmbed} onChange={(v) => set({ asEmbed: v })} />Als Embed statt als Text</label>
          </div>
          {doc.asEmbed && <>
            <label className="grid gap-1 text-sm">Embed-Titel<Input aria-label="Embed-Titel" disabled={!manage} maxLength={256} value={doc.embedTitle} onChange={(e) => set({ embedTitle: e.target.value })} /></label>
            <label className="grid gap-1 text-sm">Embed-Farbe<input type="color" aria-label="Embed-Farbe" disabled={!manage} value={doc.embedColor} onChange={(e) => set({ embedColor: e.target.value })} className="h-9 w-16 rounded border border-line bg-transparent" /></label>
          </>}
          <label className="grid gap-1 text-sm">Rollen erwähnen<RolePicker ariaLabel="Rollen erwähnen" disabled={!manage} max={10} value={doc.pingRoleIds} onChange={(ids) => set({ pingRoleIds: ids })} /></label>
          <label className="grid gap-1 text-sm">Rollen nach dem Absenden geben<RolePicker ariaLabel="Rollen geben" disabled={!manage} max={10} value={doc.grantRoleIds} onChange={(ids) => set({ grantRoleIds: ids })} /></label>
          <label className="grid gap-1 text-sm md:col-span-2">Bestätigung (nur für die Person sichtbar)<Input aria-label="Bestätigung" disabled={!manage} maxLength={500} value={doc.confirmText} onChange={(e) => set({ confirmText: e.target.value })} /></label>
        </div>
      </details>
    </div>
  );
}

function Submissions({ panel }: { panel: FormDoc }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['panel-subs', panel.id], queryFn: () => api<{ id: string; discordId: string; userName: string; values: Record<string, string>; createdAt: string; updatedAt: string; messageId: string | null }[]>(`/discord-panels/forms/${panel.id}/submissions`), enabled: !!panel.submissions });
  const del = useMutation({ mutationFn: (id: string) => api(`/discord-panels/submissions/${id}`, { method: 'DELETE' }), onSuccess: () => void q.refetch() });
  if (!panel.submissions) return null;
  return (
    <Card title={`Einsendungen (${panel.submissions})`}>
      {q.isLoading ? <SkeletonRows rows={3} /> : (
        <div className="table-scroll"><table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-2">Person</th>{panel.fields.map((f) => <th key={f.id}>{f.label}</th>)}<th>Zeit</th><th /></tr></thead>
          <tbody>{(q.data ?? []).map((s) => (
            <tr key={s.id} className="border-b border-line/60">
              <td className="p-2">{s.userName}</td>{panel.fields.map((f) => <td key={f.id}>{s.values[f.id] ?? ''}</td>)}<td className="text-muted">{fmt(s.updatedAt)}</td>
              <td>{can('settings.manage') && <Button size="sm" variant="ghost" aria-label={`Einsendung von ${s.userName} löschen`} onClick={() => del.mutate(s.id)}><Trash2 size={13} /></Button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  );
}

/** 📝 Formular-Panels: Nachricht mit Button → Formular → fertige Nachricht im Kanal (z. B. „Zello Funk: … / Roblox User: …“ mit ✅). */
export function FormPanels() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const ch = useChannelName();
  const L = useDocList<FormDoc>({ path: '/discord-panels/forms', key: 'form-panels', manage, valid: (d) => !formProblems(d).length, serverKeys: ['posted', 'submissions'], strip: stripForm, label: 'Formular-Panel' });
  const [del, setDel] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const send = useMutation({
    mutationFn: async (v: { d: FormDoc; mode: 'update' | 'new' }) => { await L.saveNow(v.d); return api(`/discord-panels/forms/${v.d.id}/send`, { method: 'POST', body: { mode: v.mode } }); },
    onSuccess: () => { setMsg({ ok: true, text: 'Wird gesendet …' }); L.refetchSoon(); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  if (L.q.error) return <ErrorState error={L.q.error} onRetry={() => void L.q.refetch()} />;
  if (!L.docs) return <SkeletonRows />;
  const cur = L.current;
  const sample = cur ? Object.fromEntries(cur.fields.map((f) => [f.id, f.placeholder || f.label])) : {};
  return (
    <>
      <PageHeader title="📝 Formular-Panels" subtitle="Panel mit Button in Discord: Mitglieder klicken, füllen ein Formular aus und der Bot postet die Angaben als Nachricht (mit Reaktionen) – alles hier einstellbar." />
      {!cur ? (
        <Card title="Panels" actions={manage && <Button size="sm" onClick={() => L.add(blankForm(L.server || null))}><Plus size={16} className="mr-1" />Panel anlegen</Button>}>
          {!L.docs.length ? <EmptyState text="Noch keine Formular-Panels." hint="Beispiel: „Zello Funk“ und „Roblox User“ abfragen und mit ✅ posten." /> : (
            <ul className="grid gap-2">{L.docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                <span aria-hidden className="h-8 w-1.5 rounded" style={{ background: d.panelColor }} />
                <span className="font-semibold">{d.name}</span>
                {!d.active && <Badge tone="warning">inaktiv</Badge>}
                {d.posted ? <Badge tone="success">in {ch(d.posted.channelId)}</Badge> : <Badge tone="neutral">nicht gesendet</Badge>}
                <Badge tone="neutral">{d.submissions ?? 0} Einsendungen</Badge>
                <Button size="sm" variant="secondary" className="ml-auto" onClick={() => { L.setOpen(d.id); setMsg(undefined); }}>Bearbeiten</Button>
              </li>
            ))}</ul>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div className="grid content-start gap-4">
            <Card title={cur.name} actions={<span className="flex gap-1">{manage && <Button size="sm" variant="danger" aria-label="Panel löschen" onClick={() => setDel(cur.id)}><Trash2 size={14} /></Button>}<Button size="sm" variant="secondary" onClick={() => L.setOpen(undefined)}>Zurück</Button></span>}>
              <FormEditor doc={cur} manage={manage} set={(p) => { L.update({ ...cur, ...p }); setMsg(undefined); }} />
            </Card>
            <Submissions panel={cur} />
          </div>
          <div className="grid content-start gap-3 xl:sticky xl:top-4">
            <p className="text-xs font-semibold uppercase text-muted">Panel</p>
            <Preview message={formPanelMessage(cur)} />
            <p className="text-xs font-semibold uppercase text-muted">Nach dem Absenden</p>
            <Preview message={formPanelResult(cur, sample, { id: '0', name: 'Mitglied' })} names={{ 0: 'Mitglied' }} />
            {cur.reactions.length > 0 && <div className="flex flex-wrap gap-1 pl-14">{cur.reactions.map((r, i) => <span key={i} className="rounded-md bg-[#2b2d31] px-2 py-0.5 text-sm">{r} 1</span>)}</div>}
            <p className="text-xs text-muted">Beispieltext: {renderPanelTemplate(cur.template, sample, { id: '0', name: 'Mitglied' }).slice(0, 80)}…</p>
            <SendBox posted={cur.posted} channelId={cur.channelId} disabled={!manage} busy={send.isPending} onSend={(mode) => send.mutate({ d: cur, mode })} msg={msg} problems={formProblems(cur)} />
          </div>
        </div>
      )}
      <ConfirmDialog open={!!del} danger title="Panel löschen?" message="Der Button in Discord funktioniert danach nicht mehr. Einsendungen bleiben gespeichert." confirmLabel="Löschen" busy={L.remove.isPending} onConfirm={() => del && L.remove.mutate(del, { onSuccess: () => setDel(undefined) })} onClose={() => setDel(undefined)} />
    </>
  );
}
