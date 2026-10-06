import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ACCENTS, useStudio, type CustomFieldDef, type StudioConfig } from '../../lib/studio';
import { Button, Card, Input, PageHeader, Select, SkeletonRows, Tabs } from '../../components/ui';

type CF = StudioConfig['customFields'];
const TYPES: CustomFieldDef['type'][] = ['text', 'number', 'select', 'date'];

/** Studio: Custom Fields (Personen/Fahrzeuge) und Theme-Akzent (Bewerbungsfragen: Applications → Setup). Workflows (konfigurierbare Status) gibt es bewusst nicht. */
export function Studio() {
  const { can } = useAuth();
  const manage = can('studio.manage') || can('settings.manage');
  const [tab, setTab] = useState('Custom fields');
  const [msg, setMsg] = useState<string>();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api(`/admin/settings/${key}`, { method: 'PUT', body: { value } }),
    onSuccess: () => { setMsg('Saved.'); void qc.invalidateQueries(); },
    onError: (e) => setMsg(e instanceof ApiError ? `${e.message}${Array.isArray(e.details) ? ': ' + (e.details as { message: string }[]).map((d) => d.message).join('; ') : ''}` : 'Failed'),
  });
  return (
    <>
      <PageHeader title="Studio" subtitle="Configure custom fields and the theme. Every change is validated and audited. Application questions: Applications → Setup." />
      {msg && <p role="status" className="mb-3 rounded border border-line bg-panel p-2 text-sm">{msg}</p>}
      <Tabs tabs={['Custom fields', 'Theme']} active={tab} onChange={(t) => { setTab(t); setMsg(undefined); }} />
      <div className="mt-4">
        {tab === 'Custom fields' && <CustomFields manage={manage} onSave={(v) => save.mutate({ key: 'studio.customFields', value: v })} busy={save.isPending} />}
        {tab === 'Theme' && <Theme manage={manage} onSave={(v) => save.mutate({ key: 'theme.accent', value: v })} />}
      </div>
    </>
  );
}

function CustomFields({ manage, onSave, busy }: { manage: boolean; onSave: (v: CF) => void; busy: boolean }) {
  const studio = useStudio();
  const [cfg, setCfg] = useState<CF>({ persons: [], vehicles: [] });
  useEffect(() => { if (studio.data) setCfg(studio.data.customFields); }, [studio.data]);
  if (studio.isLoading) return <SkeletonRows />;
  const upd = (e: keyof CF, i: number, p: Partial<CustomFieldDef>) => setCfg({ ...cfg, [e]: cfg[e].map((f, j) => (j === i ? { ...f, ...p } : f)) });
  return (
    <div className="space-y-4">
      {(['persons', 'vehicles'] as const).map((e) => (
        <Card key={e} title={`${e[0]!.toUpperCase()}${e.slice(1)}`}>
          <div className="space-y-2">
            {cfg[e].length === 0 && <p className="text-sm text-muted">No custom fields defined.</p>}
            {cfg[e].map((f, i) => (
              <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_110px_1fr_auto_auto]">
                <Input aria-label={`${e} field key`} value={f.key} disabled={!manage} onChange={(x) => upd(e, i, { key: x.target.value })} placeholder="key" />
                <Input aria-label={`${e} field label`} value={f.label} disabled={!manage} onChange={(x) => upd(e, i, { label: x.target.value })} placeholder="Label" />
                <Select aria-label={`${e} field type`} value={f.type} disabled={!manage} onChange={(x) => upd(e, i, { type: x.target.value as CustomFieldDef['type'] })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
                {f.type === 'select' ? <Input aria-label={`${e} field options`} value={(f.options ?? []).join(', ')} disabled={!manage} onChange={(x) => upd(e, i, { options: x.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} placeholder="A, B, C" /> : <span />}
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} disabled={!manage} onChange={(x) => upd(e, i, { required: x.target.checked })} />required</label>
                {manage && <Button variant="ghost" size="sm" onClick={() => setCfg({ ...cfg, [e]: cfg[e].filter((_, j) => j !== i) })}>Remove</Button>}
              </div>
            ))}
            {manage && <Button variant="secondary" size="sm" onClick={() => setCfg({ ...cfg, [e]: [...cfg[e], { key: 'field' + (cfg[e].length + 1), label: 'New field', type: 'text', required: false }] })}>Add field</Button>}
          </div>
        </Card>
      ))}
      {manage && <Button disabled={busy} onClick={() => onSave(cfg)}>Save custom fields</Button>}
    </div>
  );
}

function Theme({ manage, onSave }: { manage: boolean; onSave: (v: string) => void }) {
  const studio = useStudio();
  const current = studio.data?.theme.accent ?? 'blue';
  return (
    <Card title="Accent colour">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
        {Object.entries(ACCENTS).map(([name, hex]) => (
          <button key={name} role="radio" aria-checked={current === name} disabled={!manage} onClick={() => onSave(name)} className={`flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${current === name ? 'border-fg' : 'border-line'}`}>
            <span aria-hidden className="size-3 rounded-full" style={{ background: hex }} />{name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">The UI is always dark; only the accent colour is configurable.</p>
    </Card>
  );
}
