import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { useGuilds } from '../../lib/guilds';
import { useAutosaveDraft } from '../../lib/autosave';
import { Toggle } from '../../components/ApplicationSettings';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonRows } from '../../components/ui';

interface Group { id?: string; name: string; guildIds: string[]; shareRecords: boolean; shareSettings: boolean }
interface Counts { persons: number; vehicles: number }
interface Links { groups: Group[]; sharedRecords: string[]; counts?: { shared?: Counts; groups: Record<string, Counts | undefined>; own: Record<string, Counts | undefined> } }

const problems = (l: Links) => [
  ...l.groups.filter((g) => !g.name.trim()).map(() => 'Jede Gruppe braucht einen Namen'),
  ...l.groups.filter((g) => g.guildIds.length < 2).map((g) => `„${g.name || 'Gruppe'}“ braucht mindestens zwei Server`),
];
const countText = (c?: Counts) => (c ? `${c.persons} Personen · ${c.vehicles} Fahrzeuge` : '—');

/** Administration → Server-Verbund: Discord-Server sind standardmäßig getrennt; zusammen gehören sie nur per Gruppe oder gemeinsamem Bestand. */
export function ServerLinks() {
  const { can } = useAuth();
  const manage = can('settings.manage');
  const qc = useQueryClient();
  const guilds = useGuilds();
  const q = useQuery({ queryKey: ['server-links'], queryFn: () => api<Links>('/server-links') });
  const [l, setL] = useState<Links>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  // Eingaben behalten, Zahlen (Akten je Bereich) und neue IDs vom Server übernehmen
  useEffect(() => { if (q.data) setL((cur) => (cur ? { ...cur, counts: q.data.counts, groups: cur.groups.map((g, i) => ({ ...g, id: g.id ?? q.data.groups[i]?.id })) } : q.data)); }, [q.data]);
  const body = (x: Links) => ({ groups: x.groups.map(({ id, name, guildIds, shareRecords, shareSettings }) => ({ ...(id ? { id } : {}), name, guildIds, shareRecords, shareSettings })), sharedRecords: x.sharedRecords });
  const save = useMutation({ mutationFn: (x: Links) => api<Links>('/server-links', { method: 'PUT', body: body(x) }), onSuccess: (r) => { qc.setQueryData(['server-links'], r); setL(r); void qc.invalidateQueries(); } });
  useAutosaveDraft(manage ? 'server-links' : null, l ? body(l) : undefined, (x) => (l && !problems(l).length ? { method: 'PUT', path: '/server-links', body: x, label: 'Server-Verbund' } : null));
  const move = useMutation({
    mutationFn: (guildId: string) => api<Counts>('/server-links/move-shared', { method: 'POST', body: { guildId } }),
    onSuccess: (r) => { setMsg({ ok: true, text: `${r.persons} Personen und ${r.vehicles} Fahrzeuge verschoben.` }); void q.refetch(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!l) return <SkeletonRows />;
  const all = guilds.data ?? [];
  const nameOf = (id: string) => all.find((g) => g.id === id)?.name ?? id;
  const grouped = new Set(l.groups.flatMap((g) => g.guildIds));
  const setGroup = (i: number, p: Partial<Group>) => setL({ ...l, groups: l.groups.map((g, j) => (j === i ? { ...g, ...p } : g)) });
  /** Server in die Gruppe aufnehmen/entfernen; aufgenommene Server verlassen den gemeinsamen Bestand (die Gruppe entscheidet). */
  const toggleGuild = (i: number, id: string, on: boolean) => setL({
    ...l, sharedRecords: on ? l.sharedRecords.filter((x) => x !== id) : l.sharedRecords,
    groups: l.groups.map((g, j) => (j === i ? { ...g, guildIds: on ? [...new Set([...g.guildIds, id])] : g.guildIds.filter((x) => x !== id) } : g)),
  });
  const free = all.filter((g) => !grouped.has(g.id));
  const issues = problems(l);
  return (
    <>
      <PageHeader title="Server-Verbund" subtitle="Jeder Discord-Server ist standardmäßig getrennt. Hier stellst du ein, welche Server zusammengehören: verbundene Server (Gruppe) teilen Akten und/oder Einstellungen." />
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-3 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      {!all.length && <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">Der Bot hat noch keine Server gemeldet – erst wenn er online ist, erscheinen sie hier.</p>}
      <div className="grid gap-4">
        <Card title={<span className="flex items-center gap-2"><Link2 size={16} aria-hidden />Gruppen (verbundene Server)</span>}
          actions={manage && <Button size="sm" onClick={() => setL({ ...l, groups: [...l.groups, { name: `Gruppe ${l.groups.length + 1}`, guildIds: [], shareRecords: true, shareSettings: false }] })}><Plus size={14} className="mr-1" />Gruppe anlegen</Button>}>
          {!l.groups.length ? <EmptyState text="Keine Gruppen – jeder Server ist eigenständig." hint="Eine Gruppe verbindet z. B. den Polizei- und den SEK-Server: gleiche Personen-/Fahrzeugakten und auf Wunsch dieselben Einstellungen." /> : (
            <div className="grid gap-3">{l.groups.map((g, i) => (
              <div key={g.id ?? i} className="grid gap-3 rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input aria-label={`Name Gruppe ${i + 1}`} disabled={!manage} className="max-w-xs" maxLength={60} value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} />
                  {g.id && <Badge tone="info">{countText(l.counts?.groups[g.id])}</Badge>}
                  {manage && <Button size="sm" variant="ghost" className="ml-auto" aria-label={`Gruppe ${g.name} löschen`} onClick={() => setL({ ...l, groups: l.groups.filter((_, j) => j !== i) })}><Trash2 size={14} /></Button>}
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Server in ${g.name}`}>
                  {all.filter((x) => g.guildIds.includes(x.id) || !grouped.has(x.id)).map((x) => (
                    <label key={x.id} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${g.guildIds.includes(x.id) ? 'border-primary bg-primary/10' : 'border-line'}`}>
                      <input type="checkbox" disabled={!manage} checked={g.guildIds.includes(x.id)} onChange={(e) => toggleGuild(i, x.id, e.target.checked)} />{x.name}
                    </label>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm"><Toggle label={`${g.name}: Akten teilen`} checked={g.shareRecords} onChange={(v) => setGroup(i, { shareRecords: v })} />Akten teilen <span className="text-xs text-muted">(Personen, Fahrzeuge)</span></label>
                  <label className="flex items-center gap-2 text-sm"><Toggle label={`${g.name}: Einstellungen teilen`} checked={g.shareSettings} onChange={(v) => setGroup(i, { shareSettings: v })} />Einstellungen teilen</label>
                  {g.shareSettings && g.guildIds.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">Haupt-Server
                      <Select aria-label={`Haupt-Server ${g.name}`} disabled={!manage} className="w-auto" value={g.guildIds[0]} onChange={(e) => setGroup(i, { guildIds: [e.target.value, ...g.guildIds.filter((x) => x !== e.target.value)] })}>{g.guildIds.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</Select>
                    </label>
                  )}
                </div>
                <p className="text-xs text-muted">
                  {g.shareRecords ? 'Alle Server der Gruppe sehen dieselben Personen- und Fahrzeugakten.' : 'Jeder Server der Gruppe hat eigene Akten.'}{' '}
                  {g.shareSettings ? `Bewerbungen, Qualifikationen, Willkommen, Design, Name und Teamstruktur kommen vom Haupt-Server (${nameOf(g.guildIds[0] ?? '')}) – Änderungen auf einem Server gelten für die ganze Gruppe.` : 'Einstellungen bleiben je Server.'}
                </p>
              </div>
            ))}</div>
          )}
        </Card>
        <Card title="Server ohne Gruppe">
          {!free.length ? <p className="text-sm text-muted">Alle Server sind in einer Gruppe.</p> : (
            <ul className="grid gap-2">{free.map((g) => {
              const own = !l.sharedRecords.includes(g.id);
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2 text-sm">
                  <span className="font-medium">{g.name}</span>
                  <Select aria-label={`Akten ${g.name}`} disabled={!manage} className="w-auto" value={own ? 'own' : 'shared'} onChange={(e) => setL({ ...l, sharedRecords: e.target.value === 'own' ? l.sharedRecords.filter((x) => x !== g.id) : [...l.sharedRecords, g.id] })}>
                    <option value="own">Getrennt – eigene Akten (Standard)</option><option value="shared">Gemeinsamer Bestand (mit allen Servern, die ihn nutzen)</option>
                  </Select>
                  <Badge tone="neutral">{own ? countText(l.counts?.own[g.id]) : countText(l.counts?.shared)}</Badge>
                  {own && manage && !q.data?.sharedRecords.includes(g.id) && !!(l.counts?.shared?.persons || l.counts?.shared?.vehicles) && <Button size="sm" variant="ghost" disabled={move.isPending} title="Alle Akten aus dem gemeinsamen Bestand in die eigenen Akten dieses Servers verschieben" onClick={() => move.mutate(g.id)}>Gemeinsame Akten hierher verschieben</Button>}
                </li>
              );
            })}</ul>
          )}
          {!!(l.counts?.shared?.persons || l.counts?.shared?.vehicles) && <p className="mt-2 rounded border border-warning/40 bg-warning/10 p-2 text-xs text-warning">Im gemeinsamen Bestand liegen noch {countText(l.counts?.shared)} (z. B. von früher, als Server noch zusammen waren). Getrennte Server sehen sie nicht – mit „Gemeinsame Akten hierher verschieben“ ordnest du sie einem Server zu.</p>}
          <p className="mt-2 text-xs text-muted">Neue Akten (von Hand oder automatisch aus ER:LC) landen im Bereich des Servers, auf dem sie entstehen. Bei „Alle Server“ oben links siehst du alle Akten.</p>
        </Card>
      </div>
      {save.error && <p role="alert" className="mt-3 text-sm text-danger">{errText(save.error)}</p>}
      {issues.length > 0 && <p role="alert" className="mt-3 text-sm text-warning">Noch nicht gespeichert: {issues.join(' · ')}.</p>}
      {manage && (
        <div className="sticky bottom-2 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
          <span className="text-sm text-muted">Änderungen werden automatisch gespeichert.</span>
          <Button variant="secondary" disabled={save.isPending || !!issues.length} onClick={() => save.mutate(l)}>Jetzt speichern</Button>
        </div>
      )}
    </>
  );
}
