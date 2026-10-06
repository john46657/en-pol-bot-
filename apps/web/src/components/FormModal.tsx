import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z, type ZodTypeAny } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Page } from '../lib/api';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { useDebounced } from './DataTable';
import { useAuth } from '../lib/auth';
import { looksLikeRoblox, type RobloxProfile } from './RobloxCard';

export interface FieldDef {
  name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'select' | 'person' | 'legalCode' | 'datetime' | 'date' | 'password';
  required?: boolean; options?: readonly string[]; hint?: string; max?: number; min?: number;
}

function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) {
    let s: ZodTypeAny = f.type === 'number' ? z.coerce.number().min(f.min ?? 0) : z.string().max(f.max ?? 5000);
    if (f.type === 'select' && f.options?.length) s = z.enum(f.options as [string, ...string[]], { errorMap: () => ({ message: `${f.label} is required` }) });
    if (!f.required) s = f.type === 'number' ? z.preprocess((v) => (v === '' || v === undefined ? undefined : v), s.optional()) : z.union([s, z.literal('')]).optional();
    else if (s instanceof z.ZodString) s = s.trim().min(1, `${f.label} is required`).min(f.min ?? 1, `${f.label}: at least ${f.min} characters`);
    shape[f.name] = s;
  }
  return z.object(shape);
}

/** Person suchen (Name oder Roblox-ID). Keine Akte? → Roblox fragen und die Akte mit einem Klick anlegen. */
export function PersonPicker({ value, onChange, id }: { value: string; onChange: (id: string, label: string) => void; id: string }) {
  const { can } = useAuth();
  const [term, setTerm] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string>();
  const q = useDebounced(term.trim(), 250);
  const res = useQuery({ queryKey: ['persons-pick', q], queryFn: () => api<Page<{ id: string; robloxUsername: string; robloxUserId: string | null }>>('/persons', { query: { q, pageSize: 8 } }), enabled: q.length >= 2 });
  const noMatch = !!res.data && res.data.items.length === 0;
  const rb = useQuery({ queryKey: ['roblox', q.toLowerCase()], queryFn: () => api<{ profile: RobloxProfile | null }>('/persons/roblox', { query: { q } }), enabled: noMatch && looksLikeRoblox(q), staleTime: 5 * 60_000 });
  const pick = (pid: string, name: string) => { onChange(pid, name); setLabel(name); setTerm(''); setErr(undefined); };
  const create = useMutation({
    mutationFn: (p: RobloxProfile) => api<{ person: { id: string; robloxUsername: string } }>('/persons', { method: 'POST', body: { robloxUsername: p.name, robloxUserId: p.id } }),
    onSuccess: (r) => pick(r.person.id, r.person.robloxUsername), onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed'),
  });
  const p = rb.data?.profile;
  return (
    <div>
      <Input id={id} placeholder={value ? label : 'Roblox username or Roblox ID…'} value={term} onChange={(e) => setTerm(e.target.value)} autoComplete="off" />
      {value && <p className="mt-1 text-xs text-success">Selected: {label || value}</p>}
      {q.length >= 2 && res.data && (
        <ul role="listbox" className="mt-1 max-h-40 overflow-auto rounded border border-line bg-bg">
          {noMatch && !p && <li className="px-3 py-2 text-xs text-muted">{rb.isFetching ? 'Searching Roblox…' : 'No match.'}</li>}
          {noMatch && p && (
            <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              {p.avatarUrl && <img src={p.avatarUrl} alt="" width={28} height={28} className="h-7 w-7 rounded" />}
              <span className="min-w-0 flex-1">Roblox: <b>{p.name}</b> <span className="text-xs text-muted">{p.id}</span></span>
              {p.person ? <Button size="sm" type="button" onClick={() => pick(p.person!.id, p.person!.robloxUsername)}>Select</Button>
                : can('persons.create') ? <Button size="sm" type="button" disabled={create.isPending} onClick={() => create.mutate(p)}>Create person record</Button>
                : <span className="text-xs text-muted">No person record yet.</span>}
            </li>
          )}
          {res.data.items.map((x) => <li key={x.id}><button type="button" role="option" aria-selected={x.id === value} className="w-full px-3 py-1.5 text-left text-sm hover:bg-panel-2" onClick={() => pick(x.id, x.robloxUsername)}>{x.robloxUsername} <span className="text-xs text-muted">{x.robloxUserId}</span></button></li>)}
        </ul>
      )}
      {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

interface LegalCode { id: string; code: string; title: string; penalty: { fine?: number; jailMinutes?: number } }
/** Tatbestand aus der Liste wählen (Admin → Legal Codes) statt einer ID. */
function LegalCodePicker({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const q = useQuery({ queryKey: ['legal-codes'], queryFn: () => api<LegalCode[]>('/legal-codes') });
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{q.isLoading ? 'Loading…' : q.data?.length ? '— none —' : '— no legal codes yet (Admin → Legal Codes) —'}</option>
      {q.data?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}{c.penalty.fine !== undefined ? ` · ${c.penalty.fine}` : ''}</option>)}
    </Select>
  );
}

/** Server-Fehler mit den Feldnamen aus dem Formular („Reason: too short“ statt „Request validation failed“). */
function serverText(e: ApiError, fields: FieldDef[]) {
  const details = Array.isArray(e.details) ? (e.details as { path?: string; message?: string }[]).filter((d) => d.message) : [];
  if (!details.length) return e.message;
  return details.slice(0, 5).map((d) => { const f = fields.find((x) => x.name === d.path?.split('.')[0]); return f ? `${f.label}: ${d.message}` : d.path ? `${d.path}: ${d.message}` : d.message; }).join(' · ');
}

export function FormModal({ open, onClose, title, fields, endpoint, method, toBody, invalidate, onDone, submitLabel = 'Save', defaults }: {
  open: boolean; onClose: () => void; title: string; fields: FieldDef[]; endpoint: string; method?: string; toBody?: (v: Record<string, unknown>) => unknown;
  invalidate?: string[][]; onDone?: (result: unknown) => void; submitLabel?: string; defaults?: Record<string, unknown>;
}) {
  const schema = useMemo(() => buildSchema(fields), [fields]);
  const qc = useQueryClient();
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<Record<string, unknown>>({ resolver: zodResolver(schema), defaultValues: defaults });
  const [serverErr, setServerErr] = useState<ApiError>();
  const m = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      const clean = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined));
      return api(endpoint, { method: method ?? 'POST', body: toBody ? toBody(clean) : clean });
    },
    onSuccess: (r) => { invalidate?.forEach((k) => void qc.invalidateQueries({ queryKey: k })); reset(); setServerErr(undefined); onClose(); onDone?.(r); },
    onError: (e) => setServerErr(e instanceof ApiError ? e : undefined),
  });
  const err = (n: string) => (errors[n]?.message as string | undefined);
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-3" noValidate>
        {fields.map((f) => (
          <Field key={f.name} label={`${f.label}${f.required ? ' *' : ''}`} error={err(f.name)} hint={f.hint}>
            {(id) => f.type === 'textarea' ? <Textarea id={id} {...register(f.name)} />
              : f.type === 'select' ? <Select id={id} {...register(f.name)}><option value="">—</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</Select>
              : f.type === 'person' ? <PersonPicker id={id} value={String(watch(f.name) ?? '')} onChange={(v) => setValue(f.name, v, { shouldValidate: true })} />
              : f.type === 'legalCode' ? <LegalCodePicker id={id} value={String(watch(f.name) ?? '')} onChange={(v) => setValue(f.name, v, { shouldValidate: true })} />
              : <Input id={id} type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : f.type === 'datetime' ? 'datetime-local' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'number' ? 'any' : undefined} {...register(f.name)} />}
          </Field>
        ))}
        {serverErr && <div role="alert" className="rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{serverText(serverErr, fields)}{serverErr.requestId && <span className="block text-xs opacity-70">Request ID: {serverErr.requestId}</span>}</div>}
        <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={m.isPending}>{m.isPending ? 'Saving…' : submitLabel}</Button></div>
      </form>
    </Modal>
  );
}
