import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_WELCOME_CONFIG, hexColor, renderWelcomeText, WELCOME_VARIABLES, type WelcomeConfig, type WelcomeMessageDef } from '@enrp/shared';
import { useAutosaveDraft } from '../../lib/autosave';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { guildName, useGuilds, useServer } from '../../lib/guilds';
import { ChannelPicker, RolePicker } from '../../components/DiscordPickers';
import { DiscordPreview } from '../../components/DiscordPreview';
import { Toggle } from '../../components/ApplicationSettings';
import { Button, Card, ErrorState, Input, PageHeader, SkeletonRows, Textarea } from '../../components/ui';
import { Box } from './Shifts';

type Cfg = WelcomeConfig & { own: boolean };
const SAMPLE = { id: '0', username: 'max_mustermann', displayName: 'Max', server: 'EN Polizei', memberCount: 128, createdAt: new Date(Date.now() - 400 * 86_400_000) };
const sample = (t: string, server: string) => renderWelcomeText(t, { ...SAMPLE, server }).replace('<@0>', '@Max');

/** Eine Nachricht (Willkommen oder Abschied) mit Kanal, Texten, Farbe und Vorschau. */
function MessageEditor({ label, value, onChange, disabled, server }: { label: string; value: WelcomeMessageDef; onChange: (v: WelcomeMessageDef) => void; disabled: boolean; server: string }) {
  const set = (p: Partial<WelcomeMessageDef>) => onChange({ ...value, ...p });
  return (
    <Card title={label}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="grid content-start gap-3">
          <div className="flex items-center gap-2"><Toggle label={`${label} aktiv`} checked={value.enabled} onChange={(v) => set({ enabled: v })} /><span className="text-sm">{value.enabled ? 'An' : 'Aus'}</span></div>
          <div className="grid gap-3 md:grid-cols-2">
            <Box title="Kanal" desc="Wohin die Nachricht gepostet wird" required={value.enabled}><ChannelPicker ariaLabel={`${label}: Kanal`} disabled={disabled} value={value.channelId} onChange={(id) => set({ channelId: id })} /></Box>
            <Box title="Optionen" desc="Mitglied über dem Embed erwähnen, Profilbild anzeigen">
              <label className="flex items-center gap-2 text-sm"><Toggle label={`${label}: Mitglied erwähnen`} checked={value.pingUser} onChange={(v) => set({ pingUser: v })} />Mitglied erwähnen</label>
              <label className="flex items-center gap-2 text-sm"><Toggle label={`${label}: Profilbild`} checked={value.showAvatar} onChange={(v) => set({ showAvatar: v })} />Profilbild</label>
            </Box>
          </div>
          <label className="grid gap-1 text-sm">Titel<Input aria-label={`${label}: Titel`} disabled={disabled} maxLength={256} value={value.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Nachricht<Textarea aria-label={`${label}: Nachricht`} disabled={disabled} rows={5} maxLength={4000} value={value.message} onChange={(e) => set({ message: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm">Farbe<input type="color" aria-label={`${label}: Farbe`} disabled={disabled} value={value.color} onChange={(e) => set({ color: e.target.value })} className="h-8 w-12 rounded border border-line bg-transparent" /></label>
        </div>
        <DiscordPreview message={{ content: value.pingUser ? '@Max' : undefined, embeds: [{ title: sample(value.title, server), description: sample(value.message, server), color: hexColor(value.color) }] }} />
      </div>
    </Card>
  );
}

/** Admin → Welcome & Goodbye: je Server (oben links gewählt) oder gemeinsam für alle Server. */
export function WelcomeSettings() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const qc = useQueryClient();
  const [server] = useServer();
  const guilds = useGuilds();
  const key = ['welcome-config', server];
  const q = useQuery({ queryKey: key, queryFn: () => api<Cfg>('/welcome/config') });
  const [cfg, setCfg] = useState<Cfg>();
  useEffect(() => { if (q.data) setCfg(q.data); }, [q.data]);
  const body = (c: Cfg): WelcomeConfig => ({ welcome: c.welcome, dm: c.dm, autoRoleIds: c.autoRoleIds, goodbye: c.goodbye });
  const valid = (c: Cfg) => (!c.welcome.enabled || !!c.welcome.channelId) && (!c.goodbye.enabled || !!c.goodbye.channelId);
  const save = useMutation({ mutationFn: (c: Cfg) => api<Cfg>('/welcome/config', { method: 'PUT', body: body(c) }), onSuccess: (r) => qc.setQueryData(key, r) });
  const reset = useMutation({ mutationFn: () => api<Cfg>('/welcome/config', { method: 'DELETE' }), onSuccess: (r) => { qc.setQueryData(key, r); setCfg(r); } });
  useAutosaveDraft(manage ? `welcome:${server || 'all'}` : null, cfg, (c) => (valid(c) ? { method: 'PUT', path: '/welcome/config', body: body(c), label: 'Willkommen & Abschied' } : null));
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!cfg) return <SkeletonRows />;
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p });
  const serverName = guildName(guilds.data, server) ?? 'EN Polizei';
  const dirty = JSON.stringify(cfg) !== JSON.stringify(q.data);
  return (
    <>
      <PageHeader title="Willkommen & Abschied" subtitle="Nachrichten, wenn jemand dem Discord-Server beitritt oder ihn verlässt, eine Willkommens-DM und automatische Rollen." />
      <p className="mb-4 rounded-lg border border-line bg-panel-2/40 p-3 text-sm text-muted">
        {server ? (cfg.own ? <>Eigene Einstellungen für <b>{serverName}</b>.</> : <>{serverName} nutzt die gemeinsamen Einstellungen – beim Speichern entstehen eigene für diesen Server.</>) : <>Gemeinsame Einstellungen für alle Server ohne eigene.</>}
        {' '}Der Bot braucht den privilegierten <b>Server Members</b>-Intent (Developer Portal → Bot → Privileged Gateway Intents).
        {server && cfg.own && manage && <Button size="sm" variant="ghost" className="ml-2" disabled={reset.isPending} onClick={() => reset.mutate()}>Gemeinsame Einstellungen nutzen</Button>}
      </p>
      <div className="grid gap-4">
        <MessageEditor label="Willkommensnachricht" value={cfg.welcome} onChange={(v) => set({ welcome: v })} disabled={!manage} server={serverName} />
        <Card title="Willkommens-DM & automatische Rollen">
          <div className="grid gap-3 md:grid-cols-2">
            <Box title="Direktnachricht" desc="Geht privat an neue Mitglieder (nur wenn sie DMs erlauben).">
              <div className="flex items-center gap-2"><Toggle label="Willkommens-DM aktiv" checked={cfg.dm.enabled} onChange={(v) => set({ dm: { ...cfg.dm, enabled: v } })} /><span className="text-sm">{cfg.dm.enabled ? 'An' : 'Aus'}</span></div>
              <Textarea aria-label="Willkommens-DM" disabled={!manage} rows={4} maxLength={2000} value={cfg.dm.message} onChange={(e) => set({ dm: { ...cfg.dm, message: e.target.value } })} />
            </Box>
            <Box title={`Automatische Rollen: ${cfg.autoRoleIds.length}`} desc="Bekommt jedes neue Mitglied (keine Bots). Die Bot-Rolle muss über diesen Rollen stehen."><RolePicker ariaLabel="Automatische Rollen" disabled={!manage} max={10} value={cfg.autoRoleIds} onChange={(ids) => set({ autoRoleIds: ids })} /></Box>
          </div>
        </Card>
        <MessageEditor label="Abschiedsnachricht" value={cfg.goodbye} onChange={(v) => set({ goodbye: v })} disabled={!manage} server={serverName} />
        <Card title="Platzhalter">
          <ul className="grid gap-1 text-sm md:grid-cols-2">{Object.entries(WELCOME_VARIABLES).map(([k, v]) => <li key={k}><code className="text-primary">{k}</code> <span className="text-muted">{v}</span></li>)}</ul>
          <p className="mt-3 text-xs text-muted">Verlässt jemand den Server, werden offene Bewerbungen nach <b>Aktion beim Verlassen</b> (Qualifikationen → Einrichtung) und offene Support-Tickets nach Tickets → Allgemein behandelt.</p>
        </Card>
      </div>
      {(save.error || reset.error) && <p role="alert" className="mt-3 text-sm text-danger">{errText(save.error ?? reset.error)}</p>}
      {!valid(cfg) && <p role="alert" className="mt-3 text-sm text-warning">Wähle für jede eingeschaltete Nachricht einen Kanal – bis dahin wird nichts gespeichert.</p>}
      {manage && (
        <div className="sticky bottom-2 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
          <span className="text-sm text-muted">Änderungen werden automatisch gespeichert.</span>
          <Button variant="secondary" disabled={save.isPending || !dirty || !valid(cfg)} onClick={() => save.mutate(cfg)}>Jetzt speichern</Button>
          <Button variant="ghost" disabled={!manage} onClick={() => setCfg({ ...cfg, ...DEFAULT_WELCOME_CONFIG })}>Standardtexte</Button>
        </div>
      )}
    </>
  );
}
