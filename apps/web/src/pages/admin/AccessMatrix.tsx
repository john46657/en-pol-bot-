import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCESS_LEVEL_LABEL, ACCESS_LEVELS, type AccessLevel, type AccessLevelState } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { labelForArea } from '../../lib/permLabels';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows, type Tone } from '../../components/ui';

interface Area { key: string; actions: string[]; module: string; moduleName: string }
interface RoleRow { id: string; name: string; priority: number; color: string | null; active: boolean; system: boolean; members: number; levels: Record<string, AccessLevelState> }
const TONE: Record<AccessLevelState, Tone> = { none: 'neutral', view: 'info', edit: 'primary', full: 'success', blocked: 'danger', custom: 'warning' };

/**
 * Zentraler Berechtigungseditor: Matrix Rolle × Bereich × Zugriffsstufe (Kein Zugriff, Nur ansehen, Bearbeiten, Vollzugriff,
 * Gesperrt). Speichert in die bestehenden Einzelrechte – feine Rechte bleiben unter „Rollen & Rechte“ bearbeitbar.
 */
export function AccessMatrix() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const m = useQuery({ queryKey: ['access-matrix'], queryFn: () => api<{ areas: Area[]; roles: RoleRow[]; priority: string }>('/access-matrix') });
  const [filter, setFilter] = useState('');
  const [pending, setPending] = useState<{ role: RoleRow; area: Area; level: AccessLevel } | null>(null);
  const prev = useQuery({ queryKey: ['access-preview', pending?.role.id, pending?.area.key, pending?.level], queryFn: () => api<{ added: string[]; removed: string[] }>('/access-matrix/preview', { query: { roleId: pending!.role.id, area: pending!.area.key, level: pending!.level } }), enabled: !!pending });
  const save = useMutation({ mutationFn: () => api(`/access-matrix/roles/${pending!.role.id}/${pending!.area.key}`, { method: 'PUT', body: { level: pending!.level } }), onSuccess: () => { setPending(null); void qc.invalidateQueries({ queryKey: ['access-matrix'] }); void qc.invalidateQueries({ queryKey: ['roles'] }); } });
  const areas = (m.data?.areas ?? []).filter((a) => !filter || `${a.key} ${a.moduleName} ${labelForArea(a.key)}`.toLowerCase().includes(filter.toLowerCase()));
  const editable = can('roles.manage');
  return (
    <>
      <PageHeader title="🔐 Berechtigungsmatrix" subtitle="Zugriffsstufe je Rolle und Bereich. Gilt sofort in Dashboard, MDT, Leitstelle und Discord-Bot (alle prüfen serverseitig dieselben Rechte)." />
      <Card className="mb-3"><p className="text-sm"><b>Priorität:</b> {m.data?.priority ?? '…'}. „Gesperrt“ ist eine ausdrückliche Sperre; Sonderrechte einzelner Benutzer setzt du unter Benutzer. Rollen können nur unterhalb des eigenen Rangs geändert werden, vergeben werden kann nur, was man selbst hat; eine Änderung, mit der du dich selbst aussperrst, wird abgelehnt.</p></Card>
      <div className="mb-3 w-full sm:w-72"><Input aria-label="Bereich filtern" placeholder="🔍 Bereich…" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      <Card className="overflow-x-auto">
        {m.isLoading ? <SkeletonRows rows={8} /> : m.error ? <ErrorState error={m.error} /> : !m.data?.roles.length ? <EmptyState text="Keine Rollen." /> : (
          <table className="w-full text-xs">
            <thead><tr className="border-b border-line text-left text-muted"><th className="sticky left-0 z-10 bg-panel p-2">Bereich</th>{m.data.roles.map((r) => <th key={r.id} className="p-2 whitespace-nowrap" style={{ color: r.color ?? undefined }}>{r.name}{!r.active && ' (aus)'}</th>)}</tr></thead>
            <tbody>{areas.map((a) => (
              <tr key={a.key} className="border-b border-line/50">
                <td className="sticky left-0 z-10 bg-panel p-2"><b>{labelForArea(a.key)}</b><span className="block text-muted">{a.moduleName} · {a.key}</span></td>
                {m.data!.roles.map((r) => {
                  const lvl = r.levels[a.key] ?? 'none';
                  return (
                    <td key={r.id} className="p-1">
                      {editable && !r.system ? (
                        <Select aria-label={`${r.name}: ${a.key}`} className="!py-1 min-w-[8.5rem] text-xs" value={lvl === 'custom' ? '' : lvl} onChange={(e) => e.target.value && setPending({ role: r, area: a, level: e.target.value as AccessLevel })}>
                          {lvl === 'custom' && <option value="">Individuell</option>}
                          {ACCESS_LEVELS.map((l) => <option key={l} value={l}>{ACCESS_LEVEL_LABEL[l]}</option>)}
                        </Select>
                      ) : <Badge tone={TONE[lvl]}>{ACCESS_LEVEL_LABEL[lvl]}</Badge>}
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Modal open={!!pending} title={pending ? `${pending.role.name}: ${labelForArea(pending.area.key)} → ${ACCESS_LEVEL_LABEL[pending.level]}` : ''} onClose={() => setPending(null)}>
        {prev.isLoading ? <SkeletonRows rows={2} /> : prev.data && (
          <div className="grid gap-2 text-sm">
            {!prev.data.added.length && !prev.data.removed.length ? <p>Keine Änderung.</p> : <>
              {prev.data.added.length > 0 && <p>Neu: {prev.data.added.map((x) => <code key={x} className="mr-1 text-xs">{x}</code>)}</p>}
              {prev.data.removed.length > 0 && <p>Entfällt: {prev.data.removed.map((x) => <code key={x} className="mr-1 text-xs">{x}</code>)}</p>}
            </>}
            <p className="text-xs text-muted">Betrifft {pending?.role.members ?? 0} Mitglieder; sie werden benachrichtigt. Jede Einzeländerung wird protokolliert.</p>
          </div>
        )}
        {save.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(save.error)}</p>}
        <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => setPending(null)}>Abbrechen</Button><Button disabled={save.isPending} onClick={() => save.mutate()}>Übernehmen</Button></div>
      </Modal>
    </>
  );
}
