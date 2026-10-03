import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSION_CATALOG } from '@enrp/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows } from '../../components/ui';
import { FormModal } from '../../components/FormModal';

interface Role { id: string; name: string; description: string | null; system: boolean; permissions: { permissionKey: string; effect: 'ALLOW' | 'DENY' }[] }
type State = 'ALLOW' | 'DENY' | 'NONE';

export function Roles() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['roles-full'], queryFn: () => api<Role[]>('/roles') });
  const [sel, setSel] = useState<string>();
  const [draft, setDraft] = useState<Record<string, State>>();
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string>();
  const manage = can('roles.manage');
  const role = q.data?.find((r) => r.id === sel);
  const open = (r: Role) => { setSel(r.id); setDraft(Object.fromEntries(r.permissions.map((p) => [p.permissionKey, p.effect]))); setErr(undefined); };
  const save = useMutation({
    mutationFn: () => api(`/roles/${sel}/permissions`, { method: 'PUT', body: { grants: Object.entries(draft ?? {}).filter(([, v]) => v !== 'NONE').map(([permission, effect]) => ({ permission, effect })) } }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['roles-full'] }); }, onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed'),
  });
  const cycle = (k: string) => setDraft((d) => { const cur = d?.[k] ?? 'NONE'; return { ...d, [k]: cur === 'NONE' ? 'ALLOW' : cur === 'ALLOW' ? 'DENY' : 'NONE' }; });
  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Click a permission to cycle: not set → ALLOW → DENY. Role DENY beats role ALLOW." actions={manage && <Button onClick={() => setCreating(true)}>New role</Button>} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card title="Roles"><ul className="space-y-1">{q.data?.map((r) => <li key={r.id}><button className={`w-full rounded px-2 py-1.5 text-left text-sm ${r.id === sel ? 'bg-primary/15' : 'hover:bg-panel-2'}`} onClick={() => open(r)}>{r.name}<span className="ml-2 text-xs text-muted">{r.permissions.length}</span></button></li>)}</ul></Card>
          {!role || !draft ? <Card><EmptyState text="Select a role to edit its permissions." /></Card> : (
            <Card title={role.name} actions={manage && <Button onClick={() => save.mutate()} disabled={save.isPending}>Save changes</Button>}>
              {err && <p role="alert" className="mb-2 text-sm text-danger">{err}</p>}
              {draft['*'] === 'ALLOW' && <p className="mb-3 rounded bg-warning/10 p-2 text-xs text-warning">This role has the global wildcard (*) — it grants every permission.</p>}
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(PERMISSION_CATALOG).map(([mod, actions]) => (
                  <fieldset key={mod}><legend className="mb-1 text-xs font-semibold uppercase text-muted">{mod}</legend>
                    <div className="flex flex-wrap gap-1.5">{actions.map((a) => { const k = `${mod}.${a}`; const st = draft[k] ?? 'NONE'; return (
                      <button key={k} disabled={!manage} aria-pressed={st !== 'NONE'} aria-label={`${k}: ${st}`} onClick={() => cycle(k)} className={`rounded border px-2 py-0.5 text-xs ${st === 'ALLOW' ? 'border-success/40 bg-success/15 text-success' : st === 'DENY' ? 'border-danger/40 bg-danger/15 text-danger' : 'border-line text-muted'}`}>{st === 'ALLOW' ? '✓ ' : st === 'DENY' ? '✕ ' : ''}{a}</button>); })}</div>
                  </fieldset>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
      <FormModal open={creating} onClose={() => setCreating(false)} title="New role" endpoint="/roles" invalidate={[['roles-full'], ['roles']]} fields={[{ name: 'name', label: 'Name', required: true, min: 2, max: 64 }, { name: 'description', label: 'Description' }]} />
    </>
  );
}
