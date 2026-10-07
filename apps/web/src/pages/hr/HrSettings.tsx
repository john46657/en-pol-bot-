import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { PROFILE_FIELDS, PROFILE_FIELD_LABEL, PROFILE_SECTIONS, PROFILE_SECTION_LABEL, hrConfigSchema, type HrConfig } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { onSaved, pendingBody, useAutosaveDraft } from '../../lib/autosave';
import { useHrConfig } from '../../lib/hr';
import { Toggle } from '../../components/ApplicationSettings';
import { RolePicker } from '../../components/DiscordPickers';
import { SaveStatus } from '../../components/SaveStatus';
import { Button, Card, ErrorState, Input, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';

const KEY = 'hr-config-admin';
const KEY_RE = /^[A-Z0-9_]{1,32}$/;
interface Opt { id: string; label: string }

/** Liste verschieben/entfernen. */
const moved = <T,>(a: T[], i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= a.length) return a; const n = [...a]; [n[i], n[j]] = [n[j]!, n[i]!]; return n; };
const toKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 32);

/** Client-seitige Prüfung: Schlüssel eindeutig + Format, Namen nicht leer. Liefert Fehlermeldungen je Bereich. */
function validate(c: HrConfig): string[] {
  const errs: string[] = [];
  const keys = (label: string, list: { key: string }[]) => {
    const bad = list.filter((x) => !KEY_RE.test(x.key));
    if (bad.length) errs.push(`${label}: Schlüssel nur A–Z, 0–9 und _ (max. 32 Zeichen)`);
    const seen = new Set<string>();
    for (const x of list) { if (seen.has(x.key)) { errs.push(`${label}: Schlüssel „${x.key}“ ist doppelt`); break; } seen.add(x.key); }
    if (list.some((x) => 'label' in x && !String((x as { label: string }).label).trim())) errs.push(`${label}: Bezeichnung fehlt`);
  };
  keys('Personalstatus', c.statuses);
  keys('Abwesenheitsarten', c.absenceTypes);
  keys('Schweregrade', c.warningSeverities);
  const names = c.departments.map((d) => d.name.trim().toLowerCase());
  if (names.some((n) => !n)) errs.push('Abteilungen: Name fehlt');
  if (new Set(names).size !== names.length) errs.push('Abteilungen: Namen müssen eindeutig sein');
  if (c.awards.some((a) => !a.name.trim())) errs.push('Auszeichnungen: Name fehlt');
  if (c.warningCategories.some((x) => !x.trim())) errs.push('Verwarnungskategorien: leerer Eintrag');
  if (!errs.length) {
    const p = hrConfigSchema.safeParse(c);
    if (!p.success) errs.push(...p.error.issues.slice(0, 3).map((i) => `${i.path.join(' › ')}: ${i.message}`));
  }
  return errs;
}

const Lbl = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <div className="grid content-start gap-1 text-sm"><span className="text-xs font-medium text-muted">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</div>
);
const Bool = ({ label, checked, onChange, ro }: { label: string; checked: boolean; onChange: (v: boolean) => void; ro: boolean }) => (
  ro ? <span className="text-sm">{checked ? 'Ja' : 'Nein'}</span> : <Toggle label={label} checked={checked} onChange={onChange} />
);

function MultiPick({ options, value, onChange, ariaLabel, disabled, max = 10 }: { options: Opt[]; value: string[]; onChange: (v: string[]) => void; ariaLabel: string; disabled?: boolean; max?: number }) {
  const name = (id: string) => options.find((o) => o.id === id)?.label ?? 'Unbekannt';
  const rest = options.filter((o) => !value.includes(o.id));
  return (
    <div className="grid gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">{value.map((id) => (
          <li key={id} className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs">
            <span>{name(id)}</span>
            {!disabled && <button type="button" aria-label={`${name(id)} entfernen`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>}
          </li>
        ))}</ul>
      ) : disabled && <span className="text-xs text-muted">—</span>}
      {!disabled && value.length < max && rest.length > 0 && (
        <Select aria-label={ariaLabel} value="" onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}>
          <option value="">Hinzufügen…</option>
          {rest.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      )}
    </div>
  );
}

/** Zeilen-Knöpfe: hoch/runter/entfernen. */
function RowActions({ i, n, name, onMove, onRemove, ro }: { i: number; n: number; name: string; onMove: (d: -1 | 1) => void; onRemove: () => void; ro: boolean }) {
  if (ro) return null;
  return (
    <div className="flex items-start gap-1">
      <Button size="sm" variant="ghost" aria-label={`${name} nach oben`} disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></Button>
      <Button size="sm" variant="ghost" aria-label={`${name} nach unten`} disabled={i === n - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></Button>
      <Button size="sm" variant="ghost" aria-label={`${name} entfernen`} onClick={onRemove}><Trash2 size={14} /></Button>
    </div>
  );
}
const AddBtn = ({ onClick, children, ro }: { onClick: () => void; children: ReactNode; ro: boolean }) => (ro ? null : <div><Button size="sm" variant="secondary" onClick={onClick}><Plus size={14} /> {children}</Button></div>);
const Row = ({ children, cols }: { children: ReactNode; cols: string }) => <div className={`grid gap-2 rounded-md border border-line p-2.5 ${cols}`}>{children}</div>;

export function HrSettings() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const ro = !can('promotion.manage_settings');
  const cfgQ = useHrConfig();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<{ id: string; name: string }[]>('/roles'), staleTime: 60_000, retry: false });
  const [d, setD] = useState<HrConfig>();
  const [newCat, setNewCat] = useState('');
  useEffect(() => { if (cfgQ.data && !d) setD(pendingBody<HrConfig>(KEY) ?? cfgQ.data); }, [cfgQ.data, d]);
  useEffect(() => onSaved(KEY, () => void qc.invalidateQueries({ queryKey: ['hr-config'] })), [qc]);
  const errors = useMemo(() => (d ? validate(d) : []), [d]);
  useAutosaveDraft(ro ? null : KEY, d, (x) => (validate(x).length ? null : { method: 'PUT', path: '/hr/config', body: x, label: 'Personal-Einstellungen' }));

  if (cfgQ.isLoading || (!d && !cfgQ.error)) return <div><PageHeader title="Personal-Einstellungen" /><SkeletonRows /></div>;
  if (cfgQ.error || !d) return <div><PageHeader title="Personal-Einstellungen" /><ErrorState error={cfgQ.error} onRetry={() => void cfgQ.refetch()} /></div>;

  const roleOpts: Opt[] = (roles.data ?? []).map((r) => ({ id: r.id, label: r.name }));
  const upd = <K extends keyof HrConfig>(k: K, v: HrConfig[K]) => setD({ ...d, [k]: v });
  const setAt = <K extends 'statuses' | 'departments' | 'absenceTypes' | 'warningSeverities' | 'awards'>(k: K, i: number, patch: Partial<HrConfig[K][number]>) =>
    upd(k, d[k].map((x, j) => (j === i ? { ...x, ...patch } : x)) as HrConfig[K]);
  const dupKeys = (list: { key: string }[]) => { const c = new Map<string, number>(); list.forEach((x) => c.set(x.key, (c.get(x.key) ?? 0) + 1)); return (k: string) => (c.get(k) ?? 0) > 1 || !KEY_RE.test(k); };
  const badStatus = dupKeys(d.statuses), badAbs = dupKeys(d.absenceTypes), badSev = dupKeys(d.warningSeverities);
  const keyCls = (bad: boolean) => `font-mono ${bad ? 'border-danger' : ''}`;
  const addCat = () => { const t = newCat.trim().slice(0, 60); if (t && !d.warningCategories.includes(t) && d.warningCategories.length < 50) upd('warningCategories', [...d.warningCategories, t]); setNewCat(''); };

  return (
    <div>
      <PageHeader title="Personal-Einstellungen" subtitle="Status, Abteilungen, Abwesenheiten, Verwarnungen, Auszeichnungen, Personalakte und Zertifikate" actions={!ro && <SaveStatus />} />
      {ro && <p className="mb-3 rounded-md border border-line bg-panel-2 p-2 text-sm text-muted">Nur Ansicht – zum Bearbeiten wird das Recht „Beförderungs-Einstellungen verwalten“ benötigt.</p>}
      {!ro && errors.length > 0 && (
        <div role="alert" className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm text-warning">
          <p className="font-medium">Nicht gespeichert – bitte korrigieren:</p>
          <ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-4">
        <Card title="🟢 Personalstatus">
          <div className="grid gap-2">
            {d.statuses.map((s, i) => (
              <Row key={i} cols="sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_70px_70px_auto_auto] sm:items-center">
                <Input aria-label={`Status ${i + 1}: Schlüssel`} disabled={ro} className={keyCls(badStatus(s.key))} maxLength={32} value={s.key} onChange={(e) => setAt('statuses', i, { key: toKey(e.target.value) })} />
                <Input aria-label={`Status ${i + 1}: Bezeichnung`} disabled={ro} maxLength={40} value={s.label} onChange={(e) => setAt('statuses', i, { label: e.target.value })} />
                <Input aria-label={`Status ${i + 1}: Emoji`} disabled={ro} maxLength={16} value={s.emoji} onChange={(e) => setAt('statuses', i, { emoji: e.target.value })} />
                <Input type="color" aria-label={`Status ${i + 1}: Farbe`} disabled={ro} className="h-10 p-1" value={s.color} onChange={(e) => setAt('statuses', i, { color: e.target.value })} />
                <label className="flex items-center gap-2 text-xs text-muted">aktiv <Bool ro={ro} label={`Status ${i + 1}: aktiv`} checked={s.active} onChange={(v) => setAt('statuses', i, { active: v })} /></label>
                <RowActions ro={ro} i={i} n={d.statuses.length} name={`Status ${s.label || i + 1}`} onMove={(dir) => upd('statuses', moved(d.statuses, i, dir))} onRemove={() => upd('statuses', d.statuses.filter((_, j) => j !== i))} />
              </Row>
            ))}
            {d.statuses.length < 30 && <AddBtn ro={ro} onClick={() => upd('statuses', [...d.statuses, { key: `STATUS_${d.statuses.length + 1}`, label: 'Neuer Status', emoji: '', color: '#64748b', active: true }])}>Status</AddBtn>}
            <p className="text-xs text-muted">Schlüssel werden intern gespeichert (A–Z, 0–9, _). Ändern eines Schlüssels betrifft bestehende Personalakten nicht automatisch.</p>
          </div>
        </Card>

        <Card title="🏢 Abteilungen">
          <div className="grid gap-2">
            {d.departments.map((x, i) => (
              <Row key={x.id} cols="md:grid-cols-2">
                <div className="grid grid-cols-[1fr_70px] gap-2">
                  <Lbl label="Name"><Input aria-label={`Abteilung ${i + 1}: Name`} disabled={ro} maxLength={64} value={x.name} onChange={(e) => setAt('departments', i, { name: e.target.value })} /></Lbl>
                  <Lbl label="Farbe"><Input type="color" aria-label={`Abteilung ${i + 1}: Farbe`} disabled={ro} className="h-10 p-1" value={x.color} onChange={(e) => setAt('departments', i, { color: e.target.value })} /></Lbl>
                </div>
                <Lbl label="Beschreibung"><Input aria-label={`Abteilung ${i + 1}: Beschreibung`} disabled={ro} maxLength={300} value={x.description} onChange={(e) => setAt('departments', i, { description: e.target.value })} /></Lbl>
                <Lbl label="Discord-Rollen"><RolePicker ariaLabel={`Abteilung ${i + 1}: Discord-Rollen`} max={10} disabled={ro} value={x.discordRoleIds} onChange={(v) => setAt('departments', i, { discordRoleIds: v })} /></Lbl>
                <Lbl label="Dashboard-Rollen"><MultiPick ariaLabel={`Abteilung ${i + 1}: Dashboard-Rollen`} disabled={ro} options={roleOpts} value={x.dashboardRoleIds} onChange={(v) => setAt('departments', i, { dashboardRoleIds: v })} /></Lbl>
                <div className="md:col-span-2 flex justify-end"><RowActions ro={ro} i={i} n={d.departments.length} name={`Abteilung ${x.name || i + 1}`} onMove={(dir) => upd('departments', moved(d.departments, i, dir))} onRemove={() => upd('departments', d.departments.filter((_, j) => j !== i))} /></div>
              </Row>
            ))}
            {d.departments.length < 50 && <AddBtn ro={ro} onClick={() => upd('departments', [...d.departments, { id: crypto.randomUUID(), name: `Neue Abteilung ${d.departments.length + 1}`, color: '#3b82f6', description: '', discordRoleIds: [], dashboardRoleIds: [] }])}>Abteilung</AddBtn>}
            <p className="text-xs text-muted">Umbenennen übernimmt den neuen Namen automatisch in alle Personalakten.</p>
          </div>
        </Card>

        <Card title="🏖️ Abwesenheitsarten">
          <div className="grid gap-2">
            {d.absenceTypes.map((x, i) => (
              <Row key={i} cols="sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_70px_auto] sm:items-center">
                <Input aria-label={`Abwesenheitsart ${i + 1}: Schlüssel`} disabled={ro} className={keyCls(badAbs(x.key))} maxLength={32} value={x.key} onChange={(e) => setAt('absenceTypes', i, { key: toKey(e.target.value) })} />
                <Input aria-label={`Abwesenheitsart ${i + 1}: Bezeichnung`} disabled={ro} maxLength={40} value={x.label} onChange={(e) => setAt('absenceTypes', i, { label: e.target.value })} />
                <Input aria-label={`Abwesenheitsart ${i + 1}: Emoji`} disabled={ro} maxLength={16} value={x.emoji} onChange={(e) => setAt('absenceTypes', i, { emoji: e.target.value })} />
                <RowActions ro={ro} i={i} n={d.absenceTypes.length} name={`Abwesenheitsart ${x.label || i + 1}`} onMove={(dir) => upd('absenceTypes', moved(d.absenceTypes, i, dir))} onRemove={() => upd('absenceTypes', d.absenceTypes.filter((_, j) => j !== i))} />
              </Row>
            ))}
            {d.absenceTypes.length < 30 && <AddBtn ro={ro} onClick={() => upd('absenceTypes', [...d.absenceTypes, { key: `ART_${d.absenceTypes.length + 1}`, label: 'Neue Art', emoji: '' }])}>Abwesenheitsart</AddBtn>}
          </div>
        </Card>

        <Card title="⚠️ Verwarnungen">
          <div className="grid gap-4">
            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">Schweregrade</h3>
              {d.warningSeverities.map((x, i) => (
                <Row key={i} cols="sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_70px_70px_110px_auto] sm:items-center">
                  <Input aria-label={`Schweregrad ${i + 1}: Schlüssel`} disabled={ro} className={keyCls(badSev(x.key))} maxLength={32} value={x.key} onChange={(e) => setAt('warningSeverities', i, { key: toKey(e.target.value) })} />
                  <Input aria-label={`Schweregrad ${i + 1}: Bezeichnung`} disabled={ro} maxLength={40} value={x.label} onChange={(e) => setAt('warningSeverities', i, { label: e.target.value })} />
                  <Input aria-label={`Schweregrad ${i + 1}: Emoji`} disabled={ro} maxLength={16} value={x.emoji} onChange={(e) => setAt('warningSeverities', i, { emoji: e.target.value })} />
                  <Input type="color" aria-label={`Schweregrad ${i + 1}: Farbe`} disabled={ro} className="h-10 p-1" value={x.color} onChange={(e) => setAt('warningSeverities', i, { color: e.target.value })} />
                  <label className="flex items-center gap-1 text-xs text-muted"><Input type="number" min={0} max={3650} aria-label={`Schweregrad ${i + 1}: Standard-Laufzeit in Tagen`} disabled={ro} value={x.defaultDays} onChange={(e) => setAt('warningSeverities', i, { defaultDays: Math.min(3650, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />Tage</label>
                  <RowActions ro={ro} i={i} n={d.warningSeverities.length} name={`Schweregrad ${x.label || i + 1}`} onMove={(dir) => upd('warningSeverities', moved(d.warningSeverities, i, dir))} onRemove={() => upd('warningSeverities', d.warningSeverities.filter((_, j) => j !== i))} />
                </Row>
              ))}
              {d.warningSeverities.length < 20 && <AddBtn ro={ro} onClick={() => upd('warningSeverities', [...d.warningSeverities, { key: `STUFE_${d.warningSeverities.length + 1}`, label: 'Neuer Schweregrad', emoji: '⚠️', color: '#f59e0b', defaultDays: 30 }])}>Schweregrad</AddBtn>}
              <p className="text-xs text-muted">Laufzeit 0 = Verwarnung läuft nicht automatisch ab.</p>
            </section>
            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">Kategorien</h3>
              <ul className="flex flex-wrap gap-1.5">{d.warningCategories.map((c, i) => (
                <li key={c} className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-0.5 text-xs">
                  <span>{c}</span>
                  {!ro && <>
                    <button type="button" aria-label={`${c} nach vorne`} className="text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => upd('warningCategories', moved(d.warningCategories, i, -1))}>←</button>
                    <button type="button" aria-label={`${c} entfernen`} className="text-muted hover:text-danger" onClick={() => upd('warningCategories', d.warningCategories.filter((x) => x !== c))}><X size={12} /></button>
                  </>}
                </li>
              ))}</ul>
              {!ro && d.warningCategories.length < 50 && (
                <div className="flex max-w-md gap-2">
                  <Input aria-label="Neue Kategorie" maxLength={60} placeholder="Neue Kategorie + Enter" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }} />
                  <Button variant="secondary" onClick={addCat} disabled={!newCat.trim()}>Hinzufügen</Button>
                </div>
              )}
            </section>
          </div>
        </Card>

        <Card title="🏅 Auszeichnungen">
          <div className="grid gap-2">
            {d.awards.map((x, i) => (
              <Row key={x.id} cols="md:grid-cols-2">
                <div className="grid grid-cols-[70px_1fr_70px] gap-2">
                  <Lbl label="Icon"><Input aria-label={`Auszeichnung ${i + 1}: Icon`} disabled={ro} maxLength={16} value={x.icon} onChange={(e) => setAt('awards', i, { icon: e.target.value })} /></Lbl>
                  <Lbl label="Name"><Input aria-label={`Auszeichnung ${i + 1}: Name`} disabled={ro} maxLength={60} value={x.name} onChange={(e) => setAt('awards', i, { name: e.target.value })} /></Lbl>
                  <Lbl label="Farbe"><Input type="color" aria-label={`Auszeichnung ${i + 1}: Farbe`} disabled={ro} className="h-10 p-1" value={x.color} onChange={(e) => setAt('awards', i, { color: e.target.value })} /></Lbl>
                </div>
                <Lbl label="Discord-Rolle"><RolePicker ariaLabel={`Auszeichnung ${i + 1}: Discord-Rolle`} max={1} disabled={ro} value={x.discordRoleId ? [x.discordRoleId] : []} onChange={(v) => setAt('awards', i, { discordRoleId: v[0] ?? null })} /></Lbl>
                <Lbl label="Beschreibung"><Textarea aria-label={`Auszeichnung ${i + 1}: Beschreibung`} rows={2} disabled={ro} maxLength={500} value={x.description} onChange={(e) => setAt('awards', i, { description: e.target.value })} /></Lbl>
                <Lbl label="Voraussetzungen (Text)"><Textarea aria-label={`Auszeichnung ${i + 1}: Voraussetzungen`} rows={2} disabled={ro} maxLength={500} value={x.requirements} onChange={(e) => setAt('awards', i, { requirements: e.target.value })} /></Lbl>
                <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs text-muted">öffentlich sichtbar <Bool ro={ro} label={`Auszeichnung ${i + 1}: öffentlich`} checked={x.public} onChange={(v) => setAt('awards', i, { public: v })} /></label>
                    <label className="flex items-center gap-2 text-xs text-muted">aktiv <Bool ro={ro} label={`Auszeichnung ${i + 1}: aktiv`} checked={x.active} onChange={(v) => setAt('awards', i, { active: v })} /></label>
                  </div>
                  <RowActions ro={ro} i={i} n={d.awards.length} name={`Auszeichnung ${x.name || i + 1}`} onMove={(dir) => upd('awards', moved(d.awards, i, dir))} onRemove={() => upd('awards', d.awards.filter((_, j) => j !== i))} />
                </div>
              </Row>
            ))}
            {d.awards.length < 100 && <AddBtn ro={ro} onClick={() => upd('awards', [...d.awards, { id: crypto.randomUUID(), name: 'Neue Auszeichnung', icon: '🏅', description: '', color: '#eab308', requirements: '', public: true, discordRoleId: null, active: true }])}>Auszeichnung</AddBtn>}
          </div>
        </Card>

        <Card title="📁 Personalakte">
          <p className="mb-3 text-sm text-muted">🔒 Geschützt = nur mit dem Recht <code>personnel.view_sensitive</code> sichtbar.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-semibold">Bereiche</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="py-1.5 font-medium">Bereich</th><th className="py-1.5 font-medium">Sichtbar</th><th className="py-1.5 font-medium">Geschützt</th></tr></thead>
                <tbody>{PROFILE_SECTIONS.map((s) => {
                  const v = d.sections[s] ?? { visible: true, sensitive: false };
                  const set = (patch: Partial<typeof v>) => upd('sections', { ...d.sections, [s]: { ...v, ...patch } });
                  return (
                    <tr key={s} className="border-b border-line/60">
                      <td className="py-1.5">{PROFILE_SECTION_LABEL[s]}</td>
                      <td className="py-1.5"><Bool ro={ro} label={`${PROFILE_SECTION_LABEL[s]}: sichtbar`} checked={v.visible} onChange={(x) => set({ visible: x })} /></td>
                      <td className="py-1.5"><Bool ro={ro} label={`${PROFILE_SECTION_LABEL[s]}: geschützt`} checked={v.sensitive} onChange={(x) => set({ sensitive: x })} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Felder</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="py-1.5 font-medium">Feld</th><th className="py-1.5 font-medium">Sichtbar</th><th className="py-1.5 font-medium">Geschützt</th></tr></thead>
                <tbody>{PROFILE_FIELDS.map((f) => {
                  const v = d.fields[f] ?? { visible: true, sensitive: false };
                  const set = (patch: Partial<typeof v>) => upd('fields', { ...d.fields, [f]: { ...v, ...patch } });
                  return (
                    <tr key={f} className="border-b border-line/60">
                      <td className="py-1.5">{PROFILE_FIELD_LABEL[f]}</td>
                      <td className="py-1.5"><Bool ro={ro} label={`${PROFILE_FIELD_LABEL[f]}: sichtbar`} checked={v.visible} onChange={(x) => set({ visible: x })} /></td>
                      <td className="py-1.5"><Bool ro={ro} label={`${PROFILE_FIELD_LABEL[f]}: geschützt`} checked={v.sensitive} onChange={(x) => set({ sensitive: x })} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </section>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-line p-2.5 text-sm">
            <span>Abwesenheiten im Teamprofil anzeigen</span>
            <Bool ro={ro} label="Abwesenheiten im Teamprofil anzeigen" checked={d.showAbsenceInTeam} onChange={(v) => upd('showAbsenceInTeam', v)} />
          </div>
        </Card>

        <Card title="📜 Zertifikate">
          <div className="grid gap-3 md:grid-cols-3">
            <Lbl label="Organisation"><Input aria-label="Organisation" disabled={ro} maxLength={100} value={d.certificate.organisation} onChange={(e) => upd('certificate', { ...d.certificate, organisation: e.target.value })} /></Lbl>
            <Lbl label="Logo (URL)"><Input aria-label="Logo-URL" type="url" disabled={ro} maxLength={500} placeholder="https://…" value={d.certificate.logo} onChange={(e) => upd('certificate', { ...d.certificate, logo: e.target.value })} /></Lbl>
            <Lbl label="Unterschrift"><Input aria-label="Unterschrift" disabled={ro} maxLength={100} placeholder="z. B. Polizeipräsident" value={d.certificate.signature} onChange={(e) => upd('certificate', { ...d.certificate, signature: e.target.value })} /></Lbl>
          </div>
          {d.certificate.logo && /^https?:\/\//.test(d.certificate.logo) && <img src={d.certificate.logo} alt="Logo-Vorschau" className="mt-3 h-16 w-auto rounded border border-line object-contain" />}
        </Card>
      </div>
    </div>
  );
}
