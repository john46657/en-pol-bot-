import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { FormModal } from './FormModal';

interface LinkRow { id: string; role: string; person: { id: string; robloxUsername: string } | null }
const ROLES = ['SUSPECT', 'WITNESS', 'VICTIM', 'PERSON_OF_INTEREST'] as const;
export const INVESTIGATION_ROLE_DE: Record<string, string> = { SUSPECT: 'Verdächtige Person', WITNESS: 'Zeuge', VICTIM: 'Opfer', PERSON_OF_INTEREST: 'Relevante Person' };

/** Beteiligte Personen eines Falls (Verdächtige, Zeugen, Opfer) – anzeigen und hinzufügen. */
export function InvestigationPersons({ id, status, links }: { id: string; status: string; links: LinkRow[] }) {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const editable = can('investigations.edit') && status !== 'ARCHIVED';
  const persons = links.filter((l) => l.person);
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-xs text-muted">Beteiligte Personen</h3>
        {editable && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>+ Person hinzufügen</Button>}
      </div>
      {persons.length === 0 ? <p className="text-sm text-muted">Noch keine Personen verknüpft.</p> : (
        <ul className="divide-y divide-line text-sm">{persons.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <Link className="text-primary underline" to={`/persons/${l.person!.id}`}>{l.person!.robloxUsername}</Link>
            <span className="text-xs text-muted">{INVESTIGATION_ROLE_DE[l.role] ?? l.role}</span>
          </li>
        ))}</ul>
      )}
      <FormModal open={adding} onClose={() => setAdding(false)} title="Person zum Fall hinzufügen" endpoint={`/investigations/${id}/persons`} submitLabel="Hinzufügen" invalidate={[['investigations']]}
        defaults={{ role: 'SUSPECT' }}
        fields={[{ name: 'personId', label: 'Person', type: 'person', required: true }, { name: 'role', label: 'Rolle im Fall', type: 'select', required: true, options: ROLES }]}
        toBody={(v) => ({ personId: v.personId, role: v.role })} />
    </div>
  );
}

interface Inv { id: string; title: string; description: string | null; leadId: string | null; status: string; version: number }
/** Fall bearbeiten: Titel, Beschreibung, Leitung (Auswahl aus dem Team). Versionsprüfung verhindert stilles Überschreiben. */
export function InvestigationEdit({ record }: { record: Record<string, unknown> }) {
  const r = record as unknown as Inv;
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: r.title, description: r.description ?? '', leadId: r.leadId ?? '' });
  const team = useQuery({ queryKey: ['team-overview'], queryFn: () => api<{ userId: string; name: string; rank: string | null }[]>('/team/overview'), enabled: open && can('team.view'), staleTime: 60_000 });
  const save = useMutation({
    mutationFn: () => api(`/investigations/${r.id}`, { method: 'PATCH', body: { title: v.title.trim(), description: v.description.trim() || null, leadId: v.leadId || null, version: r.version } }),
    onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: ['investigations'] }); },
  });
  if (!can('investigations.edit') || r.status === 'ARCHIVED') return null;
  return (
    <>
      <Button variant="secondary" onClick={() => { setV({ title: r.title, description: r.description ?? '', leadId: r.leadId ?? '' }); save.reset(); setOpen(true); }}><Pencil size={14} />Bearbeiten</Button>
      <Modal open={open} title="Fall bearbeiten" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Titel *">{(id) => <Input id={id} value={v.title} maxLength={200} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
          <Field label="Beschreibung">{(id) => <Textarea id={id} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
          {can('team.view') && <Field label="Leitung">{(id) => <Select id={id} value={v.leadId} onChange={(e) => setV({ ...v, leadId: e.target.value })}>
            <option value="">— keine —</option>
            {r.leadId && !team.data?.some((m) => m.userId === r.leadId) && <option value={r.leadId}>(bisherige Leitung)</option>}
            {team.data?.map((m) => <option key={m.userId} value={m.userId}>{m.name}{m.rank ? ` · ${m.rank}` : ''}</option>)}
          </Select>}</Field>}
          {save.error && <p role="alert" className="text-sm text-danger">{save.error instanceof ApiError ? save.error.message : 'Fehlgeschlagen'}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="submit" disabled={save.isPending || v.title.trim().length < 3}>Speichern</Button></div>
        </form>
      </Modal>
    </>
  );
}
