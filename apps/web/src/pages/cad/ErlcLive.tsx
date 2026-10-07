import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago, ERLC_STATUS_TONE, unixTime, useCadPrefs, type ErlcServerView, type ErlcSnapshot } from '../../lib/cad';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonRows, Tabs } from '../../components/ui';

interface Live { server: ErlcServerView; snapshot: ErlcSnapshot | null; stale: boolean }
interface CmdLog { id: string; command: string; critical: boolean; ok: boolean; result: string | null; error: string | null; userName: string | null; discordId: string | null; createdAt: string }

/** ER:LC Live: Daten kommen nur über das Backend (der Server-Key bleibt dort). */
export function ErlcLive() {
  const { can } = useAuth();
  const { cad, set } = useCadPrefs();
  const servers = useQuery({ queryKey: ['erlc-servers'], queryFn: () => api<ErlcServerView[]>('/erlc/servers') });
  const id = cad.erlcServerId && servers.data?.some((s) => s.id === cad.erlcServerId) ? cad.erlcServerId : servers.data?.[0]?.id;
  const live = useQuery({ queryKey: ['erlc-live', id], queryFn: () => api<Live>(`/erlc/servers/${id}/live`), enabled: !!id, refetchInterval: (q) => Math.max(5, (q.state.data as Live | undefined)?.server.pollSeconds ?? 15) * 1000 });
  const [tab, setTab] = useState('Spieler');
  const [filter, setFilter] = useState('');
  if (servers.isLoading) return <SkeletonRows />;
  if (servers.error) return <ErrorState error={servers.error} />;
  if (!servers.data?.length) return <><PageHeader title="ER:LC Live" /><Card><EmptyState text="Kein ER:LC-Server verbunden." hint={can('cad.manage_erlc') ? 'CAD → Einstellungen → ER:LC Integration' : 'Ein Administrator muss den Server verbinden.'} /></Card></>;
  const d = live.data, s = d?.snapshot, srv = d?.server;
  const tabs = ['Spieler', 'Staff', 'Queue', 'Fahrzeuge', 'Notrufe', 'Mod Calls', 'Join Logs', 'Kill Logs', 'Command Logs', ...(s?.webhookEvents?.length ? ['Webhook'] : []), ...(can('cad.erlc_command') && srv?.features.includes('commands') ? ['Command Center'] : [])];
  const f = filter.toLowerCase();
  const table = (head: string[], rows: React.ReactNode[][], empty = 'Keine Daten (oder Funktion nicht freigegeben).') => rows.length ? (
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted">{head.map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</tbody></table></div>
  ) : <EmptyState text={empty} />;
  return (
    <>
      <PageHeader title="ER:LC Live" subtitle={srv ? `Aktualisierung alle ${srv.pollSeconds} s · letzter Abruf ${ago(srv.lastSyncAt)}` : undefined}
        actions={servers.data.length > 1 ? <Select aria-label="Server" className="w-auto" value={id} onChange={(e) => set({ erlcServerId: e.target.value })}>{servers.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select> : undefined} />
      {live.error && <ErrorState error={live.error} />}
      {d?.stale && srv && <div role="status" className="mb-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">ER:LC API momentan nicht erreichbar oder eingeschränkt{srv.lastError ? `: ${srv.lastError}` : ''}. Angezeigt wird der letzte bekannte Stand{s ? ` (${ago(s.fetchedAt)})` : ''}.</div>}
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Status', srv ? <Badge tone={ERLC_STATUS_TONE[srv.status] ?? 'neutral'}>{srv.statusLabel}</Badge> : '—'],
          ['Spieler', s ? `${s.server.currentPlayers} / ${s.server.maxPlayers}` : '—'],
          ['Queue', s?.queue ? s.queue.length : '—'],
          ['Staff online', s?.players ? s.players.filter((p) => p.permission && p.permission !== 'Normal').length : '—'],
          ['Fahrzeuge', s?.vehicles ? s.vehicles.length : '—'],
          ['Latenz', srv?.latencyMs ? `${srv.latencyMs} ms` : '—'],
        ].map(([k, v]) => <div key={String(k)} className="card border border-line p-3"><p className="text-xs text-muted">{k}</p><div className="text-xl font-semibold">{v}</div></div>)}
      </div>
      {s && <p className="mb-2 text-xs text-muted">{s.server.name}{s.server.joinKey ? ` · Join-Key ${s.server.joinKey}` : ''}{s.server.accVerifiedReq ? ` · Verifizierung: ${s.server.accVerifiedReq}` : ''}{s.server.teamBalance !== null ? ` · Team-Balance ${s.server.teamBalance ? 'an' : 'aus'}` : ''}</p>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-2">
        {tab !== 'Command Center' && <Input aria-label="Filtern" className="mb-2 max-w-xs py-1 text-xs" placeholder="Filtern…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        {!s && tab !== 'Command Center' ? <EmptyState text="Noch keine Daten abgerufen." /> : <>
          {tab === 'Spieler' && table(['Spieler', 'Team', 'Callsign', 'Rechte', 'Ort', 'Wanted'], (s!.players ?? []).filter((p) => !f || `${p.name} ${p.team} ${p.callsign}`.toLowerCase().includes(f)).map((p) => [p.name, p.team ?? '—', p.callsign ?? '—', p.permission ?? '—', p.location ? [p.location.street, p.location.postal && `Postal ${p.location.postal}`].filter(Boolean).join(' · ') || `${Math.round(p.location.x)}, ${Math.round(p.location.z)}` : '—', p.wantedStars ? '⭐'.repeat(p.wantedStars) : '']))}
          {tab === 'Staff' && table(['Name', 'Rolle', 'Roblox-ID'], s!.staff ? [...s!.staff.admins.map((x) => [x.name, 'Admin', x.id]), ...s!.staff.mods.map((x) => [x.name, 'Moderator', x.id]), ...s!.staff.helpers.map((x) => [x.name, 'Helper', x.id])].filter((r) => !f || r.join(' ').toLowerCase().includes(f)) : [])}
          {tab === 'Queue' && table(['#', 'Roblox-ID'], (s!.queue ?? []).map((x, i) => [i + 1, x]))}
          {tab === 'Fahrzeuge' && table(['Fahrzeug', 'Besitzer', 'Kennzeichen', 'Farbe', 'Lackierung'], (s!.vehicles ?? []).filter((v) => !f || `${v.name} ${v.owner} ${v.plate}`.toLowerCase().includes(f)).map((v) => [v.name, v.owner, v.plate ?? '—', <span key="c" className="inline-flex items-center gap-1">{v.colorHex && <span className="inline-block h-3 w-3 rounded" style={{ background: v.colorHex }} />}{v.colorName ?? '—'}</span>, v.texture ?? '—']))}
          {tab === 'Notrufe' && table(['Nr.', 'Zeit', 'Team', 'Meldung', 'Ort'], (s!.emergencyCalls ?? []).map((c) => [`#${c.callNumber}`, unixTime(c.startedAt), c.team ?? '—', c.description ?? '—', c.positionDescriptor ?? '—']))}
          {tab === 'Mod Calls' && table(['Zeit', 'Anrufer', 'Moderator'], (s!.modCalls ?? []).map((m) => [unixTime(m.timestamp), m.caller, m.moderator ?? 'offen']))}
          {tab === 'Join Logs' && table(['Zeit', 'Spieler', ''], (s!.joinLogs ?? []).filter((j) => !f || j.player.toLowerCase().includes(f)).map((j) => [unixTime(j.timestamp), j.player, j.join ? '➡️ beigetreten' : '⬅️ verlassen']))}
          {tab === 'Kill Logs' && table(['Zeit', 'Täter', 'Opfer'], (s!.killLogs ?? []).map((k) => [unixTime(k.timestamp), k.killer, k.killed]))}
          {tab === 'Command Logs' && table(['Zeit', 'Spieler', 'Befehl'], (s!.commandLogs ?? []).filter((c) => !f || `${c.player} ${c.command}`.toLowerCase().includes(f)).map((c) => [unixTime(c.timestamp), c.player, <code key="c">{c.command}</code>]))}
          {tab === 'Webhook' && table(['Zeit', 'Ereignis'], (s!.webhookEvents ?? []).map((w) => [new Date(w.at).toLocaleTimeString('de-DE'), <code key="w" className="text-xs">{w.summary}</code>]))}
        </>}
        {tab === 'Command Center' && srv && <CommandCenter server={srv} />}
      </div>
    </>
  );
}

/** Befehle auf dem ER:LC-Server ausführen. Kritische Befehle nur mit eigenem Recht und Bestätigung; alles wird protokolliert. */
function CommandCenter({ server }: { server: ErlcServerView }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [cmd, setCmd] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const log = useQuery({ queryKey: ['erlc-commands', server.id], queryFn: () => api<CmdLog[]>(`/erlc/servers/${server.id}/commands`), enabled: can('cad.view_logs') });
  const name = cmd.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const critical = server.settings.criticalCommands.map((c) => c.toLowerCase()).includes(name);
  const blocked = server.settings.blockedCommands.map((c) => c.toLowerCase()).includes(name);
  const run = useMutation({
    mutationFn: (confirmed: boolean) => api<{ result: string | null }>(`/erlc/servers/${server.id}/command`, { body: { command: cmd.trim(), confirm: confirmed } }),
    onSuccess: (r) => { setMsg({ ok: true, text: `Ausgeführt: ${r.result ?? 'OK'}` }); setCmd(''); setConfirm(false); void qc.invalidateQueries({ queryKey: ['erlc-commands'] }); },
    onError: (e) => { setConfirm(false); setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Fehlgeschlagen' }); void qc.invalidateQueries({ queryKey: ['erlc-commands'] }); },
  });
  const submit = () => { if (critical) setConfirm(true); else run.mutate(false); };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Befehl ausführen">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (cmd.trim()) submit(); }}>
          <Input aria-label="Befehl" placeholder=":h Hallo zusammen!" maxLength={500} value={cmd} onChange={(e) => setCmd(e.target.value)} />
          <Button type="submit" disabled={!/^:\w/.test(cmd.trim()) || blocked || run.isPending || (critical && !can('cad.erlc_command_critical'))}>Ausführen</Button>
        </form>
        <p className="mt-2 text-xs text-muted">{blocked ? '⛔ Dieser Befehl ist für das Dashboard gesperrt.' : critical ? (can('cad.erlc_command_critical') ? '⚠️ Kritischer Befehl – Bestätigung erforderlich.' : '⛔ Kritischer Befehl – dafür fehlt dir das Recht.') : 'Laut ER:LC-API höchstens ein Befehl alle 5 Sekunden.'}</p>
        {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
        <p className="mt-3 text-xs text-muted">Kritisch: {server.settings.criticalCommands.join(' ')}<br />Gesperrt: {server.settings.blockedCommands.join(' ') || '—'}</p>
      </Card>
      {can('cad.view_logs') && <Card title="Protokoll">
        {!log.data?.length ? <EmptyState text="Noch keine Befehle." /> : <ul className="max-h-96 divide-y divide-line overflow-auto text-sm">{log.data.map((l) => (
          <li key={l.id} className="py-1.5"><code>{l.command}</code> {l.critical && <Badge tone="warning">kritisch</Badge>} <Badge tone={l.ok ? 'success' : 'danger'}>{l.ok ? 'OK' : 'Fehler'}</Badge>
            <span className="block text-xs text-muted">{new Date(l.createdAt).toLocaleString('de-DE')} · {l.userName ?? '—'}{l.discordId ? ` (Discord ${l.discordId})` : ''} · {l.result ?? l.error ?? ''}</span></li>))}</ul>}
      </Card>}
      <ConfirmDialog cancelLabel="Abbrechen" open={confirm} danger title="Kritischen Befehl bestätigen" confirmLabel="Bestätigen" busy={run.isPending}
        message={<>Diese Aktion kann Auswirkungen auf den ER:LC-Server haben.<br /><code className="mt-2 block rounded bg-panel-2 p-2 text-fg">{cmd}</code></>}
        onConfirm={() => run.mutate(true)} onClose={() => setConfirm(false)} />
    </div>
  );
}
