import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { useAuth } from '../lib/auth';
import type { FormField } from '@enrp/shared';
import { FormQuestionsEditor } from '../components/FormQuestionsEditor';
import { DecisionButtons } from '../components/DecisionButtons';
import { ApplicationSettingsEditor, defaultAppSettings, withDefaults, type AppCommon } from '../components/ApplicationSettings';
import { GuildTag } from '../lib/guilds';
import { Button, Card, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, StatusBadge, Tabs, Textarea } from '../components/ui';

interface Unit extends Partial<AppCommon> { key: string; name: string; description: string; roleId?: string; questions: FormField[] }
interface Config { title: string; intro: string; units: Unit[]; police: { title: string; description: string; pingRoleIds?: string[] }; policeForm: FormField[] }
interface Application {
  id: string; number: string; unit: string; unitName: string; discordId: string; discordName: string; linkedName: string | null;
  answers: { question: string; answer: string }[]; status: string; createdAt: string; decidedAt: string | null; decidedByName: string | null;
  decisionReason: string | null; durationSec: number | null; guildId?: string | null;
}
type DraftUnit = Unit & AppCommon & { isNew?: boolean };
const newQuestion = (): FormField => ({ key: 'frage1', label: '', type: 'TEXT', required: true, minLength: 0, maxLength: 1000, options: [], multiple: false });

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
    mutationFn: (v: { id: string; status: string; reason?: string }) => api(`/qualifications/applications/${v.id}/decision`, { method: 'POST', body: { status: v.status, ...(v.reason ? { reason: v.reason } : {}) } }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['quali-apps'] }); }, onError,
  });

  // ---- Setup ----
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [units, setUnits] = useState<DraftUnit[]>([]);
  useEffect(() => {
    if (!config.data) return;
    setTitle(config.data.title); setIntro(config.data.intro);
    // die frühere einzelne „Rolle bei Annahme“ wird zu den Accepted Roles
    setUnits(config.data.units.map((u) => {
      const settings = withDefaults(u.settings);
      if (u.roleId && !settings.roles.accepted.includes(u.roleId)) settings.roles.accepted = [u.roleId, ...settings.roles.accepted];
      return { ...u, roleId: '', enabled: u.enabled ?? true, channelId: u.channelId ?? '', acceptedChannelId: u.acceptedChannelId ?? '', deniedChannelId: u.deniedChannelId ?? '', pingRoleIds: u.pingRoleIds ?? [], settings };
    }));
  }, [config.data]);
  const save = useMutation({
    mutationFn: () => api<Config>('/qualifications/config', { method: 'PUT', body: {
      // die Polizei-Bewerbung wird unter „Applications → Setup“ bearbeitet und hier unverändert mitgeschickt
      title, intro, police: config.data!.police,
      units: units.map(({ isNew: _n, ...u }) => u),
    } }),
    onSuccess: () => { setErr(undefined); setMsg('Saved. Questions apply to new applications right away; post the panel again in Discord (/qualipanel) to show changed texts or units.'); void qc.invalidateQueries({ queryKey: ['quali-config'] }); }, onError,
  });
  const patch = (i: number, p: Partial<DraftUnit>) => setUnits(units.map((u, j) => (j === i ? { ...u, ...p } : u)));

  return (
    <>
      <PageHeader title="Qualifications" subtitle="Applications for SEK, Flugstaffel, Ausbilder … from the Discord panel (/qualipanel). Setup: units, panel texts and questions. (Police applications: Organisation → Applications.)" />
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
                <Card key={a.id} title={<span className="flex flex-wrap items-center gap-2">{a.unitName} · {a.number} <StatusBadge status={a.status} /><GuildTag id={a.guildId} /></span>}
                  actions={a.status === 'OPEN' && decideAllowed && <DecisionButtons busy={decide.isPending} onDecide={(st, reason) => decide.mutate({ id: a.id, status: st, reason })} />}>
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
            <Card title="Qualifications panel (/qualipanel)">
              <div className="grid gap-3">
                <Field label="Panel title">{(id) => <Input id={id} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}</Field>
                <Field label="Intro text (Discord markdown allowed)">{(id) => <Textarea id={id} value={intro} maxLength={1500} onChange={(e) => setIntro(e.target.value)} />}</Field>
              </div>
            </Card>
            {units.map((u, i) => (
              <Card key={i} title={u.name || 'New unit'} actions={<Button size="sm" variant="ghost" disabled={units.length <= 1} onClick={() => setUnits(units.filter((_, j) => j !== i))}>Remove unit</Button>}>
                <div className="mb-4 grid gap-3 md:grid-cols-2">
                  <Field label="Key (internal, a-z 0-9 - _)" hint={u.key === 'sek' ? 'Accepted SEK applicants also join the SEK roster.' : undefined}>{(id) => <Input id={id} value={u.key} disabled={!u.isNew} maxLength={24} onChange={(e) => patch(i, { key: e.target.value.toLowerCase() })} />}</Field>
                  <Field label="Description (shown in the panel)">{(id) => <Textarea id={id} rows={2} maxLength={600} value={u.description} onChange={(e) => patch(i, { description: e.target.value })} />}</Field>
                </div>
                <ApplicationSettingsEditor value={u} onChange={(p) => patch(i, p)} name={u.name} onName={(v) => patch(i, { name: v })}
                  pendingHint="New applications are posted here (empty = Qualifications channel from Settings)."
                  questions={<section className="grid gap-2"><h3 className="text-base font-semibold">Questions</h3><FormQuestionsEditor value={u.questions} onChange={(q) => patch(i, { questions: q })} /></section>} />
              </Card>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={units.length >= 10} onClick={() => setUnits([...units, { key: '', name: '', description: '', roleId: '', enabled: true, channelId: '', acceptedChannelId: '', deniedChannelId: '', pingRoleIds: [], settings: defaultAppSettings(), questions: [newQuestion()], isNew: true }])}>Add unit</Button>
              <Button disabled={save.isPending} onClick={() => { setMsg(undefined); save.mutate(); }}>Save</Button>
              {msg && <span className="text-sm text-muted">{msg}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
