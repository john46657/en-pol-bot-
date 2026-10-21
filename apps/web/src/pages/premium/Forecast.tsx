import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Badge, Card, ErrorState, Input, PageHeader, Select, SkeletonRows } from '../../components/ui';
import { dt, Stat } from './common';

interface Est { value: number; low: number; high: number }
interface Anom { label: string; value: number; expected: number; direction: 'up' | 'down' }
interface Forecast {
  generatedAt: string; estimateNotice: string;
  basis: { from: string; to: string; weeks: number; timezone: string; dutySessions: number; incidents: number; reports: number; personnel: number; missing: string[] };
  confidence: Record<'duty' | 'incidents', { level: string; reason: string; label: string }>;
  weekly: { week: string; dutyHours: number; officers: number; incidents: number; reports: number; incompleteReports: number }[];
  heatmap: (number | null)[][]; demandHeatmap: (number | null)[][];
  byDepartment: { department: string; hours: number[]; total: number; officers: number }[];
  lowStaffing: { weekday: number; day: string; from: number; to: number; avg: number }[];
  hotspots: { weekday: number; hour: number; staff: number | null; incidents: number | null }[];
  estimates: { nextWeeksIncidents: Est[] | null; nextWeeksDutyHours: Est[] | null; incidentsPerDutyHour: number | null; neededDutyHoursNextWeek: number | null };
  anomalies: Record<'incidents' | 'dutyHours' | 'incompleteReports', Anom[]>;
  openTraining: { trainingsOpen: number; examsToGrade: number; upcomingSessions: number };
  suggestions: string[]; departments: string[];
}
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TONE: Record<string, 'danger' | 'warning' | 'success' | 'neutral'> = { NONE: 'danger', LOW: 'warning', MEDIUM: 'neutral', HIGH: 'success' };

function Bars({ rows, value, label }: { rows: Forecast['weekly']; value: (r: Forecast['weekly'][number]) => number; label: string }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div aria-label={label} className="flex h-28 items-end gap-1">
      {rows.map((r) => <div key={r.week} className="flex flex-1 flex-col items-center gap-0.5" title={`${r.week}: ${value(r)}`}><span className="text-[10px] tabular-nums text-muted">{value(r)}</span><div className="w-full rounded-t bg-primary/70" style={{ height: `${(value(r) / max) * 80}px` }} /><span className="text-[9px] text-muted">{r.week.slice(5)}</span></div>)}
    </div>
  );
}

/** Personalbedarfs- und Aktivitätsprognose – Schätzungen mit offengelegter Datenbasis; löst nichts aus. */
export function ForecastPage() {
  const [weeks, setWeeks] = useState(8);
  const [minStaff, setMinStaff] = useState(2);
  const [department, setDepartment] = useState('');
  const q = useQuery({ queryKey: ['forecast', weeks, minStaff, department], queryFn: () => api<Forecast>('/forecast', { query: { weeks, minStaff, department: department || undefined } }) });
  const f = q.data;
  return (
    <>
      <PageHeader title="📈 Personalbedarf & Aktivität" subtitle="Auswertung der gespeicherten Dienstzeiten, Einsätze, Berichte und Ausbildungen. Prognosen sind Schätzungen – sie lösen keine Maßnahmen aus." />
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">Zeitraum<Select aria-label="Zeitraum" className="w-auto" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>{[4, 8, 12, 26, 52].map((w) => <option key={w} value={w}>{w} Wochen</option>)}</Select></label>
        <label className="flex items-center gap-1">Mindestbesetzung<Input aria-label="Mindestbesetzung" type="number" min={0.5} max={50} step={0.5} className="w-20" value={minStaff} onChange={(e) => setMinStaff(Math.max(0.5, Number(e.target.value) || 1))} /></label>
        <label className="flex items-center gap-1">Abteilung<Select aria-label="Abteilung" className="w-auto" value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">alle</option>{(f?.departments ?? []).map((d) => <option key={d} value={d}>{d}</option>)}</Select></label>
      </div>
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : f && (
        <div className="grid gap-4">
          <p role="note" className="rounded-md border border-info/40 bg-info/10 p-2 text-sm">ℹ️ {f.estimateNotice} Datenbasis: {dt(f.basis.from)} – {dt(f.basis.to)} ({f.basis.weeks} volle Wochen, {f.basis.timezone}) · {f.basis.dutySessions} Schichten · {f.basis.incidents} Einsätze · {f.basis.reports} Berichte · {f.basis.personnel} Personalakten.</p>
          {f.basis.missing.length > 0 && <ul className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">{f.basis.missing.map((m) => <li key={m}>⚠️ {m}</li>)}</ul>}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Aussagekraft Dienstzeiten" value={<Badge tone={TONE[f.confidence.duty.level]}>{f.confidence.duty.label}</Badge>} hint={f.confidence.duty.reason} />
            <Stat label="Aussagekraft Einsätze" value={<Badge tone={TONE[f.confidence.incidents.level]}>{f.confidence.incidents.label}</Badge>} hint={f.confidence.incidents.reason} />
            <Stat label="Geschätzte Einsätze nächste Woche" value={f.estimates.nextWeeksIncidents ? `≈ ${f.estimates.nextWeeksIncidents[0]!.value}` : '—'} hint={f.estimates.nextWeeksIncidents ? `Spanne ${f.estimates.nextWeeksIncidents[0]!.low}–${f.estimates.nextWeeksIncidents[0]!.high} (Schätzung)` : 'zu wenige Daten (mind. 3 Wochen)'} />
            <Stat label="Benötigte Dienststunden (Schätzung)" value={f.estimates.neededDutyHoursNextWeek ?? '—'} hint={f.estimates.nextWeeksDutyHours ? `erwartet ≈ ${f.estimates.nextWeeksDutyHours[0]!.value} h` : 'zu wenige Daten'} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Dienststunden je Woche"><Bars rows={f.weekly} value={(r) => r.dutyHours} label="Dienststunden je Woche" /></Card>
            <Card title="Einsätze je Woche"><Bars rows={f.weekly} value={(r) => r.incidents} label="Einsätze je Woche" /></Card>
          </div>
          <Card title="Durchschnittliche Besetzung je Wochentag und Stunde">
            <div className="table-scroll"><table className="text-[10px]"><thead><tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} className="px-0.5 font-normal text-muted">{h}</th>)}</tr></thead>
              <tbody>{f.heatmap.map((row, d) => <tr key={d}><th className="pr-1 text-left font-normal">{DAYS[d]}</th>{row.map((v, h) => {
                const inc = f.demandHeatmap[d]?.[h] ?? 0;
                const low = v !== null && v < minStaff;
                return <td key={h} title={`${DAYS[d]} ${h}–${h + 1} Uhr: Ø ${v ?? '—'} im Dienst, Ø ${inc ?? 0} Einsätze`} className={`h-6 w-7 border border-panel text-center tabular-nums ${v === null ? 'bg-panel-2 text-muted' : low ? (inc ? 'bg-danger/40' : 'bg-warning/30') : 'bg-success/25'}`}>{v ?? '·'}</td>;
              })}</tr>)}</tbody></table></div>
            <p className="mt-1 text-[11px] text-muted">Grün = mindestens {minStaff} im Dienst · Gelb = darunter · Rot = darunter und im Mittel Einsätze in dieser Stunde · Grau = keine Messung.</p>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Vorschläge für die Schichtplanung (Schätzung)">
              {!f.suggestions.length ? <p className="text-sm text-muted">Keine Vorschläge – zu wenige Daten oder keine Engpässe.</p> : <ul className="grid gap-1 text-sm">{f.suggestions.map((s) => <li key={s}>• {s}</li>)}</ul>}
              {f.lowStaffing.length > 0 && <><p className="mt-2 text-xs font-medium">Zeiten unter der Mindestbesetzung</p><ul className="text-xs text-muted">{f.lowStaffing.slice(0, 14).map((w) => <li key={`${w.weekday}-${w.from}`}>{w.day} {w.from}–{w.to} Uhr: Ø {w.avg}</li>)}</ul></>}
            </Card>
            <Card title="Auffällige Veränderungen">
              {(['incidents', 'dutyHours', 'incompleteReports'] as const).map((k) => (
                <div key={k} className="mb-1 text-sm"><span className="text-xs text-muted">{{ incidents: 'Einsätze', dutyHours: 'Dienststunden', incompleteReports: 'Unvollständige Berichte' }[k]}: </span>
                  {f.anomalies[k].length ? f.anomalies[k].map((a) => <Badge key={a.label} tone="warning">{a.label}: {a.value} ({a.direction === 'up' ? '↑' : '↓'} erwartet ≈ {a.expected})</Badge>) : <span className="text-xs text-muted">keine</span>}
                </div>
              ))}
              <p className="mt-2 text-xs text-muted">Offene Ausbildungen: {f.openTraining.trainingsOpen} · unbewertete Prüfungen: {f.openTraining.examsToGrade} · geplante Ausbildungstermine: {f.openTraining.upcomingSessions}</p>
            </Card>
          </div>
          <Card title="Verfügbarkeit nach Abteilung (Dienststunden je Woche)">
            <div className="table-scroll"><table className="w-full text-sm"><thead className="text-left text-xs text-muted"><tr><th>Abteilung</th><th>Aktive Beamte</th>{f.weekly.map((w) => <th key={w.week} className="text-right">{w.week.slice(5)}</th>)}<th className="text-right">Summe</th></tr></thead>
              <tbody>{f.byDepartment.map((d) => <tr key={d.department} className="border-t border-line"><td className="py-1">{d.department}</td><td>{d.officers}</td>{d.hours.map((h, i) => <td key={i} className="text-right tabular-nums">{h}</td>)}<td className="text-right font-medium tabular-nums">{d.total}</td></tr>)}</tbody></table></div>
            <p className="mt-1 text-[11px] text-muted">Wochen mit Bericht-Unvollständigkeit: {f.weekly.map((w) => `${w.week.slice(5)}: ${w.incompleteReports}/${w.reports}`).join(' · ')}</p>
          </Card>
        </div>
      )}
    </>
  );
}
