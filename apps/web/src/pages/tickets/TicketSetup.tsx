import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CLAIM_MODES, CLOSE_REASON_MODES, CLOSE_REASON_SOURCES, QUESTION_TYPES, STATUS_KINDS, TICKET_ACTIONS, TICKET_PLACEHOLDERS, defaultTicketButtons, renderTicketText, ticketChannelName,
  type ButtonStyleName, type MessageSpec, type QuestionType, type TicketAction, type TicketQuestion, type TicketVars,
} from '@enrp/shared';
import { flush, onSaved, useAutosaveDraft } from '../../lib/autosave';
import { api } from '../../lib/api';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Select, SkeletonRows, Textarea } from '../../components/ui';
import { DiscordPreview } from '../../components/DiscordPreview';
import { ChannelPicker, RolePicker } from '../../components/DiscordPickers';
import { GuildTag, useGuilds, useServer } from '../../lib/guilds';
import {
  errText, fromHex, hex, idsFromText, idsToText, label, useTicketConfig,
  type TicketCategoryCfg, type TicketConfig, type TicketPanelCfg, type TicketPriorityCfg, type TicketReasonCfg, type TicketSettingsCfg, type TicketStatusCfg,
  RATING_FIELDS, type RatingField,
} from '../../lib/tickets';

type Section = 'panels' | 'categories' | 'states' | 'settings';
const STYLES: ButtonStyleName[] = ['primary', 'secondary', 'success', 'danger'];
const STYLE_LABEL: Record<ButtonStyleName, string> = { primary: 'Blau', secondary: 'Grau', success: 'Grün', danger: 'Rot' };
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
  const list = p.categoryIds.map((id) => cats.find((c) => c.id === id)).filter((c): c is TicketCategoryCfg => !!c && c.active);
  const embed = { title: [p.emoji, p.title].filter(Boolean).join(' ') || undefined, description: p.description || undefined, color: p.color, thumbnail: p.thumbnailUrl ?? undefined, image: p.bannerUrl ?? p.imageUrl ?? undefined, footer: p.footer ?? undefined, footerIcon: p.footerIconUrl ?? undefined, author: p.authorName ?? undefined, authorIcon: p.authorIconUrl ?? undefined };
  if (p.style === 'DROPDOWN') return { embeds: [embed], select: { id: 'x', placeholder: p.placeholder, options: list.map((c) => ({ label: c.name, value: c.id, description: c.description || undefined, emoji: c.emoji ?? undefined })) } };
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
            <p className="text-xs text-muted">{p.style === 'DROPDOWN' ? 'Dropdown' : 'Buttons'} · {p.categoryIds.length} Kategorien · Kanal {p.channelId ? channelName(p.channelId) : '—'}</p>
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
              <Field label="Typ">{(id) => <Select id={id} value={p.style} onChange={(e) => set({ style: e.target.value as PanelDraft['style'] })}><option value="BUTTONS">Buttons</option><option value="DROPDOWN">Dropdown-Menü</option></Select>}</Field>
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
};

function Categories({ c }: { c: TicketConfig }) {
  const [server] = useServer();
  const [edit, setEdit] = useState<CatDraft>();
  const [del, setDel] = useState<TicketCategoryCfg>();
  const dup = useSave((id: string) => api(`/support-tickets/categories/${id}/duplicate`, { method: 'POST' }));
  const remove = useSave((id: string) => api(`/support-tickets/categories/${id}`, { method: 'DELETE' }), () => setDel(undefined));
  if (edit) return <CategoryEditor draft={edit} c={c} onDone={() => setEdit(undefined)} />;
  return (
    <Card title="Ticket-Kategorien" actions={<Button size="sm" onClick={() => setEdit({ ...NEW_CATEGORY, guildId: server || null, position: c.categories.length })}>Neue Kategorie</Button>}>
      <Err error={dup.error ?? remove.error} />
      {!c.categories.length ? <EmptyState text="Noch keine Kategorien." hint="Kategorien sind die Ticket-Arten (Support, Bewerbung, Beschwerde …)." /> : (
        <ul className="grid gap-3 md:grid-cols-2">{c.categories.map((x) => (
          <li key={x.id} className="grid gap-2 rounded-md border border-line p-3" style={{ borderLeft: `4px solid ${hex(x.color)}` }}>
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{label(x)} <GuildTag id={x.guildId} /></strong>{x.active ? <Badge tone="success">aktiv</Badge> : <Badge>inaktiv</Badge>}</div>
            <p className="text-xs text-muted">{x.questions.length} Fragen · max. {x.maxOpen || '∞'} offen · Übernahme {CLAIM_MODES[x.claimMode]} · Kanal „{x.channelNameFormat}“</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdit(x)}>Bearbeiten</Button>
              <Button size="sm" variant="secondary" disabled={dup.isPending} onClick={() => dup.mutate(x.id)}>Duplizieren</Button>
              <Button size="sm" variant="ghost" onClick={() => setDel(x)}>Löschen</Button>
            </div>
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={!!del} danger title="Kategorie löschen?" message={`„${del?.name ?? ''}“ wird gelöscht. Kategorien mit Tickets können nicht gelöscht werden – setze sie stattdessen inaktiv.`} confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </Card>
  );
}

function CategoryEditor({ draft, c, onDone }: { draft: CatDraft; c: TicketConfig; onDone: () => void }) {
  const [d, setD] = useState<CatDraft>({ ...draft, buttons: draft.buttons.length ? draft.buttons : defaultTicketButtons() });
  const set = (x: Partial<CatDraft>) => setD({ ...d, ...x });
  const save = useSave(() => api(d.id ? `/support-tickets/categories/${d.id}` : '/support-tickets/categories', { method: d.id ? 'PUT' : 'POST', body: clean({ ...d, id: undefined }) }), onDone);
  useTicketAutosaveSync();
  useAutosaveDraft(d.id ? `ticket:category:${d.id}` : null, d, (x) => (x.name.trim() ? { method: 'PUT', path: `/support-tickets/categories/${x.id}`, body: clean({ ...x, id: undefined }), label: `Kategorie „${x.name}“` } : null));
  const prio = c.priorities.find((p) => p.id === d.defaultPriorityId) ?? c.priorities.find((p) => p.isDefault);
  const status = c.statuses.find((s) => s.isDefault);
  const vars: TicketVars = { ...SAMPLE, '{category}': d.name, '{priority}': prio ? label(prio) : '—', '{status}': status ? label(status) : '—', '{channel}': `#${ticketChannelName(d.channelNameFormat, { ...SAMPLE, '{category}': d.name })}` };
  const preview: MessageSpec = {
    content: ['@Max', ...(d.mentionStaff ? d.staffRoleIds.map((r) => `@Rolle ${r}`) : []), renderTicketText(d.mentionText, vars)].filter(Boolean).join(' '),
    embeds: [{ title: renderTicketText(d.welcomeTitle || '🎫 {category}', vars), description: renderTicketText(d.welcomeMessage || 'Hallo {user}!', vars), color: prio?.color ?? d.color, fields: [{ name: 'Status', value: vars['{status}']!, inline: true }, { name: 'Priorität', value: vars['{priority}']!, inline: true }, { name: 'Bearbeiter', value: 'niemand', inline: true }], footer: 'Ticket #0042 · erstellt jetzt', ...(d.welcomeImageUrl ? { image: d.welcomeImageUrl } : {}) }],
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
            <Check label="Aktiv (kann geöffnet werden)" checked={d.active} onChange={(v) => set({ active: v })} />
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
          <Section title="Fragen (werden im Ticket nacheinander gestellt)"><QuestionsEditor value={d.questions} onChange={(v) => set({ questions: v })} /></Section>
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
          <Section title="Eskalation">
            <Roles label="Rollen, die bei Eskalation hinzugefügt werden" value={d.escalationRoleIds} onChange={(v) => set({ escalationRoleIds: v })} />
            <Field label="Priorität bei Eskalation">{(id) => <Select id={id} value={d.escalationPriorityId ?? ''} onChange={(e) => set({ escalationPriorityId: e.target.value || null })}><option value="">unverändert</option>{c.priorities.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</Select>}</Field>
            <Field label="Nachricht">{(id) => <Input id={id} value={d.escalationMessage} maxLength={1000} onChange={(e) => set({ escalationMessage: e.target.value })} />}</Field>
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
  return (
    <div className="grid gap-3">
      {!value.length && <p className="text-sm text-muted">Keine Fragen – das Ticket wird direkt geöffnet.</p>}
      {value.map((q, i) => (
        <div key={q.id} className="grid gap-2 rounded border border-line p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">#{i + 1}</span>
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" aria-label={`Frage ${i + 1} nach oben`} disabled={i === 0} onClick={() => onChange(move(value, i, -1))}>↑</Button>
              <Button size="sm" variant="ghost" aria-label={`Frage ${i + 1} nach unten`} disabled={i === value.length - 1} onClick={() => onChange(move(value, i, 1))}>↓</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>Entfernen</Button>
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
            <Field label="Frage">{(id) => <Input id={id} value={q.label} maxLength={300} onChange={(e) => patch(i, { label: e.target.value })} />}</Field>
            <Field label="Typ">{(id) => <Select id={id} value={q.type} onChange={(e) => patch(i, { type: e.target.value as QuestionType })}>{Object.entries(QUESTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
          </div>
          {(q.type === 'SELECT' || q.type === 'MULTI') && <OptionsText value={q.options} onChange={(v) => patch(i, { options: v })} />}
          {(q.type === 'SHORT' || q.type === 'LONG') && <Field label="Platzhalter (optional)">{(id) => <Input id={id} value={q.placeholder ?? ''} maxLength={100} onChange={(e) => patch(i, { placeholder: e.target.value || undefined })} />}</Field>}
          <Field label="Beschreibung (optional, wird unter der Frage angezeigt)">{(id) => <Input id={id} value={q.description ?? ''} maxLength={200} onChange={(e) => patch(i, { description: e.target.value || undefined })} />}</Field>
          {(q.type === 'SHORT' || q.type === 'LONG') && <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Min. Zeichen">{(id) => <Input id={id} type="number" min={0} max={4000} value={q.minLength ?? ''} onChange={(e) => patch(i, { minLength: e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value))) })} />}</Field>
            <Field label={`Max. Zeichen (Standard ${q.type === 'LONG' ? 2000 : 200})`}>{(id) => <Input id={id} type="number" min={1} max={4000} value={q.maxLength ?? ''} onChange={(e) => patch(i, { maxLength: e.target.value === '' ? undefined : Math.max(1, Math.floor(Number(e.target.value))) })} />}</Field>
          </div>}
          <Check label="Pflichtfeld" checked={q.required} onChange={(v) => patch(i, { required: v })} />
        </div>
      ))}
      <div><Button size="sm" variant="secondary" disabled={value.length >= 25} onClick={() => onChange([...value, { id: `q${Date.now().toString(36)}`, label: '', type: 'SHORT', required: true, options: [] }])}>Frage hinzufügen</Button></div>
    </div>
  );
}
function OptionsText({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [t, setT] = useState(value.join('\n'));
  return <Field label="Optionen – eine pro Zeile (mind. 2, max. 25)">{(id) => <Textarea id={id} rows={4} value={t} onChange={(e) => setT(e.target.value)} onBlur={() => onChange(t.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 25))} />}</Field>;
}

function ButtonsEditor({ value, onChange }: { value: TicketCategoryCfg['buttons']; onChange: (v: TicketCategoryCfg['buttons']) => void }) {
  const patch = (i: number, p: Partial<TicketCategoryCfg['buttons'][number]>) => onChange(value.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const missing = (Object.keys(TICKET_ACTIONS) as TicketAction[]).filter((a) => !value.some((b) => b.action === a));
  const [add, setAdd] = useState<string>('');
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted">Jeder Button braucht sein eigenes Recht (ticket.*). Buttons erscheinen nur, wenn sie sinnvoll sind (z. B. „Wieder öffnen“ nur bei geschlossenen Tickets).</p>
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

// =============================== Status, Prioritäten, Gründe ===============================
function States({ c }: { c: TicketConfig }) {
  return (
    <>
      <ListEditor<TicketStatusCfg> title="Status" items={c.statuses} path="statuses" blank={{ name: '', emoji: '', color: 0x3b82f6, position: c.statuses.length, kind: 'OPEN', isDefault: false, isClaimed: false, isEscalation: false, isClose: false }}
        hint="Jede Markierung gilt für genau einen Status (Setzen verschiebt sie): Standard = neue/wieder geöffnete Tickets, Übernommen = bei Übernahme, Eskalation = bei Eskalation, Schließen = beim Schließen."
        render={(s, set) => (
          <>
            <div className="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)_150px_120px]">
              <Field label="Emoji">{(id) => <Input id={id} value={s.emoji} maxLength={64} onChange={(e) => set({ emoji: e.target.value })} />}</Field>
              <Field label="Name">{(id) => <Input id={id} value={s.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <Field label="Art">{(id) => <Select id={id} value={s.kind} onChange={(e) => set({ kind: e.target.value as TicketStatusCfg['kind'] })}>{Object.entries(STATUS_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
              <Num label="Reihenfolge" value={s.position} max={1000} onChange={(v) => set({ position: v })} />
            </div>
            <Color label="Farbe" value={s.color} onChange={(v) => set({ color: v })} />
            <div className="flex flex-wrap gap-4">
              <Check label="Standard" checked={s.isDefault} onChange={(v) => set({ isDefault: v })} /><Check label="Übernommen" checked={s.isClaimed} onChange={(v) => set({ isClaimed: v })} />
              <Check label="Eskalation" checked={s.isEscalation} onChange={(v) => set({ isEscalation: v })} /><Check label="Schließen" checked={s.isClose} onChange={(v) => set({ isClose: v })} />
            </div>
          </>
        )}
        summary={(s) => <span>{label(s)} <span className="text-xs text-muted">· {STATUS_KINDS[s.kind]}{s.isDefault ? ' · Standard' : ''}{s.isClaimed ? ' · Übernommen' : ''}{s.isEscalation ? ' · Eskalation' : ''}{s.isClose ? ' · Schließen' : ''}</span></span>}
      />
      <ListEditor<TicketPriorityCfg> title="Prioritäten" items={c.priorities} path="priorities" blank={{ name: '', emoji: '', color: 0xf59e0b, position: c.priorities.length, isDefault: false, allowedRoleNames: [], notifyRoleIds: [] }}
        render={(p, set) => (
          <>
            <div className="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)_120px]">
              <Field label="Emoji">{(id) => <Input id={id} value={p.emoji} maxLength={64} onChange={(e) => set({ emoji: e.target.value })} />}</Field>
              <Field label="Name">{(id) => <Input id={id} value={p.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />}</Field>
              <Num label="Reihenfolge" value={p.position} max={1000} onChange={(v) => set({ position: v })} />
            </div>
            <Color label="Farbe (auch die Embed-Farbe des Tickets)" value={p.color} onChange={(v) => set({ color: v })} />
            <Names label="Setzbar durch Systemrollen (leer = alle mit ticket.change_priority)" value={p.allowedRoleNames} onChange={(v) => set({ allowedRoleNames: v })} />
            <Roles label="Discord-Rollen beim Setzen benachrichtigen" value={p.notifyRoleIds} onChange={(v) => set({ notifyRoleIds: v })} />
            <Check label="Standard für neue Tickets" checked={p.isDefault} onChange={(v) => set({ isDefault: v })} />
          </>
        )}
        summary={(p) => <span>{label(p)}{p.isDefault && <span className="text-xs text-muted"> · Standard</span>}</span>}
      />
      <ListEditor<TicketReasonCfg> title="Feste Schließungsgründe" items={c.reasons} path="reasons" blank={{ text: '', position: c.reasons.length }}
        render={(r, set) => (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
            <Field label="Grund">{(id) => <Input id={id} value={r.text} maxLength={200} onChange={(e) => set({ text: e.target.value })} />}</Field>
            <Num label="Reihenfolge" value={r.position} max={1000} onChange={(v) => set({ position: v })} />
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
  useTicketAutosaveSync();
  useAutosaveDraft(edit?.id ? `ticket:${path}:${edit.id}` : null, edit?.v, (v) => ({ method: 'PUT', path: `/support-tickets/${path}/${edit!.id}`, body: clean(v as object), label: title }));
  return (
    <Card title={title} actions={!edit && <Button size="sm" onClick={() => setEdit({ v: blank })}>Hinzufügen</Button>}>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <Err error={remove.error} />
      {edit && (
        <div className="mb-3 grid gap-2 rounded-md border border-primary/40 p-3">
          {render(edit.v, (p) => setEdit({ ...edit, v: { ...edit.v, ...p } }))}
          <Err error={save.error} />
          <div className="flex gap-2">{edit.id ? <Button size="sm" onClick={() => void flush().then(() => setEdit(undefined))}>Fertig (automatisch gespeichert)</Button> : <><Button size="sm" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Hinzufügen</Button><Button size="sm" variant="secondary" onClick={() => setEdit(undefined)}>Abbrechen</Button></>}</div>
        </div>
      )}
      {!items.length ? <p className="text-sm text-muted">Noch keine Einträge.</p> : (
        <ul className="divide-y divide-line">{items.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
            {summary(x)}
            <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => { const { id, ...v } = x; setEdit({ id, v: v as Omit<T, 'id'> }); }}>Bearbeiten</Button><Button size="sm" variant="ghost" onClick={() => setDel(x)}>Löschen</Button></span>
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={!!del} danger title={`Aus „${title}“ löschen?`} message="Einträge, die noch von Tickets verwendet werden, können nicht gelöscht werden." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </Card>
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
            <Num label="Transkripte löschen nach (Tagen, 0 = für immer behalten)" value={s.transcriptRetentionDays} max={3650} onChange={(v) => set({ transcriptRetentionDays: v })} />
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

function Placeholders() {
  return (
    <Card title="Platzhalter (in allen Ticket-Texten und im Kanalnamen nutzbar)">
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{Object.entries(TICKET_PLACEHOLDERS).map(([k, v]) => <div key={k} className="flex gap-2"><dt><code className="rounded bg-panel-2 px-1">{k}</code></dt><dd className="text-muted">{v}</dd></div>)}</dl>
    </Card>
  );
}
