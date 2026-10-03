import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, SkeletonRows } from '../../components/ui';

interface S { settings: Record<string, unknown>; allowedKeys: string[] }
const TEXT = [['org.name', 'Organisation name'], ['org.serverName', 'Server name'], ['org.timezone', 'Timezone (IANA)']] as const;
const CHANNELS = [['dispatch', 'Dispatch channel ID (new/assigned incidents)'], ['wanted', 'Wanted channel ID (new wanted records)'], ['announcements', 'Announcements channel ID'], ['guildId', 'Server (guild) ID – optional']] as const;
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
        <p className="mb-3 text-xs text-muted">Empty = that notification type is disabled (nothing is queued). Several channels (also on different servers): separate the IDs with a comma. Everyone who can read the Discord channel will see the posts — use staff-only channels. Only summaries are posted (incident number/title/priority/location, wanted reason/subject, announcements).</p>
        <div className="grid gap-3 md:grid-cols-2">{CHANNELS.map(([k, label]) => <Field key={k} label={label}>{(id) => <Input id={id} inputMode="numeric" disabled={!manage} value={drafts[`discord.${k}`] ?? String((q.data.settings['discord.channels'] as Record<string, string> | undefined)?.[k] ?? '')} onChange={(e) => setDrafts({ ...drafts, [`discord.${k}`]: e.target.value })} placeholder="123456789012345678, 234567890123456789" />}</Field>)}</div>
      </Card>
    </>
  );
}
