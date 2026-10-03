import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, EmptyState, ErrorState, fmt, PageHeader, SkeletonRows, StatusBadge, Tabs } from '../components/ui';
import { Timeline, type TimelineItem } from '../components/Timeline';
import { FormModal } from '../components/FormModal';
import { customFormFields, useStudio, withCustom } from '../lib/studio';

interface Overview {
  person: { id: string; robloxUsername: string; robloxUserId: string | null; aliases: string[]; status: string; notes: string | null; custom: Record<string, string | number> | null; version: number; vehicles: { id: string; plate: string; model: string | null }[] };
  tickets: { id: string; number: string; reason: string; amount: string; status: string; issuedAt: string }[];
  links: { id: string; entityType: string; entityId: string; role: string; createdAt: string }[];
  timeline: TimelineItem[];
}
const TABS = ['Overview', 'Vehicles', 'Tickets', 'Related records', 'Timeline'];
const ROUTES: Record<string, string> = { Incident: 'incidents', Report: 'reports', Ticket: 'tickets', Complaint: 'complaints', Investigation: 'investigations', Wanted: 'wanted', Evidence: 'evidence' };

export function PersonDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [tab, setTab] = useState('Overview');
  const [editing, setEditing] = useState(false);
  const studio = useStudio();
  const defs = studio.data?.customFields.persons ?? [];
  const q = useQuery({ queryKey: ['persons', id], queryFn: () => api<Overview>(`/persons/${id}`) });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const { person: p, tickets, links, timeline } = q.data;
  return (
    <>
      <PageHeader title={p.robloxUsername} subtitle={`Roblox ID ${p.robloxUserId ?? 'unknown'}`} actions={<><StatusBadge status={p.status} />{can('persons.edit') && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}</>} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Overview' && <Card title="Overview"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-muted">Aliases</dt><dd>{p.aliases.join(', ') || '—'}</dd></div><div><dt className="text-xs text-muted">Notes</dt><dd className="whitespace-pre-wrap">{p.notes ?? '—'}</dd></div>{defs.map((d) => <div key={d.key}><dt className="text-xs text-muted">{d.label}</dt><dd>{p.custom?.[d.key] ?? '—'}</dd></div>)}</dl></Card>}
        {tab === 'Vehicles' && <Card>{p.vehicles.length ? <ul>{p.vehicles.map((v) => <li key={v.id}>{v.plate} — {v.model ?? '—'}</li>)}</ul> : <EmptyState text="No linked vehicles." />}</Card>}
        {tab === 'Tickets' && <Card>{tickets.length ? <ul className="divide-y divide-line">{tickets.map((t) => <li key={t.id} className="flex justify-between py-2"><span>{t.number} · {t.reason}</span><span className="flex gap-2">{Number(t.amount).toFixed(2)}<StatusBadge status={t.status} /></span></li>)}</ul> : <EmptyState text="No tickets." />}</Card>}
        {tab === 'Related records' && <Card>{links.length ? <ul className="divide-y divide-line">{links.map((l) => <li key={l.id} className="py-2 text-sm">{l.entityType} <code className="text-xs">{l.entityId.slice(0, 8)}</code> · {l.role} · {fmt(l.createdAt)}{ROUTES[l.entityType] ? <> · <Link className="text-primary underline" to={`/${ROUTES[l.entityType]}/${l.entityId}`}>open</Link></> : null}</li>)}</ul> : <EmptyState text="No linked records." />}</Card>}
        {tab === 'Timeline' && <Card><Timeline items={timeline} /></Card>}
      </div>
      <FormModal open={editing} onClose={() => setEditing(false)} title="Edit person" endpoint={`/persons/${id}`} method="PATCH" invalidate={[['persons']]} defaults={{ robloxUsername: p.robloxUsername, notes: p.notes ?? '', ...Object.fromEntries(Object.entries(p.custom ?? {}).map(([k, v]) => [`cf_${k}`, String(v)])) }}
        fields={[{ name: 'robloxUsername', label: 'Roblox username', required: true }, { name: 'notes', label: 'Notes', type: 'textarea' }, ...customFormFields(defs).map((f) => ({ ...f, required: false }))]} toBody={(v) => ({ ...withCustom(v), version: p.version })} />
    </>
  );
}
