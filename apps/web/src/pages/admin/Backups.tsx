import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, RotateCcw, Trash2 } from 'lucide-react';
import { BACKUP_PART_LABEL, BACKUP_PARTS, type BackupConfig, type BackupPart, type BackupRestoreResult, type DiscordBackupData } from '@enrp/shared';
import { api } from '../../lib/api';
import { errText } from '../../lib/tickets';
import { useGuilds, useServer } from '../../lib/guilds';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows, Tabs } from '../../components/ui';

interface DataFile { name: string; kind: 'auto' | 'manuell' | 'vor-wiederherstellung'; size: number; createdAt: string }
interface DiscordBackup { id: string; guildId: string; guildName: string; name: string; auto: boolean; status: 'PENDING' | 'READY' | 'FAILED'; stats: { roles: number; channels: number; categories: number } | null; error: string | null; createdAt: string; restoredAt: string | null; restoreResult: BackupRestoreResult | null }

const fmt = (d: string) => new Date(d).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const mb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const KIND: Record<DataFile['kind'], string> = { auto: 'automatisch', manuell: 'von Hand', 'vor-wiederherstellung': 'vor Wiederherstellung' };
const CONFIRM = 'WIEDERHERSTELLEN';

/** Administration → Backups: Discord-Server (wie Xenon) und Dashboard-Daten sichern und wiederherstellen. */
export function Backups() {
  const [tab, setTab] = useState('Discord-Server');
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ['backup-config'], queryFn: () => api<BackupConfig>('/backups/config') });
  const saveCfg = useMutation({ mutationFn: (c: BackupConfig) => api<BackupConfig>('/backups/config', { method: 'PUT', body: c }), onSuccess: (r) => qc.setQueryData(['backup-config'], r) });
  const c = cfg.data;
  return (
    <>
      <PageHeader title="💾 Backups" subtitle="Discord-Server und Dashboard-Daten sichern – und bei Bedarf wiederherstellen." />
      {c && (
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-panel p-3 text-sm">
          <label className="flex items-center gap-2"><Toggle label="Dashboard-Daten täglich sichern" checked={c.dataAuto} onChange={(v) => saveCfg.mutate({ ...c, dataAuto: v })} />Dashboard-Daten täglich sichern</label>
          <label className="flex items-center gap-2"><Toggle label="Discord-Server täglich sichern" checked={c.discordAuto} onChange={(v) => saveCfg.mutate({ ...c, discordAuto: v })} />Discord-Server täglich sichern</label>
          <label className="flex items-center gap-2">Behalten<div className="w-20"><Select aria-label="Automatische Backups behalten" value={c.keep} onChange={(e) => saveCfg.mutate({ ...c, keep: Number(e.target.value) })}>{[3, 7, 14, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</Select></div>automatische</label>
          {saveCfg.error && <span role="alert" className="text-danger">{errText(saveCfg.error)}</span>}
        </div>
      )}
      <Tabs tabs={['Discord-Server', 'Dashboard-Daten']} active={tab} onChange={setTab} />
      <div className="mt-3">{tab === 'Discord-Server' ? <DiscordBackups /> : <DataBackups />}</div>
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
  useEffect(() => { if (!guildId) setGuildId(server || guilds.data?.[0]?.id || ''); }, [server, guilds.data, guildId]);
  const q = useQuery({ queryKey: ['discord-backups'], queryFn: () => api<DiscordBackup[]>('/backups/discord'), refetchInterval: (x) => (x.state.data?.some((b) => b.status === 'PENDING') ? 3000 : 15_000) });
  const create = useMutation({ mutationFn: () => api('/backups/discord', { body: { guildId, ...(name.trim() ? { name: name.trim() } : {}) } }), onSuccess: () => { setName(''); setMsg({ ok: true, text: 'Backup wird erstellt – der Bot liest den Server gerade aus.' }); void qc.invalidateQueries({ queryKey: ['discord-backups'] }); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/backups/discord/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(undefined); void qc.invalidateQueries({ queryKey: ['discord-backups'] }); } });
  const gName = (id: string) => guilds.data?.find((g) => g.id === id)?.name ?? id;
  return (
    <div className="grid gap-3">
      <Card title="Neues Backup">
        <p className="mb-2 text-xs text-muted">Gesichert werden Rollen (mit Farben und Rechten), Kategorien, Kanäle mit ihren Rechten und die Servereinstellungen. Nachrichten werden nicht gesichert.</p>
        <div className="grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
          <Select aria-label="Server" value={guildId} onChange={(e) => setGuildId(e.target.value)}>{(guilds.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
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
  const [target, setTarget] = useState(backup.guildId);
  const [parts, setParts] = useState<BackupPart[]>(['roles', 'channels']);
  const [confirm, setConfirm] = useState('');
  const run = useMutation({ mutationFn: () => api(`/backups/discord/${backup.id}/restore`, { body: { guildId: target, parts, confirm } }), onSuccess: () => onDone('Wiederherstellung läuft – der Bot arbeitet das Backup ab. Das Ergebnis erscheint gleich am Backup.') });
  return (
    <Modal open title={`„${backup.name}“ wiederherstellen`} onClose={onClose}>
      <div className="grid gap-3 text-sm">
        <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">Sicher wiederherstellen: Vorhandene Rollen und Kanäle mit gleichem Namen werden angepasst, fehlende neu angelegt. <b>Es wird nichts gelöscht.</b> Der Bot braucht „Rollen verwalten“, „Kanäle verwalten“ und „Server verwalten“; Rollen über der Bot-Rolle kann er nicht ändern.</p>
        <label className="grid gap-1">Ziel-Server<Select aria-label="Ziel-Server" value={target} onChange={(e) => setTarget(e.target.value)}>{(guilds.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}{g.id === backup.guildId ? ' (Original)' : ''}</option>)}</Select></label>
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

function DataBackups() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['data-backups'], queryFn: () => api<DataFile[]>('/backups/data') });
  const [restore, setRestore] = useState<{ name?: string; file?: File }>();
  const [confirm, setConfirm] = useState('');
  const [del, setDel] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const done = () => void qc.invalidateQueries({ queryKey: ['data-backups'] });
  const create = useMutation({ mutationFn: () => api<{ name: string; rows: number }>('/backups/data', { method: 'POST' }), onSuccess: (r) => { setMsg({ ok: true, text: `Backup erstellt (${r.rows} Einträge).` }); done(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const remove = useMutation({ mutationFn: (n: string) => api(`/backups/data/${n}`, { method: 'DELETE' }), onSuccess: () => { setDel(undefined); done(); } });
  const run = useMutation({
    mutationFn: () => {
      if (restore?.file) { const fd = new FormData(); fd.append('file', restore.file); fd.append('confirm', confirm); return api<{ rows: number; safety: string }>('/backups/data-upload/restore', { method: 'POST', formData: fd }); }
      return api<{ rows: number; safety: string }>(`/backups/data/${restore!.name}/restore`, { body: { confirm } });
    },
    onSuccess: (r) => { setRestore(undefined); setConfirm(''); setMsg({ ok: true, text: `Wiederhergestellt (${r.rows} Einträge). Der vorherige Stand liegt als „${r.safety}“ bereit.` }); done(); void qc.invalidateQueries(); },
  });
  return (
    <div className="grid gap-3">
      <Card title="Dashboard-Daten" actions={<Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>💾 Jetzt sichern</Button>}>
        <p className="mb-2 text-xs text-muted">Alle Daten des Dashboards (Personal, Akten, Einsätze, Berichte, Bewerbungen, Tickets, Einstellungen, Konten …) als komprimierte Datei. Hochgeladene Dateien (Bilder, Anhänge) liegen im Speicherordner und sind nicht enthalten. Die Backups enthalten auch Konten – nur vertrauenswürdig weitergeben.</p>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState text="Noch keine Backups." /> : (
          <ul className="divide-y divide-line">{q.data.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1"><b>{fmt(f.createdAt)}</b> <Badge tone={f.kind === 'auto' ? 'neutral' : f.kind === 'manuell' ? 'info' : 'warning'}>{KIND[f.kind]}</Badge> <span className="text-xs text-muted">{mb(f.size)}</span></span>
              <a href={`/api/v1/backups/data/${f.name}`} className="inline-flex items-center rounded px-2 py-1 text-xs hover:bg-panel-2"><Download size={14} className="mr-1" />Herunterladen</a>
              <Button size="sm" variant="secondary" onClick={() => { setConfirm(''); setRestore({ name: f.name }); }}><RotateCcw size={14} className="mr-1" />Wiederherstellen</Button>
              <Button size="sm" variant="ghost" aria-label="Backup löschen" onClick={() => setDel(f.name)}><Trash2 size={14} /></Button>
            </li>
          ))}</ul>
        )}
      </Card>
      <Card title="Backup-Datei einspielen">
        <p className="mb-2 text-xs text-muted">Eine heruntergeladene Backup-Datei (.json.gz) wieder einspielen – z. B. nach einem Umzug auf einen neuen Server.</p>
        <input type="file" accept=".gz,.json,application/gzip,application/json" aria-label="Backup-Datei" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setConfirm(''); setRestore({ file }); } e.target.value = ''; }} className="text-sm" />
      </Card>
      {restore && (
        <Modal open title="Dashboard-Daten wiederherstellen" onClose={() => setRestore(undefined)}>
          <div className="grid gap-3 text-sm">
            <p className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs"><b>Alle aktuellen Daten werden durch das Backup ersetzt</b> {restore.file ? `(Datei „${restore.file.name}“)` : ''}. Vorher wird automatisch der jetzige Stand gesichert. Angemeldete Benutzer bleiben angemeldet, das Audit-Log bleibt vollständig erhalten.</p>
            <label className="grid gap-1">Zum Bestätigen <b>{CONFIRM}</b> eingeben<Input aria-label="Bestätigung" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
            {run.error && <p role="alert" className="text-danger">{errText(run.error)}</p>}
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRestore(undefined)}>Abbrechen</Button><Button variant="danger" disabled={confirm !== CONFIRM || run.isPending} onClick={() => run.mutate()}>{run.isPending ? 'Wird eingespielt…' : 'Wiederherstellen'}</Button></div>
          </div>
        </Modal>
      )}
      <ConfirmDialog open={!!del} danger title="Backup löschen?" message="Die Backup-Datei wird endgültig gelöscht." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del)} onClose={() => setDel(undefined)} />
    </div>
  );
}
