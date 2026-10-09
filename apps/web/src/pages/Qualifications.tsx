import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAutosaveDraft } from '../lib/autosave';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { useAuth } from '../lib/auth';
import type { FormField } from '@enrp/shared';
import { FormQuestionsEditor } from '../components/FormQuestionsEditor';
import { ApplicationActions } from '../components/DecisionButtons';
import { ApplicationSettingsEditor, defaultAppSettings, withDefaults, type AppCommon } from '../components/ApplicationSettings';
import { useServer } from '../lib/guilds';
import { ServerScope } from './Applications';
import { SubmissionCard } from '../components/Submission';
import { Button, Card, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, Tabs, Textarea } from '../components/ui';

interface Unit extends Partial<AppCommon> { key: string; name: string; description: string; roleId?: string; questions: FormField[] }
interface Config { own?: boolean; title: string; intro: string; units: Unit[]; police: { title: string; description: string; pingRoleIds?: string[] }; policeForm: FormField[] }
interface Application {
  id: string; number: string; unit: string; unitName: string; discordId: string; discordName: string; linkedName: string | null;
  answers: { question: string; answer: string }[]; status: string; createdAt: string; decidedAt: string | null; decidedByName: string | null;
  decisionReason: string | null; durationSec: number | null; guildId?: string | null; avatar?: string | null;
}
type DraftUnit = Unit & AppCommon & { isNew?: boolean };
const newQuestion = (): FormField => ({ key: 'frage1', label: '', type: 'TEXT', required: true, minLength: 0, maxLength: 1000, options: [], multiple: false });

/** Qualifikationen (SEK, Flugstaffel, Ausbilder …): Bewerbungen aus dem Discord-Panel entscheiden und Einheiten/Fragen einrichten. */
export function Qualifications() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = can('qualifications.manage'), decideAllowed = can('qualifications.decide');
  const tabs = ['Bewerbungen', ...(manage ? ['Einrichtung'] : [])];
  const [tab, setTab] = useState('Bewerbungen');
  // „Im Dashboard ansehen“ aus Discord: ?id=<Bewerbung> zeigt genau diese Bewerbung
  const [search] = useSearchParams();
  const only = search.get('id');
  const [unit, setUnit] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [err, setErr] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const onError = (e: unknown) => setErr(errText(e));
  const [server] = useServer();
  const config = useQuery({ queryKey: ['quali-config', server], queryFn: () => api<Config>('/qualifications/config', { query: { guildId: server } }) });
  const params = new URLSearchParams({ ...(unit ? { unit } : {}), ...(status && !only ? { status } : {}), ...(server && !only ? { guildId: server } : {}) });
  const apps = useQuery({ queryKey: ['quali-apps', unit, only ? '' : status, server], queryFn: () => api<Application[]>(`/qualifications/applications?${params}`), enabled: tab === 'Bewerbungen' });
  const shown = only ? (apps.data ?? []).filter((a) => a.id === only) : apps.data;
  const decide = useMutation({
    mutationFn: (v: { id: string; status: string; reason?: string }) => api(`/qualifications/applications/${v.id}/decision`, { method: 'POST', body: { status: v.status, ...(v.reason ? { reason: v.reason } : {}) } }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['quali-apps'] }); }, onError,
  });

  // ---- Setup ----
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [units, setUnits] = useState<DraftUnit[]>([]);
  // aus welchem geladenen Stand der Entwurf stammt – erst danach automatisch speichern (sonst speichert schon das Öffnen)
  const [loadedFrom, setLoadedFrom] = useState<Config>();
  useEffect(() => {
    if (!config.data) return;
    setLoadedFrom(config.data);
    setTitle(config.data.title); setIntro(config.data.intro);
    // die frühere einzelne „Rolle bei Annahme“ wird zu den Accepted Roles
    setUnits(config.data.units.map((u) => {
      const settings = withDefaults(u.settings);
      if (u.roleId && !settings.roles.accepted.includes(u.roleId)) settings.roles.accepted = [u.roleId, ...settings.roles.accepted];
      return { ...u, roleId: '', enabled: u.enabled ?? true, channelId: u.channelId ?? '', acceptedChannelId: u.acceptedChannelId ?? '', deniedChannelId: u.deniedChannelId ?? '', pingRoleIds: u.pingRoleIds ?? [], settings };
    }));
  }, [config.data]);
  const save = useMutation({
    mutationFn: () => api<Config>('/qualifications/config', { method: 'PUT', query: { guildId: server }, body: {
      // die Polizei-Bewerbung wird unter „Applications → Setup“ bearbeitet und hier unverändert mitgeschickt
      title, intro, police: config.data!.police,
      units: units.map(({ isNew: _n, ...u }) => u),
    } }),
    onSuccess: () => { setErr(undefined); setMsg('Gespeichert. Fragen gelten sofort für neue Bewerbungen; poste das Panel in Discord erneut (/qualipanel), damit geänderte Texte oder Einheiten angezeigt werden.'); void qc.invalidateQueries({ queryKey: ['quali-config'] }); }, onError,
  });
  // automatisch speichern – je Server getrennt; unvollständige Einheiten (ohne Name/Schlüssel/Frage) bleiben lokal
  const qDraft = useMemo(() => (config.data && loadedFrom === config.data ? { title, intro, units } : undefined), [title, intro, units, config.data, loadedFrom]);
  useAutosaveDraft(config.data && can('qualifications.manage') ? `quali:setup:${server || 'all'}` : null, qDraft, (d) => (d.units.every((u) => u.name.trim() && u.questions.length) ? { method: 'PUT', path: `/qualifications/config${server ? `?guildId=${server}` : ''}`, body: { title: d.title, intro: d.intro, police: config.data!.police, units: d.units.map(({ isNew: _n, ...u }) => u) }, label: 'Qualifikationen' } : null), 1500);
  const patch = (i: number, p: Partial<DraftUnit>) => setUnits(units.map((u, j) => (j === i ? { ...u, ...p } : u)));

  return (
    <>
      <PageHeader title="Qualifikationen" subtitle="Bewerbungen für SEK, Flugstaffel, Ausbilder … aus dem Discord-Panel (/qualipanel). Einrichtung: Einheiten, Panel-Texte und Fragen. (Polizei-Bewerbungen: Organisation → Bewerbungen.)" />
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <Tabs tabs={tabs} active={tab} onChange={(t) => { setTab(t); setMsg(undefined); }} />
      <div className="mt-4">
        {tab === 'Bewerbungen' && (
          <>
            {only && <p className="mb-3 text-sm">Es wird eine Bewerbung aus Discord angezeigt. <Link className="text-primary underline" to="/qualifications">Alle anzeigen</Link></p>}
            <div className={only ? 'hidden' : 'mb-3 flex flex-wrap gap-2'}>
              <div className="w-52"><Select aria-label="Einheit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">Alle Einheiten</option>
                {(config.data?.units ?? []).map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}
              </Select></div>
              <div className="w-40"><Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="OPEN">Offen</option><option value="ACCEPTED">Angenommen</option><option value="REJECTED">Abgelehnt</option><option value="WITHDRAWN">Zurückgezogen</option><option value="">Alle</option>
              </Select></div>
            </div>
            {apps.isLoading ? <SkeletonRows /> : apps.error ? <ErrorState error={apps.error} onRetry={() => void apps.refetch()} /> : !shown?.length ? <EmptyState text="Keine Bewerbungen." hint="Bewerbungen kommen über das Discord-Panel (/qualipanel)." /> : (
              <div className="grid gap-3">{shown.map((a) => (
                <SubmissionCard key={a.id} id={a.id} defaultOpen={!!only} name={a.discordName} appName={a.unitName} status={a.status} discordId={a.discordId} avatar={a.avatar} guildId={a.guildId} createdAt={a.createdAt} answers={a.answers}
                  details={<>
                    <p className="text-sm">{a.number}{a.linkedName ? <> · Benutzer <strong>{a.linkedName}</strong></> : <span className="text-muted"> · nicht mit einem Benutzer verknüpft</span>}</p>
                    {a.decisionReason && <p className="text-sm"><span className="text-xs text-muted">Begründung an Bewerber:</span> {a.decisionReason}</p>}
                    <p className="text-xs text-muted">{a.durationSec !== null && `Ausgefüllt in ${Math.floor(a.durationSec / 60)} min ${a.durationSec % 60} s`}{a.decidedAt && ` · entschieden ${fmt(a.decidedAt)} von ${a.decidedByName}`}</p>
                  </>}
                  actions={<ApplicationActions open={a.status === 'OPEN'} canDecide={decideAllowed} busy={decide.isPending} onDecide={(st, reason) => decide.mutate({ id: a.id, status: st, reason })}
                    discordId={a.discordId} name={a.discordName} ticketPath={`/qualifications/applications/${a.id}/ticket`} />} />
              ))}</div>
            )}
          </>
        )}
        {tab === 'Einrichtung' && manage && (config.isLoading ? <SkeletonRows /> : config.error ? <ErrorState error={config.error} onRetry={() => void config.refetch()} /> : (
          <div className="grid gap-4">
            <ServerScope own={config.data?.own} onReset={() => void qc.invalidateQueries({ queryKey: ['quali-config'] })} />
            <Card title="Qualifikations-Panel (/qualipanel)">
              <div className="grid gap-3">
                <Field label="Panel-Titel">{(id) => <Input id={id} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}</Field>
                <Field label="Einleitungstext (Discord-Markdown erlaubt)">{(id) => <Textarea id={id} value={intro} maxLength={1500} onChange={(e) => setIntro(e.target.value)} />}</Field>
              </div>
            </Card>
            {units.map((u, i) => (
              <Card key={i} title={u.name || 'Neue Einheit'} actions={<Button size="sm" variant="ghost" disabled={units.length <= 1} onClick={() => setUnits(units.filter((_, j) => j !== i))}>Einheit entfernen</Button>}>
                <div className="mb-4 grid gap-3 md:grid-cols-2">
                  <Field label="Schlüssel (intern, a-z 0-9 - _)">{(id) => <Input id={id} value={u.key} disabled={!u.isNew} maxLength={24} onChange={(e) => patch(i, { key: e.target.value.toLowerCase() })} />}</Field>
                  <Field label="Beschreibung (im Panel angezeigt)">{(id) => <Textarea id={id} rows={2} maxLength={600} value={u.description} onChange={(e) => patch(i, { description: e.target.value })} />}</Field>
                </div>
                <ApplicationSettingsEditor value={u} onChange={(p) => patch(i, p)} name={u.name} onName={(v) => patch(i, { name: v })}
                  pendingHint="Neue Bewerbungen werden hier gepostet (leer = Qualifikations-Kanal aus den Einstellungen)."
                  questions={<section className="grid gap-2"><h3 className="text-base font-semibold">Fragen</h3><FormQuestionsEditor value={u.questions} onChange={(q) => patch(i, { questions: q })} /></section>} />
              </Card>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={units.length >= 10} onClick={() => setUnits([...units, { key: '', name: '', description: '', roleId: '', enabled: true, channelId: '', acceptedChannelId: '', deniedChannelId: '', pingRoleIds: [], settings: defaultAppSettings(), questions: [newQuestion()], isNew: true }])}>Einheit hinzufügen</Button>
              <span className="text-sm text-muted">Änderungen werden automatisch gespeichert.</span>
              <Button variant="secondary" disabled={save.isPending} onClick={() => { setMsg(undefined); save.mutate(); }}>Jetzt speichern</Button>
              {msg && <span className="text-sm text-muted">{msg}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
