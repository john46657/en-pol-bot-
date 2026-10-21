import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CLAIM_MODES, CLOSE_REASON_MODES, CLOSE_REASON_SOURCES, QUESTION_TYPES, NO_TICKET_BUTTON, TICKET_ACTIONS, TICKET_PLACEHOLDERS, TICKET_STATUS_KEYS, defaultTicketButtons, ticketButtonsOf, renderTicketText, ticketChannelName,
  validateForm, planFormSteps, activeFields, fieldOptions,
  type ButtonStyleName, type FormRawValue, type MessageSpec, type QuestionType, type TicketAction, type TicketQuestion, type TicketStatusKey, type TicketVars,
} from '@enrp/shared';
import { flush, onSaved, useAutosaveDraft } from '../../lib/autosave';
import { api } from '../../lib/api';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, fmt, Input, Select, SkeletonRows, Textarea } from '../../components/ui';
import { DiscordPreview } from '../../components/DiscordPreview';
import { ChannelPicker, RolePicker } from '../../components/DiscordPickers';
import { GuildTag, useGuilds, useServer } from '../../lib/guilds';
import {
  errText, fromHex, hex, idsFromText, idsToText, label, useTicketConfig, NOTIFY_EVENTS,
  type NotifyEvent, type TicketCategoryCfg, type TicketConfig, type TicketDepartmentCfg, type TicketPanelCfg, type TicketPriorityCfg, type TicketSettingsCfg, type TicketStatusCfg,
  RATING_FIELDS, type RatingField,
} from '../../lib/tickets';

type Section = 'panels' | 'categories' | 'settings' | 'departments' | 'lifecycle';
const STYLES: ButtonStyleName[] = ['primary', 'secondary', 'success', 'danger'];
const STYLE_LABEL: Record<ButtonStyleName, string> = { primary: 'Blau', secondary: 'Grau', success: 'Grün', danger: 'Rot' };
/** Für die API: `null` → weglassen (leere Felder werden dort zu „nicht gesetzt“). */
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null)) as Partial<T>;
/** Beispielwerte für Vorschauen. */
const SAMPLE: TicketVars = { '{user}': '@Max', '{username}': 'max', '{user_id}': '123456789012345678', '{ticket_id}': '0042', '{ticket_ref}': 'EMD-000042', '{staff}': 'niemand', '{status}': '🟢 Offen', '{priority}': '🟡 Normal', '{reason}': 'Gelöst', '{closed_by}': '@Chief', '{created_at}': new Date().toLocaleString('de-DE'), '{closed_at}': new Date().toLocaleString('de-DE'), '{channel}': '#support-max', '{actor}': '@Chief' };

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
      {section === 'settings' && <General c={c} />}
      {section === 'departments' && <Departments c={c} />}
      {section === 'lifecycle' && <Lifecycle c={c} />}
      <Placeholders />
    </div>
  );
}

/** Automatisch gespeicherte Ticket-Einstellungen: danach die Konfiguration neu laden (Vorschauen, Listen). */
function useTicketAutosaveSync() {
  const qc = useQueryClient();
  useEffect(() => onSaved('ticket:', () => void qc.invalidateQueries({ queryKey: ['ticket-config'] })), [qc]);
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
  return <Field label={l} hint={hint ?? 'Discord-IDs, durch Kommas getrennt'}>{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(idsFromText(text))} placeholder="123456789012345678, …" />}</Field>;
};
const Roles = ({ label: l, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) => (
  <div className="grid gap-1"><span className="text-xs font-medium text-muted">{l}</span><RolePicker ariaLabel={l} value={value} onChange={onChange} /></div>
);
const Names = ({ label: l, value, onChange, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string }) => {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  return <Field label={l} hint={hint}>{(id) => <Input id={id} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(text.split(',').map((x) => x.trim()).filter(Boolean))} />}</Field>;
};
const move = <T,>(a: T[], i: number, d: -1 | 1) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j]!, b[i]!]; return b; };
const Section = ({ title, children }: { title: string; children: ReactNode }) => <fieldset className="grid gap-3 rounded-md border border-line p-3"><legend className="px-1 text-sm font-semibold">{title}</legend>{children}</fieldset>;

/** Für welchen Server (leer = alle Server) – nur sichtbar, wenn der Bot auf mehreren Servern ist. */
function ServerField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const guilds = useGuilds();
  if ((guilds.data?.length ?? 0) < 2) return null;
  return <Field label="Server">{(id) => <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}><option value="">Alle Server</option>{guilds.data!.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>}</Field>;
}

// =============================== Panels ===============================
type PanelDraft = Omit<TicketPanelCfg, 'id' | 'messageChannelId' | 'messageId'> & { id?: string };
const NEW_PANEL: PanelDraft = { guildId: null, name: 'Neues Panel', title: 'Support', description: 'Wähle unten die passende Kategorie, um ein Ticket zu öffnen.', emoji: '🎫', color: 0x3b82f6, thumbnailUrl: null, imageUrl: null, bannerUrl: null, footer: null, footerIconUrl: null, authorName: null, authorIconUrl: null, style: 'BUTTONS', placeholder: 'Wähle eine Kategorie …', channelId: null, categoryIds: [], allowedRoleIds: [], showLoad: false, position: 0 };

/** Gleiche Darstellung wie der Bot (Embed + Buttons bzw. Menü). */
function panelPreview(p: PanelDraft, cats: TicketCategoryCfg[]): MessageSpec {
  const list = p.categoryIds.map((id) => cats.find((c) => c.id === id)).filter((c): c is TicketCategoryCfg => !!c && c.active && !c.archivedAt);
  const embed = { title: [p.emoji, p.title].filter(Boolean).join(' ') || undefined, description: p.description || undefined, color: p.color, thumbnail: p.thumbnailUrl ?? undefined, image: p.bannerUrl ?? p.imageUrl ?? undefined, footer: p.footer ?? undefined, footerIcon: p.footerIconUrl ?? undefined, author: p.authorName ?? undefined, authorIcon: p.authorIconUrl ?? undefined };
  if (p.style === 'DROPDOWN') {
    const menus = Array.from({ length: Math.ceil(Math.min(list.length, 100) / 25) }, (_, i) => ({ id: `x${i}`, placeholder: list.length > 25 ? `${p.placeholder} (${i * 25 + 1}–${Math.min(list.length, i * 25 + 25)})` : p.placeholder, options: list.slice(i * 25, i * 25 + 25).map((c) => ({ label: c.name, value: c.id, description: c.description || undefined, emoji: c.emoji ?? undefined })) }));
    return { embeds: [embed], select: menus[0] ?? { id: 'x', placeholder: p.placeholder, options: [] }, selects: menus.slice(1) };
  }
  return { embeds: [embed], buttons: list.map((c) => ({ id: c.id, label: c.name, emoji: c.emoji ?? undefined, style: c.buttonStyle })) };
}

function Panels({ c }: { c: TicketConfig }) {
  const [server] = useServer();
  const [edit, setEdit] = useState<PanelDraft>();
  const [del, setDel] = useState<TicketPanelCfg>();
  const [msg, setMsg] = useState<string>();
  const dup = useSave((id: string) => api(`/support-tickets/panels/${id}/duplicate`, { method: 'POST' }));
  const remove = useSave((id: string) => api(`/support-tickets/panels/${id}`, { method: 'DELETE' }), () => setDel(undefined));
  // Kanal direkt in der Liste wählen (ohne Bearbeiten-Ansicht) – dann ist „An Discord senden“ sofort möglich
  const setChannel = useSave((v: { p: TicketPanelCfg; channelId: string | null }) => api(`/support-tickets/panels/${v.p.id}`, { method: 'PUT', body: clean({ ...v.p, id: undefined, messageId: undefined, channelId: v.channelId }) }));
  const guilds = useGuilds();
  const channelName = (id: string) => { for (const g of guilds.data ?? []) { const ch = g.channels.find((x) => x.id === id); if (ch) return `#${ch.name}`; } return id; };
  const publish = useSave((id: string) => api<{ updating: boolean }>(`/support-tickets/panels/${id}/publish`, { method: 'POST', body: {} }), (r) => setMsg((r as { updating: boolean }).updating ? 'Die Panel-Nachricht in Discord wird aktualisiert.' : 'Das Panel wird an Discord gesendet.'));
  if (edit) return <PanelEditor draft={edit} c={c} onDone={() => setEdit(undefined)} />;
  return (
    <Card title="Ticket-Panels" actions={<Button size="sm" onClick={() => setEdit({ ...NEW_PANEL, guildId: server || null, categoryIds: c.categories.filter((x) => x.active).map((x) => x.id) })}>Neues Panel</Button>}>
      <Err error={dup.error ?? remove.error ?? publish.error ?? setChannel.error} />
      {msg && <p role="status" className="mb-2 text-sm text-success">{msg}</p>}
      {!c.panels.length ? <EmptyState text="Noch keine Panels." hint="Ein Panel ist die Nachricht in Discord mit den Buttons bzw. dem Menü zum Öffnen eines Tickets." /> : (
        <ul className="grid gap-3 md:grid-cols-2">{c.panels.map((p) => (
          <li key={p.id} className="grid gap-2 rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{p.emoji} {p.name} <GuildTag id={p.guildId} /></strong>{p.messageId ? <Badge tone="success">gepostet</Badge> : <Badge>nicht gepostet</Badge>}</div>
            <p className="text-xs text-muted">{p.style === 'DROPDOWN' ? 'Dropdown' : 'Buttons'} · {p.categoryIds.length} Kategorien · Kanal {p.channelId ? channelName(p.channelId) : '—'}{p.publishedAt ? ` · zuletzt gesendet ${fmt(p.publishedAt)}` : ''}</p>
            {p.publishError && <p role="alert" className="rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger">Senden fehlgeschlagen: {p.publishError}</p>}
            {!p.channelId && <div className="grid gap-1 rounded border border-warning/40 bg-warning/10 p-2 text-xs"><span>Wähle zuerst den Kanal, in den das Panel gepostet wird:</span><ChannelPicker ariaLabel={`Kanal für ${p.name}`} kind="text" value={null} onChange={(v) => v && setChannel.mutate({ p, channelId: v })} /></div>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>Bearbeiten</Button>
              <Button size="sm" disabled={publish.isPending || !p.channelId} title={p.channelId ? undefined : 'Zuerst einen Kanal wählen'} onClick={() => { setMsg(undefined); publish.mutate(p.id); }}>{p.messageId ? 'In Discord aktualisieren' : 'An Discord senden'}</Button>
              <Button size="sm" variant="secondary" disabled={dup.isPending} onClick={() => dup.mutate(p.id)}>Duplizieren</Button>
              <Button size="sm" variant="ghost" onClick={() => setDel(p)}>Löschen</Button>
            </div>
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={!!del} danger title="Panel löschen?" message={`„${del?.name ?? ''}“ wird gelöscht. Eine bereits in Discord gepostete Nachricht bleibt bestehen, bis du sie dort löschst.`} confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </Card>
  );
}

function PanelEditor({ draft, c, onDone }: { draft: PanelDraft; c: TicketConfig; onDone: () => void }) {
  const [p, setP] = useState<PanelDraft>(draft);
  const set = (x: Partial<PanelDraft>) => setP({ ...p, ...x });
  const save = useSave(() => api(p.id ? `/support-tickets/panels/${p.id}` : '/support-tickets/panels', { method: p.id ? 'PUT' : 'POST', body: clean({ ...p, id: undefined }) }), onDone);
  useTicketAutosaveSync();
  // bestehendes Panel: jede Änderung automatisch speichern (neues Panel: einmal „Erstellen“)
  useAutosaveDraft(p.id ? `ticket:panel:${p.id}` : null, p, (x) => (x.name.trim() ? { method: 'PUT', path: `/support-tickets/panels/${x.id}`, body: clean({ ...x, id: undefined }), label: `Panel „${x.name}“` } : null));
  const url = (k: 'thumbnailUrl' | 'imageUrl' | 'bannerUrl' | 'footerIconUrl' | 'authorIconUrl', l: string) => <Field label={l} hint="https://-Link zu einem Bild">{(id) => <Input id={id} value={p[k] ?? ''} onChange={(e) => set({ [k]: e.target.value || null })} />}</Field>;
  const toggleCat = (id: string) => set({ categoryIds: p.categoryIds.includes(id) ? p.categoryIds.filter((x) => x !== id) : [...p.categoryIds, id] });
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <Card title={p.id ? `Panel „${draft.name}“ bearbeiten` : 'Neues Panel'} actions={<Button size="sm" variant="ghost" onClick={onDone}>Zurück</Button>}>
        <div className="grid gap-3">
          <Section title="Allgemein">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Interner Name">{(id) => <Input id={id} value={p.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <ServerField value={p.guildId} onChange={(v) => set({ guildId: v })} />
              <Field label="Zielkanal">{(id) => <ChannelPicker ariaLabel={id} kind="text" value={p.channelId} onChange={(v) => set({ channelId: v })} />}</Field>
              <Field label="Typ" hint={p.style === 'BUTTONS' && p.categoryIds.length > 25 ? 'Discord erlaubt höchstens 25 Buttons – bitte Dropdown wählen.' : p.style === 'DROPDOWN' && p.categoryIds.length > 25 ? 'Mehr als 25 Kategorien werden auf mehrere Menüs verteilt (bis 100).' : undefined}>{(id) => <Select id={id} value={p.style} onChange={(e) => set({ style: e.target.value as PanelDraft['style'] })}><option value="BUTTONS">Buttons</option><option value="DROPDOWN">Dropdown-Menü</option></Select>}</Field>
              {p.style === 'DROPDOWN' && <Field label="Dropdown-Platzhalter">{(id) => <Input id={id} value={p.placeholder} maxLength={150} onChange={(e) => set({ placeholder: e.target.value })} />}</Field>}
              <Num label="Reihenfolge" value={p.position} max={1000} onChange={(v) => set({ position: v })} />
            </div>
            <Roles label="Sichtbar für Discord-Rollen (leer = alle)" value={p.allowedRoleIds} onChange={(v) => set({ allowedRoleIds: v })} />
            <Check label="Ticket-Auslastung anzeigen (offene Tickets pro Kategorie, automatisch aktualisiert)" checked={p.showLoad} onChange={(v) => set({ showLoad: v })} />
          </Section>
          <Section title="Embed">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Emoji">{(id) => <Input id={id} value={p.emoji ?? ''} maxLength={64} onChange={(e) => set({ emoji: e.target.value || null })} />}</Field>
              <Field label="Titel">{(id) => <Input id={id} value={p.title} maxLength={256} onChange={(e) => set({ title: e.target.value })} />}</Field>
            </div>
            <Field label="Beschreibung (Discord-Markdown)">{(id) => <Textarea id={id} rows={5} value={p.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} />}</Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Color label="Farbe" value={p.color} onChange={(v) => set({ color: v })} />
              <Field label="Autor">{(id) => <Input id={id} value={p.authorName ?? ''} maxLength={256} onChange={(e) => set({ authorName: e.target.value || null })} />}</Field>
              {url('authorIconUrl', 'Autor-Icon')}
              {url('thumbnailUrl', 'Vorschaubild')}
              {url('bannerUrl', 'Banner (großes Bild)')}
              {url('imageUrl', 'Bild (wenn kein Banner)')}
              <Field label="Footer">{(id) => <Input id={id} value={p.footer ?? ''} maxLength={2048} onChange={(e) => set({ footer: e.target.value || null })} />}</Field>
              {url('footerIconUrl', 'Footer-Icon')}
            </div>
          </Section>
          <Section title="Ticket-Kategorien in diesem Panel (in dieser Reihenfolge)">
            {!c.categories.length ? <p className="text-sm text-muted">Lege zuerst eine Kategorie an.</p> : (
              <ul className="grid gap-1">{[...p.categoryIds.map((id) => c.categories.find((x) => x.id === id)).filter((x): x is TicketCategoryCfg => !!x), ...c.categories.filter((x) => !p.categoryIds.includes(x.id))].map((cat) => {
                const i = p.categoryIds.indexOf(cat.id);
                return (
                  <li key={cat.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Check label={`${label(cat)}${cat.active ? '' : ' (inaktiv)'}`} checked={i >= 0} onChange={() => toggleCat(cat.id)} />
                    {i >= 0 && <span className="ml-auto flex gap-1"><Button size="sm" variant="ghost" aria-label={`${cat.name} nach oben`} disabled={i === 0} onClick={() => set({ categoryIds: move(p.categoryIds, i, -1) })}>↑</Button><Button size="sm" variant="ghost" aria-label={`${cat.name} nach unten`} disabled={i === p.categoryIds.length - 1} onClick={() => set({ categoryIds: move(p.categoryIds, i, 1) })}>↓</Button></span>}
                  </li>
                );
              })}</ul>
            )}
          </Section>
          <Err error={save.error} />
          <div className="flex gap-2">{p.id ? <><span className="self-center text-xs text-muted">Wird automatisch gespeichert.</span><Button onClick={() => void flush().then(onDone)}>Fertig</Button></> : <><Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Panel erstellen</Button><Button variant="secondary" onClick={onDone}>Abbrechen</Button></>}</div>
          <p className="text-xs text-muted">Nach dem Speichern in der Panel-Liste „An Discord senden“ / „In Discord aktualisieren“ verwenden.</p>
        </div>
      </Card>
      <div className="xl:sticky xl:top-4 xl:self-start"><Card title="Vorschau"><DiscordPreview message={panelPreview(p, c.categories)} /></Card></div>
    </div>
  );
}

// =============================== Kategorien ===============================
type CatDraft = Omit<TicketCategoryCfg, 'id'> & { id?: string };
const NEW_CATEGORY: CatDraft = {
  guildId: null,
  name: 'Neue Kategorie', description: '', emoji: '🎫', color: 0x3b82f6, buttonStyle: 'secondary', position: 0, active: true, discordCategoryId: null, channelNameFormat: 'ticket-{username}',
  staffRoleIds: [], extraRoleIds: [], requiredRoleIds: [], allowedUserIds: [], accessRoleNames: [], maxOpen: 1, cooldownMinutes: 0, defaultPriorityId: null, questions: [],
  welcomeTitle: '🎫 {category}', welcomeMessage: 'Hallo {user}!\n\nBeschreibe dein Anliegen so genau wie möglich. Ein Teammitglied kümmert sich schnellstmöglich darum.', mentionStaff: true, mentionText: '', buttons: defaultTicketButtons(),
  claimMode: 'SINGLE', claimMessage: '👤 Bearbeiter: {staff}', claimNotifyStaff: false, creatorCanClose: true, closeReasonMode: 'OPTIONAL', closeReasonSource: 'BOTH', closeRemovesAccess: true, allowReopen: true,
  transcriptOnClose: true, transcriptChannelId: null, transcriptToUser: false, ratingEnabled: true, ratingQuestion: 'Wie zufrieden warst du mit dem Support?',
  autoCloseMinutes: 0, autoCloseWarnMinutes: 0, autoCloseMessage: '⏰ {user}, dieses Ticket wird bald wegen Inaktivität geschlossen. Schreib eine Nachricht, wenn du noch Hilfe brauchst.', deleteAfterMinutes: -1,
  escalationRoleIds: [], escalationPriorityId: null, escalationMessage: '🟠 Dieses Ticket wurde eskaliert. {staff}',
  welcomeImageUrl: null, capacity: 0, creatorCanAddUsers: false, claimDiscordCategoryId: null, claimLocksChat: false,
  autoClaimOnMessage: false, autoUnclaimMinutes: 0, staffAlertMinutes: 0, closeRequestCloses: true,
  departmentId: null, confidential: false, formMode: 'MODAL', escalateUnassignedMinutes: 0,
};

function Categories({ c }: { c: TicketConfig }) {
  const [server] = useServer();
  const [edit, setEdit] = useState<CatDraft>();
  const [del, setDel] = useState<TicketCategoryCfg>();
  const [showArchived, setShowArchived] = useState(false);
  const dup = useSave((id: string) => api(`/support-tickets/categories/${id}/duplicate`, { method: 'POST' }));
  const remove = useSave((id: string) => api(`/support-tickets/categories/${id}`, { method: 'DELETE' }), () => setDel(undefined));
  const archive = useSave((v: { id: string; archived: boolean }) => api(`/support-tickets/categories/${v.id}/archive`, { method: 'POST', body: { archived: v.archived } }));
  const order = useSave((v: { list: TicketCategoryCfg[]; i: number; d: -1 | 1 }) => reorder(v.list, v.i, v.d));
  if (edit) return <CategoryEditor draft={edit} c={c} onDone={() => setEdit(undefined)} />;
  const list = c.categories.filter((x) => showArchived || !x.archivedAt);
  const dept = (id: string | null) => c.departments.find((d) => d.id === id);
  const archivedCount = c.categories.filter((x) => x.archivedAt).length;
  return (
    <Card title="Ticket-Kategorien" actions={<div className="flex gap-2">{archivedCount > 0 && <Button size="sm" variant="ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Archivierte ausblenden' : `Archivierte zeigen (${archivedCount})`}</Button>}<Button size="sm" onClick={() => setEdit({ ...NEW_CATEGORY, guildId: server || null, position: c.categories.length })}>Neue Kategorie</Button></div>}>
      <Err error={dup.error ?? remove.error ?? archive.error ?? order.error} />
      {!list.length ? <EmptyState text="Noch keine Kategorien." hint="Kategorien sind die Ticket-Arten (Support, Bewerbung, Beschwerde …)." /> : (
        <ul className="grid gap-3 md:grid-cols-2">{list.map((x, i) => (
          <li key={x.id} className="grid gap-2 rounded-md border border-line p-3" style={{ borderLeft: `4px solid ${hex(x.color)}` }}>
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{label(x)} <GuildTag id={x.guildId} /></strong>
              <span className="flex flex-wrap gap-1">{x.confidential && <Badge tone="warning">vertraulich</Badge>}{x.archivedAt ? <Badge>archiviert</Badge> : x.active ? <Badge tone="success">aktiv</Badge> : <Badge>inaktiv</Badge>}</span></div>
            <p className="text-xs text-muted">{dept(x.departmentId) ? `${label(dept(x.departmentId))} · ` : 'keine Abteilung · '}{x.formMode === 'MODAL' ? `Formular v${x.formVersion ?? 1} (${activeFields(x.questions).length} Felder)` : `${x.questions.length} Fragen im Ticket`} · max. {x.maxOpen || '∞'} offen · Übernahme {CLAIM_MODES[x.claimMode]}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdit(x)}>Bearbeiten</Button>
              {!x.archivedAt && <><Button size="sm" variant="ghost" aria-label={`${x.name} nach oben`} disabled={i === 0 || order.isPending} onClick={() => order.mutate({ list, i, d: -1 })}>↑</Button><Button size="sm" variant="ghost" aria-label={`${x.name} nach unten`} disabled={i === list.length - 1 || order.isPending} onClick={() => order.mutate({ list, i, d: 1 })}>↓</Button></>}
              <Button size="sm" variant="secondary" disabled={dup.isPending} onClick={() => dup.mutate(x.id)}>Duplizieren</Button>
              <Button size="sm" variant="ghost" disabled={archive.isPending} onClick={() => archive.mutate({ id: x.id, archived: !x.archivedAt })}>{x.archivedAt ? 'Wiederherstellen' : 'Archivieren'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setDel(x)}>Löschen</Button>
            </div>
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={!!del} danger title="Kategorie löschen?" message={`„${del?.name ?? ''}“ wird gelöscht. Kategorien mit Tickets (auch geschlossenen) können nicht gelöscht werden – archiviere sie stattdessen; Tickets und Transkripte bleiben erhalten.`} confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </Card>
  );
}

/** Reihenfolge ändern: Positionen der beiden Kategorien tauschen (Rest bleibt unverändert). */
async function reorder(list: TicketCategoryCfg[], i: number, d: -1 | 1) {
  const a = list[i], b = list[i + d];
  if (!a || !b) return;
  const put = (x: TicketCategoryCfg, position: number) => api(`/support-tickets/categories/${x.id}`, { method: 'PUT', body: clean({ ...x, id: undefined, archivedAt: undefined, formVersion: undefined, position }) });
  const pa = a.position === b.position ? i : a.position, pb = a.position === b.position ? i + d : b.position;
  await put(a, pb); await put(b, pa);
}

function CategoryEditor({ draft, c, onDone }: { draft: CatDraft; c: TicketConfig; onDone: () => void }) {
  const [d, setD] = useState<CatDraft>({ ...draft, buttons: draft.buttons.length ? ticketButtonsOf(draft.buttons) : defaultTicketButtons() });
  const set = (x: Partial<CatDraft>) => setD({ ...d, ...x });
  const body = (x: CatDraft) => clean({ ...x, id: undefined, archivedAt: undefined, formVersion: undefined });
  const save = useSave(() => api(d.id ? `/support-tickets/categories/${d.id}` : '/support-tickets/categories', { method: d.id ? 'PUT' : 'POST', body: body(d) }), onDone);
  useTicketAutosaveSync();
  useAutosaveDraft(d.id ? `ticket:category:${d.id}` : null, d, (x) => (x.name.trim() ? { method: 'PUT', path: `/support-tickets/categories/${x.id}`, body: body(x), label: `Kategorie „${x.name}“` } : null));
  const prio = c.priorities.find((p) => p.id === d.defaultPriorityId) ?? c.priorities.find((p) => p.isDefault);
  const status = c.statuses.find((s) => s.isDefault);
  const vars: TicketVars = { ...SAMPLE, '{category}': d.name, '{priority}': prio ? label(prio) : '—', '{status}': status ? label(status) : '—', '{channel}': `#${ticketChannelName(d.channelNameFormat, { ...SAMPLE, '{category}': d.name })}` };
  const preview: MessageSpec = {
    content: ['@Max', ...(d.mentionStaff ? d.staffRoleIds.map((r) => `@Rolle ${r}`) : []), renderTicketText(d.mentionText, vars)].filter(Boolean).join(' '),
    embeds: [{ title: renderTicketText(d.welcomeTitle || '🎫 {category}', vars), description: renderTicketText(d.welcomeMessage || 'Hallo {user}!', vars), color: prio?.color ?? d.color, fields: [{ name: 'Status', value: vars['{status}']!, inline: true }, { name: 'Priorität', value: vars['{priority}']!, inline: true }, { name: 'Bearbeiter', value: 'niemand', inline: true }], footer: 'Ticket EMD-000042 · erstellt jetzt', ...(d.welcomeImageUrl ? { image: d.welcomeImageUrl } : {}) }],
    buttons: d.buttons.filter((b) => b.enabled && TICKET_ACTIONS[b.action].state !== 'closed' && b.action !== 'unclaim' && b.action !== 'unlock').map((b) => ({ id: b.action, label: b.label, emoji: b.emoji, style: b.style })).slice(0, 25),
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <Card title={d.id ? `Kategorie „${draft.name}“ bearbeiten` : 'Neue Kategorie'} actions={<Button size="sm" variant="ghost" onClick={onDone}>Zurück</Button>}>
        <div className="grid gap-3">
          <Section title="Allgemein">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name">{(id) => <Input id={id} value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <ServerField value={d.guildId} onChange={(v) => set({ guildId: v })} />
              <Field label="Emoji">{(id) => <Input id={id} value={d.emoji ?? ''} maxLength={64} onChange={(e) => set({ emoji: e.target.value || null })} />}</Field>
              <Field label="Kurzbeschreibung (Dropdown)">{(id) => <Input id={id} value={d.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />}</Field>
              <Field label="Farbe des Panel-Buttons">{(id) => <Select id={id} value={d.buttonStyle} onChange={(e) => set({ buttonStyle: e.target.value as ButtonStyleName })}>{STYLES.map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}</Select>}</Field>
              <Color label="Embed-Farbe" value={d.color} onChange={(v) => set({ color: v })} />
              <Num label="Reihenfolge" value={d.position} max={1000} onChange={(v) => set({ position: v })} />
              <Field label="Standard-Priorität">{(id) => <Select id={id} value={d.defaultPriorityId ?? ''} onChange={(e) => set({ defaultPriorityId: e.target.value || null })}><option value="">Standard-Priorität</option>{c.priorities.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</Select>}</Field>
            </div>
            <Check label="Aktiv (kann geöffnet werden)" checked={d.active} onChange={(v) => set({ active: v })} hint="Deaktivieren verhindert nur neue Tickets – bestehende bleiben vollständig zugänglich und bearbeitbar." />
          </Section>
          <Section title="Zuständigkeit & Vertraulichkeit">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Abteilung">{(id) => <Select id={id} value={d.departmentId ?? ''} onChange={(e) => set({ departmentId: e.target.value || null })}><option value="">— keine —</option>{c.departments.map((x) => <option key={x.id} value={x.id}>{label(x)}{x.active ? '' : ' (inaktiv)'}</option>)}</Select>}</Field>
              <Num label="Unzugewiesen an die Leitung melden nach (Minuten, 0 = aus)" value={d.escalateUnassignedMinutes} onChange={(v) => set({ escalateUnassignedMinutes: v })} hint="Meldet nur – gibt niemandem zusätzlichen Zugriff." />
            </div>
            <Check label="Vertraulich" checked={d.confidential} onChange={(v) => set({ confidential: v })} hint="Nie ersatzweise für die allgemeine Staff-Rolle sichtbar; ohne Zugriffsrollen nur für die Leitung (ticket.manage); keine Details in Log- und Benachrichtigungskanälen; Verschieben in nicht vertrauliche Kategorien nur durch die Leitung." />
            {d.confidential && !d.departmentId && !d.staffRoleIds.length && <p role="alert" className="text-xs text-warning">Für diese vertrauliche Kategorie ist keine zuständige Abteilung oder Rolle eingerichtet. Neue Tickets sind dann nur für die Ersatz-Rollen (Allgemein → Vertrauliche Tickets) sichtbar.</p>}
          </Section>
          <Section title="Discord-Kanal">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Discord-Kategorie für neue Tickets">{(id) => <ChannelPicker ariaLabel={id} kind="category" value={d.discordCategoryId} onChange={(v) => set({ discordCategoryId: v })} />}</Field>
              <Field label="Kanalname-Format" hint={`Beispiel: ${ticketChannelName(d.channelNameFormat, { ...SAMPLE, '{category}': d.name })}`}>{(id) => <Input id={id} value={d.channelNameFormat} maxLength={90} onChange={(e) => set({ channelNameFormat: e.target.value })} />}</Field>
            </div>
            <Roles label="Zuständige Rollen (sehen + schreiben, werden beim Öffnen gepingt; leer = allgemeine Staff-Rolle aus den Einstellungen)" value={d.staffRoleIds} onChange={(v) => set({ staffRoleIds: v })} />
            <Roles label="Zusätzliche Rollen (sehen + schreiben)" value={d.extraRoleIds} onChange={(v) => set({ extraRoleIds: v })} />
          </Section>
          <Section title="Wer darf öffnen · Limits">
            <Roles label="Benötigte Discord-Rollen (leer = alle)" value={d.requiredRoleIds} onChange={(v) => set({ requiredRoleIds: v })} />
            <Ids label="Nur diese Benutzer (leer = alle)" value={d.allowedUserIds} onChange={(v) => set({ allowedUserIds: v })} />
            <div className="grid gap-3 md:grid-cols-2">
              <Num label="Max. offene Tickets pro Benutzer (0 = unbegrenzt)" value={d.maxOpen} max={100} onChange={(v) => set({ maxOpen: v })} />
              <Num label="Cooldown zwischen Tickets (Minuten)" value={d.cooldownMinutes} onChange={(v) => set({ cooldownMinutes: v })} />
              <Num label="Kapazität: voll ab so vielen offenen Tickets (0 = aus)" value={d.capacity} max={1000} onChange={(v) => set({ capacity: v })} hint="Wird in Panels mit „Ticket-Auslastung anzeigen“ angezeigt (🟢 / 🟡 / 🔴)." />
            </div>
            <Check label="Der Ersteller darf weitere Personen zum Ticket hinzufügen" checked={d.creatorCanAddUsers} onChange={(v) => set({ creatorCanAddUsers: v })} />
            <Names label="Dashboard-Zugriff: Systemrollen (leer = alle mit ticket.view)" value={d.accessRoleNames} onChange={(v) => set({ accessRoleNames: v })} hint="Rollennamen aus „Rollen & Rechte“, durch Kommas getrennt – z. B. Ticket Support" />
          </Section>
          <Section title="Formular">
            <Field label="Wann wird gefragt?">{(id) => <Select id={id} value={d.formMode} onChange={(e) => set({ formMode: e.target.value as CatDraft['formMode'] })}><option value="MODAL">Discord-Formular vor dem Erstellen (empfohlen)</option><option value="CHANNEL">Nacheinander im Ticket-Kanal (bisheriges Verhalten)</option></Select>}</Field>
            <p className="text-xs text-muted">{d.formMode === 'MODAL' ? `Discord erlaubt höchstens 5 Eingaben je Formular – dieses Formular hat ${planFormSteps(d.questions).length || 0} Schritt(e). Auswahl, Ja/Nein, Bestätigung und Mehrfachauswahl erscheinen als Auswahlmenü, Anhänge als Datei-Upload.` : 'Die Fragen werden nach dem Erstellen im Ticket nacheinander gestellt; Anhänge lädt der Nutzer im Kanal hoch.'}{d.id ? ` Gespeicherte Änderungen an den Feldern erzeugen eine neue Formular-Version (aktuell v${draft.formVersion ?? 1}); bereits eingereichte Tickets behalten ihre Angaben.` : ''}</p>
            <QuestionsEditor value={d.questions} onChange={(v) => set({ questions: v })} />
            <FormPreview fields={d.questions} />
            {d.id && <FormVersions id={d.id} />}
          </Section>
          <Section title="Ticket-Nachricht">
            <Field label="Titel">{(id) => <Input id={id} value={d.welcomeTitle} maxLength={256} onChange={(e) => set({ welcomeTitle: e.target.value })} />}</Field>
            <Field label="Nachricht">{(id) => <Textarea id={id} rows={5} value={d.welcomeMessage} maxLength={4000} onChange={(e) => set({ welcomeMessage: e.target.value })} />}</Field>
            <Field label="Bild (URL, optional – z. B. dein Banner)">{(id) => <Input id={id} type="url" value={d.welcomeImageUrl ?? ''} maxLength={500} placeholder="https://…" onChange={(e) => set({ welcomeImageUrl: e.target.value || null })} />}</Field>
            <Check label="Zuständige Rollen beim Öffnen eines Tickets pingen" checked={d.mentionStaff} onChange={(v) => set({ mentionStaff: v })} />
            <Field label="Zusätzliche Erwähnung / Text über der Nachricht">{(id) => <Input id={id} value={d.mentionText} maxLength={1000} onChange={(e) => set({ mentionText: e.target.value })} />}</Field>
          </Section>
          <Section title="Buttons am Ticket"><ButtonsEditor value={d.buttons} onChange={(v) => set({ buttons: v })} /></Section>
          <Section title="Übernahme">
            <Field label="Modus">{(id) => <Select id={id} value={d.claimMode} onChange={(e) => set({ claimMode: e.target.value as CatDraft['claimMode'] })}>{Object.entries(CLAIM_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label="Nachricht bei Übernahme">{(id) => <Input id={id} value={d.claimMessage} maxLength={1000} onChange={(e) => set({ claimMessage: e.target.value })} />}</Field>
            <Check label="Team-Rollen bei Übernahme benachrichtigen" checked={d.claimNotifyStaff} onChange={(v) => set({ claimNotifyStaff: v })} />
            <Field label="Übernahme-Kategorie: übernommene Tickets in diese Discord-Kategorie verschieben (leer = bleiben)">{(id) => <ChannelPicker ariaLabel={id} kind="category" value={d.claimDiscordCategoryId} onChange={(v) => set({ claimDiscordCategoryId: v })} />}</Field>
            <Check label="Chat nach Übernahme einschränken: nur Bearbeiter, Ersteller und zusätzliche Rollen können schreiben (nach Freigabe wieder das ganze Team)" checked={d.claimLocksChat} onChange={(v) => set({ claimLocksChat: v })} />
            <Check label="Auto-Übernahme: das erste Teammitglied, das schreibt, übernimmt das Ticket" checked={d.autoClaimOnMessage} onChange={(v) => set({ autoClaimOnMessage: v })} />
          </Section>
          <Section title="Schließen">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Schließungsgrund">{(id) => <Select id={id} value={d.closeReasonMode} onChange={(e) => set({ closeReasonMode: e.target.value as CatDraft['closeReasonMode'] })}>{Object.entries(CLOSE_REASON_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
              <Field label="Gründe aus">{(id) => <Select id={id} value={d.closeReasonSource} disabled={d.closeReasonMode === 'NONE'} onChange={(e) => set({ closeReasonSource: e.target.value as CatDraft['closeReasonSource'] })}>{Object.entries(CLOSE_REASON_SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            </div>
            <Check label="Der Ersteller darf sein eigenes Ticket schließen" checked={d.creatorCanClose} onChange={(v) => set({ creatorCanClose: v })} />
            <Check label="Zugriff des Erstellers beim Schließen entfernen" checked={d.closeRemovesAccess} onChange={(v) => set({ closeRemovesAccess: v })} />
            <Check label="Wiedereröffnen erlauben" checked={d.allowReopen} onChange={(v) => set({ allowReopen: v })} />
            <Check label="Schließanfrage: Ticket sofort schließen, wenn der Ersteller bestätigt (Button „Schließen anfragen“)" checked={d.closeRequestCloses} onChange={(v) => set({ closeRequestCloses: v })} />
            <Num label="Kanal nach dem Schließen löschen (Minuten, -1 = nie, 0 = sofort)" value={d.deleteAfterMinutes} min={-1} onChange={(v) => set({ deleteAfterMinutes: v })} hint="Vor dem Löschen wird ein Transkript gespeichert, falls aktiviert." />
          </Section>
          <Section title="Transkript & Bewertung">
            <Check label="Beim Schließen ein Transkript erstellen" checked={d.transcriptOnClose} onChange={(v) => set({ transcriptOnClose: v })} />
            <Field label="Transkript-Kanal (leer = allgemeiner Transkript-Kanal)">{(id) => <ChannelPicker ariaLabel={id} kind="text" value={d.transcriptChannelId} onChange={(v) => set({ transcriptChannelId: v })} />}</Field>
            <Check label="Transkript per DM an den Ersteller senden" checked={d.transcriptToUser} onChange={(v) => set({ transcriptToUser: v })} />
            <Check label="Ersteller um eine Bewertung bitten (DM, 1–5 Sterne)" checked={d.ratingEnabled} onChange={(v) => set({ ratingEnabled: v })} />
            <Field label="Bewertungsfrage">{(id) => <Input id={id} value={d.ratingQuestion} maxLength={300} onChange={(e) => set({ ratingQuestion: e.target.value })} />}</Field>
          </Section>
          <Section title="Automatisierung">
            <div className="grid gap-3 md:grid-cols-2">
              <Num label="Automatisch schließen nach Inaktivität (Minuten, 0 = aus)" value={d.autoCloseMinutes} onChange={(v) => set({ autoCloseMinutes: v })} />
              <Num label="So viele Minuten vorher warnen (0 = keine Warnung)" value={d.autoCloseWarnMinutes} onChange={(v) => set({ autoCloseWarnMinutes: v })} />
            </div>
            <Field label="Warnnachricht">{(id) => <Input id={id} value={d.autoCloseMessage} maxLength={1000} onChange={(e) => set({ autoCloseMessage: e.target.value })} />}</Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Num label="Auto-Team-Alarm: Bearbeiter nach Inaktivität pingen (Minuten, 0 = aus)" value={d.staffAlertMinutes} onChange={(v) => set({ staffAlertMinutes: v })} hint="Passiert danach noch einmal so lange nichts, wird das Ticket freigegeben." />
              <Num label="Automatisch freigeben nach Inaktivität (Minuten, 0 = aus)" value={d.autoUnclaimMinutes} onChange={(v) => set({ autoUnclaimMinutes: v })} />
            </div>
          </Section>
          <Err error={save.error} />
          <div className="flex gap-2">{d.id ? <><span className="self-center text-xs text-muted">Wird automatisch gespeichert.</span><Button onClick={() => void flush().then(onDone)}>Fertig</Button></> : <><Button disabled={save.isPending} onClick={() => save.mutate(undefined)}>Kategorie erstellen</Button><Button variant="secondary" onClick={onDone}>Abbrechen</Button></>}</div>
        </div>
      </Card>
      <div className="xl:sticky xl:top-4 xl:self-start"><Card title="Vorschau: neues Ticket"><DiscordPreview message={preview} /></Card></div>
    </div>
  );
}

function QuestionsEditor({ value, onChange }: { value: TicketQuestion[]; onChange: (v: TicketQuestion[]) => void }) {
  const patch = (i: number, p: Partial<TicketQuestion>) => onChange(value.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const text = (q: TicketQuestion) => q.type === 'SHORT' || q.type === 'LONG';
  const num = (v: string) => (v === '' ? undefined : Number(v));
  return (
    <div className="grid gap-3">
      {!value.length && <p className="text-sm text-muted">Keine Felder – das Ticket wird direkt geöffnet.</p>}
      {value.map((q, i) => (
        <div key={q.id} className={`grid gap-2 rounded border border-line p-2 ${q.enabled === false ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">#{i + 1} · ID <code>{q.id}</code></span>
            {q.enabled === false && <Badge>deaktiviert</Badge>}
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" aria-label={`Feld ${i + 1} nach oben`} disabled={i === 0} onClick={() => onChange(move(value, i, -1))}>↑</Button>
              <Button size="sm" variant="ghost" aria-label={`Feld ${i + 1} nach unten`} disabled={i === value.length - 1} onClick={() => onChange(move(value, i, 1))}>↓</Button>
              <Button size="sm" variant="ghost" onClick={() => patch(i, { enabled: q.enabled === false ? undefined : false })}>{q.enabled === false ? 'Aktivieren' : 'Deaktivieren'}</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>Entfernen</Button>
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_200px]">
            <Field label="Bezeichnung" hint="In Discord-Formularen werden höchstens 45 Zeichen angezeigt.">{(id) => <Input id={id} value={q.label} maxLength={300} onChange={(e) => patch(i, { label: e.target.value })} />}</Field>
            <Field label="Typ">{(id) => <Select id={id} value={q.type} onChange={(e) => patch(i, { type: e.target.value as QuestionType })}>{Object.entries(QUESTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          </div>
          {(q.type === 'SELECT' || q.type === 'MULTI') && <OptionsText value={q.options} onChange={(v) => patch(i, { options: v })} />}
          {(text(q) || q.type === 'NUMBER' || q.type === 'DATE' || q.type === 'SELECT' || q.type === 'MULTI') && <Field label="Platzhalter (optional)">{(id) => <Input id={id} value={q.placeholder ?? ''} maxLength={100} onChange={(e) => patch(i, { placeholder: e.target.value || undefined })} />}</Field>}
          <Field label="Hilfetext (optional)" hint="Wird unter der Bezeichnung angezeigt (Discord: max. 100 Zeichen).">{(id) => <Input id={id} value={q.description ?? ''} maxLength={200} onChange={(e) => patch(i, { description: e.target.value || undefined })} />}</Field>
          {text(q) && <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Min. Zeichen">{(id) => <Input id={id} type="number" min={0} max={4000} value={q.minLength ?? ''} onChange={(e) => patch(i, { minLength: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value))) })} />}</Field>
            <Field label="Max. Zeichen (Standard 4000)">{(id) => <Input id={id} type="number" min={1} max={4000} value={q.maxLength ?? ''} onChange={(e) => patch(i, { maxLength: e.target.value === '' ? undefined : Math.max(1, Math.floor(Number(e.target.value))) })} />}</Field>
          </div>}
          {q.type === 'NUMBER' && <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Kleinster Wert">{(id) => <Input id={id} type="number" value={q.min ?? ''} onChange={(e) => patch(i, { min: num(e.target.value) })} />}</Field>
            <Field label="Größter Wert">{(id) => <Input id={id} type="number" value={q.max ?? ''} onChange={(e) => patch(i, { max: num(e.target.value) })} />}</Field>
          </div>}
          {q.type === 'FILE' && <Field label="Höchstens so viele Dateien (1–10)" hint="Erlaubt: Bilder (PNG, JPG, GIF, WebP), PDF, Text – je max. 8 MB. Im Kanal-Modus lädt der Nutzer die Datei im Ticket hoch.">{(id) => <Input id={id} type="number" min={1} max={10} value={q.max ?? 1} onChange={(e) => patch(i, { max: Math.min(10, Math.max(1, Math.floor(Number(e.target.value) || 1))) })} />}</Field>}
          <Check label={q.type === 'CHECKBOX' ? 'Pflicht (muss bestätigt werden)' : 'Pflichtfeld'} checked={q.required} onChange={(v) => patch(i, { required: v })} />
        </div>
      ))}
      <div><Button size="sm" variant="secondary" disabled={value.length >= 25} onClick={() => onChange([...value, { id: `q${Date.now().toString(36)}`, label: '', type: 'SHORT', required: true, options: [] }])}>Feld hinzufügen</Button></div>
    </div>
  );
}

/**
 * Vorschau zum Testen: gleiche Prüfung wie beim Einreichen (lokal sofort, auf Wunsch zusätzlich serverseitig) – es entsteht kein Ticket.
 */
function FormPreview({ fields }: { fields: TicketQuestion[] }) {
  const [vals, setVals] = useState<Record<string, FormRawValue>>({});
  const [server, setServer] = useState<{ ok: boolean; errors: Record<string, string> } | null>(null);
  const [err, setErr] = useState<unknown>();
  const active = activeFields(fields);
  const steps = planFormSteps(fields);
  const local = validateForm(fields, vals, {}, { only: active.filter((f) => f.type !== 'FILE').map((f) => f.id) });
  const set = (id: string, v: FormRawValue) => { setVals({ ...vals, [id]: v }); setServer(null); };
  const check = async () => {
    setErr(undefined);
    try { setServer(await api<{ ok: boolean; errors: Record<string, string> }>('/support-tickets/forms/preview', { method: 'POST', body: { fields, values: Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== undefined)) } })); } catch (e) { setErr(e); }
  };
  if (!active.length) return null;
  const errors = server?.errors ?? local.errors;
  return (
    <details className="rounded border border-line p-2">
      <summary className="cursor-pointer text-sm font-medium">🧪 Formular testen (Vorschau – erzeugt kein Ticket)</summary>
      <div className="mt-2 grid gap-3">
        {steps.map((ids, si) => (
          <fieldset key={si} className="grid gap-2 rounded border border-dashed border-line p-2">
            <legend className="px-1 text-xs text-muted">Discord-Formular {si + 1}/{steps.length}</legend>
            {active.filter((f) => ids.includes(f.id)).map((f) => (
              <Field key={f.id} label={`${f.label}${f.required ? ' *' : ''}`} hint={errors[f.id] ? undefined : f.description}>{(id) => (
                <div className="grid gap-1">
                  {f.type === 'LONG' ? <Textarea id={id} rows={3} value={String(vals[f.id] ?? '')} placeholder={f.placeholder} onChange={(e) => set(f.id, e.target.value)} />
                    : f.type === 'FILE' ? <p className="text-xs text-muted">📎 Datei-Upload in Discord (Bilder, PDF, Text; höchstens {f.max ?? 1}).</p>
                    : ['SELECT', 'YESNO', 'CHECKBOX'].includes(f.type) ? <Select id={id} value={String(vals[f.id] ?? '')} onChange={(e) => set(f.id, e.target.value || undefined)}><option value="">{f.placeholder ?? 'Bitte auswählen …'}</option>{fieldOptions(f).map((o) => <option key={o} value={o}>{o}</option>)}</Select>
                    : f.type === 'MULTI' ? <div className="flex flex-wrap gap-2">{f.options.map((o) => { const cur = Array.isArray(vals[f.id]) ? (vals[f.id] as string[]) : []; return <Check key={o} label={o} checked={cur.includes(o)} onChange={(v) => set(f.id, v ? [...cur, o] : cur.filter((x) => x !== o))} />; })}</div>
                    : <Input id={id} value={String(vals[f.id] ?? '')} placeholder={f.placeholder ?? (f.type === 'DATE' ? 'TT.MM.JJJJ' : f.type === 'NUMBER' ? 'Zahl' : undefined)} onChange={(e) => set(f.id, e.target.value)} />}
                  {errors[f.id] && <span role="alert" className="text-xs text-danger">{errors[f.id]}</span>}
                </div>
              )}</Field>
            ))}
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void check()}>Serverseitig prüfen</Button>
          {server && <span role="status" className={`text-sm ${server.ok ? 'text-success' : 'text-danger'}`}>{server.ok ? 'Alle Angaben gültig.' : `${Object.keys(server.errors).length} Feld(er) ungültig.`}</span>}
          {!server && <span className="text-xs text-muted">{local.ok ? 'Lokal gültig.' : `${Object.keys(local.errors).length} Feld(er) noch ungültig.`}</span>}
          <Err error={err} />
        </div>
      </div>
    </details>
  );
}

function FormVersions({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ id: string; version: number; createdAt: string; createdByName: string | null; fields: TicketQuestion[] }[]>();
  const [err, setErr] = useState<unknown>();
  const load = async () => { setOpen(!open); if (!rows) try { setRows(await api(`/support-tickets/categories/${id}/form-versions`)); } catch (e) { setErr(e); } };
  return (
    <div className="text-sm">
      <Button size="sm" variant="ghost" onClick={() => void load()}>{open ? 'Versionen ausblenden' : 'Formular-Versionen anzeigen'}</Button>
      <Err error={err} />
      {open && rows && <ul className="mt-1 grid gap-1">{rows.map((v) => <li key={v.id} className="rounded bg-panel-2 px-2 py-1"><b>v{v.version}</b> · {fmt(v.createdAt)}{v.createdByName ? ` · ${v.createdByName}` : ''} · {v.fields.map((f) => f.label).join(', ') || 'keine Felder'}</li>)}</ul>}
    </div>
  );
}
function OptionsText({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = useState(value.join('\n'));
  return <Field label="Optionen – eine pro Zeile (mind. 2, max. 25)">{(id) => <Textarea id={id} rows={4} value={t} onChange={(e) => setT(e.target.value)} onBlur={() => onChange(t.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 25))} />}</Field>;
}

function ButtonsEditor({ value, onChange }: { value: TicketCategoryCfg['buttons']; onChange: (v: TicketCategoryCfg['buttons']) => void }) {
  const patch = (i: number, p: Partial<TicketCategoryCfg['buttons'][number]>) => onChange(value.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const missing = (Object.keys(TICKET_ACTIONS) as TicketAction[]).filter((a) => !NO_TICKET_BUTTON.includes(a) && !value.some((b) => b.action === a));
  const [add, setAdd] = useState<string>('');
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted">Jeder Button braucht sein eigenes Recht (ticket.*). Buttons erscheinen nur, wenn sie sinnvoll sind (z. B. „Freigeben“ nur bei übernommenen Tickets).</p>
      {value.map((b, i) => (
        <div key={b.action} className="grid items-end gap-2 rounded border border-line p-2 sm:grid-cols-[110px_minmax(0,1fr)_80px_110px_auto]">
          <div className="text-sm"><Check label={TICKET_ACTIONS[b.action].label} checked={b.enabled} onChange={(v) => patch(i, { enabled: v })} /><span className="text-[11px] text-muted">{TICKET_ACTIONS[b.action].permission}</span></div>
          <Field label="Beschriftung">{(id) => <Input id={id} value={b.label} maxLength={80} onChange={(e) => patch(i, { label: e.target.value })} />}</Field>
          <Field label="Emoji">{(id) => <Input id={id} value={b.emoji ?? ''} maxLength={64} onChange={(e) => patch(i, { emoji: e.target.value || undefined })} />}</Field>
          <Field label="Farbe">{(id) => <Select id={id} value={b.style} onChange={(e) => patch(i, { style: e.target.value as ButtonStyleName })}>{STYLES.map((s) => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}</Select>}</Field>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" aria-label={`${TICKET_ACTIONS[b.action].label} nach oben`} disabled={i === 0} onClick={() => onChange(move(value, i, -1))}>↑</Button>
            <Button size="sm" variant="ghost" aria-label={`${TICKET_ACTIONS[b.action].label} nach unten`} disabled={i === value.length - 1} onClick={() => onChange(move(value, i, 1))}>↓</Button>
            <Button size="sm" variant="ghost" aria-label={`${TICKET_ACTIONS[b.action].label} entfernen`} onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</Button>
          </span>
        </div>
      ))}
      {missing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="w-48"><Select aria-label="Button hinzufügen" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Button hinzufügen …</option>{missing.map((a) => <option key={a} value={a}>{TICKET_ACTIONS[a].emoji} {TICKET_ACTIONS[a].label}</option>)}</Select></div>
          <Button size="sm" variant="secondary" disabled={!add || value.length >= 20} onClick={() => { const a = add as TicketAction; const def = TICKET_ACTIONS[a]; onChange([...value, { action: a, label: def.label, emoji: def.emoji, style: def.style as ButtonStyleName, enabled: true }]); setAdd(''); }}>Hinzufügen</Button>
        </div>
      )}
    </div>
  );
}

// =============================== Allgemein ===============================
function General({ c }: { c: TicketConfig }) {
  const [s, setS] = useState<TicketSettingsCfg>(c.settings);
  const [ok, setOk] = useState(false);
  const set = (p: Partial<TicketSettingsCfg>) => { setS({ ...s, ...p }); setOk(false); };
  const save = useSave(() => api('/support-tickets/settings', { method: 'PUT', body: clean(s) }), () => setOk(true));
  useTicketAutosaveSync();
  useAutosaveDraft('ticket:settings', s, (x) => ({ method: 'PUT', path: '/support-tickets/settings', body: clean(x), label: 'Ticket-Einstellungen' }));
  const closed: MessageSpec = { embeds: [{ title: renderTicketText(s.closedTitle, SAMPLE), description: renderTicketText(s.closedMessage, SAMPLE), color: s.closedColor }] };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <Card title="Allgemeine Einstellungen">
        <div className="grid gap-3">
          <Section title="Kanäle">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Log-Kanal (jede Ticket-Aktion)">{(id) => <ChannelPicker ariaLabel={id} kind="text" value={s.logChannelId} onChange={(v) => set({ logChannelId: v })} />}</Field>
              <Field label="Transkript-Kanal (Standard)">{(id) => <ChannelPicker ariaLabel={id} kind="text" value={s.transcriptChannelId} onChange={(v) => set({ transcriptChannelId: v })} />}</Field>
            </div>
            <Num label="Transkripte löschen nach (Tagen, 0 = für immer behalten)" value={s.transcriptRetentionDays} max={3650} onChange={(v) => set({ transcriptRetentionDays: v })} hint="Standard 0: keine automatische Löschung. Eine Löschfrist nur nach rechtlicher Prüfung einstellen." />
          </Section>
          <Section title="Ticket-IDs, Limits & Server">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Präfix der Ticket-ID" hint={`Beispiel: ${s.refPrefix || 'EMD'}-000123 (2–8 Großbuchstaben). Nummern werden nie wiederverwendet.`}>{(id) => <Input id={id} value={s.refPrefix} maxLength={8} onChange={(e) => set({ refPrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />}</Field>
              <Num label="Offene Tickets je Nutzer insgesamt (0 = unbegrenzt)" value={s.maxOpenPerUser} max={100} onChange={(v) => set({ maxOpenPerUser: v })} hint="Zusätzlich zum Limit je Kategorie. Recht ticket.bypass_limits hebt Limits auf." />
              <Field label="Tickets nur auf diesem Discord-Server (leer = keine Einschränkung)">{(id) => <Input id={id} inputMode="numeric" value={s.guildId ?? ''} placeholder="Server-ID" onChange={(e) => set({ guildId: e.target.value.trim() || null })} />}</Field>
            </div>
          </Section>
          <Section title="Vertrauliche Tickets & Leitung">
            <Roles label="Ersatz-Rollen für vertrauliche Tickets ohne zuständige Abteilung (z. B. Leitung) – nie die allgemeine Staff-Rolle" value={s.confidentialFallbackRoleIds} onChange={(v) => set({ confidentialFallbackRoleIds: v })} />
            <Roles label="Leitung für Eskalationen (wenn die Abteilung keine eigene hat)" value={s.leadRoleIds} onChange={(v) => set({ leadRoleIds: v })} />
          </Section>
          <Section title="SLA-Erinnerungen">
            <div className="grid gap-3 md:grid-cols-3">
              <Num label="Erinnerung wiederholen alle (Minuten, 0 = nur einmal)" value={s.slaReminderMinutes} onChange={(v) => set({ slaReminderMinutes: v })} />
              <Num label="An die Leitung nach Überschreitung von (Minuten)" value={s.slaEscalateAfterMinutes} onChange={(v) => set({ slaEscalateAfterMinutes: v })} />
              <Num label="„Neue Nachricht“ höchstens alle (Minuten)" value={s.userMessageNotifyMinutes} min={1} onChange={(v) => set({ userMessageNotifyMinutes: Math.max(1, v) })} />
            </div>
          </Section>
          <Section title="Benachrichtigungen">
            <p className="text-xs text-muted">Kanal = interner Kanal der Abteilung · DM = Discord-Nachricht an die Bearbeiter · Dashboard = Glocke im Dashboard. Empfänger sind nur Berechtigte; bei vertraulichen Tickets nur Ticket-ID und Art des Ereignisses.</p>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="py-1">Ereignis</th><th>Kanal</th><th>DM</th><th>Dashboard</th></tr></thead><tbody>
              {(Object.keys(NOTIFY_EVENTS) as NotifyEvent[]).map((ev) => {
                const r = s.notifications?.[ev] ?? { channel: false, dm: false, dashboard: false };
                const tog = (k: 'channel' | 'dm' | 'dashboard') => set({ notifications: { ...s.notifications, [ev]: { ...r, [k]: !r[k] } } });
                return <tr key={ev} className="border-t border-line"><td className="py-1">{NOTIFY_EVENTS[ev]}</td>{(['channel', 'dm', 'dashboard'] as const).map((k) => <td key={k}><input type="checkbox" aria-label={`${NOTIFY_EVENTS[ev]}: ${k}`} checked={r[k]} onChange={() => tog(k)} /></td>)}</tr>;
              })}
            </tbody></table></div>
          </Section>
          <Section title="Bewertungen">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Bewertungs-Kanal (Team, alle Details)">{(id) => <ChannelPicker ariaLabel={id} kind="text" value={s.ratingChannelId} onChange={(v) => set({ ratingChannelId: v })} />}</Field>
              <Field label="Öffentlicher Bewertungs-Kanal (nur die Angaben unten)">{(id) => <ChannelPicker ariaLabel={id} kind="text" value={s.ratingPublicChannelId} onChange={(v) => set({ ratingPublicChannelId: v })} />}</Field>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Im öffentlichen Kanal angezeigt">
              <span className="text-xs text-muted">Öffentlich angezeigt:</span>
              {(Object.keys(RATING_FIELDS) as RatingField[]).map((k) => <Check key={k} label={RATING_FIELDS[k]} checked={s.ratingPublicFields.includes(k)} onChange={(v) => set({ ratingPublicFields: v ? [...s.ratingPublicFields, k] : s.ratingPublicFields.filter((x) => x !== k) })} />)}
            </div>
          </Section>
          <Section title="Wenn der Ersteller den Server verlässt">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Aktion">{(id) => <Select id={id} value={s.memberLeaveAction} onChange={(e) => set({ memberLeaveAction: e.target.value as TicketSettingsCfg['memberLeaveAction'] })}><option value="NONE">Nichts tun</option><option value="CLOSE">Offene Tickets schließen</option></Select>}</Field>
              <Field label="Grund beim Schließen">{(id) => <Input id={id} value={s.memberLeaveReason} maxLength={300} disabled={s.memberLeaveAction === 'NONE'} onChange={(e) => set({ memberLeaveReason: e.target.value })} />}</Field>
            </div>
            <p className="text-xs text-muted">Braucht den privilegierten <b>Server Members</b>-Intent (Developer Portal → Bot).</p>
          </Section>
          <Section title="Anzeige bei geschlossenem Ticket">
            <Field label="Titel">{(id) => <Input id={id} value={s.closedTitle} maxLength={256} onChange={(e) => set({ closedTitle: e.target.value })} />}</Field>
            <Field label="Nachricht">{(id) => <Textarea id={id} rows={5} value={s.closedMessage} maxLength={4000} onChange={(e) => set({ closedMessage: e.target.value })} />}</Field>
            <Color label="Farbe" value={s.closedColor} onChange={(v) => set({ closedColor: v })} />
          </Section>
          <Section title="Texte">
            <Field label="Nachricht beim Wiedereröffnen">{(id) => <Input id={id} value={s.reopenedMessage} maxLength={1000} onChange={(e) => set({ reopenedMessage: e.target.value })} />}</Field>
            <Field label="Bewertungs-DM">{(id) => <Textarea id={id} rows={3} value={s.ratingMessage} maxLength={1000} onChange={(e) => set({ ratingMessage: e.target.value })} />}</Field>
            <Field label="Dank nach der Bewertung">{(id) => <Input id={id} value={s.ratingThanks} maxLength={500} onChange={(e) => set({ ratingThanks: e.target.value })} />}</Field>
          </Section>
          <Err error={save.error} />
          <div className="flex items-center gap-2"><span className="text-xs text-muted">Änderungen werden automatisch gespeichert.</span><Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Jetzt speichern</Button>{ok && <span role="status" className="text-sm text-success">Gespeichert.</span>}</div>
        </div>
      </Card>
      <div className="xl:sticky xl:top-4 xl:self-start"><Card title="Vorschau: geschlossenes Ticket"><DiscordPreview message={closed} /></Card></div>
    </div>
  );
}

// =============================== Abteilungen ===============================
type DeptDraft = Omit<TicketDepartmentCfg, 'id'> & { id?: string };
const NEW_DEPT: DeptDraft = { name: '', description: '', emoji: null, staffRoleIds: [], leadRoleIds: [], accessRoleNames: [], notifyChannelId: null, active: true, position: 0 };

function Departments({ c }: { c: TicketConfig }) {
  const [edit, setEdit] = useState<DeptDraft>();
  const [del, setDel] = useState<TicketDepartmentCfg>();
  const save = useSave((d: DeptDraft) => api(d.id ? `/support-tickets/departments/${d.id}` : '/support-tickets/departments', { method: d.id ? 'PUT' : 'POST', body: clean({ ...d, id: undefined }) }), () => setEdit(undefined));
  const remove = useSave((id: string) => api(`/support-tickets/departments/${id}`, { method: 'DELETE' }), () => setDel(undefined));
  const used = (id: string) => c.categories.filter((x) => x.departmentId === id && !x.archivedAt).map((x) => x.name);
  const set = (p: Partial<DeptDraft>) => edit && setEdit({ ...edit, ...p });
  return (
    <Card title="Abteilungen (Zuständigkeiten)" actions={<Button size="sm" onClick={() => setEdit({ ...NEW_DEPT, position: c.departments.length })}>Neue Abteilung</Button>}>
      <p className="mb-3 text-sm text-muted">Kategorien werden einer Abteilung zugeordnet. Ihre Discord-Rollen sehen und bearbeiten die Tickets; die Leitung wird bei Eskalationen benachrichtigt, bekommt dadurch aber keinen Zugriff.</p>
      <Err error={save.error ?? remove.error} />
      {edit && (
        <div className="mb-4 grid gap-3 rounded-md border border-primary/40 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">{(id) => <Input id={id} value={edit.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />}</Field>
            <Field label="Emoji">{(id) => <Input id={id} value={edit.emoji ?? ''} maxLength={64} onChange={(e) => set({ emoji: e.target.value || null })} />}</Field>
          </div>
          <Field label="Beschreibung">{(id) => <Input id={id} value={edit.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />}</Field>
          <Roles label="Zuständige Discord-Rollen (sehen + schreiben im Ticket)" value={edit.staffRoleIds} onChange={(v) => set({ staffRoleIds: v })} />
          <Roles label="Leitung (Eskalationen, SLA-Überschreitungen – nur Benachrichtigung)" value={edit.leadRoleIds} onChange={(v) => set({ leadRoleIds: v })} />
          <Names label="Dashboard-Zugriff: Systemrollen" value={edit.accessRoleNames} onChange={(v) => set({ accessRoleNames: v })} hint="Leer = Regeln der Kategorie. Für vertrauliche Abteilungen unbedingt setzen." />
          <Field label="Interner Benachrichtigungs-Kanal" hint="Muss für Unbeteiligte unsichtbar sein (neue Tickets, Eskalationen, Zuweisungen).">{(id) => <ChannelPicker ariaLabel={id} kind="text" value={edit.notifyChannelId} onChange={(v) => set({ notifyChannelId: v })} />}</Field>
          <Check label="Aktiv" checked={edit.active} onChange={(v) => set({ active: v })} />
          <div className="flex gap-2"><Button disabled={save.isPending || !edit.name.trim()} onClick={() => save.mutate(edit)}>Speichern</Button><Button variant="secondary" onClick={() => setEdit(undefined)}>Abbrechen</Button></div>
        </div>
      )}
      {!c.departments.length ? <EmptyState text="Noch keine Abteilungen." /> : (
        <ul className="grid gap-3 md:grid-cols-2">{c.departments.map((d) => (
          <li key={d.id} className="grid gap-1 rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{label(d)}</strong>{d.active ? <Badge tone="success">aktiv</Badge> : <Badge>inaktiv</Badge>}</div>
            <p className="text-xs text-muted">{d.staffRoleIds.length ? `${d.staffRoleIds.length} Rolle(n)` : '⚠️ keine zuständige Rolle – noch zu konfigurieren'} · {d.notifyChannelId ? 'Benachrichtigungs-Kanal gesetzt' : 'kein Benachrichtigungs-Kanal'}{d.accessRoleNames.length ? ` · Zugriff: ${d.accessRoleNames.join(', ')}` : ''}</p>
            <p className="text-xs text-muted">Kategorien: {used(d.id).join(', ') || '—'}</p>
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setEdit(d)}>Bearbeiten</Button><Button size="sm" variant="ghost" onClick={() => setDel(d)}>Löschen</Button></div>
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={!!del} danger title="Abteilung löschen?" message={`„${del?.name ?? ''}“ wird gelöscht. Abteilungen mit Kategorien oder Tickets können nicht gelöscht werden – deaktiviere sie stattdessen.`} confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </Card>
  );
}

// =============================== Status & SLA ===============================
function Lifecycle({ c }: { c: TicketConfig }) {
  const saveStatus = useSave((s: TicketStatusCfg) => api(`/support-tickets/statuses/${s.id}`, { method: 'PUT', body: clean({ ...s, id: undefined }) }));
  const savePrio = useSave((p: TicketPriorityCfg) => api(`/support-tickets/priorities/${p.id}`, { method: 'PUT', body: clean({ ...p, id: undefined }) }));
  const [prios, setPrios] = useState(c.priorities);
  useEffect(() => setPrios(c.priorities), [c.priorities]);
  const KIND: Record<string, string> = { OPEN: 'offen', CLOSED: 'geschlossen', ARCHIVED: 'archiviert' };
  const keyFits = (k: TicketStatusKey, kind: string) => (k === 'CLOSED' ? kind === 'CLOSED' : k === 'ARCHIVED' ? kind === 'ARCHIVED' : kind === 'OPEN');
  return (
    <div className="grid gap-4">
      <Card title="Status-Lebenszyklus">
        <p className="mb-3 text-sm text-muted">Jeder Status kann eine feste Bedeutung haben. Darüber laufen die zentralen Regeln: Schließen nur über „Schließen“, Archivieren nur geschlossener Tickets (Recht <code>ticket.archive</code>), „Wartet auf Nutzer“ pausiert die Lösungsfrist und endet automatisch, wenn der Nutzer antwortet.</p>
        <Err error={saveStatus.error} />
        <ul className="grid gap-2">{c.statuses.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-52">{label(s)} <span className="text-xs text-muted">({KIND[s.kind] ?? s.kind}{s.isDefault ? ', Start' : ''}{s.isClaimed ? ', bei Übernahme' : ''})</span></span>
            <div className="w-64"><Select aria-label={`Bedeutung von ${s.name}`} value={s.key ?? ''} disabled={saveStatus.isPending} onChange={(e) => saveStatus.mutate({ ...s, key: (e.target.value || null) as TicketStatusKey | null })}>
              <option value="">— keine feste Bedeutung —</option>{(Object.keys(TICKET_STATUS_KEYS) as TicketStatusKey[]).filter((k) => keyFits(k, s.kind)).map((k) => <option key={k} value={k}>{TICKET_STATUS_KEYS[k]}</option>)}
            </Select></div>
          </li>
        ))}</ul>
        {(['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'CLOSED', 'ARCHIVED'] as TicketStatusKey[]).filter((k) => !c.statuses.some((s) => s.key === k)).map((k) => <p key={k} role="alert" className="mt-2 text-xs text-warning">Kein Status mit der Bedeutung „{TICKET_STATUS_KEYS[k]}“ – die zugehörige Automatik ist dann aus.</p>)}
      </Card>
      <Card title="Prioritäten & SLA-Zielzeiten">
        <p className="mb-3 text-sm text-muted">Zielzeiten sind optional – ohne Eintrag gibt es keine Frist. Überfällige Tickets erscheinen im Ticket-Center; die Zuständigen werden erinnert und danach die Leitung benachrichtigt (Intervalle unter „Allgemein“).</p>
        <Err error={savePrio.error} />
        <div className="grid gap-2">{prios.map((p, i) => {
          const upd = (x: Partial<TicketPriorityCfg>) => setPrios(prios.map((q, j) => (j === i ? { ...q, ...x } : q)));
          const minutes = (v: string) => (v === '' ? null : Math.max(1, Math.floor(Number(v)) || 1));
          return (
            <div key={p.id} className="grid items-end gap-2 rounded border border-line p-2 sm:grid-cols-[160px_1fr_1fr_auto]">
              <span className="text-sm">{label(p)}</span>
              <Field label="Erste Antwort (Minuten)">{(id) => <Input id={id} type="number" min={1} value={p.firstResponseMinutes ?? ''} placeholder="keine Frist" onChange={(e) => upd({ firstResponseMinutes: minutes(e.target.value) })} />}</Field>
              <Field label="Lösung (Minuten)">{(id) => <Input id={id} type="number" min={1} value={p.resolutionMinutes ?? ''} placeholder="keine Frist" onChange={(e) => upd({ resolutionMinutes: minutes(e.target.value) })} />}</Field>
              <Button size="sm" variant="secondary" disabled={savePrio.isPending} onClick={() => savePrio.mutate(p)}>Speichern</Button>
              <div className="sm:col-span-4"><Roles label="Bei dieser Priorität benachrichtigen (nur Rollen mit Zugriff auf das Ticket werden gepingt)" value={p.notifyRoleIds} onChange={(v) => upd({ notifyRoleIds: v })} /></div>
            </div>
          );
        })}</div>
      </Card>
    </div>
  );
}

function Placeholders() {
  return (
    <Card title="Platzhalter (in allen Ticket-Texten und im Kanalnamen nutzbar)">
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{Object.entries(TICKET_PLACEHOLDERS).map(([k, v]) => <div key={k} className="flex gap-2"><dt><code className="rounded bg-panel-2 px-1">{k}</code></dt><dd className="text-muted">{v}</dd></div>)}</dl>
    </Card>
  );
}
