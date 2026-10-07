import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAutosaveDraft } from '../../lib/autosave';
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
    onSuccess: (r) => { qc.setQueryData(['leave-config'], r); setMsg('Gespeichert.'); },
  });
  // automatisch speichern (Rechte prüft die API)
  useAutosaveDraft(manage ? 'leave:config' : null, cfg, (c) => (c.maxDays >= 1 ? { method: 'PUT', path: '/leave/config', body: c, label: 'Abmeldungen' } : null));
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!cfg) return <SkeletonRows />;
  const set = (p: Partial<LeaveConfig>) => { setCfg({ ...cfg, ...p }); setMsg(undefined); };
  const dirty = JSON.stringify(cfg) !== JSON.stringify(q.data);
  return (
    <>
      <ModuleHeader title="Abmeldungen" desc="Richte das Abmeldungs-Modul für deinen Server ein." enabled={cfg.enabled} disabled={!manage}
        onToggle={(v) => { const next = { ...cfg, enabled: v }; setCfg(next); save.mutate(next); }} />
      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Box title="Freigabe-Kanal" desc="Wähle einen Kanal für die Freigabe von Abmeldungen (Buttons Genehmigen / Ablehnen)"><ChannelPicker ariaLabel="Freigabe-Kanal" disabled={!manage} value={cfg.approvalChannelId} onChange={(id) => set({ approvalChannelId: id })} /></Box>
          <Box title="Log-Kanal" desc="Wähle einen Kanal für Abmeldungs-Logs (genehmigt, begonnen, beendet …)"><ChannelPicker ariaLabel="Log-Kanal" disabled={!manage} value={cfg.logChannelId} onChange={(id) => set({ logChannelId: id })} /></Box>
          <Box title="Abgemeldet-Rolle" desc="Wähle eine Rolle für abgemeldete Mitglieder (vom Beginn bis zum Ende)"><RolePicker ariaLabel="Abgemeldet-Rolle" disabled={!manage} value={cfg.roleIds} onChange={(ids) => set({ roleIds: ids })} /></Box>
          <Box title="Maximale Dauer" desc="Längste Abmeldung, die man beantragen kann (Tage)"><Input aria-label="Maximale Dauer in Tagen" type="number" min={1} max={365} disabled={!manage} value={cfg.maxDays} onChange={(e) => set({ maxDays: Math.floor(Number(e.target.value) || 0) })} /></Box>
        </div>
        <p className="mt-3 text-xs text-muted">Mitglieder beantragen Abmeldungen mit <code>/abmeldung</code> in Discord oder unter <b>Organisation → Abmeldungen</b>. Personen mit dem Recht <code>leave.manage</code> genehmigen oder lehnen sie mit den Buttons im Freigabe-Kanal oder im Dashboard ab.</p>
      </Card>
      {save.error && <p role="alert" className="mt-3 text-sm text-danger">{errText(save.error)}</p>}
      {manage && (
        <div className="sticky bottom-2 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
          <span className="text-sm text-muted">Änderungen werden automatisch gespeichert.</span>
          <Button variant="secondary" disabled={save.isPending || !dirty} onClick={() => save.mutate(cfg)}>Jetzt speichern</Button>
          {!dirty && msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      )}
    </>
  );
}
