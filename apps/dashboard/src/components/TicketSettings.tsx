import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type DiscordChannel, type DiscordRole, type TicketCategoryRow, type TicketLoad, type TicketSettingsRow } from '../api';
import { errorText, QueryState } from './QueryState';
import { useToast } from '../toast';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const fromHex = (h: string) => parseInt(h.slice(1), 16);
const ICON = { low: '🟢', medium: '🟡', high: '🟠', full: '🔴' } as const;
const SWITCHES: [keyof TicketSettingsRow, string][] = [
  ['transcriptEnabled', 'Transcript beim Schließen erstellen'],
  ['dmTranscript', 'Transcript zusätzlich per DM an den Ersteller'],
  ['claimEnabled', 'Claim-System (Tickets übernehmen)'],
  ['claimExclusive', 'Übernommene Tickets nur vom Bearbeiter änderbar'],
  ['closeWithReason', 'Button „Schließen mit Grund“ anzeigen'],
  ['confirmClose', 'Vor dem Schließen nachfragen'],
  ['loadEnabled', 'Auslastung im Panel anzeigen'],
  ['hideFullCategories', 'Volle Kategorien im Menü ausblenden'],
];
const TEXTS: [keyof TicketSettingsRow, string, boolean][] = [
  ['panelTitle', 'Panel-Titel', false],
  ['panelDescription', 'Panel-Text', true],
  ['selectPlaceholder', 'Platzhalter des Auswahlmenüs', false],
  ['loadTitle', 'Titel der Auslastung', false],
  ['loadText', 'Text der Auslastung', true],
  ['openTitle', 'Titel im neuen Ticket', false],
  ['openText', 'Text im neuen Ticket ({user} = Ersteller, {category}, {number})', true],
  ['nameTemplate', 'Kanalname ({number}, {user}, {category})', false],
];

/** Einstellungen des Ticket-Systems: Kanäle, Rollen, Texte, Farben, Verhalten, Panel veröffentlichen, Auslastung. */
export function TicketSettings({ guildId, categories }: { guildId: string; categories: TicketCategoryRow[] }) {
  const base = `/guilds/${guildId}/tickets`;
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useQuery({ queryKey: ['ticket-settings', guildId], queryFn: () => api<TicketSettingsRow>(`${base}/settings`) });
  const loads = useQuery({ queryKey: ['ticket-loads', guildId], queryFn: () => api<TicketLoad[]>(`${base}/loads`), refetchInterval: 30_000 });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`) });
  const channels = useQuery({ queryKey: ['channels-all', guildId], queryFn: () => api<DiscordChannel[]>(`/guilds/${guildId}/discord/channels`) });
  const [f, setF] = useState<TicketSettingsRow | null>(null);
  useEffect(() => { if (settings.data) setF(settings.data); }, [settings.data]);
  const save = useMutation({
    mutationFn: () => api<TicketSettingsRow>(`${base}/settings`, { method: 'PUT', body: f }),
    onSuccess: () => { toast.success('Einstellungen gespeichert.'); void qc.invalidateQueries({ queryKey: ['ticket-settings', guildId] }); },
    onError: (e) => toast.error(errorText(e)),
  });
  const panel = useMutation({
    mutationFn: () => api<{ messageId: string }>(`${base}/panel`, { method: 'POST', body: { channelId: f?.panelChannelId } }),
    onSuccess: () => toast.success('Panel veröffentlicht.'),
    onError: (e) => toast.error(errorText(e)),
  });
  const text = channels.data?.filter((c) => c.kind === 'text') ?? [];
  const set = <K extends keyof TicketSettingsRow>(k: K, v: TicketSettingsRow[K]) => f && setF({ ...f, [k]: v });
  return (
    <>
      <h2>Auslastung</h2>
      <QueryState query={loads}>
        {(rows) => rows.length === 0 ? <p className="muted">Noch keine Kategorien.</p> : (
          <ul className="list">{rows.map((l) => <li key={l.id} className="row">{ICON[l.level]} <strong>{l.name}</strong>: {l.open}/{l.max} ({l.percent} %)</li>)}</ul>
        )}
      </QueryState>
      <h2>Einstellungen</h2>
      <QueryState query={settings}>
        {() => f && (
          <div className="card comp">
            <div className="two">
              <label className="fld"><span>Panel-Kanal</span>
                <select value={f.panelChannelId ?? ''} onChange={(e) => set('panelChannelId', e.target.value || null)}><option value="">Nicht gesetzt</option>{text.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select>
              </label>
              <label className="fld"><span>Transcript-Kanal</span>
                <select value={f.transcriptChannelId ?? ''} onChange={(e) => set('transcriptChannelId', e.target.value || null)}><option value="">Nicht gesetzt</option>{text.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}</select>
              </label>
            </div>
            <div className="two">
              <label className="fld"><span>Kategorie für „Ticket mit Bewerber“</span>
                <select value={f.applicationCategoryId ?? ''} onChange={(e) => set('applicationCategoryId', e.target.value || null)}><option value="">Erste aktive Kategorie</option>{categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </label>
              <label className="fld"><span>Kanal löschen nach (Minuten, 0 = sofort)</span>
                <input type="number" min={0} max={10080} value={f.deleteAfterMinutes} onChange={(e) => set('deleteAfterMinutes', Number(e.target.value))} />
              </label>
            </div>
            <label className="fld"><span>Admin-Rollen (dürfen in jedem Ticket alles)</span>
              <select multiple size={5} value={f.adminRoleIds} onChange={(e) => set('adminRoleIds', [...e.target.selectedOptions].map((o) => o.value))}>{roles.data?.filter((r) => r.blockedReason !== 'everyone').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            </label>
            <label className="fld"><span>Farbe</span><input type="color" value={hex(f.color)} onChange={(e) => set('color', fromHex(e.target.value))} /></label>
            {TEXTS.map(([k, label, long]) => (
              <label key={k} className="fld"><span>{label}</span>
                {long ? <textarea rows={3} value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} /> : <input value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} />}
              </label>
            ))}
            <div className="fld">{SWITCHES.map(([k, label]) => <label key={k} style={{ display: 'block' }}><input type="checkbox" checked={Boolean(f[k])} onChange={(e) => set(k, e.target.checked as never)} /> {label}</label>)}</div>
            <div className="actions">
              <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>Speichern</button>
              <button className="btn" disabled={panel.isPending || !f.panelChannelId} title={f.panelChannelId ? '' : 'Zuerst Panel-Kanal wählen und speichern'} onClick={() => panel.mutate()}>Panel (neu) veröffentlichen</button>
            </div>
            <small className="muted">Das Panel zeigt Kategorien und Auslastung und aktualisiert sich selbst. Panel-Kanal erst speichern, dann veröffentlichen.</small>
          </div>
        )}
      </QueryState>
    </>
  );
}
