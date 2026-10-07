import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, EmptyState, ErrorState, fmt, Input, PageHeader, Select, SkeletonRows, Tabs } from '../components/ui';
import { FormModal } from '../components/FormModal';

interface Member { userId: string; displayName: string; callsign: string | null; rank: string | null; since: string }
interface Report { id: string; number: string; occurredAt: string; missionType: string; description: string; authorName: string; authorCallsign: string | null }
interface Me { member: boolean }
interface Candidate { userId: string; name: string; username: string; callsign: string | null; rank: string | null; discordLinked: boolean }

/** SEK (Spezialeinsatzkommando): Mitglieder und Einsatzberichte (nur Mitglieder schreiben). Bewerbungen: Seite Qualifications. */
export function Sek() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const view = can('sek.view'), manage = can('sek.manage');
  const tabs = view ? ['Mitglieder', 'Einsatzberichte'] : [];
  const [tab, setTab] = useState(tabs[0] ?? '');
  const [modal, setModal] = useState<'report' | null>(null);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState<string>();
  const me = useQuery({ queryKey: ['sek-me'], queryFn: () => api<Me>('/sek/me') });
  const members = useQuery({ queryKey: ['sek-members'], queryFn: () => api<Member[]>('/sek/members'), enabled: view });
  const reports = useQuery({ queryKey: ['sek-reports'], queryFn: () => api<Report[]>('/sek/reports?limit=100'), enabled: view && tab === 'Einsatzberichte' });
  // alle aktiven Benutzer, die noch nicht im SEK sind (nicht nur Beamte mit Dienststatus)
  const officers = useQuery({ queryKey: ['sek-candidates'], queryFn: () => api<Candidate[]>('/sek/candidates'), enabled: manage && tab === 'Mitglieder' });
  const [find, setFind] = useState('');
  const refresh = () => { setErr(undefined); for (const k of ['sek-me', 'sek-members', 'sek-reports', 'sek-candidates']) void qc.invalidateQueries({ queryKey: [k] }); };
  const onError = (e: unknown) => setErr(e instanceof ApiError ? `${e.message}${e.requestId ? ` (Anfrage-ID ${e.requestId})` : ''}` : 'Fehlgeschlagen');
  const add = useMutation({ mutationFn: (userId: string) => api('/sek/members', { method: 'POST', body: { userId } }), onSuccess: () => { setPick(''); refresh(); }, onError });
  const remove = useMutation({ mutationFn: (userId: string) => api('/sek/members/remove', { method: 'POST', body: { userId } }), onSuccess: refresh, onError });

  const memberIds = new Set((members.data ?? []).map((m) => m.userId));
  const shownOfficers = (officers.data ?? []).filter((o) => !memberIds.has(o.userId) && (!find.trim() || `${o.name} ${o.username} ${o.callsign ?? ''} ${o.rank ?? ''}`.toLowerCase().includes(find.trim().toLowerCase())));
  const actions = (
    <>
      {me.data?.member && can('sek.report') && <Button onClick={() => setModal('report')}>Neuer Einsatzbericht</Button>}
    </>
  );
  return (
    <>
      <PageHeader title="SEK" subtitle="Spezialeinsatzkommando" actions={actions} />
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      {!tabs.length ? <EmptyState text={me.data?.member ? 'Du bist SEK-Mitglied.' : 'Nur SEK-Mitglieder sehen die Mitgliederliste und Berichte.'} hint="Bewirb dich über das Qualifikations-Panel auf dem Discord-Server." /> : <Tabs tabs={tabs} active={tab} onChange={setTab} />}
      <div className="mt-4">
        {tab === 'Mitglieder' && (
          <Card title={`Mitglieder (${members.data?.length ?? 0})`} actions={manage && (
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Beamten suchen" className="w-40" placeholder="🔍 Suchen" value={find} onChange={(e) => setFind(e.target.value)} />
              <Select aria-label="Beamter" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">{officers.isLoading ? 'Lädt …' : shownOfficers.length ? `Beamten hinzufügen… (${shownOfficers.length})` : 'Keine Benutzer gefunden'}</option>
                {shownOfficers.map((o) => <option key={o.userId} value={o.userId}>{o.callsign ? `${o.callsign} · ` : ''}{o.name}{o.rank ? ` (${o.rank})` : ''}{o.discordLinked ? '' : ' – ohne Discord'}</option>)}
              </Select>
              <Button disabled={!pick || add.isPending} onClick={() => add.mutate(pick)}>{add.isPending ? 'Wird hinzugefügt …' : 'Hinzufügen'}</Button>
            </div>
          )}>
            {members.isLoading ? <SkeletonRows /> : members.error ? <ErrorState error={members.error} onRetry={() => void members.refetch()} /> : !members.data?.length ? <EmptyState text="Noch keine SEK-Mitglieder." /> : (
              <ul className="divide-y divide-line">{members.data.map((m) => (
                <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
                  <span><strong>{m.callsign ?? '—'}</strong> {m.displayName}{m.rank && <span className="text-muted"> · {m.rank}</span>}<span className="ml-2 text-xs text-muted">seit {fmt(m.since)}</span></span>
                  {manage && <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(m.userId)}>Entfernen</Button>}
                </li>
              ))}</ul>
            )}
          </Card>
        )}
        {tab === 'Einsatzberichte' && (reports.isLoading ? <SkeletonRows /> : reports.error ? <ErrorState error={reports.error} onRetry={() => void reports.refetch()} /> : !reports.data?.length ? <EmptyState text="Noch keine SEK-Einsatzberichte." /> : (
          <div className="grid gap-3">{reports.data.map((r) => (
            <Card key={r.id} title={`${r.number} · ${r.missionType}`}>
              <p className="whitespace-pre-wrap text-sm">{r.description}</p>
              <p className="mt-2 text-xs text-muted">{fmt(r.occurredAt)} · {r.authorCallsign ? `${r.authorCallsign} · ` : ''}{r.authorName}</p>
            </Card>
          ))}</div>
        ))}
      </div>
      <FormModal open={modal === 'report'} onClose={() => setModal(null)} title="Neuer SEK-Einsatzbericht" endpoint="/sek/reports" invalidate={[['sek-reports']]}
        toBody={(v) => ({ ...v, ...(v.occurredAt ? { occurredAt: new Date(String(v.occurredAt)).toISOString() } : {}) })}
        fields={[{ name: 'occurredAt', label: 'Datum/Uhrzeit (leer = jetzt)', type: 'datetime' }, { name: 'missionType', label: 'Einsatzart (z. B. Geiselnahme, Razzia)', required: true, min: 2, max: 100 }, { name: 'description', label: 'Beschreibung', type: 'textarea', required: true, min: 5, max: 4000 }]} />
    </>
  );
}
