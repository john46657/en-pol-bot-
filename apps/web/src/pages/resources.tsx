import { Link } from 'react-router';
import { COMPLAINT_STATUSES, DISPATCH_STATUSES, INVESTIGATION_STATUSES, PRIORITIES, REPORT_STATUSES, REPORT_TYPES, WANTED_STATUSES, APPLICATION_STATUSES } from '@enrp/shared';
import type { ResourceConfig } from '../components/ResourcePage';
import type { RecordConfig } from '../components/RecordPage';
import { fmt, PriorityBadge, StatusBadge, Badge } from '../components/ui';

type Row = Record<string, unknown> & { id?: string };
const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const status = (r: Row) => <StatusBadge status={String(r.status)} />;
const date = (k: string) => (r: Row) => fmt(r[k] as string);

export const persons: ResourceConfig<Row> = {
  title: 'Persons', subtitle: 'Person records', customEntity: 'persons', endpoint: '/persons', queryKey: 'persons', emptyText: 'No persons found.', emptyHint: 'Create a person record to get started.',
  detailPath: (r) => `/persons/${r.id}`,
  columns: [{ key: 'robloxUsername', label: 'Roblox username' }, { key: 'robloxUserId', label: 'Roblox ID', render: (r) => s(r.robloxUserId) }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Created', render: date('createdAt') }],
  create: { perm: 'persons.create', label: 'New person', fields: [{ name: 'robloxUsername', label: 'Roblox username', required: true, max: 64 }, { name: 'robloxUserId', label: 'Roblox user ID', hint: 'Digits only. Leave empty if unknown — identities are never guessed.' }, { name: 'notes', label: 'Notes', type: 'textarea' }] },
};

export const vehicles: ResourceConfig<Row> = {
  title: 'Vehicles', customEntity: 'vehicles', endpoint: '/vehicles', queryKey: 'vehicles', emptyText: 'No vehicles found.', detailPath: (r) => `/vehicles/${r.id}`,
  columns: [{ key: 'plate', label: 'Plate' }, { key: 'model', label: 'Model', render: (r) => s(r.model) }, { key: 'color', label: 'Color', render: (r) => s(r.color) }, { key: 'owner', label: 'Owner', render: (r) => s((r.owner as Row | null)?.robloxUsername) }, { key: 'status', label: 'Status', render: status }],
  create: { perm: 'vehicles.create', label: 'New vehicle', fields: [{ name: 'plate', label: 'Plate', required: true, max: 16 }, { name: 'model', label: 'Model', max: 64 }, { name: 'color', label: 'Color', max: 32 }, { name: 'ownerId', label: 'Owner', type: 'person' }, { name: 'notes', label: 'Notes', type: 'textarea' }] },
};

export const incidents: ResourceConfig<Row> = {
  title: 'Incidents', endpoint: '/incidents', queryKey: 'incidents', emptyText: 'No incidents.', statusFilter: DISPATCH_STATUSES, detailPath: (r) => `/incidents/${r.id}`,
  columns: [{ key: 'number', label: 'Number' }, { key: 'title', label: 'Title' }, { key: 'priority', label: 'Priority', render: (r) => <PriorityBadge priority={String(r.priority)} /> }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Created', render: date('createdAt') }],
  create: { perm: 'incidents.create', label: 'New incident', fields: [{ name: 'title', label: 'Title', required: true, max: 200, min: 3 }, { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES }, { name: 'location', label: 'Location', max: 200 }, { name: 'description', label: 'Description', type: 'textarea' }] },
};

export const reports: ResourceConfig<Row> = {
  title: 'Reports', endpoint: '/reports', queryKey: 'reports', emptyText: 'No reports.', statusFilter: REPORT_STATUSES, detailPath: (r) => `/reports/${r.id}`,
  columns: [{ key: 'number', label: 'Number' }, { key: 'type', label: 'Type' }, { key: 'title', label: 'Title' }, { key: 'status', label: 'Status', render: status }, { key: 'updatedAt', label: 'Updated', render: date('updatedAt') }],
  create: { perm: 'reports.create', label: 'New report', fields: [{ name: 'type', label: 'Type', type: 'select', required: true, options: REPORT_TYPES }, { name: 'title', label: 'Title', required: true, min: 3, max: 200 }, { name: 'body', label: 'Report text', type: 'textarea', required: true, max: 20000 }, { name: 'personId', label: 'Related person', type: 'person' }],
    toBody: (v) => ({ type: v.type, title: v.title, content: { body: v.body }, personIds: v.personId ? [v.personId] : undefined }) },
};

export const tickets: ResourceConfig<Row> = {
  title: 'Tickets', subtitle: 'Citations and fines', endpoint: '/tickets', queryKey: 'tickets', emptyText: 'No tickets issued.', detailPath: (r) => `/tickets/${r.id}`,
  columns: [{ key: 'number', label: 'Number' }, { key: 'person', label: 'Person', render: (r) => s((r.person as Row)?.robloxUsername) }, { key: 'reason', label: 'Reason' }, { key: 'amount', label: 'Amount', render: (r) => Number(r.amount).toFixed(2) }, { key: 'status', label: 'Status', render: status }, { key: 'issuedAt', label: 'Issued', render: date('issuedAt') }],
  create: { perm: 'tickets.create', label: 'New ticket', fields: [{ name: 'personId', label: 'Person', type: 'person', required: true }, { name: 'legalCodeId', label: 'Legal code ID', hint: 'Optional; amount defaults from the code.' }, { name: 'reason', label: 'Reason', required: true, min: 3, max: 1000 }, { name: 'amount', label: 'Amount', type: 'number' }] },
};

export const complaints: ResourceConfig<Row> = {
  title: 'Complaints', endpoint: '/complaints', queryKey: 'complaints', emptyText: 'No complaints.', statusFilter: COMPLAINT_STATUSES, detailPath: (r) => `/complaints/${r.id}`,
  columns: [{ key: 'number', label: 'Number' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Received', render: date('createdAt') }],
  create: { perm: 'complaints.create', label: 'New complaint', fields: [{ name: 'category', label: 'Category', required: true, min: 2, max: 64 }, { name: 'subjectId', label: 'Subject person', type: 'person' }, { name: 'complainantId', label: 'Complainant', type: 'person' }, { name: 'description', label: 'Description', type: 'textarea', required: true, min: 10, max: 10000 }] },
};

export const investigations: ResourceConfig<Row> = {
  title: 'Investigations', endpoint: '/investigations', queryKey: 'investigations', emptyText: 'No cases.', statusFilter: INVESTIGATION_STATUSES, detailPath: (r) => `/investigations/${r.id}`,
  columns: [{ key: 'caseNumber', label: 'Case' }, { key: 'title', label: 'Title' }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Opened', render: date('createdAt') }],
  create: { perm: 'investigations.create', label: 'New case', fields: [{ name: 'title', label: 'Title', required: true, min: 3, max: 200 }, { name: 'description', label: 'Description', type: 'textarea' }] },
};

export const wanted: ResourceConfig<Row> = {
  title: 'Wanted', subtitle: 'Active wanted records by default', endpoint: '/wanted', queryKey: 'wanted', emptyText: 'No active wanted records.', statusFilter: WANTED_STATUSES, detailPath: (r) => `/wanted/${r.id}`,
  columns: [{ key: 'reason', label: 'Reason' }, { key: 'priority', label: 'Priority', render: (r) => <PriorityBadge priority={String(r.priority)} /> }, { key: 'status', label: 'Status', render: status }, { key: 'expiresAt', label: 'Expires', render: (r) => (r.expiresAt ? fmt(r.expiresAt as string) : 'Never') }],
  create: { perm: 'wanted.create', label: 'New wanted', fields: [{ name: 'personId', label: 'Person', type: 'person', required: true }, { name: 'reason', label: 'Reason', required: true, min: 3, max: 500 }, { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES }, { name: 'description', label: 'Description', type: 'textarea' }] },
};

export const evidence: ResourceConfig<Row> = {
  title: 'Evidence', endpoint: '/evidence', queryKey: 'evidence', emptyText: 'No evidence logged.', detailPath: (r) => `/evidence/${r.id}`,
  columns: [{ key: 'number', label: 'Number' }, { key: 'type', label: 'Type' }, { key: 'description', label: 'Description' }, { key: 'custodyState', label: 'Custody', render: (r) => <StatusBadge status={String(r.custodyState)} /> }],
  create: { perm: 'evidence.create', label: 'Add evidence', fields: [{ name: 'type', label: 'Type', required: true, min: 2, max: 64 }, { name: 'description', label: 'Description', type: 'textarea', required: true, min: 3 }, { name: 'caseRef', label: 'Case number', hint: 'e.g. CASE-2026-ABC123' }, { name: 'storageLocation', label: 'Storage location' }, { name: 'personId', label: 'Related person', type: 'person' }], toBody: (v) => ({ ...v, personId: undefined, personIds: v.personId ? [v.personId] : undefined }) },
};

export const personnel: ResourceConfig<Row> = {
  title: 'Personnel', subtitle: 'Restricted — access is audited', endpoint: '/personnel', queryKey: 'personnel', emptyText: 'No personnel files.', detailPath: (r) => `/personnel/${r.id}`,
  columns: [{ key: 'name', label: 'Officer', render: (r) => s((r.user as Row)?.displayName) }, { key: 'rank', label: 'Rank', render: (r) => s(r.rank) }, { key: 'callsign', label: 'Callsign', render: (r) => s(r.callsign) }, { key: 'employmentStatus', label: 'Status', render: (r) => <StatusBadge status={String(r.employmentStatus)} /> }],
};

export const applications: ResourceConfig<Row> = {
  title: 'Applications', endpoint: '/applications', queryKey: 'applications', emptyText: 'No applications.', statusFilter: APPLICATION_STATUSES, detailPath: (r) => `/applications/${r.id}`,
  columns: [{ key: 'number', label: 'Number' }, { key: 'robloxUsername', label: 'Roblox username' }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Submitted', render: date('createdAt') }],
};

// ---------- Detailseiten ----------
const link = (r: Row, k: string) => (r[k] ? <code className="text-xs">{String(r[k])}</code> : '—');
const nested = (key: string) => (d: Record<string, unknown>) => ({ record: d[key] as Row, timeline: d.timeline as never });
const money = (v: unknown) => Number(v).toFixed(2);

export const records: Record<string, RecordConfig> = {
  tickets: { endpoint: '/tickets', queryKey: 'tickets', back: '/tickets', title: (r) => `Ticket ${r.number}`, pick: nested('ticket'),
    fields: [{ key: 'reason', label: 'Reason' }, { key: 'amount', label: 'Amount', render: money }, { key: 'issuedAt', label: 'Issued' }, { key: 'personId', label: 'Person', render: (_v, r) => <Link className="text-primary underline" to={`/persons/${r.personId}`}>{String(r.personId).slice(0, 8)}…</Link> }, { key: 'voidReason', label: 'Void reason' }, { key: 'notes', label: 'Notes' }],
    actions: [{ label: 'Void ticket', perm: 'tickets.void', path: (id) => `/tickets/${id}/void`, danger: true, reason: 'required', show: (r) => r.status === 'ISSUED' }] },
  complaints: { endpoint: '/complaints', queryKey: 'complaints', back: '/complaints', title: (r) => `Complaint ${r.number}`, pick: nested('complaint'),
    fields: [{ key: 'category', label: 'Category' }, { key: 'description', label: 'Description' }, { key: 'findings', label: 'Findings' }, { key: 'resolution', label: 'Resolution' }, { key: 'internalNotes', label: 'Internal notes' }, { key: 'investigatorId', label: 'Investigator', render: (_v, r) => link(r, 'investigatorId') }],
    actions: [
      { label: 'Start screening', perm: 'complaints.assign', path: (id) => `/complaints/${id}/screen`, show: (r) => r.status === 'RECEIVED' },
      { label: 'Resolve', perm: 'complaints.resolve', path: (id) => `/complaints/${id}/resolve`, reason: 'required', reasonField: 'resolution', show: (r) => r.status === 'REVIEW' },
      { label: 'Close', perm: 'complaints.close', path: (id) => `/complaints/${id}/close`, show: (r) => r.status === 'RESOLVED' || r.status === 'SCREENING' },
    ] },
  investigations: { endpoint: '/investigations', queryKey: 'investigations', back: '/investigations', title: (r) => `Case ${r.caseNumber}`, pick: nested('investigation'),
    fields: [{ key: 'title', label: 'Title' }, { key: 'description', label: 'Description' }, { key: 'leadId', label: 'Lead', render: (_v, r) => link(r, 'leadId') }, { key: 'createdAt', label: 'Opened' }],
    actions: [{ label: 'Close case', perm: 'investigations.close', path: (id) => `/investigations/${id}/close`, danger: true, reason: 'required', show: (r) => r.status !== 'CLOSED' && r.status !== 'ARCHIVED' }],
    extra: (_r, d) => ((d.evidence as Row[] | undefined)?.length ? <div className="mt-4"><h3 className="mb-1 text-xs text-muted">Evidence</h3><ul className="text-sm">{(d.evidence as Row[]).map((e) => <li key={String(e.id)}><Link className="text-primary underline" to={`/evidence/${e.id}`}>{String(e.number)}</Link> · {String(e.type)} · <Badge>{String(e.custodyState)}</Badge></li>)}</ul></div> : null) },
  wanted: { endpoint: '/wanted', queryKey: 'wanted', back: '/wanted', title: (r) => `Wanted: ${r.reason}`, pick: nested('wanted'),
    fields: [{ key: 'reason', label: 'Reason' }, { key: 'description', label: 'Description' }, { key: 'priority', label: 'Priority', render: (v) => <PriorityBadge priority={String(v)} /> }, { key: 'personId', label: 'Person', render: (_v, r) => r.personId ? <Link className="text-primary underline" to={`/persons/${r.personId}`}>open record</Link> : '—' }, { key: 'expiresAt', label: 'Expires' }],
    actions: [
      { label: 'Clear', perm: 'wanted.clear', path: (id) => `/wanted/${id}/clear`, reason: 'required', show: (r) => r.status === 'ACTIVE' },
      { label: 'Cancel', perm: 'wanted.edit', path: (id) => `/wanted/${id}/cancel`, danger: true, reason: 'required', show: (r) => r.status === 'ACTIVE' },
      { label: 'Re-activate', perm: 'wanted.activate', path: (id) => `/wanted/${id}/activate`, reason: 'required', show: (r) => r.status === 'EXPIRED' },
    ] },
  incidents: { endpoint: '/incidents', queryKey: 'incidents', back: '/incidents', title: (r) => `${r.number} — ${r.title}`, pick: nested('incident'),
    fields: [{ key: 'priority', label: 'Priority', render: (v) => <PriorityBadge priority={String(v)} /> }, { key: 'location', label: 'Location' }, { key: 'description', label: 'Description' }, { key: 'source', label: 'Source' }, { key: 'createdAt', label: 'Created' }, { key: 'closedAt', label: 'Closed' }],
    actions: [{ label: 'Cancel incident', perm: 'dispatch.edit', path: (id) => `/dispatch/incidents/${id}/status`, method: 'PUT', danger: true, reason: 'optional', reasonField: 'note', body: { status: 'CANCELLED' }, show: (r) => !['CLOSED', 'CANCELLED'].includes(String(r.status)) }] },
  vehicles: { endpoint: '/vehicles', queryKey: 'vehicles', back: '/vehicles', title: (r) => `Vehicle ${r.plate}`, pick: nested('vehicle'),
    fields: [{ key: 'model', label: 'Model' }, { key: 'color', label: 'Color' }, { key: 'ownerId', label: 'Owner', render: (_v, r) => r.ownerId ? <Link className="text-primary underline" to={`/persons/${r.ownerId}`}>open record</Link> : '—' }, { key: 'erlcReference', label: 'ER:LC reference' }, { key: 'notes', label: 'Notes' }],
    actions: [{ label: 'Archive', perm: 'vehicles.archive', path: (id) => `/vehicles/${id}/archive`, danger: true, reason: 'required', show: (r) => r.status !== 'ARCHIVED' }] },
  evidence: { endpoint: '/evidence', queryKey: 'evidence', back: '/evidence', title: (r) => `Evidence ${r.number}`, pick: (d) => ({ record: d as Row, timeline: undefined }),
    fields: [{ key: 'type', label: 'Type' }, { key: 'description', label: 'Description' }, { key: 'caseRef', label: 'Case' }, { key: 'storageLocation', label: 'Storage' }, { key: 'custodyState', label: 'Custody state', render: (v) => <StatusBadge status={String(v)} /> }],
    actions: [{ label: 'Release', perm: 'evidence.release', path: (id) => `/evidence/${id}/release`, reason: 'required', show: (r) => r.custodyState !== 'RELEASED' && r.custodyState !== 'ARCHIVED' }],
    extra: (r) => <div className="mt-4"><h3 className="mb-1 text-xs text-muted">Chain of custody</h3><ol className="space-y-1 text-sm">{((r.transfers as Row[]) ?? []).map((t) => <li key={String(t.id)}>{fmt(t.createdAt as string)} — {String(t.fromState)} → <b>{String(t.toState)}</b> · {String(t.reason)} {t.confirmed ? '✓' : '(unconfirmed)'}</li>)}</ol></div> },
  personnel: { endpoint: '/personnel', queryKey: 'personnel', back: '/personnel', title: (r) => `${(r.user as Row)?.displayName} (${r.callsign ?? 'no callsign'})`, pick: (d) => ({ record: d as Row, timeline: undefined }),
    fields: [{ key: 'rank', label: 'Rank' }, { key: 'team', label: 'Team' }, { key: 'callsign', label: 'Callsign' }, { key: 'joinDate', label: 'Joined' }, { key: 'qualifications', label: 'Qualifications', render: (v) => (Array.isArray(v) && v.length ? v.join(', ') : '—') }],
    extra: (r) => <div className="mt-4"><h3 className="mb-1 text-xs text-muted">Records (promotions, awards, discipline)</h3>{((r.records as Row[]) ?? []).length === 0 ? <p className="text-sm text-muted">No records.</p> : <ul className="space-y-1 text-sm">{(r.records as Row[]).map((x) => <li key={String(x.id)}><Badge>{String(x.type)}</Badge> {String(x.summary)} <span className="text-xs text-muted">{fmt(x.createdAt as string)}</span></li>)}</ul>}</div> },
  applications: { endpoint: '/applications', queryKey: 'applications', back: '/applications', title: (r) => `Application ${r.number}`, pick: (d) => ({ record: d as Row, timeline: undefined }),
    fields: [{ key: 'robloxUsername', label: 'Roblox username' }, { key: 'robloxUserId', label: 'Roblox ID' }, { key: 'createdAt', label: 'Submitted' }],
    actions: [
      { label: 'Start screening', perm: 'applications.review', path: (id) => `/applications/${id}/status`, method: 'PUT', body: { status: 'SCREENING' }, show: (r) => r.status === 'SUBMITTED' },
      { label: 'Move to interview', perm: 'applications.review', path: (id) => `/applications/${id}/status`, method: 'PUT', body: { status: 'INTERVIEW' }, show: (r) => r.status === 'SCREENING' },
      { label: 'Ready for decision', perm: 'applications.review', path: (id) => `/applications/${id}/status`, method: 'PUT', body: { status: 'PENDING_DECISION' }, show: (r) => r.status === 'INTERVIEW' },
      { label: 'Accept', perm: 'applications.decide', path: (id) => `/applications/${id}/decide`, body: { accept: true }, reason: 'required', show: (r) => r.status === 'PENDING_DECISION' },
      { label: 'Reject', perm: 'applications.decide', path: (id) => `/applications/${id}/decide`, danger: true, body: { accept: false }, reason: 'required', show: (r) => r.status === 'PENDING_DECISION' },
    ],
    extra: (r) => <div className="mt-4 space-y-2">{Object.entries((r.answers as Record<string, string>) ?? {}).map(([k, v]) => <div key={k}><h3 className="text-xs text-muted">{k}</h3><p className="whitespace-pre-wrap text-sm">{v}</p></div>)}</div> },
};
