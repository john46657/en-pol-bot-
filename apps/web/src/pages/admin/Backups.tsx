import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Eye, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { BACKUP_FREQUENCIES, BACKUP_MODULE_GROUPS, BACKUP_PART_LABEL, BACKUP_PARTS, BACKUP_SCOPE_LABEL, BACKUP_SCOPES, type BackupConfig, type BackupModuleKey, type BackupScope, type BackupPart, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { useGuilds, useServer } from '../../lib/guilds';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows, Tabs } from '../../components/ui';

interface DataFile { name: string; kind: string; size: number; createdAt: string; encrypted: boolean; scope: BackupScope; modules: string[]; status: string; sha256: string | null; verifiedAt: string | null; verifyMessage: string | null; archivedAt: string | null; createdBy: string | null; rows: number | null; note: string | null; location: string }
interface DiscordBackup { id: string; guildId: string; guildName: string; name: string; auto: boolean; status: 'PENDING' | 'READY' | 'FAILED'; stats: { roles: number; channels: number; categories: number } | null; error: string | null; createdAt: string; restoredAt: string | null; restoreResult: BackupRestoreResult | null }

const fmt = (d: string) => new Date(d).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const mb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const KIND: Record<string, string> = { auto: 'automatisch', manuell: 'von Hand', 'vor-wiederherstellung': 'vor Wiederherstellung', 'vor-update': 'vor Update', 'vor-umstellung': 'vor Umstellung', 'vor-mehrserver': 'vor Mehrserver', 'vor-zusammenfuehrung': 'vor Zusammenführung' };
const CONFIRM = 'WIEDERHERSTELLEN';
const FREQ: Record<string, string> = { off: 'aus', hourly: 'stündlich', daily: 'täglich', weekly: 'wöchentlich', monthly: 'monatlich' };

/** Administration → Backups: Discord-Server (wie Xenon) und Dashboard-Daten sichern und wiederherstellen. */
export function Backups() {
  const [tab, setTab] = useState('Discord-Server');
  const qc = useQueryClient();
  // Daten-Backups und der Backup-Plan betreffen alle Server – nur für globale Systemadministratoren
  const global = !!useAuth().user?.globalAdmin;
  const cfg = useQuery({ queryKey: ['backup-config'], queryFn: () => api<BackupConfig>('/backups/config'), enabled: global });
  const saveCfg = useMutation({ mutationFn: (c: BackupConfig) => api<BackupConfig>('/backups/config', { method: 'PUT', body: c }), onSuccess: (r) => qc.setQueryData(['backup-config'], r) });
  const c = cfg.data;
  return (
    <>
      <PageHeader title="💾 Backup-Center" subtitle="Discord-Server und Dashboard-Daten sichern, prüfen, archivieren – und bei Bedarf kontrolliert wiederherstellen." />
      {c && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-panel p-3 text-sm">
          <label className="flex items-center gap-2"><Toggle label="Dashboard-Daten automatisch sichern" checked={c.dataAuto} onChange={(v) => saveCfg.mutate({ ...c, dataAuto: v })} />Dashboard-Daten automatisch sichern</label>
          <label className="flex items-center gap-2"><Toggle label="Discord-Server täglich sichern" checked={c.discordAuto} onChange={(v) => saveCfg.mutate({ ...c, discordAuto: v })} />Discord-Server täglich sichern</label>
          <label className="flex items-center gap-2">Behalten<div className="w-20"><Select aria-label="Automatische Backups behalten" value={c.keep} onChange={(e) => saveCfg.mutate({ ...c, keep: Number(e.target.value) })}>{[3, 7, 14, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</Select></div>Tage</label>
          <label className="flex items-center gap-2">Zeitplan<Select aria-label="Zeitplan" className="w-36" value={c.schedule.frequency} onChange={(e) => saveCfg.mutate({ ...c, schedule: { ...c.schedule, frequency: e.target.value as BackupConfig['schedule']['frequency'] } })}>{BACKUP_FREQUENCIES.map((f) => <option key={f} value={f}>{FREQ[f]}</option>)}</Select></label>
          {c.schedule.frequency !== 'hourly' && c.schedule.frequency !== 'off' && <label className="flex items-center gap-2">um (UTC)<Select aria-label="Stunde" className="w-20" value={c.schedule.hour} onChange={(e) => saveCfg.mutate({ ...c, schedule: { ...c.schedule, hour: Number(e.target.value) } })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}</Select></label>}
          {c.schedule.frequency === 'weekly' && <label className="flex items-center gap-2">am<Select aria-label="Wochentag" className="w-32" value={c.schedule.weekday} onChange={(e) => saveCfg.mutate({ ...c, schedule: { ...c.schedule, weekday: Number(e.target.value) } })}>{['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'].map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></label>}
          {c.schedule.frequency === 'monthly' && <label className="flex items-center gap-2">am<Select aria-label="Tag im Monat" className="w-20" value={c.schedule.monthDay} onChange={(e) => saveCfg.mutate({ ...c, schedule: { ...c.schedule, monthDay: Number(e.target.value) } })}>{Array.from({ length: 28 }, (_, d) => <option key={d} value={d + 1}>{d + 1}.</option>)}</Select></label>}
          <label className="flex items-center gap-2">Umfang<Select aria-label="Umfang automatisch" className="w-44" value={c.autoScope} onChange={(e) => saveCfg.mutate({ ...c, autoScope: e.target.value as 'FULL' | 'DATABASE' })}><option value="DATABASE">Datenbank</option><option value="FULL">Datenbank + Dateien</option></Select></label>
          <label className="flex items-center gap-2"><Toggle label="Verschlüsseln" checked={c.encrypt} onChange={(v) => saveCfg.mutate({ ...c, encrypt: v })} />Verschlüsseln</label>
          <label className="flex items-center gap-2">Status-Kanal (Discord-ID)<Input aria-label="Status-Kanal" className="w-48" defaultValue={c.statusChannelId ?? ''} onBlur={(e) => { const v = e.target.value.trim(); if (v === (c.statusChannelId ?? '') || (v && !/^\d{15,25}$/.test(v))) return; saveCfg.mutate({ ...c, statusChannelId: v || null }); }} /></label>
          <p className="basis-full text-xs text-muted">Automatische Dashboard-Backups laufen nach Zeitplan (stündlich: die letzten 48 Stunden jede Stunde, davor eines pro Tag). Archivierte Backups werden nie automatisch gelöscht. Vor Updates/Migrationen: „Vor Update“ wählen; auf dem VPS sichert deploy/update.sh zusätzlich die Datenbank. Statusmeldungen gehen an globale Administratoren und optional in einen privaten Kanal – ohne Inhalte.</p>
          {saveCfg.error && <span role="alert" className="text-danger">{errText(saveCfg.error)}</span>}
        </div>
      )}
      {global ? <Tabs tabs={['Discord-Server', 'Dashboard-Daten']} active={tab} onChange={setTab} />
        : <p className="mb-2 text-xs text-muted">Hier sicherst du den gewählten Discord-Server. Dashboard-Daten (alle Server) sichern nur globale Systemadministratoren.</p>}
      <div className="mt-3">{tab === 'Discord-Server' || !global ? <DiscordBackups /> : <DataBackups />}</div>
    </>
  );
}

function DiscordBackups() {
  const qc = useQueryClient();
  const guilds = useGuilds();
  const [server] = useServer();
  const [guildId, setGuildId] = useState('');
  const [name, setName] = useState('');
  const [view, setView] = useState<string>();
  const [restore, setRestore] = useState<DiscordBackup>();
  const [del, setDel] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  useEffect(() => { if (server && guildId !== server) setGuildId(server); else if (!guildId) setGuildId(guilds.data?.[0]?.id || ''); }, [server, guilds.data, guildId]);
  const q = useQuery({ queryKey: ['discord-backups'], queryFn: () => api<DiscordBackup[]>('/backups/discord'), refetchInterval: (x) => (x.state.data?.some((b) => b.status === 'PENDING') ? 3000 : 15_000) });
  const create = useMutation({ mutationFn: () => api('/backups/discord', { body: { guildId, ...(name.trim() ? { name: name.trim() } : {}) } }), onSuccess: () => { setName(''); setMsg({ ok: true, text: 'Backup wird erstellt – der Bot liest den Server gerade aus.' }); void qc.invalidateQueries({ queryKey: ['discord-backups'] }); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/backups/discord/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(undefined); void qc.invalidateQueries({ queryKey: ['discord-backups'] }); } });
  const gName = (id: string) => guilds.data?.find((g) => g.id === id)?.name ?? id;
  const choices = (guilds.data ?? []).filter((g) => !server || g.id === server);
  return (
    <div className="grid gap-3">
      <Card title="Neues Backup">
        <p className="mb-2 text-xs text-muted">Gesichert werden Rollen (mit Farben und Rechten), Kategorien, Kanäle mit ihren Rechten und die Servereinstellungen. Nachrichten werden nicht gesichert.</p>
        <div className="grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
          <Select aria-label="Server" value={guildId} onChange={(e) => setGuildId(e.target.value)}>{choices.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
          <Input aria-label="Name des Backups" maxLength={80} placeholder="Name (optional), z. B. „Vor Umbau“" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!guildId || create.isPending} onClick={() => create.mutate()}>💾 Backup erstellen</Button>
        </div>
        {!guilds.data?.length && <p className="mt-2 text-xs text-warning">Der Bot hat noch keine Server gemeldet.</p>}
      </Card>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      <Card title={`Backups (${q.data?.length ?? 0})`}>
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState text="Noch keine Backups." hint="Erstelle oben das erste Backup – oder schalte die tägliche Sicherung ein." /> : (
          <ul className="divide-y divide-line">{q.data.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{b.name} {b.auto && <Badge tone="neutral">automatisch</Badge>} {b.status === 'PENDING' ? <Badge tone="info">wird erstellt…</Badge> : b.status === 'FAILED' ? <Badge tone="danger">fehlgeschlagen</Badge> : null}</p>
                <p className="text-xs text-muted">{b.guildName || gName(b.guildId)} · {fmt(b.createdAt)}{b.stats ? ` · ${b.stats.roles} Rollen, ${b.stats.categories} Kategorien, ${b.stats.channels} Kanäle` : ''}{b.error ? ` · ${b.error}` : ''}</p>
                {b.restoreResult && <p className="text-xs text-muted">Zuletzt wiederhergestellt {fmt(b.restoreResult.at)}: {b.restoreResult.created} angelegt, {b.restoreResult.updated} angepasst{b.restoreResult.failed ? <span className="text-warning">, {b.restoreResult.failed} fehlgeschlagen</span> : ''}</p>}
              </div>
              {b.status === 'READY' && <Button size="sm" variant="ghost" onClick={() => setView(b.id)}><Eye size={14} className="mr-1" />Ansehen</Button>}
              {b.status === 'READY' && <Button size="sm" variant="secondary" onClick={() => setRestore(b)}><RotateCcw size={14} className="mr-1" />Wiederherstellen</Button>}
              <Button size="sm" variant="ghost" aria-label={`${b.name} löschen`} onClick={() => setDel(b.id)}><Trash2 size={14} /></Button>
            </li>
          ))}</ul>
        )}
      </Card>
      {view && <BackupView id={view} onClose={() => setView(undefined)} />}
      {restore && <DiscordRestore backup={restore} onClose={() => setRestore(undefined)} onDone={(t) => { setRestore(undefined); setMsg({ ok: true, text: t }); }} />}
      <ConfirmDialog open={!!del} danger title="Backup löschen?" message="Das Backup wird endgültig gelöscht." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del)} onClose={() => setDel(undefined)} />
    </div>
  );
}

/** Inhalt eines Discord-Backups: Rollen und Kanäle (nach Kategorie), Download als JSON. */
function BackupView({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['discord-backup', id], queryFn: () => api<DiscordBackup & { data: DiscordBackupData }>(`/backups/discord/${id}`) });
  const d = q.data?.data;
  const download = () => { if (!q.data) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(q.data.data, null, 2)], { type: 'application/json' })); a.download = `discord-backup-${q.data.guildName || q.data.guildId}-${q.data.createdAt.slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <Modal open wide title={q.data ? `${q.data.name} – ${q.data.guildName}` : 'Backup'} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error || !d ? <ErrorState error={q.error} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          <section><h3 className="mb-1 text-sm font-semibold">Rollen ({d.roles.length})</h3>
            <ul className="max-h-80 space-y-0.5 overflow-auto text-sm">{[...d.roles].reverse().map((r) => <li key={r.id} className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#94a3b8' }} />{r.name}</li>)}</ul></section>
          <section><h3 className="mb-1 text-sm font-semibold">Kanäle ({d.channels.filter((c) => c.type !== 'category').length})</h3>
            <ul className="max-h-80 overflow-auto text-sm">{[null, ...d.channels.filter((c) => c.type === 'category')].map((cat) => {
              const list = d.channels.filter((c) => c.type !== 'category' && c.parentId === (cat?.id ?? null)).sort((a, b) => a.position - b.position);
              if (!cat && !list.length) return null;
              return <li key={cat?.id ?? 'none'} className="mb-1">{cat && <p className="text-xs font-semibold uppercase text-muted">📁 {cat.name}</p>}<ul className="pl-2">{list.map((c) => <li key={c.id}>{c.type === 'voice' || c.type === 'stage' ? '🔊' : '#'} {c.name}{c.overwrites.length ? <span className="text-[11px] text-muted"> · {c.overwrites.length} Rechte</span> : null}</li>)}</ul></li>;
            })}</ul></section>
          <div className="md:col-span-2 flex justify-end"><Button variant="secondary" onClick={download}><Download size={14} className="mr-1" />Als Datei herunterladen</Button></div>
        </div>
      )}
    </Modal>
  );
}

function DiscordRestore({ backup, onClose, onDone }: { backup: DiscordBackup; onClose: () => void; onDone: (t: string) => void }) {
  const guilds = useGuilds();
  const [server] = useServer();
  const [target, setTarget] = useState(backup.guildId);
  const [parts, setParts] = useState<BackupPart[]>(['roles', 'channels']);
  const [confirm, setConfirm] = useState('');
  const run = useMutation({ mutationFn: () => api(`/backups/discord/${backup.id}/restore`, { body: { guildId: target, parts, confirm } }), onSuccess: () => onDone('Wiederherstellung läuft – der Bot arbeitet das Backup ab. Das Ergebnis erscheint gleich am Backup.') });
  return (
    <Modal open title={`„${backup.name}“ wiederherstellen`} onClose={onClose}>
      <div className="grid gap-3 text-sm">
        <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">Sicher wiederherstellen: Vorhandene Rollen und Kanäle mit gleichem Namen werden angepasst, fehlende neu angelegt. <b>Es wird nichts gelöscht.</b> Der Bot braucht „Rollen verwalten“, „Kanäle verwalten“ und „Server verwalten“; Rollen über der Bot-Rolle kann er nicht ändern.</p>
        <label className="grid gap-1">Ziel-Server<Select aria-label="Ziel-Server" value={target} onChange={(e) => setTarget(e.target.value)}>{(guilds.data ?? []).filter((g) => !server || g.id === server).map((g) => <option key={g.id} value={g.id}>{g.name}{g.id === backup.guildId ? ' (Original)' : ''}</option>)}</Select></label>
        <fieldset className="grid gap-1"><legend className="mb-1 text-xs font-medium text-muted">Was wiederherstellen?</legend>
          {BACKUP_PARTS.map((p) => <label key={p} className="flex items-center gap-2"><input type="checkbox" checked={parts.includes(p)} onChange={(e) => setParts(e.target.checked ? [...parts, p] : parts.filter((x) => x !== p))} />{BACKUP_PART_LABEL[p]}</label>)}
        </fieldset>
        <label className="grid gap-1">Zum Bestätigen <b>{CONFIRM}</b> eingeben<Input aria-label="Bestätigung" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {run.error && <p role="alert" className="text-danger">{errText(run.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button variant="danger" disabled={confirm !== CONFIRM || !parts.length || run.isPending} onClick={() => run.mutate()}>Wiederherstellen</Button></div>
      </div>
    </Modal>
  );
}

interface PlanRow { table: string; inBackup: number; current: number; newer: number }
interface Plan { createdAt: string | null; migration: string | null; scope: BackupScope; modules: string[]; files: number; tables: PlanRow[]; newerRows: number; warnings: string[]; blockers: string[]; restorable: boolean }
interface Status { encryptionAvailable: boolean; encryptionActive: boolean; lastBackupAt: string | null; lastOkAt: string | null; failed: number; location: string }
const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = { OK: 'success', CORRUPT: 'danger', MISSING: 'danger', FAILED: 'danger', CREATING: 'warning', UNVERIFIED: 'neutral' };
const STATUS_TEXT: Record<string, string> = { OK: 'geprüft', CORRUPT: 'fehlerhaft', MISSING: 'Datei fehlt', FAILED: 'fehlgeschlagen', CREATING: 'wird erstellt', UNVERIFIED: 'ungeprüft' };

/** Backup-Center 2.0: erstellen (Umfang wählbar), prüfen, archivieren, herunterladen, Wiederherstellung mit Plan. */
function DataBackups() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [view, setView] = useState<'0' | '1'>('0');
  const [term, setTerm] = useState('');
  const q = useQuery({ queryKey: ['data-backups', view], queryFn: () => api<DataFile[]>('/backups/data', { query: { archived: view } }) });
  const st = useQuery({ queryKey: ['backup-status'], queryFn: () => api<Status>('/backups/status') });
  const [mk, setMk] = useState<{ scope: BackupScope; modules: BackupModuleKey[]; note: string; kind: 'manuell' | 'vor-update' }>({ scope: 'DATABASE', modules: [], note: '', kind: 'manuell' });
  const [restore, setRestore] = useState<{ name?: string; file?: File }>();
  const [del, setDel] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const done = () => { void qc.invalidateQueries({ queryKey: ['data-backups'] }); void qc.invalidateQueries({ queryKey: ['backup-status'] }); };
  const create = useMutation({ mutationFn: () => api<{ name: string; rows: number; encrypted: boolean }>('/backups/data', { method: 'POST', body: { scope: mk.scope, modules: mk.scope === 'MODULE' ? mk.modules : undefined, note: mk.note || undefined, kind: mk.kind } }), onSuccess: (r) => { setMsg({ ok: true, text: `Backup erstellt (${r.rows} Einträge${r.encrypted ? ', verschlüsselt' : ''}).` }); done(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const verify = useMutation({ mutationFn: (n: string) => api<{ status: string; message: string }>(`/backups/data/${n}/verify`, { method: 'POST' }), onSuccess: (r) => { setMsg({ ok: r.status === 'OK', text: `Prüfung: ${r.message}` }); done(); } });
  const archive = useMutation({ mutationFn: (x: { n: string; a: boolean }) => api(`/backups/data/${x.n}/archive`, { method: 'POST', body: { archived: x.a } }), onSuccess: done });
  const remove = useMutation({ mutationFn: (n: string) => api(`/backups/data/${n}`, { method: 'DELETE' }), onSuccess: () => { setDel(undefined); done(); } });
  const rows = (q.data ?? []).filter((f) => !term || [f.name, f.note, f.createdBy, f.scope].some((v) => v?.toLowerCase().includes(term.toLowerCase())));
  return (
    <div className="grid gap-3">
      {st.data && (
        <div className="grid gap-2 sm:grid-cols-4">
          <Card><p className="text-xs text-muted">Letztes Backup</p><p className="font-semibold">{st.data.lastBackupAt ? fmt(st.data.lastBackupAt) : '—'}</p></Card>
          <Card><p className="text-xs text-muted">Letztes geprüftes</p><p className="font-semibold">{st.data.lastOkAt ? fmt(st.data.lastOkAt) : '—'}</p></Card>
          <Card><p className="text-xs text-muted">Verschlüsselung</p><p className="font-semibold">{st.data.encryptionActive ? <Badge tone="success">aktiv (AES-256-GCM)</Badge> : st.data.encryptionAvailable ? <Badge tone="warning">abgeschaltet</Badge> : <Badge tone="danger">kein Schlüssel</Badge>}</p>{!st.data.encryptionAvailable && <p className="mt-1 text-xs text-muted">BACKUP_ENCRYPTION_KEY auf dem Server setzen.</p>}</Card>
          <Card><p className="text-xs text-muted">Fehlerhafte Backups</p><p className="font-semibold">{st.data.failed ? <Badge tone="danger">{st.data.failed}</Badge> : <Badge tone="success">keine</Badge>}</p></Card>
        </div>
      )}
      {can('backup.create') && (
        <Card title="Backup erstellen">
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="grid gap-1">Umfang<Select aria-label="Umfang" value={mk.scope} onChange={(e) => setMk({ ...mk, scope: e.target.value as BackupScope })}>{BACKUP_SCOPES.map((x) => <option key={x} value={x}>{BACKUP_SCOPE_LABEL[x]}</option>)}</Select></label>
            <label className="grid gap-1">Anlass<Select aria-label="Anlass" value={mk.kind} onChange={(e) => setMk({ ...mk, kind: e.target.value as 'manuell' | 'vor-update' })}><option value="manuell">Manuell</option><option value="vor-update">Vor Update/Migration</option></Select></label>
            <label className="grid min-w-48 flex-1 gap-1">Notiz<Input value={mk.note} maxLength={300} onChange={(e) => setMk({ ...mk, note: e.target.value })} /></label>
            <Button disabled={create.isPending || (mk.scope === 'MODULE' && !mk.modules.length)} onClick={() => create.mutate()}>💾 Jetzt sichern</Button>
          </div>
          {mk.scope === 'MODULE' && <div className="mt-2 flex flex-wrap gap-3 text-sm">{BACKUP_MODULE_GROUPS.map((g) => <label key={g.key} className="flex gap-1"><input type="checkbox" checked={mk.modules.includes(g.key)} onChange={() => setMk({ ...mk, modules: mk.modules.includes(g.key) ? mk.modules.filter((x) => x !== g.key) : [...mk.modules, g.key] })} />{g.label}</label>)}</div>}
          <p className="mt-2 text-xs text-muted">Backups liegen nur im nicht öffentlichen Speicherordner der API und sind nur über geschützte Serverfunktionen erreichbar. Jede Datei bekommt eine SHA-256-Prüfsumme. Passwörter/2FA liegen ohnehin nur gehasht bzw. verschlüsselt vor.</p>
        </Card>
      )}
      <Card title="Backups" actions={<div className="flex gap-2"><Input aria-label="Backups durchsuchen" placeholder="🔍 Suche" value={term} onChange={(e) => setTerm(e.target.value)} className="w-40" /><Select aria-label="Ansicht" value={view} onChange={(e) => setView(e.target.value as '0' | '1')}><option value="0">Aktuell</option><option value="1">Archiv</option></Select></div>}>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !rows.length ? <EmptyState text="Keine Backups." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Name / Erstellt</th><th className="p-2">Typ</th><th className="p-2">Größe</th><th className="p-2">Status</th><th className="p-2">Ersteller</th><th className="p-2">Prüfsumme</th><th className="p-2" /></tr></thead>
            <tbody>{rows.map((f) => (
              <tr key={f.name} className="border-b border-line/60 align-top">
                <td className="p-2"><b>{fmt(f.createdAt)}</b><span className="block text-xs text-muted [overflow-wrap:anywhere]">{f.name}</span>{f.note && <span className="block text-xs">{f.note}</span>}</td>
                <td className="p-2"><Badge tone={f.kind === 'auto' ? 'neutral' : f.kind === 'manuell' ? 'info' : 'warning'}>{KIND[f.kind] ?? f.kind}</Badge><span className="block text-xs text-muted">{BACKUP_SCOPE_LABEL[f.scope]}{f.modules.length ? `: ${f.modules.join(', ')}` : ''}</span>{f.encrypted && <span className="block text-xs">🔒 verschlüsselt</span>}</td>
                <td className="p-2 text-xs">{mb(f.size)}{f.rows !== null && <span className="block text-muted">{f.rows} Einträge</span>}</td>
                <td className="p-2"><Badge tone={STATUS_TONE[f.status] ?? 'neutral'}>{STATUS_TEXT[f.status] ?? f.status}</Badge>{f.verifyMessage && f.status !== 'OK' && <span className="block text-xs text-danger">{f.verifyMessage}</span>}{f.verifiedAt && <span className="block text-xs text-muted">{fmt(f.verifiedAt)}</span>}</td>
                <td className="p-2 text-xs">{f.createdBy ?? '—'}<span className="block text-muted">{f.location}</span></td>
                <td className="p-2"><code className="text-xs">{f.sha256 ? `${f.sha256.slice(0, 12)}…` : '—'}</code></td>
                <td className="p-2 text-right whitespace-nowrap">
                  {can('backup.verify') && <Button size="sm" variant="ghost" disabled={verify.isPending} onClick={() => verify.mutate(f.name)}><ShieldCheck size={14} />Prüfen</Button>}
                  {can('backup.download') && <a href={`/api/v1/backups/data/${f.name}`} className="inline-flex items-center rounded px-2 py-1 text-xs hover:bg-panel-2"><Download size={14} className="mr-1" />Laden</a>}
                  {can('backup.restore') && <Button size="sm" variant="secondary" onClick={() => setRestore({ name: f.name })}><RotateCcw size={14} />Wiederherstellen</Button>}
                  {can('backup.archive') && <Button size="sm" variant="ghost" onClick={() => archive.mutate({ n: f.name, a: !f.archivedAt })}><Archive size={14} />{f.archivedAt ? 'Zurückholen' : 'Archivieren'}</Button>}
                  {can('backup.archive') && !f.archivedAt && <Button size="sm" variant="ghost" aria-label="Backup löschen" onClick={() => setDel(f.name)}><Trash2 size={14} /></Button>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      {can('backup.restore') && (
        <Card title="Backup-Datei einspielen">
          <p className="mb-2 text-xs text-muted">Eine heruntergeladene Backup-Datei (.json.gz oder verschlüsselt .json.gz.enc mit demselben Schlüssel) wieder einspielen – z. B. nach einem Umzug.</p>
          <input type="file" accept=".gz,.enc,.json,application/gzip,application/json,application/octet-stream" aria-label="Backup-Datei" onChange={(e) => { const file = e.target.files?.[0]; if (file) setRestore({ file }); e.target.value = ''; }} className="text-sm" />
        </Card>
      )}
      {restore && <RestoreWizard source={restore} onClose={() => setRestore(undefined)} onDone={(text) => { setRestore(undefined); setMsg({ ok: true, text }); done(); void qc.invalidateQueries(); }} />}
      <ConfirmDialog open={!!del} danger title="Backup löschen?" message="Die Backup-Datei wird endgültig gelöscht. Archivierte Backups lassen sich nicht löschen." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del)} onClose={() => setDel(undefined)} />
    </div>
  );
}

/**
 * Wiederherstellung in Schritten: Plan laden (Integrität, Version, Umfang, neuere Daten) → Umfang wählen (vollständig oder
 * Bereiche) → ausdrücklich bestätigen (bei neueren Daten zusätzlich) → einspielen → Ergebnisprüfung anzeigen.
 */
function RestoreWizard({ source, onClose, onDone }: { source: { name?: string; file?: File }; onClose: () => void; onDone: (text: string) => void }) {
  const [groups, setGroups] = useState<BackupModuleKey[]>([]);
  const [confirm, setConfirm] = useState('');
  const [ack, setAck] = useState(false);
  const plan = useQuery({ queryKey: ['restore-plan', source.name, groups], queryFn: () => api<Plan>(`/backups/data/${source.name}/plan`, { method: 'POST', body: { groups: groups.length ? groups : undefined } }), enabled: !!source.name, retry: false });
  const run = useMutation({
    mutationFn: () => {
      if (source.file) { const fd = new FormData(); fd.append('file', source.file); fd.append('confirm', confirm); fd.append('acknowledgeNewer', String(ack)); return api<{ rows: number; files: number; safety: string; check: { ok: boolean; mismatches: string[] } }>('/backups/data-upload/restore', { method: 'POST', formData: fd }); }
      return api<{ rows: number; files: number; safety: string; check: { ok: boolean; mismatches: string[] } }>(`/backups/data/${source.name}/restore`, { body: { confirm, groups: groups.length ? groups : undefined, acknowledgeNewer: ack } });
    },
    onSuccess: (r) => onDone(`Wiederhergestellt: ${r.rows} Einträge, ${r.files} Dateien. Systemprüfung: ${r.check.ok ? 'in Ordnung' : `Abweichungen (${r.check.mismatches.join(', ')})`}. Der vorherige Stand liegt als „${r.safety}“ bereit.`),
  });
  const p = plan.data;
  const needAck = !!p?.newerRows || !!source.file;
  return (
    <Modal open wide title="Daten wiederherstellen" onClose={onClose}>
      <div className="grid gap-3 text-sm">
        {source.name && (
          <fieldset><legend className="mb-1 text-muted">Umfang (leer = alles aus dem Backup)</legend>
            <div className="flex flex-wrap gap-3">{BACKUP_MODULE_GROUPS.map((g) => <label key={g.key} className="flex gap-1"><input type="checkbox" checked={groups.includes(g.key)} onChange={() => setGroups(groups.includes(g.key) ? groups.filter((x) => x !== g.key) : [...groups, g.key])} />{g.label}</label>)}</div></fieldset>
        )}
        {source.name && (plan.isLoading ? <SkeletonRows rows={3} /> : plan.error ? <p role="alert" className="text-danger">{errText(plan.error)}</p> : p && (
          <div className="grid gap-2">
            <p>Backup vom <b>{p.createdAt ? fmt(p.createdAt) : '—'}</b> · Version {p.migration ?? 'unbekannt'} · {BACKUP_SCOPE_LABEL[p.scope]}{p.files ? ` · ${p.files} Dateien` : ''}</p>
            {p.blockers.map((b) => <p key={b} role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs">⛔ {b}</p>)}
            {p.warnings.map((w) => <p key={w} className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">⚠️ {w}</p>)}
            <details><summary className="cursor-pointer text-muted">Betroffene Tabellen ({p.tables.length})</summary>
              <table className="mt-1 w-full text-xs"><thead><tr className="text-left text-muted"><th>Tabelle</th><th>im Backup</th><th>aktuell</th><th>neuer als Backup</th></tr></thead><tbody>{p.tables.map((t) => <tr key={t.table}><td>{t.table}</td><td>{t.inBackup}</td><td>{t.current}</td><td className={t.newer ? 'text-warning' : ''}>{t.newer}</td></tr>)}</tbody></table></details>
          </div>
        ))}
        {source.file && <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">Hochgeladene Datei „{source.file.name}“: Integrität, Version und Umfang prüft der Server beim Einspielen; neuere Daten werden überschrieben.</p>}
        <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs"><b>Die betroffenen Daten werden durch das Backup ersetzt.</b> Vorher wird automatisch der jetzige Stand gesichert. Sitzungen und das Audit-Log bleiben erhalten.</p>
        {needAck && <label className="flex items-center gap-2"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />Mir ist bewusst, dass neuere Daten überschrieben werden.</label>}
        <label className="grid gap-1">Zum Bestätigen <b>{CONFIRM}</b> eingeben<Input aria-label="Bestätigung" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {run.error && <p role="alert" className="text-danger">{errText(run.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button variant="danger" disabled={confirm !== CONFIRM || (needAck && !ack) || (!!p && !p.restorable) || run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'Wird wiederhergestellt …' : 'Wiederherstellen'}</Button></div>
      </div>
    </Modal>
  );
}
