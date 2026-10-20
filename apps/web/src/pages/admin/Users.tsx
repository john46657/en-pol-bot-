import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, ShieldCheck } from 'lucide-react';
import { api, ApiError, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { guildName, useGuilds, useServer } from '../../lib/guilds';
import { EDITOR_CATALOG, ACTION_LABELS, MODULE_LABELS, permLabel } from '../../lib/permLabels';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, fmt, Input, Modal, PageHeader, Select, SkeletonRows, StatusBadge, Tabs } from '../../components/ui';
import { DataTable, useDebounced, useTablePageSize } from '../../components/DataTable';
import { FormModal } from '../../components/FormModal';

interface RoleRef { id: string; name: string; guildId: string | null; color: string | null; icon: string | null; priority: number; active: boolean }
interface Assignment { guildIds: string[]; role: RoleRef }
interface Override { permissionKey: string; effect: 'ALLOW' | 'DENY'; reason: string | null }
interface U {
  id: string; username: string; displayName: string; email?: string | null; active: boolean; createdAt?: string; lastLogin: string | null; totpEnabledAt?: string | null;
  discord?: { discordId: string; linkedAt: string } | null; robloxUserId: string | null; robloxUsername: string | null; robloxStatus: string;
  roles: Assignment[]; overrides: Override[]; rank?: number | null;
}
interface Role extends RoleRef { description: string | null }
interface Effective { roles: RoleRef[]; entries: { key: string; allowed: boolean; source: 'USER_DENY' | 'USER_ALLOW' | 'ROLE_DENY' | 'ROLE_ALLOW' | 'DEFAULT_DENY'; via: string[] }[] }

const ADMIN = 'System Administrator';
const NO_RANK = Number.MAX_SAFE_INTEGER;
const TABS = ['Übersicht', 'Rollen', 'Rechte', 'Sicherheit'];
const errText = (e: unknown) => (e instanceof ApiError ? `${e.message}${e.requestId ? ` (Anfrage-ID ${e.requestId})` : ''}` : 'Fehlgeschlagen');

/** Farbpunkt + Icon + Name; über Discord vergebene Rollen sind markiert. */
export function RoleChip({ role, viaDiscord }: { role: Pick<RoleRef, 'name' | 'color' | 'icon' | 'active'>; viaDiscord?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs ${role.active ? '' : 'opacity-60 line-through'}`} title={viaDiscord ? 'über Discord-Rolle vergeben' : undefined}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: role.color ?? 'var(--color-muted)' }} />
      {role.icon && <span aria-hidden>{role.icon}</span>}
      <span className="truncate">{role.name}</span>
      {viaDiscord && <span className="text-[10px] text-muted">· Discord</span>}
    </span>
  );
}

const Avatar = ({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) => (
  <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary ${size === 'lg' ? 'h-12 w-12 text-lg' : 'h-7 w-7 text-xs'}`}>{name.trim().charAt(0).toUpperCase() || '?'}</span>
);

/** Benutzer: Liste mit Filtern, Detailansicht mit Rollen, effektiven Rechten (mit Herkunft) und Sicherheit. Die API prüft Rang und Rechte selbst. */
export function Users() {
  const { can } = useAuth();
  const [server] = useServer();
  const guilds = useGuilds();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [roleId, setRoleId] = useState('');
  const [linked, setLinked] = useState('');
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState<string>();
  const q = useDebounced(search);
  const [pageSize, setPageSize] = useTablePageSize();
  const filters = { page, pageSize, q: q || undefined, status: status || undefined, roleId: roleId || undefined, linked: linked || undefined };
  const list = useQuery({ queryKey: ['users', server, filters], queryFn: () => api<Page<U>>('/users', { query: filters }), placeholderData: (p) => p });
  const roles = useQuery({ queryKey: ['roles', server], queryFn: () => api<Role[]>('/roles'), enabled: can('roles.view') });
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const filtered = !!(status || roleId || linked);
  return (
    <>
      <PageHeader title="Benutzer" subtitle={server ? `Rollen und Sonderrechte für ${guildName(guilds.data, server)} – auf anderen Servern gelten eigene.` : 'Alle Server: Rollen werden mit ihrem Server angezeigt; Änderungen gelten für serverübergreifende Rollen.'}
        actions={can('users.manage') && <Button onClick={() => setCreating(true)}><Plus size={14} />Neuer Benutzer</Button>} />
      <DataTable<U> rows={list.data?.items} total={list.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
        loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} search={search} onSearch={reset(setSearch)} onRowClick={(u) => setSel(u.id)}
        empty={{ text: filtered || q ? 'Keine Benutzer zu diesen Filtern.' : 'Keine Benutzer gefunden.', hint: 'Suche nach Name, Benutzername, Roblox- oder Discord-ID.' }}
        toolbar={<div className="flex flex-wrap gap-2">
          <Select aria-label="Status" className="w-auto py-1 text-sm" value={status} onChange={(e) => reset(setStatus)(e.target.value)}><option value="">Alle Status</option><option value="active">Aktiv</option><option value="inactive">Deaktiviert</option></Select>
          {roles.data && <Select aria-label="Rolle" className="w-auto py-1 text-sm" value={roleId} onChange={(e) => reset(setRoleId)(e.target.value)}><option value="">Alle Rollen</option>{roles.data.map((r) => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ''}{r.name}{!server && r.guildId ? ` (${guildName(guilds.data, r.guildId)})` : ''}</option>)}</Select>}
          <Select aria-label="Discord" className="w-auto py-1 text-sm" value={linked} onChange={(e) => reset(setLinked)(e.target.value)}><option value="">Discord: alle</option><option value="yes">mit Discord</option><option value="no">ohne Discord</option></Select>
          {filtered && <Button size="sm" variant="ghost" onClick={() => { setStatus(''); setRoleId(''); setLinked(''); setPage(1); }}>Filter zurücksetzen</Button>}
        </div>}
        columns={[
          { key: 'user', label: 'Benutzer', render: (u) => <span className="flex min-w-0 items-center gap-2"><Avatar name={u.displayName} /><span className="min-w-0"><span className="block truncate font-medium">{u.displayName}</span><span className="block truncate text-xs text-muted">@{u.username}</span></span></span> },
          { key: 'roles', label: 'Rollen', render: (u) => u.roles.length ? <span className="flex flex-wrap gap-1">{u.roles.slice(0, 3).map((r) => <RoleChip key={r.role.id} role={r.role} viaDiscord={r.guildIds.length > 0} />)}{u.roles.length > 3 && <span className="text-xs text-muted">+{u.roles.length - 3}</span>}</span> : <span className="text-muted">—</span> },
          { key: 'discord', label: 'Discord', render: (u) => (u.discord ? <Badge tone="info">verknüpft</Badge> : <span className="text-muted">—</span>) },
          { key: '2fa', label: '2FA', render: (u) => (u.totpEnabledAt ? <Badge tone="success">aktiv</Badge> : <span className="text-muted">—</span>) },
          { key: 'roblox', label: 'Roblox', render: (u) => (u.robloxUserId ? <span>{u.robloxUsername ?? u.robloxUserId}</span> : <span className="text-muted">—</span>) },
          { key: 'active', label: 'Status', render: (u) => (u.active ? <Badge tone="success">aktiv</Badge> : <Badge tone="danger">deaktiviert</Badge>) },
          { key: 'lastLogin', label: 'Letzte Anmeldung', render: (u) => fmt(u.lastLogin) },
        ]} />
      <FormModal open={creating} onClose={() => setCreating(false)} title="Neuer Benutzer" endpoint="/users" invalidate={[['users']]}
        fields={[{ name: 'username', label: 'Benutzername', required: true, min: 3, max: 32, hint: 'Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich.' }, { name: 'displayName', label: 'Anzeigename', required: true }, { name: 'password', label: 'Startpasswort', type: 'password', required: true, min: 12, hint: 'Mindestens 12 Zeichen.' }, { name: 'email', label: 'E-Mail (optional)' }]} />
      {sel && <UserDetail id={sel} roles={roles.data} onClose={() => setSel(undefined)} />}
    </>
  );
}

function UserDetail({ id, roles, onClose }: { id: string; roles: Role[] | undefined; onClose: () => void }) {
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const [server] = useServer();
  const guilds = useGuilds();
  const [tab, setTab] = useState(TABS[0]!);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const detail = useQuery({ queryKey: ['user', id, server], queryFn: () => api<U>(`/users/${id}`) });
  const rank = useQuery({ queryKey: ['my-rank', server], queryFn: () => api<{ rank: number }>('/roles/my-rank'), enabled: can('roles.view') });
  const u = detail.data;
  const isSelf = id === me?.id;
  const owner = !!me?.roles.includes(ADMIN);
  const myRank = rank.data?.rank ?? NO_RANK;
  // Benutzer ohne Rolle darf jeder mit Rang verwalten, sonst nur von oben (gleiche Regel wie die API)
  const outranks = owner || (myRank !== NO_RANK && (u?.rank == null || myRank < u.rank));
  const manage = can('users.manage') && !isSelf && outranks;
  const manageRoles = can('roles.manage') && !isSelf && outranks;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { setErr(undefined); await fn(); await Promise.all([qc.invalidateQueries({ queryKey: ['user', id] }), qc.invalidateQueries({ queryKey: ['user-perms', id] }), qc.invalidateQueries({ queryKey: ['users'] })]); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open title={u ? u.displayName : 'Benutzer'} onClose={onClose} wide>
      {detail.isLoading ? <SkeletonRows /> : detail.error || !u ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={u.displayName} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{u.displayName} <span className="text-sm font-normal text-muted">@{u.username}</span></p>
              <div className="mt-1 flex flex-wrap items-center gap-1">{u.active ? <Badge tone="success">aktiv</Badge> : <Badge tone="danger">deaktiviert</Badge>}{u.discord && <Badge tone="info">Discord</Badge>}{u.totpEnabledAt && <Badge tone="success">2FA</Badge>}{u.roles.slice(0, 4).map((r) => <RoleChip key={r.role.id} role={r.role} viaDiscord={r.guildIds.length > 0} />)}</div>
            </div>
          </div>
          {isSelf ? <p className="rounded bg-panel-2 p-2 text-xs text-muted">Das ist dein eigenes Konto: Rollen, Sonderrechte und Status ändert jemand anderes (Vier-Augen-Prinzip). Deinen Namen änderst du unter Persönlich.</p>
            : !outranks && (can('users.manage') || can('roles.manage')) && <p className="flex items-center gap-1.5 rounded bg-panel-2 p-2 text-xs text-muted"><Lock size={12} />Nur ansehen: Dieser Benutzer steht nicht unter deinem Rang.</p>}
          {err && <div role="alert" className="rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          {tab === 'Übersicht' && <Overview u={u} manage={manage} busy={busy} run={run} />}
          {tab === 'Rollen' && <RolesTab u={u} roles={roles} manage={manageRoles} owner={owner} myRank={myRank} server={server} guildLabel={(g) => guildName(guilds.data, g)} busy={busy} run={run} />}
          {tab === 'Rechte' && <PermsTab u={u} manage={manageRoles} busy={busy} run={run} />}
          {tab === 'Sicherheit' && <Security u={u} manage={manage} run={run} onDeleted={onClose} setErr={setErr} />}
        </div>
      )}
    </Modal>
  );
}

type Run = (fn: () => Promise<unknown>) => Promise<void>;

function Overview({ u, manage, busy, run }: { u: U; manage: boolean; busy: boolean; run: Run }) {
  const [dname, setDname] = useState(u.displayName);
  const [rid, setRid] = useState(''); const [rname, setRname] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  useEffect(() => setDname(u.displayName), [u.displayName]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Konto">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Benutzername</dt><dd>@{u.username}</dd>
          {u.email && <><dt className="text-muted">E-Mail</dt><dd className="truncate">{u.email}</dd></>}
          <dt className="text-muted">Angelegt</dt><dd>{fmt(u.createdAt)}</dd>
          <dt className="text-muted">Letzte Anmeldung</dt><dd>{fmt(u.lastLogin)}</dd>
        </dl>
        {manage && <div className="mt-3 flex flex-wrap items-end gap-2"><Field label="Anzeigename">{(fid) => <Input id={fid} maxLength={64} value={dname} onChange={(e) => setDname(e.target.value)} />}</Field><Button disabled={busy || !dname.trim() || dname.trim() === u.displayName} onClick={() => void run(() => api(`/users/${u.id}/name`, { method: 'PUT', body: { displayName: dname.trim() } }))}>Speichern</Button></div>}
      </Card>
      <Card title="Discord">
        <p className="text-sm">{u.discord ? <>ID <code>{u.discord.discordId}</code><br /><span className="text-xs text-muted">verknüpft seit {fmt(u.discord.linkedAt)}</span></> : 'Nicht verknüpft – Discord-Rollen und Bot-Befehle gelten erst nach der Verknüpfung.'}</p>
        {manage && u.discord && <Button className="mt-3" size="sm" variant="secondary" onClick={() => setConfirmUnlink(true)}>Verknüpfung lösen</Button>}
      </Card>
      <Card title="Roblox-Identität" className="md:col-span-2">
        <p className="mb-2 text-sm">{u.robloxUserId ? <>{u.robloxUsername ?? '—'} · ID {u.robloxUserId} <Badge>{u.robloxStatus}</Badge></> : 'Nicht verknüpft.'}</p>
        {manage && <div className="flex flex-wrap items-end gap-2"><Field label="Roblox-Benutzer-ID">{(fid) => <Input id={fid} value={rid} inputMode="numeric" onChange={(e) => setRid(e.target.value.trim())} placeholder="123456789" />}</Field><Field label="Roblox-Benutzername">{(fid) => <Input id={fid} value={rname} onChange={(e) => setRname(e.target.value)} />}</Field>
          <Button disabled={busy || !rid} onClick={() => void run(async () => { await api(`/users/${u.id}/roblox`, { method: 'PUT', body: { robloxUserId: rid, robloxUsername: rname || undefined } }); setRid(''); setRname(''); })}>Manuell speichern</Button>
          {u.robloxUserId && <Button variant="secondary" disabled={busy} onClick={() => void run(() => api(`/users/${u.id}/roblox`, { method: 'PUT', body: { robloxUserId: null } }))}>Verknüpfung lösen</Button>}</div>}
      </Card>
      <ConfirmDialog open={confirmUnlink} danger title="Discord-Verknüpfung lösen" message="Bot-Befehle und Discord-Rollen gelten danach nicht mehr für dieses Konto, bis es neu verknüpft wird. Wird protokolliert." confirmLabel="Lösen" onClose={() => setConfirmUnlink(false)} onConfirm={() => { setConfirmUnlink(false); void run(() => api(`/discord/links/${u.id}`, { method: 'DELETE' })); }} />
    </div>
  );
}

/**
 * Rollen im gewählten Bereich: manuell vergebene sind umschaltbar (nur unterhalb des eigenen Rangs), über Discord vergebene
 * pflegt der Discord-Abgleich, Rollen anderer Server werden nur angezeigt.
 */
function RolesTab({ u, roles, manage, owner, myRank, server, guildLabel, busy, run }: { u: U; roles: Role[] | undefined; manage: boolean; owner: boolean; myRank: number; server: string; guildLabel: (g: string) => string | null; busy: boolean; run: Run }) {
  const inScope = (r: { guildId: string | null }) => (server ? r.guildId === server : r.guildId === null);
  const held = new Map(u.roles.map((a) => [a.role.id, a]));
  const manual = u.roles.filter((a) => inScope(a.role) && !a.guildIds.length).map((a) => a.role.id);
  const other = u.roles.filter((a) => !inScope(a.role));
  const assignable = (roles ?? []).filter(inScope);
  const canTouch = (r: Role) => manage && (owner || (r.name !== ADMIN && r.priority > myRank));
  const toggle = (r: Role, on: boolean) => run(() => api(`/users/${u.id}/roles`, { method: 'PUT', body: { roleIds: on ? [...manual, r.id] : manual.filter((x) => x !== r.id) } }));
  if (!roles) return <EmptyState text="Rollen nicht verfügbar." hint="Zum Zuweisen fehlt „roles.view“." />;
  return (
    <div className="space-y-4">
      <Card title={`Rollen${server ? ` auf ${guildLabel(server)}` : ' (serverübergreifend)'}`}>
        {!assignable.length ? <EmptyState text="In diesem Bereich gibt es noch keine Rollen." hint="Rollen legst du unter „Rollen & Rechte“ an." /> : (
          <ul className="divide-y divide-line">
            {assignable.map((r) => {
              const a = held.get(r.id), viaDiscord = !!a?.guildIds.length, locked = !canTouch(r) || viaDiscord;
              return (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <input type="checkbox" aria-label={`Rolle ${r.name}`} disabled={busy || locked} checked={!!a} onChange={(e) => void toggle(r, e.target.checked)} />
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color ?? 'var(--color-muted)' }} />
                  <span className="min-w-0 flex-1"><span className={`block truncate text-sm ${r.active ? '' : 'text-muted line-through'}`}>{r.icon} {r.name}</span>{r.description && <span className="block truncate text-xs text-muted">{r.description}</span>}</span>
                  {viaDiscord && <Badge tone="info">über Discord</Badge>}
                  {!r.active && <Badge tone="warning">deaktiviert</Badge>}
                  {manage && !canTouch(r) && <span title="Steht nicht unter deinem Rang" className="text-muted"><Lock size={12} /></span>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Oben = höchster Rang. „Über Discord“ vergebene Rollen kommen und gehen mit der verknüpften Discord-Rolle (laufender Abgleich) und lassen sich hier nicht abwählen.</p>
      </Card>
      {other.length > 0 && <Card title="Gilt in anderen Bereichen">
        <ul className="flex flex-wrap gap-2">{other.map((a) => <li key={a.role.id} className="flex items-center gap-1"><RoleChip role={a.role} viaDiscord={a.guildIds.length > 0} /><span className="text-xs text-muted">{a.role.guildId ? guildLabel(a.role.guildId) : 'alle Server'}</span></li>)}</ul>
        <p className="mt-2 text-xs text-muted">Diese Rollen änderst du, wenn oben links der jeweilige Server gewählt ist.</p>
      </Card>}
    </div>
  );
}

const SOURCE: Record<Effective['entries'][number]['source'], { label: string; tone: 'success' | 'danger' | 'neutral' | 'warning' }> = {
  USER_ALLOW: { label: 'Sonderrecht erlaubt', tone: 'success' }, USER_DENY: { label: 'Sonderrecht verweigert', tone: 'danger' },
  ROLE_ALLOW: { label: 'über Rolle', tone: 'success' }, ROLE_DENY: { label: 'Rolle verweigert', tone: 'danger' }, DEFAULT_DENY: { label: 'nicht vergeben', tone: 'neutral' },
};

/** Sonderrechte (Ausnahmen) und die tatsächlich wirksamen Rechte mit ihrer Herkunft. */
function PermsTab({ u, manage, busy, run }: { u: U; manage: boolean; busy: boolean; run: Run }) {
  const [server] = useServer();
  const eff = useQuery({ queryKey: ['user-perms', u.id, server], queryFn: () => api<Effective>(`/users/${u.id}/permissions`) });
  const [filter, setFilter] = useState('');
  const [only, setOnly] = useState<'all' | 'allowed' | 'denied'>('allowed');
  const [perm, setPerm] = useState(''); const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('DENY'); const [why, setWhy] = useState('');
  const groups = useMemo(() => {
    const f = filter.toLowerCase();
    const byKey = new Map((eff.data?.entries ?? []).map((e) => [e.key, e]));
    return Object.entries(EDITOR_CATALOG).map(([mod, actions]) => ({
      mod, items: actions.map((a) => byKey.get(`${mod}.${a}`)).filter((e): e is NonNullable<typeof e> => !!e)
        .filter((e) => (only === 'all' || (only === 'allowed' ? e.allowed : !e.allowed && e.source !== 'DEFAULT_DENY')) && (!f || `${e.key} ${permLabel(e.key)}`.toLowerCase().includes(f))),
    })).filter((g) => g.items.length);
  }, [eff.data, filter, only]);
  const allowedCount = eff.data?.entries.filter((e) => e.allowed).length ?? 0;
  return (
    <div className="space-y-4">
      <Card title={`Sonderrechte (${u.overrides.length})`}>
        <p className="mb-2 text-xs text-muted">Ausnahmen gelten nur für diesen Benutzer und nur im gewählten Server. Reihenfolge: Sonderrecht verweigert → Sonderrecht erlaubt → Rolle verweigert → Rolle erlaubt → sonst verweigert.</p>
        {u.overrides.length === 0 ? <p className="text-sm text-muted">Keine Ausnahmen.</p> : (
          <ul className="mb-3 divide-y divide-line">{u.overrides.map((o) => (
            <li key={o.permissionKey} className="flex items-center gap-2 py-1.5 text-sm">
              <Badge tone={o.effect === 'DENY' ? 'danger' : 'success'}>{o.effect === 'DENY' ? 'verweigert' : 'erlaubt'}</Badge>
              <span className="min-w-0 flex-1"><span className="block truncate">{permLabel(o.permissionKey)}</span><span className="block truncate text-xs text-muted"><code>{o.permissionKey}</code>{o.reason && ` — ${o.reason}`}</span></span>
              {manage && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => api(`/users/${u.id}/overrides/${o.permissionKey}`, { method: 'DELETE' }))}>Entfernen</Button>}
            </li>))}
          </ul>
        )}
        {manage && <div className="grid items-end gap-2 sm:grid-cols-[2fr_auto_2fr_auto]">
          <Field label="Recht">{(fid) => <Select id={fid} value={perm} onChange={(e) => setPerm(e.target.value)}><option value="">– auswählen –</option>{Object.entries(EDITOR_CATALOG).map(([mod, actions]) => <optgroup key={mod} label={MODULE_LABELS[mod] ?? mod}>{actions.map((a) => <option key={a} value={`${mod}.${a}`}>{ACTION_LABELS[a] ?? a} ({mod}.{a})</option>)}</optgroup>)}</Select>}</Field>
          <Field label="Wirkung">{(fid) => <Select id={fid} value={effect} onChange={(e) => setEffect(e.target.value as 'ALLOW' | 'DENY')}><option value="DENY">Verweigern</option><option value="ALLOW">Erlauben</option></Select>}</Field>
          <Field label="Grund (optional)">{(fid) => <Input id={fid} maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)} />}</Field>
          <Button disabled={busy || !perm} onClick={() => void run(async () => { await api(`/users/${u.id}/overrides`, { method: 'PUT', body: { permission: perm, effect, reason: why || undefined } }); setWhy(''); })}>Setzen</Button>
        </div>}
      </Card>
      <Card title={<span className="flex items-center gap-2"><ShieldCheck size={14} />Wirksame Rechte {eff.data && <span className="text-xs font-normal text-muted">{allowedCount} von {eff.data.entries.length} erlaubt</span>}</span>}
        actions={<span className="flex flex-wrap gap-2"><Input aria-label="Recht suchen" className="w-44 py-1 text-xs" placeholder="Recht suchen…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Select aria-label="Anzeigen" className="w-auto py-1 text-xs" value={only} onChange={(e) => setOnly(e.target.value as typeof only)}><option value="allowed">nur erlaubte</option><option value="denied">ausdrücklich verweigerte</option><option value="all">alle</option></Select></span>}>
        {eff.isLoading ? <SkeletonRows /> : eff.error ? <ErrorState error={eff.error} onRetry={() => void eff.refetch()} /> : (
          <>
            {eff.data && <p className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted">Wirksame Rollen: {eff.data.roles.length ? eff.data.roles.map((r) => <RoleChip key={r.id} role={{ ...r, active: true }} />) : 'keine'}</p>}
            {!groups.length ? <EmptyState text="Keine Rechte zu dieser Auswahl." /> : (
              <div className="grid gap-4 md:grid-cols-2">{groups.map((g) => (
                <section key={g.mod}><h4 className="mb-1 text-xs font-semibold uppercase text-muted">{MODULE_LABELS[g.mod] ?? g.mod}</h4>
                  <ul className="space-y-0.5">{g.items.map((e) => (
                    <li key={e.key} className="flex items-center gap-2 text-sm" title={e.key}>
                      <span aria-hidden className={e.allowed ? 'text-success' : 'text-danger'}>{e.allowed ? '✓' : '✕'}</span>
                      <span className="min-w-0 flex-1 truncate">{ACTION_LABELS[e.key.slice(g.mod.length + 1)] ?? e.key}</span>
                      <span className="shrink-0 text-xs text-muted">{e.via.length ? e.via.join(', ') : SOURCE[e.source].label}</span>
                      {manage && !u.overrides.some((o) => o.permissionKey === e.key) && <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={() => { setPerm(e.key); setEffect(e.allowed ? 'DENY' : 'ALLOW'); }}>{e.allowed ? 'entziehen' : 'erlauben'}</button>}
                    </li>))}
                  </ul>
                </section>))}
              </div>
            )}
          </>
        )}
        {manage && <p className="mt-3 text-xs text-muted">„entziehen“/„erlauben“ füllt oben das Formular für ein Sonderrecht vor. Erlauben kannst du nur, was du selbst hast.</p>}
      </Card>
    </div>
  );
}

function Security({ u, manage, run, onDeleted, setErr }: { u: U; manage: boolean; run: Run; onDeleted: () => void; setErr: (e?: string) => void }) {
  const qc = useQueryClient();
  const [confirm2fa, setConfirm2fa] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="space-y-4">
      <Card title="Zwei-Faktor-Anmeldung">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{u.totpEnabledAt ? <>Aktiv seit {fmt(u.totpEnabledAt)}</> : 'Nicht eingerichtet'}</span>{manage && u.totpEnabledAt && <Button variant="secondary" onClick={() => setConfirm2fa(true)}>Zurücksetzen</Button>}</div>
      </Card>
      {manage && <ResetPassword u={u} />}
      <Card title="Kontostatus">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{u.active ? 'Aktiv – kann sich anmelden.' : 'Deaktiviert – Anmeldung gesperrt, alle Sitzungen beendet.'} <StatusBadge status={u.active ? 'ACTIVE' : 'SUSPENDED'} /></span>
          {manage && (u.active ? <Button variant="danger" onClick={() => setConfirmDisable(true)}>Konto deaktivieren</Button> : <Button onClick={() => void run(() => api(`/users/${u.id}/active`, { method: 'PUT', body: { active: true } }))}>Konto aktivieren</Button>)}
        </div>
      </Card>
      {manage && <Card title="Gefahrenzone">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted">Löscht das Konto mit Rollen, Sitzungen, Personalakte und persönlichen Einstellungen.</span><Button variant="danger" onClick={() => setConfirmDelete(true)}>Benutzer löschen</Button></div>
      </Card>}
      <ConfirmDialog open={confirmDelete} danger title="Benutzer löschen" confirmLabel="Endgültig löschen" onClose={() => setConfirmDelete(false)}
        message={<>Konto <b>@{u.username}</b> ({u.displayName}) endgültig löschen? Rollen, Sitzungen, Personalakte und persönliche Einstellungen gehen mit. Das lässt sich nicht rückgängig machen; im Audit-Log bleibt vermerkt, wer gelöscht wurde. Nur sperren: „Konto deaktivieren“.</>}
        onConfirm={() => { setConfirmDelete(false); void (async () => { try { setErr(undefined); await api(`/users/${u.id}`, { method: 'DELETE' }); void qc.invalidateQueries({ queryKey: ['users'] }); onDeleted(); } catch (e) { setErr(errText(e)); } })(); }} />
      <ConfirmDialog open={confirmDisable} danger title="Konto deaktivieren" message="Der Benutzer wird sofort abgemeldet und kann sich erst nach Reaktivierung wieder anmelden. Wird protokolliert." confirmLabel="Deaktivieren" onClose={() => setConfirmDisable(false)} onConfirm={() => { setConfirmDisable(false); void run(() => api(`/users/${u.id}/active`, { method: 'PUT', body: { active: false } })); }} />
      <ConfirmDialog open={confirm2fa} danger title="Zwei-Faktor zurücksetzen" message="Nur wenn die Person ihr Handy und ihre Wiederherstellungscodes verloren hat – Identität vorher prüfen. Danach reicht das Passwort, bis sie 2FA neu einrichtet. Wird protokolliert." confirmLabel="Zurücksetzen" onClose={() => setConfirm2fa(false)} onConfirm={() => { setConfirm2fa(false); void run(() => api(`/users/${u.id}/2fa/reset`, { method: 'POST' })); }} />
    </div>
  );
}

/** Passwort eines Kontos neu setzen (z. B. vergessen) – alle Sitzungen der Person enden. */
function ResetPassword({ u }: { u: U }) {
  const [pw, setPw] = useState('');
  const [ok, setOk] = useState(false);
  // gut lesbar (ohne 0/O, 1/l/I), 16 Zeichen in 4er-Blöcken; Ablehnungsverfahren gegen Verzerrung
  const gen = () => {
    const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const out: string[] = [];
    while (out.length < 16) { const b = crypto.getRandomValues(new Uint8Array(1))[0]!; if (b < 256 - (256 % abc.length)) out.push(abc[b % abc.length]!); }
    setPw(out.join('').replace(/(.{4})(?!$)/g, '$1-')); setOk(false);
  };
  const save = useMutation({ mutationFn: () => api(`/users/${u.id}/password`, { method: 'PUT', body: { password: pw } }), onSuccess: () => setOk(true) });
  return (
    <Card title="Passwort zurücksetzen">
      <p className="mb-2 text-xs text-muted">Neues Passwort für @{u.username} festlegen und der Person sicher mitteilen. Sie wird überall abgemeldet; eine Sperre nach Fehlversuchen wird aufgehoben. Wird protokolliert.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Neues Passwort (mind. 12 Zeichen)">{(id) => <Input id={id} className="w-64 font-mono" autoComplete="off" value={pw} onChange={(e) => { setPw(e.target.value); setOk(false); }} />}</Field>
        <Button variant="secondary" onClick={gen}>Zufällig erzeugen</Button>
        <Button disabled={save.isPending || pw.length < 12} onClick={() => save.mutate()}>Passwort setzen</Button>
        {ok && <><span role="status" className="text-sm text-success">Gesetzt.</span><Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(pw)}>Kopieren</Button></>}
      </div>
      {save.error && <p role="alert" className="mt-2 text-sm text-danger">{save.error instanceof ApiError ? save.error.message : 'Fehlgeschlagen'}</p>}
    </Card>
  );
}
