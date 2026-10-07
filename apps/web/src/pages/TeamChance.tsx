import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { onSaved, useAutosaveDraft } from '../lib/autosave';
import { guildName, useGuilds, useServer } from '../lib/guilds';
import { fmt } from '../components/ui';
import { Badge, Card, ErrorState, Field, Input, PageHeader, SkeletonRows, Textarea } from '../components/ui';
import { ChannelPicker, RolePicker } from '../components/DiscordPickers';

export interface TeamChanceCfg { open: boolean; title: string; description: string; opensAt: string | null; closesAt: string | null; slots: number; channelId: string | null; pingRoleIds: string[]; restrictApplications: boolean }
type Status = TeamChanceCfg & { isOpen: boolean; reason: 'closed' | 'not_started' | 'ended' | 'full' | null; used: number; remaining: number | null; openedAt?: string | null };
const REASON: Record<string, string> = { closed: 'geschlossen', not_started: 'startet später', ended: 'abgelaufen', full: 'alle Plätze vergeben' };

export const useTeamChance = () => useQuery({ queryKey: ['teamchance'], queryFn: () => api<Status>('/teamchance'), refetchInterval: 5_000 });

export function TeamChanceBadge({ s }: { s: Status }) {
  return s.isOpen ? <Badge tone="success">📣 offen</Badge> : <Badge tone="danger">🔒 {REASON[s.reason ?? 'closed']}</Badge>;
}

/** Kurzansicht (Widget „📣 Team-Chance“). */
export function TeamChanceSummary() {
  const q = useTeamChance();
  if (q.isLoading) return <SkeletonRows rows={2} />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const s = q.data;
  return (
    <div className="space-y-1 text-sm">
      <p className="flex items-center gap-2 font-semibold">{s.title} <TeamChanceBadge s={s} /></p>
      {s.isOpen && s.closesAt && <p className="text-muted">Bewerbungsschluss: {fmt(s.closesAt)}</p>}
      {s.slots > 0 && <p className="text-muted">{s.used} / {s.slots} Plätze vergeben</p>}
      <Link to="/teamchance" className="text-xs text-primary hover:underline">Team-Chance öffnen</Link>
    </div>
  );
}

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** 📣 Team-Chance: Bewerbungsphase fürs Team öffnen/schließen – je Server; Änderungen werden automatisch gespeichert. */
export function TeamChance() {
  const [server] = useServer();
  const q = useTeamChance();
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <SkeletonRows />;
  // je Server ein eigener Entwurf (Server getrennt)
  return <TeamChanceEditor key={server} s={q.data} server={server} />;
}

function TeamChanceEditor({ s: initial, server }: { s: Status; server: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const s = useTeamChance().data ?? initial; // Status immer aktuell (nach dem Speichern neu geladen)
  useEffect(() => onSaved('teamchance:', () => void qc.invalidateQueries({ queryKey: ['teamchance'] })), [qc]);
  const guilds = useGuilds();
  const manage = can('teamchance.manage');
  const [d, setD] = useState<TeamChanceCfg>({ open: initial.open, title: initial.title, description: initial.description, opensAt: initial.opensAt, closesAt: initial.closesAt, slots: initial.slots, channelId: initial.channelId, pingRoleIds: initial.pingRoleIds, restrictApplications: initial.restrictApplications });
  useAutosaveDraft(manage ? `teamchance:${server || 'all'}` : null, d, (c) => (c.title.trim() && (!c.opensAt || !c.closesAt || c.opensAt < c.closesAt) ? { method: 'PUT', path: '/teamchance', body: c, label: 'Team-Chance' } : null), 800);
  const set = (p: Partial<TeamChanceCfg>) => setD({ ...d, ...p });
  return (
    <>
      <PageHeader title="📣 Team-Chance" subtitle={`Bewerbungsphase für das Team${server ? ` – ${guildName(guilds.data, server)}` : ''}. ${manage ? 'Änderungen werden automatisch gespeichert.' : ''} In Discord: /teamchance`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Einstellungen">
          <div className="grid gap-3">
            <label className="flex items-center gap-3 rounded-md border border-line p-3">
              <input type="checkbox" className="h-5 w-5" disabled={!manage} checked={d.open} onChange={(e) => set({ open: e.target.checked })} />
              <span><span className="block font-semibold">{d.open ? '📣 Team-Chance ist geöffnet' : '🔒 Team-Chance ist geschlossen'}</span><span className="text-xs text-muted">Beim Öffnen und Schließen wird im Ankündigungs-Kanal gepostet; beim Öffnen werden alle mit Zugriff auf die Team-Chance benachrichtigt.</span></span>
            </label>
            <Field label="Titel">{(id) => <Input id={id} disabled={!manage} value={d.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} />}</Field>
            <Field label="Beschreibung (Discord-Markdown möglich)">{(id) => <Textarea id={id} disabled={!manage} rows={4} value={d.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />}</Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Startet (optional)">{(id) => <Input id={id} type="datetime-local" disabled={!manage} value={toLocal(d.opensAt)} onChange={(e) => set({ opensAt: fromLocal(e.target.value) })} />}</Field>
              <Field label="Endet (optional)" error={d.opensAt && d.closesAt && d.opensAt >= d.closesAt ? 'Ende muss nach dem Start liegen' : undefined}>{(id) => <Input id={id} type="datetime-local" disabled={!manage} value={toLocal(d.closesAt)} onChange={(e) => set({ closesAt: fromLocal(e.target.value) })} />}</Field>
              <Field label="Plätze (0 = unbegrenzt)">{(id) => <Input id={id} type="number" min={0} max={10000} disabled={!manage} value={d.slots} onChange={(e) => set({ slots: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />}</Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!manage} checked={d.restrictApplications} onChange={(e) => set({ restrictApplications: e.target.checked })} />Bewerbungen (Discord und /apply) nur annehmen, solange die Team-Chance offen ist</label>
            <Field label="Ankündigungs-Kanal (leer = keine Ankündigung)">{(id) => <ChannelPicker ariaLabel={id} disabled={!manage} value={d.channelId} onChange={(v) => set({ channelId: v })} />}</Field>
            <div><p className="mb-1 text-xs font-medium text-muted">Rollen erwähnen beim Öffnen</p><RolePicker ariaLabel="Rollen erwähnen" disabled={!manage} max={10} value={d.pingRoleIds} onChange={(ids) => set({ pingRoleIds: ids })} /></div>
          </div>
        </Card>
        <Card title="Status">
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><TeamChanceBadge s={s} /></p>
            {s.openedAt && s.open && <p className="text-muted">Geöffnet seit {fmt(s.openedAt)}</p>}
            {s.opensAt && <p className="text-muted">Start: {fmt(s.opensAt)}</p>}
            {s.closesAt && <p className="text-muted">Ende: {fmt(s.closesAt)}</p>}
            <p className="text-muted">Bewerbungen in dieser Phase: {s.used}{s.slots > 0 ? ` / ${s.slots}` : ''}</p>
            {s.restrictApplications && <p className="text-warning">Bewerbungen nur während der Team-Chance.</p>}
            {can('applications.view') && <Link to="/applications" className="text-primary hover:underline">Zu den Bewerbungen</Link>}
          </div>
        </Card>
      </div>
    </>
  );
}
