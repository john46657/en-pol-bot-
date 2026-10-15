import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { DangerConfig } from '@enrp/shared';
import { api, ApiError } from '../../lib/api';
import { useAutosaveDraft } from '../../lib/autosave';
import { useGuilds } from '../../lib/guilds';
import { ChannelPicker } from '../../components/DiscordPickers';
import { Button, Card, Field, fmt, Input, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';
import { useAuth } from '../../lib/auth';

/** Discord-Nachrichten → Gefahrenstatus: Stufen, Texte, Schaltflächen, Ping und das Discord-Panel (automatisch gespeichert). */
export function DangerSettingsPage() {
  return (
    <>
      <PageHeader title="Gefahrenstatus" subtitle="Stufen, Texte, Schaltflächen und das Panel in Discord – Änderungen werden automatisch gespeichert" />
      <DangerSettings />
    </>
  );
}

// ───────── Aktueller Status (direkt im Dashboard schalten, wie per Button im Discord-Panel) ─────────
interface DangerNow { level: string; reason: string | null; setByName: string | null; at: string | null; levels: { key: string; name: string; title: string; emoji: string; color: string }[] }
function DangerCurrent() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const cur = useQuery({ queryKey: ['danger-now'], queryFn: () => api<DangerNow>('/danger-level'), refetchInterval: 15_000 });
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const set = useMutation({
    mutationFn: (level: string) => api<DangerNow>('/danger-level', { method: 'PUT', body: { level, ...(reason.trim() ? { reason: reason.trim() } : {}) } }),
    onSuccess: (r) => { setReason(''); qc.setQueryData(['danger-now'], r); setMsg({ ok: true, text: '✅ Status gesetzt – die Meldung geht gleich in Discord raus.' }); },
    onError: (e) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Fehler' }),
  });
  const now = cur.data?.levels.find((l) => l.key === cur.data?.level);
  return (
    <Card title="🚨 Aktueller Status" className="lg:col-span-2">
      {!cur.data ? <SkeletonRows rows={2} /> : <>
        <p className="mb-3 text-sm">
          {now ? <b style={{ color: now.color }}>{now.emoji} {now.name} – {now.title}</b> : <span className="text-muted">noch nicht gesetzt</span>}
          {cur.data.at && <span className="ml-2 text-xs text-muted">seit {fmt(cur.data.at)}{cur.data.setByName ? ` · von ${cur.data.setByName}` : ''}{cur.data.reason ? ` · „${cur.data.reason}“` : ''}</span>}
        </p>
        {can('dispatch.manage') ? <>
          <Field label="Grund (optional)">{(id) => <Input id={id} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Schießerei Innenstadt" />}</Field>
          <div className="mt-2 flex flex-wrap gap-2">{cur.data.levels.map((l) => (
            <Button key={l.key} size="sm" variant={l.key === cur.data?.level ? 'primary' : 'secondary'} disabled={set.isPending} onClick={() => set.mutate(l.key)} style={{ borderColor: l.color }}>{l.emoji} {l.name}</Button>
          ))}</div>
        </> : <p className="text-xs text-muted">Zum Umschalten fehlt das Recht „dispatch.manage“.</p>}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      </>}
    </Card>
  );
}

// ───────── Gefahrenstatus (Stufen, Texte, Buttons, Ping) ─────────
/** Button-Panel vom Dashboard aus in einen beliebigen Kanal senden (ein älteres Panel löscht der Bot). */
function DangerPanelSender() {
  const qc = useQueryClient();
  const guilds = useGuilds();
  const cur = useQuery({ queryKey: ['danger-panel'], queryFn: () => api<{ channelId: string | null; posted: boolean }>('/danger-level/panel') });
  const [channelId, setChannelId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>();
  const send = useMutation({
    mutationFn: (target: string) => api('/danger-level/panel', { body: { channelId: target } }),
    onSuccess: () => { setMsg('✅ Gesendet – der Bot postet das Panel in wenigen Sekunden.'); setTimeout(() => void qc.invalidateQueries({ queryKey: ['danger-panel'] }), 8000); },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : 'Fehler'),
  });
  const chName = (id: string | null) => { for (const g of guilds.data ?? []) { const c = g.channels.find((x) => x.id === id); if (c) return `#${c.name} (${g.name})`; } return id ?? '—'; };
  return (
    <Card title="📌 Panel in Discord senden" className="lg:col-span-2">
      <p className="mb-2 text-xs text-muted">Das Panel zeigt den aktuellen Status mit einer Schaltfläche je Stufe und aktualisiert sich selbst. Es gibt immer nur ein Panel: Wird es in einen anderen Kanal geschickt, löscht der Bot das alte.</p>
      <p className="mb-2 text-sm">Aktuell: {cur.data?.channelId ? <b>{chName(cur.data.channelId)}</b> : <span className="text-muted">noch kein Panel gepostet</span>}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1"><Field label="Kanal">{() => <ChannelPicker ariaLabel="Kanal für das Panel" value={channelId ?? cur.data?.channelId} onChange={(id) => { setChannelId(id); setMsg(undefined); }} />}</Field></div>
        <Button disabled={!(channelId ?? cur.data?.channelId) || send.isPending} onClick={() => { const t = channelId ?? cur.data?.channelId; if (t) send.mutate(t); }}>Panel senden</Button>
      </div>
      {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
    </Card>
  );
}

function DangerSettings() {
  const q = useQuery({ queryKey: ['danger-config'], queryFn: () => api<DangerConfig>('/danger-level/config') });
  const [d, setD] = useState<DangerConfig | null>(null);
  useEffect(() => { if (q.data && !d) setD(q.data); }, [q.data, d]);
  useAutosaveDraft(d ? 'danger:config' : null, d ?? undefined, (v) => ({ method: 'PUT', path: '/danger-level/config', body: v, guildId: null, label: 'Gefahrenstatus' }));
  if (!d) return <SkeletonRows />;
  const setLevel = (i: number, p: Partial<DangerConfig['levels'][number]>) => setD({ ...d, levels: d.levels.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const move = (i: number, dir: number) => { const n = [...d.levels]; const [x] = n.splice(i, 1); n.splice(i + dir, 0, x!); setD({ ...d, levels: n }); };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <DangerCurrent />
      <DangerPanelSender />
      <Card title="📣 Kanal für Statusänderungen" className="lg:col-span-2">
        <p className="mb-2 text-xs text-muted">Hier postet der Bot bei jeder Änderung des Gefahrenstatus eine Meldung (mit Ping). Das kann ein anderer Kanal sein als der des Panels. Die vorherige Meldung ersetzt der Bot dabei.</p>
        <Field label="Kanal" hint={d.channelId ? undefined : 'Leer = Gefahrenstatus-Kanal aus Einstellungen → Discord.'}>{() => <ChannelPicker ariaLabel="Kanal für Statusänderungen" value={d.channelId ?? null} onChange={(channelId) => setD({ ...d, channelId })} />}</Field>
      </Card>
      <Card title="Panel-Inhalt">
        <div className="grid gap-2">
          <Field label="Titel">{(id) => <Input id={id} maxLength={200} value={d.panelTitle} onChange={(e) => setD({ ...d, panelTitle: e.target.value })} />}</Field>
          <Field label="Text (Markdown)">{(id) => <Textarea id={id} rows={5} maxLength={3000} value={d.panelText} onChange={(e) => setD({ ...d, panelText: e.target.value })} />}</Field>
          <Field label="Emoji auf den Schaltflächen (leer = Emoji der Stufe)">{(id) => <Input id={id} maxLength={4} value={d.buttonEmoji} onChange={(e) => setD({ ...d, buttonEmoji: e.target.value })} />}</Field>
          <Field label="Bei jeder Änderung pingen (z. B. @Im Dienst)" hint="Gepingt wird in der Meldung im Kanal für Statusänderungen (oben).">{() => <RolePicker value={d.pingRoleIds} onChange={(pingRoleIds) => setD({ ...d, pingRoleIds })} />}</Field>
        </div>
      </Card>
      <Card title="Vorschau">
        <div className="rounded border-l-4 bg-panel-2 p-3 text-sm" style={{ borderColor: d.levels[0]?.color }}>
          <p className="mb-2 text-base font-bold">{d.panelTitle}</p><p className="whitespace-pre-wrap">{d.panelText}</p>
          <div className="mt-3 flex flex-wrap gap-1">{d.levels.map((l) => <span key={l.key} className="rounded bg-danger px-2 py-1 text-xs text-white">{d.buttonEmoji || l.emoji} {l.name}</span>)}</div>
        </div>
      </Card>
      <Card title="Stufen" className="lg:col-span-2">
        <ul className="space-y-3">{d.levels.map((l, i) => (
          <li key={i} className="grid gap-2 rounded border border-line p-2 md:grid-cols-[auto_1fr_1fr_auto]">
            <div className="flex gap-1"><Input aria-label="Emoji" className="w-14 text-center" maxLength={4} value={l.emoji} onChange={(e) => setLevel(i, { emoji: e.target.value })} /><Input aria-label="Farbe" type="color" className="h-9 w-12 p-0.5" value={l.color} onChange={(e) => setLevel(i, { color: e.target.value })} /></div>
            <Input aria-label="Name (Schaltfläche)" maxLength={40} value={l.name} onChange={(e) => setLevel(i, { name: e.target.value })} />
            <Input aria-label="Überschrift" maxLength={200} value={l.title} placeholder="z. B. Geringe Kriminalität." onChange={(e) => setLevel(i, { title: e.target.value })} />
            <div className="flex items-center gap-1">
              <Select aria-label="Schaltflächenfarbe" className="w-auto py-1 text-xs" value={l.buttonStyle} onChange={(e) => setLevel(i, { buttonStyle: e.target.value as 'danger' })}><option value="danger">rot</option><option value="primary">blau</option><option value="success">grün</option><option value="secondary">grau</option></Select>
              <Button size="sm" variant="ghost" aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></Button>
              <Button size="sm" variant="ghost" aria-label="nach unten" disabled={i === d.levels.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></Button>
              <Button size="sm" variant="ghost" aria-label="Entfernen" disabled={d.levels.length <= 2} onClick={() => setD({ ...d, levels: d.levels.filter((_, j) => j !== i) })}><Trash2 size={12} /></Button>
            </div>
            <Textarea aria-label="Text der Meldung (Markdown)" className="md:col-span-4" rows={3} maxLength={3500} value={l.text} onChange={(e) => setLevel(i, { text: e.target.value })} />
            <div className="flex flex-wrap items-center gap-2 md:col-span-4"><span className="text-xs text-muted">Bei dieser Stufe zusätzlich pingen:</span><RolePicker value={l.pingRoleIds ?? []} onChange={(pingRoleIds) => setLevel(i, { pingRoleIds })} /></div>
            <div className="flex flex-wrap items-center gap-2 md:col-span-4"><span className="text-xs text-muted">Nur diese Rollen dürfen auf diese Stufe schalten (leer = alle mit Leitstellen-Recht):</span><RolePicker value={l.allowRoleIds ?? []} onChange={(allowRoleIds) => setLevel(i, { allowRoleIds })} /></div>
          </li>))}</ul>
        <Button size="sm" variant="secondary" className="mt-2" disabled={d.levels.length >= 10} onClick={() => setD({ ...d, levels: [...d.levels, { key: `STATUS_${d.levels.length + 1}_${Math.random().toString(36).slice(2, 5).toUpperCase()}`, name: `Status ${d.levels.length + 1}`, title: '', text: '', emoji: '⚪', color: '#64748b', buttonStyle: 'danger' }] })}>+ Stufe</Button>
      </Card>
    </div>
  );
}

/** Discord-Rollen als Chips mit „+ Rolle…“ (aus allen verbundenen Servern), höchstens 10. */
function RolePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const guilds = useGuilds();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((id) => { const r = guilds.data?.flatMap((g) => g.roles).find((x) => x.id === id); return <span key={id} className="inline-flex items-center gap-1 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-xs">@{r?.name ?? id}<button type="button" aria-label={`@${r?.name ?? id} entfernen`} onClick={() => onChange(value.filter((x) => x !== id))}>×</button></span>; })}
      {value.length < 10 && <Select aria-label="Rolle hinzufügen" className="w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && onChange([...new Set([...value, e.target.value])])}><option value="">+ Rolle…</option>{(guilds.data ?? []).map((g) => <optgroup key={g.id} label={g.name}>{g.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}</optgroup>)}</Select>}
    </div>
  );
}
