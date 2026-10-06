import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CLAIM_MODES, CLOSE_REASON_MODES, CLOSE_REASON_SOURCES, QUESTION_TYPES, STATUS_KINDS, TICKET_ACTIONS, TICKET_PLACEHOLDERS, defaultTicketButtons, renderTicketText, ticketChannelName,
  type ButtonStyleName, type MessageSpec, type QuestionType, type TicketAction, type TicketQuestion, type TicketVars,
} from '@enrp/shared';
import { api } from '../../lib/api';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Select, SkeletonRows, Textarea } from '../../components/ui';
import { DiscordPreview } from '../../components/DiscordPreview';
import {
  errText, fromHex, hex, idsFromText, idsToText, label, useTicketConfig,
  type TicketCategoryCfg, type TicketConfig, type TicketPanelCfg, type TicketPriorityCfg, type TicketReasonCfg, type TicketSettingsCfg, type TicketStatusCfg,
} from '../../lib/tickets';

type Section = 'panels' | 'categories' | 'states' | 'settings';
const STYLES: ButtonStyleName[] = ['primary', 'secondary', 'success', 'danger'];
const STYLE_LABEL: Record<ButtonStyleName, string> = { primary: 'Blue', secondary: 'Grey', success: 'Green', danger: 'Red' };
/** Für die API: `null` → weglassen (leere Felder werden dort zu „nicht gesetzt“). */
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as Partial<T>;
/** Beispielwerte für Vorschauen. */
const SAMPLE: TicketVars = { '{user}': '@Max', '{username}': 'max', '{user_id}': '123456789012345678', '{ticket_id}': '0042', '{staff}': 'niemand', '{status}': '🟢 Offen', '{priority}': '🟡 Normal', '{reason}': 'Gelöst', '{closed_by}': '@Chief', '{created_at}': new Date().toLocaleString('de-DE'), '{closed_at}': new Date().toLocaleString('de-DE'), '{channel}': '#support-max', '{actor}': '@Chief' };

/** Einrichtung des Ticket-Systems – alles, was der Bot anzeigt und tut, kommt von hier. */
export function TicketSetup({ section }: { section: Section }) {
  const cfg = useTicketConfig();
  if (cfg.isLoading) return <SkeletonRows />;
  if (cfg.error) return <ErrorState error={cfg.error} onRetry={() => void cfg.refetch()} />;
  const c = cfg.data!;
  return (
    <div className="grid gap-4">
      {section === 'panels' && <Panels c={c} />}
      {section === 'categories' && <Categories c={c} />}
      {section === 'states' && <States c={c} />}
      {section === 'settings' && <General c={c} />}
      <Placeholders />
    </div>
  );
}

function useSave<T>(fn: (v: T) => Promise<unknown>, done?: (r: unknown) => void) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['ticket-config'] }); done?.(r); } });
}
const Err = ({ error }: { error: unknown }) => (error ? <p role="alert" className="text-sm text-danger">{errText(error)}</p> : null);
const Check = ({ label: l, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{l}{hint && <span className="block text-xs text-muted">{hint}</span>}</span></label>
);
const Num = ({ label: l, value, onChange, min = 0, max, hint }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; hint?: string }) => (
  <Field label={l} hint={hint}>{(id) => <Input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} />}</Field>
);
const Color = ({ label: l, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
  <Field label={l}>{(id) => <div className="flex gap-2"><input id={id} type="color" aria-label={l} className="h-9 w-12 rounded border border-line bg-bg" value={hex(value)} onChange={(e) => onChange(fromHex(e.target.value))} /><Input aria-label={`${l} (hex)`} value={hex(value)} onChange={(e) => /^#?[0-9a-f]{6}$/i.test(e.target.value) && onChange(fromHex(e.target.value))} /></div>}</Field>
);
const Ids = ({ label: l, value, onChange, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string }) => {
  const [text, setText] = useState(idsToText(value));
  useEffect(() => setText(idsToText(value)), [value]);
  return <Field label={l} hint={hint ?? 'Discord IDs, separated by commas'}>{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(idsFromText(text))} placeholder="123456789012345678, …" />}</Field>;
};
const Names = ({ label: l, value, onChange, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string }) => {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  return <Field label={l} hint={hint}>{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(text.split(',').map((x) => x.trim()).filter(Boolean))} />}</Field>;
};
const move = <T,>(a: T[], i: number, d: -1 | 1) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j]!, b[i]!]; return b; };
const Section = ({ title, children }: { title: string; children: ReactNode }) => <fieldset className="grid gap-3 rounded-md border border-line p-3"><legend className="px-1 text-sm font-semibold">{title}</legend>{children}</fieldset>;

// =============================== Panels ===============================
type PanelDraft = Omit<TicketPanelCfg, 'id' | 'messageChannelId' | 'messageId'> & { id?: string };
const NEW_PANEL: PanelDraft = { name: 'Neues Panel', title: 'Support', description: 'Wähle unten die passende Kategorie, um ein Ticket zu öffnen.', emoji: '🎫', color: 0x3b82f6, thumbnailUrl: null, imageUrl: null, bannerUrl: null, footer: null, footerIconUrl: null, authorName: null, authorIconUrl: null, style: 'BUTTONS', placeholder: 'Wähle eine Kategorie …', channelId: null, categoryIds: [], allowedRoleIds: [], position: 0 };

/** Gleiche Darstellung wie der Bot (Embed + Buttons bzw. Menü). */
function panelPreview(p: PanelDraft, cats: TicketCategoryCfg[]): MessageSpec {
  const list = p.categoryIds.map((id) => cats.find((c) => c.id === id)).filter((c): c is TicketCategoryCfg => !!c && c.active);
  const embed = { title: [p.emoji, p.title].filter(Boolean).join(' ') || undefined, description: p.description || undefined, color: p.color, thumbnail: p.thumbnailUrl ?? undefined, image: p.bannerUrl ?? p.imageUrl ?? undefined, footer: p.footer ?? undefined, footerIcon: p.footerIconUrl ?? undefined, author: p.authorName ?? undefined, authorIcon: p.authorIconUrl ?? undefined };
  if (p.style === 'DROPDOWN') return { embeds: [embed], select: { id: 'x', placeholder: p.placeholder, options: list.map((c) => ({ label: c.name, value: c.id, description: c.description || undefined, emoji: c.emoji ?? undefined })) } };
  return { embeds: [embed], buttons: list.map((c) => ({ id: c.id, label: c.name, emoji: c.emoji ?? undefined, style: c.buttonStyle })) };
}

function Panels({ c }: { c: TicketConfig }) {
  const [edit, setEdit] = useState<PanelDraft>();
  const [del, setDel] = useState<TicketPanelCfg>();
  const [msg, setMsg] = useState<string>();
  const dup = useSave((id: string) => api(`/support-tickets/panels/${id}/duplicate`, { method: 'POST' }));
  const remove = useSave((id: string) => api(`/support-tickets/panels/${id}`, { method: 'DELETE' }), () => setDel(undefined));
  const publish = useSave((id: string) => api<{ updating: boolean }>(`/support-tickets/panels/${id}/publish`, { method: 'POST', body: {} }), (r) => setMsg((r as { updating: boolean }).updating ? 'The panel message in Discord is being updated.' : 'The panel is being sent to Discord.'));
  if (edit) return <PanelEditor draft={edit} c={c} onDone={() => setEdit(undefined)} />;
  return (
    <Card title="Ticket panels" actions={<Button size="sm" onClick={() => setEdit({ ...NEW_PANEL, categoryIds: c.categories.filter((x) => x.active).map((x) => x.id) })}>New panel</Button>}>
      <Err error={dup.error ?? remove.error ?? publish.error} />
      {msg && <p role="status" className="mb-2 text-sm text-success">{msg}</p>}
      {!c.panels.length ? <EmptyState text="No panels yet." hint="A panel is the message in Discord with the buttons/menu to open a ticket." /> : (
        <ul className="grid gap-3 md:grid-cols-2">{c.panels.map((p) => (
          <li key={p.id} className="grid gap-2 rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{p.emoji} {p.name}</strong>{p.messageId ? <Badge tone="success">posted</Badge> : <Badge>not posted</Badge>}</div>
            <p className="text-xs text-muted">{p.style === 'DROPDOWN' ? 'Dropdown' : 'Buttons'} · {p.categoryIds.length} categories · channel {p.channelId ?? '—'}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>Edit</Button>
              <Button size="sm" disabled={publish.isPending || !p.channelId} title={p.channelId ? undefined : 'Set a channel first'} onClick={() => { setMsg(undefined); publish.mutate(p.id); }}>{p.messageId ? 'Update in Discord' : 'Send to Discord'}</Button>
              <Button size="sm" variant="secondary" disabled={dup.isPending} onClick={() => dup.mutate(p.id)}>Duplicate</Button>
              <Button size="sm" variant="ghost" onClick={() => setDel(p)}>Delete</Button>
            </div>
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={!!del} danger title="Delete panel?" message={`„${del?.name ?? ''}“ is deleted. A message already posted in Discord stays until you delete it there.`} confirmLabel="Delete" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </Card>
  );
}

function PanelEditor({ draft, c, onDone }: { draft: PanelDraft; c: TicketConfig; onDone: () => void }) {
  const [p, setP] = useState<PanelDraft>(draft);
  const set = (x: Partial<PanelDraft>) => setP({ ...p, ...x });
  const save = useSave(() => api(p.id ? `/support-tickets/panels/${p.id}` : '/support-tickets/panels', { method: p.id ? 'PUT' : 'POST', body: clean({ ...p, id: undefined }) }), onDone);
  const url = (k: 'thumbnailUrl' | 'imageUrl' | 'bannerUrl' | 'footerIconUrl' | 'authorIconUrl', l: string) => <Field label={l} hint="https:// link to an image">{(id) => <Input id={id} value={p[k] ?? ''} onChange={(e) => set({ [k]: e.target.value || null })} />}</Field>;
  const toggleCat = (id: string) => set({ categoryIds: p.categoryIds.includes(id) ? p.categoryIds.filter((x) => x !== id) : [...p.categoryIds, id] });
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <Card title={p.id ? `Edit panel „${draft.name}“` : 'New panel'} actions={<Button size="sm" variant="ghost" onClick={onDone}>Back</Button>}>
        <div className="grid gap-3">
          <Section title="General">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Internal name">{(id) => <Input id={id} value={p.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <Field label="Target channel (Discord ID)">{(id) => <Input id={id} inputMode="numeric" value={p.channelId ?? ''} onChange={(e) => set({ channelId: e.target.value.trim() || null })} placeholder="123456789012345678" />}</Field>
              <Field label="Type">{(id) => <Select id={id} value={p.style} onChange={(e) => set({ style: e.target.value as PanelDraft['style'] })}><option value="BUTTONS">Buttons</option><option value="DROPDOWN">Dropdown menu</option></Select>}</Field>
              {p.style === 'DROPDOWN' && <Field label="Dropdown placeholder">{(id) => <Input id={id} value={p.placeholder} maxLength={150} onChange={(e) => set({ placeholder: e.target.value })} />}</Field>}
              <Num label="Order" value={p.position} max={1000} onChange={(v) => set({ position: v })} />
            </div>
            <Ids label="Visible for Discord roles (empty = everyone)" value={p.allowedRoleIds} onChange={(v) => set({ allowedRoleIds: v })} />
          </Section>
          <Section title="Embed">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Emoji">{(id) => <Input id={id} value={p.emoji ?? ''} maxLength={64} onChange={(e) => set({ emoji: e.target.value || null })} />}</Field>
              <Field label="Title">{(id) => <Input id={id} value={p.title} maxLength={256} onChange={(e) => set({ title: e.target.value })} />}</Field>
            </div>
            <Field label="Description (Discord markdown)">{(id) => <Textarea id={id} rows={5} value={p.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} />}</Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Color label="Color" value={p.color} onChange={(v) => set({ color: v })} />
              <Field label="Author">{(id) => <Input id={id} value={p.authorName ?? ''} maxLength={256} onChange={(e) => set({ authorName: e.target.value || null })} />}</Field>
              {url('authorIconUrl', 'Author icon')}
              {url('thumbnailUrl', 'Thumbnail')}
              {url('bannerUrl', 'Banner (large image)')}
              {url('imageUrl', 'Image (used when no banner)')}
              <Field label="Footer">{(id) => <Input id={id} value={p.footer ?? ''} maxLength={2048} onChange={(e) => set({ footer: e.target.value || null })} />}</Field>
              {url('footerIconUrl', 'Footer icon')}
            </div>
          </Section>
          <Section title="Ticket categories in this panel (in this order)">
            {!c.categories.length ? <p className="text-sm text-muted">Create a category first.</p> : (
              <ul className="grid gap-1">{[...p.categoryIds.map((id) => c.categories.find((x) => x.id === id)).filter((x): x is TicketCategoryCfg => !!x), ...c.categories.filter((x) => !p.categoryIds.includes(x.id))].map((cat) => {
                const i = p.categoryIds.indexOf(cat.id);
                return (
                  <li key={cat.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Check label={`${label(cat)}${cat.active ? '' : ' (inactive)'}`} checked={i >= 0} onChange={() => toggleCat(cat.id)} />
                    {i >= 0 && <span className="ml-auto flex gap-1"><Button size="sm" variant="ghost" aria-label={`Move ${cat.name} up`} disabled={i === 0} onClick={() => set({ categoryIds: move(p.categoryIds, i, -1) })}>↑</Button><Button size="sm" variant="ghost" aria-label={`Move ${cat.name} down`} disabled={i === p.categoryIds.length - 1} onClick={() => set({ categoryIds: move(p.categoryIds, i, 1) })}>↓</Button></span>}
                  </li>
                );
              })}</ul>
            )}
          </Section>
          <Err error={save.error} />
          <div className="flex gap-2"><Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save panel</Button><Button variant="secondary" onClick={onDone}>Cancel</Button></div>
          <p className="text-xs text-muted">After saving, use „Send to Discord“ / „Update in Discord“ in the panel list.</p>
        </div>
      </Card>
      <div className="xl:sticky xl:top-4 xl:self-start"><Card title="Preview"><DiscordPreview message={panelPreview(p, c.categories)} /></Card></div>
    </div>
  );
}

// =============================== Kategorien ===============================
type CatDraft = Omit<TicketCategoryCfg, 'id'> & { id?: string };
const NEW_CATEGORY: CatDraft = {
  name: 'Neue Kategorie', description: '', emoji: '🎫', color: 0x3b82f6, buttonStyle: 'secondary', position: 0, active: true, discordCategoryId: null, channelNameFormat: 'ticket-{username}',
  staffRoleIds: [], extraRoleIds: [], requiredRoleIds: [], allowedUserIds: [], accessRoleNames: [], maxOpen: 1, cooldownMinutes: 0, defaultPriorityId: null, questions: [],
  welcomeTitle: '🎫 {category}', welcomeMessage: 'Hallo {user}!\n\nBeschreibe dein Anliegen so genau wie möglich. Ein Teammitglied kümmert sich schnellstmöglich darum.', mentionStaff: true, mentionText: '', buttons: defaultTicketButtons(),
  claimMode: 'SINGLE', claimMessage: '👤 Bearbeiter: {staff}', claimNotifyStaff: false, creatorCanClose: true, closeReasonMode: 'OPTIONAL', closeReasonSource: 'BOTH', closeRemovesAccess: true, allowReopen: true,
  transcriptOnClose: true, transcriptChannelId: null, transcriptToUser: false, ratingEnabled: true, ratingQuestion: 'Wie zufrieden warst du mit dem Support?',
  autoCloseMinutes: 0, autoCloseWarnMinutes: 0, autoCloseMessage: '⏰ {user}, dieses Ticket wird bald wegen Inaktivität geschlossen. Schreib eine Nachricht, wenn du noch Hilfe brauchst.', deleteAfterMinutes: -1,
  escalationRoleIds: [], escalationPriorityId: null, escalationMessage: '🟠 Dieses Ticket wurde eskaliert. {staff}',
};

function Categories({ c }: { c: TicketConfig }) {
  const [edit, setEdit] = useState<CatDraft>();
  const [del, setDel] = useState<TicketCategoryCfg>();
  const dup = useSave((id: string) => api(`/support-tickets/categories/${id}/duplicate`, { method: 'POST' }));
  const remove = useSave((id: string) => api(`/support-tickets/categories/${id}`, { method: 'DELETE' }), () => setDel(undefined));
  if (edit) return <CategoryEditor draft={edit} c={c} onDone={() => setEdit(undefined)} />;
  return (
    <Card title="Ticket categories" actions={<Button size="sm" onClick={() => setEdit({ ...NEW_CATEGORY, position: c.categories.length })}>New category</Button>}>
      <Err error={dup.error ?? remove.error} />
      {!c.categories.length ? <EmptyState text="No categories yet." hint="Categories are the ticket types (Support, Bewerbung, Beschwerde …)." /> : (
        <ul className="grid gap-3 md:grid-cols-2">{c.categories.map((x) => (
          <li key={x.id} className="grid gap-2 rounded-md border border-line p-3" style={{ borderLeft: `4px solid ${hex(x.color)}` }}>
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{label(x)}</strong>{x.active ? <Badge tone="success">active</Badge> : <Badge>inactive</Badge>}</div>
            <p className="text-xs text-muted">{x.questions.length} questions · max. {x.maxOpen || '∞'} open · claim {CLAIM_MODES[x.claimMode]} · channel „{x.channelNameFormat}“</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdit(x)}>Edit</Button>
              <Button size="sm" variant="secondary" disabled={dup.isPending} onClick={() => dup.mutate(x.id)}>Duplicate</Button>
              <Button size="sm" variant="ghost" onClick={() => setDel(x)}>Delete</Button>
            </div>
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={!!del} danger title="Delete category?" message={`„${del?.name ?? ''}“ is deleted. Categories with tickets can't be deleted – set them inactive instead.`} confirmLabel="Delete" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </Card>
  );
}

function CategoryEditor({ draft, c, onDone }: { draft: CatDraft; c: TicketConfig; onDone: () => void }) {
  const [d, setD] = useState<CatDraft>({ ...draft, buttons: draft.buttons.length ? draft.buttons : defaultTicketButtons() });
  const set = (x: Partial<CatDraft>) => setD({ ...d, ...x });
  const save = useSave(() => api(d.id ? `/support-tickets/categories/${d.id}` : '/support-tickets/categories', { method: d.id ? 'PUT' : 'POST', body: clean({ ...d, id: undefined }) }), onDone);
  const prio = c.priorities.find((p) => p.id === d.defaultPriorityId) ?? c.priorities.find((p) => p.isDefault);
  const status = c.statuses.find((s) => s.isDefault);
  const vars: TicketVars = { ...SAMPLE, '{category}': d.name, '{priority}': prio ? label(prio) : '—', '{status}': status ? label(status) : '—', '{channel}': `#${ticketChannelName(d.channelNameFormat, { ...SAMPLE, '{category}': d.name })}` };
  const preview: MessageSpec = {
    content: ['@Max', ...(d.mentionStaff ? d.staffRoleIds.map((r) => `@Rolle ${r}`) : []), renderTicketText(d.mentionText, vars)].filter(Boolean).join(' '),
    embeds: [{ title: renderTicketText(d.welcomeTitle || '🎫 {category}', vars), description: renderTicketText(d.welcomeMessage || 'Hallo {user}!', vars), color: prio?.color ?? d.color, fields: [{ name: 'Status', value: vars['{status}']!, inline: true }, { name: 'Priorität', value: vars['{priority}']!, inline: true }, { name: 'Bearbeiter', value: 'niemand', inline: true }], footer: 'Ticket #0042 · erstellt jetzt' }],
    buttons: d.buttons.filter((b) => b.enabled && TICKET_ACTIONS[b.action].state !== 'closed' && b.action !== 'unclaim' && b.action !== 'unlock').map((b) => ({ id: b.action, label: b.label, emoji: b.emoji, style: b.style })).slice(0, 25),
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <Card title={d.id ? `Edit category „${draft.name}“` : 'New category'} actions={<Button size="sm" variant="ghost" onClick={onDone}>Back</Button>}>
        <div className="grid gap-3">
          <Section title="General">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name">{(id) => <Input id={id} value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <Field label="Emoji">{(id) => <Input id={id} value={d.emoji ?? ''} maxLength={64} onChange={(e) => set({ emoji: e.target.value || null })} />}</Field>
              <Field label="Short description (dropdown)">{(id) => <Input id={id} value={d.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />}</Field>
              <Field label="Panel button color">{(id) => <Select id={id} value={d.buttonStyle} onChange={(e) => set({ buttonStyle: e.target.value as ButtonStyleName })}>{STYLES.map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}</Select>}</Field>
              <Color label="Embed color" value={d.color} onChange={(v) => set({ color: v })} />
              <Num label="Order" value={d.position} max={1000} onChange={(v) => set({ position: v })} />
              <Field label="Default priority">{(id) => <Select id={id} value={d.defaultPriorityId ?? ''} onChange={(e) => set({ defaultPriorityId: e.target.value || null })}><option value="">Default priority</option>{c.priorities.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</Select>}</Field>
            </div>
            <Check label="Active (can be opened)" checked={d.active} onChange={(v) => set({ active: v })} />
          </Section>
          <Section title="Discord channel">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Discord category ID for new tickets">{(id) => <Input id={id} inputMode="numeric" value={d.discordCategoryId ?? ''} onChange={(e) => set({ discordCategoryId: e.target.value.trim() || null })} />}</Field>
              <Field label="Channel name format" hint={`Example: ${ticketChannelName(d.channelNameFormat, { ...SAMPLE, '{category}': d.name })}`}>{(id) => <Input id={id} value={d.channelNameFormat} maxLength={90} onChange={(e) => set({ channelNameFormat: e.target.value })} />}</Field>
            </div>
            <Ids label="Staff roles (see + write, are mentioned)" value={d.staffRoleIds} onChange={(v) => set({ staffRoleIds: v })} />
            <Ids label="Additional roles (see + write)" value={d.extraRoleIds} onChange={(v) => set({ extraRoleIds: v })} />
          </Section>
          <Section title="Who may open · limits">
            <Ids label="Required Discord roles (empty = everyone)" value={d.requiredRoleIds} onChange={(v) => set({ requiredRoleIds: v })} />
            <Ids label="Only these users (empty = everyone)" value={d.allowedUserIds} onChange={(v) => set({ allowedUserIds: v })} />
            <div className="grid gap-3 md:grid-cols-2">
              <Num label="Max. open tickets per user (0 = unlimited)" value={d.maxOpen} max={100} onChange={(v) => set({ maxOpen: v })} />
              <Num label="Cooldown between tickets (minutes)" value={d.cooldownMinutes} onChange={(v) => set({ cooldownMinutes: v })} />
            </div>
            <Names label="Dashboard access: system roles (empty = everyone with ticket.view)" value={d.accessRoleNames} onChange={(v) => set({ accessRoleNames: v })} hint="Role names from Roles & Permissions, separated by commas – e.g. Ticket Support" />
          </Section>
          <Section title="Questions (asked one by one in the ticket)"><QuestionsEditor value={d.questions} onChange={(v) => set({ questions: v })} /></Section>
          <Section title="Ticket message">
            <Field label="Title">{(id) => <Input id={id} value={d.welcomeTitle} maxLength={256} onChange={(e) => set({ welcomeTitle: e.target.value })} />}</Field>
            <Field label="Message">{(id) => <Textarea id={id} rows={5} value={d.welcomeMessage} maxLength={4000} onChange={(e) => set({ welcomeMessage: e.target.value })} />}</Field>
            <Check label="Mention staff roles when the ticket opens" checked={d.mentionStaff} onChange={(v) => set({ mentionStaff: v })} />
            <Field label="Additional mention / text above the message">{(id) => <Input id={id} value={d.mentionText} maxLength={1000} onChange={(e) => set({ mentionText: e.target.value })} />}</Field>
          </Section>
          <Section title="Buttons on the ticket"><ButtonsEditor value={d.buttons} onChange={(v) => set({ buttons: v })} /></Section>
          <Section title="Claiming">
            <Field label="Mode">{(id) => <Select id={id} value={d.claimMode} onChange={(e) => set({ claimMode: e.target.value as CatDraft['claimMode'] })}>{Object.entries(CLAIM_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label="Message when claimed">{(id) => <Input id={id} value={d.claimMessage} maxLength={1000} onChange={(e) => set({ claimMessage: e.target.value })} />}</Field>
            <Check label="Notify the staff roles when claimed" checked={d.claimNotifyStaff} onChange={(v) => set({ claimNotifyStaff: v })} />
          </Section>
          <Section title="Closing">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Close reason">{(id) => <Select id={id} value={d.closeReasonMode} onChange={(e) => set({ closeReasonMode: e.target.value as CatDraft['closeReasonMode'] })}>{Object.entries(CLOSE_REASON_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
              <Field label="Reasons from">{(id) => <Select id={id} value={d.closeReasonSource} disabled={d.closeReasonMode === 'NONE'} onChange={(e) => set({ closeReasonSource: e.target.value as CatDraft['closeReasonSource'] })}>{Object.entries(CLOSE_REASON_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            </div>
            <Check label="The creator may close their own ticket" checked={d.creatorCanClose} onChange={(v) => set({ creatorCanClose: v })} />
            <Check label="Remove the creator's access when closed" checked={d.closeRemovesAccess} onChange={(v) => set({ closeRemovesAccess: v })} />
            <Check label="Allow reopening" checked={d.allowReopen} onChange={(v) => set({ allowReopen: v })} />
            <Num label="Delete channel after closing (minutes, -1 = never, 0 = immediately)" value={d.deleteAfterMinutes} min={-1} onChange={(v) => set({ deleteAfterMinutes: v })} hint="A transcript is saved before deleting if enabled." />
          </Section>
          <Section title="Transcript & rating">
            <Check label="Create a transcript when closed" checked={d.transcriptOnClose} onChange={(v) => set({ transcriptOnClose: v })} />
            <Field label="Transcript channel ID (empty = general transcript channel)">{(id) => <Input id={id} inputMode="numeric" value={d.transcriptChannelId ?? ''} onChange={(e) => set({ transcriptChannelId: e.target.value.trim() || null })} />}</Field>
            <Check label="Send the transcript to the creator via DM" checked={d.transcriptToUser} onChange={(v) => set({ transcriptToUser: v })} />
            <Check label="Ask the creator for a rating (DM, 1–5 stars)" checked={d.ratingEnabled} onChange={(v) => set({ ratingEnabled: v })} />
            <Field label="Rating question">{(id) => <Input id={id} value={d.ratingQuestion} maxLength={300} onChange={(e) => set({ ratingQuestion: e.target.value })} />}</Field>
          </Section>
          <Section title="Automation">
            <div className="grid gap-3 md:grid-cols-2">
              <Num label="Auto-close after inactivity (minutes, 0 = off)" value={d.autoCloseMinutes} onChange={(v) => set({ autoCloseMinutes: v })} />
              <Num label="Warn this many minutes before (0 = no warning)" value={d.autoCloseWarnMinutes} onChange={(v) => set({ autoCloseWarnMinutes: v })} />
            </div>
            <Field label="Warning message">{(id) => <Input id={id} value={d.autoCloseMessage} maxLength={1000} onChange={(e) => set({ autoCloseMessage: e.target.value })} />}</Field>
          </Section>
          <Section title="Escalation">
            <Ids label="Roles added on escalation" value={d.escalationRoleIds} onChange={(v) => set({ escalationRoleIds: v })} />
            <Field label="Priority on escalation">{(id) => <Select id={id} value={d.escalationPriorityId ?? ''} onChange={(e) => set({ escalationPriorityId: e.target.value || null })}><option value="">unchanged</option>{c.priorities.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</Select>}</Field>
            <Field label="Message">{(id) => <Input id={id} value={d.escalationMessage} maxLength={1000} onChange={(e) => set({ escalationMessage: e.target.value })} />}</Field>
          </Section>
          <Err error={save.error} />
          <div className="flex gap-2"><Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save category</Button><Button variant="secondary" onClick={onDone}>Cancel</Button></div>
        </div>
      </Card>
      <div className="xl:sticky xl:top-4 xl:self-start"><Card title="Preview: new ticket"><DiscordPreview message={preview} /></Card></div>
    </div>
  );
}

function QuestionsEditor({ value, onChange }: { value: TicketQuestion[]; onChange: (v: TicketQuestion[]) => void }) {
  const patch = (i: number, p: Partial<TicketQuestion>) => onChange(value.map((q, j) => (j === i ? { ...q, ...p } : q)));
  return (
    <div className="grid gap-3">
      {!value.length && <p className="text-sm text-muted">No questions – the ticket opens directly.</p>}
      {value.map((q, i) => (
        <div key={q.id} className="grid gap-2 rounded border border-line p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">#{i + 1}</span>
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" aria-label={`Question ${i + 1} up`} disabled={i === 0} onClick={() => onChange(move(value, i, -1))}>↑</Button>
              <Button size="sm" variant="ghost" aria-label={`Question ${i + 1} down`} disabled={i === value.length - 1} onClick={() => onChange(move(value, i, 1))}>↓</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</Button>
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
            <Field label="Question">{(id) => <Input id={id} value={q.label} maxLength={300} onChange={(e) => patch(i, { label: e.target.value })} />}</Field>
            <Field label="Type">{(id) => <Select id={id} value={q.type} onChange={(e) => patch(i, { type: e.target.value as QuestionType })}>{Object.entries(QUESTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          </div>
          {(q.type === 'SELECT' || q.type === 'MULTI') && <OptionsText value={q.options} onChange={(v) => patch(i, { options: v })} />}
          {(q.type === 'SHORT' || q.type === 'LONG') && <Field label="Placeholder (optional)">{(id) => <Input id={id} value={q.placeholder ?? ''} maxLength={100} onChange={(e) => patch(i, { placeholder: e.target.value || undefined })} />}</Field>}
          <Check label="Required" checked={q.required} onChange={(v) => patch(i, { required: v })} />
        </div>
      ))}
      <div><Button size="sm" variant="secondary" disabled={value.length >= 25} onClick={() => onChange([...value, { id: `q${Date.now().toString(36)}`, label: '', type: 'SHORT', required: true, options: [] }])}>Add question</Button></div>
    </div>
  );
}
function OptionsText({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = useState(value.join('\n'));
  return <Field label="Options – one per line (at least 2, max. 25)">{(id) => <Textarea id={id} rows={4} value={t} onChange={(e) => setT(e.target.value)} onBlur={() => onChange(t.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 25))} />}</Field>;
}

function ButtonsEditor({ value, onChange }: { value: TicketCategoryCfg['buttons']; onChange: (v: TicketCategoryCfg['buttons']) => void }) {
  const patch = (i: number, p: Partial<TicketCategoryCfg['buttons'][number]>) => onChange(value.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const missing = (Object.keys(TICKET_ACTIONS) as TicketAction[]).filter((a) => !value.some((b) => b.action === a));
  const [add, setAdd] = useState<string>('');
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted">Each button needs its own permission (ticket.*). Buttons only show when they make sense (e.g. „Reopen“ only on closed tickets).</p>
      {value.map((b, i) => (
        <div key={b.action} className="grid items-end gap-2 rounded border border-line p-2 sm:grid-cols-[110px_minmax(0,1fr)_80px_110px_auto]">
          <div className="text-sm"><Check label={b.action} checked={b.enabled} onChange={(v) => patch(i, { enabled: v })} /><span className="text-[11px] text-muted">{TICKET_ACTIONS[b.action].permission}</span></div>
          <Field label="Label">{(id) => <Input id={id} value={b.label} maxLength={80} onChange={(e) => patch(i, { label: e.target.value })} />}</Field>
          <Field label="Emoji">{(id) => <Input id={id} value={b.emoji ?? ''} maxLength={64} onChange={(e) => patch(i, { emoji: e.target.value || undefined })} />}</Field>
          <Field label="Color">{(id) => <Select id={id} value={b.style} onChange={(e) => patch(i, { style: e.target.value as ButtonStyleName })}>{STYLES.map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}</Select>}</Field>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" aria-label={`${b.action} up`} disabled={i === 0} onClick={() => onChange(move(value, i, -1))}>↑</Button>
            <Button size="sm" variant="ghost" aria-label={`${b.action} down`} disabled={i === value.length - 1} onClick={() => onChange(move(value, i, 1))}>↓</Button>
            <Button size="sm" variant="ghost" aria-label={`Remove ${b.action}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</Button>
          </span>
        </div>
      ))}
      {missing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="w-48"><Select aria-label="Add button" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Add button …</option>{missing.map((a) => <option key={a} value={a}>{TICKET_ACTIONS[a].emoji} {TICKET_ACTIONS[a].label}</option>)}</Select></div>
          <Button size="sm" variant="secondary" disabled={!add || value.length >= 20} onClick={() => { const a = add as TicketAction; const def = TICKET_ACTIONS[a]; onChange([...value, { action: a, label: def.label, emoji: def.emoji, style: def.style as ButtonStyleName, enabled: true }]); setAdd(''); }}>Add</Button>
        </div>
      )}
    </div>
  );
}

// =============================== Status, Prioritäten, Gründe ===============================
function States({ c }: { c: TicketConfig }) {
  return (
    <>
      <ListEditor<TicketStatusCfg> title="Statuses" items={c.statuses} path="statuses" blank={{ name: '', emoji: '', color: 0x3b82f6, position: c.statuses.length, kind: 'OPEN', isDefault: false, isClaimed: false, isEscalation: false, isClose: false }}
        hint="Each flag is used by exactly one status (setting it moves it): Default = new/reopened tickets, Claimed = when claimed, Escalation = when escalated, Close = when closed."
        render={(s, set) => (
          <>
            <div className="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)_150px_120px]">
              <Field label="Emoji">{(id) => <Input id={id} value={s.emoji} maxLength={64} onChange={(e) => set({ emoji: e.target.value })} />}</Field>
              <Field label="Name">{(id) => <Input id={id} value={s.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <Field label="Kind">{(id) => <Select id={id} value={s.kind} onChange={(e) => set({ kind: e.target.value as TicketStatusCfg['kind'] })}>{Object.entries(STATUS_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
              <Num label="Order" value={s.position} max={1000} onChange={(v) => set({ position: v })} />
            </div>
            <Color label="Color" value={s.color} onChange={(v) => set({ color: v })} />
            <div className="flex flex-wrap gap-4">
              <Check label="Default" checked={s.isDefault} onChange={(v) => set({ isDefault: v })} /><Check label="Claimed" checked={s.isClaimed} onChange={(v) => set({ isClaimed: v })} />
              <Check label="Escalation" checked={s.isEscalation} onChange={(v) => set({ isEscalation: v })} /><Check label="Close" checked={s.isClose} onChange={(v) => set({ isClose: v })} />
            </div>
          </>
        )}
        summary={(s) => <span>{label(s)} <span className="text-xs text-muted">· {STATUS_KINDS[s.kind]}{s.isDefault ? ' · default' : ''}{s.isClaimed ? ' · claimed' : ''}{s.isEscalation ? ' · escalation' : ''}{s.isClose ? ' · close' : ''}</span></span>}
      />
      <ListEditor<TicketPriorityCfg> title="Priorities" items={c.priorities} path="priorities" blank={{ name: '', emoji: '', color: 0xf59e0b, position: c.priorities.length, isDefault: false, allowedRoleNames: [], notifyRoleIds: [] }}
        render={(p, set) => (
          <>
            <div className="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)_120px]">
              <Field label="Emoji">{(id) => <Input id={id} value={p.emoji} maxLength={64} onChange={(e) => set({ emoji: e.target.value })} />}</Field>
              <Field label="Name">{(id) => <Input id={id} value={p.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <Num label="Order" value={p.position} max={1000} onChange={(v) => set({ position: v })} />
            </div>
            <Color label="Color (also the ticket embed color)" value={p.color} onChange={(v) => set({ color: v })} />
            <Names label="May be set by system roles (empty = everyone with ticket.change_priority)" value={p.allowedRoleNames} onChange={(v) => set({ allowedRoleNames: v })} />
            <Ids label="Notify Discord roles when set" value={p.notifyRoleIds} onChange={(v) => set({ notifyRoleIds: v })} />
            <Check label="Default for new tickets" checked={p.isDefault} onChange={(v) => set({ isDefault: v })} />
          </>
        )}
        summary={(p) => <span>{label(p)}{p.isDefault && <span className="text-xs text-muted"> · default</span>}</span>}
      />
      <ListEditor<TicketReasonCfg> title="Preset close reasons" items={c.reasons} path="reasons" blank={{ text: '', position: c.reasons.length }}
        render={(r, set) => (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label="Reason">{(id) => <Input id={id} value={r.text} maxLength={200} onChange={(e) => set({ text: e.target.value })} />}</Field>
            <Num label="Order" value={r.position} max={1000} onChange={(v) => set({ position: v })} />
          </div>
        )}
        summary={(r) => <span>{r.text}</span>}
      />
    </>
  );
}

/** Kleine Liste mit „Bearbeiten / Neu / Löschen“ direkt in der Karte. */
function ListEditor<T extends { id: string }>({ title, items, path, blank, render, summary, hint }: { title: string; items: T[]; path: string; blank: Omit<T, 'id'>; render: (v: Omit<T, 'id'>, set: (p: Partial<T>) => void) => ReactNode; summary: (v: T) => ReactNode; hint?: string }) {
  const [edit, setEdit] = useState<{ id?: string; v: Omit<T, 'id'> }>();
  const [del, setDel] = useState<T>();
  const save = useSave(() => api(edit?.id ? `/support-tickets/${path}/${edit.id}` : `/support-tickets/${path}`, { method: edit?.id ? 'PUT' : 'POST', body: clean(edit!.v as object) }), () => setEdit(undefined));
  const remove = useSave((id: string) => api(`/support-tickets/${path}/${id}`, { method: 'DELETE' }), () => setDel(undefined));
  return (
    <Card title={title} actions={!edit && <Button size="sm" onClick={() => setEdit({ v: blank })}>Add</Button>}>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <Err error={remove.error} />
      {edit && (
        <div className="mb-3 grid gap-2 rounded-md border border-primary/40 p-3">
          {render(edit.v, (p) => setEdit({ ...edit, v: { ...edit.v, ...p } }))}
          <Err error={save.error} />
          <div className="flex gap-2"><Button size="sm" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button><Button size="sm" variant="secondary" onClick={() => setEdit(undefined)}>Cancel</Button></div>
        </div>
      )}
      {!items.length ? <p className="text-sm text-muted">None yet.</p> : (
        <ul className="divide-y divide-line">{items.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
            {summary(x)}
            <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => { const { id, ...v } = x; setEdit({ id, v: v as Omit<T, 'id'> }); }}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setDel(x)}>Delete</Button></span>
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={!!del} danger title={`Delete from ${title.toLowerCase()}?`} message="Entries still used by tickets can't be deleted." confirmLabel="Delete" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </Card>
  );
}

// =============================== Allgemein ===============================
function General({ c }: { c: TicketConfig }) {
  const [s, setS] = useState<TicketSettingsCfg>(c.settings);
  const [ok, setOk] = useState(false);
  const set = (p: Partial<TicketSettingsCfg>) => { setS({ ...s, ...p }); setOk(false); };
  const save = useSave(() => api('/support-tickets/settings', { method: 'PUT', body: clean(s) }), () => setOk(true));
  const closed: MessageSpec = { embeds: [{ title: renderTicketText(s.closedTitle, SAMPLE), description: renderTicketText(s.closedMessage, SAMPLE), color: s.closedColor }] };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <Card title="General settings">
        <div className="grid gap-3">
          <Section title="Channels">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Log channel ID (every ticket action)">{(id) => <Input id={id} inputMode="numeric" value={s.logChannelId ?? ''} onChange={(e) => set({ logChannelId: e.target.value.trim() || null })} />}</Field>
              <Field label="Transcript channel ID (default)">{(id) => <Input id={id} inputMode="numeric" value={s.transcriptChannelId ?? ''} onChange={(e) => set({ transcriptChannelId: e.target.value.trim() || null })} />}</Field>
            </div>
            <Num label="Delete transcripts after (days, 0 = keep forever)" value={s.transcriptRetentionDays} max={3650} onChange={(v) => set({ transcriptRetentionDays: v })} />
          </Section>
          <Section title="Closed display">
            <Field label="Title">{(id) => <Input id={id} value={s.closedTitle} maxLength={256} onChange={(e) => set({ closedTitle: e.target.value })} />}</Field>
            <Field label="Message">{(id) => <Textarea id={id} rows={5} value={s.closedMessage} maxLength={4000} onChange={(e) => set({ closedMessage: e.target.value })} />}</Field>
            <Color label="Color" value={s.closedColor} onChange={(v) => set({ closedColor: v })} />
          </Section>
          <Section title="Texts">
            <Field label="Reopened message">{(id) => <Input id={id} value={s.reopenedMessage} maxLength={1000} onChange={(e) => set({ reopenedMessage: e.target.value })} />}</Field>
            <Field label="Rating DM">{(id) => <Textarea id={id} rows={3} value={s.ratingMessage} maxLength={1000} onChange={(e) => set({ ratingMessage: e.target.value })} />}</Field>
            <Field label="Thanks after rating">{(id) => <Input id={id} value={s.ratingThanks} maxLength={500} onChange={(e) => set({ ratingThanks: e.target.value })} />}</Field>
          </Section>
          <Err error={save.error} />
          <div className="flex items-center gap-2"><Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>{ok && <span role="status" className="text-sm text-success">Saved.</span>}</div>
        </div>
      </Card>
      <div className="xl:sticky xl:top-4 xl:self-start"><Card title="Preview: closed ticket"><DiscordPreview message={closed} /></Card></div>
    </div>
  );
}

function Placeholders() {
  return (
    <Card title="Placeholders (usable in all ticket texts and the channel name)">
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{Object.entries(TICKET_PLACEHOLDERS).map(([k, v]) => <div key={k} className="flex gap-2"><dt><code className="rounded bg-panel-2 px-1">{k}</code></dt><dd className="text-muted">{v}</dd></div>)}</dl>
    </Card>
  );
}
