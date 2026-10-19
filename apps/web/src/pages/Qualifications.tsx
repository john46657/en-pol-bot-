import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAutosaveDraft } from '../lib/autosave';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { useAuth } from '../lib/auth';
import type { FormField } from '@enrp/shared';
import { ApplicationActions } from '../components/DecisionButtons';
import { fromDraft, newUnit, toDraft, UnitsEditor, unitsComplete, type DraftUnit, type Unit } from '../components/UnitsEditor';
import { GuildTag, useServer } from '../lib/guilds';
import { ServerScope } from './Applications';
import { PanelSendBox } from '../components/PanelSendBox';
import { Button, Card, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, StatusBadge, Tabs, Textarea } from '../components/ui';

interface Config { own?: boolean; title: string; intro: string; panelChannelId?: string; qualiPanelPosted?: { channelId: string; messageId: string } | null; units: Unit[]; police: { title: string; description: string; pingRoleIds?: string[] }; policeForm: FormField[] }
interface Application {
  id: string; number: string; unit: string; unitName: string; discordId: string; discordName: string; linkedName: string | null;
  answers: { question: string; answer: string }[]; status: string; createdAt: string; decidedAt: string | null; decidedByName: string | null;
  decisionReason: string | null; durationSec: number | null; guildId?: string | null;
}

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
  const [panelChannel, setPanelChannel] = useState('');
  const [units, setUnits] = useState<DraftUnit[]>([]);
  const [loadedFrom, setLoadedFrom] = useState<Config>(); // aus welchem Server-Stand die Felder befüllt sind
  useEffect(() => {
    if (!config.data) return;
    setLoadedFrom(config.data);
    setTitle(config.data.title); setIntro(config.data.intro); setPanelChannel(config.data.panelChannelId ?? '');
    // hier nur die Einheiten des Qualifikations-Panels; weitere Bewerbungsarten stehen unter Bewerbungen → Einrichtung
    setUnits(config.data.units.filter((u) => (u.panel ?? 'quali') === 'quali').map(toDraft));
  }, [config.data]);
  // Bewerbungsarten des Bewerbungs-Panels unverändert mitschicken
  const allUnits = (mine: DraftUnit[]) => [...mine.map(fromDraft), ...(config.data?.units ?? []).filter((u) => u.panel === 'apply')];
  const save = useMutation({
    mutationFn: () => api<Config>('/qualifications/config', { method: 'PUT', query: { guildId: server }, body: {
      // die Polizei-Bewerbung wird unter „Applications → Setup“ bearbeitet und hier unverändert mitgeschickt
      title, intro, panelChannelId: panelChannel, police: config.data!.police,
      units: allUnits(units),
    } }),
    onSuccess: () => { setErr(undefined); setMsg('Gespeichert. Fragen gelten sofort für neue Bewerbungen; ein bereits aus dem Dashboard gesendetes Panel wird automatisch aktualisiert.'); void qc.invalidateQueries({ queryKey: ['quali-config'] }); }, onError,
  });
  // automatisch speichern – je Server getrennt; unvollständige Einheiten (ohne Name/Schlüssel/Frage) bleiben lokal
  // erst wenn die Felder aus den geladenen Daten befüllt sind – sonst gilt das Befüllen selbst als Änderung und wird beim Öffnen gespeichert
  const qDraft = useMemo(() => (config.data && loadedFrom === config.data ? { title, intro, panelChannel, units } : undefined), [title, intro, panelChannel, units, config.data, loadedFrom]);
  useAutosaveDraft(config.data && can('qualifications.manage') ? `quali:setup:${server || 'all'}` : null, qDraft, (d) => (unitsComplete(d.units) ? { method: 'PUT', path: `/qualifications/config${server ? `?guildId=${server}` : ''}`, body: { title: d.title, intro: d.intro, panelChannelId: d.panelChannel, police: config.data!.police, units: allUnits(d.units) }, label: 'Qualifikationen' } : null), 1500);

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
                <Card key={a.id} title={<span className="flex flex-wrap items-center gap-2">{a.unitName} · {a.number} <StatusBadge status={a.status} /><GuildTag id={a.guildId} /></span>}>
                  <p className="mb-2 text-sm">Discord: <strong>{a.discordName}</strong> <span className="text-xs text-muted">({a.discordId})</span>{a.linkedName ? <> · Benutzer <strong>{a.linkedName}</strong></> : <span className="text-muted"> · nicht mit einem Benutzer verknüpft</span>}</p>
                  <ol className="grid gap-2 text-sm">{a.answers.map((x, i) => (
                    <li key={i}><p className="text-xs text-muted">{i + 1}. {x.question}</p><p className="whitespace-pre-wrap">{x.answer}</p></li>
                  ))}</ol>
                  {a.decisionReason && <p className="mt-2 text-sm"><span className="text-xs text-muted">Begründung an Bewerber:</span> {a.decisionReason}</p>}
                  <p className="mt-2 text-xs text-muted">Eingereicht {fmt(a.createdAt)}{a.durationSec !== null && ` · ausgefüllt in ${Math.floor(a.durationSec / 60)} min ${a.durationSec % 60} s`}{a.decidedAt && ` · entschieden ${fmt(a.decidedAt)} von ${a.decidedByName}`}</p>
                  <ApplicationActions open={a.status === 'OPEN'} canDecide={decideAllowed} busy={decide.isPending} onDecide={(st, reason) => decide.mutate({ id: a.id, status: st, reason })}
                    discordId={a.discordId} name={a.discordName} ticketPath={`/qualifications/applications/${a.id}/ticket`} />
                </Card>
              ))}</div>
            )}
          </>
        )}
        {tab === 'Einrichtung' && manage && (config.isLoading ? <SkeletonRows /> : config.error ? <ErrorState error={config.error} onRetry={() => void config.refetch()} /> : (
          <div className="grid gap-4">
            <ServerScope own={config.data?.own} onReset={() => void qc.invalidateQueries({ queryKey: ['quali-config'] })} />
            <Card title="Qualifikations-Panel in Discord">
              <div className="grid gap-3">
                <Field label="Panel-Titel">{(id) => <Input id={id} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}</Field>
                <Field label="Einleitungstext (Discord-Markdown erlaubt)">{(id) => <Textarea id={id} value={intro} maxLength={1500} onChange={(e) => setIntro(e.target.value)} />}</Field>
              </div>
              <PanelSendBox label="Kanal für das Qualifikations-Panel" channelId={panelChannel} onChannel={setPanelChannel} posted={config.data?.qualiPanelPosted}
                onSend={async (mode) => { await save.mutateAsync(); return api('/qualifications/quali-panel/send', { method: 'POST', query: { guildId: server }, body: { mode } }); }}
                onSent={() => void qc.invalidateQueries({ queryKey: ['quali-config'] })}
                hint="Das Panel bekommt das Auswahlmenü mit allen Einheiten. Alternativ geht weiterhin /qualipanel direkt in Discord." />
            </Card>
            <UnitsEditor units={units} onChange={setUnits} noun="Einheit" minCount={1} pendingHint="Neue Bewerbungen werden hier gepostet (leer = Qualifikations-Kanal aus den Einstellungen)." />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={units.length >= 25} onClick={() => setUnits([...units, newUnit('quali')])}>Einheit hinzufügen</Button>
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
