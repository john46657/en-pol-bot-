import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { useAuth } from '../lib/auth';
import type { FormField } from '@enrp/shared';
import { FormQuestionsEditor } from '../components/FormQuestionsEditor';
import { Button, Card, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, StatusBadge, Tabs, Textarea } from '../components/ui';

interface Unit { key: string; name: string; description: string; roleId?: string; channelId?: string; pingRoleIds?: string[]; questions: FormField[] }
interface Config { title: string; intro: string; units: Unit[]; police: { title: string; description: string; pingRoleIds?: string[] }; policeForm: FormField[] }
interface Application {
  id: string; number: string; unit: string; unitName: string; discordId: string; discordName: string; linkedName: string | null;
  answers: { question: string; answer: string }[]; status: string; createdAt: string; decidedAt: string | null; decidedByName: string | null;
  decisionReason: string | null; durationSec: number | null;
}
type DraftUnit = Omit<Unit, 'pingRoleIds'> & { pingRoles: string; isNew?: boolean };
/** Rollen-IDs aus einem Textfeld (auch als <@&…>-Erwähnung eingefügt). */
const roleIds = (t: string) => t.match(/\d{15,25}/g) ?? [];

/** Qualifikationen (SEK, Flugstaffel, Ausbilder …): Bewerbungen aus dem Discord-Panel entscheiden und Einheiten/Fragen einrichten. */
export function Qualifications() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = can('qualifications.manage'), decideAllowed = can('qualifications.decide');
  const tabs = ['Applications', ...(manage ? ['Setup'] : [])];
  const [tab, setTab] = useState('Applications');
  // „Im Dashboard ansehen“ aus Discord: ?id=<Bewerbung> zeigt genau diese Bewerbung
  const [search] = useSearchParams();
  const only = search.get('id');
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [err, setErr] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const onError = (e: unknown) => setErr(errText(e));
  const config = useQuery({ queryKey: ['quali-config'], queryFn: () => api<Config>('/qualifications/config') });
  const params = new URLSearchParams({ ...(unit ? { unit } : {}), ...(status && !only ? { status } : {}) });
  const apps = useQuery({ queryKey: ['quali-apps', unit, only ? '' : status], queryFn: () => api<Application[]>(`/qualifications/applications?${params}`), enabled: tab === 'Applications' });
  const shown = only ? (apps.data ?? []).filter((a) => a.id === only) : apps.data;
  const decide = useMutation({
    mutationFn: (v: { id: string; status: string }) => api(`/qualifications/applications/${v.id}/decision`, { method: 'POST', body: { status: v.status } }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['quali-apps'] }); }, onError,
  });

  // ---- Setup ----
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [units, setUnits] = useState<DraftUnit[]>([]);
  const [policeTitle, setPoliceTitle] = useState('');
  const [policeText, setPoliceText] = useState('');
  const [policeForm, setPoliceForm] = useState<FormField[]>([]);
  const [policePing, setPolicePing] = useState('');
  useEffect(() => {
    if (!config.data) return;
    setTitle(config.data.title); setIntro(config.data.intro);
    setPoliceTitle(config.data.police.title); setPoliceText(config.data.police.description); setPoliceForm(config.data.policeForm); setPolicePing((config.data.police.pingRoleIds ?? []).join(', '));
    setUnits(config.data.units.map(({ pingRoleIds, ...u }) => ({ ...u, roleId: u.roleId ?? '', channelId: u.channelId ?? '', pingRoles: (pingRoleIds ?? []).join(', ') })));
  }, [config.data]);
  const save = useMutation({
    mutationFn: () => api<Config>('/qualifications/config', { method: 'PUT', body: {
      title, intro, police: { title: policeTitle, description: policeText, pingRoleIds: roleIds(policePing) }, policeForm,
      units: units.map(({ isNew: _n, pingRoles, ...u }) => ({ ...u, roleId: u.roleId?.trim() ?? '', channelId: u.channelId?.trim() ?? '', pingRoleIds: roleIds(pingRoles) })),
    } }),
    onSuccess: () => { setErr(undefined); setMsg('Saved. Questions apply to new applications right away; post the panels again in Discord (/bewerbungspanel, /qualipanel) to show changed texts or units.'); void qc.invalidateQueries({ queryKey: ['quali-config'] }); }, onError,
  });
  const patch = (i: number, p: Partial<DraftUnit>) => setUnits(units.map((u, j) => (j === i ? { ...u, ...p } : u)));

  return (
    <>
      <PageHeader title="Qualifications" subtitle="Applications for SEK, Flugstaffel, Ausbilder … from the Discord panel (/qualipanel). Setup: questions and panel texts of all applications." />
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <Tabs tabs={tabs} active={tab} onChange={(t) => { setTab(t); setMsg(undefined); }} />
      <div className="mt-4">
        {tab === 'Applications' && (
          <>
            {only && <p className="mb-3 text-sm">Showing one application from Discord. <Link className="text-primary underline" to="/qualifications">Show all</Link></p>}
            <div className={only ? 'hidden' : 'mb-3 flex flex-wrap gap-2'}>
              <div className="w-52"><Select aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">All units</option>
                {(config.data?.units ?? []).map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}
              </Select></div>
              <div className="w-40"><Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="OPEN">Open</option><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option><option value="">All</option>
              </Select></div>
            </div>
            {apps.isLoading ? <SkeletonRows /> : apps.error ? <ErrorState error={apps.error} onRetry={() => void apps.refetch()} /> : !shown?.length ? <EmptyState text="No applications." hint="Applications arrive via the Discord panel (/qualipanel)." /> : (
              <div className="grid gap-3">{shown.map((a) => (
                <Card key={a.id} title={<span>{a.unitName} · {a.number} <StatusBadge status={a.status} /></span>} actions={a.status === 'OPEN' && decideAllowed && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, status: 'ACCEPTED' })}>Accept</Button>
                    <Button size="sm" variant="danger" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, status: 'REJECTED' })}>Reject</Button>
                  </div>
                )}>
                  <p className="mb-2 text-sm">Discord: <strong>{a.discordName}</strong> <span className="text-xs text-muted">({a.discordId})</span>{a.linkedName ? <> · user <strong>{a.linkedName}</strong></> : <span className="text-muted"> · not linked to a user</span>}</p>
                  <ol className="grid gap-2 text-sm">{a.answers.map((x, i) => (
                    <li key={i}><p className="text-xs text-muted">{i + 1}. {x.question}</p><p className="whitespace-pre-wrap">{x.answer}</p></li>
                  ))}</ol>
                  {a.decisionReason && <p className="mt-2 text-sm"><span className="text-xs text-muted">Reason sent to applicant:</span> {a.decisionReason}</p>}
                  <p className="mt-2 text-xs text-muted">Submitted {fmt(a.createdAt)}{a.durationSec !== null && ` · filled in within ${Math.floor(a.durationSec / 60)} min ${a.durationSec % 60} s`}{a.decidedAt && ` · decided ${fmt(a.decidedAt)} by ${a.decidedByName}`}</p>
                </Card>
              ))}</div>
            )}
          </>
        )}
        {tab === 'Setup' && manage && (config.isLoading ? <SkeletonRows /> : config.error ? <ErrorState error={config.error} onRetry={() => void config.refetch()} /> : (
          <div className="grid gap-4">
            <Card title="Bewerbung bei EN Polizei (/bewerbung, /bewerbungspanel, web page /apply)">
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Panel title">{(id) => <Input id={id} value={policeTitle} maxLength={100} onChange={(e) => setPoliceTitle(e.target.value)} />}</Field>
                  <Field label="Panel text (Discord markdown allowed)">{(id) => <Textarea id={id} rows={3} value={policeText} maxLength={1500} onChange={(e) => setPoliceText(e.target.value)} />}</Field>
                </div>
                <Field label="Ping roles for new applications (Discord role IDs, comma-separated)" hint="Mentioned above the application in the channel, e.g. @Personalabteilung.">{(id) => <Input id={id} value={policePing} onChange={(e) => setPolicePing(e.target.value)} placeholder="123456789012345678" />}</Field>
                <p className="text-xs text-muted">The bot always asks for the Roblox username first – no need to add it.</p>
                <FormQuestionsEditor value={policeForm} onChange={setPoliceForm} />
              </div>
            </Card>
            <Card title="Qualifications panel (/qualipanel)">
              <div className="grid gap-3">
                <Field label="Panel title">{(id) => <Input id={id} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}</Field>
                <Field label="Intro text (Discord markdown allowed)">{(id) => <Textarea id={id} value={intro} maxLength={1500} onChange={(e) => setIntro(e.target.value)} />}</Field>
              </div>
            </Card>
            {units.map((u, i) => (
              <Card key={i} title={u.name || 'New unit'} actions={<Button size="sm" variant="ghost" disabled={units.length <= 1} onClick={() => setUnits(units.filter((_, j) => j !== i))}>Remove</Button>}>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Name">{(id) => <Input id={id} value={u.name} maxLength={60} onChange={(e) => patch(i, { name: e.target.value })} />}</Field>
                  <Field label="Key (internal, a-z 0-9 - _)" hint={u.key === 'sek' ? 'Accepted SEK applicants also join the SEK roster.' : undefined}>{(id) => <Input id={id} value={u.key} disabled={!u.isNew} maxLength={24} onChange={(e) => patch(i, { key: e.target.value.toLowerCase() })} />}</Field>
                  <Field label="Discord role ID given on acceptance (optional)">{(id) => <Input id={id} inputMode="numeric" value={u.roleId ?? ''} onChange={(e) => patch(i, { roleId: e.target.value })} placeholder="123456789012345678" />}</Field>
                  <Field label="Discord channel ID for incoming applications (optional)" hint="e.g. #flugstaffel-bewerbungen – empty = Qualifications channel from Settings">{(id) => <Input id={id} inputMode="numeric" value={u.channelId ?? ''} onChange={(e) => patch(i, { channelId: e.target.value })} placeholder="123456789012345678" />}</Field>
                  <Field label="Description (shown in the panel)">{(id) => <Textarea id={id} rows={3} maxLength={600} value={u.description} onChange={(e) => patch(i, { description: e.target.value })} />}</Field>
                </div>
                <div className="mt-3"><Field label="Ping roles for new applications (Discord role IDs, comma-separated)" hint="Mentioned above the application in the channel, e.g. @Staffelkommandant.">{(id) => <Input id={id} value={u.pingRoles} onChange={(e) => patch(i, { pingRoles: e.target.value })} placeholder="123456789012345678" />}</Field></div>
                <div className="mt-3"><FormQuestionsEditor value={u.questions} onChange={(q) => patch(i, { questions: q })} /></div>
              </Card>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={units.length >= 10} onClick={() => setUnits([...units, { key: '', name: '', description: '', roleId: '', channelId: '', pingRoles: '', questions: [{ key: 'frage1', label: '', type: 'TEXT', required: true, minLength: 0, maxLength: 1000, options: [], multiple: false }], isNew: true }])}>Add unit</Button>
              <Button disabled={save.isPending} onClick={() => { setMsg(undefined); save.mutate(); }}>Save</Button>
              {msg && <span className="text-sm text-muted">{msg}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
