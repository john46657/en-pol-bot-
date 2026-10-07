import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useGuilds, useServer } from '../../lib/guilds';
import { useSettings } from '../../lib/settings';
import { ChannelPicker, ChannelsPicker, RolePicker, ServersPicker, TagListEditor } from '../../components/DiscordPickers';
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, SkeletonRows } from '../../components/ui';

const TEXT = [['org.name', 'Name der Organisation'], ['org.serverName', 'Servername'], ['org.timezone', 'Zeitzone (IANA)']] as const;
const CHANNELS = [['dispatch', '📡 Leitstellen-Kanal (neue/zugewiesene Einsätze)'], ['wanted', '🚨 Fahndungs-Kanal (neue Fahndungen und Statusänderungen)'], ['announcements', '📢 Ankündigungs-Kanal'], ['applications', 'Bewerbungs-Kanal (Polizei-Bewerbungen mit Antworten + Annehmen/Ablehnen-Buttons – nur für Staff!)'], ['danger', 'Gefahrenstatus-Kanal (Stufenänderungen)'], ['qualifications', 'Qualifikations-Kanal (Anträge aus /qualipanel mit Annehmen/Ablehnen-Buttons)'], ['duty', 'Dienst-Kanal (Nachricht bei jeder Dienststatus-Änderung)'],
  ['teamlist', 'Teamlisten-Kanal (aktualisiert sich selbst, ein Kanal)'], ['tickets', 'Support-Ticket-Kategorie (eine Kategorie)'], ['staffRole', 'Staff-Rolle (sieht Support-Tickets)'], ['radioRole', 'Funk-Rolle (wird mit der Funk-Whitelist vergeben)'], ['dutyRole', 'Im-Dienst-Rolle(n) (im Dienst vergeben, sonst entzogen; mehrere Server: je eine ID, kommagetrennt)'], ['breakRole', 'Pausen-Rolle(n) (optional)'], ['trainingRole', 'Ausbildungs-Rolle(n) (optional)'], ['adminDutyRole', 'Verwaltungsdienst-Rolle(n) (optional)'], ['guildId', 'Server – optional (für Discord-Anmeldung/Mitgliedschaft)']] as const;
/** Rollen-Felder (Auswahl als Rolle) und Felder mit genau einer ID. */
const ROLE_KEYS = new Set(['staffRole', 'radioRole', 'dutyRole', 'breakRole', 'trainingRole', 'adminDutyRole']);
const SINGLE = new Set(['teamlist', 'tickets', 'staffRole', 'radioRole']);
const NUM = [['retention.sessionDays', 'Abgelaufene Sitzungen behalten (Tage)', 1, 365], ['retention.loginHistoryDays', 'Anmeldeverlauf behalten (Tage)', 30, 3650], ['retention.readNotificationDays', 'Gelesene Benachrichtigungen behalten (Tage)', 7, 3650]] as const;

export function Settings() {
  const { can } = useAuth();
  const { q, get, put, isServerValue } = useSettings();
  const [server] = useServer();
  const guilds = useGuilds();
  const [msg, setMsg] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const retention = useMutation({ mutationFn: () => api<Record<string, number>>('/admin/retention/run', { method: 'POST' }), onSuccess: (r) => setMsg(`Bereinigung ausgeführt: ${JSON.stringify(r)}`), onError: (e) => setMsg(e instanceof ApiError ? e.message : 'Fehlgeschlagen') });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const manage = can('settings.manage');
  const val = (k: string) => drafts[k] ?? String(get<unknown>(k) ?? '');
  const edit = (k: string, v: string, save: (v: string) => boolean) => { setDrafts({ ...drafts, [k]: v }); if (manage) save(v); };
  const channels = (get<Record<string, string>>('discord.channels') ?? {});
  const chVal = (k: string) => drafts[`discord.${k}`] ?? String(channels[k] ?? '');
  const setChannel = (k: string, v: string) => {
    const next = { ...drafts, [`discord.${k}`]: v };
    setDrafts(next);
    const all = Object.fromEntries(CHANNELS.map(([c]) => [c, (next[`discord.${c}`] ?? String(channels[c] ?? '')).trim()]).filter(([, x]) => x));
    // nur vollständige IDs speichern (sonst lehnt der Server ab); halbe Eingaben bleiben lokal stehen
    if (manage && Object.values(all).every((x) => /^\d{15,25}(\s*,\s*\d{15,25})*$/.test(String(x)))) put('discord.channels', all, 'Discord-Kanäle');
  };
  const structure = get<{ teams: string[]; offices: string[] }>('team.structure') ?? { teams: [], offices: [] };
  const serverName = server ? guilds.data?.find((g) => g.id === server)?.name ?? server : null;
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Änderungen werden automatisch gespeichert, geprüft und im Audit-Log festgehalten." />
      {msg && <p role="status" className="mb-3 rounded border border-line bg-panel p-2 text-sm">{msg}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Organisation">
          <div className="space-y-3">{TEXT.map(([k, label]) => <Field key={k} label={`${label}${isServerValue(k) ? ` (nur ${serverName})` : ''}`}>{(id) => <Input id={id} value={val(k)} disabled={!manage} maxLength={100} onChange={(e) => edit(k, e.target.value, (v) => { if (v.trim().length >= (k === 'org.timezone' ? 3 : 1)) put(k, v.trim(), label); return true; })} />}</Field>)}
            <Field label="Datumsformat">{(id) => <Select id={id} disabled={!manage} value={val('org.dateFormat') || 'DD.MM.YYYY'} onChange={(e) => put('org.dateFormat', e.target.value, 'Datumsformat')}>{['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].map((f) => <option key={f}>{f}</option>)}</Select>}</Field></div>
        </Card>
        <Card title="Datenaufbewahrung" actions={manage && <Button variant="secondary" size="sm" onClick={() => retention.mutate()} disabled={retention.isPending}>Jetzt ausführen</Button>}>
          <p className="mb-3 text-xs text-muted">Audit-Logs werden bei der Bereinigung nie gelöscht.</p>
          <div className="space-y-3">{NUM.map(([k, label, min, max]) => <Field key={k} label={`${label} (${min}–${max})`}>{(id) => <Input id={id} type="number" min={min} max={max} value={val(k)} disabled={!manage} onChange={(e) => edit(k, e.target.value, (v) => { const n = Number(v); if (Number.isInteger(n) && n >= min && n <= max) put(k, n, label); return true; })} />}</Field>)}</div>
        </Card>
      </div>
      <Card title={`👥 Teamstruktur${serverName ? ` – ${serverName}` : ''}`} className="mt-4">
        <p className="mb-3 text-xs text-muted">{serverName ? `Gilt nur für ${serverName} (Server laufen getrennt). Ohne eigene Werte gilt die gemeinsame Einstellung („Alle Server“).` : 'Gemeinsame Werte für alle Server. Wähle oben links einen Server, um für ihn eigene Werte festzulegen.'} Auswahl in Personalakten und Filter der Teamliste. Werte aus euren Discord-Rollen übernehmen oder selbst eintippen – heißt eine Discord-Rolle wie ein Dienstgrad oder Team, erkennt die Teamliste ihn automatisch.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <div><p className="mb-1 text-xs font-medium text-muted">Teams</p><TagListEditor ariaLabel="Team hinzufügen" disabled={!manage} value={structure.teams} placeholder="z. B. Polizei + Enter" onChange={(v) => put('team.structure', { ...structure, teams: v }, 'Teams')} /></div>
          <div><p className="mb-1 text-xs font-medium text-muted">Dienstgrade (höchster zuerst)</p><TagListEditor ariaLabel="Dienstgrad hinzufügen" ordered disabled={!manage} value={get<string[]>('team.rankOrder') ?? []} placeholder="z. B. Polizeipräsident + Enter" onChange={(v) => put('team.rankOrder', v, 'Dienstgrade')} /></div>
          <div><p className="mb-1 text-xs font-medium text-muted">Büros</p><TagListEditor ariaLabel="Büro hinzufügen" disabled={!manage} value={structure.offices} placeholder="z. B. Verwaltung + Enter" onChange={(v) => put('team.structure', { ...structure, offices: v }, 'Büros')} /></div>
        </div>
      </Card>
      <Card title="Discord-Bot-Kanäle" className="mt-4">
        <p className="mb-3 text-xs text-muted">Kanal aus der Liste wählen – wird automatisch gespeichert. Beispiel: <b>Fahndungs-Kanal</b> = euer Fahndungs-Kanal; jede Fahndung (aus Dashboard oder Discord) wird dort gepostet. Leer = diese Benachrichtigungsart ist deaktiviert (nichts wird eingereiht). Mehrere Kanäle (auch auf verschiedenen Servern): IDs mit Komma trennen. Alle, die den Discord-Kanal lesen können, sehen die Beiträge – nutze Kanäle nur für Staff. Teamliste, Ticket-Kategorie und Staff-/Funk-Rolle nehmen genau eine ID.</p>
        <div className="grid gap-3 md:grid-cols-2">{CHANNELS.map(([k, label]) => (
          <div key={k} className="grid gap-1">
            <p className="text-xs font-medium text-muted">{label}</p>
            {ROLE_KEYS.has(k) ? <RolePicker ariaLabel={label} disabled={!manage} max={SINGLE.has(k) ? 1 : 10} value={chVal(k).split(/[\s,;]+/).filter(Boolean)} onChange={(ids) => setChannel(k, ids.join(', '))} />
              : k === 'tickets' ? <ChannelPicker ariaLabel={label} kind="category" disabled={!manage} value={chVal(k) || null} onChange={(v) => setChannel(k, v ?? '')} />
              : k === 'guildId' ? <ServersPicker ariaLabel={label} disabled={!manage} value={chVal(k)} onChange={(v) => setChannel(k, v)} />
              : <ChannelsPicker ariaLabel={label} disabled={!manage} max={SINGLE.has(k) ? 1 : 10} value={chVal(k)} onChange={(v) => setChannel(k, v)} />}
          </div>
        ))}</div>
      </Card>
      {manage && <SystemNoticeCard />}
      <BotInviteCard />
      <DiscordLoginCard manage={manage} value={get<DiscordLogin>('auth.discord')} onSave={(v) => put('auth.discord', v, 'Discord-Anmeldung')} />
    </>
  );
}

interface DiscordLogin { signup: boolean; requireGuild: boolean; roleMap: { discordRoleId: string; role: string }[]; teamRoleIds?: string[] }

/** „Mit Discord anmelden“: neue Konten, Server-Pflicht, Discord-Rolle → Systemrolle (wird bei jeder Discord-Anmeldung abgeglichen). */
function DiscordLoginCard({ manage, value, onSave }: { manage: boolean; value?: DiscordLogin; onSave: (v: DiscordLogin) => void }) {
  const [d, setDraft] = useState<DiscordLogin>(value ?? { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [] });
  const [team, setTeamText] = useState((value?.teamRoleIds ?? []).join(', '));
  const [loaded, setLoaded] = useState(!!value);
  useEffect(() => { if (value && !loaded) { setDraft(value); setTeamText((value.teamRoleIds ?? []).join(', ')); setLoaded(true); } }, [value, loaded]);
  // automatisch speichern: nur vollständige Zuordnungen und gültige IDs
  const commit = (next: DiscordLogin, teamText: string) => { if (manage) onSave({ ...next, roleMap: next.roleMap.filter((r) => /^\d{15,25}$/.test(r.discordRoleId) && r.role), teamRoleIds: teamText.match(/\d{15,25}/g) ?? [] }); };
  const setD = (next: DiscordLogin) => { setDraft(next); commit(next, team); };
  const setTeam = (t: string) => { setTeamText(t); commit(d, t); };
  const roles = useQuery({ queryKey: ['roles-names'], queryFn: () => api<{ name: string }[]>('/roles') });
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => api<{ discord: boolean }>('/auth/providers') });
  const row = (i: number, p: Partial<DiscordLogin['roleMap'][number]>) => setD({ ...d, roleMap: d.roleMap.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return (
    <Card title="Mit Discord anmelden – Zugang zum Dashboard" className="mt-4">
      <p className="mb-3 text-xs text-muted">
        {providers.data?.discord ? 'Aktiv – Anmeldung nur über Discord (Notfall: PASSWORD_LOGIN=true im Panel). Deine eigene Discord-ID gehört in ADMIN_DISCORD_IDS, damit du immer Admin-Rechte hast.' : 'Noch nicht aktiv (Passwort-Anmeldung ist für die Einrichtung aktiv): Setze ADMIN_DISCORD_IDS (deine Discord-ID) und DISCORD_CLIENT_SECRET (Discord Developer Portal → OAuth2) im Panel und trage die Redirect-URL unten im Developer Portal ein.'}
        {' '}Redirect-URL: <code>{window.location.origin}/api/v1/auth/discord/callback</code>
      </p>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" disabled={!manage} checked={d.signup} onChange={(e) => setD({ ...d, signup: e.target.checked })} />Neue Benutzer können sich mit Discord registrieren (Konto wird bei der ersten Anmeldung erstellt)</label>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={!manage} checked={d.requireGuild} onChange={(e) => setD({ ...d, requireGuild: e.target.checked })} />Nur Mitglieder unseres Discord-Servers dürfen sich anmelden</label>
      </div>
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">Discord-Rollen mit Dashboard-Zugriff (Teamrollen)</h3>
      <div className="max-w-xl"><RolePicker ariaLabel="Teamrollen" disabled={!manage} max={20} value={team.match(/\d{15,25}/g) ?? []} onChange={(ids) => setTeam(ids.join(', '))} /></div>
      <p className="mt-1 text-xs text-muted">Nur Personen mit einer dieser Discord-Rollen können sich anmelden (mehrere Server / Rollen: kommagetrennt). Leer = alle Servermitglieder. Konten in ADMIN_DISCORD_IDS kommen immer rein. Wird bei jeder Anmeldung und danach laufend geprüft (Verlust der Rolle beendet die Sitzung). Discord-Rollen mit Dashboard-Rollen verknüpfen: Rollen &amp; Rechte → Rolle → „Verknüpfte Discord-Rollen“.</p>
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">Discord-Rolle → Systemrolle (bei jeder Discord-Anmeldung abgeglichen)</h3>
      <div className="space-y-2">
        {d.roleMap.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-64"><RolePicker ariaLabel="Discord-Rolle" disabled={!manage} max={1} value={r.discordRoleId ? [r.discordRoleId] : []} onChange={(ids) => row(i, { discordRoleId: ids[0] ?? '' })} /></div>
            <span className="text-muted">→</span>
            <div className="w-full sm:w-56"><Select aria-label="Systemrolle" disabled={!manage} value={r.role} onChange={(e) => row(i, { role: e.target.value })}>
              <option value="">Rolle wählen…</option>
              {(roles.data ?? []).map((x) => <option key={x.name}>{x.name}</option>)}
            </Select></div>
            {manage && <Button variant="ghost" size="sm" onClick={() => setD({ ...d, roleMap: d.roleMap.filter((_, j) => j !== i) })}>Entfernen</Button>}
          </div>
        ))}
        {manage && <Button variant="secondary" size="sm" onClick={() => setD({ ...d, roleMap: [...d.roleMap, { discordRoleId: '', role: '' }] })}>Zuordnung hinzufügen</Button>}
        <p className="text-xs text-muted">Beispiel: Discord-Rolle „Polizei“ → Police Member, „Leitstelle“ → Dispatch. Zugeordnete Rollen werden vergeben, solange die Person die Discord-Rolle hat, und entzogen, wenn sie sie verliert; andere Rollen bleiben unberührt.</p>
      </div>
    </Card>
  );
}

/** Bot auf einen (weiteren) Discord-Server einladen – fertiger Link mit Administrator-Rechten. */
function BotInviteCard() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('discord'), server = params.get('server');
  const invite = useQuery({ queryKey: ['bot-invite'], queryFn: () => api<{ url: string | null }>('/auth/discord/invite') });
  const guilds = useGuilds();
  return (
    <Card title="Discord-Bot auf euren Servern" className="mt-4">
      <div className="grid gap-3 text-sm">
        {result === 'installed' && <p role="status" className="text-success">✅ Bot hinzugefügt{server ? ` zu „${server}“` : ''}. Er erscheint in wenigen Sekunden in der Liste unten.</p>}
        {result === 'install_failed' && <p role="alert" className="text-danger">Bot konnte nicht hinzugefügt werden. Prüfe DISCORD_CLIENT_SECRET und die Redirect-URL im Developer Portal und versuche es erneut.</p>}
        {invite.data?.url ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* über das Dashboard: funktioniert auch, wenn „OAuth2-Code-Erlaubnis benötigt“ an ist */}
            <a className="inline-flex items-center gap-1.5 rounded-md bg-[#5865f2] px-3.5 py-2 font-medium text-white hover:brightness-110" href="/api/v1/auth/discord/install">Bot zu einem Server hinzufügen</a>
            <a className="text-xs text-primary underline" href={invite.data.url} target="_blank" rel="noreferrer">einfacher Einladungslink</a>
          </div>
        ) : <p className="text-muted">Setze zuerst DISCORD_TOKEN im Panel – dann erscheint hier der Einladungs-Button.</p>}
        <p className="text-xs text-muted">Öffnet Discord mit Administrator-Rechten für den Bot: Server wählen und auf <b>Autorisieren</b> klicken – danach kommst du hierher zurück. Funktioniert auch mit aktivierter „OAuth2-Code-Erlaubnis benötigt“. Du brauchst „Server verwalten“ auf diesem Server; ist der Bot nicht öffentlich, nutze das Discord-Konto, dem er gehört.</p>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted">Bot ist auf {guilds.data?.length ?? 0} Server(n)</p>
          {guilds.data?.length ? <ul className="flex flex-wrap gap-2">{guilds.data.map((g) => <li key={g.id} className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1">{g.icon && <img src={g.icon} alt="" className="h-4 w-4 rounded-full" />}{g.name}</li>)}</ul>
            : <p className="text-xs text-muted">Noch keine gemeldet – der Bot meldet seine Server wenige Sekunden nach dem Start.</p>}
        </div>
      </div>
    </Card>
  );
}

/** ⚠️ Systemhinweis an alle Dashboard-Benutzer (des gewählten Servers) – erscheint im Benachrichtigungs-Center und als Popup. */
function SystemNoticeCard() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const send = useMutation({ mutationFn: () => api<{ recipients: number }>('/notifications/system', { body: { title: title.trim(), body: body.trim() || undefined } }), onSuccess: () => { setTitle(''); setBody(''); } });
  return (
    <Card title="⚠️ Systemhinweis senden" className="mt-4">
      <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <Field label="Titel">{(id) => <Input id={id} value={title} maxLength={200} placeholder="Wartung heute 22 Uhr" onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Text (optional)">{(id) => <Input id={id} value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} />}</Field>
        <Button disabled={send.isPending || title.trim().length < 3} onClick={() => send.mutate()}>Senden</Button>
      </div>
      {send.data && <p role="status" className="mt-2 text-sm text-success">An {send.data.recipients} Benutzer gesendet.</p>}
      {send.error && <p role="alert" className="mt-2 text-sm text-danger">{send.error instanceof ApiError ? send.error.message : 'Fehlgeschlagen'}</p>}
    </Card>
  );
}
