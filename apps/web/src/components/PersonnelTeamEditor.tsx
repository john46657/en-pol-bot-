import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { onSaved, queueSave } from '../lib/autosave';
import { Field, Input, Select } from './ui';
import { LockBanner, useEditLock } from '../lib/locks';

/** Team, Büro und Dienstnummer einer Personalakte – Änderungen werden automatisch gespeichert (Recht: personnel.edit). */
export function PersonnelTeamEditor({ record }: { record: Record<string, unknown> }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const structure = useQuery({ queryKey: ['team-structure'], queryFn: () => api<{ teams: string[]; offices: string[] }>('/team/structure'), enabled: can('team.view') });
  const [v, setV] = useState({ team: String(record.team ?? ''), office: String(record.office ?? ''), serviceNumber: String(record.serviceNumber ?? '') });
  const [touched, setTouched] = useState(false); // erst beim Bearbeiten sperren, nicht beim Ansehen
  const editLock = useEditLock('personnel', String(record.id), touched && can('personnel.edit'));
  useEffect(() => onSaved(`personnel:${String(record.id)}`, () => void qc.invalidateQueries({ queryKey: ['personnel'] })), [qc, record.id]);
  if (!can('personnel.edit')) return null;
  const set = (p: Partial<typeof v>) => {
    const next = { ...v, ...p };
    setV(next);
    queueSave(`personnel:${String(record.id)}`, { method: 'PATCH', path: `/personnel/${String(record.id)}`, label: 'Personalakte',
      body: { team: next.team || undefined, office: next.office || null, serviceNumber: next.serviceNumber.trim() || null } });
  };
  const opts = (list: string[] | undefined, cur: string) => [...new Set([...(list ?? []), ...(cur ? [cur] : [])])];
  return (
    <fieldset onFocus={() => setTouched(true)} className="mt-4 grid gap-3 rounded-md border border-line p-3 sm:grid-cols-3">
      <div className="empty:hidden sm:col-span-3"><LockBanner lock={editLock} /></div>
      <p className="text-xs text-muted sm:col-span-3">Teamdaten (für die Teamliste) – werden automatisch gespeichert.</p>
      <Field label="Team">{(id) => <Select id={id} disabled={editLock.blocked} value={v.team} onChange={(e) => set({ team: e.target.value })}><option value="">—</option>{opts(structure.data?.teams, v.team).map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
      <Field label="Büro">{(id) => <Select id={id} disabled={editLock.blocked} value={v.office} onChange={(e) => set({ office: e.target.value })}><option value="">—</option>{opts(structure.data?.offices, v.office).map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
      <Field label="Dienstnummer">{(id) => <Input id={id} disabled={editLock.blocked} value={v.serviceNumber} maxLength={16} onChange={(e) => set({ serviceNumber: e.target.value })} />}</Field>
    </fieldset>
  );
}
