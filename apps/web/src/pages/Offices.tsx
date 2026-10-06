import { useState } from 'react';
import { Avatar, STATUS, useRoster, type RosterMember } from '../components/TeamRoster';
import { Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows } from '../components/ui';

/** 🏢 Büros: Teammitglieder nach Büro (Werte aus Einstellungen → Teamstruktur, gepflegt in der Personalakte). */
export function Offices() {
  const q = useRoster();
  const [t, setT] = useState('');
  const groups = new Map<string, RosterMember[]>();
  for (const o of q.data?.structure.offices ?? []) groups.set(o, []);
  for (const m of q.data?.members ?? []) {
    if (t && !`${m.name} ${m.rank ?? ''} ${m.office ?? ''}`.toLowerCase().includes(t.toLowerCase())) continue;
    const k = m.office ?? 'Ohne Büro';
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  return (
    <>
      <PageHeader title="🏢 Büros" subtitle="Wer in welchem Büro arbeitet – aktualisiert sich mit der Teamliste (mindestens alle 60 Sekunden)." />
      <Input aria-label="Büros durchsuchen" placeholder="🔍 Name, Dienstgrad oder Büro" className="mb-4 max-w-md" value={t} onChange={(e) => setT(e.target.value)} />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !groups.size ? <EmptyState text="Noch keine Büros." hint="Büros legst du unter Einstellungen → Teamstruktur an und ordnest sie in der Personalakte zu." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...groups].map(([office, members]) => (
            <Card key={office} title={`🏢 ${office} (${members.length})`}>
              {!members.length ? <p className="text-sm text-muted">Niemand zugeordnet.</p> : (
                <ul className="space-y-1.5">{members.map((m) => (
                  <li key={m.key} className="flex items-center gap-2 text-sm"><Avatar src={m.avatar} name={m.name} size={24} /><span className="min-w-0 flex-1 truncate">{m.name}</span><span className="text-xs text-muted">{m.rank ?? ''}</span><span title={STATUS[m.status].label}>{STATUS[m.status].dot}</span></li>
                ))}</ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
