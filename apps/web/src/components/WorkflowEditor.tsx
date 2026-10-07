import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { ALL_PERMISSIONS, WORKFLOW_ACTION_LABELS, WORKFLOW_OP_LABELS, WORKFLOW_OPS, WORKFLOW_TRIGGERS, type WorkflowAction, type WorkflowCondition } from '@enrp/shared';
import { api, ApiError } from '../lib/api';
import { permLabel } from '../lib/permLabels';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Select, SkeletonRows, Textarea, fmt } from './ui';
import { ChannelsPicker, RolePicker } from './DiscordPickers';

interface Workflow { id: string; name: string; enabled: boolean; trigger: string; conditions: WorkflowCondition[]; actions: WorkflowAction[]; _count: { runs: number }; runs: { createdAt: string; ok: boolean; error: string | null }[] }
interface Run { id: string; action: string; entityId: string | null; ok: boolean; error: string | null; createdAt: string }
type Draft = Pick<Workflow, 'name' | 'enabled' | 'trigger' | 'conditions' | 'actions'>;

const triggerLabel = (t: string) => WORKFLOW_TRIGGERS.find((x) => x.key === t)?.label ?? t;
const newAction = (type: WorkflowAction['type']): WorkflowAction =>
  type === 'discord' ? { type, channelIds: [], title: '{{title}}', text: '' } : type === 'notify_role' ? { type, roleId: '', title: '{{title}}' } : { type, permission: 'team.manage', title: '{{title}}' };

/** Studio → Workflows: „Wenn Ereignis (+ Bedingungen) → Benachrichtigung / Discord-Meldung“. */
export function WorkflowEditor({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['workflows'], queryFn: () => api<Workflow[]>('/studio/workflows') });
  const [edit, setEdit] = useState<{ id?: string; draft: Draft }>();
  const [runsOf, setRunsOf] = useState<Workflow>();
  const [del, setDel] = useState<Workflow>();
  const toggle = useMutation({ mutationFn: (w: Workflow) => api(`/studio/workflows/${w.id}`, { method: 'PUT', body: { name: w.name, trigger: w.trigger, conditions: w.conditions, actions: w.actions, enabled: !w.enabled } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['workflows'] }) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/studio/workflows/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(undefined); void qc.invalidateQueries({ queryKey: ['workflows'] }); } });
  if (list.isLoading) return <SkeletonRows />;
  return (
    <div className="space-y-3">
      <Card title="⚙️ Workflows" actions={manage && <Button size="sm" onClick={() => setEdit({ draft: { name: '', enabled: true, trigger: 'incident.create', conditions: [], actions: [newAction('notify_permission')] } })}><Plus size={14} />Neuer Workflow</Button>}>
        <p className="mb-3 text-xs text-muted">Wenn etwas im System passiert (z. B. „Einsatz angelegt“ mit Priorität CRITICAL), werden automatisch Benachrichtigungen verschickt oder Discord-Meldungen gepostet. Workflows wirken nur auf neue Ereignisse; jede Ausführung wird protokolliert.</p>
        {!list.data?.length ? <EmptyState text="Noch keine Workflows." hint="Beispiel: Kritischer Einsatz → Schichtleitung benachrichtigen + Meldung im Leitstellen-Kanal." /> : (
          <ul className="divide-y divide-line/60">
            {list.data.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 py-2">
                <label className="flex items-center gap-2"><input type="checkbox" aria-label={`${w.name} aktiv`} checked={w.enabled} disabled={!manage || toggle.isPending} onChange={() => toggle.mutate(w)} /></label>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted">Wenn: {triggerLabel(w.trigger)}{w.conditions.length ? ` · ${w.conditions.length} Bedingung(en)` : ''} → {w.actions.map((a) => WORKFLOW_ACTION_LABELS[a.type].replace(/ …$/, '')).join(', ')}</p>
                </div>
                {w.runs[0] && <Badge tone={w.runs[0].ok ? 'success' : 'danger'}>{w.runs[0].ok ? 'zuletzt ok' : 'Fehler'} · {fmt(w.runs[0].createdAt)}</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setRunsOf(w)}>{w._count.runs} Läufe</Button>
                {manage && <Button size="sm" variant="secondary" onClick={() => setEdit({ id: w.id, draft: { name: w.name, enabled: w.enabled, trigger: w.trigger, conditions: w.conditions, actions: w.actions } })}>Bearbeiten</Button>}
                {manage && <Button size="sm" variant="ghost" aria-label={`${w.name} löschen`} onClick={() => setDel(w)}><Trash2 size={14} /></Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {edit && <WorkflowForm id={edit.id} initial={edit.draft} onClose={() => setEdit(undefined)} />}
      {runsOf && <RunsDialog w={runsOf} onClose={() => setRunsOf(undefined)} />}
      <ConfirmDialog open={!!del} danger title="Workflow löschen" message={`„${del?.name}“ und das Ausführungsprotokoll werden gelöscht.`} confirmLabel="Löschen" cancelLabel="Abbrechen" busy={remove.isPending} onClose={() => setDel(undefined)} onConfirm={() => del && remove.mutate(del.id)} />
    </div>
  );
}

function WorkflowForm({ id, initial, onClose }: { id?: string; initial: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(initial);
  const [err, setErr] = useState<string>();
  const trig = WORKFLOW_TRIGGERS.find((t) => t.key === d.trigger);
  const save = useMutation({
    mutationFn: () => api(id ? `/studio/workflows/${id}` : '/studio/workflows', { method: id ? 'PUT' : 'POST', body: d }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['workflows'] }); onClose(); },
    onError: (e) => setErr(e instanceof ApiError ? `${e.message}${Array.isArray(e.details) ? ': ' + (e.details as { message: string }[]).map((x) => x.message).join('; ') : ''}` : 'Fehler'),
  });
  const setCond = (i: number, p: Partial<WorkflowCondition>) => setD({ ...d, conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const setAct = (i: number, a: WorkflowAction) => setD({ ...d, actions: d.actions.map((x, j) => (j === i ? a : x)) });
  return (
    <Modal open wide title={id ? 'Workflow bearbeiten' : 'Neuer Workflow'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">{(fid) => <Input id={fid} required maxLength={80} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
          <Field label="Wenn (Ereignis)" hint="Eigene Ereignisse: Audit-Aktion eintippen, z. B. „report.*“">{(fid) => (
            <>
              <Input id={fid} list="wf-triggers" value={d.trigger} onChange={(e) => setD({ ...d, trigger: e.target.value.trim() })} />
              <datalist id="wf-triggers">{WORKFLOW_TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</datalist>
            </>
          )}</Field>
        </div>
        <section>
          <h3 className="mb-1 text-sm font-semibold">Und (alle Bedingungen müssen passen)</h3>
          {d.conditions.map((c, i) => (
            <div key={i} className="mb-2 grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
              <Field label="Feld">{(fid) => <><Input id={fid} list={`wf-fields-${i}`} value={c.field} onChange={(e) => setCond(i, { field: e.target.value.trim() })} /><datalist id={`wf-fields-${i}`}>{trig?.fields.map((f) => <option key={f} value={f} />)}</datalist></>}</Field>
              <Field label="Vergleich">{(fid) => <Select id={fid} value={c.op} onChange={(e) => setCond(i, { op: e.target.value as WorkflowCondition['op'] })}>{WORKFLOW_OPS.map((o) => <option key={o} value={o}>{WORKFLOW_OP_LABELS[o]}</option>)}</Select>}</Field>
              <Field label="Wert">{(fid) => <Input id={fid} disabled={c.op === 'exists' || c.op === 'not_exists'} value={c.value ?? ''} onChange={(e) => setCond(i, { value: e.target.value })} />}</Field>
              <Button type="button" variant="ghost" aria-label="Bedingung entfernen" onClick={() => setD({ ...d, conditions: d.conditions.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>
            </div>
          ))}
          {d.conditions.length < 10 && <Button type="button" size="sm" variant="secondary" onClick={() => setD({ ...d, conditions: [...d.conditions, { field: trig?.fields.includes('priority') ? 'priority' : (trig?.fields[0] ?? ''), op: 'eq', value: '' }] })}><Plus size={14} />Bedingung</Button>}
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Dann</h3>
          <p className="text-xs text-muted">Platzhalter: {'{{title}}'}, {'{{priority}}'}, {'{{location}}'} … (Felder des Ereignisses), {'{{actor}}'} (wer es ausgelöst hat), {'{{action}}'}.</p>
          {d.actions.map((a, i) => (
            <div key={i} className="space-y-2 rounded border border-line p-3">
              <div className="flex items-center gap-2">
                <Select aria-label="Aktion" value={a.type} onChange={(e) => setAct(i, newAction(e.target.value as WorkflowAction['type']))} className="flex-1">{Object.entries(WORKFLOW_ACTION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                {d.actions.length > 1 && <Button type="button" variant="ghost" aria-label="Aktion entfernen" onClick={() => setD({ ...d, actions: d.actions.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>}
              </div>
              {a.type === 'notify_permission' && <Field label="Alle mit dem Recht">{(fid) => <Select id={fid} value={a.permission} onChange={(e) => setAct(i, { ...a, permission: e.target.value })}>{ALL_PERMISSIONS.map((p) => <option key={p} value={p}>{permLabel(p)} ({p})</option>)}</Select>}</Field>}
              {a.type === 'notify_role' && <RoleSelect value={a.roleId} onChange={(roleId) => setAct(i, { ...a, roleId })} />}
              {a.type === 'discord' && (
                <>
                  <Field label="Kanäle">{() => <ChannelsPicker ariaLabel="Kanäle" max={5} value={a.channelIds.join(', ')} onChange={(v) => setAct(i, { ...a, channelIds: v.split(/[\s,;]+/).filter(Boolean) })} />}</Field>
                  <Field label="Rollen pingen (optional)">{() => <RolePicker ariaLabel="Rollen pingen" max={5} value={a.pingRoleIds ?? []} onChange={(ids) => setAct(i, { ...a, pingRoleIds: ids })} />}</Field>
                </>
              )}
              <Field label="Titel">{(fid) => <Input id={fid} required maxLength={200} value={a.title} onChange={(e) => setAct(i, { ...a, title: e.target.value })} />}</Field>
              {a.type === 'discord'
                ? <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><Field label="Text">{(fid) => <Textarea id={fid} rows={3} maxLength={1500} value={a.text ?? ''} onChange={(e) => setAct(i, { ...a, text: e.target.value })} />}</Field><Field label="Farbe">{(fid) => <input id={fid} type="color" className="h-9 w-14 rounded border border-line bg-bg" value={a.color ?? '#3b82f6'} onChange={(e) => setAct(i, { ...a, color: e.target.value })} />}</Field></div>
                : <Field label="Text (optional)">{(fid) => <Textarea id={fid} rows={2} maxLength={1000} value={a.body ?? ''} onChange={(e) => setAct(i, { ...a, body: e.target.value })} />}</Field>}
            </div>
          ))}
          {d.actions.length < 5 && <Button type="button" size="sm" variant="secondary" onClick={() => setD({ ...d, actions: [...d.actions, newAction('notify_permission')] })}><Plus size={14} />Aktion</Button>}
        </section>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} />Aktiv</label>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={save.isPending}>Speichern</Button></div>
      </form>
    </Modal>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<{ id: string; name: string }[]>('/roles') });
  return <Field label="Dashboard-Rolle">{(fid) => <Select id={fid} required value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{roles.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</Field>;
}

function RunsDialog({ w, onClose }: { w: Workflow; onClose: () => void }) {
  const runs = useQuery({ queryKey: ['workflow-runs', w.id], queryFn: () => api<Run[]>(`/studio/workflows/${w.id}/runs`) });
  return (
    <Modal open wide title={`Läufe: ${w.name}`} onClose={onClose}>
      {runs.isLoading ? <SkeletonRows /> : !runs.data?.length ? <EmptyState text="Noch nicht ausgelöst." /> : (
        <ul className="divide-y divide-line/60 text-sm">{runs.data.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5"><Badge tone={r.ok ? 'success' : 'danger'}>{r.ok ? 'ok' : 'Fehler'}</Badge><span>{fmt(r.createdAt)}</span><code className="text-xs">{r.action}</code>{r.error && <span className="text-xs text-danger">{r.error}</span>}</li>)}</ul>
      )}
    </Modal>
  );
}
