import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALL_PERMISSIONS } from '@enrp/shared';
import { api, ApiError, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Badge, Button, Card, ConfirmDialog, Field, fmt, Input, Modal, Select, StatusBadge } from '../../components/ui';
import { DataTable, useDebounced } from '../../components/DataTable';
import { FormModal } from '../../components/FormModal';

interface U { id: string; username: string; displayName: string; active: boolean; lastLogin: string | null; robloxUserId: string | null; robloxUsername: string | null; robloxStatus: string; roles: { role: { id: string; name: string } }[]; overrides: { permissionKey: string; effect: string; reason: string | null }[] }
interface Role { id: string; name: string }

export function Users() {
  const { can, user: me } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState<U>();
  const q = useDebounced(search);
  const list = useQuery({ queryKey: ['users', page, q], queryFn: () => api<Page<U>>('/users', { query: { page, q: q || undefined } }), placeholderData: (p) => p });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles'), enabled: can('roles.view') });
  const manage = can('users.manage');
  return (
    <>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-xl font-semibold">Users</h1>{manage && <Button onClick={() => setCreating(true)}>New user</Button>}</div>
      <DataTable<U> rows={list.data?.items} total={list.data?.total ?? 0} page={page} pageSize={25} onPage={setPage} loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} search={search} onSearch={(s) => { setSearch(s); setPage(1); }}
        onRowClick={setSel} empty={{ text: 'No users found.' }}
        columns={[{ key: 'username', label: 'Username' }, { key: 'displayName', label: 'Name' }, { key: 'roles', label: 'Roles', render: (u) => u.roles.map((r) => r.role.name).join(', ') || '—' }, { key: 'roblox', label: 'Roblox', render: (u) => u.robloxUserId ? <span>{u.robloxUserId} <Badge>{u.robloxStatus}</Badge></span> : '—' }, { key: 'active', label: 'Status', render: (u) => <StatusBadge status={u.active ? 'ACTIVE' : 'OFF_DUTY'} /> }, { key: 'lastLogin', label: 'Last login', render: (u) => fmt(u.lastLogin) }]} />
      <FormModal open={creating} onClose={() => setCreating(false)} title="New user" endpoint="/users" invalidate={[['users']]}
        fields={[{ name: 'username', label: 'Username', required: true, min: 3, max: 32 }, { name: 'displayName', label: 'Display name', required: true }, { name: 'password', label: 'Initial password', type: 'password', required: true, min: 12, hint: 'At least 12 characters.' }, { name: 'email', label: 'E-mail (optional)' }]} />
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
  const refresh = async () => setU(await api<U>(`/users/${u.id}`));
  const run = async (fn: () => Promise<unknown>) => { try { setErr(undefined); await fn(); await refresh(); } catch (e) { setErr(e instanceof ApiError ? `${e.message}${e.requestId ? ` (Request ID ${e.requestId})` : ''}` : 'Failed'); } };
  const setRoles = useMutation({ mutationFn: (ids: string[]) => api(`/users/${u.id}/roles`, { method: 'PUT', body: { roleIds: ids } }) });
  const roleIds = u.roles.map((r) => r.role.id);
  return (
    <Modal open title={`${u.displayName} (@${u.username})`} onClose={onClose} wide>
      <div className="space-y-5">
        {err && <div role="alert" className="rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
        <Card title="Roblox identity">
          <p className="mb-2 text-sm">Current: {u.robloxUserId ? <>{u.robloxUsername ?? '—'} · ID {u.robloxUserId} <Badge>{u.robloxStatus}</Badge></> : 'not linked'}</p>
          {manage && <div className="flex flex-wrap items-end gap-2"><Field label="Roblox user ID (manual)">{(id) => <Input id={id} value={rid} onChange={(e) => setRid(e.target.value)} placeholder="123456789" />}</Field><Field label="Roblox username">{(id) => <Input id={id} value={rname} onChange={(e) => setRname(e.target.value)} />}</Field><Button disabled={!rid} onClick={() => void run(() => api(`/users/${u.id}/roblox`, { method: 'PUT', body: { robloxUserId: rid, robloxUsername: rname || undefined } }))}>Save manually</Button>{u.robloxUserId && <Button variant="secondary" onClick={() => void run(() => api(`/users/${u.id}/roblox`, { method: 'PUT', body: { robloxUserId: null } }))}>Unlink</Button>}</div>}
        </Card>
        <Card title="Roles">
          <div className="flex flex-wrap gap-2">{roles.map((r) => <label key={r.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={!canRoles} checked={roleIds.includes(r.id)} onChange={(e) => void run(() => setRoles.mutateAsync(e.target.checked ? [...roleIds, r.id] : roleIds.filter((x) => x !== r.id)))} />{r.name}</label>)}</div>
        </Card>
        <Card title="Individual permission overrides" >
          <p className="mb-2 text-xs text-muted">Order: user DENY → user ALLOW → role DENY → role ALLOW → default deny.</p>
          {u.overrides.length === 0 ? <p className="text-sm text-muted">No overrides.</p> : <ul className="mb-3 space-y-1">{u.overrides.map((o) => <li key={o.permissionKey} className="flex items-center justify-between text-sm"><span><Badge tone={o.effect === 'DENY' ? 'danger' : 'success'}>{o.effect}</Badge> <code>{o.permissionKey}</code> {o.reason && <span className="text-xs text-muted">— {o.reason}</span>}</span>{canRoles && <Button size="sm" variant="ghost" onClick={() => void run(() => api(`/users/${u.id}/overrides/${o.permissionKey}`, { method: 'DELETE' }))}>Remove</Button>}</li>)}</ul>}
          {canRoles && <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr_auto]"><Field label="Permission">{(id) => <Select id={id} value={perm} onChange={(e) => setPerm(e.target.value)}>{ALL_PERMISSIONS.map((p) => <option key={p}>{p}</option>)}</Select>}</Field><Field label="Effect">{(id) => <Select id={id} value={effect} onChange={(e) => setEffect(e.target.value)}><option>ALLOW</option><option>DENY</option></Select>}</Field><Field label="Reason">{(id) => <Input id={id} value={why} onChange={(e) => setWhy(e.target.value)} />}</Field><Button onClick={() => void run(() => api(`/users/${u.id}/overrides`, { method: 'PUT', body: { permission: perm, effect, reason: why || undefined } }))}>Set override</Button></div>}
        </Card>
        {manage && !isSelf && <div className="flex justify-end">{u.active ? <Button variant="danger" onClick={() => setConfirmDisable(true)}>Disable account</Button> : <Button onClick={() => void run(() => api(`/users/${u.id}/active`, { method: 'PUT', body: { active: true } }))}>Enable account</Button>}</div>}
      </div>
      <ConfirmDialog open={confirmDisable} danger title="Disable account" message="The user is signed out immediately and cannot log in until re-enabled. This is audited." confirmLabel="Disable" onClose={() => setConfirmDisable(false)} onConfirm={() => { setConfirmDisable(false); void run(() => api(`/users/${u.id}/active`, { method: 'PUT', body: { active: false } })); }} />
    </Modal>
  );
}
