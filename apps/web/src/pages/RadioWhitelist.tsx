import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RADIO_GRANT_SOURCE_LABEL, RADIO_GRANT_STATUS_LABEL, type RadioGrantSource, type RadioGrantStatus, type RadioRoleRules } from '@enrp/shared';
import { Download, Plus, RefreshCw, Search, Upload } from 'lucide-react';
import { api, apiHeaders, ApiError, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../components/ui';
import { ChannelPicker, RolePicker } from '../components/DiscordPickers';

// ---------- Typen (Antworten der API) ----------
interface Grant {
  id: string; discordId: string | null; discordName: string | null; userId: string | null; userName: string | null; rank: string | null; department: string | null;
  externalName: string | null; status: string; effectiveStatus: RadioGrantStatus; authorized: boolean; source: RadioGrantSource; reason: string | null;
  expiresAt: string | null; suspendedUntil: string | null; suspendReason: string | null; roleRevoked: boolean; grantedAt: string | null; grantedByName: string | null;
  archivedAt: string | null; externalStatus: string; externalSyncedAt: string | null; externalError: string | null; version: number; createdAt: string; updatedAt: string;
}
interface HistoryEntry { id: string; action: string; reason: string | null; createdAt: string; actorName: string; result: string }
interface RequestRow { id: string; discordId: string; discordName: string | null; rank: string | null; department: string | null; reason: string; answers: { key: string; label: string; value: string }[] | null; status: string; createdAt: string; decidedAt: string | null; decidedByName: string | null; decisionReason: string | null; grantExpiresAt: string | null }
interface GrantDetail extends Grant { history: HistoryEntry[]; requests: RequestRow[] }
interface Summary { active: number; suspended: number; expired: number; pending: number; disabled: number; revoked: number; openRequests: number; manualTodo: number }
interface FormField { key: string; label: string; placeholder: string; paragraph: boolean; required: boolean; maxLength: number }
interface RequestForm { title: string; fields: FormField[] }
interface RequestPanel { channelId: string | null; title: string; text: string; buttonLabel: string; color: string }
interface Config { roleSync: RadioRoleRules; radioRoleIds: string[]; requests: { enabled: boolean; preventDuplicates: boolean; notifyChannelId: string | null; approveRoleIds?: string[]; panel: RequestPanel; form: RequestForm }; notifyMembers: boolean }
interface Provider { key: string; name: string; apiSupported: boolean; note: string; verified?: string }
interface Integration {
  provider: string; displayName: string; network: string | null; channel: string | null; endpoint: string | null; adminUsername: string | null; hasPassword: boolean; hasApiKey: boolean;
  autoSync: boolean; status: string; apiSupported: boolean; lastTestAt: string | null; lastSuccessAt: string | null; lastSyncAt: string | null; lastSyncStatus: string | null; lastError: string | null; version: number; providers: Provider[];
}
interface RoleSyncStatus { last?: { at: string; ok: boolean; checked: number; changed: number; failed: number; errors: string[]; full: boolean }; lastSuccessAt?: string; lastErrorAt?: string }
interface LogRow { id: string; action: string; entityType: string | null; entityId: string | null; reason: string | null; result: string; createdAt: string; actorName: string; after: unknown }
interface ImportReport { created: number; updated: number; unchanged: number; errors: { line: number; message: string }[]; dryRun: boolean }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Das hat nicht geklappt. Bitte erneut versuchen.');
const STATUS_TONE: Record<RadioGrantStatus, Tone> = { ACTIVE: 'success', PENDING: 'info', SUSPENDED: 'danger', EXPIRED: 'warning', DISABLED: 'neutral', REVOKED: 'neutral' };
const STATUS_ICON: Record<RadioGrantStatus, string> = { ACTIVE: '🟢', PENDING: '🕓', SUSPENDED: '⛔', EXPIRED: '⌛', DISABLED: '⏸️', REVOKED: '📦' };
const EXT_LABEL: Record<string, [string, Tone]> = { NONE: ['—', 'neutral'], PENDING: ['wartet auf Abgleich', 'info'], SYNCED: ['synchron', 'success'], FAILED: ['Fehler', 'danger'], MANUAL: ['manuell erledigen', 'warning'], MANUAL_DONE: ['manuell erledigt', 'success'] };
const FILTERS: [string, string][] = [['open', 'Alle aktuellen'], ['active', 'Aktiv'], ['pending', 'Ausstehend'], ['suspended', 'Gesperrt'], ['expired', 'Abgelaufen'], ['disabled', 'Deaktiviert'], ['revoked', 'Entzogen (Archiv)'], ['all', 'Alle inkl. Archiv']];
const ACTION_LABEL: Record<string, string> = {
  'radio.grant.created': 'Freigabe erteilt', 'radio.grant.restored': 'Erneut freigeschaltet', 'radio.grant.updated': 'Angaben geändert', 'radio.grant.activated': 'Aktiviert',
  'radio.grant.deactivated': 'Deaktiviert', 'radio.grant.extended': 'Verlängert/Ablauf geändert', 'radio.grant.suspended': 'Gesperrt', 'radio.grant.unsuspended': 'Sperre aufgehoben',
  'radio.grant.revoked': 'Freigabe entzogen', 'radio.grant.expired': 'Abgelaufen (automatisch)', 'radio.grant.role_revoked': 'Entzogen (Rollenabgleich)', 'radio.grant.role_disabled': 'Deaktiviert (Rollenabgleich)',
  'radio.grant.role_restored': 'Wieder aktiv (Rollenabgleich)', 'radio.grant.external_done': 'Im Funkdienst erledigt', 'radio.grant.discord_id_set': 'Discord-ID nachgetragen',
  'radio.request.created': 'Antrag gestellt', 'radio.request.approved': 'Antrag genehmigt', 'radio.request.rejected': 'Antrag abgelehnt',
  'radio.config.roles': 'Rollenregeln geändert', 'radio.config.requests': 'Antragseinstellungen geändert', 'radio.integration.updated': 'Funkdienst-Einstellungen geändert',
  'radio.integration.tested': 'Verbindung getestet', 'radio.sync.success': 'Synchronisierung erfolgreich', 'radio.sync.failed': 'Synchronisierung fehlgeschlagen',
  'radio.rolesync.requested': 'Rollenabgleich angestoßen', 'radio.rolesync.completed': 'Rollenabgleich abgeschlossen', 'radio.rolesync.failed': 'Rollenabgleich: Fehler', 'radio.import': 'CSV-Import',
  'radio.add': 'Freigabe erteilt (alt)', 'radio.remove': 'Freigabe entzogen (alt)',
};
const endOfDay = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);
const DURATIONS: [string, string][] = [['', 'Unbefristet'], ['7', '7 Tage'], ['14', '14 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['date', 'Bis Datum …']];
const durationToIso = (dur: string, date: string) => (dur === 'date' ? endOfDay(date) : dur ? new Date(Date.now() + Number(dur) * 86_400_000).toISOString() : null);
const who = (g: { discordName: string | null; userName?: string | null; discordId: string | null }) => g.discordName ?? g.userName ?? g.discordId ?? 'Unbekannt';

function StatusBadge({ status }: { status: RadioGrantStatus }) {
  return <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>{RADIO_GRANT_STATUS_LABEL[status]}</Badge>;
}
function Msg({ msg }: { msg?: { ok: boolean; text: string } }) {
  return msg ? <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p> : null;
}
function DurationField({ dur, date, setDur, setDate, label = 'Gültigkeit' }: { dur: string; date: string; setDur: (v: string) => void; setDate: (v: string) => void; label?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label={label}>{(id) => <Select id={id} value={dur} onChange={(e) => setDur(e.target.value)}>{DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
      {dur === 'date' && <Field label="Gültig bis einschließlich">{(id) => <Input id={id} type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>}
    </div>
  );
}

/** 🎙️ Funk-Whitelist für den externen Funkdienst. Sichtbar nur mit radiowhitelist.view – jede Aktion prüft die API erneut. */
export function RadioWhitelist() {
  const { can } = useAuth();
  const tabs = useMemo(() => [
    'Whitelist', ...(can('radiowhitelist.requests') ? ['Anträge'] : []), 'Discord-Rollen', 'Funkdienst', 'Import & Export', ...(can('radiowhitelist.logs') ? ['Protokoll'] : []),
  ], [can]);
  const [tab, setTab] = useState('Whitelist');
  const summary = useQuery({ queryKey: ['radiowl', 'summary'], queryFn: () => api<Summary>('/radio-whitelist/summary'), refetchInterval: 60_000 });
  const s = summary.data;
  return (
    <>
      <PageHeader title="🎙️ Funk-Whitelist" subtitle="Wer für den externen Funkdienst freigeschaltet ist – eindeutig über die Discord-ID. Änderungen werden dauerhaft gespeichert und protokolliert." />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Übersicht">
        {([['Aktiv', s?.active, 'text-success'], ['Ausstehend', s?.pending, 'text-info'], ['Gesperrt', s?.suspended, 'text-danger'], ['Abgelaufen', s?.expired, 'text-warning'], ['Offene Anträge', s?.openRequests, 'text-primary'], ['Im Funkdienst zu erledigen', s?.manualTodo, 'text-warning']] as const).map(([l, v, c]) => (
          <div key={l} className="card border border-line px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">{l}</p>
            <p className={`text-2xl font-semibold tabular-nums ${c}`}>{summary.isLoading ? '…' : v ?? '—'}</p>
          </div>
        ))}
      </div>
      <Tabs tabs={tabs} active={tabs.includes(tab) ? tab : 'Whitelist'} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Whitelist' && <GrantsTab />}
        {tab === 'Anträge' && <RequestsTab />}
        {tab === 'Discord-Rollen' && <RolesTab />}
        {tab === 'Funkdienst' && <IntegrationTab />}
        {tab === 'Import & Export' && <ImportExportTab />}
        {tab === 'Protokoll' && <LogsTab />}
      </div>
    </>
  );
}

// =====================================================================================================
function GrantsTab() {
  const { can } = useAuth();
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const list = useQuery({ queryKey: ['radiowl', 'grants', status, query, page], queryFn: () => api<Page<Grant>>('/radio-whitelist/grants', { query: { status, q: query || undefined, page, pageSize: 50 } }), placeholderData: (p) => p });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  return (
    <Card title={`Freigaben${list.data ? ` (${list.data.total})` : ''}`} actions={can('radiowhitelist.grant') && <Button size="sm" onClick={() => setCreate(true)}><Plus size={14} aria-hidden /> Mitglied freischalten</Button>}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input aria-label="Suchen" className="pl-8" placeholder="Discord-ID, Name, Dienstgrad, Abteilung, Funkname …" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Status-Filter" className="sm:w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      </div>
      {list.isLoading ? <SkeletonRows rows={6} /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data?.items.length ? (
        <EmptyState text={query || status !== 'open' ? 'Keine Einträge für diese Suche/Filter.' : 'Noch niemand freigeschaltet.'} hint={can('radiowhitelist.grant') ? 'Über „Mitglied freischalten“, Anträge oder den Rollenabgleich kommen Einträge hinzu.' : undefined} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-2 py-2 font-medium">Mitglied</th><th className="hidden px-2 py-2 font-medium md:table-cell">Dienstgrad / Abteilung</th><th className="px-2 py-2 font-medium">Status</th>
                <th className="hidden px-2 py-2 font-medium sm:table-cell">Gültig bis</th><th className="hidden px-2 py-2 font-medium lg:table-cell">Funkdienst</th><th className="hidden px-2 py-2 font-medium lg:table-cell">Quelle</th><th className="px-2 py-2"><span className="sr-only">Aktionen</span></th>
              </tr></thead>
              <tbody>{list.data.items.map((g) => (
                <tr key={g.id} className={`border-b border-line/60 hover:bg-panel-2 ${g.archivedAt ? 'opacity-60' : ''}`}>
                  <td className="px-2 py-2"><button type="button" className="text-left font-medium hover:underline" onClick={() => setOpen(g.id)}>{who(g)}</button><span className="block font-mono text-xs text-muted">{g.discordId ?? '⚠️ Discord-ID fehlt'}</span></td>
                  <td className="hidden px-2 py-2 md:table-cell">{g.rank ?? '—'}<span className="block text-xs text-muted">{g.department ?? ''}</span></td>
                  <td className="px-2 py-2"><StatusBadge status={g.effectiveStatus} />{g.effectiveStatus === 'SUSPENDED' && g.suspendedUntil && <span className="block text-xs text-muted">bis {fmt(g.suspendedUntil)}</span>}</td>
                  <td className="hidden px-2 py-2 sm:table-cell">{g.expiresAt ? fmt(g.expiresAt) : <span className="text-muted">unbefristet</span>}</td>
                  <td className="hidden px-2 py-2 lg:table-cell">{g.externalName ?? <span className="text-muted">—</span>}{g.externalStatus !== 'NONE' && <span className="ml-1"><Badge tone={EXT_LABEL[g.externalStatus]?.[1] ?? 'neutral'}>{EXT_LABEL[g.externalStatus]?.[0] ?? g.externalStatus}</Badge></span>}</td>
                  <td className="hidden px-2 py-2 text-xs text-muted lg:table-cell">{RADIO_GRANT_SOURCE_LABEL[g.source] ?? g.source}</td>
                  <td className="px-2 py-2 text-right"><Button size="sm" variant="secondary" onClick={() => setOpen(g.id)}>Details</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><span className="text-muted">Seite {page} / {pages}</span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button></div>}
        </>
      )}
      {create && <CreateGrant onClose={() => setCreate(false)} onCreated={(id) => { setCreate(false); setOpen(id); }} />}
      {open && <GrantDetailModal id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['radiowl'] });
}

function CreateGrant({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const refresh = useInvalidate();
  const [f, setF] = useState({ discordId: '', discordName: '', rank: '', department: '', externalName: '', reason: '', status: 'ACTIVE' });
  const [dur, setDur] = useState(''); const [date, setDate] = useState('');
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const validId = /^\d{15,25}$/.test(f.discordId.trim());
  const m = useMutation({
    mutationFn: () => api<Grant>('/radio-whitelist/grants', { body: { discordId: f.discordId.trim(), discordName: f.discordName || null, rank: f.rank || null, department: f.department || null, externalName: f.externalName || null, reason: f.reason.trim(), status: f.status, expiresAt: durationToIso(dur, date) } }),
    onSuccess: (g) => { refresh(); onCreated(g.id); }, onError: (e) => setErr(errText(e)),
  });
  return (
    <Modal open title="Mitglied freischalten" onClose={onClose} wide>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Discord-ID *" hint="Eindeutige Kennung – Rechtsklick auf das Mitglied → „ID kopieren“. Namen werden nie zur Identifikation genutzt." error={f.discordId && !validId ? 'Eine Discord-ID besteht aus 15–25 Ziffern.' : undefined}>{(id) => <Input id={id} inputMode="numeric" autoFocus value={f.discordId} onChange={set('discordId')} placeholder="123456789012345678" />}</Field>
          <Field label="Anzeigename" hint="Nur zur Anzeige">{(id) => <Input id={id} maxLength={100} value={f.discordName} onChange={set('discordName')} />}</Field>
          <Field label="Dienstgrad">{(id) => <Input id={id} maxLength={80} value={f.rank} onChange={set('rank')} />}</Field>
          <Field label="Abteilung">{(id) => <Input id={id} maxLength={80} value={f.department} onChange={set('department')} />}</Field>
          <Field label="Benutzername im Funkdienst" hint="z. B. Zello-Name; leer = aus der Teamübersicht, falls hinterlegt">{(id) => <Input id={id} maxLength={100} value={f.externalName} onChange={set('externalName')} />}</Field>
          <Field label="Status">{(id) => <Select id={id} value={f.status} onChange={set('status')}><option value="ACTIVE">Sofort aktiv</option><option value="PENDING">Ausstehend (später aktivieren)</option></Select>}</Field>
        </div>
        <DurationField dur={dur} date={date} setDur={setDur} setDate={setDate} />
        <Field label="Begründung *">{(id) => <Textarea id={id} rows={2} maxLength={1000} required value={f.reason} onChange={set('reason')} />}</Field>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={m.isPending || !validId || f.reason.trim().length < 3 || (dur === 'date' && !date)}>{m.isPending ? 'Speichert …' : 'Freischalten'}</Button></div>
      </form>
    </Modal>
  );
}

type ActionKey = 'activate' | 'deactivate' | 'extend' | 'suspend' | 'unsuspend' | 'revoke' | 'restore';
const ACTIONS: Record<ActionKey, { label: string; perm: string; danger?: boolean; reason: 'required' | 'optional'; date?: 'expires' | 'until'; confirm: string }> = {
  activate: { label: 'Aktivieren', perm: 'radiowhitelist.grant', reason: 'optional', date: 'expires', confirm: 'Die Freigabe wird aktiv; das Mitglied erhält die Funkrolle.' },
  deactivate: { label: 'Deaktivieren', perm: 'radiowhitelist.grant', reason: 'required', confirm: 'Die Freigabe ruht, bis sie wieder aktiviert wird. Die Funkrolle wird entzogen.' },
  extend: { label: 'Verlängern / Ablauf ändern', perm: 'radiowhitelist.grant', reason: 'optional', date: 'expires', confirm: 'Neues Ablaufdatum festlegen (oder unbefristet).' },
  suspend: { label: 'Sperren', perm: 'radiowhitelist.suspend', danger: true, reason: 'required', date: 'until', confirm: 'Das Mitglied darf den Funkdienst nicht nutzen, bis die Sperre endet oder aufgehoben wird. Rollenabgleich und Anträge heben eine Sperre nie auf.' },
  unsuspend: { label: 'Sperre aufheben', perm: 'radiowhitelist.suspend', reason: 'optional', confirm: 'Die Freigabe kehrt in den Zustand vor der Sperre zurück.' },
  revoke: { label: 'Freigabe entziehen', perm: 'radiowhitelist.remove', danger: true, reason: 'required', confirm: 'Die Freigabe wird entzogen und archiviert (nicht gelöscht). Sie kann später erneut erteilt werden.' },
  restore: { label: 'Erneut freischalten', perm: 'radiowhitelist.grant', reason: 'required', date: 'expires', confirm: 'Der archivierte Eintrag wird wieder aktiv – die bisherige Historie bleibt erhalten.' },
};
const AVAILABLE: Record<RadioGrantStatus, ActionKey[]> = {
  ACTIVE: ['extend', 'deactivate', 'suspend', 'revoke'], PENDING: ['activate', 'extend', 'deactivate', 'suspend', 'revoke'], DISABLED: ['activate', 'suspend', 'revoke'],
  EXPIRED: ['extend', 'activate', 'deactivate', 'suspend', 'revoke'], SUSPENDED: ['unsuspend', 'revoke'], REVOKED: ['restore'],
};

function GrantDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const refresh = useInvalidate();
  const d = useQuery({ queryKey: ['radiowl', 'grant', id], queryFn: () => api<GrantDetail>(`/radio-whitelist/grants/${id}`) });
  const [edit, setEdit] = useState<Partial<Record<'discordName' | 'rank' | 'department' | 'externalName' | 'reason', string>>>({});
  const [action, setAction] = useState<ActionKey | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [newId, setNewId] = useState('');
  const g = d.data;
  const save = useMutation({
    mutationFn: () => api<Grant>(`/radio-whitelist/grants/${id}`, { method: 'PATCH', body: { version: g!.version, ...Object.fromEntries(Object.entries(edit).map(([k, v]) => [k, v?.trim() || null])) } }),
    onSuccess: () => { setEdit({}); setMsg({ ok: true, text: 'Gespeichert.' }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const simple = useMutation({
    mutationFn: (path: string) => api<Grant>(`/radio-whitelist/grants/${id}/${path}`, { body: path === 'discord-id' ? { discordId: newId.trim() } : {} }),
    onSuccess: () => { setMsg({ ok: true, text: 'Erledigt.' }); setNewId(''); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const field = (k: keyof typeof edit, label: string, max: number) => (
    <Field label={label}>{(fid) => <Input id={fid} maxLength={max} disabled={!can('radiowhitelist.grant')} value={edit[k] ?? g?.[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />}</Field>
  );
  return (
    <Modal open title={g ? `Funkfreigabe – ${who(g)}` : 'Funkfreigabe'} onClose={onClose} wide>
      {d.isLoading ? <SkeletonRows rows={6} /> : d.error || !g ? <ErrorState error={d.error} onRetry={() => void d.refetch()} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={g.effectiveStatus} />
            <Badge tone="neutral">{RADIO_GRANT_SOURCE_LABEL[g.source] ?? g.source}</Badge>
            {g.authorized ? <Badge tone="success">funkberechtigt</Badge> : <Badge tone="danger">nicht funkberechtigt</Badge>}
            {g.roleRevoked && <Badge tone="warning">durch Rollenabgleich</Badge>}
            <span className="font-mono text-xs text-muted">{g.discordId ?? 'Discord-ID fehlt'}</span>
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-muted">Gültig bis: </dt><dd className="inline">{g.expiresAt ? fmt(g.expiresAt) : 'unbefristet'}</dd></div>
            <div><dt className="inline text-muted">Freigegeben: </dt><dd className="inline">{g.grantedAt ? `${fmt(g.grantedAt)}${g.grantedByName ? ` von ${g.grantedByName}` : ''}` : '—'}</dd></div>
            {g.effectiveStatus === 'SUSPENDED' && <div className="sm:col-span-2"><dt className="inline text-muted">Sperre: </dt><dd className="inline">{g.suspendReason ?? '—'}{g.suspendedUntil ? ` (bis ${fmt(g.suspendedUntil)})` : ' (unbefristet)'}</dd></div>}
            {g.userName && <div><dt className="inline text-muted">Dashboard-Konto: </dt><dd className="inline">{g.userName}</dd></div>}
            <div><dt className="inline text-muted">Funkdienst: </dt><dd className="inline">{EXT_LABEL[g.externalStatus]?.[0] ?? g.externalStatus}{g.externalSyncedAt ? ` · ${fmt(g.externalSyncedAt)}` : ''}</dd></div>
            {g.externalError && <div className="sm:col-span-2 text-danger"><dt className="inline">Fehler im Funkdienst: </dt><dd className="inline">{g.externalError}</dd></div>}
          </dl>
          {!g.discordId && can('radiowhitelist.grant') && (
            <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="mb-2">Übernommener Eintrag ohne Discord-ID. Bitte die Discord-ID nachtragen – nur so ist das Mitglied eindeutig zugeordnet.</p>
              <div className="flex gap-2"><Input aria-label="Discord-ID nachtragen" inputMode="numeric" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="123456789012345678" /><Button size="sm" disabled={!/^\d{15,25}$/.test(newId.trim()) || simple.isPending} onClick={() => simple.mutate('discord-id')}>Speichern</Button></div>
            </div>
          )}
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            {field('discordName', 'Anzeigename', 100)}{field('externalName', 'Benutzername im Funkdienst', 100)}{field('rank', 'Dienstgrad', 80)}{field('department', 'Abteilung', 80)}
            <div className="sm:col-span-2"><Field label="Begründung / Notiz">{(fid) => <Textarea id={fid} rows={2} maxLength={1000} disabled={!can('radiowhitelist.grant')} value={edit.reason ?? g.reason ?? ''} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />}</Field></div>
            {can('radiowhitelist.grant') && <div className="sm:col-span-2 flex justify-end"><Button type="submit" size="sm" disabled={!Object.keys(edit).length || save.isPending}>Änderungen speichern</Button></div>}
          </form>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {AVAILABLE[g.archivedAt ? 'REVOKED' : g.effectiveStatus].filter((a) => can(ACTIONS[a].perm) && (a !== 'restore' || !!g.discordId)).map((a) => (
              <Button key={a} size="sm" variant={ACTIONS[a].danger ? 'danger' : 'secondary'} onClick={() => setAction(a)}>{ACTIONS[a].label}</Button>
            ))}
            {g.externalStatus === 'MANUAL' && can('radiowhitelist.grant') && <Button size="sm" variant="secondary" disabled={simple.isPending} onClick={() => simple.mutate('external-done')}>✔ Im Funkdienst erledigt</Button>}
          </div>
          <Msg msg={msg} />
          <section>
            <h3 className="mb-1 text-sm font-semibold">Verlauf</h3>
            {!g.history.length ? <p className="text-sm text-muted">Noch keine Einträge.</p> : (
              <ol className="max-h-56 space-y-1 overflow-auto text-sm">{g.history.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-2"><span className="text-xs text-muted">{fmt(h.createdAt)}</span><b>{ACTION_LABEL[h.action] ?? h.action}</b><span className="text-muted">– {h.actorName}</span>{h.reason && <span className="w-full pl-2 text-xs text-muted">„{h.reason}“</span>}</li>
              ))}</ol>
            )}
          </section>
          {action && <ActionDialog grant={g} action={action} onClose={() => setAction(null)} onDone={(text) => { setAction(null); setMsg({ ok: true, text }); refresh(); }} />}
        </div>
      )}
    </Modal>
  );
}

function ActionDialog({ grant, action, onClose, onDone }: { grant: Grant; action: ActionKey; onClose: () => void; onDone: (text: string) => void }) {
  const def = ACTIONS[action];
  const [reason, setReason] = useState('');
  const [dur, setDur] = useState(action === 'extend' ? '30' : ''); const [date, setDate] = useState('');
  const [err, setErr] = useState<string>();
  const m = useMutation({
    mutationFn: () => {
      const iso = durationToIso(dur, date);
      const body: Record<string, unknown> = { reason: reason.trim() || null, ...(action !== 'restore' ? { version: grant.version } : {}) };
      if (def.date === 'expires') body.expiresAt = iso;
      if (def.date === 'until') body.until = iso;
      return api<Grant>(`/radio-whitelist/grants/${grant.id}/${action}`, { body });
    },
    onSuccess: () => onDone(`${def.label}: erledigt.`), onError: (e) => setErr(errText(e)),
  });
  const reasonOk = def.reason === 'optional' || reason.trim().length >= 3;
  return (
    <Modal open title={`${def.label} – ${who(grant)}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <p className="text-sm text-muted">{def.confirm}</p>
        {def.date && <DurationField dur={dur} date={date} setDur={setDur} setDate={setDate} label={def.date === 'until' ? 'Dauer der Sperre' : 'Gültigkeit'} />}
        <Field label={`Begründung${def.reason === 'required' ? ' *' : ''}`}>{(id) => <Textarea id={id} rows={2} maxLength={1000} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" variant={def.danger ? 'danger' : 'primary'} disabled={m.isPending || !reasonOk || (dur === 'date' && !date)}>{m.isPending ? 'Bitte warten …' : def.label}</Button></div>
      </form>
    </Modal>
  );
}

// =====================================================================================================
function RequestsTab() {
  const { can } = useAuth();
  const refresh = useInvalidate();
  const [status, setStatus] = useState<'PENDING' | 'DONE' | 'ALL'>('PENDING');
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['radiowl', 'requests', status, q], queryFn: () => api<Page<RequestRow>>('/radio-whitelist/requests', { query: { status, q: q.trim() || undefined, pageSize: 100 } }) });
  const [decide, setDecide] = useState<{ r: RequestRow; d: 'APPROVE' | 'REJECT' } | null>(null);
  return (
    <div className="space-y-4">
      <Card title="Anträge auf Funkfreigabe" actions={<div className="flex gap-1">{(['PENDING', 'DONE', 'ALL'] as const).map((s) => <Button key={s} size="sm" variant={status === s ? 'primary' : 'secondary'} onClick={() => setStatus(s)}>{s === 'PENDING' ? 'Offen' : s === 'DONE' ? 'Bearbeitet' : 'Alle'}</Button>)}</div>}>
        <Input aria-label="Anträge durchsuchen" className="mb-3" placeholder="Discord-ID, Name, Dienstgrad, Abteilung …" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data?.items.length ? <EmptyState text={status === 'PENDING' ? 'Keine offenen Anträge.' : 'Keine Anträge.'} hint="Mitglieder stellen Anträge in Discord mit /funkantrag." /> : (
          <ul className="divide-y divide-line">{list.data.items.map((r) => (
            <li key={r.id} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{r.discordName ?? r.discordId}</b><span className="font-mono text-xs text-muted">{r.discordId}</span>
                <Badge tone={r.status === 'PENDING' ? 'warning' : r.status === 'APPROVED' ? 'success' : 'danger'}>{r.status === 'PENDING' ? 'Offen' : r.status === 'APPROVED' ? 'Genehmigt' : r.status === 'REJECTED' ? 'Abgelehnt' : r.status}</Badge>
                <span className="text-xs text-muted">gestellt {fmt(r.createdAt)}</span>
              </div>
              {(r.rank || r.department) && <p className="text-xs text-muted">{[r.rank, r.department].filter(Boolean).join(' · ')}</p>}
              <p className="whitespace-pre-wrap">{r.reason}</p>
              {!!r.answers?.length && <dl className="text-xs">{r.answers.map((a) => <div key={a.key}><dt className="inline font-medium">{a.label}: </dt><dd className="inline whitespace-pre-wrap">{a.value}</dd></div>)}</dl>}
              {r.status !== 'PENDING' && <p className="text-xs text-muted">{r.status === 'APPROVED' ? 'Genehmigt' : 'Abgelehnt'} {fmt(r.decidedAt)}{r.decidedByName ? ` von ${r.decidedByName}` : ''}{r.decisionReason ? ` – „${r.decisionReason}“` : ''}{r.grantExpiresAt ? ` · gültig bis ${fmt(r.grantExpiresAt)}` : ''}</p>}
              {r.status === 'PENDING' && <div className="flex gap-2 pt-1"><Button size="sm" onClick={() => setDecide({ r, d: 'APPROVE' })}>Genehmigen</Button><Button size="sm" variant="danger" onClick={() => setDecide({ r, d: 'REJECT' })}>Ablehnen</Button></div>}
            </li>
          ))}</ul>
        )}
      </Card>
      {can('radiowhitelist.requests') && <RequestSettings />}
      {decide && <DecideDialog r={decide.r} decision={decide.d} onClose={() => setDecide(null)} onDone={() => { setDecide(null); refresh(); }} />}
    </div>
  );
}

function DecideDialog({ r, decision, onClose, onDone }: { r: RequestRow; decision: 'APPROVE' | 'REJECT'; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [dur, setDur] = useState(''); const [date, setDate] = useState('');
  const [err, setErr] = useState<string>();
  const m = useMutation({ mutationFn: () => api(`/radio-whitelist/requests/${r.id}/decision`, { body: { decision, reason: reason.trim() || null, expiresAt: decision === 'APPROVE' ? durationToIso(dur, date) : null } }), onSuccess: onDone, onError: (e) => setErr(errText(e)) });
  const approve = decision === 'APPROVE';
  return (
    <Modal open title={`Antrag ${approve ? 'genehmigen' : 'ablehnen'} – ${r.discordName ?? r.discordId}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <p className="text-sm text-muted">Das Mitglied erhält eine Discord-Direktnachricht mit der Entscheidung{approve ? '' : ' und der Begründung'}.</p>
        {approve && <DurationField dur={dur} date={date} setDur={setDur} setDate={setDate} />}
        <Field label={`Begründung${approve ? ' (optional)' : ' *'}`}>{(id) => <Textarea id={id} rows={3} maxLength={1000} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" variant={approve ? 'primary' : 'danger'} disabled={m.isPending || (!approve && reason.trim().length < 3) || (dur === 'date' && !date)}>{approve ? 'Genehmigen' : 'Ablehnen'}</Button></div>
      </form>
    </Modal>
  );
}

function RequestSettings() {
  const refresh = useInvalidate();
  const cfg = useQuery({ queryKey: ['radiowl', 'config'], queryFn: () => api<Config>('/radio-whitelist/config') });
  const [d, setD] = useState<Pick<Config, 'requests' | 'notifyMembers'> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  useEffect(() => { if (cfg.data && !d) setD({ requests: cfg.data.requests, notifyMembers: cfg.data.notifyMembers }); }, [cfg.data, d]);
  const save = useMutation({ mutationFn: () => api('/radio-whitelist/config/requests', { method: 'PUT', body: d }), onSuccess: () => { setMsg({ ok: true, text: 'Gespeichert.' }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const post = useMutation({
    mutationFn: async () => { await api('/radio-whitelist/config/requests', { method: 'PUT', body: d }); return api('/radio-whitelist/request-panel', { method: 'POST' }); },
    onSuccess: () => { setMsg({ ok: true, text: 'Panel wird vom Bot in den Kanal gesetzt (bzw. dort aktualisiert).' }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  if (!d) return <Card title="Einstellungen"><SkeletonRows rows={3} /></Card>;
  const panel = d.requests.panel;
  const setPanel = (p: Partial<RequestPanel>) => setD({ ...d, requests: { ...d.requests, panel: { ...panel, ...p } } });
  const chk = (label: string, value: boolean, on: (v: boolean) => void, hint?: string) => <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={value} onChange={(e) => on(e.target.checked)} /><span>{label}{hint && <span className="block text-xs text-muted">{hint}</span>}</span></label>;
  const saveBtn = (label: string) => <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{label}</Button>;
  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <Card title="Einstellungen für Anträge">
        <div className="space-y-3">
          {chk('Anträge über Discord erlauben (/funkantrag und Panel)', d.requests.enabled, (v) => setD({ ...d, requests: { ...d.requests, enabled: v } }))}
          {chk('Doppelte offene Anträge verhindern', d.requests.preventDuplicates, (v) => setD({ ...d, requests: { ...d.requests, preventDuplicates: v } }), 'Ein Mitglied kann erst wieder beantragen, wenn sein offener Antrag bearbeitet ist.')}
          {chk('Mitglieder per Direktnachricht über Änderungen informieren', d.notifyMembers, (v) => setD({ ...d, notifyMembers: v }), 'Entscheidungen über Anträge werden immer mitgeteilt.')}
          <Field label="Neue Anträge als Panel in diesen Kanal melden" hint="Jeder Antrag erscheint dort mit „Genehmigen“ und „Ablehnen“ (Ablehnen fragt nach dem Grund). Nach der Entscheidung – auch im Dashboard – wird die Meldung aktualisiert. Wer klickt, braucht ein verknüpftes Konto mit dem Recht „Anträge bearbeiten“.">{() => <ChannelPicker ariaLabel="Kanal für neue Anträge" value={d.requests.notifyChannelId} onChange={(id) => setD({ ...d, requests: { ...d.requests, notifyChannelId: id } })} />}</Field>
          <Field label="Rollen bei Genehmigung" hint="Diese Discord-Rollen bekommt das Mitglied zusätzlich, sobald sein Antrag genehmigt wird – egal ob im Dashboard oder per Button in Discord. Die Funkrolle (Rollenabgleich) wird ohnehin vergeben.">{() => <RolePicker ariaLabel="Rollen bei Genehmigung" value={d.requests.approveRoleIds ?? []} onChange={(v) => setD({ ...d, requests: { ...d.requests, approveRoleIds: v } })} max={10} />}</Field>
          {saveBtn('Speichern')}
        </div>
      </Card>
      <Card title="Antragsformular in Discord">
        <div className="space-y-3">
          <FormEditor form={d.requests.form} onChange={(form) => setD({ ...d, requests: { ...d.requests, form } })} />
          {saveBtn('Formular speichern')}
        </div>
      </Card>
      <Card title="Antrags-Panel für Mitglieder">
        <div className="space-y-3">
          <p className="text-xs text-muted">Nachricht mit Button – Mitglieder klicken, füllen das Formular aus und der Antrag landet hier (wie /funkantrag).</p>
          <Field label="Kanal">{() => <ChannelPicker ariaLabel="Kanal für das Antrags-Panel" value={panel.channelId} onChange={(id) => setPanel({ channelId: id })} />}</Field>
          <Field label="Titel">{(id) => <Input id={id} maxLength={256} value={panel.title} onChange={(e) => setPanel({ title: e.target.value })} />}</Field>
          <Field label="Text">{(id) => <Textarea id={id} rows={3} maxLength={4000} value={panel.text} onChange={(e) => setPanel({ text: e.target.value })} />}</Field>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Button-Text">{(id) => <Input id={id} maxLength={80} value={panel.buttonLabel} onChange={(e) => setPanel({ buttonLabel: e.target.value })} />}</Field>
            <Field label="Farbe">{(id) => <input id={id} type="color" className="h-10 w-14 cursor-pointer rounded border border-line bg-transparent" value={panel.color} onChange={(e) => setPanel({ color: e.target.value })} />}</Field>
          </div>
          <div className="rounded border-l-4 bg-[#2b2d31] p-3 text-sm text-[#dbdee1]" style={{ borderLeftColor: panel.color }} aria-label="Vorschau des Panels">
            <p className="font-semibold text-white">{panel.title}</p><p className="mt-1 whitespace-pre-wrap">{panel.text}</p>
            <span className="mt-2 inline-block rounded bg-[#5865f2] px-3 py-1 text-xs text-white">🎙️ {panel.buttonLabel}</span>
          </div>
          <Button size="sm" disabled={post.isPending || !panel.channelId || !panel.title.trim() || !panel.text.trim() || !panel.buttonLabel.trim() || !d.requests.enabled} onClick={() => post.mutate()}>Panel senden / aktualisieren</Button>
        </div>
      </Card>
      <div className="lg:col-span-2 2xl:col-span-3"><Msg msg={msg} /></div>
    </div>
  );
}

const BUILTIN: Record<string, FormField> = {
  rank: { key: 'rank', label: 'Dienstgrad (falls relevant)', placeholder: '', paragraph: false, required: false, maxLength: 80 },
  department: { key: 'department', label: 'Abteilung (falls relevant)', placeholder: '', paragraph: false, required: false, maxLength: 80 },
};
/** Antragsformular (Discord-Modal) selbst gestalten: Titel, bis zu 5 Felder; „Begründung“ ist immer dabei und Pflicht. */
function FormEditor({ form, onChange }: { form: RequestForm; onChange: (f: RequestForm) => void }) {
  const set = (i: number, p: Partial<FormField>) => onChange({ ...form, fields: form.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const move = (i: number, d: -1 | 1) => { const f = [...form.fields]; const j = i + d; if (j < 0 || j >= f.length) return; [f[i], f[j]] = [f[j]!, f[i]!]; onChange({ ...form, fields: f }); };
  const add = (kind: string) => {
    if (form.fields.length >= 5) return;
    const used = new Set(form.fields.map((f) => f.key));
    let key = kind; for (let n = 1; kind === 'custom' && (key === 'custom' || used.has(key)); n++) key = `feld_${n}`;
    const field = BUILTIN[kind] ?? { key, label: 'Neues Feld', placeholder: '', paragraph: false, required: false, maxLength: 200 };
    onChange({ ...form, fields: [...form.fields, field] });
  };
  const missing = Object.keys(BUILTIN).filter((k) => !form.fields.some((f) => f.key === k));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">So sieht das Formular bei /funkantrag und beim Panel-Button aus. Discord erlaubt höchstens 5 Felder und 45 Zeichen je Beschriftung.</p>
      <Field label="Titel des Formulars">{(id) => <Input id={id} maxLength={45} value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} />}</Field>
      <ol className="space-y-2">{form.fields.map((f, i) => (
        <li key={f.key} className="space-y-2 rounded border border-line p-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted">{i + 1}.</span>
            <Input aria-label={`Beschriftung Feld ${i + 1}`} maxLength={45} value={f.label} onChange={(e) => set(i, { label: e.target.value })} />
            <Button type="button" size="sm" variant="ghost" aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
            <Button type="button" size="sm" variant="ghost" aria-label="nach unten" disabled={i === form.fields.length - 1} onClick={() => move(i, 1)}>↓</Button>
            {f.key !== 'reason' && <Button type="button" size="sm" variant="ghost" aria-label={`${f.label} entfernen`} onClick={() => onChange({ ...form, fields: form.fields.filter((_, j) => j !== i) })}>✕</Button>}
          </div>
          <Input aria-label={`Platzhalter Feld ${i + 1}`} maxLength={100} placeholder="Platzhalter (grauer Hinweistext, optional)" value={f.placeholder} onChange={(e) => set(i, { placeholder: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={f.paragraph} onChange={(e) => set(i, { paragraph: e.target.checked })} />mehrzeilig</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={f.key === 'reason' || f.required} disabled={f.key === 'reason'} onChange={(e) => set(i, { required: e.target.checked })} />Pflichtfeld</label>
            <label className="flex items-center gap-1">max. <input type="number" min={1} max={1000} className="w-16 rounded border border-line bg-transparent px-1" value={f.maxLength} onChange={(e) => set(i, { maxLength: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })} /> Zeichen</label>
            {f.key === 'reason' && <span className="text-muted">immer dabei</span>}
            {f.key === 'rank' && <span className="text-muted">eingebaut: wird als Dienstgrad gespeichert, solange die Beschriftung nach „Dienstgrad“ oder „Rang“ fragt</span>}
            {f.key === 'department' && <span className="text-muted">eingebaut: wird als Abteilung gespeichert, solange die Beschriftung nach „Abteilung“ fragt</span>}
          </div>
        </li>
      ))}</ol>
      {form.fields.length < 5 && (
        <div className="flex flex-wrap gap-2">
          {missing.map((k) => <Button key={k} type="button" size="sm" variant="secondary" onClick={() => add(k)}>+ {k === 'rank' ? 'Dienstgrad' : 'Abteilung'}</Button>)}
          <Button type="button" size="sm" variant="secondary" onClick={() => add('custom')}>+ Eigenes Feld</Button>
        </div>
      )}
      <div className="rounded-lg bg-[#313338] p-4 text-[#dbdee1]" aria-label="Vorschau des Formulars">
        <p className="mb-3 text-base font-semibold text-white">{form.title || '—'}</p>
        {form.fields.map((f) => (
          <div key={f.key} className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase">{f.label}{(f.required || f.key === 'reason') && <span className="text-[#f23f43]"> *</span>}</p>
            <div className={`rounded bg-[#1e1f22] px-2 py-1.5 text-sm text-[#87898c] ${f.paragraph ? 'min-h-14' : ''}`}>{f.placeholder || '\u00a0'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================================================
const GAIN: [RadioRoleRules['onRoleGain'], string][] = [['ACTIVATE', 'Freigabe sofort aktivieren'], ['PENDING', 'Als „ausstehend“ zur Prüfung anlegen'], ['NONE', 'Nichts tun']];
const LOSS: [RadioRoleRules['onRoleLoss'], string][] = [['REVOKE', 'Freigabe entziehen (archivieren)'], ['DISABLE', 'Freigabe deaktivieren'], ['NONE', 'Nichts tun']];
const MANUAL: [RadioRoleRules['manualOnRoleLoss'], string][] = [['KEEP', 'Behalten (Standard)'], ['DISABLE', 'Deaktivieren'], ['REVOKE', 'Entziehen (archivieren)']];

function RolesTab() {
  const { can } = useAuth();
  const refresh = useInvalidate();
  const edit = can('radiowhitelist.roles');
  const cfg = useQuery({ queryKey: ['radiowl', 'config'], queryFn: () => api<Config>('/radio-whitelist/config') });
  const st = useQuery({ queryKey: ['radiowl', 'rolesync'], queryFn: () => api<RoleSyncStatus>('/radio-whitelist/role-sync'), refetchInterval: 15_000 });
  const [d, setD] = useState<Pick<Config, 'roleSync' | 'radioRoleIds'> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  useEffect(() => { if (cfg.data && !d) setD({ roleSync: cfg.data.roleSync, radioRoleIds: cfg.data.radioRoleIds }); }, [cfg.data, d]);
  const save = useMutation({ mutationFn: () => api('/radio-whitelist/config/roles', { method: 'PUT', body: d }), onSuccess: () => { setMsg({ ok: true, text: 'Regeln gespeichert.' }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const run = useMutation({ mutationFn: () => api('/radio-whitelist/role-sync/run', { method: 'POST' }), onSuccess: () => setMsg({ ok: true, text: 'Abgleich angestoßen – der Bot meldet die Rollen in Kürze.' }), onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  if (cfg.error) return <ErrorState error={cfg.error} />;
  if (!d) return <SkeletonRows />;
  const r = d.roleSync;
  const setR = (p: Partial<RadioRoleRules>) => setD({ ...d, roleSync: { ...r, ...p } });
  const last = st.data?.last;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <Card title="Regeln für den Discord-Rollenabgleich">
        <fieldset disabled={!edit} className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={r.enabled} onChange={(e) => setR({ enabled: e.target.checked })} />Rollenabgleich einschalten</label>
          <Field label="Rollen, die eine Funkberechtigung geben" hint="Eine dieser Rollen genügt.">{() => <RolePicker ariaLabel="Berechtigende Rollen" value={r.grantRoleIds} onChange={(v) => setR({ grantRoleIds: v })} disabled={!edit} />}</Field>
          <Field label="Erforderliche Rollen (zum Behalten)" hint="Leer = die berechtigenden Rollen oben. Fehlen alle, greift die Regel bei Rollenverlust.">{() => <RolePicker ariaLabel="Erforderliche Rollen" value={r.requiredRoleIds} onChange={(v) => setR({ requiredRoleIds: v })} disabled={!edit} />}</Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Rolle erhalten">{(id) => <Select id={id} value={r.onRoleGain} onChange={(e) => setR({ onRoleGain: e.target.value as RadioRoleRules['onRoleGain'] })}>{GAIN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            <Field label="Rolle verloren (über Rolle erteilt)">{(id) => <Select id={id} value={r.onRoleLoss} onChange={(e) => setR({ onRoleLoss: e.target.value as RadioRoleRules['onRoleLoss'] })}>{LOSS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            <Field label="Rolle verloren (manuell/Antrag)">{(id) => <Select id={id} value={r.manualOnRoleLoss} onChange={(e) => setR({ manualOnRoleLoss: e.target.value as RadioRoleRules['manualOnRoleLoss'] })}>{MANUAL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          </div>
          <Field label="Funkrolle für freigegebene Mitglieder" hint="Diese Discord-Rolle(n) bekommt, wer aktiv freigegeben ist – und verliert sie beim Entzug. Leer = Funkrolle aus Einstellungen → Discord.">{() => <RolePicker ariaLabel="Funkrolle" value={d.radioRoleIds} onChange={(v) => setD({ ...d, radioRoleIds: v })} disabled={!edit} max={5} />}</Field>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            <li>Gesperrte Mitglieder bleiben gesperrt – Rollen heben eine Sperre nie auf.</li>
            <li>Manuell entzogene oder deaktivierte Freigaben werden nie automatisch wieder aktiv – nur solche, die der Abgleich selbst entzogen hat.</li>
            <li>Die Entscheidung trifft immer der Server; der Bot meldet nur die Rollen.</li>
          </ul>
        </fieldset>
        {edit && <div className="mt-4 flex flex-wrap gap-2"><Button disabled={save.isPending} onClick={() => save.mutate()}>Regeln speichern</Button><Button variant="secondary" disabled={run.isPending || !cfg.data?.roleSync.enabled} onClick={() => run.mutate()}><RefreshCw size={14} aria-hidden /> Jetzt abgleichen</Button></div>}
        <div className="mt-2"><Msg msg={msg} /></div>
      </Card>
      <Card title="Letzter Abgleich">
        {st.isLoading ? <SkeletonRows rows={3} /> : !last ? <p className="text-sm text-muted">Noch kein Abgleich gelaufen. Der Bot gleicht nach dem Start, alle 30 Minuten und bei jeder Rollenänderung ab.</p> : (
          <div className="space-y-2 text-sm">
            <p>{last.ok ? <Badge tone="success">erfolgreich</Badge> : <Badge tone="danger">mit Fehlern</Badge>} <span className="text-muted">{fmt(last.at)}{last.full ? ' · vollständig' : ''}</span></p>
            <p>{last.checked} geprüft · {last.changed} geändert · {last.failed} Fehler</p>
            {st.data?.lastSuccessAt && <p className="text-xs text-muted">Zuletzt erfolgreich: {fmt(st.data.lastSuccessAt)}</p>}
            {!!last.errors?.length && <ul className="space-y-1 text-xs text-danger">{last.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
      </Card>
    </div>
  );
}

// =====================================================================================================
const CONN: Record<string, [string, Tone]> = { NOT_CONFIGURED: ['Nicht eingerichtet', 'neutral'], CONNECTED: ['Verbunden', 'success'], ERROR: ['Fehler', 'danger'], MANUAL: ['Manuelle Verwaltung', 'warning'] };

function IntegrationTab() {
  const { can } = useAuth();
  const refresh = useInvalidate();
  const edit = can('radiowhitelist.integration');
  const q = useQuery({ queryKey: ['radiowl', 'integration'], queryFn: () => api<Integration>('/radio-whitelist/integration') });
  const [d, setD] = useState<{ provider: string; displayName: string; network: string; channel: string; adminUsername: string; password: string; apiKey: string; autoSync: boolean } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [clear, setClear] = useState(false);
  const i = q.data;
  useEffect(() => { if (i && !d) setD({ provider: i.provider, displayName: i.displayName, network: i.network ?? '', channel: i.channel ?? '', adminUsername: i.adminUsername ?? '', password: '', apiKey: '', autoSync: i.autoSync }); }, [i, d]);
  const save = useMutation({
    mutationFn: (clearCredentials: boolean) => api<Integration>('/radio-whitelist/integration', { method: 'PUT', body: { ...d, network: d!.network || null, channel: d!.channel || null, adminUsername: d!.adminUsername || null, password: d!.password || undefined, apiKey: d!.apiKey || undefined, clearCredentials, version: i!.version, autoSync: d!.provider === 'ZELLO_WORK' && d!.autoSync } }),
    onSuccess: () => { setD({ ...d!, password: '', apiKey: '' }); setClear(false); setMsg({ ok: true, text: 'Gespeichert. Zugangsdaten liegen nur verschlüsselt auf dem Server.' }); refresh(); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const test = useMutation({ mutationFn: () => api<{ ok: boolean; message: string }>('/radio-whitelist/integration/test', { method: 'POST' }), onSuccess: (r) => { setMsg({ ok: r.ok, text: r.message }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const sync = useMutation({ mutationFn: () => api<{ ok: boolean; message: string }>('/radio-whitelist/integration/sync', { method: 'POST' }), onSuccess: (r) => { setMsg({ ok: r.ok, text: r.message }); refresh(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  if (q.isLoading || !d) return q.error ? <ErrorState error={q.error} /> : <SkeletonRows />;
  const prov = i!.providers.find((p) => p.key === d.provider);
  const zello = d.provider === 'ZELLO_WORK';
  const dirty = !!i && (d.provider !== i.provider || d.displayName !== i.displayName || d.network !== (i.network ?? '') || d.channel !== (i.channel ?? '') || d.adminUsername !== (i.adminUsername ?? '') || !!d.password || !!d.apiKey || d.autoSync !== i.autoSync);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <Card title="Externer Funkdienst">
        <fieldset disabled={!edit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Funkdienst">{(id) => <Select id={id} value={d.provider} onChange={(e) => setD({ ...d, provider: e.target.value, autoSync: e.target.value === 'ZELLO_WORK' && d.autoSync })}>{i!.providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select>}</Field>
            <Field label="Anzeigename">{(id) => <Input id={id} maxLength={80} value={d.displayName} onChange={(e) => setD({ ...d, displayName: e.target.value })} />}</Field>
          </div>
          {prov && (
            <div className={`rounded border p-3 text-sm ${prov.apiSupported ? 'border-info/40 bg-info/10' : 'border-warning/40 bg-warning/10'}`}>
              <p className="font-medium">{prov.apiSupported ? '✅ Offizielle API verfügbar' : '⚠️ Keine automatische Synchronisierung verfügbar'}</p>
              <p className="mt-1">{prov.note}</p>
              {prov.verified && <p className="mt-1 text-xs text-muted">{prov.verified}</p>}
            </div>
          )}
          {zello && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Netzwerkname" hint={`API-Endpunkt: https://${d.network || '<netzwerk>'}.zellowork.com`}>{(id) => <Input id={id} maxLength={63} value={d.network} onChange={(e) => setD({ ...d, network: e.target.value.trim().toLowerCase() })} placeholder="z. B. enpolizei" />}</Field>
                <Field label="Kanal" hint="Freigegebene Mitglieder werden diesem Kanal hinzugefügt.">{(id) => <Input id={id} maxLength={100} value={d.channel} onChange={(e) => setD({ ...d, channel: e.target.value })} />}</Field>
                <Field label="Administrator-Benutzername">{(id) => <Input id={id} maxLength={100} autoComplete="off" value={d.adminUsername} onChange={(e) => setD({ ...d, adminUsername: e.target.value })} />}</Field>
                <div />
                <Field label="Passwort" hint={i!.hasPassword ? 'Gespeichert – leer lassen, um es zu behalten.' : 'Noch nicht hinterlegt.'}>{(id) => <Input id={id} type="password" autoComplete="new-password" maxLength={200} value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} placeholder={i!.hasPassword ? '••••••••' : ''} />}</Field>
                <Field label="API-Schlüssel" hint={i!.hasApiKey ? 'Gespeichert – leer lassen, um ihn zu behalten.' : 'Admin-Konsole → Dashboard → Account → API-Schlüssel'}>{(id) => <Input id={id} type="password" autoComplete="off" maxLength={500} value={d.apiKey} onChange={(e) => setD({ ...d, apiKey: e.target.value })} placeholder={i!.hasApiKey ? '••••••••' : ''} />}</Field>
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={d.autoSync} onChange={(e) => setD({ ...d, autoSync: e.target.checked })} /><span>Änderungen automatisch übertragen<span className="block text-xs text-muted">Nur nach erfolgreichem Verbindungstest. Sonst über „Jetzt synchronisieren“.</span></span></label>
            </>
          )}
        </fieldset>
        {edit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={save.isPending || !dirty} onClick={() => save.mutate(false)}>Speichern</Button>
            {zello && i!.provider === 'ZELLO_WORK' && <>
              <Button variant="secondary" disabled={test.isPending || dirty} onClick={() => test.mutate()}>{test.isPending ? 'Teste …' : 'Verbindung testen'}</Button>
              <Button variant="secondary" disabled={sync.isPending || dirty || i!.status !== 'CONNECTED'} onClick={() => sync.mutate()}><RefreshCw size={14} aria-hidden /> {sync.isPending ? 'Synchronisiere …' : 'Jetzt synchronisieren'}</Button>
              {(i!.hasPassword || i!.hasApiKey) && <Button variant="danger" onClick={() => setClear(true)}>Zugangsdaten löschen</Button>}
            </>}
          </div>
        )}
        <div className="mt-2"><Msg msg={msg} /></div>
      </Card>
      <Card title="Verbindungsstatus">
        <dl className="space-y-2 text-sm">
          <div><dt className="text-xs text-muted">Status</dt><dd><Badge tone={CONN[i!.status]?.[1] ?? 'neutral'}>{CONN[i!.status]?.[0] ?? i!.status}</Badge></dd></div>
          {i!.endpoint && <div><dt className="text-xs text-muted">API-Endpunkt</dt><dd className="break-all font-mono text-xs">{i!.endpoint}</dd></div>}
          <div><dt className="text-xs text-muted">Letzter Test</dt><dd>{fmt(i!.lastTestAt)}</dd></div>
          <div><dt className="text-xs text-muted">Letzte erfolgreiche Verbindung/Synchronisierung</dt><dd>{fmt(i!.lastSuccessAt)}</dd></div>
          <div><dt className="text-xs text-muted">Letzte Synchronisierung</dt><dd>{fmt(i!.lastSyncAt)}{i!.lastSyncStatus && <> · <Badge tone={i!.lastSyncStatus === 'OK' ? 'success' : i!.lastSyncStatus === 'PARTIAL' ? 'warning' : 'danger'}>{i!.lastSyncStatus === 'OK' ? 'OK' : i!.lastSyncStatus === 'PARTIAL' ? 'teilweise' : 'Fehler'}</Badge></>}</dd></div>
          {i!.lastError && <div role="alert"><dt className="text-xs text-muted">Letzte Fehlermeldung</dt><dd className="text-danger">{i!.lastError}</dd></div>}
        </dl>
      </Card>
      <ConfirmDialog open={clear} danger title="Zugangsdaten löschen?" message="Passwort und API-Schlüssel werden vom Server entfernt. Die Synchronisierung funktioniert erst wieder nach neuer Eingabe." confirmLabel="Löschen" busy={save.isPending} onClose={() => setClear(false)} onConfirm={() => save.mutate(true)} />
    </div>
  );
}

// =====================================================================================================
function ImportExportTab() {
  const { can } = useAuth();
  const refresh = useInvalidate();
  const [status, setStatus] = useState('active');
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const download = async () => {
    setBusy(true); setErr(undefined);
    try {
      const res = await fetch(`/api/v1/radio-whitelist/export?status=${status}`, { credentials: 'same-origin', headers: apiHeaders() });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? `Export fehlgeschlagen (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `funk-whitelist-${new Date().toISOString().slice(0, 10)}.csv` });
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Export fehlgeschlagen'); } finally { setBusy(false); }
  };
  const run = useMutation({ mutationFn: (dryRun: boolean) => api<ImportReport>('/radio-whitelist/import', { body: { csv, dryRun } }), onSuccess: (r) => { setReport(r); setConfirm(false); if (!r.dryRun) refresh(); }, onError: (e) => { setConfirm(false); setErr(errText(e)); } });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><Download size={15} aria-hidden /> Export (CSV)</span>}>
        <p className="mb-3 text-sm text-muted">Für Funkdienste ohne API (z. B. kostenlose Zello-App): Liste exportieren und im Funkdienst abgleichen. Spalten: discord_id, discord_name, external_name, status, rank, department, expires_at, reason.</p>
        <div className="flex flex-wrap gap-2"><Select aria-label="Welche Einträge" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select><Button disabled={busy} onClick={() => void download()}>{busy ? 'Lädt …' : 'CSV herunterladen'}</Button></div>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      </Card>
      <Card title={<span className="flex items-center gap-2"><Upload size={15} aria-hidden /> Import (CSV)</span>}>
        {!can('radiowhitelist.grant') ? <p className="text-sm text-muted">Für den Import brauchst du das Recht „Funk-Whitelist: freischalten“.</p> : (
          <div className="space-y-3">
            <p className="text-sm text-muted">Erste Zeile = Spaltennamen, Pflicht ist <code>discord_id</code>. Neue Discord-IDs werden als aktive Freigabe angelegt; vorhandene Einträge werden nur ergänzt (Name, Funkname, Dienstgrad, Abteilung). Status werden nie per Import geändert, nichts wird gelöscht. Erst Probelauf, dann übernehmen.</p>
            <input type="file" accept=".csv,text/csv" aria-label="CSV-Datei wählen" className="text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((t) => { setCsv(t); setReport(null); }); }} />
            <Textarea aria-label="CSV-Inhalt" rows={6} className="font-mono text-xs" value={csv} onChange={(e) => { setCsv(e.target.value); setReport(null); }} placeholder={'discord_id,discord_name,external_name,rank,department,expires_at,reason\n123456789012345678,Max,max_zello,POK,Streife,2026-12-31,Import'} />
            <div className="flex gap-2"><Button variant="secondary" disabled={!csv.trim() || run.isPending} onClick={() => run.mutate(true)}>Probelauf</Button><Button disabled={!report?.dryRun || run.isPending || report.created + report.updated === 0} onClick={() => setConfirm(true)}>Übernehmen</Button></div>
            {report && (
              <div className="rounded border border-line p-3 text-sm">
                <p className="font-medium">{report.dryRun ? 'Probelauf' : 'Import abgeschlossen'}: {report.created} neu · {report.updated} ergänzt · {report.unchanged} unverändert · {report.errors.length} Fehler</p>
                {!!report.errors.length && <ul className="mt-1 max-h-40 overflow-auto text-xs text-danger">{report.errors.map((e) => <li key={`${e.line}${e.message}`}>Zeile {e.line}: {e.message}</li>)}</ul>}
              </div>
            )}
          </div>
        )}
      </Card>
      <ConfirmDialog open={confirm} title="Import übernehmen?" message={report ? `${report.created} neue Freigaben anlegen und ${report.updated} Einträge ergänzen? Zeilen mit Fehlern werden übersprungen.` : ''} confirmLabel="Übernehmen" busy={run.isPending} onClose={() => setConfirm(false)} onConfirm={() => run.mutate(false)} />
    </div>
  );
}

// =====================================================================================================
function LogsTab() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['radiowl', 'logs', q, page], queryFn: () => api<Page<LogRow>>('/radio-whitelist/logs', { query: { q: q.trim() || undefined, page, pageSize: 50 } }), placeholderData: (p) => p });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const detail = (l: LogRow): ReactNode => {
    const a = l.after as Record<string, unknown> | null;
    if (!a || typeof a !== 'object') return null;
    const id = a.discordName ?? a.discordId;
    return id ? <span className="text-muted"> · {String(id)}</span> : null;
  };
  return (
    <Card title="Änderungsprotokoll" actions={<span className="text-xs text-muted">unveränderlich – kann weder bearbeitet noch gelöscht werden</span>}>
      <Input aria-label="Protokoll durchsuchen" className="mb-3" placeholder="Aktion, Begründung, ID …" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {list.isLoading ? <SkeletonRows rows={8} /> : list.error ? <ErrorState error={list.error} /> : !list.data?.items.length ? <EmptyState text="Noch keine Einträge." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="px-2 py-2 font-medium">Zeit</th><th className="px-2 py-2 font-medium">Wer</th><th className="px-2 py-2 font-medium">Was</th><th className="hidden px-2 py-2 font-medium md:table-cell">Begründung</th></tr></thead>
            <tbody>{list.data.items.map((l) => (
              <tr key={l.id} className="border-b border-line/60 align-top">
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted">{fmt(l.createdAt)}</td>
                <td className="px-2 py-1.5">{l.actorName}</td>
                <td className="px-2 py-1.5">{l.result !== 'SUCCESS' && <Badge tone="danger">{l.result === 'FAILED' ? 'Fehler' : l.result}</Badge>} {ACTION_LABEL[l.action] ?? l.action}{detail(l)}</td>
                <td className="hidden px-2 py-1.5 text-xs text-muted md:table-cell">{l.reason ?? ''}</td>
              </tr>
            ))}</tbody>
          </table>
          {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><span className="text-muted">Seite {page} / {pages}</span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button></div>}
        </div>
      )}
    </Card>
  );
}
