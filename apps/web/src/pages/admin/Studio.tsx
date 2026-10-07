import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAutosaveDraft } from '../../lib/autosave';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ACCENTS, useStudio, type CustomFieldDef, type StudioConfig } from '../../lib/studio';
import { Button, Card, Input, PageHeader, Select, SkeletonRows, Tabs } from '../../components/ui';
import { WorkflowEditor } from '../../components/WorkflowEditor';

type CF = StudioConfig['customFields'];
const TYPES: CustomFieldDef['type'][] = ['text', 'number', 'select', 'date'];
const ACCENT_LABELS: Record<string, string> = { blue: 'Blau', green: 'Grün', amber: 'Bernstein', red: 'Rot', cyan: 'Cyan', violet: 'Violett' };
const TYPE_LABELS: Record<CustomFieldDef['type'], string> = { text: 'Text', number: 'Zahl', select: 'Auswahl', date: 'Datum' };

/** Studio: Custom Fields (Personen/Fahrzeuge), Theme-Akzent und Workflows (Automationen). Bewerbungsfragen: Applications → Setup. */
export function Studio() {
  const { can } = useAuth();
  const manage = can('studio.manage') || can('settings.manage');
  const [tab, setTab] = useState('Zusatzfelder');
  const [msg, setMsg] = useState<string>();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api(`/admin/settings/${key}`, { method: 'PUT', body: { value } }),
    onSuccess: () => { setMsg('Gespeichert.'); void qc.invalidateQueries(); },
    onError: (e) => setMsg(e instanceof ApiError ? `${e.message}${Array.isArray(e.details) ? ': ' + (e.details as { message: string }[]).map((d) => d.message).join('; ') : ''}` : 'Fehlgeschlagen'),
  });
  return (
    <>
      <PageHeader title="Studio" subtitle="Zusatzfelder, Design und Workflows (Automationen) konfigurieren. Jede Änderung wird geprüft und im Audit-Log festgehalten. Bewerbungsfragen: Bewerbungen → Einrichtung." />
      {msg && <p role="status" className="mb-3 rounded border border-line bg-panel p-2 text-sm">{msg}</p>}
      <Tabs tabs={['Zusatzfelder', 'Design', 'Workflows']} active={tab} onChange={(t) => { setTab(t); setMsg(undefined); }} />
      <div className="mt-4">
        {tab === 'Zusatzfelder' && <CustomFields manage={manage} onSave={(v) => save.mutate({ key: 'studio.customFields', value: v })} busy={save.isPending} />}
        {tab === 'Workflows' && <WorkflowEditor manage={can('studio.manage')} />}
        {tab === 'Design' && <Theme manage={manage} onSave={(v) => save.mutate({ key: 'theme.accent', value: v })} />}
      </div>
    </>
  );
}

function CustomFields({ manage, onSave, busy }: { manage: boolean; onSave: (v: CF) => void; busy: boolean }) {
  const studio = useStudio();
  const [cfg, setCfg] = useState<CF>({ persons: [], vehicles: [] });
  useEffect(() => { if (studio.data) setCfg(studio.data.customFields); }, [studio.data]);
  const valid = (c: CF) => [...c.persons, ...c.vehicles].every((f) => /^[a-z][a-z0-9_]{0,39}$/i.test(f.key) && f.label.trim());
  useAutosaveDraft(manage && studio.data ? 'setting:studio.customFields' : null, cfg, (c) => (valid(c) ? { method: 'PUT', path: '/admin/settings/studio.customFields', body: { value: c }, label: 'Zusatzfelder' } : null));
  if (studio.isLoading) return <SkeletonRows />;
  const upd = (e: keyof CF, i: number, p: Partial<CustomFieldDef>) => setCfg({ ...cfg, [e]: cfg[e].map((f, j) => (j === i ? { ...f, ...p } : f)) });
  return (
    <div className="space-y-4">
      {(['persons', 'vehicles'] as const).map((e) => (
        <Card key={e} title={e === 'persons' ? 'Personen' : 'Fahrzeuge'}>
          <div className="space-y-2">
            {cfg[e].length === 0 && <p className="text-sm text-muted">Keine Zusatzfelder definiert.</p>}
            {cfg[e].map((f, i) => (
              <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_110px_1fr_auto_auto]">
                <Input aria-label={`${e === 'persons' ? 'Personen' : 'Fahrzeuge'}: Feldschlüssel`} value={f.key} disabled={!manage} onChange={(x) => upd(e, i, { key: x.target.value })} placeholder="schlüssel" />
                <Input aria-label={`${e === 'persons' ? 'Personen' : 'Fahrzeuge'}: Feldname`} value={f.label} disabled={!manage} onChange={(x) => upd(e, i, { label: x.target.value })} placeholder="Bezeichnung" />
                <Select aria-label={`${e === 'persons' ? 'Personen' : 'Fahrzeuge'}: Feldtyp`} value={f.type} disabled={!manage} onChange={(x) => upd(e, i, { type: x.target.value as CustomFieldDef['type'] })}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</Select>
                {f.type === 'select' ? <Input aria-label={`${e === 'persons' ? 'Personen' : 'Fahrzeuge'}: Feldoptionen`} value={(f.options ?? []).join(', ')} disabled={!manage} onChange={(x) => upd(e, i, { options: x.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} placeholder="A, B, C" /> : <span />}
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.required} disabled={!manage} onChange={(x) => upd(e, i, { required: x.target.checked })} />Pflichtfeld</label>
                {manage && <Button variant="ghost" size="sm" onClick={() => setCfg({ ...cfg, [e]: cfg[e].filter((_, j) => j !== i) })}>Entfernen</Button>}
              </div>
            ))}
            {manage && <Button variant="secondary" size="sm" onClick={() => setCfg({ ...cfg, [e]: [...cfg[e], { key: 'field' + (cfg[e].length + 1), label: 'Neues Feld', type: 'text', required: false }] })}>Feld hinzufügen</Button>}
          </div>
        </Card>
      ))}
      {manage && <div className="flex items-center gap-2"><span className="text-xs text-muted">{valid(cfg) ? 'Wird automatisch gespeichert.' : 'Unvollständige Felder (Schlüssel/Name) werden noch nicht gespeichert.'}</span><Button variant="secondary" disabled={busy} onClick={() => onSave(cfg)}>Jetzt speichern</Button></div>}
    </div>
  );
}

function Theme({ manage, onSave }: { manage: boolean; onSave: (v: string) => void }) {
  const studio = useStudio();
  const current = studio.data?.theme.accent ?? 'blue';
  return (
    <Card title="Akzentfarbe">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Akzentfarbe">
        {Object.entries(ACCENTS).map(([name, hex]) => (
          <button key={name} role="radio" aria-checked={current === name} disabled={!manage} onClick={() => onSave(name)} className={`flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${current === name ? 'border-fg' : 'border-line'}`}>
            <span aria-hidden className="size-3 rounded-full" style={{ background: hex }} />{ACCENT_LABELS[name] ?? name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Die Oberfläche ist immer dunkel; nur die Akzentfarbe ist einstellbar.</p>
    </Card>
  );
}
