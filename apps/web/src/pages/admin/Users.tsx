import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALL_PERMISSIONS } from '@enrp/shared';
import { api, ApiError, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Badge, Button, Card, ConfirmDialog, Field, fmt, Input, Modal, Select, StatusBadge } from '../../components/ui';
import { DataTable, useDebounced, useTablePageSize } from '../../components/DataTable';
import { FormModal } from '../../components/FormModal';

interface U { id: string; username: string; displayName: string; active: boolean; lastLogin: string | null; totpEnabledAt?: string | null; robloxUserId: string | null; robloxUsername: string | null; robloxStatus: string; roles: { role: { id: string; name: string } }[]; overrides: { permissionKey: string; effect: string; reason: string | null }[] }
interface Role { id: string; name: string }

export function Users() {
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState<U>();
  const q = useDebounced(search);
  const [pageSize, setPageSize] = useTablePageSize();
  const list = useQuery({ queryKey: ['users', page, pageSize, q], queryFn: () => api<Page<U>>('/users', { query: { page, pageSize, q: q || undefined } }), placeholderData: (p) => p });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles'), enabled: can('roles.view') });
  const manage = can('users.manage');
  return (
    <>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-xl font-semibold">Benutzer</h1>{manage && <Button onClick={() => setCreating(true)}>Neuer Benutzer</Button>}</div>
      <DataTable<U> rows={list.data?.items} total={list.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} search={search} onSearch={(s) => { setSearch(s); setPage(1); }}
        onRowClick={setSel} empty={{ text: 'Keine Benutzer gefunden.' }}
        columns={[{ key: 'username', label: 'Benutzername' }, { key: 'displayName', label: 'Name' }, { key: 'roles', label: 'Rollen', render: (u) => u.roles.map((r) => r.role.name).join(', ') || '—' }, { key: 'roblox', label: 'Roblox', render: (u) => u.robloxUserId ? <span>{u.robloxUserId} <Badge>{u.robloxStatus}</Badge></span> : '—' }, { key: 'active', label: 'Status', render: (u) => <StatusBadge status={u.active ? 'ACTIVE' : 'OFF_DUTY'} /> }, { key: 'lastLogin', label: 'Letzte Anmeldung', render: (u) => fmt(u.lastLogin) }]} />
      <FormModal open={creating} onClose={() => setCreating(false)} title="Neuer Benutzer" endpoint="/users" invalidate={[['users']]}
        fields={[{ name: 'username', label: 'Benutzername', required: true, min: 3, max: 32 }, { name: 'displayName', label: 'Anzeigename', required: true }, { name: 'password', label: 'Startpasswort', type: 'password', required: true, min: 12, hint: 'Mindestens 12 Zeichen.' }, { name: 'email', label: 'E-Mail (optional)' }]} />
      {sel && <UserDrawer user={sel} roles={roles.data ?? []} manage={manage} canRoles={can('roles.manage')} isSelf={sel.id === me?.id} onClose={() => { setSel(undefined); void qc.invalidateQueries({ queryKey: ['users'] }); }} />}
    </>
  );
}

function UserDrawer({ user, roles, manage, canRoles, isSelf, onClose }: { user: U; roles: Role[]; manage: boolean; canRoles: boolean; isSelf: boolean; onClose: () => void }) {
  const [u, setU] = useState(user);
  const [err, setErr] = useState<string>();
  const [rid, setRid] = useState(''); const [rname, setRname] = useState('');
  const [perm, setPerm] = useState<string>(ALL_PERMISSIONS[0]!); const [effect, setEffect] = useState('DENY'); const [why, setWhy] = useState('');
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirm2fa, setConfirm2fa] = useState(false);
  const refresh = async () => setU(await api<U>(`/users/${u.id}`));
  const run = async (fn: () => Promise<unknown>) => { try { setErr(undefined); await fn(); await refresh(); } catch (e) { setErr(e instanceof ApiError ? `${e.message}${e.requestId ? ` (Anfrage-ID ${e.requestId})` : ''}` : 'Fehlgeschlagen'); } };
  const setRoles = useMutation({ mutationFn: (ids: string[]) => api(`/users/${u.id}/roles`, { method: 'PUT', body: { roleIds: ids } }) });
  const roleIds = u.roles.map((r) => r.role.id);
  return (
    <Modal open title={`${u.displayName} (@${u.username})`} onClose={onClose} wide>
      <div className="space-y-5">
        {err && <div role="alert" className="rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
        <Card title="Roblox-Identität">
          <p className="mb-2 text-sm">Aktuell: {u.robloxUserId ? <>{u.robloxUsername ?? '—'} · ID {u.robloxUserId} <Badge>{u.robloxStatus}</Badge></> : 'nicht verknüpft'}</p>
          {manage && <div className="flex flex-wrap items-end gap-2"><Field label="Roblox-Benutzer-ID (manuell)">{(id) => <Input id={id} value={rid} onChange={(e) => setRid(e.target.value)} placeholder="123456789" />}</Field><Field label="Roblox-Benutzername">{(id) => <Input id={id} value={rname} onChange={(e) => setRname(e.target.value)} />}</Field><Button disabled={!rid} onClick={() => void run(() => api(`/users/${u.id}/roblox`, { method: 'PUT', body: { robloxUserId: rid, robloxUsername: rname || undefined } }))}>Manuell speichern</Button>{u.robloxUserId && <Button variant="secondary" onClick={() => void run(() => api(`/users/${u.id}/roblox`, { method: 'PUT', body: { robloxUserId: null } }))}>Verknüpfung lösen</Button>}</div>}
        </Card>
        <Card title="Rollen">
          <div className="flex flex-wrap gap-2">{roles.map((r) => <label key={r.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={!canRoles} checked={roleIds.includes(r.id)} onChange={(e) => void run(() => setRoles.mutateAsync(e.target.checked ? [...roleIds, r.id] : roleIds.filter((x) => x !== r.id)))} />{r.name}</label>)}</div>
        </Card>
        <Card title="Individuelle Rechte-Ausnahmen" >
          <p className="mb-2 text-xs text-muted">Reihenfolge: Benutzer verbieten → Benutzer erlauben → Rolle verbieten → Rolle erlauben → standardmäßig verboten.</p>
          {u.overrides.length === 0 ? <p className="text-sm text-muted">Keine Ausnahmen.</p> : <ul className="mb-3 space-y-1">{u.overrides.map((o) => <li key={o.permissionKey} className="flex items-center justify-between text-sm"><span><Badge tone={o.effect === 'DENY' ? 'danger' : 'success'}>{o.effect === 'DENY' ? 'Verbieten' : 'Erlauben'}</Badge> <code>{o.permissionKey}</code> {o.reason && <span className="text-xs text-muted">— {o.reason}</span>}</span>{canRoles && <Button size="sm" variant="ghost" onClick={() => void run(() => api(`/users/${u.id}/overrides/${o.permissionKey}`, { method: 'DELETE' }))}>Entfernen</Button>}</li>)}</ul>}
          {canRoles && <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr_auto]"><Field label="Recht">{(id) => <Select id={id} value={perm} onChange={(e) => setPerm(e.target.value)}>{ALL_PERMISSIONS.map((p) => <option key={p}>{p}</option>)}</Select>}</Field><Field label="Wirkung">{(id) => <Select id={id} value={effect} onChange={(e) => setEffect(e.target.value)}><option value="ALLOW">Erlauben</option><option value="DENY">Verbieten</option></Select>}</Field><Field label="Grund">{(id) => <Input id={id} value={why} onChange={(e) => setWhy(e.target.value)} />}</Field><Button onClick={() => void run(() => api(`/users/${u.id}/overrides`, { method: 'PUT', body: { permission: perm, effect, reason: why || undefined } }))}>Ausnahme setzen</Button></div>}
        </Card>
        <Card title="Zwei-Faktor-Anmeldung">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{u.totpEnabledAt ? <>Aktiv seit {fmt(u.totpEnabledAt)}</> : 'Nicht eingerichtet'}</span>{manage && !isSelf && u.totpEnabledAt && <Button variant="secondary" onClick={() => setConfirm2fa(true)}>Zurücksetzen</Button>}</div>
        </Card>
        {manage && !isSelf && <div className="flex justify-end">{u.active ? <Button variant="danger" onClick={() => setConfirmDisable(true)}>Konto deaktivieren</Button> : <Button onClick={() => void run(() => api(`/users/${u.id}/active`, { method: 'PUT', body: { active: true } }))}>Konto aktivieren</Button>}</div>}
      </div>
      <ConfirmDialog open={confirmDisable} danger title="Konto deaktivieren" message="Der Benutzer wird sofort abgemeldet und kann sich erst nach Reaktivierung wieder anmelden. Wird protokolliert." confirmLabel="Deaktivieren" onClose={() => setConfirmDisable(false)} onConfirm={() => { setConfirmDisable(false); void run(() => api(`/users/${u.id}/active`, { method: 'PUT', body: { active: false } })); }} />
      <ConfirmDialog open={confirm2fa} danger title="Zwei-Faktor zurücksetzen" message="Nur wenn die Person ihr Handy und ihre Wiederherstellungscodes verloren hat – Identität vorher prüfen. Danach reicht das Passwort, bis sie 2FA neu einrichtet. Wird protokolliert." confirmLabel="Zurücksetzen" onClose={() => setConfirm2fa(false)} onConfirm={() => { setConfirm2fa(false); void run(() => api(`/users/${u.id}/2fa/reset`, { method: 'POST' })); }} />
    </Modal>
  );
}
