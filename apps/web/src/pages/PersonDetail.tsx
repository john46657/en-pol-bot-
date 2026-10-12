import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { useAuth } from '../lib/auth';
import { Button, Card, EmptyState, ErrorState, Field, fmt, Modal, PageHeader, SkeletonRows, StatusBadge, Tabs, Textarea } from '../components/ui';
import { Timeline, type TimelineItem } from '../components/Timeline';
import { FormModal, PersonPicker } from '../components/FormModal';
import { customFormFields, useStudio, withCustom } from '../lib/studio';

interface Overview {
  person: { id: string; robloxUsername: string; robloxUserId: string | null; aliases: string[]; status: string; notes: string | null; custom: Record<string, string | number> | null; version: number; vehicles: { id: string; plate: string; model: string | null }[] };
  tickets: { id: string; number: string; reason: string; amount: string; status: string; issuedAt: string }[];
  links: { id: string; entityType: string; entityId: string; role: string; createdAt: string }[];
  timeline: TimelineItem[];
}
const TABS = ['Übersicht', 'Fahrzeuge', 'Verknüpfte Akten', 'Verlauf'];
const ROUTES: Record<string, string> = { Incident: 'incidents', Report: 'reports', Ticket: 'tickets', Complaint: 'complaints', Investigation: 'investigations', Wanted: 'wanted', Evidence: 'evidence' };
const ENTITY_LABELS: Record<string, string> = { Incident: 'Einsatz', Report: 'Bericht', Ticket: 'Strafzettel', Complaint: 'Beschwerde', Investigation: 'Ermittlung', Wanted: 'Fahndung', Evidence: 'Beweismittel', Person: 'Person', Vehicle: 'Fahrzeug' };

export function PersonDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [tab, setTab] = useState('Übersicht');
  const [editing, setEditing] = useState(false);
  const studio = useStudio();
  const defs = studio.data?.customFields.persons ?? [];
  const q = useQuery({ queryKey: ['persons', id], queryFn: () => api<Overview>(`/persons/${id}`) });
  const nav = useNavigate();
  const qc = useQueryClient();
  // Archivieren / Zusammenführen (Duplikat in eine andere Akte überführen; die Quelle wird archiviert, nichts gelöscht)
  const [mode, setMode] = useState<'archive' | 'merge'>();
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState<{ id: string; label: string }>();
  const [sure, setSure] = useState(false);
  const close = () => { setMode(undefined); setReason(''); setTarget(undefined); setSure(false); act.reset(); };
  const act = useMutation({
    mutationFn: () => mode === 'merge'
      ? api(`/persons/${id}/merge`, { body: { targetId: target!.id, confirm: true, reason: reason.trim() } })
      : api(`/persons/${id}/archive`, { body: { reason: reason.trim() } }),
    onSuccess: () => { const to = mode === 'merge' ? target?.id : undefined; close(); void qc.invalidateQueries({ queryKey: ['persons'] }); if (to) nav(`/persons/${to}`); },
  });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { person: p, links, timeline } = q.data;
  return (
    <>
      <PageHeader title={p.robloxUsername} subtitle={`Roblox-ID ${p.robloxUserId ?? 'unbekannt'}`} actions={<><StatusBadge status={p.status} />{can('persons.edit') && <Button variant="secondary" onClick={() => setEditing(true)}>Bearbeiten</Button>}{p.status === 'ACTIVE' && can('persons.merge') && <Button variant="secondary" onClick={() => setMode('merge')}>Zusammenführen</Button>}{p.status === 'ACTIVE' && can('persons.archive') && <Button variant="danger" onClick={() => setMode('archive')}>Archivieren</Button>}</>} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Übersicht' && <Card title="Übersicht"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-muted">Aliasse</dt><dd>{p.aliases.join(', ') || '—'}</dd></div><div><dt className="text-xs text-muted">Notizen</dt><dd className="whitespace-pre-wrap">{p.notes ?? '—'}</dd></div>{defs.map((d) => <div key={d.key}><dt className="text-xs text-muted">{d.label}</dt><dd>{p.custom?.[d.key] ?? '—'}</dd></div>)}</dl></Card>}
        {tab === 'Fahrzeuge' && <Card>{p.vehicles.length ? <ul>{p.vehicles.map((v) => <li key={v.id}>{v.plate} — {v.model ?? '—'}</li>)}</ul> : <EmptyState text="Keine verknüpften Fahrzeuge." />}</Card>}
        {tab === 'Verknüpfte Akten' && <Card>{links.length ? <ul className="divide-y divide-line">{links.map((l) => <li key={l.id} className="py-2 text-sm">{ENTITY_LABELS[l.entityType] ?? l.entityType} <code className="text-xs">{l.entityId.slice(0, 8)}</code> · {l.role} · {fmt(l.createdAt)}{ROUTES[l.entityType] ? <> · <Link className="text-primary underline" to={`/${ROUTES[l.entityType]}/${l.entityId}`}>öffnen</Link></> : null}</li>)}</ul> : <EmptyState text="Keine verknüpften Akten." />}</Card>}
        {tab === 'Verlauf' && <Card><Timeline items={timeline} /></Card>}
      </div>
      <Modal open={!!mode} title={mode === 'merge' ? `${p.robloxUsername} zusammenführen` : `${p.robloxUsername} archivieren`} onClose={close}>
        <div className="grid gap-3">
          {mode === 'merge' && <>
            <p className="text-sm text-muted">Alle Verknüpfungen (Einsätze, Berichte, Fahndungen, Fahrzeuge …) wandern in die Ziel-Akte. Diese Akte wird danach archiviert – gelöscht wird nichts.</p>
            <Field label="Ziel-Akte *">{(fid) => <PersonPicker id={fid} value={target?.id ?? ''} onChange={(pid, label) => setTarget(pid ? { id: pid, label } : undefined)} />}</Field>
            {target?.id === id && <p role="alert" className="text-sm text-danger">Bitte eine andere Akte wählen.</p>}
          </>}
          <Field label="Begründung *">{(fid) => <Textarea id={fid} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          {mode === 'merge' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />Ja, das ist dieselbe Person{target ? ` wie „${target.label}“` : ''}.</label>}
          {act.error && <p role="alert" className="text-sm text-danger">{errText(act.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Abbrechen</Button>
            <Button variant="danger" disabled={act.isPending || reason.trim().length < 3 || (mode === 'merge' && (!target || target.id === id || !sure))} onClick={() => act.mutate()}>{mode === 'merge' ? 'Zusammenführen' : 'Archivieren'}</Button>
          </div>
        </div>
      </Modal>
      <FormModal open={editing} onClose={() => setEditing(false)} title="Person bearbeiten" endpoint={`/persons/${id}`} method="PATCH" lock={{ type: 'person', id }} invalidate={[['persons']]} defaults={{ robloxUsername: p.robloxUsername, notes: p.notes ?? '', ...Object.fromEntries(Object.entries(p.custom ?? {}).map(([k, v]) => [`cf_${k}`, String(v)])) }}
        fields={[{ name: 'robloxUsername', label: 'Roblox-Benutzername', required: true }, { name: 'notes', label: 'Notizen', type: 'textarea' }, ...customFormFields(defs).map((f) => ({ ...f, required: false }))]} toBody={(v) => ({ ...withCustom(v), version: p.version })} />
    </>
  );
}
