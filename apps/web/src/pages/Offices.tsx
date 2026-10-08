import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Avatar, STATUS, useRoster, type RosterMember } from '../components/TeamRoster';
import { VoiceWidget } from '../components/VoiceWidget';
import { Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, Tabs } from '../components/ui';

const VoiceSupport = lazy(() => import('./tickets/VoiceSupport').then((m) => ({ default: m.VoiceSupport })));
interface VoiceChannel { id: string; guildId: string; name: string; members: { id: string }[] }
interface Talk { name: string; url: string }

/** Discord-ID → Sprachkanal (Name + Discord-Link zum Beitreten), in dem die Person gerade ist (Voice-Daten vom Bot, live). */
function useTalks() {
  const allowed = useAuth().can('dashboard.voice.view');
  useRealtime('team', ['team.voice'], [['team-voice']]);
  const q = useQuery({ queryKey: ['team-voice'], queryFn: () => api<{ channels: VoiceChannel[] }>('/team/voice'), refetchInterval: 5_000, enabled: allowed });
  const map = new Map<string, Talk>();
  for (const c of q.data?.channels ?? []) for (const m of c.members) map.set(m.id, { name: c.name, url: `https://discord.com/channels/${c.guildId}/${c.id}` });
  return map;
}

function OfficeList() {
  const q = useRoster();
  const talks = useTalks();
  const [t, setT] = useState('');
  const groups = new Map<string, RosterMember[]>();
  for (const o of q.data?.structure.offices ?? []) groups.set(o, []);
  for (const m of q.data?.members ?? []) {
    const talk = m.discordId ? talks.get(m.discordId)?.name ?? '' : '';
    if (t && !`${m.name} ${m.rank ?? ''} ${m.office ?? ''} ${talk}`.toLowerCase().includes(t.toLowerCase())) continue;
    const k = m.office ?? 'Ohne Büro';
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  return (
    <>
      <Input aria-label="Büros durchsuchen" placeholder="🔍 Name, Dienstgrad, Büro oder Talk" className="mb-4 max-w-md" value={t} onChange={(e) => setT(e.target.value)} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !groups.size ? <EmptyState text="Noch keine Büros." hint="Büros legst du unter Einstellungen → Teamstruktur an und ordnest sie in der Personalakte zu." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...groups].map(([office, members]) => {
            const inTalk = members.filter((m) => m.discordId && talks.has(m.discordId)).length;
            return (
              <Card key={office} title={`🏢 ${office} (${members.length})${inTalk ? ` · 🔊 ${inTalk} im Talk` : ''}`}>
                {!members.length ? <p className="text-sm text-muted">Niemand zugeordnet.</p> : (
                  <ul className="space-y-1.5">{members.map((m) => {
                    const talk = m.discordId ? talks.get(m.discordId) : undefined;
                    return (
                      <li key={m.key} className="flex items-center gap-2 text-sm">
                        <Avatar src={m.avatar} name={m.name} size={24} />
                        <span className="min-w-0 flex-1 truncate">{m.name}{talk && <span className="ml-1 rounded bg-success/15 px-1.5 py-0.5 text-xs text-success" title="Gerade in diesem Talk">🔊 {talk.name}</span>}</span>
                        {talk && <a href={talk.url} target="_blank" rel="noreferrer" className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary hover:bg-primary/25" title={`In Discord „${talk.name}“ öffnen und beitreten`}>🎧 Beitreten</a>}
                        <span className="text-xs text-muted">{m.rank ?? ''}</span><span title={STATUS[m.status].label}>{STATUS[m.status].dot}</span>
                      </li>
                    );
                  })}</ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/** 🏢 Büros: Teammitglieder nach Büro, wer gerade in welchem Talk ist, und der Sprach-Support (Warteraum) fürs Büro. */
export function Offices() {
  const { can } = useAuth();
  const tabs = ['Büros', ...(can('dashboard.voice.view') ? ['Wer ist in welchem Talk?'] : []), ...(can('ticket.view') ? ['Sprach-Support'] : [])];
  const [tab, setTab] = useState(() => (location.hash === '#support' && can('ticket.view') ? 'Sprach-Support' : 'Büros'));
  return (
    <>
      <PageHeader title="🏢 Büros" subtitle="Wer in welchem Büro arbeitet und gerade in welchem Talk ist – aktualisiert sich live. Im Tab Sprach-Support richtest du den Warteraum fürs Büro ein." />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'Büros' && <OfficeList />}
        {tab === 'Wer ist in welchem Talk?' && <Card title="🔊 Wer ist in welchem Talk?"><VoiceWidget /></Card>}
        {tab === 'Sprach-Support' && <Suspense fallback={<SkeletonRows />}><VoiceSupport embedded /></Suspense>}
      </div>
    </>
  );
}
