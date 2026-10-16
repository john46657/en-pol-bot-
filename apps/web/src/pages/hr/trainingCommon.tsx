import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { type Overview } from '../../lib/hr';
import { Toggle } from '../../components/ApplicationSettings';
import { Select } from '../../components/ui';

/** Gemeinsame Bausteine für Ausbildungen und Prüfungen. */

export interface PickItem { id: string; name: string }

export const L = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-muted">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
);
export const Switch = ({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <div className="flex items-start gap-2 text-sm"><Toggle label={label} checked={checked} onChange={onChange} /><div><div>{label}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div></div>
);
export const nullIfEmpty = (s: string | null) => (s && s.trim() ? s : null);
export const pct = (score: number | null | undefined, max: number | null | undefined) => (score != null && max ? Math.round((score / max) * 100) : null);

/** Personal (für „Person hinzufügen“). */
export function usePeople(enabled = true) {
  const { can } = useAuth();
  return useQuery({ queryKey: ['hr-people', 'pick'], queryFn: () => api<Overview>('/hr/people'), enabled: enabled && can('personnel.view'), staleTime: 60_000 });
}
/** Benutzer für Ausbilder/Prüfer: mit users.view aus der Benutzerliste, sonst aus dem Personal. */
export function useStaff(): PickItem[] {
  const { can } = useAuth();
  const viaUsers = can('users.view');
  const users = useQuery({ queryKey: ['users', 'pick'], queryFn: () => api<Page<{ id: string; displayName: string; active: boolean }>>('/users', { query: { pageSize: 500 } }), enabled: viaUsers, staleTime: 60_000 });
  const people = usePeople(!viaUsers);
  return useMemo(() => {
    const list = viaUsers ? (users.data?.items ?? []).filter((u) => u.active).map((u) => ({ id: u.id, name: u.displayName })) : (people.data?.rows ?? []).map((p) => ({ id: p.userId, name: p.name }));
    return list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [viaUsers, users.data, people.data]);
}

export function MultiPick({ value, onChange, options, ariaLabel, max = 30, empty }: { value: string[]; onChange: (v: string[]) => void; options: PickItem[]; ariaLabel: string; max?: number; empty?: string }) {
  const name = (id: string) => options.find((o) => o.id === id)?.name ?? `${id.slice(0, 8)}…`;
  return (
    <div className="grid gap-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-0.5 text-xs">
              {name(id)}
              <button type="button" aria-label={`${name(id)} entfernen`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <Select aria-label={ariaLabel} value="" disabled={value.length >= max || !options.length} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}>
        <option value="">+ hinzufügen …</option>
        {options.filter((o) => !value.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
      {!options.length && <span className="text-xs text-muted">{empty ?? 'Keine Auswahl verfügbar (fehlende Berechtigung zum Lesen der Benutzerliste).'}</span>}
    </div>
  );
}
