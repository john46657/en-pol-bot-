import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { ChannelPicker, RolePicker } from '../../components/DiscordPickers';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, Modal, Select, SkeletonRows, StatusBadge } from '../../components/ui';

export interface ShiftType { id: string; name: string; isDefault: boolean; onShiftRoleIds: string[]; onBreakRoleIds: string[]; logChannelId?: string | null }
export interface ShiftsConfig { enabled: boolean; types: ShiftType[] }

/** Eingerahmtes Feld wie bei Melonly: Titel, Beschreibung, Eingabe. */
export const Box = ({ title, desc, required, children }: { title: string; desc: string; required?: boolean; children: ReactNode }) => (
  <div className="grid content-start gap-2 rounded-lg border border-line bg-panel-2/40 p-3">
    <div><p className="font-semibold">{title}{required && <span className="text-danger"> *</span>}</p><p className="text-xs text-muted">{desc}</p></div>
    {children}
  </div>
);
/** Kopf eines Moduls: Schalter, Titel, Beschreibung. */
export function ModuleHeader({ title, desc, enabled, onToggle, disabled }: { title: string; desc: string; enabled: boolean; onToggle: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        {disabled ? <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'An' : 'Aus'}</Badge> : <Toggle label={`${title} aktiviert`} checked={enabled} onChange={onToggle} />}
        <h1 className="text-2xl font-semibold">{title}</h1>
      </div>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}

const slug = (name: string, used: string[]) => {
  const base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'schicht';
  let id = base, n = 2;
  while (used.includes(id)) id = `${base}-${n++}`;
  return id;
};

/** Admin → Shifts: Schicht-Arten mit Dienst-/Pausen-Rolle und Log-Channel (wie bei Melonly/ERM). */
export function Shifts() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['shifts-config'], queryFn: () => api<ShiftsConfig>('/shifts/config') });
  const [edit, setEdit] = useState<{ type: ShiftType; isNew: boolean }>();
  const [help, setHelp] = useState(false);
  const save = useMutation({
    mutationFn: (cfg: ShiftsConfig) => api<ShiftsConfig>('/shifts/config', { method: 'PUT', body: cfg }),
    onSuccess: (r) => { qc.setQueryData(['shifts-config'], r); setEdit(undefined); },
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isLoading || !q.data) return <SkeletonRows />;
  const cfg = q.data;
  const put = (types: ShiftType[], enabled = cfg.enabled) => save.mutate({ enabled, types });
  const remove = (t: ShiftType) => { if (confirm(`Schichtart „${t.name}“ löschen?`)) put(cfg.types.filter((x) => x.id !== t.id).map((x, i) => ({ ...x, isDefault: t.isDefault ? i === 0 : x.isDefault }))); };
  const startNew = () => setEdit({ isNew: true, type: { id: '', name: '', isDefault: cfg.types.length === 0, onShiftRoleIds: [], onBreakRoleIds: [], logChannelId: null } });
  return (
    <>
      <ModuleHeader title="Schichten" desc="Konfiguriere das Schichtmodul für deinen Server." enabled={cfg.enabled} disabled={!manage} onToggle={(v) => put(cfg.types, v)} />
      {save.error && !edit && <p role="alert" className="mb-3 text-sm text-danger">{errText(save.error)}</p>}
      <Card title="Schichtarten" actions={<div className="flex items-center gap-2">
        <button type="button" aria-label="Hilfe" aria-expanded={help} className="text-muted hover:text-fg" onClick={() => setHelp(!help)}><HelpCircle size={18} /></button>
        {manage && <Button variant="secondary" onClick={startNew}>Neue Schichtart<Plus size={16} aria-hidden /></Button>}
      </div>}>
        {help && <p className="mb-3 rounded-md bg-panel-2 p-3 text-sm text-muted">
          Eine Schichtart legt fest, welche Discord-Rolle jemand <b>während der Schicht</b> und <b>in der Pause</b> bekommt und wohin das Schicht-Log gepostet wird. Schichten starten über das Dienstpanel (<code>/dienstpanel</code>), <code>/dienst</code> oder auf der Team-Seite; bei mehreren Arten wird eine gewählt, sonst gilt der <b>Standard</b>. Außer Dienst entfernt alle Schichtrollen.
          {!cfg.enabled && <> Das Modul ist <b>aus</b> – stattdessen gelten die Dienstrollen aus den Einstellungen.</>}
        </p>}
        {!cfg.types.length ? <p className="text-sm text-muted">Noch keine Schichtarten.{manage && ' Lege eine mit „Neue Schichtart“ an.'}</p> : (
          <ul className="grid gap-2">{cfg.types.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg border border-line bg-bg/40 px-3 py-2.5">
              <span className="font-medium">{t.name}</span>{t.isDefault && <Badge tone="info">Standard</Badge>}
              <span className="ml-auto flex items-center gap-1">
                {manage && !t.isDefault && <Button size="sm" variant="ghost" onClick={() => put(cfg.types.map((x) => ({ ...x, isDefault: x.id === t.id })))}>Als Standard setzen</Button>}
                {manage && <button type="button" aria-label={`${t.name} bearbeiten`} className="rounded p-1.5 hover:bg-panel-2" onClick={() => setEdit({ isNew: false, type: t })}><Pencil size={16} /></button>}
                {manage && <button type="button" aria-label={`${t.name} löschen`} className="rounded p-1.5 text-danger hover:bg-danger/10" onClick={() => remove(t)}><Trash2 size={16} /></button>}
              </span>
            </li>
          ))}</ul>
        )}
      </Card>
      {can('team.manage') && <ShiftLog types={cfg.types} />}
      {edit && <ShiftTypeModal value={edit.type} isNew={edit.isNew} busy={save.isPending} error={save.error ? errText(save.error) : undefined} onClose={() => { setEdit(undefined); save.reset(); }}
        onSave={(t) => {
          const typed = edit.isNew ? { ...t, id: slug(t.name, cfg.types.map((x) => x.id)) } : t;
          const others = cfg.types.filter((x) => x.id !== typed.id).map((x) => (typed.isDefault ? { ...x, isDefault: false } : x));
          put(edit.isNew ? [...others, typed] : cfg.types.map((x) => (x.id === typed.id ? typed : others.find((o) => o.id === x.id) ?? x)));
        }} />}
    </>
  );
}

interface ShiftLogItem {
  id: string; userId: string; name: string; rank: string | null; callsign: string | null; shiftType: string | null; shiftTypeNames: string[];
  startedAt: string; endedAt: string | null; active: boolean; status: string; minutes: number; breakMinutes: number; breaks: number; startedBy: string | null; endedBy: string | null;
}
/** 95 → „1 Std. 35 Min.“ */
export const duration = (min: number) => (min < 60 ? `${min} Min.` : `${Math.floor(min / 60)} Std.${min % 60 ? ` ${min % 60} Min.` : ''}`);

/** Schicht-Logs: wer wann welche Schicht gestartet/beendet hat, wie lange, mit Pausen (aktualisiert sich alle paar Sekunden). */
function ShiftLog({ types }: { types: ShiftType[] }) {
  const [days, setDays] = useState(7);
  const [type, setType] = useState('');
  const [user, setUser] = useState('');
  const q = useQuery({ queryKey: ['shift-log', days, type], queryFn: () => api<{ items: ShiftLogItem[] }>(`/team/shifts?days=${days}${type ? `&shiftType=${type}` : ''}`) });
  const all = q.data?.items ?? [];
  const people = [...new Map(all.map((x) => [x.userId, x.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const items = user ? all.filter((x) => x.userId === user) : all;
  const total = items.reduce((n, x) => n + x.minutes, 0), running = items.filter((x) => x.active).length;
  const by = (who: string | null, self: string) => (who && who !== self ? <span className="block text-xs text-muted">von {who}</span> : null);
  return (
    <Card className="mt-4" title={<span className="flex items-center gap-2"><History size={16} aria-hidden />Schicht-Logs</span>} actions={<div className="flex flex-wrap items-center gap-2">
      <div className="w-44"><Select aria-label="Zeitraum" className="w-auto py-1 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 7, 30, 90].map((d) => <option key={d} value={d}>{d === 1 ? 'Letzte 24 Stunden' : `Letzte ${d} Tage`}</option>)}</Select></div>
      {types.length > 0 && <div className="w-44"><Select aria-label="Schichtart-Filter" className="w-auto py-1 text-xs" value={type} onChange={(e) => setType(e.target.value)}><option value="">Alle Schichtarten</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></div>}
      <div className="w-44"><Select aria-label="Beamter-Filter" className="w-auto py-1 text-xs" value={user} onChange={(e) => setUser(e.target.value)}><option value="">Alle Beamten</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></div>
    </div>}>
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !items.length ? <EmptyState text="Keine Schichten in diesem Zeitraum." hint="Schichten entstehen, wenn jemand in den Dienst geht – über das Dienstpanel, /dienst oder die Team-Seite." /> : (
        <>
          <p className="mb-2 text-xs text-muted">{items.length} {items.length === 1 ? 'Schicht' : 'Schichten'} · {duration(total)} gesamt{running > 0 && ` · ${running} ${running === 1 ? 'läuft' : 'laufen'} gerade`}</p>
          <div className="table-scroll">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-2">Beamter</th><th>Schichtart</th><th>Beginn</th><th>Ende</th><th>Dauer</th><th>Pausen</th></tr></thead>
              <tbody>{items.map((x) => (
                <tr key={x.id} className="border-b border-line/60 align-top last:border-0">
                  <td className="p-2"><span className="font-medium">{x.name}</span>{x.callsign && <span className="ml-1 text-xs text-muted">{x.callsign}</span>}{x.rank && <span className="block text-xs text-muted">{x.rank}</span>}</td>
                  <td className="py-2">{x.shiftTypeNames.length ? x.shiftTypeNames.join(' → ') : '—'}</td>
                  <td className="py-2 whitespace-nowrap">{fmt(x.startedAt)}{by(x.startedBy, x.name)}</td>
                  <td className="py-2 whitespace-nowrap">{x.active ? <StatusBadge status={x.status} /> : <>{fmt(x.endedAt)}{by(x.endedBy, x.name)}</>}</td>
                  <td className="py-2 whitespace-nowrap">{duration(x.minutes)}{x.active && <span className="ml-1 text-xs text-muted">(läuft)</span>}</td>
                  <td className="py-2 whitespace-nowrap">{x.breaks ? `${x.breaks}× · ${duration(x.breakMinutes)}` : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function ShiftTypeModal({ value, isNew, busy, error, onClose, onSave }: { value: ShiftType; isNew: boolean; busy: boolean; error?: string; onClose: () => void; onSave: (t: ShiftType) => void }) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  const set = (p: Partial<ShiftType>) => setT({ ...t, ...p });
  return (
    <Modal open wide title={isNew ? 'Neue Schichtart' : `${value.name} bearbeiten`} onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-3">
        <Box title="Name" required desc="Zur Erkennung dieser Schichtart"><Input aria-label="Name" maxLength={60} value={t.name} onChange={(e) => set({ name: e.target.value })} /></Box>
        <Box title="Schichtrolle" desc="Rolle während der Schicht"><RolePicker ariaLabel="Schichtrolle" value={t.onShiftRoleIds} onChange={(ids) => set({ onShiftRoleIds: ids })} /></Box>
        <Box title="Pausenrolle" desc="Rolle während der Pause"><RolePicker ariaLabel="Pausenrolle" value={t.onBreakRoleIds} onChange={(ids) => set({ onBreakRoleIds: ids })} /></Box>
        <Box title="Schicht-Log-Kanal" desc="Kanal für Schicht-Logs (leer = Dienst-Kanal aus den Einstellungen)"><ChannelPicker ariaLabel="Schicht-Log-Kanal" value={t.logChannelId} onChange={(id) => set({ logChannelId: id })} /></Box>
        <Box title="Standard" desc="Wird genutzt, wenn jemand eine Schicht ohne Auswahl startet"><Toggle label="Standard-Schichtart" checked={t.isDefault} onChange={(v) => set({ isDefault: v })} /></Box>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button disabled={busy || !t.name.trim()} onClick={() => onSave({ ...t, name: t.name.trim() })}>Speichern</Button>
      </div>
    </Modal>
  );
}
