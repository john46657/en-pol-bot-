import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { DEFAULT_VERIFY_CONFIG, hexColor, renderVerifyNickname, VERIFY_NICK_VARS, type VerifyBind, type VerifyConfig } from '@enrp/shared';
import { useAutosaveDraft } from '../../lib/autosave';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { guildName, useGuilds, useServer } from '../../lib/guilds';
import { ChannelPicker, RolePicker } from '../../components/DiscordPickers';
import { DiscordPreview } from '../../components/DiscordPreview';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, PageHeader, SkeletonRows, Textarea } from '../../components/ui';
import { Box } from './Shifts';

type Cfg = VerifyConfig & { own: boolean; panelMessageId: string | null };
interface Link { discordId: string; discordName: string | null; robloxId: string; robloxName: string; displayName: string; verifiedAt: string; profileUrl: string }
const SAMPLE = { robloxName: 'Builderman', displayName: 'Bob', discordName: 'max_mustermann', robloxId: '156' };
const body = (c: Cfg): VerifyConfig => ({ enabled: c.enabled, verifiedRoleIds: c.verifiedRoleIds, unverifiedRoleIds: c.unverifiedRoleIds, nickname: c.nickname, autoOnJoin: c.autoOnJoin, logChannelId: c.logChannelId, panel: c.panel, binds: c.binds });
const problems = (c: Cfg) => [
  ...c.binds.filter((b) => !/^\d{1,15}$/.test(b.groupId)).map(() => 'Jede Gruppen-Bindung braucht eine Roblox-Gruppen-ID'),
  ...c.binds.filter((b) => b.minRank > b.maxRank).map(() => '„Bis“-Rang muss mindestens so groß wie „Von“ sein'),
  ...c.binds.filter((b) => !b.roleIds.length).map(() => 'Jede Gruppen-Bindung braucht mindestens eine Rolle'),
  ...(c.verifiedRoleIds.some((r) => c.unverifiedRoleIds.includes(r)) ? ['Eine Rolle kann nicht gleichzeitig „verifiziert“ und „nicht verifiziert“ sein'] : []),
  ...(!c.panel.buttonLabel.trim() ? ['Der Button braucht eine Beschriftung'] : []),
];
const newBind = (used: string[]): VerifyBind => { let n = used.length + 1; while (used.includes(`bind-${n}`)) n++; return { id: `bind-${n}`, groupId: '', minRank: 1, maxRank: 255, roleIds: [] }; };
const rank = (v: string) => Math.max(0, Math.min(255, Math.floor(Number(v) || 0)));

/** Administration → Roblox-Verifizierung (wie RoVer): je Server (oben links gewählt) oder gemeinsam. */
export function Verification() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const qc = useQueryClient();
  const [server] = useServer();
  const guilds = useGuilds();
  const key = ['verify-config', server];
  const q = useQuery({ queryKey: key, queryFn: () => api<Cfg>('/verification/config') });
  const [cfg, setCfg] = useState<Cfg>();
  const last = useRef<string>(undefined);
  // Serverstand übernehmen, solange hier nichts ungespeichert ist (Aktualisierung alle 5 s überschreibt keine Eingaben)
  useEffect(() => {
    if (!q.data) return;
    if (!cfg || JSON.stringify(body(cfg)) === last.current) setCfg(q.data); else setCfg({ ...cfg, own: q.data.own, panelMessageId: q.data.panelMessageId });
    last.current = JSON.stringify(body(q.data));
  }, [q.data]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const save = useMutation({ mutationFn: (c: Cfg) => api<Cfg>('/verification/config', { method: 'PUT', body: body(c) }), onSuccess: (r) => qc.setQueryData(key, r) });
  const panel = useMutation({
    mutationFn: async (c: Cfg) => { await api('/verification/config', { method: 'PUT', body: body(c) }); return api('/verification/panel', { method: 'POST' }); },
    onSuccess: () => { setMsg({ ok: true, text: 'Das Panel geht gleich in Discord raus.' }); void q.refetch(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  useAutosaveDraft(manage ? `verify:${server || 'all'}` : null, cfg ? body(cfg) : undefined, (c) => (cfg && !problems(cfg).length ? { method: 'PUT', path: '/verification/config', body: c, label: 'Roblox-Verifizierung' } : null));
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!cfg) return <SkeletonRows />;
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p });
  const setPanel = (p: Partial<Cfg['panel']>) => set({ panel: { ...cfg.panel, ...p } });
  const setBind = (i: number, p: Partial<VerifyBind>) => set({ binds: cfg.binds.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const serverName = guildName(guilds.data, server) ?? 'EN Polizei';
  const issues = problems(cfg);
  const nick = renderVerifyNickname(cfg.nickname, SAMPLE);
  return (
    <>
      <PageHeader title="Roblox-Verifizierung" subtitle="Wie bei RoVer: Mitglieder verknüpfen ihr Roblox-Konto mit Discord und bekommen automatisch Rollen und ihren Roblox-Namen als Nickname." />
      <p className="mb-4 rounded-lg border border-line bg-panel-2/40 p-3 text-sm text-muted">
        {server ? (cfg.own ? <>Eigene Einstellungen für <b>{serverName}</b>.</> : <>{serverName} nutzt die gemeinsamen Einstellungen – beim Speichern entstehen eigene für diesen Server.</>) : <>Gemeinsame Einstellungen für alle Server ohne eigene.</>}
        {' '}So läuft es: Mitglied klickt <b>Verifizieren</b> (Panel oder <code>/verifizieren</code>) → <b>Mit Roblox anmelden</b> → meldet sich direkt bei Roblox an → bekommt Rollen und Nickname. Eine Verifizierung gilt auf allen Servern.
      </p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-3 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      <div className="grid gap-4">
        <OAuthCard manage={manage} />
        <Card title="Grundeinstellungen">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Box title="Verifizierung" desc="An: Panel, /verifizieren und automatische Rollen funktionieren auf diesem Server.">
              <div className="flex items-center gap-2"><Toggle label="Verifizierung aktiv" checked={cfg.enabled} onChange={(v) => set({ enabled: v })} /><span className="text-sm">{cfg.enabled ? 'An' : 'Aus'}</span></div>
            </Box>
            <Box title={`Verifiziert-Rollen: ${cfg.verifiedRoleIds.length}`} desc="Bekommt jeder, der sich verifiziert hat."><RolePicker ariaLabel="Verifiziert-Rollen" disabled={!manage} max={25} value={cfg.verifiedRoleIds} onChange={(ids) => set({ verifiedRoleIds: ids })} /></Box>
            <Box title={`Nicht-verifiziert-Rollen: ${cfg.unverifiedRoleIds.length}`} desc="Bekommt, wer noch nicht verifiziert ist – fällt nach der Verifizierung weg."><RolePicker ariaLabel="Nicht-verifiziert-Rollen" disabled={!manage} max={25} value={cfg.unverifiedRoleIds} onChange={(ids) => set({ unverifiedRoleIds: ids })} /></Box>
            <Box title="Nickname" desc="Vorlage für den Discord-Nickname; leer = Nickname nicht ändern (höchstens 32 Zeichen).">
              <Input aria-label="Nickname-Vorlage" disabled={!manage} maxLength={64} placeholder="z. B. {roblox-name}" value={cfg.nickname} onChange={(e) => set({ nickname: e.target.value })} />
              <p className="text-xs text-muted">Beispiel: <b className="text-fg">{nick ?? '— (bleibt wie er ist)'}</b></p>
              <ul className="flex flex-wrap gap-1 text-xs">{Object.entries(VERIFY_NICK_VARS).map(([k, v]) => <li key={k}><button type="button" disabled={!manage} title={v} className="rounded border border-line px-1.5 py-0.5 font-mono text-fg hover:bg-panel-2" onClick={() => set({ nickname: `${cfg.nickname}${k}` })}>{k}</button></li>)}</ul>
            </Box>
            <Box title="Beim Beitritt" desc="Verifizierte bekommen sofort Rollen und Nickname, alle anderen die Nicht-verifiziert-Rollen.">
              <div className="flex items-center gap-2"><Toggle label="Automatisch beim Beitritt" checked={cfg.autoOnJoin} onChange={(v) => set({ autoOnJoin: v })} /><span className="text-sm">{cfg.autoOnJoin ? 'An' : 'Aus'}</span></div>
            </Box>
            <Box title="Log-Kanal" desc="Meldung bei jeder Verifizierung und beim Entfernen (leer = keine)."><ChannelPicker ariaLabel="Verifizierungs-Log-Kanal" disabled={!manage} value={cfg.logChannelId} onChange={(id) => set({ logChannelId: id })} /></Box>
          </div>
          <p className="mt-3 text-xs text-muted">Die Bot-Rolle muss in Discord <b>über</b> allen Rollen stehen, die er vergibt, und braucht „Rollen verwalten“ und „Spitznamen verwalten“. Den Server-Besitzer kann Discord nicht umbenennen.</p>
        </Card>

        <Card title="Panel" actions={manage && <Button size="sm" disabled={panel.isPending || !cfg.panel.channelId || !!issues.length} onClick={() => panel.mutate(cfg)}>{cfg.panelMessageId ? 'Panel aktualisieren' : 'Panel senden'}</Button>}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid content-start gap-3">
              <Box title="Kanal" desc="Hier steht das Panel mit dem Verifizieren-Button (z. B. #verifizieren)."><ChannelPicker ariaLabel="Panel-Kanal" disabled={!manage} value={cfg.panel.channelId} onChange={(id) => setPanel({ channelId: id })} /></Box>
              <Box title="Titel" desc="Überschrift des Panels."><Input aria-label="Panel-Titel" disabled={!manage} maxLength={256} value={cfg.panel.title} onChange={(e) => setPanel({ title: e.target.value })} /></Box>
              <Box title="Text" desc="Erklärung unter der Überschrift (Markdown wie in Discord)."><Textarea aria-label="Panel-Text" disabled={!manage} rows={4} maxLength={4000} value={cfg.panel.message} onChange={(e) => setPanel({ message: e.target.value })} /></Box>
              <div className="grid gap-3 sm:grid-cols-2">
                <Box title="Farbe" desc="Streifen links am Panel."><input type="color" aria-label="Panel-Farbe" disabled={!manage} className="h-9 w-16 cursor-pointer rounded border border-line bg-transparent" value={cfg.panel.color} onChange={(e) => setPanel({ color: e.target.value })} /></Box>
                <Box title="Button" desc="Beschriftung des Buttons."><Input aria-label="Button-Beschriftung" disabled={!manage} maxLength={80} value={cfg.panel.buttonLabel} onChange={(e) => setPanel({ buttonLabel: e.target.value })} /></Box>
              </div>
            </div>
            <div className="grid content-start gap-2">
              <p className="text-xs font-semibold uppercase text-muted">Vorschau</p>
              <DiscordPreview message={{ embeds: [{ title: cfg.panel.title, description: cfg.panel.message, color: hexColor(cfg.panel.color, 0x22c55e) }], buttons: [{ id: 'verify:start', label: cfg.panel.buttonLabel || 'Verifizieren', style: 'success', emoji: '✅' }] }} />
              <p className="text-xs text-muted">{cfg.panelMessageId ? 'Das Panel steht schon in Discord – „Panel aktualisieren“ bearbeitet es.' : 'Noch nicht gesendet.'} Statt des Panels geht auch <code>/verifizieren</code>; <code>/aktualisieren</code> setzt Rollen und Nickname neu, <code>/whois</code> zeigt das Roblox-Konto eines Mitglieds.</p>
            </div>
          </div>
        </Card>

        <Card title="Gruppen-Rollen" actions={manage && <Button size="sm" variant="secondary" onClick={() => set({ binds: [...cfg.binds, newBind(cfg.binds.map((b) => b.id))] })}><Plus size={14} className="mr-1" />Bindung hinzufügen</Button>}>
          {!cfg.binds.length ? <EmptyState text="Keine Gruppen-Rollen." hint="Damit bekommen Mitglieder Discord-Rollen nach ihrem Rang in einer Roblox-Gruppe (z. B. Rang 50–100 in deiner Polizei-Gruppe → Rolle „Sergeant“). Die Gruppen-ID steht in der Adresse der Gruppe: roblox.com/communities/ID/…" /> : (
            <div className="grid gap-2">{cfg.binds.map((b, i) => (
              <div key={b.id} className="grid items-end gap-2 rounded-lg border border-line p-3 md:grid-cols-[10rem_6rem_6rem_1fr_auto]">
                <label className="grid gap-1 text-xs text-muted">Gruppen-ID<Input aria-label={`Gruppen-ID ${i + 1}`} disabled={!manage} inputMode="numeric" maxLength={15} placeholder="z. B. 1234567" value={b.groupId} onChange={(e) => setBind(i, { groupId: e.target.value.replace(/\D/g, '') })} /></label>
                <label className="grid gap-1 text-xs text-muted">Von Rang<Input aria-label={`Von Rang ${i + 1}`} disabled={!manage} type="number" min={0} max={255} value={b.minRank} onChange={(e) => setBind(i, { minRank: rank(e.target.value) })} /></label>
                <label className="grid gap-1 text-xs text-muted">Bis Rang<Input aria-label={`Bis Rang ${i + 1}`} disabled={!manage} type="number" min={0} max={255} value={b.maxRank} onChange={(e) => setBind(i, { maxRank: rank(e.target.value) })} /></label>
                <div className="grid gap-1 text-xs text-muted">Rollen<RolePicker ariaLabel={`Rollen Bindung ${i + 1}`} disabled={!manage} max={10} value={b.roleIds} onChange={(ids) => setBind(i, { roleIds: ids })} /></div>
                {manage && <Button size="sm" variant="ghost" aria-label={`Bindung ${i + 1} löschen`} onClick={() => set({ binds: cfg.binds.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>}
              </div>
            ))}</div>
          )}
          <p className="mt-2 text-xs text-muted">Ränge gehen von 1 (Mitglied) bis 255 (Besitzer) – sie stehen in Roblox unter Gruppe → Konfigurieren → Rollen. Wer nicht (mehr) passt, verliert die Rolle beim nächsten <code>/aktualisieren</code> oder Beitritt.</p>
        </Card>

        <Members manage={manage} />
      </div>
      {save.error && <p role="alert" className="mt-3 text-sm text-danger">{errText(save.error)}</p>}
      {issues.length > 0 && <p role="alert" className="mt-3 text-sm text-warning">Noch nicht gespeichert: {[...new Set(issues)].join(' · ')}.</p>}
      {manage && (
        <div className="sticky bottom-2 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
          <span className="text-sm text-muted">Änderungen werden automatisch gespeichert.</span>
          <Button variant="secondary" disabled={save.isPending || !!issues.length} onClick={() => save.mutate(cfg)}>Jetzt speichern</Button>
          <Button variant="ghost" onClick={() => setPanel({ title: DEFAULT_VERIFY_CONFIG.panel.title, message: DEFAULT_VERIFY_CONFIG.panel.message, buttonLabel: DEFAULT_VERIFY_CONFIG.panel.buttonLabel, color: DEFAULT_VERIFY_CONFIG.panel.color })}>Standardtexte</Button>
        </div>
      )}
    </>
  );
}

interface OAuth { enabled: boolean; fromEnv: boolean; clientId: string; hasSecret: boolean; allowCode: boolean; redirectUri: string }
/** „Mit Roblox anmelden“ einrichten: OAuth-App bei Roblox, Client-ID + Secret hier (das Secret wird nie wieder angezeigt). */
function OAuthCard({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['verify-oauth'], queryFn: () => api<OAuth>('/verification/oauth') });
  const [id, setId] = useState<string>();
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);
  const save = useMutation({ mutationFn: (allowCode?: boolean) => api<OAuth>('/verification/oauth', { method: 'PUT', body: { clientId: (id ?? q.data?.clientId ?? '').trim(), allowCode: allowCode ?? q.data?.allowCode ?? true, ...(secret.trim() ? { clientSecret: secret.trim() } : {}) } }), onSuccess: (r) => { qc.setQueryData(['verify-oauth'], r); setSecret(''); setId(undefined); } });
  if (!q.data) return q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <SkeletonRows rows={2} />;
  const o = q.data, clientId = id ?? o.clientId;
  return (
    <Card title={<span className="flex items-center gap-2">Mit Roblox anmelden {o.enabled ? <Badge tone="success">eingerichtet</Badge> : <Badge tone="warning">nicht eingerichtet</Badge>}</span>}>
      {!o.enabled && <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">Bis die Roblox-Anmeldung eingerichtet ist, verifizieren sich Mitglieder über einen Code in ihrem Roblox-Profil.</p>}
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Auf <a className="text-fg underline" href="https://create.roblox.com/dashboard/credentials?activeTab=OAuthTab" target="_blank" rel="noreferrer">create.roblox.com → Zugangsdaten → OAuth 2.0-Apps</a> eine App anlegen.</li>
        <li>Berechtigungen (Scopes) <b className="text-fg">openid</b> und <b className="text-fg">profile</b> wählen.</li>
        <li>Als Weiterleitungs-URL (Redirect URL) diese Adresse eintragen:</li>
      </ol>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded border border-line bg-bg px-2 py-1.5 text-xs">{o.redirectUri}</code>
        <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(o.redirectUri).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Kopiert' : 'Kopieren'}</Button>
      </div>
      {o.fromEnv ? <p className="text-sm text-muted">Client-ID und Secret kommen aus den Umgebungsvariablen <code>ROBLOX_CLIENT_ID</code>/<code>ROBLOX_CLIENT_SECRET</code>.</p> : (
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="grid gap-1 text-xs text-muted">Client-ID<Input aria-label="Roblox Client-ID" disabled={!manage} inputMode="numeric" placeholder="z. B. 1234567890123456789" value={clientId} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="grid gap-1 text-xs text-muted">Client-Secret<Input aria-label="Roblox Client-Secret" type="password" autoComplete="off" disabled={!manage} placeholder={o.hasSecret ? '•••••• (gespeichert – leer lassen zum Behalten)' : 'Secret einfügen'} value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
          {manage && <Button disabled={save.isPending || (clientId === o.clientId && !secret.trim()) || (!!clientId && !o.hasSecret && !secret.trim())} onClick={() => save.mutate(undefined)}>Speichern</Button>}
        </div>
      )}
      {o.enabled && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Toggle label="Mit Code verifizieren zusätzlich anbieten" checked={o.allowCode} onChange={(v) => manage && save.mutate(v)} />
          <span>Zusätzlich <b>Mit Code verifizieren</b> anbieten <span className="text-xs text-muted">– solange Roblox eure App noch nicht freigegeben hat (vorher geht die Roblox-Anmeldung nur für wenige Konten). Nach der Freigabe abschalten.</span></span>
        </label>
      )}
      {save.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(save.error)}</p>}
    </Card>
  );
}

/** Verifizierte Mitglieder: suchen, Rollen neu setzen, Verifizierung entfernen. */
function Members({ manage }: { manage: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const q = useQuery({ queryKey: ['verify-links', search, page], queryFn: () => api<{ items: Link[]; total: number; pageSize: number }>('/verification/links', { query: { q: search.trim() || undefined, page } }) });
  const remove = useMutation({
    mutationFn: (l: Link) => api(`/verification/links/${l.discordId}`, { method: 'DELETE' }),
    onSuccess: (_r, l) => { setMsg({ ok: true, text: `Verifizierung von ${l.robloxName} entfernt – Rollen werden gleich angepasst.` }); void q.refetch(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const refresh = useMutation({
    mutationFn: (l: Link) => api(`/verification/links/${l.discordId}/refresh`, { method: 'POST' }),
    onSuccess: (_r, l) => setMsg({ ok: true, text: `Rollen und Nickname von ${l.robloxName} werden gleich neu gesetzt.` }), onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;
  return (
    <Card title={`Verifizierte Mitglieder${q.data ? ` (${q.data.total})` : ''}`} actions={<div className="w-56"><Input aria-label="Verifizierte suchen" className="py-1 text-sm" placeholder="Roblox- oder Discord-Name, ID …" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>}>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-2 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.items.length ? <EmptyState text={search ? 'Niemand gefunden.' : 'Noch niemand verifiziert.'} /> : (
        <>
          <div className="table-scroll">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted"><tr><th className="p-2">Discord</th><th>Roblox</th><th>Anzeigename</th><th>Verifiziert</th>{manage && <th />}</tr></thead>
              <tbody>{q.data.items.map((l) => (
                <tr key={l.discordId} className="border-b border-line/60 last:border-0">
                  <td className="p-2"><span className="font-medium">{l.discordName ?? '—'}</span><span className="block font-mono text-xs text-muted">{l.discordId}</span></td>
                  <td><a href={l.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{l.robloxName}<ExternalLink size={12} aria-hidden /></a> <Badge tone="neutral">{l.robloxId}</Badge></td>
                  <td>{l.displayName}</td>
                  <td className="whitespace-nowrap text-xs text-muted">{fmt(l.verifiedAt)}</td>
                  {manage && <td className="whitespace-nowrap py-1 text-right">
                    <Button size="sm" variant="ghost" aria-label={`Rollen von ${l.robloxName} neu setzen`} title="Rollen und Nickname neu setzen" disabled={refresh.isPending} onClick={() => refresh.mutate(l)}><RefreshCw size={14} /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Verifizierung von ${l.robloxName} entfernen`} disabled={remove.isPending} onClick={() => { if (confirm(`Verifizierung von ${l.robloxName} entfernen? Die Person verliert die Verifiziert-Rollen.`)) remove.mutate(l); }}><Trash2 size={14} className="text-danger" /></Button>
                  </td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pages > 1 && <div className="mt-2 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><span className="text-muted">Seite {page} von {pages}</span><Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button></div>}
        </>
      )}
    </Card>
  );
}
