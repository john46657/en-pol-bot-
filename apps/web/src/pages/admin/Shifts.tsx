import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { ChannelPicker, RolePicker } from '../../components/DiscordPickers';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, ErrorState, Input, Modal, SkeletonRows } from '../../components/ui';

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
        {disabled ? <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge> : <Toggle label={`${title} enabled`} checked={enabled} onChange={onToggle} />}
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
  const remove = (t: ShiftType) => { if (confirm(`Delete shift type „${t.name}“?`)) put(cfg.types.filter((x) => x.id !== t.id).map((x, i) => ({ ...x, isDefault: t.isDefault ? i === 0 : x.isDefault }))); };
  const startNew = () => setEdit({ isNew: true, type: { id: '', name: '', isDefault: cfg.types.length === 0, onShiftRoleIds: [], onBreakRoleIds: [], logChannelId: null } });
  return (
    <>
      <ModuleHeader title="Shifts" desc="Configure the shifts module for your server." enabled={cfg.enabled} disabled={!manage} onToggle={(v) => put(cfg.types, v)} />
      {save.error && !edit && <p role="alert" className="mb-3 text-sm text-danger">{errText(save.error)}</p>}
      <Card title="Shift Types" actions={<div className="flex items-center gap-2">
        <button type="button" aria-label="Help" aria-expanded={help} className="text-muted hover:text-fg" onClick={() => setHelp(!help)}><HelpCircle size={18} /></button>
        {manage && <Button variant="secondary" onClick={startNew}>New shift type<Plus size={16} aria-hidden /></Button>}
      </div>}>
        {help && <p className="mb-3 rounded-md bg-panel-2 p-3 text-sm text-muted">
          A shift type decides which Discord role someone gets <b>while on shift</b> and <b>while on break</b>, and where the shift log is posted. People start a shift with the duty panel (<code>/dienstpanel</code>), <code>/dienst</code> or on the Team page; with several types they choose one, otherwise the <b>default</b> is used. Off duty removes all shift roles.
          {!cfg.enabled && <> The module is <b>off</b> – the duty roles from Settings are used instead.</>}
        </p>}
        {!cfg.types.length ? <p className="text-sm text-muted">No shift types yet.{manage && ' Create one with „New shift type“.'}</p> : (
          <ul className="grid gap-2">{cfg.types.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg border border-line bg-bg/40 px-3 py-2.5">
              <span className="font-medium">{t.name}</span>{t.isDefault && <Badge tone="info">Default</Badge>}
              <span className="ml-auto flex items-center gap-1">
                {manage && !t.isDefault && <Button size="sm" variant="ghost" onClick={() => put(cfg.types.map((x) => ({ ...x, isDefault: x.id === t.id })))}>Make default</Button>}
                {manage && <button type="button" aria-label={`Edit ${t.name}`} className="rounded p-1.5 hover:bg-panel-2" onClick={() => setEdit({ isNew: false, type: t })}><Pencil size={16} /></button>}
                {manage && <button type="button" aria-label={`Delete ${t.name}`} className="rounded p-1.5 text-danger hover:bg-danger/10" onClick={() => remove(t)}><Trash2 size={16} /></button>}
              </span>
            </li>
          ))}</ul>
        )}
      </Card>
      {edit && <ShiftTypeModal value={edit.type} isNew={edit.isNew} busy={save.isPending} error={save.error ? errText(save.error) : undefined} onClose={() => { setEdit(undefined); save.reset(); }}
        onSave={(t) => {
          const typed = edit.isNew ? { ...t, id: slug(t.name, cfg.types.map((x) => x.id)) } : t;
          const others = cfg.types.filter((x) => x.id !== typed.id).map((x) => (typed.isDefault ? { ...x, isDefault: false } : x));
          put(edit.isNew ? [...others, typed] : cfg.types.map((x) => (x.id === typed.id ? typed : others.find((o) => o.id === x.id) ?? x)));
        }} />}
    </>
  );
}

function ShiftTypeModal({ value, isNew, busy, error, onClose, onSave }: { value: ShiftType; isNew: boolean; busy: boolean; error?: string; onClose: () => void; onSave: (t: ShiftType) => void }) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  const set = (p: Partial<ShiftType>) => setT({ ...t, ...p });
  return (
    <Modal open wide title={isNew ? 'New shift type' : `Edit ${value.name}`} onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-3">
        <Box title="Name" required desc="Used to identify this shift type"><Input aria-label="Name" maxLength={60} value={t.name} onChange={(e) => set({ name: e.target.value })} /></Box>
        <Box title="On Shift Role" desc="Role given while on shift"><RolePicker ariaLabel="On Shift Role" value={t.onShiftRoleIds} onChange={(ids) => set({ onShiftRoleIds: ids })} /></Box>
        <Box title="On Break Role" desc="Role given while on break"><RolePicker ariaLabel="On Break Role" value={t.onBreakRoleIds} onChange={(ids) => set({ onBreakRoleIds: ids })} /></Box>
        <Box title="Shift Log Channel" desc="Channel for shift logs (empty = duty channel from Settings)"><ChannelPicker ariaLabel="Shift Log Channel" value={t.logChannelId} onChange={(id) => set({ logChannelId: id })} /></Box>
        <Box title="Default" desc="Used when someone starts a shift without choosing a type"><Toggle label="Default shift type" checked={t.isDefault} onChange={(v) => set({ isDefault: v })} /></Box>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !t.name.trim()} onClick={() => onSave({ ...t, name: t.name.trim() })}>Save</Button>
      </div>
    </Modal>
  );
}
