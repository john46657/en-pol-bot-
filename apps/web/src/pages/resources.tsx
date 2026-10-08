import { ErlcLiveCard } from '../components/ErlcLiveCard';
import { DiscordChannelHint } from '../components/DiscordChannelHint';
import { PersonnelTeamEditor } from '../components/PersonnelTeamEditor';
import { Link } from 'react-router';
import { COMPLAINT_STATUSES, DISPATCH_STATUSES, INVESTIGATION_STATUSES, PRIORITIES, REPORT_STATUSES, REPORT_TYPES, WANTED_STATUSES, APPLICATION_STATUSES } from '@enrp/shared';
import type { ResourceConfig } from '../components/ResourcePage';
import type { RecordConfig } from '../components/RecordPage';
import { fmt, PriorityBadge, StatusBadge, Badge, statusLabel } from '../components/ui';

type Row = Record<string, unknown> & { id?: string };
const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const status = (r: Row) => <StatusBadge status={String(r.status)} />;
const date = (k: string) => (r: Row) => fmt(r[k] as string);

export const persons: ResourceConfig<Row> = {
  title: 'Personen', subtitle: 'Personenakten', notice: <ErlcLiveCard kind="persons" />, customEntity: 'persons', endpoint: '/persons', queryKey: 'persons', emptyText: 'Keine Personen gefunden.', emptyHint: 'Lege eine Personenakte an, um loszulegen.',
  detailPath: (r) => `/persons/${r.id}`,
  columns: [{ key: 'robloxUsername', label: 'Roblox-Name' }, { key: 'robloxUserId', label: 'Roblox-ID', render: (r) => s(r.robloxUserId) }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Erstellt', render: date('createdAt') }],
  create: { perm: 'persons.create', label: 'Neue Person', fields: [{ name: 'robloxUsername', label: 'Roblox-Name oder Roblox-ID', required: true, max: 64, hint: 'Eins reicht – das andere wird automatisch bei Roblox nachgeschlagen.' }, { name: 'robloxUserId', label: 'Roblox-Benutzer-ID (optional)', hint: 'Nur Ziffern. Nur nötig, wenn Roblox nicht erreichbar ist.' }, { name: 'notes', label: 'Notizen', type: 'textarea' }] },
};

export const vehicles: ResourceConfig<Row> = {
  title: 'Fahrzeuge', notice: <ErlcLiveCard kind="vehicles" />, customEntity: 'vehicles', endpoint: '/vehicles', queryKey: 'vehicles', emptyText: 'Keine Fahrzeuge gefunden.', detailPath: (r) => `/vehicles/${r.id}`,
  columns: [{ key: 'plate', label: 'Kennzeichen' }, { key: 'model', label: 'Modell', render: (r) => s(r.model) }, { key: 'color', label: 'Farbe', render: (r) => s(r.color) }, { key: 'owner', label: 'Halter', render: (r) => s((r.owner as Row | null)?.robloxUsername) }, { key: 'status', label: 'Status', render: status }],
  create: { perm: 'vehicles.create', label: 'Neues Fahrzeug', fields: [{ name: 'plate', label: 'Kennzeichen', required: true, max: 16 }, { name: 'model', label: 'Modell', max: 64 }, { name: 'color', label: 'Farbe', max: 32 }, { name: 'ownerId', label: 'Halter', type: 'person' }, { name: 'notes', label: 'Notizen', type: 'textarea' }] },
};

export const incidents: ResourceConfig<Row> = {
  notice: <DiscordChannelHint channel="dispatch" what="Einsätze" />,
  title: 'Einsätze', endpoint: '/incidents', queryKey: 'incidents', emptyText: 'Keine Einsätze.', statusFilter: DISPATCH_STATUSES, detailPath: (r) => `/incidents/${r.id}`,
  columns: [{ key: 'number', label: 'Nummer' }, { key: 'title', label: 'Titel' }, { key: 'priority', label: 'Priorität', render: (r) => <PriorityBadge priority={String(r.priority)} /> }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Erstellt', render: date('createdAt') }],
  create: { perm: 'incidents.create', label: 'Neuer Einsatz', fields: [{ name: 'title', label: 'Titel', required: true, max: 200, min: 3 }, { name: 'priority', label: 'Priorität', type: 'select', options: PRIORITIES }, { name: 'location', label: 'Ort', max: 200 }, { name: 'description', label: 'Beschreibung', type: 'textarea' }] },
};

export const reports: ResourceConfig<Row> = {
  title: 'Berichte', endpoint: '/reports', queryKey: 'reports', emptyText: 'Keine Berichte.', statusFilter: REPORT_STATUSES, detailPath: (r) => `/reports/${r.id}`,
  columns: [{ key: 'number', label: 'Nummer' }, { key: 'type', label: 'Art', render: (r) => statusLabel(String(r.type)) }, { key: 'title', label: 'Titel' }, { key: 'status', label: 'Status', render: status }, { key: 'updatedAt', label: 'Aktualisiert', render: date('updatedAt') }],
  create: { perm: 'reports.create', label: 'Neuer Bericht', fields: [{ name: 'type', label: 'Art', type: 'select', required: true, options: REPORT_TYPES }, { name: 'title', label: 'Titel', required: true, min: 3, max: 200 }, { name: 'body', label: 'Berichtstext', type: 'textarea', required: true, max: 20000 }, { name: 'personId', label: 'Beteiligte Person', type: 'person' }],
    toBody: (v) => ({ type: v.type, title: v.title, content: { body: v.body }, personIds: v.personId ? [v.personId] : undefined }) },
};

export const complaints: ResourceConfig<Row> = {
  title: 'Beschwerden', endpoint: '/complaints', queryKey: 'complaints', emptyText: 'Keine Beschwerden.', statusFilter: COMPLAINT_STATUSES, detailPath: (r) => `/complaints/${r.id}`,
  columns: [{ key: 'number', label: 'Nummer' }, { key: 'category', label: 'Kategorie' }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Eingegangen', render: date('createdAt') }],
  create: { perm: 'complaints.create', label: 'Neue Beschwerde', fields: [{ name: 'category', label: 'Kategorie', required: true, min: 2, max: 64 }, { name: 'subjectId', label: 'Betroffene Person', type: 'person' }, { name: 'complainantId', label: 'Beschwerdeführer', type: 'person' }, { name: 'description', label: 'Beschreibung', type: 'textarea', required: true, min: 10, max: 10000 }] },
};

export const investigations: ResourceConfig<Row> = {
  title: 'Ermittlungen', endpoint: '/investigations', queryKey: 'investigations', emptyText: 'Keine Fälle.', statusFilter: INVESTIGATION_STATUSES, detailPath: (r) => `/investigations/${r.id}`,
  columns: [{ key: 'caseNumber', label: 'Fall' }, { key: 'title', label: 'Titel' }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Eröffnet', render: date('createdAt') }],
  create: { perm: 'investigations.create', label: 'Neuer Fall', fields: [{ name: 'title', label: 'Titel', required: true, min: 3, max: 200 }, { name: 'description', label: 'Beschreibung', type: 'textarea' }] },
};

export const wanted: ResourceConfig<Row> = {
  notice: <DiscordChannelHint channel="wanted" what="Fahndungen" />,
  title: 'Fahndungen', subtitle: 'Standardmäßig nur aktive Fahndungen', endpoint: '/wanted', queryKey: 'wanted', emptyText: 'Keine aktiven Fahndungen.', statusFilter: WANTED_STATUSES, detailPath: (r) => `/wanted/${r.id}`,
  columns: [{ key: 'reason', label: 'Grund' }, { key: 'priority', label: 'Priorität', render: (r) => <PriorityBadge priority={String(r.priority)} /> }, { key: 'status', label: 'Status', render: status }, { key: 'expiresAt', label: 'Läuft ab', render: (r) => (r.expiresAt ? fmt(r.expiresAt as string) : 'Nie') }],
  create: { perm: 'wanted.create', label: 'Neue Fahndung', fields: [{ name: 'personId', label: 'Person', type: 'person', required: true }, { name: 'reason', label: 'Grund', required: true, min: 3, max: 500 }, { name: 'priority', label: 'Priorität', type: 'select', options: PRIORITIES }, { name: 'description', label: 'Beschreibung', type: 'textarea' }] },
};

export const evidence: ResourceConfig<Row> = {
  title: 'Beweismittel', endpoint: '/evidence', queryKey: 'evidence', emptyText: 'Keine Beweismittel erfasst.', detailPath: (r) => `/evidence/${r.id}`,
  columns: [{ key: 'number', label: 'Nummer' }, { key: 'type', label: 'Art' }, { key: 'description', label: 'Beschreibung' }, { key: 'custodyState', label: 'Verwahrung', render: (r) => <StatusBadge status={String(r.custodyState)} /> }],
  create: { perm: 'evidence.create', label: 'Beweismittel erfassen', fields: [{ name: 'type', label: 'Art', required: true, min: 2, max: 64 }, { name: 'description', label: 'Beschreibung', type: 'textarea', required: true, min: 3 }, { name: 'caseRef', label: 'Fallnummer', hint: 'z. B. CASE-2026-ABC123' }, { name: 'storageLocation', label: 'Lagerort' }, { name: 'personId', label: 'Beteiligte Person', type: 'person' }], toBody: (v) => ({ ...v, personId: undefined, personIds: v.personId ? [v.personId] : undefined }) },
};

export const personnel: ResourceConfig<Row> = {
  title: 'Personal', subtitle: 'Eingeschränkt – Zugriffe werden protokolliert', endpoint: '/personnel', queryKey: 'personnel', emptyText: 'Keine Personalakten.', detailPath: (r) => `/personnel/${r.id}`,
  columns: [{ key: 'name', label: 'Beamter', render: (r) => s((r.user as Row)?.displayName) }, { key: 'rank', label: 'Rang', render: (r) => s(r.rank) }, { key: 'callsign', label: 'Rufname', render: (r) => s(r.callsign) }, { key: 'employmentStatus', label: 'Status', render: (r) => <StatusBadge status={String(r.employmentStatus)} /> }],
};

export const applications: ResourceConfig<Row> = {
  title: 'Bewerbungen', endpoint: '/applications', queryKey: 'applications', emptyText: 'Keine Bewerbungen.', statusFilter: APPLICATION_STATUSES, detailPath: (r) => `/applications/${r.id}`,
  columns: [{ key: 'number', label: 'Nummer' }, { key: 'robloxUsername', label: 'Roblox-Name' }, { key: 'status', label: 'Status', render: status }, { key: 'createdAt', label: 'Eingereicht', render: date('createdAt') }],
};

// ---------- Detailseiten ----------
const link = (r: Row, k: string) => (r[k] ? <code className="text-xs">{String(r[k])}</code> : '—');
const nested = (key: string) => (d: Record<string, unknown>) => ({ record: d[key] as Row, timeline: d.timeline as never });

export const records: Record<string, RecordConfig> = {
  complaints: { endpoint: '/complaints', queryKey: 'complaints', back: '/complaints', title: (r) => `Beschwerde ${r.number}`, pick: nested('complaint'),
    fields: [{ key: 'category', label: 'Kategorie' }, { key: 'description', label: 'Beschreibung' }, { key: 'findings', label: 'Feststellungen' }, { key: 'resolution', label: 'Ergebnis' }, { key: 'internalNotes', label: 'Interne Notizen' }, { key: 'investigatorId', label: 'Ermittler', render: (_v, r) => link(r, 'investigatorId') }],
    actions: [
      { label: 'Vorprüfung starten', perm: 'complaints.assign', path: (id) => `/complaints/${id}/screen`, show: (r) => r.status === 'RECEIVED' },
      { label: 'Als gelöst markieren', perm: 'complaints.resolve', path: (id) => `/complaints/${id}/resolve`, reason: 'required', reasonField: 'resolution', show: (r) => r.status === 'REVIEW' },
      { label: 'Schließen', perm: 'complaints.close', path: (id) => `/complaints/${id}/close`, show: (r) => r.status === 'RESOLVED' || r.status === 'SCREENING' },
    ] },
  investigations: { endpoint: '/investigations', queryKey: 'investigations', back: '/investigations', title: (r) => `Fall ${r.caseNumber}`, pick: nested('investigation'),
    fields: [{ key: 'title', label: 'Titel' }, { key: 'description', label: 'Beschreibung' }, { key: 'leadId', label: 'Leitung', render: (_v, r) => link(r, 'leadId') }, { key: 'createdAt', label: 'Eröffnet' }],
    actions: [{ label: 'Fall schließen', perm: 'investigations.close', path: (id) => `/investigations/${id}/close`, danger: true, reason: 'required', show: (r) => r.status !== 'CLOSED' && r.status !== 'ARCHIVED' }],
    extra: (_r, d) => ((d.evidence as Row[] | undefined)?.length ? <div className="mt-4"><h3 className="mb-1 text-xs text-muted">Beweismittel</h3><ul className="text-sm">{(d.evidence as Row[]).map((e) => <li key={String(e.id)}><Link className="text-primary underline" to={`/evidence/${e.id}`}>{String(e.number)}</Link> · {String(e.type)} · <Badge>{statusLabel(String(e.custodyState))}</Badge></li>)}</ul></div> : null) },
  wanted: { endpoint: '/wanted', queryKey: 'wanted', back: '/wanted', title: (r) => `Fahndung: ${r.reason}`, pick: nested('wanted'),
    fields: [{ key: 'reason', label: 'Grund' }, { key: 'description', label: 'Beschreibung' }, { key: 'priority', label: 'Priorität', render: (v) => <PriorityBadge priority={String(v)} /> }, { key: 'personId', label: 'Person', render: (_v, r) => r.personId ? <Link className="text-primary underline" to={`/persons/${r.personId}`}>Akte öffnen</Link> : '—' }, { key: 'expiresAt', label: 'Läuft ab' }],
    actions: [
      { label: 'Erledigen', perm: 'wanted.clear', path: (id) => `/wanted/${id}/clear`, reason: 'required', show: (r) => r.status === 'ACTIVE' },
      { label: 'Abbrechen', perm: 'wanted.edit', path: (id) => `/wanted/${id}/cancel`, danger: true, reason: 'required', show: (r) => r.status === 'ACTIVE' },
      { label: 'Reaktivieren', perm: 'wanted.activate', path: (id) => `/wanted/${id}/activate`, reason: 'required', show: (r) => r.status === 'EXPIRED' },
    ] },
  incidents: { endpoint: '/incidents', queryKey: 'incidents', back: '/incidents', title: (r) => `${r.number} — ${r.title}`, pick: nested('incident'),
    fields: [{ key: 'priority', label: 'Priorität', render: (v) => <PriorityBadge priority={String(v)} /> }, { key: 'location', label: 'Ort' }, { key: 'description', label: 'Beschreibung' }, { key: 'source', label: 'Quelle' }, { key: 'createdAt', label: 'Erstellt' }, { key: 'closedAt', label: 'Geschlossen' }],
    actions: [{ label: 'Einsatz abbrechen', perm: 'dispatch.edit', path: (id) => `/dispatch/incidents/${id}/status`, method: 'PUT', danger: true, reason: 'optional', reasonField: 'note', body: { status: 'CANCELLED' }, show: (r) => !['CLOSED', 'CANCELLED'].includes(String(r.status)) }] },
  vehicles: { endpoint: '/vehicles', queryKey: 'vehicles', back: '/vehicles', title: (r) => `Fahrzeug ${r.plate}`, pick: nested('vehicle'),
    fields: [{ key: 'model', label: 'Modell' }, { key: 'color', label: 'Farbe' }, { key: 'ownerId', label: 'Halter', render: (_v, r) => r.ownerId ? <Link className="text-primary underline" to={`/persons/${r.ownerId}`}>Akte öffnen</Link> : '—' }, { key: 'erlcReference', label: 'ER:LC-Referenz' }, { key: 'notes', label: 'Notizen' }],
    actions: [{ label: 'Archivieren', perm: 'vehicles.archive', path: (id) => `/vehicles/${id}/archive`, danger: true, reason: 'required', show: (r) => r.status !== 'ARCHIVED' }] },
  evidence: { endpoint: '/evidence', queryKey: 'evidence', back: '/evidence', title: (r) => `Beweismittel ${r.number}`, pick: (d) => ({ record: d as Row, timeline: undefined }),
    fields: [{ key: 'type', label: 'Art' }, { key: 'description', label: 'Beschreibung' }, { key: 'caseRef', label: 'Fall' }, { key: 'storageLocation', label: 'Lagerort' }, { key: 'custodyState', label: 'Verwahrungsstatus', render: (v) => <StatusBadge status={String(v)} /> }],
    actions: [{ label: 'Freigeben', perm: 'evidence.release', path: (id) => `/evidence/${id}/release`, reason: 'required', show: (r) => r.custodyState !== 'RELEASED' && r.custodyState !== 'ARCHIVED' }],
    extra: (r) => <div className="mt-4"><h3 className="mb-1 text-xs text-muted">Beweismittelkette</h3><ol className="space-y-1 text-sm">{((r.transfers as Row[]) ?? []).map((t) => <li key={String(t.id)}>{fmt(t.createdAt as string)} — {statusLabel(String(t.fromState))} → <b>{statusLabel(String(t.toState))}</b> · {String(t.reason)} {t.confirmed ? '✓' : '(unbestätigt)'}</li>)}</ol></div> },
  personnel: { endpoint: '/personnel', queryKey: 'personnel', back: '/personnel', title: (r) => `${(r.user as Row)?.displayName} (${r.callsign ?? 'kein Rufname'})`, pick: (d) => ({ record: d as Row, timeline: undefined }),
    fields: [{ key: 'rank', label: 'Rang' }, { key: 'team', label: 'Team' }, { key: 'office', label: 'Büro' }, { key: 'serviceNumber', label: 'Dienstnummer' }, { key: 'callsign', label: 'Rufname' }, { key: 'joinDate', label: 'Eingetreten' }, { key: 'qualifications', label: 'Qualifikationen', render: (v) => (Array.isArray(v) && v.length ? v.join(', ') : '—') }],
    extra: (r) => <><PersonnelTeamEditor record={r} /><div className="mt-4"><h3 className="mb-1 text-xs text-muted">Einträge (Beförderungen, Auszeichnungen, Disziplinarmaßnahmen)</h3>{((r.records as Row[]) ?? []).length === 0 ? <p className="text-sm text-muted">Keine Einträge.</p> : <ul className="space-y-1 text-sm">{(r.records as Row[]).map((x) => <li key={String(x.id)}><Badge>{statusLabel(String(x.type))}</Badge> {String(x.summary)} <span className="text-xs text-muted">{fmt(x.createdAt as string)}</span></li>)}</ul>}</div></> },
  applications: { endpoint: '/applications', queryKey: 'applications', back: '/applications', title: (r) => `Bewerbung ${r.number}`, pick: (d) => ({ record: d as Row, timeline: undefined }),
    fields: [{ key: 'robloxUsername', label: 'Roblox-Name' }, { key: 'robloxUserId', label: 'Roblox-ID' }, { key: 'createdAt', label: 'Eingereicht' },
      { key: 'discordName', label: 'Discord' }, { key: 'durationSec', label: 'Ausfülldauer (Discord)', render: (v) => (typeof v === 'number' ? `${Math.floor(v / 60)} min ${v % 60} s` : '—') },
      { key: 'decisionReason', label: 'Begründung an Bewerber' }],
    actions: [
      { label: 'Vorprüfung starten', perm: 'applications.review', path: (id) => `/applications/${id}/status`, method: 'PUT', body: { status: 'SCREENING' }, show: (r) => r.status === 'SUBMITTED' },
      { label: 'Zum Gespräch einladen', perm: 'applications.review', path: (id) => `/applications/${id}/status`, method: 'PUT', body: { status: 'INTERVIEW' }, show: (r) => r.status === 'SCREENING' },
      { label: 'Bereit zur Entscheidung', perm: 'applications.review', path: (id) => `/applications/${id}/status`, method: 'PUT', body: { status: 'PENDING_DECISION' }, show: (r) => r.status === 'INTERVIEW' },
      { label: 'Annehmen', perm: 'applications.decide', path: (id) => `/applications/${id}/decide`, body: { accept: true }, reason: 'required', show: (r) => r.status === 'PENDING_DECISION' },
      { label: 'Ablehnen', perm: 'applications.decide', path: (id) => `/applications/${id}/decide`, danger: true, body: { accept: false }, reason: 'required', show: (r) => r.status === 'PENDING_DECISION' },
    ],
    extra: (r) => <div className="mt-4 space-y-2">{Object.entries((r.answers as Record<string, string>) ?? {}).map(([k, v]) => <div key={k}><h3 className="text-xs text-muted">{k}</h3><p className="whitespace-pre-wrap text-sm">{v}</p></div>)}</div> },
};
