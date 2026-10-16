import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, RotateCcw, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, PageHeader, Select, SkeletonRows, confirmDialog } from '../../components/ui';

interface ServerRow { id: string; guildId: string; name: string; status: 'ACTIVE' | 'DISABLED' | 'ERROR'; archivedAt: string | null; version: number }
interface ModuleRow { key: string; name: string; description: string; system: boolean; enabled: boolean; version: number; updatedAt: string | null }
interface Effective { globalAdmin: boolean; membership: { status: string; source: string; lastVerifiedAt: string | null } | null; allowed: string[]; details: { permission: string; module: string; allowed: boolean; source: string; blockedBy: string | null }[] }
interface Member { id: string; status: string; source: string; lastVerifiedAt: string | null; user: { id: string; displayName: string; username: string } }
interface Connection { id: string; name: string; status: 'ACTIVE' | 'DISABLED'; version: number; members: { serverId: string; server: { id: string; name: string; guildId: string } }[] }
interface Policy { id: string; sourceServerId: string; targetServerId: string; dataType: string; direction: string; enabled: boolean; version: number }
interface SyncStatus { counts: Record<string, number>; lastProcessedAt: string | null; oldestPendingAt: string | null }
interface SyncEventRow { id: string; dataType: string; eventType: string; status: string; attemptCount: number; lastError: string | null; createdAt: string; processedAt: string | null }

const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'danger' | 'warning' | 'info' }> = {
  ACTIVE: { label: 'Aktiv', tone: 'success' }, DISABLED: { label: 'Deaktiviert', tone: 'neutral' }, ERROR: { label: 'Verbindungsfehler', tone: 'danger' },
  PENDING: { label: 'Offen', tone: 'info' }, DONE: { label: 'Erledigt', tone: 'success' }, SKIPPED: { label: 'Übersprungen (Konflikt)', tone: 'warning' }, FAILED: { label: 'Fehlgeschlagen', tone: 'danger' }, CANCELLED: { label: 'Verworfen', tone: 'neutral' },
};
const DATA_TYPES: Record<string, string> = { reports: 'Berichte', unit_status: 'Dienststatus', team_overview: 'Teamübersicht', shift_statistics: 'Wochenstatistik', incidents: 'Einsätze (noch keine Quelle)', incident_status: 'Einsatzstatus (noch keine Quelle)', radio_messages: 'Funksprüche (noch keine Quelle)' };
const DIRECTIONS: Record<string, string> = { A_TO_B: 'Quelle → Ziel', B_TO_A: 'Ziel → Quelle', BIDIRECTIONAL: 'beide Richtungen', NONE: 'keine' };
const BLOCKED: Record<string, string> = { NOT_MEMBER: 'kein Mitglied', MODULE_DISABLED: 'Modul aus', SERVER_DISABLED: 'Server deaktiviert', UNKNOWN_SERVER: 'Server unbekannt' };
const conflictText = (e: unknown) => (e instanceof ApiError && e.status === 409 ? 'Inzwischen von jemand anderem geändert – Ansicht wurde neu geladen, deine Änderung ist NICHT gespeichert.' : errText(e));

/**
 * Administration → Server & Module. Alle Entscheidungen trifft das Backend (Rechte je Server, Mitgliedschaft, Module);
 * die Oberfläche zeigt nur an, was der Server erlaubt. Änderungen gelten erst nach erfolgreicher Antwort als gespeichert.
 */
export function MultiServer() {
  const { user } = useAuth();
  const servers = useQuery({ queryKey: ['ms-servers'], queryFn: () => api<ServerRow[]>('/servers') });
  const [sel, setSel] = useState('');
  useEffect(() => { if (!sel && servers.data?.length) setSel(servers.data[0]!.id); }, [servers.data, sel]);
  const server = servers.data?.find((s) => s.id === sel);
  return (
    <>
      <PageHeader title="Server & Module" subtitle="Jeder Discord-Server arbeitet getrennt: eigene Module, Rollen und Rechte. Verbindungen tauschen nur freigegebene Daten aus – nur lesend." />
      {servers.error ? <ErrorState error={servers.error} onRetry={() => void servers.refetch()} /> : servers.isLoading ? <SkeletonRows /> : (
        <>
          <ServerList servers={servers.data ?? []} selected={sel} onSelect={setSel} globalAdmin={!!user?.globalAdmin} />
          {server && <>
            <ModulesCard server={server} />
            <EffectiveCard server={server} userId={user!.id} />
            <MembersCard server={server} />
          </>}
          <ConnectionsCard servers={servers.data ?? []} />
        </>
      )}
    </>
  );
}

function ServerList({ servers, selected, onSelect, globalAdmin }: { servers: ServerRow[]; selected: string; onSelect: (id: string) => void; globalAdmin: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ guildId: '', name: '' });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['ms-servers'] });
  const status = useMutation({ mutationFn: (s: ServerRow) => api(`/servers/${s.id}`, { method: 'PATCH', body: { status: s.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE', version: s.version } }), onSettled: refresh });
  const create = useMutation({ mutationFn: () => api('/servers', { body: form }), onSuccess: () => { setForm({ guildId: '', name: '' }); refresh(); } });
  const archive = useMutation({ mutationFn: (s: ServerRow) => api(`/servers/${s.id}`, { method: 'DELETE' }), onSettled: refresh });
  const err = status.error ?? create.error ?? archive.error;
  return (
    <Card title={<span className="flex items-center gap-2"><Server size={16} aria-hidden />Server</span>}>
      {!servers.length ? <EmptyState text="Keine Server sichtbar." hint="Du siehst nur Server, auf denen du bestätigtes Mitglied mit „servers.view“ bist." /> : (
        <ul className="grid gap-2">{servers.map((s) => (
          <li key={s.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${s.id === selected ? 'border-primary' : 'border-line'}`}>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(s.id)} aria-pressed={s.id === selected}>
              <span className="font-medium">{s.name}</span> <span className="text-xs text-muted">{s.guildId}</span>
            </button>
            {s.archivedAt ? <Badge>Archiviert</Badge> : <Badge tone={STATUS[s.status]?.tone}>{STATUS[s.status]?.label ?? s.status}</Badge>}
            {globalAdmin && !s.archivedAt && <>
              <Button size="sm" variant="secondary" disabled={status.isPending} onClick={() => status.mutate(s)}>{s.status === 'ACTIVE' ? 'Deaktivieren' : 'Freischalten'}</Button>
              <Button size="sm" variant="ghost" aria-label={`${s.name} archivieren`} disabled={archive.isPending} onClick={() => { void confirmDialog(`„${s.name}“ archivieren? Daten bleiben erhalten, der Server ist danach nicht mehr wählbar.`).then((ok) => { if (ok) archive.mutate(s); }) }}><Trash2 size={14} /></Button>
            </>}
          </li>
        ))}</ul>
      )}
      {globalAdmin && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <label className="grid gap-1 text-xs text-muted">Discord-Server-ID<Input value={form.guildId} inputMode="numeric" onChange={(e) => setForm({ ...form, guildId: e.target.value.trim() })} /></label>
          <label className="grid gap-1 text-xs text-muted">Name<Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <Button type="submit" size="sm" disabled={create.isPending || !/^\d{15,25}$/.test(form.guildId) || !form.name.trim()}><Plus size={14} aria-hidden />Registrieren</Button>
        </form>
      )}
      {err && <p role="alert" className="mt-2 text-sm text-danger">{conflictText(err)}</p>}
      <p className="mt-2 text-xs text-muted">Vom Bot neu entdeckte Server erscheinen deaktiviert und müssen von einem globalen Systemadministrator freigeschaltet werden. Archivieren löscht keine Daten.</p>
    </Card>
  );
}

function ModulesCard({ server }: { server: ServerRow }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ms-modules', server.id], queryFn: () => api<ModuleRow[]>(`/servers/${server.id}/modules`) });
  const [saved, setSaved] = useState<string>();
  const toggle = useMutation({
    mutationFn: (m: ModuleRow) => api<ModuleRow>(`/servers/${server.id}/modules/${m.key}`, { method: 'PATCH', body: { enabled: !m.enabled, version: m.version } }),
    // „Gespeichert“ erst nach Antwort des Servers; bei Fehler/Konflikt Stand neu laden
    onSuccess: (_r, m) => setSaved(`${m.name}: gespeichert`),
    onError: () => setSaved(undefined),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['ms-modules', server.id] }),
  });
  return (
    <Card className="mt-4" title={`Module · ${server.name}`} actions={toggle.isPending ? <span className="text-xs text-muted">Speichert…</span> : saved ? <span className="text-xs text-success">{saved}</span> : null}>
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.isLoading ? <SkeletonRows rows={4} /> : (
        <ul className="grid gap-2 md:grid-cols-2">{(q.data ?? []).map((m) => (
          <li key={m.key} className="flex items-start gap-3 rounded-lg border border-line p-3">
            {m.system ? <Badge tone="info">System</Badge> : <Toggle label={`${m.name} aktiv`} checked={m.enabled} onChange={() => toggle.mutate(m)} />}
            <div className="min-w-0"><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.description}</p>{m.updatedAt && <p className="text-[11px] text-muted">geändert {fmt(m.updatedAt)}</p>}</div>
          </li>
        ))}</ul>
      )}
      {toggle.error && <p role="alert" className="mt-2 text-sm text-danger">{conflictText(toggle.error)}</p>}
      <p className="mt-2 text-xs text-muted">Ein abgeschaltetes Modul ist auf diesem Server über Dashboard, API und Discord-Befehle gesperrt. Andere Server bleiben unberührt.</p>
    </Card>
  );
}

function EffectiveCard({ server, userId }: { server: ServerRow; userId: string }) {
  const q = useQuery({ queryKey: ['ms-effective', server.id, userId], queryFn: () => api<Effective>(`/servers/${server.id}/users/${userId}/effective-permissions`) });
  const blocked = (q.data?.details ?? []).filter((d) => d.blockedBy);
  return (
    <Card className="mt-4" title={<span className="flex items-center gap-2"><ShieldCheck size={16} aria-hidden />Meine Rechte auf diesem Server</span>}>
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.isLoading || !q.data ? <SkeletonRows rows={2} /> : (
        <>
          <p className="text-sm">{q.data.globalAdmin ? 'Globaler Systemadministrator' : q.data.membership ? `Mitgliedschaft: ${q.data.membership.status === 'MEMBER' ? 'bestätigt' : q.data.membership.status} (${q.data.membership.source === 'DISCORD' ? 'über Discord' : 'manuell'})` : 'Keine Mitgliedschaft'} · {q.data.allowed.length} Rechte wirksam</p>
          <p className="mt-1 text-xs text-muted">Serverseitig berechnet: Rollen dieses Servers (gleichnamige Rollen anderer Server zählen nicht), Verbote vor Erlaubnissen, Module und Mitgliedschaft.</p>
          {blocked.length > 0 && <p className="mt-1 text-xs text-warning">{new Set(blocked.map((b) => b.module)).size} Modul(e) gesperrt: {[...new Set(blocked.map((b) => `${b.module} (${BLOCKED[b.blockedBy!] ?? b.blockedBy})`))].join(', ')}</p>}
          <details className="mt-2"><summary className="cursor-pointer text-xs text-muted">Wirksame Rechte anzeigen</summary><p className="mt-1 break-words font-mono text-[11px]">{q.data.allowed.join(' · ') || '—'}</p></details>
        </>
      )}
    </Card>
  );
}

function MembersCard({ server }: { server: ServerRow }) {
  const q = useQuery({ queryKey: ['ms-members', server.id], queryFn: () => api<Member[]>(`/servers/${server.id}/members`) });
  const members = (q.data ?? []).filter((m) => m.status === 'MEMBER');
  return (
    <Card className="mt-4" title={`Mitglieder (${members.length})`}>
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.isLoading ? <SkeletonRows rows={2} /> : !members.length ? <EmptyState text="Noch keine bestätigten Mitglieder." hint="Mitgliedschaften werden beim Login, laufend und bei jedem Discord-Befehl geprüft." /> : (
        <ul className="grid gap-1 text-sm md:grid-cols-2">{members.slice(0, 200).map((m) => <li key={m.id} className="flex justify-between gap-2"><span>{m.user.displayName}</span><span className="text-xs text-muted">{m.source === 'DISCORD' ? 'Discord' : 'manuell'}{m.lastVerifiedAt ? ` · ${fmt(m.lastVerifiedAt)}` : ''}</span></li>)}</ul>
      )}
    </Card>
  );
}

function ConnectionsCard({ servers }: { servers: ServerRow[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ms-connections'], queryFn: () => api<Connection[]>('/connections') });
  const [name, setName] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['ms-connections'] });
  const create = useMutation({ mutationFn: () => api('/connections', { body: { name, serverIds: pick } }), onSuccess: () => { setName(''); setPick([]); refresh(); } });
  return (
    <Card className="mt-4" title={<span className="flex items-center gap-2"><Network size={16} aria-hidden />Serververbindungen</span>}>
      <p className="mb-3 text-xs text-muted">Eine Verbindung allein überträgt nichts. Daten fließen nur über aktive Freigaben – als lesende Kopie, nie mit Bearbeitungsrechten. Zum Anlegen und Ändern brauchst du „connections.manage“ auf den beteiligten Servern.</p>
      {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.isLoading ? <SkeletonRows rows={2} /> : !q.data?.length ? <EmptyState text="Keine Verbindungen." /> : (
        <div className="grid gap-3">{q.data.map((c) => <ConnectionItem key={c.id} c={c} onChange={refresh} />)}</div>
      )}
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <label className="grid gap-1 text-xs text-muted">Name<Input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <fieldset className="flex flex-wrap gap-2 text-sm"><legend className="text-xs text-muted">Server</legend>{servers.filter((s) => !s.archivedAt).map((s) => (
          <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={pick.includes(s.id)} onChange={(e) => setPick(e.target.checked ? [...pick, s.id] : pick.filter((x) => x !== s.id))} />{s.name}</label>
        ))}</fieldset>
        <Button size="sm" type="submit" disabled={create.isPending || !name.trim() || pick.length < 2}><Plus size={14} aria-hidden />Verbindung anlegen</Button>
      </form>
      {create.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(create.error)}</p>}
    </Card>
  );
}

function ConnectionItem({ c, onChange }: { c: Connection; onChange: () => void }) {
  const qc = useQueryClient();
  const policies = useQuery({ queryKey: ['ms-policies', c.id], queryFn: () => api<Policy[]>(`/connections/${c.id}/policies`) });
  const status = useQuery({ queryKey: ['ms-sync', c.id], queryFn: () => api<SyncStatus>(`/connections/${c.id}/sync-status`), refetchInterval: 10_000, retry: false });
  const events = useQuery({ queryKey: ['ms-events', c.id], queryFn: () => api<{ items: SyncEventRow[] }>(`/connections/${c.id}/sync-events?pageSize=10`), retry: false });
  const name = (id: string) => c.members.find((m) => m.serverId === id)?.server.name ?? id;
  const [p, setP] = useState({ sourceServerId: c.members[0]?.serverId ?? '', targetServerId: c.members[1]?.serverId ?? '', dataType: 'reports', direction: 'A_TO_B' });
  const reload = () => { onChange(); void qc.invalidateQueries({ queryKey: ['ms-policies', c.id] }); void qc.invalidateQueries({ queryKey: ['ms-sync', c.id] }); void qc.invalidateQueries({ queryKey: ['ms-events', c.id] }); };
  const toggle = useMutation({ mutationFn: () => api(`/connections/${c.id}`, { method: 'PATCH', body: { status: c.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE', version: c.version } }), onSettled: reload });
  const addPolicy = useMutation({ mutationFn: () => api(`/connections/${c.id}/policies`, { body: p }), onSettled: reload });
  const patchPolicy = useMutation({ mutationFn: (v: { pol: Policy; body: Record<string, unknown> }) => api(`/connections/${c.id}/policies/${v.pol.id}`, { method: 'PATCH', body: { ...v.body, version: v.pol.version } }), onSettled: reload });
  const removePolicy = useMutation({ mutationFn: (pol: Policy) => api(`/connections/${c.id}/policies/${pol.id}`, { method: 'DELETE' }), onSettled: reload });
  const retry = useMutation({ mutationFn: () => api<{ requeued: number }>(`/connections/${c.id}/retry-failed`, { method: 'POST' }), onSettled: reload });
  const err = toggle.error ?? addPolicy.error ?? patchPolicy.error ?? removePolicy.error ?? retry.error;
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{c.name}</span><Badge tone={STATUS[c.status]?.tone}>{STATUS[c.status]?.label}</Badge>
        <span className="text-xs text-muted">{c.members.map((m) => m.server.name).join(' · ')}</span>
        <Button className="ml-auto" size="sm" variant="secondary" disabled={toggle.isPending} onClick={() => toggle.mutate()}>{c.status === 'ACTIVE' ? 'Deaktivieren' : 'Aktivieren'}</Button>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-1">Daten</th><th>Quelle</th><th>Ziel</th><th>Richtung</th><th>Aktiv</th><th /></tr></thead>
        <tbody>{(policies.data ?? []).map((pol) => (
          <tr key={pol.id} className="border-t border-line">
            <td className="py-1">{DATA_TYPES[pol.dataType] ?? pol.dataType}</td><td>{name(pol.sourceServerId)}</td><td>{name(pol.targetServerId)}</td>
            <td><Select aria-label="Richtung" className="w-auto py-0.5 text-xs" value={pol.direction} onChange={(e) => patchPolicy.mutate({ pol, body: { direction: e.target.value } })}>{Object.entries(DIRECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></td>
            <td><Toggle label="Freigabe aktiv" checked={pol.enabled} onChange={(v) => patchPolicy.mutate({ pol, body: { enabled: v } })} /></td>
            <td><Button size="sm" variant="ghost" aria-label="Freigabe entfernen" onClick={() => removePolicy.mutate(pol)}><Trash2 size={14} /></Button></td>
          </tr>
        ))}</tbody>
      </table>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); addPolicy.mutate(); }}>
        <Select aria-label="Datenart" className="w-auto py-1 text-xs" value={p.dataType} onChange={(e) => setP({ ...p, dataType: e.target.value })}>{Object.entries(DATA_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Quelle" className="w-auto py-1 text-xs" value={p.sourceServerId} onChange={(e) => setP({ ...p, sourceServerId: e.target.value })}>{c.members.map((m) => <option key={m.serverId} value={m.serverId}>{m.server.name}</option>)}</Select>
        <Select aria-label="Ziel" className="w-auto py-1 text-xs" value={p.targetServerId} onChange={(e) => setP({ ...p, targetServerId: e.target.value })}>{c.members.map((m) => <option key={m.serverId} value={m.serverId}>{m.server.name}</option>)}</Select>
        <Select aria-label="Richtung der neuen Freigabe" className="w-auto py-1 text-xs" value={p.direction} onChange={(e) => setP({ ...p, direction: e.target.value })}>{Object.entries(DIRECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Button size="sm" type="submit" disabled={addPolicy.isPending || p.sourceServerId === p.targetServerId}><Plus size={14} aria-hidden />Freigabe</Button>
      </form>
      {status.data && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {Object.entries(status.data.counts).map(([k, v]) => <Badge key={k} tone={STATUS[k]?.tone}>{STATUS[k]?.label ?? k}: {v}</Badge>)}
          {status.data.lastProcessedAt && <span className="text-muted">zuletzt {fmt(status.data.lastProcessedAt)}</span>}
          {(status.data.counts.FAILED ?? 0) > 0 && <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate()}><RotateCcw size={14} aria-hidden />Fehlgeschlagene wiederholen</Button>}
        </div>
      )}
      {!!events.data?.items.length && (
        <details className="mt-2"><summary className="cursor-pointer text-xs text-muted">Letzte Ereignisse</summary>
          <ul className="mt-1 grid gap-1 text-xs">{events.data.items.map((e) => <li key={e.id} className="flex flex-wrap gap-2"><Badge tone={STATUS[e.status]?.tone}>{STATUS[e.status]?.label ?? e.status}</Badge>{DATA_TYPES[e.dataType] ?? e.dataType} · {e.eventType} · {fmt(e.createdAt)}{e.lastError && <span className="text-muted">({e.lastError})</span>}</li>)}</ul>
        </details>
      )}
      {err && <p role="alert" className="mt-2 text-sm text-danger">{conflictText(err)}</p>}
    </div>
  );
}
