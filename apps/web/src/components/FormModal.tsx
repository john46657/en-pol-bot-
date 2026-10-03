import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z, type ZodTypeAny } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Page } from '../lib/api';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { useDebounced } from './DataTable';

export interface FieldDef {
  name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'select' | 'person' | 'datetime' | 'date' | 'password';
  required?: boolean; options?: readonly string[]; hint?: string; max?: number; min?: number;
}

function buildSchema(fields: FieldDef[]) {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) {
    let s: ZodTypeAny = f.type === 'number' ? z.coerce.number().min(f.min ?? 0) : z.string().max(f.max ?? 5000);
    if (f.type === 'select' && f.options?.length) s = z.enum(f.options as [string, ...string[]], { errorMap: () => ({ message: `${f.label} is required` }) });
    if (!f.required) s = f.type === 'number' ? z.preprocess((v) => (v === '' || v === undefined ? undefined : v), s.optional()) : z.union([s, z.literal('')]).optional();
    else if (s instanceof z.ZodString) s = s.trim().min(f.min ?? 1, `${f.label} is required`);
    shape[f.name] = s;
  }
  return z.object(shape);
}

export function PersonPicker({ value, onChange, id }: { value: string; onChange: (id: string, label: string) => void; id: string }) {
  const [term, setTerm] = useState('');
  const [label, setLabel] = useState('');
  const q = useDebounced(term.trim(), 250);
  const res = useQuery({ queryKey: ['persons-pick', q], queryFn: () => api<Page<{ id: string; robloxUsername: string; robloxUserId: string | null }>>('/persons', { query: { q, pageSize: 8 } }), enabled: q.length >= 2 });
  return (
    <div>
      <Input id={id} placeholder={value ? label : 'Search person by name or Roblox ID…'} value={term} onChange={(e) => setTerm(e.target.value)} autoComplete="off" />
      {value && <p className="mt-1 text-xs text-success">Selected: {label || value}</p>}
      {q.length >= 2 && res.data && (
        <ul role="listbox" className="mt-1 max-h-40 overflow-auto rounded border border-line bg-bg">
          {res.data.items.length === 0 && <li className="px-3 py-2 text-xs text-muted">No match.</li>}
          {res.data.items.map((p) => <li key={p.id}><button type="button" role="option" aria-selected={p.id === value} className="w-full px-3 py-1.5 text-left text-sm hover:bg-panel-2" onClick={() => { onChange(p.id, p.robloxUsername); setLabel(p.robloxUsername); setTerm(''); }}>{p.robloxUsername} <span className="text-xs text-muted">{p.robloxUserId}</span></button></li>)}
        </ul>
      )}
    </div>
  );
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
              : <Input id={id} type={f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : f.type === 'datetime' ? 'datetime-local' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'number' ? 'any' : undefined} {...register(f.name)} />}
          </Field>
        ))}
        {serverErr && <div role="alert" className="rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{serverErr.message}{serverErr.requestId && <span className="block text-xs opacity-70">Request ID: {serverErr.requestId}</span>}</div>}
        <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={m.isPending}>{m.isPending ? 'Saving…' : submitLabel}</Button></div>
      </form>
    </Modal>
  );
}
