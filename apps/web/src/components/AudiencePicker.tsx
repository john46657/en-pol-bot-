import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Select } from './ui';

interface Role { id: string; name: string }

function useRoles() {
  const { can } = useAuth();
  return useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/roles'), enabled: can('roles.view'), staleTime: 60_000 });
}

/** Zielgruppe: Dashboard-Rollen (leer = alle). */
export function AudiencePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const roles = useRoles();
  const list = roles.data ?? [];
  const name = (id: string) => list.find((r) => r.id === id)?.name ?? `${id.slice(0, 8)}…`;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1">
        {!value.length && <Badge tone="primary">Alle</Badge>}
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-0.5 text-xs">
            {name(id)}
            <button type="button" aria-label={`${name(id)} entfernen`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>
          </span>
        ))}
      </div>
      <Select aria-label="Rolle zur Zielgruppe hinzufügen" value="" disabled={value.length >= 30 || !list.length} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}>
        <option value="">+ Rolle hinzufügen …</option>
        {list.filter((r) => !value.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
      {!list.length && !roles.isLoading && <span className="text-xs text-muted">Rollenliste nicht verfügbar – gilt für alle.</span>}
    </div>
  );
}
