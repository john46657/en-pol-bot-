import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, EmptyState, ErrorState, fmt, PageHeader, Select, SkeletonRows, StatusBadge, Tabs } from '../components/ui';
import { FormModal } from '../components/FormModal';

interface Member { userId: string; displayName: string; callsign: string | null; rank: string | null; since: string }
interface Report { id: string; number: string; occurredAt: string; missionType: string; description: string; authorName: string; authorCallsign: string | null }
interface Application { id: string; number: string; status: string; serviceTime: string; motivation: string; experience: string | null; createdAt: string; decidedAt: string | null; decidedByName: string | null; applicant: { displayName: string; callsign: string | null; rank: string | null } }
interface Me { member: boolean; openApplication: { number: string; createdAt: string } | null }
interface Officer { userId: string; name: string; callsign: string | null }

/** SEK (Spezialeinsatzkommando): Mitglieder, Einsatzberichte (nur Mitglieder schreiben) und Bewerbungen (Leitung entscheidet). */
export function Sek() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const view = can('sek.view'), manage = can('sek.manage');
  const tabs = [...(view ? ['Members', 'Mission reports'] : []), ...(manage ? ['Applications'] : [])];
  const [tab, setTab] = useState(tabs[0] ?? '');
  const [modal, setModal] = useState<'report' | 'apply' | null>(null);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState<string>();
  const me = useQuery({ queryKey: ['sek-me'], queryFn: () => api<Me>('/sek/me') });
  const members = useQuery({ queryKey: ['sek-members'], queryFn: () => api<Member[]>('/sek/members'), enabled: view });
  const reports = useQuery({ queryKey: ['sek-reports'], queryFn: () => api<Report[]>('/sek/reports?limit=100'), enabled: view && tab === 'Mission reports' });
  const apps = useQuery({ queryKey: ['sek-apps'], queryFn: () => api<Application[]>('/sek/applications'), enabled: manage && tab === 'Applications' });
  const officers = useQuery({ queryKey: ['team-overview'], queryFn: () => api<Officer[]>('/team/overview'), enabled: manage && tab === 'Members' });
  const refresh = () => { setErr(undefined); for (const k of ['sek-me', 'sek-members', 'sek-reports', 'sek-apps']) void qc.invalidateQueries({ queryKey: [k] }); };
  const onError = (e: unknown) => setErr(e instanceof ApiError ? `${e.message}${e.requestId ? ` (Request ID ${e.requestId})` : ''}` : 'Failed');
  const add = useMutation({ mutationFn: (userId: string) => api('/sek/members', { method: 'POST', body: { userId } }), onSuccess: () => { setPick(''); refresh(); }, onError });
  const remove = useMutation({ mutationFn: (userId: string) => api('/sek/members/remove', { method: 'POST', body: { userId } }), onSuccess: refresh, onError });
  const decide = useMutation({ mutationFn: (v: { id: string; status: string }) => api(`/sek/applications/${v.id}/decision`, { method: 'POST', body: v }), onSuccess: refresh, onError });

  const memberIds = new Set((members.data ?? []).map((m) => m.userId));
  const actions = (
    <>
      {me.data?.member && can('sek.report') && <Button onClick={() => setModal('report')}>New mission report</Button>}
      {me.data && !me.data.member && !me.data.openApplication && <Button variant="secondary" onClick={() => setModal('apply')}>Apply for SEK</Button>}
    </>
  );
  return (
    <>
      <PageHeader title="SEK" subtitle="Spezialeinsatzkommando – special operations unit" actions={actions} />
      {me.data?.openApplication && <p className="mb-3 text-sm text-muted">Your SEK application {me.data.openApplication.number} is being reviewed.</p>}
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      {!tabs.length ? <EmptyState text={me.data?.member ? 'You are an SEK member.' : 'Only SEK members can see the roster and reports.'} hint="You can apply using the button above." /> : <Tabs tabs={tabs} active={tab} onChange={setTab} />}
      <div className="mt-4">
        {tab === 'Members' && (
          <Card title={`Members (${members.data?.length ?? 0})`} actions={manage && (
            <div className="flex gap-2">
              <Select aria-label="Officer" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Add officer…</option>
                {(officers.data ?? []).filter((o) => !memberIds.has(o.userId)).map((o) => <option key={o.userId} value={o.userId}>{o.callsign ? `${o.callsign} · ` : ''}{o.name}</option>)}
              </Select>
              <Button disabled={!pick || add.isPending} onClick={() => add.mutate(pick)}>Add</Button>
            </div>
          )}>
            {members.isLoading ? <SkeletonRows /> : members.error ? <ErrorState error={members.error} onRetry={() => void members.refetch()} /> : !members.data?.length ? <EmptyState text="No SEK members yet." /> : (
              <ul className="divide-y divide-line">{members.data.map((m) => (
                <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
                  <span><strong>{m.callsign ?? '—'}</strong> {m.displayName}{m.rank && <span className="text-muted"> · {m.rank}</span>}<span className="ml-2 text-xs text-muted">since {fmt(m.since)}</span></span>
                  {manage && <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(m.userId)}>Remove</Button>}
                </li>
              ))}</ul>
            )}
          </Card>
        )}
        {tab === 'Mission reports' && (reports.isLoading ? <SkeletonRows /> : reports.error ? <ErrorState error={reports.error} onRetry={() => void reports.refetch()} /> : !reports.data?.length ? <EmptyState text="No SEK mission reports yet." /> : (
          <div className="grid gap-3">{reports.data.map((r) => (
            <Card key={r.id} title={`${r.number} · ${r.missionType}`}>
              <p className="whitespace-pre-wrap text-sm">{r.description}</p>
              <p className="mt-2 text-xs text-muted">{fmt(r.occurredAt)} · {r.authorCallsign ? `${r.authorCallsign} · ` : ''}{r.authorName}</p>
            </Card>
          ))}</div>
        ))}
        {tab === 'Applications' && (apps.isLoading ? <SkeletonRows /> : apps.error ? <ErrorState error={apps.error} onRetry={() => void apps.refetch()} /> : !apps.data?.length ? <EmptyState text="No SEK applications." /> : (
          <div className="grid gap-3">{apps.data.map((a) => (
            <Card key={a.id} title={<span>{a.number} · {a.applicant.callsign ? `${a.applicant.callsign} · ` : ''}{a.applicant.displayName} <StatusBadge status={a.status} /></span>} actions={a.status === 'OPEN' && (
              <div className="flex gap-2"><Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, status: 'ACCEPTED' })}>Accept</Button><Button size="sm" variant="danger" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, status: 'REJECTED' })}>Reject</Button></div>
            )}>
              <dl className="grid gap-2 text-sm">
                <div><dt className="text-xs text-muted">Time in service</dt><dd>{a.serviceTime}</dd></div>
                <div><dt className="text-xs text-muted">Motivation</dt><dd className="whitespace-pre-wrap">{a.motivation}</dd></div>
                {a.experience && <div><dt className="text-xs text-muted">Experience</dt><dd className="whitespace-pre-wrap">{a.experience}</dd></div>}
              </dl>
              <p className="mt-2 text-xs text-muted">Submitted {fmt(a.createdAt)}{a.decidedAt && ` · decided ${fmt(a.decidedAt)} by ${a.decidedByName}`}</p>
            </Card>
          ))}</div>
        ))}
      </div>
      <FormModal open={modal === 'report'} onClose={() => setModal(null)} title="New SEK mission report" endpoint="/sek/reports" invalidate={[['sek-reports']]}
        toBody={(v) => ({ ...v, ...(v.occurredAt ? { occurredAt: new Date(String(v.occurredAt)).toISOString() } : {}) })}
        fields={[{ name: 'occurredAt', label: 'Date/time (empty = now)', type: 'datetime' }, { name: 'missionType', label: 'Mission type (e.g. hostage situation, raid)', required: true, min: 2, max: 100 }, { name: 'description', label: 'Description', type: 'textarea', required: true, min: 5, max: 4000 }]} />
      <FormModal open={modal === 'apply'} onClose={() => setModal(null)} title="Apply for SEK" endpoint="/sek/applications" invalidate={[['sek-me']]} submitLabel="Submit application"
        fields={[{ name: 'serviceTime', label: 'How long have you been in the police service?', required: true, max: 100 }, { name: 'motivation', label: 'Why do you want to join the SEK?', type: 'textarea', required: true, min: 10, max: 2000 }, { name: 'experience', label: 'Special experience / qualifications', type: 'textarea', max: 1000 }]} />
    </>
  );
}
