import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormField } from '@enrp/shared';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { GuildTag } from '../lib/guilds';
import { errText } from '../lib/tickets';
import { DecisionButtons } from '../components/DecisionButtons';
import { FormQuestionsEditor } from '../components/FormQuestionsEditor';
import { ApplicationSettingsEditor, withDefaults, type AppCommon } from '../components/ApplicationSettings';
import { Button, Card, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, StatusBadge, Tabs, Textarea } from '../components/ui';

interface Application {
  id: string; number: string; status: string; robloxUsername: string; robloxUserId: string | null; discordId: string | null; discordName: string | null; guildId: string | null;
  source: string; answers: Record<string, string>; createdAt: string; durationSec: number | null; decisionReason: string | null; decidedByName: string | null;
}
interface PoliceCfg extends Partial<AppCommon> { title: string; description: string; name?: string }
interface QualiConfig { title: string; intro: string; units: unknown[]; police: PoliceCfg; policeForm: FormField[] }
const OPEN = ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'];
const STATUS_FILTER = [['OPEN', 'Open'], ['ACCEPTED', 'Accepted'], ['REJECTED', 'Rejected'], ['WITHDRAWN', 'Withdrawn'], ['', 'All']] as const;

/** Bewerbungen bei EN Polizei – genauso aufgebaut wie Qualifications: Karten mit allen Antworten und Entscheidung, Setup mit Fragen-Editor. */
export function Applications() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = can('qualifications.manage'), decideAllowed = can('applications.decide');
  const tabs = ['Applications', ...(manage ? ['Setup'] : [])];
  const [tab, setTab] = useState('Applications');
  const [status, setStatus] = useState('OPEN');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string>();
  const form = useQuery({ queryKey: ['application-form'], queryFn: () => api<FormField[]>('/applications/form') });
  const list = useQuery({ queryKey: ['applications-cards', status, q, page], queryFn: () => api<Page<Application>>('/applications', { query: { status, q, page, pageSize: 20 } }), enabled: tab === 'Applications' });
  const decide = useMutation({
    mutationFn: (v: { id: string; status: 'ACCEPTED' | 'REJECTED'; reason?: string }) => api(`/applications/${v.id}/discord-decision`, { method: 'POST', body: { status: v.status, ...(v.reason ? { reason: v.reason } : {}) } }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['applications-cards'] }); }, onError: (e) => setErr(errText(e)),
  });
  const labelOf = (key: string) => form.data?.find((f) => f.key === key)?.label ?? key;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Applications" subtitle="Applications to EN Polizei from Discord (/bewerbung, /bewerbungspanel) and the web page /apply. Setup: panel texts and questions." />
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Applications' && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <div className="w-40"><Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{STATUS_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
              <div className="w-56"><Input aria-label="Search" placeholder="Number or Roblox name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
            </div>
            {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data?.items.length ? <EmptyState text="No applications." hint="Applications arrive via Discord (/bewerbungspanel) or the web page /apply." /> : (
              <div className="grid gap-3">{list.data.items.map((a) => (
                <Card key={a.id} title={<span className="flex flex-wrap items-center gap-2">EN Polizei · {a.number} <StatusBadge status={a.status} /><GuildTag id={a.guildId} /></span>}
                  actions={OPEN.includes(a.status) && decideAllowed && <DecisionButtons busy={decide.isPending} onDecide={(s, reason) => decide.mutate({ id: a.id, status: s, reason })} />}>
                  <p className="mb-2 text-sm">
                    Roblox: <strong>{a.robloxUsername}</strong>{a.robloxUserId && <span className="text-xs text-muted"> ({a.robloxUserId})</span>}
                    {a.discordId ? <> · Discord: <strong>{a.discordName ?? a.discordId}</strong> <span className="text-xs text-muted">({a.discordId})</span></> : <span className="text-muted"> · via web form</span>}
                  </p>
                  <ol className="grid gap-2 text-sm">{Object.entries(a.answers ?? {}).map(([k, v], i) => (
                    <li key={k}><p className="text-xs text-muted">{i + 1}. {labelOf(k)}</p><p className="whitespace-pre-wrap">{v}</p></li>
                  ))}</ol>
                  {a.decisionReason && <p className="mt-2 text-sm"><span className="text-xs text-muted">Reason:</span> {a.decisionReason}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>Submitted {fmt(a.createdAt)}{a.durationSec !== null && ` · filled in within ${Math.floor(a.durationSec / 60)} min ${a.durationSec % 60} s`}{a.decidedByName && ` · decided by ${a.decidedByName}`}</span>
                    <Link className="text-primary underline" to={`/applications/${a.id}`}>Details & review steps</Link>
                  </p>
                </Card>
              ))}</div>
            )}
            {pages > 1 && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span className="text-muted">Page {page} / {pages}</span>
                <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
        {tab === 'Setup' && manage && <PoliceSetup />}
      </div>
    </>
  );
}

/** Alles zur Polizei-Bewerbung wie bei Appy: Panel-Texte, Requirements, Fragen, Nachrichten, Rollen, Sonstiges. */
function PoliceSetup() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ['quali-config'], queryFn: () => api<QualiConfig>('/qualifications/config') });
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [common, setCommon] = useState<AppCommon>();
  const [questions, setQuestions] = useState<FormField[]>([]);
  const [msg, setMsg] = useState<string>();
  useEffect(() => {
    if (!config.data) return;
    const p = config.data.police;
    setTitle(p.title); setText(p.description); setName(p.name ?? 'Polizeianwärter'); setQuestions(config.data.policeForm);
    setCommon({ enabled: p.enabled ?? true, channelId: p.channelId ?? '', acceptedChannelId: p.acceptedChannelId ?? '', deniedChannelId: p.deniedChannelId ?? '', pingRoleIds: p.pingRoleIds ?? [], settings: withDefaults(p.settings) });
  }, [config.data]);
  const save = useMutation({
    mutationFn: () => {
      const c = config.data!;
      return api('/qualifications/config', { method: 'PUT', body: { title: c.title, intro: c.intro, units: c.units, police: { title, description: text, name, ...common }, policeForm: questions } });
    },
    onSuccess: () => { setMsg('Saved. Changes apply to new applications right away; post the panel again (/bewerbungspanel) to show a changed text.'); void qc.invalidateQueries({ queryKey: ['quali-config'] }); void qc.invalidateQueries({ queryKey: ['application-form'] }); },
  });
  if (config.error) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  if (config.isLoading || !common) return <SkeletonRows />;
  return (
    <div className="grid gap-4">
      <Card title="Panel in Discord (/bewerbungspanel)">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Panel title">{(id) => <Input id={id} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Panel text (Discord markdown allowed)">{(id) => <Textarea id={id} rows={3} value={text} maxLength={1500} onChange={(e) => setText(e.target.value)} />}</Field>
        </div>
      </Card>
      <Card title="Application settings">
        <ApplicationSettingsEditor value={common} onChange={(p) => setCommon({ ...common, ...p })} name={name} onName={setName}
          pendingHint="New applications are posted here (empty = Applications channel from Settings)."
          questions={<section className="grid gap-2"><h3 className="text-base font-semibold">Questions</h3><p className="text-xs text-muted">The bot always asks for the Roblox username first – no need to add it.</p><FormQuestionsEditor value={questions} onChange={setQuestions} /></section>} />
      </Card>
      {save.error && <p role="alert" className="text-sm text-danger">{errText(save.error)}</p>}
      <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
        <Button disabled={save.isPending} onClick={() => { setMsg(undefined); save.mutate(); }}>Save</Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}
