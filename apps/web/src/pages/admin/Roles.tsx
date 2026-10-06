import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { PERMISSION_CATALOG } from '@enrp/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { hasPending, onSaved, pendingBody, queueSave } from '../../lib/autosave';
import { guildName, useGuilds, useServer } from '../../lib/guilds';
import { ACTION_LABELS, MODULE_LABELS } from '../../lib/permLabels';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, PageHeader, SkeletonRows, Tabs, Textarea } from '../../components/ui';
import { RolePicker } from '../../components/DiscordPickers';

interface Role {
  id: string; name: string; description: string | null; system: boolean; priority: number; color: string | null; icon: string | null; active: boolean;
  discordRoleIds: string[]; guildId: string | null; permissions: { permissionKey: string; effect: 'ALLOW' | 'DENY' }[]; _count?: { users: number };
}
type Eff = 'ALLOW' | 'DENY' | 'NONE';
type Meta = Partial<Pick<Role, 'name' | 'description' | 'color' | 'icon' | 'active' | 'discordRoleIds'>>;
const ADMIN = 'System Administrator';
const KEY = ['roles-full'];
const NO_RANK = Number.MAX_SAFE_INTEGER;

/** Rollen & Rechte. Jede Änderung wird automatisch gespeichert; die API prüft Rang und Rechteweitergabe selbst. */
export function Roles() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const [server] = useServer();
  const guilds = useGuilds();
  const q = useQuery({ queryKey: KEY, queryFn: () => api<Role[]>('/roles') });
  const rank = useQuery({ queryKey: ['my-rank'], queryFn: () => api<{ rank: number }>('/roles/my-rank') });
  const [tab, setTab] = useState('Rollen');
  const [sel, setSel] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<Role>();
  const [err, setErr] = useState<string>();
  const [drag, setDrag] = useState<string>();
  const manage = can('roles.manage');
  const owner = !!user?.roles.includes(ADMIN);
  const myRank = rank.data?.rank ?? NO_RANK;
  const editable = (r: Role) => manage && r.name !== ADMIN && (owner || r.priority > myRank);

  // Nach dem Speichern den Serverstand übernehmen – erst wenn nichts mehr aussteht (sonst würde eine laufende Eingabe überschrieben)
  useEffect(() => onSaved('role', () => { if (!hasPending('role')) void qc.invalidateQueries({ queryKey: KEY }); }), [qc]);

  // Lokale (noch nicht gespeicherte) Änderungen über den Serverstand legen – auch nach dem Neuladen
  const roles = useMemo(() => {
    const list = (q.data ?? []).map((r) => {
      const meta = pendingBody<Meta>(`role:${r.id}:meta`) ?? {};
      const perms = new Map(r.permissions.map((p) => [p.permissionKey, p.effect as Eff]));
      for (const k of Object.keys(PERMISSION_CATALOG).flatMap((m) => [`${m}.*`, ...PERMISSION_CATALOG[m as keyof typeof PERMISSION_CATALOG].map((a) => `${m}.${a}`)])) {
        const p = pendingBody<{ effect: Eff }>(`role:${r.id}:perm:${k}`);
        if (p) { if (p.effect === 'NONE') perms.delete(k); else perms.set(k, p.effect); }
      }
      return { ...r, ...meta, permissions: [...perms].map(([permissionKey, effect]) => ({ permissionKey, effect: effect as 'ALLOW' | 'DENY' })) };
    });
    const order = pendingBody<{ ids: string[] }>('role-order:')?.ids;
    return order ? [...list].sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999) || a.priority - b.priority) : list;
  }, [q.data, q.dataUpdatedAt]);
  const role = roles.find((r) => r.id === sel) ?? roles[0];

  const patchCache = (id: string, fn: (r: Role) => Role) => qc.setQueryData<Role[]>(KEY, (l) => l?.map((r) => (r.id === id ? fn(r) : r)));
  const setMeta = (r: Role, m: Meta) => {
    patchCache(r.id, (x) => ({ ...x, ...m }));
    const merged = { ...(pendingBody<Meta>(`role:${r.id}:meta`) ?? {}), ...m };
    queueSave(`role:${r.id}:meta`, { method: 'PATCH', path: `/roles/${r.id}`, body: merged, label: `Rolle „${r.name}“` });
  };
  const setPerm = (r: Role, key: string, effect: Eff) => {
    patchCache(r.id, (x) => ({ ...x, permissions: [...x.permissions.filter((p) => p.permissionKey !== key), ...(effect === 'NONE' ? [] : [{ permissionKey: key, effect }])] }));
    queueSave(`role:${r.id}:perm:${key}`, { method: 'PATCH', path: `/roles/${r.id}/permissions`, body: { permission: key, effect }, label: `${r.name}: ${key}` }, 600);
  };
  const reorder = (ids: string[]) => {
    const all = q.data ?? [];
    qc.setQueryData<Role[]>(KEY, [...all].sort((a, b) => (ids.indexOf(a.id) + 1 || 999) - (ids.indexOf(b.id) + 1 || 999) || a.priority - b.priority));
    queueSave('role-order:', { method: 'PUT', path: '/roles/order', body: { ids: ids.filter((id) => { const r = all.find((x) => x.id === id); return r && editable(r); }) }, label: 'Rollen-Reihenfolge' });
  };
  const move = (id: string, to: number) => {
    const ids = roles.map((r) => r.id);
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder(ids);
  };

  const onError = (e: unknown) => setErr(e instanceof ApiError ? e.message : 'Fehlgeschlagen');
  // neue Rolle sofort anzeigen und auswählen (nicht erst nach dem Neuladen der Liste)
  const added = (r: Role) => { setErr(undefined); qc.setQueryData<Role[]>(KEY, (l) => [...(l ?? []).filter((x) => x.id !== r.id), r].sort((a, b) => a.priority - b.priority)); setSel(r.id); void qc.invalidateQueries({ queryKey: KEY }); };
  const create = useMutation({ mutationFn: () => api<Role>('/roles', { body: { name: uniqueName('Neue Rolle', roles), guildId: server || null } }), onSuccess: added, onError });
  const duplicate = useMutation({ mutationFn: (r: Role) => api<Role>(`/roles/${r.id}/duplicate`, { body: {} }), onSuccess: added, onError });
  const remove = useMutation({ mutationFn: (r: Role) => api(`/roles/${r.id}`, { method: 'DELETE' }), onSuccess: () => { setConfirmDelete(undefined); setSel(undefined); void qc.invalidateQueries({ queryKey: KEY }); }, onError });

  const scope = (r: Role) => (r.guildId ? guildName(guilds.data, r.guildId) : (guilds.data?.length ?? 0) > 1 ? 'Alle Server' : null);
  return (
    <>
      <PageHeader title="Rollen & Rechte" subtitle={`Änderungen werden automatisch gespeichert.${server ? ` Server: ${guildName(guilds.data, server)} – Rollen dieses Servers gelten nur hier.` : ''}`}
        actions={manage && <Button onClick={() => create.mutate()} disabled={create.isPending}><Plus size={14} />Neue Rolle</Button>} />
      {err && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</div>}
      <Tabs tabs={['Rollen', 'Berechtigungsmatrix']} active={tab} onChange={setTab} />
      <div className="mt-4">
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !roles.length ? <EmptyState text="Noch keine Rollen." /> : tab === 'Berechtigungsmatrix' ? (
          <Matrix roles={roles} editable={editable} onSet={setPerm} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <Card title="Hierarchie (oben = höchster Rang)">
              <ol className="space-y-1">
                {roles.map((r, i) => (
                  <li key={r.id} draggable={editable(r)} onDragStart={() => setDrag(r.id)} onDragEnd={() => setDrag(undefined)}
                    onDragOver={(e) => { if (drag && editable(r)) e.preventDefault(); }} onDrop={() => { if (drag && drag !== r.id) move(drag, i); setDrag(undefined); }}
                    className={`flex items-center gap-1 rounded ${r.id === role?.id ? 'bg-primary/15' : 'hover:bg-panel-2'} ${drag === r.id ? 'opacity-50' : ''}`}>
                    <span className={`px-1 ${editable(r) ? 'cursor-grab text-muted' : 'text-transparent'}`} aria-hidden><GripVertical size={14} /></span>
                    <button className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm" onClick={() => setSel(r.id)}>
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color ?? 'var(--color-muted)' }} />
                      {r.icon && <span aria-hidden>{r.icon}</span>}
                      <span className={`min-w-0 truncate ${r.active ? '' : 'text-muted line-through'}`}>{r.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted">{r._count?.users ?? 0}</span>
                    </button>
                    {editable(r) && <span className="flex shrink-0">
                      <Button size="sm" variant="ghost" aria-label={`${r.name} nach oben`} onClick={() => move(r.id, i - 1)}><ArrowUp size={12} /></Button>
                      <Button size="sm" variant="ghost" aria-label={`${r.name} nach unten`} onClick={() => move(r.id, i + 1)}><ArrowDown size={12} /></Button>
                    </span>}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">Ziehen oder Pfeile zum Sortieren. Du kannst nur Rollen unterhalb deines eigenen Rangs ändern und nur Rechte vergeben, die du selbst hast.</p>
            </Card>
            {role && <RoleEditor key={role.id} role={role} editable={editable(role)} scope={scope(role)} onMeta={(m) => setMeta(role, m)} onPerm={(k, e) => setPerm(role, k, e)}
              onDuplicate={() => duplicate.mutate(role)} onDelete={() => setConfirmDelete(role)} canCreate={manage} />}
          </div>
        )}
      </div>
      <ConfirmDialog open={!!confirmDelete} danger title="Rolle löschen" message={`„${confirmDelete?.name}“ wird gelöscht und allen ${confirmDelete?._count?.users ?? 0} Mitgliedern entzogen. Das wird im Audit-Log festgehalten.`} confirmLabel="Löschen" busy={remove.isPending}
        onClose={() => setConfirmDelete(undefined)} onConfirm={() => confirmDelete && remove.mutate(confirmDelete)} />
    </>
  );
}

const uniqueName = (base: string, roles: Role[]) => { let n = base; for (let i = 2; roles.some((r) => r.name === n); i++) n = `${base} ${i}`; return n; };
const effectOf = (r: Role, k: string): Eff => (r.permissions.find((p) => p.permissionKey === k)?.effect as Eff | undefined) ?? 'NONE';
const next = (e: Eff): Eff => (e === 'NONE' ? 'ALLOW' : e === 'ALLOW' ? 'DENY' : 'NONE');
const cellCls = (e: Eff) => (e === 'ALLOW' ? 'border-success/40 bg-success/15 text-success' : e === 'DENY' ? 'border-danger/40 bg-danger/15 text-danger' : 'border-line text-muted');

function RoleEditor({ role, editable, scope, onMeta, onPerm, onDuplicate, onDelete, canCreate }: { role: Role; editable: boolean; scope: string | null; onMeta: (m: Meta) => void; onPerm: (k: string, e: Eff) => void; onDuplicate: () => void; onDelete: () => void; canCreate: boolean }) {
  // Texteingaben lokal halten, damit der Cursor beim automatischen Speichern nicht springt
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description ?? '');
  const wildcard = effectOf(role, '*') === 'ALLOW';
  return (
    <Card title={<span className="flex items-center gap-2">{role.icon && <span aria-hidden>{role.icon}</span>}{role.name}{scope && <Badge>{scope}</Badge>}{!role.active && <Badge tone="warning">deaktiviert</Badge>}</span>}
      actions={<span className="flex gap-1">{canCreate && role.name !== ADMIN && <Button size="sm" variant="secondary" onClick={onDuplicate}><Copy size={12} />Duplizieren</Button>}{editable && <Button size="sm" variant="danger" onClick={onDelete}><Trash2 size={12} />Löschen</Button>}</span>}>
      {!editable && <p className="mb-3 rounded bg-panel-2 p-2 text-xs text-muted">{role.name === ADMIN ? 'Die Serverbesitzer-Rolle hat alle Rechte und ist im Dashboard nicht änderbar.' : 'Nur ansehen: Diese Rolle steht nicht unter deinem Rang (oder dir fehlt „roles.manage“).'}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">{(id) => <Input id={id} value={name} disabled={!editable} maxLength={64} onChange={(e) => { setName(e.target.value); if (e.target.value.trim().length >= 2) onMeta({ name: e.target.value.trim() }); }} />}</Field>
        <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2">
          <Field label="Farbe">{(id) => <input id={id} type="color" disabled={!editable} value={role.color ?? '#3b82f6'} onChange={(e) => onMeta({ color: e.target.value })} className="h-9 w-12 rounded border border-line bg-bg" />}</Field>
          <Field label="Icon (Emoji)">{(id) => <Input id={id} value={role.icon ?? ''} maxLength={8} disabled={!editable} placeholder="🛡️" onChange={(e) => onMeta({ icon: e.target.value || null })} />}</Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" disabled={!editable} checked={role.active} onChange={(e) => onMeta({ active: e.target.checked })} />Aktiv</label>
        </div>
        <div className="md:col-span-2"><Field label="Beschreibung">{(id) => <Textarea id={id} rows={2} value={desc} disabled={!editable} maxLength={500} onChange={(e) => { setDesc(e.target.value); onMeta({ description: e.target.value || null }); }} />}</Field></div>
        <div className="md:col-span-2">
          <p className="mb-1 text-xs font-medium text-muted">Verknüpfte Discord-Rollen (wer eine davon hat, bekommt diese Dashboard-Rolle automatisch – Abgleich laufend)</p>
          <RolePicker ariaLabel="Discord-Rolle verknüpfen" value={role.discordRoleIds} disabled={!editable} onChange={(ids) => onMeta({ discordRoleIds: ids })} />
        </div>
      </div>
      <h3 className="mb-2 mt-5 text-sm font-semibold">Berechtigungen <span className="text-xs font-normal text-muted">– klicken: nicht gesetzt → ✓ erlaubt → ✕ verweigert. Verweigern schlägt Erlauben.</span></h3>
      {wildcard && <p className="mb-3 rounded bg-warning/10 p-2 text-xs text-warning">Diese Rolle hat das Generalrecht (*) – sie darf alles.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(PERMISSION_CATALOG).map(([mod, actions]) => {
          const all = effectOf(role, `${mod}.*`);
          return (
            <fieldset key={mod}><legend className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-muted">{MODULE_LABELS[mod] ?? mod}
              <button type="button" disabled={!editable} onClick={() => onPerm(`${mod}.*`, next(all))} className={`rounded border px-1.5 text-[10px] normal-case ${cellCls(all)}`} aria-label={`${mod}.*: ${all}`}>{all === 'ALLOW' ? '✓ alle' : all === 'DENY' ? '✕ alle' : 'alle'}</button></legend>
              <div className="flex flex-wrap gap-1.5">{actions.map((a) => { const k = `${mod}.${a}`; const st = effectOf(role, k); return (
                <button key={k} type="button" title={k} disabled={!editable} aria-pressed={st !== 'NONE'} aria-label={`${k}: ${st}`} onClick={() => onPerm(k, next(st))} className={`rounded border px-2 py-0.5 text-xs ${cellCls(st)}`}>{st === 'ALLOW' ? '✓ ' : st === 'DENY' ? '✕ ' : ''}{ACTION_LABELS[a] ?? a}</button>); })}</div>
            </fieldset>
          );
        })}
      </div>
    </Card>
  );
}

/** Übersicht: Bereiche/Aktionen × Rollen. Jede Zelle ist direkt änderbar (automatisch gespeichert). */
function Matrix({ roles, editable, onSet }: { roles: Role[]; editable: (r: Role) => boolean; onSet: (r: Role, k: string, e: Eff) => void }) {
  const [filter, setFilter] = useState('');
  const shown = roles;
  const rows = Object.entries(PERMISSION_CATALOG).map(([mod, actions]) => ({ mod, keys: actions.map((a) => `${mod}.${a}`).filter((k) => !filter || `${k} ${MODULE_LABELS[mod]} ${ACTION_LABELS[k.slice(mod.length + 1)] ?? ''}`.toLowerCase().includes(filter.toLowerCase())) })).filter((g) => g.keys.length);
  const granted = (r: Role, k: string) => {
    const own = effectOf(r, k);
    if (own !== 'NONE') return own;
    const w = effectOf(r, `${k.split('.')[0]}.*`);
    return w !== 'NONE' ? w : effectOf(r, '*') === 'ALLOW' ? 'ALLOW' : 'NONE';
  };
  return (
    <Card title="Berechtigungsmatrix" actions={<Input aria-label="Recht suchen" className="w-56 py-1 text-xs" placeholder="Recht suchen…" value={filter} onChange={(e) => setFilter(e.target.value)} />}>
      <div className="table-scroll max-h-[70vh] overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-panel"><tr><th className="p-2">Bereich / Aktion</th>{shown.map((r) => <th key={r.id} className="p-2 text-center font-semibold" style={{ color: r.color ?? undefined }}>{r.icon} {r.name}</th>)}</tr></thead>
          <tbody>
            {rows.map((g) => [
              <tr key={g.mod} className="bg-panel-2"><td colSpan={shown.length + 1} className="p-1.5 font-semibold">{MODULE_LABELS[g.mod] ?? g.mod}</td></tr>,
              ...g.keys.map((k) => (
                <tr key={k} className="border-b border-line/50">
                  <td className="p-1.5" title={k}>{ACTION_LABELS[k.slice(g.mod.length + 1)] ?? k} <code className="text-[10px] text-muted">{k}</code></td>
                  {shown.map((r) => {
                    const own = effectOf(r, k), eff = granted(r, k), inherited = own === 'NONE' && eff !== 'NONE';
                    return (
                      <td key={r.id} className="p-1 text-center">
                        <button type="button" disabled={!editable(r)} onClick={() => onSet(r, k, next(own))} aria-label={`${r.name} – ${k}: ${eff}`} title={inherited ? 'geerbt über Wildcard' : undefined}
                          className={`min-w-8 rounded border px-1.5 py-0.5 ${cellCls(eff)} ${inherited ? 'opacity-60' : ''} disabled:cursor-not-allowed`}>{eff === 'ALLOW' ? '✅' : eff === 'DENY' ? '❌' : '·'}</button>
                      </td>
                    );
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">✅ erlaubt · ❌ verweigert · blass = geerbt über „alle“ bzw. *. Klicken schaltet um; gespeichert wird automatisch.</p>
    </Card>
  );
}
