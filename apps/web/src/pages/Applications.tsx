import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormField } from '@enrp/shared';
import { useAutosaveDraft } from '../lib/autosave';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGuilds, useServer } from '../lib/guilds';
import { errText } from '../lib/tickets';
import { ApplicationActions } from '../components/DecisionButtons';
import { SubmissionCard } from '../components/Submission';
import { FormQuestionsEditor } from '../components/FormQuestionsEditor';
import { ApplicationSettingsEditor, withDefaults, type AppCommon } from '../components/ApplicationSettings';
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, Tabs, Textarea } from '../components/ui';

interface Application {
  id: string; number: string; status: string; robloxUsername: string; robloxUserId: string | null; discordId: string | null; discordName: string | null; guildId: string | null;
  source: string; answers: Record<string, string>; createdAt: string; durationSec: number | null; decisionReason: string | null; decidedByName: string | null; avatar?: string | null;
}
interface PoliceCfg extends Partial<AppCommon> { title: string; description: string; name?: string }
interface QualiConfig { title: string; intro: string; units: unknown[]; police: PoliceCfg; policeForm: FormField[]; own?: boolean }
const OPEN = ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'];
const STATUS_FILTER = [['OPEN', 'Offen'], ['ACCEPTED', 'Angenommen'], ['REJECTED', 'Abgelehnt'], ['WITHDRAWN', 'Zurückgezogen'], ['', 'Alle']] as const;

/** Bewerbungen bei EN Polizei – genauso aufgebaut wie Qualifications: Karten mit allen Antworten und Entscheidung, Setup mit Fragen-Editor. */
export function Applications() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = can('qualifications.manage'), decideAllowed = can('applications.decide');
  const tabs = ['Bewerbungen', ...(manage ? ['Einrichtung'] : [])];
  const [tab, setTab] = useState('Bewerbungen');
  const [status, setStatus] = useState('OPEN');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string>();
  const [server] = useServer();
  const form = useQuery({ queryKey: ['application-form', server], queryFn: () => api<FormField[]>('/applications/form', { query: { guildId: server } }) });
  const list = useQuery({ queryKey: ['applications-cards', status, q, page, server], queryFn: () => api<Page<Application>>('/applications', { query: { status, q, page, pageSize: 20, guildId: server } }), enabled: tab === 'Bewerbungen' });
  const decide = useMutation({
    mutationFn: (v: { id: string; status: 'ACCEPTED' | 'REJECTED'; reason?: string }) => api(`/applications/${v.id}/discord-decision`, { method: 'POST', body: { status: v.status, ...(v.reason ? { reason: v.reason } : {}) } }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['applications-cards'] }); }, onError: (e) => setErr(errText(e)),
  });
  // Name der Polizei-Bewerbung (Einrichtung → „Name der Bewerbung“) für „…s Bewerbung für 'Polizeianwärter'“
  const quali = useQuery({ queryKey: ['quali-config', server], queryFn: () => api<QualiConfig>('/qualifications/config', { query: { guildId: server } }), enabled: can('qualifications.view') });
  const policeName = quali.data?.police.name ?? 'Polizeianwärter';
  const labelOf = (key: string) => form.data?.find((f) => f.key === key)?.label ?? key;
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Bewerbungen" subtitle="Bewerbungen bei EN Polizei über Discord (/bewerbung, /bewerbungspanel) und die Webseite /apply. Einrichtung: Panel-Texte und Fragen." actions={<Link to="/analytics?tab=bewerbungen"><Button variant="secondary">📊 Statistik</Button></Link>} />
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Bewerbungen' && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <div className="w-40"><Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{STATUS_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
              <div className="w-56"><Input aria-label="Suchen" placeholder="Nummer oder Roblox-Name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
            </div>
            {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data?.items.length ? <EmptyState text="Keine Bewerbungen." hint="Bewerbungen kommen über Discord (/bewerbungspanel) oder die Webseite /apply." /> : (
              <div className="grid gap-3">{list.data.items.map((a) => (
                <SubmissionCard key={a.id} id={a.id} name={a.discordName ?? a.robloxUsername} appName={policeName} status={a.status} discordId={a.discordId} avatar={a.avatar} guildId={a.guildId} createdAt={a.createdAt}
                  answers={Object.entries(a.answers ?? {}).map(([k, v]) => ({ question: labelOf(k), answer: v }))}
                  details={<>
                    <p className="text-sm">{a.number} · Roblox: <strong>{a.robloxUsername}</strong>{a.robloxUserId && <span className="text-xs text-muted"> ({a.robloxUserId})</span>}{!a.discordId && <span className="text-muted"> · über Webformular</span>}</p>
                    {a.decisionReason && <p className="text-sm"><span className="text-xs text-muted">Begründung:</span> {a.decisionReason}</p>}
                    <p className="text-xs text-muted">{a.durationSec !== null && `Ausgefüllt in ${Math.floor(a.durationSec / 60)} min ${a.durationSec % 60} s`}{a.decidedByName && ` · entschieden von ${a.decidedByName}`}</p>
                  </>}
                  actions={<ApplicationActions open={OPEN.includes(a.status)} canDecide={decideAllowed} busy={decide.isPending} onDecide={(s, reason) => decide.mutate({ id: a.id, status: s, reason })}
                    discordId={a.discordId} name={a.discordName ?? a.robloxUsername} ticketPath={`/applications/${a.id}/ticket`} detailsTo={`/applications/${a.id}`} />} />
              ))}</div>
            )}
            {pages > 1 && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button>
                <span className="text-muted">Seite {page} / {pages}</span>
                <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button>
              </div>
            )}
          </>
        )}
        {tab === 'Einrichtung' && manage && <PoliceSetup />}
      </div>
    </>
  );
}

/** Alles zur Polizei-Bewerbung wie bei Appy: Panel-Texte, Requirements, Fragen, Nachrichten, Rollen, Sonstiges. */
function PoliceSetup() {
  const qc = useQueryClient();
  const [server] = useServer();
  const config = useQuery({ queryKey: ['quali-config', server], queryFn: () => api<QualiConfig>('/qualifications/config', { query: { guildId: server } }) });
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
      return api('/qualifications/config', { method: 'PUT', query: { guildId: server }, body: { title: c.title, intro: c.intro, units: c.units, police: { title, description: text, name, ...common }, policeForm: questions } });
    },
    onSuccess: () => { setMsg('Gespeichert. Änderungen gelten sofort für neue Bewerbungen; poste das Panel erneut (/bewerbungspanel), damit ein geänderter Text angezeigt wird.'); void qc.invalidateQueries({ queryKey: ['quali-config'] }); void qc.invalidateQueries({ queryKey: ['application-form'] }); },
  });
  // automatisch speichern – für den gewählten Server (Server laufen getrennt)
  const draft = useMemo(() => (common ? { title, text, name, common, questions } : undefined), [title, text, name, common, questions]);
  useAutosaveDraft(config.data ? `app:setup:${server || 'all'}` : null, draft, (d) => {
    const c = config.data!;
    return { method: 'PUT', path: `/qualifications/config${server ? `?guildId=${server}` : ''}`, body: { title: c.title, intro: c.intro, units: c.units, police: { title: d.title, description: d.text, name: d.name, ...d.common }, policeForm: d.questions }, label: 'Bewerbungs-Einstellungen' };
  }, 1500);
  if (config.error) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  if (config.isLoading || !common) return <SkeletonRows />;
  return (
    <div className="grid gap-4">
      <ServerScope own={config.data?.own} onReset={() => void qc.invalidateQueries({ queryKey: ['quali-config'] })} />
      <Card title="Panel in Discord (/bewerbungspanel)">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Panel-Titel">{(id) => <Input id={id} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Panel-Text (Discord-Markdown erlaubt)">{(id) => <Textarea id={id} rows={3} value={text} maxLength={1500} onChange={(e) => setText(e.target.value)} />}</Field>
        </div>
      </Card>
      <Card title="Bewerbungs-Einstellungen">
        <ApplicationSettingsEditor value={common} onChange={(p) => setCommon({ ...common, ...p })} name={name} onName={setName}
          pendingHint="Neue Bewerbungen werden hier gepostet (leer = Bewerbungs-Kanal aus den Einstellungen)."
          questions={<section className="grid gap-2"><h3 className="text-base font-semibold">Fragen</h3><p className="text-xs text-muted">Der Bot fragt immer zuerst nach dem Roblox-Benutzernamen – du musst das nicht hinzufügen.</p><FormQuestionsEditor value={questions} onChange={setQuestions} /></section>} />
      </Card>
      {save.error && <p role="alert" className="text-sm text-danger">{errText(save.error)}</p>}
      <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
        <span className="text-sm text-muted">Änderungen werden automatisch gespeichert.</span>
        <Button variant="secondary" disabled={save.isPending} onClick={() => { setMsg(undefined); save.mutate(); }}>Jetzt speichern</Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}

/** Hinweis oben im Setup: für welchen Server gerade eingestellt wird (Dropdown oben links). */
export function ServerScope({ own, onReset }: { own?: boolean; onReset: () => void }) {
  const [server] = useServer();
  const guilds = useGuilds();
  const name = guilds.data?.find((g) => g.id === server)?.name;
  const reset = useMutation({ mutationFn: () => api('/qualifications/config', { method: 'DELETE', query: { guildId: server } }), onSuccess: onReset });
  if ((guilds.data?.length ?? 0) < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
      {server ? <>
        <span>Einstellungen für den Server <b>{name ?? server}</b>.</span>
        {own ? <>
          <span className="text-muted">Dieser Server hat eigene Einstellungen.</span>
          <Button size="sm" variant="secondary" disabled={reset.isPending} onClick={() => reset.mutate()}>Wieder gemeinsame Einstellungen nutzen</Button>
        </> : <span className="text-muted">Nutzt aktuell die gemeinsamen Einstellungen – beim Speichern werden eigene Einstellungen für diesen Server angelegt.</span>}
      </> : <span><b>Alle Server:</b> Das sind die gemeinsamen Einstellungen, die jeder Server ohne eigene Einstellungen nutzt. Wähle oben links einen Server, um ihn separat einzurichten.</span>}
    </div>
  );
}
