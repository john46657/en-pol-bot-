import { useEffect, useState, useMemo, type ReactNode } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormField } from '@enrp/shared';
import { useAutosaveDraft } from '../lib/autosave';
import { api, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { GuildTag, useGuilds, useServer } from '../lib/guilds';
import { errText } from '../lib/tickets';
import { ApplicationActions } from '../components/DecisionButtons';
import { Avatar } from '../components/TeamRoster';
import { ago } from '../lib/cad';
import { FormQuestionsEditor } from '../components/FormQuestionsEditor';
import { ApplicationSettingsEditor, withDefaults, type AppCommon } from '../components/ApplicationSettings';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, fmt, Input, PageHeader, Select, SkeletonRows, StatusBadge, Tabs, Textarea } from '../components/ui';

/** Eine Zeile der gemeinsamen Liste: Polizei-Bewerbung oder Bewerbung für eine Einheit (Flugstaffel, GSG9 …). */
interface InboxRow {
  kind: 'police' | 'qualification'; id: string; number: string; typeKey: string; typeName: string; status: string; discordId: string | null; discordName: string | null;
  robloxUsername: string | null; robloxUserId: string | null; answers: { label: string; value: string }[]; createdAt: string; durationSec: number | null;
  decisionReason: string | null; decidedByName: string | null; guildId: string | null; avatar: string | null;
}
interface Inbox extends Page<InboxRow> { types: { key: string; name: string }[] }
interface PoliceCfg extends Partial<AppCommon> { title: string; description: string; name?: string }
interface QualiConfig { title: string; intro: string; units: unknown[]; police: PoliceCfg; policeForm: FormField[]; own?: boolean }
const OPEN = ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION', 'OPEN'];
const PAGE_SIZES = [10, 20, 50, 100];
const FilterBox = ({ label, children }: { label: string; children: ReactNode }) => <label className="grid w-40 gap-1 text-xs text-muted">{label}{children}</label>;
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
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [pageSize, setPageSize] = useState(20);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [err, setErr] = useState<string>();
  const [server] = useServer();
  const [type, setType] = useState('');
  const [remove, setRemove] = useState<InboxRow>();
  const list = useQuery({ queryKey: ['applications-cards', type, status, q, page, pageSize, order, server], queryFn: () => api<Inbox>('/applications/inbox', { query: { type: type || undefined, status: status || undefined, q: q.trim() || undefined, page, pageSize, order, guildId: server } }), enabled: tab === 'Bewerbungen' });
  const refresh = () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['applications-cards'] }); };
  const decide = useMutation({
    mutationFn: (v: { row: InboxRow; status: 'ACCEPTED' | 'REJECTED'; reason?: string }) => v.row.kind === 'police'
      ? api(`/applications/${v.row.id}/discord-decision`, { method: 'POST', body: { status: v.status, ...(v.reason ? { reason: v.reason } : {}) } })
      : api(`/qualifications/applications/${v.row.id}/decision`, { method: 'POST', body: { status: v.status, ...(v.reason ? { reason: v.reason } : {}) } }),
    onSuccess: refresh, onError: (e) => setErr(errText(e)),
  });
  const del = useMutation({
    mutationFn: (row: InboxRow) => api(row.kind === 'police' ? `/applications/${row.id}` : `/qualifications/applications/${row.id}`, { method: 'DELETE' }),
    onSuccess: () => { setRemove(undefined); refresh(); }, onError: (e) => { setRemove(undefined); setErr(errText(e)); },
  });
  const canDelete = (r: InboxRow) => can(r.kind === 'police' ? 'applications.delete' : 'qualifications.delete');
  const canDecideRow = (r: InboxRow) => (r.kind === 'police' ? decideAllowed : can('qualifications.decide'));
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Bewerbungen" subtitle="Bewerbungen bei EN Polizei über Discord (/bewerbung, /bewerbungspanel) und die Webseite /apply. Einrichtung: Panel-Texte und Fragen." actions={<Link to="/analytics?tab=bewerbungen"><Button variant="secondary">📊 Statistik</Button></Link>} />
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Bewerbungen' && (
          <>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm text-muted">{list.data ? `Zeige ${list.data.items.length} von ${list.data.total} Bewerbungen` : ' '}</p>
              <div className="flex flex-wrap items-end gap-2">
                <FilterBox label="Bewerbung"><Select aria-label="Bewerbung" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">Alle</option>{(list.data?.types ?? []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</Select></FilterBox>
                <FilterBox label="Suchen"><Input aria-label="Suchen" placeholder="Nummer, Discord- oder Roblox-Name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></FilterBox>
                <FilterBox label="Sortierung"><Select aria-label="Sortierung" value={order} onChange={(e) => { setOrder(e.target.value as 'newest' | 'oldest'); setPage(1); }}><option value="newest">Neueste zuerst</option><option value="oldest">Älteste zuerst</option></Select></FilterBox>
                <FilterBox label="Status"><Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{STATUS_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></FilterBox>
                <FilterBox label="Anzahl"><Select aria-label="Anzahl pro Seite" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / Seite</option>)}</Select></FilterBox>
              </div>
            </div>
            {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data?.items.length ? <EmptyState text="Keine Bewerbungen." hint="Bewerbungen kommen über Discord (/bewerbungspanel) oder die Webseite /apply." /> : (
              <div className="grid gap-2">{list.data.items.map((a) => {
                const isOpen = expanded.has(a.id);
                const who = a.discordName ?? a.robloxUsername ?? a.discordId ?? '—';
                return (
                  <div key={`${a.kind}-${a.id}`} className="rounded-lg border border-line bg-panel">
                    <button type="button" aria-expanded={isOpen} onClick={() => toggle(a.id)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-panel-2/50">
                      <Avatar src={a.avatar} name={who} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 font-medium">{who}s Bewerbung für „{a.typeName}“ <StatusBadge status={a.status} /><GuildTag id={a.guildId} /></span>
                        <span className="block truncate text-xs text-muted">{a.discordId ?? 'Webformular'} · {a.number} · {fmt(a.createdAt)} ({ago(a.createdAt)})</span>
                      </span>
                      <ChevronDown size={18} aria-hidden className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="border-t border-line p-3">
                        <p className="mb-2 text-sm">
                          {a.robloxUsername && <>Roblox: <strong>{a.robloxUsername}</strong>{a.robloxUserId && <span className="text-xs text-muted"> ({a.robloxUserId})</span>} · </>}
                          {a.discordId ? <>Discord: <strong>{a.discordName ?? a.discordId}</strong> <span className="text-xs text-muted">({a.discordId})</span></> : <span className="text-muted">über Webformular</span>}
                        </p>
                        <p className="mb-2 text-sm font-semibold">Antworten</p>
                        <ol className="grid gap-2 text-sm">{a.answers.map((x, i) => (
                          <li key={i}><p className="text-xs text-muted">{i + 1}. {x.label}</p><p className="whitespace-pre-wrap rounded-md bg-panel-2 p-2">{x.value || '—'}</p></li>
                        ))}</ol>
                        {a.decisionReason && <p className="mt-2 text-sm"><span className="text-xs text-muted">Begründung:</span> {a.decisionReason}</p>}
                        <p className="mt-2 text-xs text-muted">Eingereicht {fmt(a.createdAt)}{a.durationSec !== null && ` · ausgefüllt in ${Math.floor(a.durationSec / 60)} min ${a.durationSec % 60} s`}{a.decidedByName && ` · entschieden von ${a.decidedByName}`}</p>
                        <ApplicationActions open={OPEN.includes(a.status)} canDecide={canDecideRow(a)} busy={decide.isPending} onDecide={(s, reason) => decide.mutate({ row: a, status: s, reason })}
                          discordId={a.discordId} name={who} ticketPath={a.kind === 'police' ? `/applications/${a.id}/ticket` : `/qualifications/applications/${a.id}/ticket`} detailsTo={a.kind === 'police' ? `/applications/${a.id}` : undefined} />
                        {canDelete(a) && <div className="mt-2 flex justify-end"><Button size="sm" variant="danger" onClick={() => setRemove(a)}><Trash2 size={14} aria-hidden className="mr-1" />Löschen</Button></div>}
                      </div>
                    )}
                  </div>
                );
              })}</div>
            )}
            <ConfirmDialog open={!!remove} danger title="Bewerbung löschen" busy={del.isPending} confirmLabel="Endgültig löschen" onClose={() => setRemove(undefined)} onConfirm={() => remove && del.mutate(remove)}
              message={<>Bewerbung <b>{remove?.number}</b> von <b>{remove?.discordName ?? remove?.robloxUsername}</b> („{remove?.typeName}“) endgültig löschen? Das lässt sich nicht rückgängig machen; im Audit-Log bleibt vermerkt, dass sie gelöscht wurde.</>} />
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
