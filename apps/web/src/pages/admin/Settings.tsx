import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useGuilds, useServer } from '../../lib/guilds';
import { useSettings } from '../../lib/settings';
import { ChannelPicker, ChannelsPicker, RolePicker, ServersPicker, TagListEditor } from '../../components/DiscordPickers';
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, SkeletonRows } from '../../components/ui';

const TEXT = [['org.name', 'Organisation name'], ['org.serverName', 'Server name'], ['org.timezone', 'Timezone (IANA)']] as const;
const CHANNELS = [['dispatch', '📡 Leitstellen-Channel (neue/zugewiesene Einsätze)'], ['wanted', '🚨 Fahndungs-Channel (neue Fahndungen und Statusänderungen)'], ['announcements', '📢 Ankündigungs-Channel'], ['applications', 'Applications channel ID (police applications with answers + accept/deny buttons – staff only!)'], ['danger', 'Danger level channel ID (level changes)'], ['sek', 'SEK channel ID (SEK mission reports)'], ['qualifications', 'Qualifications channel ID (applications from /qualipanel with accept/reject buttons)'], ['duty', 'Duty channel ID (message on every duty status change)'],
  ['teamlist', 'Team list channel ID (self-updating list, one channel)'], ['tickets', 'Support ticket category ID (one category)'], ['staffRole', 'Staff role ID (sees support tickets)'], ['radioRole', 'Radio role ID (given with the radio whitelist)'], ['sekRole', 'SEK role ID (given/removed with /sek in Discord)'], ['dutyRole', 'On-duty role ID(s) (given while ON DUTY, removed otherwise; several servers: one ID each, comma-separated)'], ['breakRole', 'Break role ID(s) (optional)'], ['trainingRole', 'Training role ID(s) (optional)'], ['adminDutyRole', 'Administrative duty role ID(s) (optional)'], ['guildId', 'Server – optional (für Discord-Anmeldung/Mitgliedschaft)']] as const;
/** Rollen-Felder (Auswahl als Rolle) und Felder mit genau einer ID. */
const ROLE_KEYS = new Set(['staffRole', 'radioRole', 'sekRole', 'dutyRole', 'breakRole', 'trainingRole', 'adminDutyRole']);
const SINGLE = new Set(['teamlist', 'tickets', 'staffRole', 'radioRole', 'sekRole']);
const NUM = [['retention.sessionDays', 'Keep expired sessions (days)', 1, 365], ['retention.loginHistoryDays', 'Keep login history (days)', 30, 3650], ['retention.readNotificationDays', 'Keep read notifications (days)', 7, 3650]] as const;

export function Settings() {
  const { can } = useAuth();
  const { q, get, put, isServerValue } = useSettings();
  const [server] = useServer();
  const guilds = useGuilds();
  const [msg, setMsg] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const retention = useMutation({ mutationFn: () => api<Record<string, number>>('/admin/retention/run', { method: 'POST' }), onSuccess: (r) => setMsg(`Retention run: ${JSON.stringify(r)}`), onError: (e) => setMsg(e instanceof ApiError ? e.message : 'Failed') });
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
    if (manage && Object.values(all).every((x) => /^\d{15,25}(\s*,\s*\d{15,25})*$/.test(String(x)))) put('discord.channels', all, 'Discord-Channels');
  };
  const structure = get<{ teams: string[]; offices: string[] }>('team.structure') ?? { teams: [], offices: [] };
  const serverName = server ? guilds.data?.find((g) => g.id === server)?.name ?? server : null;
  return (
    <>
      <PageHeader title="Settings" subtitle="Änderungen werden automatisch gespeichert, geprüft und im Audit-Log festgehalten." />
      {msg && <p role="status" className="mb-3 rounded border border-line bg-panel p-2 text-sm">{msg}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Organisation">
          <div className="space-y-3">{TEXT.map(([k, label]) => <Field key={k} label={`${label}${isServerValue(k) ? ` (nur ${serverName})` : ''}`}>{(id) => <Input id={id} value={val(k)} disabled={!manage} maxLength={100} onChange={(e) => edit(k, e.target.value, (v) => { if (v.trim().length >= (k === 'org.timezone' ? 3 : 1)) put(k, v.trim(), label); return true; })} />}</Field>)}
            <Field label="Date format">{(id) => <Select id={id} disabled={!manage} value={val('org.dateFormat') || 'DD.MM.YYYY'} onChange={(e) => put('org.dateFormat', e.target.value, 'Date format')}>{['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].map((f) => <option key={f}>{f}</option>)}</Select>}</Field></div>
        </Card>
        <Card title="Data retention" actions={manage && <Button variant="secondary" size="sm" onClick={() => retention.mutate()} disabled={retention.isPending}>Run now</Button>}>
          <p className="mb-3 text-xs text-muted">Audit logs are never deleted by retention.</p>
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
      <Card title="Discord bot channels" className="mt-4">
        <p className="mb-3 text-xs text-muted">Channel aus der Liste wählen – wird automatisch gespeichert. Beispiel: <b>Wanted channel</b> = euer Fahndungs-Channel; jede Fahndung (aus Dashboard oder Discord) wird dort gepostet. Empty = that notification type is disabled (nothing is queued). Several channels (also on different servers): separate the IDs with a comma. Everyone who can read the Discord channel will see the posts — use staff-only channels. Team list, ticket category and the roles take a single ID.</p>
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
    <Card title="Sign in with Discord – Zugang zum Dashboard" className="mt-4">
      <p className="mb-3 text-xs text-muted">
        {providers.data?.discord ? 'Enabled – sign-in works only with Discord (emergency: PASSWORD_LOGIN=true in the panel). Your own Discord ID belongs in ADMIN_DISCORD_IDS so you always get admin rights.' : 'Not enabled yet (password login is active for setup): set ADMIN_DISCORD_IDS (your Discord ID) and DISCORD_CLIENT_SECRET (Discord Developer Portal → OAuth2) in the panel and add the redirect URL below in the Developer Portal.'}
        {' '}Redirect URL: <code>{window.location.origin}/api/v1/auth/discord/callback</code>
      </p>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" disabled={!manage} checked={d.signup} onChange={(e) => setD({ ...d, signup: e.target.checked })} />New users can sign up with Discord (account is created on first login)</label>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={!manage} checked={d.requireGuild} onChange={(e) => setD({ ...d, requireGuild: e.target.checked })} />Only members of our Discord server may sign in</label>
      </div>
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">Discord-Rollen mit Dashboard-Zugriff (Teamrollen)</h3>
      <div className="max-w-xl"><RolePicker ariaLabel="Teamrollen" disabled={!manage} max={20} value={team.match(/\d{15,25}/g) ?? []} onChange={(ids) => setTeam(ids.join(', '))} /></div>
      <p className="mt-1 text-xs text-muted">Only people who have one of these Discord roles can sign in (several servers / roles: comma-separated). Empty = every server member. Accounts in ADMIN_DISCORD_IDS always get in. Checked at every sign-in and continuously afterwards (losing the role ends the session). Linking Discord roles to dashboard roles: Roles &amp; Permissions → role → „Verknüpfte Discord-Rollen“.</p>
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">Discord role → system role (synced on every Discord login)</h3>
      <div className="space-y-2">
        {d.roleMap.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-64"><RolePicker ariaLabel="Discord-Rolle" disabled={!manage} max={1} value={r.discordRoleId ? [r.discordRoleId] : []} onChange={(ids) => row(i, { discordRoleId: ids[0] ?? '' })} /></div>
            <span className="text-muted">→</span>
            <div className="w-full sm:w-56"><Select aria-label="System role" disabled={!manage} value={r.role} onChange={(e) => row(i, { role: e.target.value })}>
              <option value="">Choose role…</option>
              {(roles.data ?? []).map((x) => <option key={x.name}>{x.name}</option>)}
            </Select></div>
            {manage && <Button variant="ghost" size="sm" onClick={() => setD({ ...d, roleMap: d.roleMap.filter((_, j) => j !== i) })}>Remove</Button>}
          </div>
        ))}
        {manage && <Button variant="secondary" size="sm" onClick={() => setD({ ...d, roleMap: [...d.roleMap, { discordRoleId: '', role: '' }] })}>Add mapping</Button>}
        <p className="text-xs text-muted">Example: Discord role “Polizei” → Police Member, “Leitstelle” → Dispatch. Mapped roles are added when the person has the Discord role and removed when they lose it; other roles are never touched.</p>
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
    <Card title="Discord bot on your servers" className="mt-4">
      <div className="grid gap-3 text-sm">
        {result === 'installed' && <p role="status" className="text-success">✅ Bot added{server ? ` to „${server}“` : ''}. It appears in the list below within a few seconds.</p>}
        {result === 'install_failed' && <p role="alert" className="text-danger">Adding the bot failed. Check DISCORD_CLIENT_SECRET and the redirect URL in the Developer Portal, then try again.</p>}
        {invite.data?.url ? (
          <div className="flex flex-wrap items-center gap-3">
            {/* über das Dashboard: funktioniert auch, wenn „OAuth2-Code-Erlaubnis benötigt“ an ist */}
            <a className="inline-flex items-center gap-1.5 rounded-md bg-[#5865f2] px-3.5 py-2 font-medium text-white hover:brightness-110" href="/api/v1/auth/discord/install">Add bot to a server</a>
            <a className="text-xs text-primary underline" href={invite.data.url} target="_blank" rel="noreferrer">plain invite link</a>
          </div>
        ) : <p className="text-muted">Set DISCORD_TOKEN in the panel first – then the invite button appears here.</p>}
        <p className="text-xs text-muted">Opens Discord with administrator rights for the bot: choose your server and click <b>Authorize</b> – you come back here afterwards. Works even with „Requires OAuth2 Code Grant“ turned on. You need „Manage Server“ on that server; if the bot is not public, use the Discord account that owns it.</p>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-muted">Bot is on {guilds.data?.length ?? 0} server(s)</p>
          {guilds.data?.length ? <ul className="flex flex-wrap gap-2">{guilds.data.map((g) => <li key={g.id} className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1">{g.icon && <img src={g.icon} alt="" className="h-4 w-4 rounded-full" />}{g.name}</li>)}</ul>
            : <p className="text-xs text-muted">None reported yet – the bot reports its servers a few seconds after it starts.</p>}
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
