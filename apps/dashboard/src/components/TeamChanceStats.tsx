import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';

interface Stats {
  started: number;
  submitted: number;
  today: number;
  week: number;
  month: number;
  open: number;
  onHold: number;
  accepted: number;
  denied: number;
  cancelled: number;
  expired: number;
  withdrawn: number;
  avgProcessingMinutes: number | null;
  acceptanceRate: number | null;
  denialRate: number | null;
}
interface Data {
  total: Stats;
  perApplication: (Stats & { applicationId: string; name: string; icon: string | null })[];
}
const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)} %`);
const dur = (m: number | null) => (m === null ? '–' : m < 60 ? `${m} Min.` : m < 1440 ? `${Math.round(m / 6) / 10} Std.` : `${Math.round(m / 144) / 10} Tage`);

/** Auswertung der Bewerbungsarten (Team-Chance): gesamt oder je Art. Ohne Recht „Statistiken ansehen“ unsichtbar. */
export function TeamChanceStats({ guildId }: { guildId: string }) {
  const q = useQuery({ queryKey: ['team-chance-stats', guildId], queryFn: () => api<Data>(`/guilds/${guildId}/analytics/team-chance`), retry: false });
  const [sel, setSel] = useState('');
  if (!q.data) return null;
  const s = sel ? q.data.perApplication.find((a) => a.applicationId === sel) ?? q.data.total : q.data.total;
  const tiles: [string, string | number][] = [
    ['Bewerbungen insgesamt', s.submitted],
    ['Heute', s.today],
    ['Diese Woche', s.week],
    ['Diesen Monat', s.month],
    ['Offen', s.open],
    ['davon zurückgestellt', s.onHold],
    ['Angenommen', s.accepted],
    ['Abgelehnt', s.denied],
    ['Abgebrochen', s.cancelled],
    ['Abgelaufen', s.expired],
    ['Ø Bearbeitungszeit', dur(s.avgProcessingMinutes)],
    ['Annahmequote', pct(s.acceptanceRate)],
    ['Ablehnungsquote', pct(s.denialRate)],
  ];
  return (
    <section className="card comp" aria-label="Auswertung">
      <div className="row-head">
        <h2>Auswertung</h2>
        <select aria-label="Auswertung für" value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">Alle Bewerbungsarten</option>
          {q.data.perApplication.map((a) => (
            <option key={a.applicationId} value={a.applicationId}>{a.icon ? `${a.icon} ` : ''}{a.name}</option>
          ))}
        </select>
      </div>
      <dl className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
        {tiles.map(([label, value]) => (
          <div key={label} className="card" style={{ padding: '8px' }}>
            <dt className="muted"><small>{label}</small></dt>
            <dd style={{ margin: 0, fontSize: '1.4em', fontWeight: 600 }}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted"><small>Ohne Testbewerbungen. Quoten beziehen sich auf entschiedene Bewerbungen, die Bearbeitungszeit auf Einreichen bis Entscheidung; „heute/Woche/Monat“ nach Einreichung (deutsche Zeit, Woche ab Montag).</small></p>
    </section>
  );
}
