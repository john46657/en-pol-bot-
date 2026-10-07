import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Toggle } from '../../components/ApplicationSettings';
import { ChannelPicker } from '../../components/DiscordPickers';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../../components/ui';

// ───────────── Typen ─────────────

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
type Priority = (typeof PRIORITIES)[number];
const PRIO: Record<Priority, { label: string; emoji: string; tone: Tone; rank: number; border: string }> = {
  LOW: { label: 'Niedrig', emoji: '🔵', tone: 'info', rank: 3, border: 'border-l-info' },
  NORMAL: { label: 'Normal', emoji: '📢', tone: 'neutral', rank: 2, border: 'border-l-line' },
  HIGH: { label: 'Hoch', emoji: '🟠', tone: 'warning', rank: 1, border: 'border-l-warning' },
  CRITICAL: { label: 'Kritisch', emoji: '🔴', tone: 'danger', rank: 0, border: 'border-l-danger' },
};
const prio = (p: string) => PRIO[p as Priority] ?? PRIO.NORMAL;

interface Announcement {
  id: string; title: string; body: string; priority: string; audienceRoleIds: string[]; publishAt: string; expiresAt: string | null; requireAck: boolean; discordChannelId: string | null;
  attachments: string[]; createdById: string; createdAt: string; updatedAt: string; author: string; readAt: string | null; readCount: number; audienceCount: number | null;
}
interface AnnouncementInput { title: string; body: string; priority: Priority; audienceRoleIds: string[]; publishAt?: string; expiresAt: string | null; requireAck: boolean; discordChannelId: string | null }
interface Readers { total: number; read: number; people: { userId: string; name: string; readAt: string | null }[] }

const SHOW_RESULTS = ['ALWAYS', 'AFTER_VOTE', 'AFTER_END', 'NEVER'] as const;
type ShowResults = (typeof SHOW_RESULTS)[number];
const SHOW_RESULTS_LABEL: Record<ShowResults, string> = { ALWAYS: 'immer', AFTER_VOTE: 'nach Abstimmung', AFTER_END: 'nach Ende', NEVER: 'nie (nur Verwalter)' };
interface Poll {
  id: string; title: string; description: string | null; options: { id: string; label: string }[]; audienceRoleIds: string[]; startsAt: string; endsAt: string | null; anonymous: boolean;
  multiple: boolean; showResults: ShowResults; createdById: string; createdAt: string; updatedAt: string; ended: boolean; open: boolean; myVote: string[] | null; totalVotes: number; canManage: boolean;
  results: { id: string; label: string; count: number; voters: string[] | null }[] | null;
}
interface PollInput { title: string; description: string | null; options: string[]; audienceRoleIds: string[]; startsAt?: string; endsAt: string | null; anonymous: boolean; multiple: boolean; showResults: ShowResults }
interface Role { id: string; name: string }

// ───────────── Hilfen ─────────────

/** ISO → Wert für `datetime-local` (lokale Zeit). */
const toLocal = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
/** `datetime-local` → ISO mit Zeitzone. */
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

const L = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-muted">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
);
const Switch = ({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) => (
  <div className={`flex items-start gap-2 text-sm ${disabled ? 'pointer-events-none opacity-50' : ''}`}><Toggle label={label} checked={checked} onChange={onChange} /><div><div>{label}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div></div>
);

function useRoles() {
  const { can } = useAuth();
  return useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles'), enabled: can('roles.view'), staleTime: 60_000 });
}
/** Zielgruppe: Dashboard-Rollen (leer = alle). */
function AudiencePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const roles = useRoles();
  const list = roles.data ?? [];
  const name = (id: string) => list.find((r) => r.id === id)?.name ?? `${id.slice(0, 8)}…`;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1">
        {!value.length && <Badge tone="primary">Alle</Badge>}
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-0.5 text-xs">
            {name(id)}
            <button type="button" aria-label={`${name(id)} entfernen`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>
          </span>
        ))}
      </div>
      <Select aria-label="Rolle zur Zielgruppe hinzufügen" value="" disabled={value.length >= 30 || !list.length} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}>
        <option value="">+ Rolle hinzufügen …</option>
        {list.filter((r) => !value.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
      {!list.length && !roles.isLoading && <span className="text-xs text-muted">Rollenliste nicht verfügbar – die Meldung geht an alle.</span>}
    </div>
  );
}

// ───────────── Seite ─────────────

export function HrComms() {
  const { can } = useAuth();
  const tabs = [...(can('announcements.view') ? ['Meldungen'] : []), ...(can('polls.view') ? ['Abstimmungen'] : [])];
  const [tab, setTab] = useState(tabs[0] ?? 'Meldungen');
  return (
    <div>
      <PageHeader title="📢 Meldungen & Abstimmungen" subtitle="Interne Mitteilungen mit Lesebestätigung und Abstimmungen im Team" />
      {tabs.length > 1 && <div className="mb-4"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>}
      {!tabs.length && <EmptyState text="Keine Berechtigung" hint="Du hast keinen Zugriff auf Meldungen oder Abstimmungen." />}
      {tab === 'Meldungen' && can('announcements.view') && <AnnouncementsTab />}
      {tab === 'Abstimmungen' && can('polls.view') && <PollsTab />}
    </div>
  );
}

// ───────────── Meldungen ─────────────

function AnnouncementsTab() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const manage = can('announcements.manage');
  const [all, setAll] = useState(false);
  const [edit, setEdit] = useState<Announcement | 'new' | null>(null);
  const [readers, setReaders] = useState<Announcement | null>(null);
  const [err, setErr] = useState<string>();
  const q = useQuery({ queryKey: ['hr-announcements', manage && all], queryFn: () => api<Announcement[]>('/hr/announcements', { query: { all: manage && all ? 1 : undefined } }) });
  const ack = useMutation({
    mutationFn: (id: string) => api(`/hr/announcements/${id}/ack`, { method: 'POST' }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['hr-announcements'] }); },
    onError: (e) => setErr(errText(e)),
  });
  const list = useMemo(() => [...(q.data ?? [])].sort((a, b) => prio(a.priority).rank - prio(b.priority).rank || b.publishAt.localeCompare(a.publishAt)), [q.data]);
  const now = Date.now();
  const canEdit = (a: Announcement) => can('announcements.create') && (manage || a.createdById === user?.id);
  return (
    <Card title={`Meldungen (${list.length})`} actions={
      <div className="flex flex-wrap items-center gap-3">
        {manage && <div className="flex items-center gap-2 text-xs"><Toggle label="Auch geplante und abgelaufene Meldungen zeigen" checked={all} onChange={setAll} /><span>auch geplante/abgelaufene</span></div>}
        {can('announcements.create') && <Button size="sm" onClick={() => setEdit('new')}><Plus size={14} />Neue Meldung</Button>}
      </div>
    }>
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !list.length ? <EmptyState text="Keine aktuellen Meldungen" /> : (
        <ul className="grid gap-3">
          {list.map((a) => {
            const p = prio(a.priority);
            const planned = new Date(a.publishAt).getTime() > now;
            const expired = !!a.expiresAt && new Date(a.expiresAt).getTime() <= now;
            const mine = canEdit(a);
            return (
              <li key={a.id} className={`rounded-md border border-l-4 border-line bg-panel-2 p-4 ${p.border} ${a.requireAck && !a.readAt ? 'ring-1 ring-warning/40' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1">
                      <Badge tone={p.tone} icon={p.emoji}>{p.label}</Badge>
                      {planned && <Badge tone="info" icon="🕒">geplant</Badge>}
                      {expired && <Badge icon="⌛">abgelaufen</Badge>}
                      {a.requireAck && (a.readAt ? <Badge tone="success" icon="✓">gelesen</Badge> : <Badge tone="warning">Bestätigung nötig</Badge>)}
                    </div>
                    <h3 className="text-base font-semibold">{a.title}</h3>
                  </div>
                  {mine && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" aria-label={`${a.title} bearbeiten`} onClick={() => setEdit(a)}><Pencil size={14} /></Button>
                    </div>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>von {a.author} · {fmt(a.publishAt)}{a.expiresAt && ` · gültig bis ${fmt(a.expiresAt)}`}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {mine && a.requireAck && (
                      <button type="button" className="inline-flex items-center gap-1 hover:text-fg hover:underline" onClick={() => setReaders(a)} aria-label={`Lesebestätigungen für ${a.title} anzeigen`}>
                        <Users size={13} aria-hidden />
                        {a.audienceCount != null ? `${a.readCount} von ${a.audienceCount} Mitarbeitern haben die Meldung gelesen.` : `${a.readCount} Mitarbeiter haben die Meldung gelesen.`}
                      </button>
                    )}
                    {a.requireAck && !a.readAt && !planned && <Button size="sm" disabled={ack.isPending} onClick={() => ack.mutate(a.id)}><CheckCircle2 size={14} />Gelesen bestätigen</Button>}
                    {a.requireAck && a.readAt && <span>✓ bestätigt am {fmt(a.readAt)}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <AnnouncementEditor value={edit} onClose={() => setEdit(null)} />}
      {readers && <ReadersModal a={readers} onClose={() => setReaders(null)} />}
    </Card>
  );
}

function ReadersModal({ a, onClose }: { a: Announcement; onClose: () => void }) {
  const q = useQuery({ queryKey: ['hr-announcements', a.id, 'readers'], queryFn: () => api<Readers>(`/hr/announcements/${a.id}/readers`) });
  const [showRead, setShowRead] = useState(false);
  const d = q.data;
  const missing = d?.people.filter((p) => !p.readAt) ?? [];
  const read = d?.people.filter((p) => p.readAt) ?? [];
  return (
    <Modal open title={`Lesebestätigungen: ${a.title}`} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : d && (
        <div className="grid gap-3 text-sm">
          <p>{d.read} von {d.total} Mitarbeitern haben die Meldung gelesen.</p>
          <div role="progressbar" aria-label="Anteil gelesen" aria-valuenow={d.read} aria-valuemin={0} aria-valuemax={d.total} className="h-2 overflow-hidden rounded bg-line">
            <div className="h-full bg-success" style={{ width: `${d.total ? Math.round((d.read / d.total) * 100) : 0}%` }} />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Noch nicht bestätigt ({missing.length})</h3>
            {!missing.length ? <p className="text-success">🎉 Alle haben bestätigt.</p> : <ul className="grid max-h-64 gap-1 overflow-auto">{missing.map((p) => <li key={p.userId} className="rounded border border-line px-2 py-1">{p.name}</li>)}</ul>}
          </div>
          {read.length > 0 && (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setShowRead(!showRead)} aria-expanded={showRead}>{showRead ? 'Gelesen ausblenden' : `Gelesen anzeigen (${read.length})`}</Button>
              {showRead && <ul className="mt-1 grid max-h-64 gap-1 overflow-auto">{read.map((p) => <li key={p.userId} className="flex justify-between rounded border border-line px-2 py-1"><span>{p.name}</span><span className="text-xs text-muted">{fmt(p.readAt)}</span></li>)}</ul>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function AnnouncementEditor({ value, onClose }: { value: Announcement | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = value === 'new';
  const [d, setD] = useState(() => value === 'new'
    ? { title: '', body: '', priority: 'NORMAL' as Priority, audienceRoleIds: [] as string[], publishAt: '', expiresAt: '', requireAck: false, discordChannelId: null as string | null }
    : { title: value.title, body: value.body, priority: (PRIORITIES.includes(value.priority as Priority) ? value.priority : 'NORMAL') as Priority, audienceRoleIds: value.audienceRoleIds, publishAt: toLocal(value.publishAt), expiresAt: toLocal(value.expiresAt), requireAck: value.requireAck, discordChannelId: value.discordChannelId });
  const [err, setErr] = useState<string>();
  const [del, setDel] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const invalidRange = !!d.publishAt && !!d.expiresAt && new Date(d.expiresAt) <= new Date(d.publishAt);
  const save = useMutation({
    mutationFn: () => {
      const body: AnnouncementInput = { title: d.title.trim(), body: d.body.trim(), priority: d.priority, audienceRoleIds: d.audienceRoleIds, publishAt: fromLocal(d.publishAt), expiresAt: fromLocal(d.expiresAt) ?? null, requireAck: d.requireAck, discordChannelId: d.discordChannelId };
      return isNew ? api('/hr/announcements', { method: 'POST', body }) : api(`/hr/announcements/${value.id}`, { method: 'PUT', body });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-announcements'] }); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/hr/announcements/${isNew ? '' : value.id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-announcements'] }); onClose(); },
    onError: (e) => { setDel(false); setErr(errText(e)); },
  });
  const ok = !!d.title.trim() && !!d.body.trim() && !invalidRange;
  return (
    <Modal open wide title={isNew ? 'Neue Meldung' : 'Meldung bearbeiten'} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <L label="Titel *"><Input aria-label="Titel" maxLength={200} value={d.title} onChange={(e) => set({ title: e.target.value })} /></L>
          <L label="Priorität">
            <Select aria-label="Priorität" value={d.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIO[p].emoji} {PRIO[p].label}</option>)}
            </Select>
          </L>
        </div>
        <L label="Text *"><Textarea aria-label="Text" rows={8} maxLength={8000} value={d.body} onChange={(e) => set({ body: e.target.value })} /></L>
        <L label="Zielgruppe (Dashboard-Rollen)" hint="Leer = alle Mitarbeiter"><AudiencePicker value={d.audienceRoleIds} onChange={(v) => set({ audienceRoleIds: v })} /></L>
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="Veröffentlichen ab" hint="Leer = sofort"><Input aria-label="Veröffentlichen ab" type="datetime-local" value={d.publishAt} onChange={(e) => set({ publishAt: e.target.value })} /></L>
          <L label="Gültig bis" hint="Leer = unbegrenzt"><Input aria-label="Gültig bis" type="datetime-local" value={d.expiresAt} onChange={(e) => set({ expiresAt: e.target.value })} /></L>
        </div>
        {invalidRange && <p role="alert" className="text-xs text-danger">„Gültig bis“ muss nach „Veröffentlichen ab“ liegen.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Switch label="Lesebestätigung erforderlich" checked={d.requireAck} onChange={(v) => set({ requireAck: v })} hint="Mitarbeiter müssen „Gelesen“ bestätigen" />
          <L label="Discord-Kanal (optional)" hint={isNew ? 'Die Meldung wird beim Erstellen dort gepostet.' : 'Wird nur beim Erstellen gepostet.'}><ChannelPicker ariaLabel="Discord-Kanal" value={d.discordChannelId} onChange={(v) => set({ discordChannelId: v })} /></L>
        </div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-3">
          <Button type="submit" disabled={!ok || save.isPending}>{isNew ? 'Veröffentlichen' : 'Speichern'}</Button>
          <div className="flex gap-2">
            {!isNew && <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} />Löschen</Button>}
            <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
          </div>
        </div>
      </form>
      <ConfirmDialog open={del} danger title="Meldung löschen?" message="Die Meldung und alle Lesebestätigungen werden gelöscht." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDel(false)} />
    </Modal>
  );
}

// ───────────── Abstimmungen ─────────────

function PollsTab() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['hr-polls'], queryFn: () => api<Poll[]>('/hr/polls') });
  const [edit, setEdit] = useState<Poll | 'new' | null>(null);
  const list = q.data ?? [];
  return (
    <Card title={`Abstimmungen (${list.length})`} actions={can('polls.create') && <Button size="sm" onClick={() => setEdit('new')}><Plus size={14} />Neue Abstimmung</Button>}>
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !list.length ? <EmptyState text="Keine Abstimmungen" /> : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((p) => <li key={p.id}><PollCard p={p} onEdit={() => setEdit(p)} /></li>)}
        </ul>
      )}
      {edit && <PollEditor value={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function PollCard({ p, onEdit }: { p: Poll; onEdit: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [changing, setChanging] = useState(false);
  const [sel, setSel] = useState<string[]>(p.myVote ?? []);
  const [err, setErr] = useState<string>();
  const vote = useMutation({
    mutationFn: () => api(`/hr/polls/${p.id}/vote`, { method: 'POST', body: { optionIds: sel } }),
    onSuccess: () => { setErr(undefined); setChanging(false); void qc.invalidateQueries({ queryKey: ['hr-polls'] }); },
    onError: (e) => setErr(errText(e)),
  });
  const planned = !p.open && !p.ended;
  const showVote = p.open && (!p.myVote || changing);
  const name = `poll-${p.id}`;
  const total = p.totalVotes;
  return (
    <article className="grid h-full gap-3 rounded-md border border-line bg-panel-2 p-4" aria-label={`Abstimmung: ${p.title}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap gap-1">
            {p.open ? <Badge tone="success" icon="🟢">offen</Badge> : p.ended ? <Badge icon="⚫">beendet</Badge> : <Badge tone="info" icon="🕒">geplant</Badge>}
            {p.anonymous && <Badge icon="🕶️">anonym</Badge>}
            {p.multiple && <Badge tone="primary">Mehrfachauswahl</Badge>}
            {p.myVote && <Badge tone="success" icon="✓">abgestimmt</Badge>}
          </div>
          <h3 className="text-base font-semibold">🗳️ {p.title}</h3>
          {p.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{p.description}</p>}
        </div>
        {p.canManage && can('polls.create') && <Button size="sm" variant="ghost" aria-label={`${p.title} bearbeiten`} onClick={onEdit}><Pencil size={14} /></Button>}
      </div>
      <p className="text-xs text-muted">
        {planned ? `Beginnt ${fmt(p.startsAt)}` : `Seit ${fmt(p.startsAt)}`}{p.endsAt && ` · ${p.ended ? 'endete' : 'endet'} ${fmt(p.endsAt)}`} · {total} {total === 1 ? 'Stimme' : 'Stimmen'}
      </p>
      {showVote && (
        <form className="grid gap-1.5" onSubmit={(e) => { e.preventDefault(); if (sel.length) vote.mutate(); }}>
          <fieldset className="grid gap-1.5">
            <legend className="sr-only">{p.multiple ? 'Antworten wählen' : 'Antwort wählen'}</legend>
            {p.options.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded border border-line bg-panel px-3 py-2 text-sm hover:border-primary">
                {p.multiple
                  ? <input type="checkbox" checked={sel.includes(o.id)} onChange={(e) => setSel(e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id))} />
                  : <input type="radio" name={name} checked={sel[0] === o.id} onChange={() => setSel([o.id])} />}
                {o.label}
              </label>
            ))}
          </fieldset>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!sel.length || vote.isPending}>{p.myVote ? 'Stimme ändern' : 'Abstimmen'}</Button>
            {changing && <Button size="sm" variant="ghost" onClick={() => { setChanging(false); setSel(p.myVote ?? []); }}>Abbrechen</Button>}
          </div>
        </form>
      )}
      {!showVote && p.results && (
        <ul className="grid gap-2" aria-label="Ergebnisse">
          {[...p.results].sort((a, b) => b.count - a.count).map((r) => {
            const pc = total ? Math.round((r.count / total) * 100) : 0;
            const mine = p.myVote?.includes(r.id);
            return (
              <li key={r.id} className="grid gap-1 text-sm">
                <div className="flex justify-between gap-2"><span className={mine ? 'font-semibold' : undefined}>{mine && '✓ '}{r.label}</span><span className="whitespace-nowrap text-muted">{r.count} · {pc} %</span></div>
                <div role="progressbar" aria-label={r.label} aria-valuenow={pc} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded bg-line"><div className={`h-full ${mine ? 'bg-primary' : 'bg-muted/60'}`} style={{ width: `${pc}%` }} /></div>
                {r.voters && r.voters.length > 0 && <p className="text-xs text-muted">{r.voters.join(', ')}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {!showVote && !p.results && (
        <p className="text-sm text-muted">
          {p.myVote ? `Deine Stimme: ${p.options.filter((o) => p.myVote?.includes(o.id)).map((o) => o.label).join(', ')}. ` : ''}
          {p.showResults === 'NEVER' ? 'Ergebnisse sind nur für Verwalter sichtbar.' : p.showResults === 'AFTER_END' ? 'Ergebnisse werden nach dem Ende angezeigt.' : p.showResults === 'AFTER_VOTE' && !p.myVote ? 'Ergebnisse siehst du nach deiner Stimmabgabe.' : ''}
          {planned && 'Die Abstimmung hat noch nicht begonnen.'}
        </p>
      )}
      {p.open && p.myVote && !changing && <div><Button size="sm" variant="secondary" onClick={() => { setSel(p.myVote ?? []); setChanging(true); }}>Stimme ändern</Button></div>}
    </article>
  );
}

function PollEditor({ value, onClose }: { value: Poll | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = value === 'new';
  const hasVotes = !isNew && value.totalVotes > 0;
  const [d, setD] = useState(() => value === 'new'
    ? { title: '', description: '', options: ['', ''], audienceRoleIds: [] as string[], startsAt: '', endsAt: '', anonymous: false, multiple: false, showResults: 'AFTER_VOTE' as ShowResults }
    : { title: value.title, description: value.description ?? '', options: value.options.map((o) => o.label), audienceRoleIds: value.audienceRoleIds, startsAt: toLocal(value.startsAt), endsAt: toLocal(value.endsAt), anonymous: value.anonymous, multiple: value.multiple, showResults: value.showResults });
  const [err, setErr] = useState<string>();
  const [del, setDel] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const setOpt = (i: number, v: string) => set({ options: d.options.map((o, j) => (j === i ? v : o)) });
  const moveOpt = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= d.options.length) return; const n = [...d.options]; [n[i], n[j]] = [n[j]!, n[i]!]; set({ options: n }); };
  const invalidRange = !!d.startsAt && !!d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt);
  const ok = !!d.title.trim() && d.options.length >= 2 && d.options.every((o) => o.trim()) && !invalidRange;
  const save = useMutation({
    mutationFn: () => {
      const body: PollInput = { title: d.title.trim(), description: d.description.trim() || null, options: d.options.map((o) => o.trim()), audienceRoleIds: d.audienceRoleIds, startsAt: fromLocal(d.startsAt), endsAt: fromLocal(d.endsAt) ?? null, anonymous: d.anonymous, multiple: d.multiple, showResults: d.showResults };
      return isNew ? api('/hr/polls', { method: 'POST', body }) : api(`/hr/polls/${value.id}`, { method: 'PUT', body });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-polls'] }); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/hr/polls/${isNew ? '' : value.id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-polls'] }); onClose(); },
    onError: (e) => { setDel(false); setErr(errText(e)); },
  });
  return (
    <Modal open wide title={isNew ? 'Neue Abstimmung' : 'Abstimmung bearbeiten'} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate(); }}>
        <L label="Titel / Frage *"><Input aria-label="Titel" maxLength={200} value={d.title} onChange={(e) => set({ title: e.target.value })} /></L>
        <L label="Beschreibung"><Textarea aria-label="Beschreibung" rows={3} maxLength={4000} value={d.description} onChange={(e) => set({ description: e.target.value })} /></L>
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted">Antworten * (2–20)</span>
          {d.options.map((o, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input aria-label={`Antwort ${i + 1}`} className="py-1" maxLength={200} value={o} onChange={(e) => setOpt(i, e.target.value)} />
              <Button size="sm" variant="ghost" aria-label={`Antwort ${i + 1} nach oben`} disabled={i === 0 || hasVotes} onClick={() => moveOpt(i, -1)}><ArrowUp size={14} /></Button>
              <Button size="sm" variant="ghost" aria-label={`Antwort ${i + 1} nach unten`} disabled={i === d.options.length - 1 || hasVotes} onClick={() => moveOpt(i, 1)}><ArrowDown size={14} /></Button>
              <Button size="sm" variant="ghost" aria-label={`Antwort ${i + 1} entfernen`} disabled={d.options.length <= 2 || hasVotes} onClick={() => set({ options: d.options.filter((_, j) => j !== i) })}><X size={14} /></Button>
            </div>
          ))}
          {hasVotes ? <p className="text-xs text-muted">Es gibt schon Stimmen – Antworten können nur noch umbenannt werden.</p> : d.options.length < 20 && <div><Button size="sm" variant="ghost" onClick={() => set({ options: [...d.options, ''] })}><Plus size={14} />Antwort hinzufügen</Button></div>}
        </div>
        <L label="Zielgruppe (Dashboard-Rollen)" hint="Leer = alle Mitarbeiter"><AudiencePicker value={d.audienceRoleIds} onChange={(v) => set({ audienceRoleIds: v })} /></L>
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="Beginn" hint="Leer = sofort"><Input aria-label="Beginn" type="datetime-local" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></L>
          <L label="Ende" hint="Leer = ohne Ende"><Input aria-label="Ende" type="datetime-local" value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></L>
        </div>
        {invalidRange && <p role="alert" className="text-xs text-danger">Das Ende muss nach dem Beginn liegen.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Switch label="Anonym" checked={d.anonymous} disabled={hasVotes} onChange={(v) => set({ anonymous: v })} hint={hasVotes ? 'Nach den ersten Stimmen nicht mehr änderbar' : 'Namen der Abstimmenden verbergen'} />
          <Switch label="Mehrfachauswahl" checked={d.multiple} onChange={(v) => set({ multiple: v })} />
          <L label="Ergebnisse anzeigen">
            <Select aria-label="Ergebnisse anzeigen" value={d.showResults} onChange={(e) => set({ showResults: e.target.value as ShowResults })}>
              {SHOW_RESULTS.map((s) => <option key={s} value={s}>{SHOW_RESULTS_LABEL[s]}</option>)}
            </Select>
          </L>
        </div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-3">
          <Button type="submit" disabled={!ok || save.isPending}>{isNew ? 'Erstellen' : 'Speichern'}</Button>
          <div className="flex gap-2">
            {!isNew && <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} />Löschen</Button>}
            <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
          </div>
        </div>
      </form>
      <ConfirmDialog open={del} danger title="Abstimmung löschen?" message="Die Abstimmung und alle Stimmen werden gelöscht." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDel(false)} />
    </Modal>
  );
}
