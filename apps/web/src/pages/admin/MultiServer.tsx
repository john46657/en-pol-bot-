import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, PageHeader, SkeletonRows, confirmDialog } from '../../components/ui';

interface ServerRow { id: string; guildId: string; name: string; status: 'ACTIVE' | 'DISABLED' | 'ERROR'; archivedAt: string | null; version: number }
interface ModuleRow { key: string; name: string; description: string; system: boolean; enabled: boolean; version: number; updatedAt: string | null }
interface Effective { globalAdmin: boolean; membership: { status: string; source: string; lastVerifiedAt: string | null } | null; allowed: string[]; details: { permission: string; module: string; allowed: boolean; source: string; blockedBy: string | null }[] }
interface Member { id: string; status: string; source: string; lastVerifiedAt: string | null; user: { id: string; displayName: string; username: string } }

const STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'danger' | 'warning' | 'info' }> = {
  ACTIVE: { label: 'Aktiv', tone: 'success' }, DISABLED: { label: 'Deaktiviert', tone: 'neutral' }, ERROR: { label: 'Verbindungsfehler', tone: 'danger' },
  PENDING: { label: 'Offen', tone: 'info' }, DONE: { label: 'Erledigt', tone: 'success' }, SKIPPED: { label: 'Übersprungen (Konflikt)', tone: 'warning' }, FAILED: { label: 'Fehlgeschlagen', tone: 'danger' }, CANCELLED: { label: 'Verworfen', tone: 'neutral' },
};
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
      <PageHeader title="Server & Module" subtitle="Jeder Discord-Server arbeitet getrennt: eigene Module, Rollen und Rechte." />
      {servers.error ? <ErrorState error={servers.error} onRetry={() => void servers.refetch()} /> : servers.isLoading ? <SkeletonRows /> : (
        <>
          <ServerList servers={servers.data ?? []} selected={sel} onSelect={setSel} globalAdmin={!!user?.globalAdmin} />
          {server && <>
            <ModulesCard server={server} />
            <EffectiveCard server={server} userId={user!.id} />
            <MembersCard server={server} />
          </>}
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
            {!s.archivedAt && <Link className="rounded border border-line px-2 py-1 text-xs hover:bg-panel-2" to={`/servers/${s.guildId}/settings`}>Konfiguration & Branding</Link>}
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
