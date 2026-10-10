import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../lib/auth';
import { Button } from './ui';
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
