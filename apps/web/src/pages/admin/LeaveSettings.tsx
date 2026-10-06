import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { ChannelPicker, RolePicker } from '../../components/DiscordPickers';
import { Button, Card, ErrorState, Input, SkeletonRows } from '../../components/ui';
import { Box, ModuleHeader } from './Shifts';

export interface LeaveConfig { enabled: boolean; approvalChannelId?: string | null; logChannelId?: string | null; roleIds: string[]; maxDays: number }

/** Admin → Leave of Absences: Freigabe-Channel, Log-Channel, Rolle „abgemeldet“ (wie bei Melonly/ERM). */
export function LeaveSettings() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['leave-config'], queryFn: () => api<LeaveConfig>('/leave/config') });
  const [cfg, setCfg] = useState<LeaveConfig>();
  const [msg, setMsg] = useState<string>();
  useEffect(() => { if (q.data) setCfg(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: (c: LeaveConfig) => api<LeaveConfig>('/leave/config', { method: 'PUT', body: c }),
    onSuccess: (r) => { qc.setQueryData(['leave-config'], r); setMsg('Saved.'); },
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!cfg) return <SkeletonRows />;
  const set = (p: Partial<LeaveConfig>) => { setCfg({ ...cfg, ...p }); setMsg(undefined); };
  const dirty = JSON.stringify(cfg) !== JSON.stringify(q.data);
  return (
    <>
      <ModuleHeader title="Leave of Absences" desc="Configure the leave of absences module for your server." enabled={cfg.enabled} disabled={!manage}
        onToggle={(v) => { const next = { ...cfg, enabled: v }; setCfg(next); save.mutate(next); }} />
      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Box title="Leave Approval Channel" desc="Select a channel for leave approvals (Approve / Deny buttons)"><ChannelPicker ariaLabel="Leave Approval Channel" disabled={!manage} value={cfg.approvalChannelId} onChange={(id) => set({ approvalChannelId: id })} /></Box>
          <Box title="Leave Logs Channel" desc="Select a channel for leave logs (approved, started, ended …)"><ChannelPicker ariaLabel="Leave Logs Channel" disabled={!manage} value={cfg.logChannelId} onChange={(id) => set({ logChannelId: id })} /></Box>
          <Box title="On Leave Role" desc="Select a role for on leave members (from start to end)"><RolePicker ariaLabel="On Leave Role" disabled={!manage} value={cfg.roleIds} onChange={(ids) => set({ roleIds: ids })} /></Box>
          <Box title="Maximum length" desc="Longest leave someone can request (days)"><Input aria-label="Maximum length in days" type="number" min={1} max={365} disabled={!manage} value={cfg.maxDays} onChange={(e) => set({ maxDays: Math.floor(Number(e.target.value) || 0) })} /></Box>
        </div>
        <p className="mt-3 text-xs text-muted">Members request leave with <code>/abmeldung</code> in Discord or under <b>Organisation → Leave</b>. People with the right <code>leave.manage</code> approve or deny it with the buttons in the approval channel or in the dashboard.</p>
      </Card>
      {save.error && <p role="alert" className="mt-3 text-sm text-danger">{errText(save.error)}</p>}
      {manage && (
        <div className="sticky bottom-2 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
          <Button disabled={save.isPending || !dirty} onClick={() => save.mutate(cfg)}>Save</Button>
          {dirty ? <span className="text-sm text-warning">Unsaved changes</span> : msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      )}
    </>
  );
}
