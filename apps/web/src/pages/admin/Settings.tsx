import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, SkeletonRows } from '../../components/ui';

interface S { settings: Record<string, unknown>; allowedKeys: string[] }
const TEXT = [['org.name', 'Organisation name'], ['org.serverName', 'Server name'], ['org.timezone', 'Timezone (IANA)']] as const;
const CHANNELS = [['dispatch', 'Dispatch channel ID (new/assigned incidents)'], ['wanted', 'Wanted channel ID (new wanted records)'], ['announcements', 'Announcements channel ID'], ['applications', 'Applications channel ID (police applications with answers + accept/deny buttons – staff only!)'], ['danger', 'Danger level channel ID (level changes)'], ['sek', 'SEK channel ID (SEK mission reports)'], ['qualifications', 'Qualifications channel ID (applications from /qualipanel with accept/reject buttons)'], ['duty', 'Duty channel ID (message on every duty status change)'],
  ['teamlist', 'Team list channel ID (self-updating list, one channel)'], ['tickets', 'Support ticket category ID (one category)'], ['staffRole', 'Staff role ID (sees support tickets)'], ['radioRole', 'Radio role ID (given with the radio whitelist)'], ['sekRole', 'SEK role ID (given/removed with /sek in Discord)'], ['dutyRole', 'On-duty role ID (given while ON DUTY, removed otherwise)'], ['breakRole', 'Break role ID (optional)'], ['trainingRole', 'Training role ID (optional)'], ['adminDutyRole', 'Administrative duty role ID (optional)'], ['guildId', 'Server (guild) ID – optional']] as const;
const NUM = [['retention.sessionDays', 'Keep expired sessions (days)'], ['retention.loginHistoryDays', 'Keep login history (days)'], ['retention.readNotificationDays', 'Keep read notifications (days)']] as const;

export function Settings() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<S>('/admin/settings') });
  const [msg, setMsg] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api(`/admin/settings/${key}`, { method: 'PUT', body: { value } }),
    onSuccess: () => { setMsg('Saved.'); void qc.invalidateQueries({ queryKey: ['settings'] }); }, onError: (e) => setMsg(e instanceof ApiError ? `${e.message} (Request ID ${e.requestId})` : 'Failed'),
  });
  const retention = useMutation({ mutationFn: () => api<Record<string, number>>('/admin/retention/run', { method: 'POST' }), onSuccess: (r) => setMsg(`Retention run: ${JSON.stringify(r)}`) });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const manage = can('settings.manage');
  const val = (k: string) => drafts[k] ?? String(q.data.settings[k] ?? '');
  return (
    <>
      <PageHeader title="Settings" subtitle="Every change is validated and written to the audit log." />
      {msg && <p role="status" className="mb-3 rounded border border-line bg-panel p-2 text-sm">{msg}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Organisation">
          <div className="space-y-3">{TEXT.map(([k, label]) => <Field key={k} label={label}>{(id) => <div className="flex gap-2"><Input id={id} value={val(k)} disabled={!manage} onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })} /><Button disabled={!manage || save.isPending} onClick={() => save.mutate({ key: k, value: val(k) })}>Save</Button></div>}</Field>)}
            <Field label="Date format">{(id) => <Select id={id} disabled={!manage} value={val('org.dateFormat') || 'DD.MM.YYYY'} onChange={(e) => save.mutate({ key: 'org.dateFormat', value: e.target.value })}>{['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'].map((f) => <option key={f}>{f}</option>)}</Select>}</Field></div>
        </Card>
        <Card title="Data retention" actions={manage && <Button variant="secondary" size="sm" onClick={() => retention.mutate()} disabled={retention.isPending}>Run now</Button>}>
          <p className="mb-3 text-xs text-muted">Audit logs are never deleted by retention.</p>
          <div className="space-y-3">{NUM.map(([k, label]) => <Field key={k} label={label}>{(id) => <div className="flex gap-2"><Input id={id} type="number" value={val(k)} disabled={!manage} onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })} /><Button disabled={!manage || save.isPending} onClick={() => save.mutate({ key: k, value: Number(val(k)) })}>Save</Button></div>}</Field>)}</div>
        </Card>
      </div>
      <Card title="Discord bot channels" className="mt-4" actions={manage && <Button disabled={save.isPending} onClick={() => save.mutate({ key: 'discord.channels', value: Object.fromEntries(CHANNELS.map(([k]) => [k, (drafts[`discord.${k}`] ?? String((q.data.settings['discord.channels'] as Record<string, string> | undefined)?.[k] ?? '')).trim()]).filter(([, v]) => v)) })}>Save channels</Button>}>
        <p className="mb-3 text-xs text-muted">Empty = that notification type is disabled (nothing is queued). Several channels (also on different servers): separate the IDs with a comma. Everyone who can read the Discord channel will see the posts — use staff-only channels. Only summaries are posted (incident number/title/priority/location, wanted reason/subject, announcements, full applications incl. answers (like Appy), danger level, SEK mission reports and qualification applications incl. their text and answers). Team list, ticket category and the roles take a single ID.</p>
        <div className="grid gap-3 md:grid-cols-2">{CHANNELS.map(([k, label]) => <Field key={k} label={label}>{(id) => <Input id={id} inputMode="numeric" disabled={!manage} value={drafts[`discord.${k}`] ?? String((q.data.settings['discord.channels'] as Record<string, string> | undefined)?.[k] ?? '')} onChange={(e) => setDrafts({ ...drafts, [`discord.${k}`]: e.target.value })} placeholder="123456789012345678, 234567890123456789" />}</Field>)}</div>
      </Card>
      <DiscordLoginCard manage={manage} value={q.data.settings['auth.discord'] as DiscordLogin | undefined} busy={save.isPending} onSave={(v) => save.mutate({ key: 'auth.discord', value: v })} />
      <Card title="Team list rank order" className="mt-4" actions={manage && <Button disabled={save.isPending} onClick={() => save.mutate({ key: 'team.rankOrder', value: val('team.rankOrder').split(',').map((r) => r.trim()).filter(Boolean) })}>Save order</Button>}>
        <p className="mb-3 text-xs text-muted">Ranks in the Discord team list, highest first, separated by commas. Ranks not listed here follow alphabetically.</p>
        <Input aria-label="Rank order" disabled={!manage} value={drafts['team.rankOrder'] ?? ((q.data.settings['team.rankOrder'] as string[] | undefined) ?? []).join(', ')} onChange={(e) => setDrafts({ ...drafts, 'team.rankOrder': e.target.value })} placeholder="Chief, Captain, Sergeant, Officer" />
      </Card>
    </>
  );
}

interface DiscordLogin { signup: boolean; requireGuild: boolean; roleMap: { discordRoleId: string; role: string }[] }

/** „Mit Discord anmelden“: neue Konten, Server-Pflicht, Discord-Rolle → Systemrolle (wird bei jeder Discord-Anmeldung abgeglichen). */
function DiscordLoginCard({ manage, value, busy, onSave }: { manage: boolean; value?: DiscordLogin; busy: boolean; onSave: (v: DiscordLogin) => void }) {
  const [d, setD] = useState<DiscordLogin>(value ?? { signup: true, requireGuild: true, roleMap: [] });
  useEffect(() => { if (value) setD(value); }, [value]);
  const roles = useQuery({ queryKey: ['roles-names'], queryFn: () => api<{ name: string }[]>('/roles') });
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => api<{ discord: boolean }>('/auth/providers') });
  const row = (i: number, p: Partial<DiscordLogin['roleMap'][number]>) => setD({ ...d, roleMap: d.roleMap.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return (
    <Card title="Sign in with Discord" className="mt-4" actions={manage && <Button disabled={busy} onClick={() => onSave({ ...d, roleMap: d.roleMap.filter((r) => r.discordRoleId.trim() && r.role) })}>Save</Button>}>
      <p className="mb-3 text-xs text-muted">
        {providers.data?.discord ? 'Enabled – sign-in works only with Discord (emergency: PASSWORD_LOGIN=true in the panel). Your own Discord ID belongs in ADMIN_DISCORD_IDS so you always get admin rights.' : 'Not enabled yet (password login is active for setup): set ADMIN_DISCORD_IDS (your Discord ID) and DISCORD_CLIENT_SECRET (Discord Developer Portal → OAuth2) in the panel and add the redirect URL below in the Developer Portal.'}
        {' '}Redirect URL: <code>{window.location.origin}/api/v1/auth/discord/callback</code>
      </p>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" disabled={!manage} checked={d.signup} onChange={(e) => setD({ ...d, signup: e.target.checked })} />New users can sign up with Discord (account is created on first login)</label>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={!manage} checked={d.requireGuild} onChange={(e) => setD({ ...d, requireGuild: e.target.checked })} />Only members of our Discord server may sign in</label>
      </div>
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">Discord role → system role (synced on every Discord login)</h3>
      <div className="space-y-2">
        {d.roleMap.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-56"><Input aria-label="Discord role ID" inputMode="numeric" disabled={!manage} value={r.discordRoleId} placeholder="Discord role ID" onChange={(e) => row(i, { discordRoleId: e.target.value.trim() })} /></div>
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
