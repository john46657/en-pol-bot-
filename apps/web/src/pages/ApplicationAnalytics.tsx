import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Clock, Hourglass, TrendingUp, X } from 'lucide-react';
import { api } from '../lib/api';
import { useServer } from '../lib/guilds';
import { Button, Card, EmptyState, ErrorState, PageHeader, Select, SkeletonRows } from '../components/ui';

interface Kpi { key: 'total' | 'approvalRate' | 'avgReviewMin' | 'pending' | 'completionRate'; value: number; change: number }
interface Stats {
  days: number; kpis: Kpi[]; overTime: { date: string; count: number; avg7: number }[]; breakdown: { APPROVED: number; PENDING: number; REJECTED: number };
  byType: { type: string; submitted: number; approvalRate: number; avgReviewMin: number }[]; reviewers: { id: string; name: string; reviewed: number; approvalRate: number; avgReviewMin: number }[];
  heat: number[][]; filters: { types: string[]; reviewers: { id: string; name: string }[] };
}

const dur = (min: number) => (min < 60 ? `${Math.round(min)}m` : min < 1440 ? `${Math.floor(min / 60)}h ${Math.round(min % 60)}m` : `${Math.floor(min / 1440)}T ${Math.round((min % 1440) / 60)}h`);
const pctTxt = (v: number) => `${v.toFixed(1)}%`;
/** Statusfarben sind reserviert und erscheinen immer mit Text (nie Farbe allein). */
const STATUS = [
  { key: 'APPROVED', label: 'Angenommen', color: 'var(--color-success)' },
  { key: 'PENDING', label: 'Offen', color: 'var(--color-warning)' },
  { key: 'REJECTED', label: 'Abgelehnt', color: 'var(--color-danger)' },
] as const;
const KPI_META: Record<Kpi['key'], { label: string; icon: typeof ClipboardList; fmt: (v: number) => string; goodUp: boolean }> = {
  total: { label: 'Bewerbungen gesamt', icon: ClipboardList, fmt: (v) => String(v), goodUp: true },
  approvalRate: { label: 'Annahmequote', icon: CheckCircle2, fmt: pctTxt, goodUp: true },
  avgReviewMin: { label: 'Ø Bearbeitungszeit', icon: Clock, fmt: dur, goodUp: false },
  pending: { label: 'Offen zur Prüfung', icon: Hourglass, fmt: (v) => String(v), goodUp: false },
  completionRate: { label: 'Erledigungsquote', icon: TrendingUp, fmt: pctTxt, goodUp: true },
};

/** Bewerbungs-Statistik (Polizei + Qualifikationen) – Filter oben, Kennzahlen mit Vergleich zur Vorperiode. */
export function ApplicationAnalytics() {
  const [server] = useServer();
  const [f, setF] = useState<{ type?: string; status?: string; reviewer?: string; days: number }>({ days: 30 });
  const q = useQuery({ queryKey: ['application-analytics', f, server], queryFn: () => api<Stats>('/applications/analytics', { query: { ...f } }) });
  const d = q.data;
  return (
    <>
      <PageHeader title="Bewerbungs-Statistik" subtitle="Polizei-Bewerbungen und Qualifikationen (SEK, Flugstaffel …)" actions={<Link to="/applications"><Button variant="secondary">← Bewerbungen</Button></Link>} />
      <Card className="mb-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-muted">Bewerbung<Select aria-label="Bewerbung" value={f.type ?? ''} onChange={(e) => setF({ ...f, type: e.target.value || undefined })}><option value="">Alle Arten</option>{d?.filters.types.map((t) => <option key={t}>{t}</option>)}</Select></label>
          <label className="grid gap-1 text-xs text-muted">Status<Select aria-label="Status" value={f.status ?? ''} onChange={(e) => setF({ ...f, status: e.target.value || undefined })}><option value="">Alle Status</option>{STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></label>
          <label className="grid gap-1 text-xs text-muted">Prüfer<Select aria-label="Prüfer" value={f.reviewer ?? ''} onChange={(e) => setF({ ...f, reviewer: e.target.value || undefined })}><option value="">Alle Prüfer</option>{d?.filters.reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></label>
          <label className="grid gap-1 text-xs text-muted">Zeitraum<Select aria-label="Zeitraum" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>{[7, 30, 90, 365].map((n) => <option key={n} value={n}>Letzte {n} Tage</option>)}</Select></label>
          {(f.type || f.status || f.reviewer) && <Button variant="ghost" className="ml-auto" onClick={() => setF({ days: f.days })}><X size={14} /> Filter zurücksetzen</Button>}
        </div>
      </Card>
      {q.isLoading ? <SkeletonRows /> : q.error || !d ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{d.kpis.map((k) => {
            const m = KPI_META[k.key], Icon = m.icon, good = k.change === 0 ? null : (k.change > 0) === m.goodUp;
            return (
              <div key={k.key} className="card border border-line p-4">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary"><Icon size={20} aria-hidden /></span><div><p className="text-xs text-muted">{m.label}</p><p className="text-2xl font-bold">{m.fmt(k.value)}</p></div></div>
                <p className="mt-2 text-xs text-muted"><span className={good === null ? '' : good ? 'text-success' : 'text-danger'}>{k.change > 0 ? '↑' : k.change < 0 ? '↓' : ''}{Math.abs(k.change).toFixed(1)}%</span> ggü. Vorperiode</p>
              </div>
            );
          })}</div>
          <div className="mb-3 grid gap-3 xl:grid-cols-4">
            <Card className="xl:col-span-2" title={<span className="flex flex-wrap items-center gap-3">Bewerbungen im Verlauf<span className="flex items-center gap-1 text-xs font-normal text-muted"><span className="h-2 w-2 rounded-full bg-primary" />Bewerbungen</span><span className="flex items-center gap-1 text-xs font-normal text-muted"><span className="w-3 border-t-2 border-dashed border-primary" />7-Tage-Schnitt</span><span className="rounded bg-panel-2 px-1.5 text-xs">Gesamt {d.overTime.reduce((n, x) => n + x.count, 0)}</span></span>}>
              <LineChart data={d.overTime} />
            </Card>
            <Card title="Status-Verteilung"><Donut b={d.breakdown} /></Card>
            <Card title="Bewerbungen nach Art">
              {!d.byType.length ? <EmptyState text="Keine Daten." /> : <ul className="space-y-3">{d.byType.map((t) => { const total = d.byType.reduce((n, x) => n + x.submitted, 0); return (
                <li key={t.type}><div className="flex justify-between text-sm"><span>{t.type}</span><span><b>{t.submitted}</b> <span className="text-muted">({pctTxt((t.submitted / total) * 100)})</span></span></div><div className="mt-1 h-2 rounded bg-panel-2"><div className="h-2 rounded bg-primary" style={{ width: `${(t.submitted / total) * 100}%` }} /></div></li>); })}</ul>}
            </Card>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            <Card title="Top-Prüfer">
              {!d.reviewers.length ? <EmptyState text="Noch nichts entschieden." /> : <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-muted"><th className="py-1">Prüfer</th><th className="px-2">Geprüft</th><th className="px-2">Annahme</th><th className="px-2 text-right">Ø Antwort</th></tr></thead>
                <tbody>{d.reviewers.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-1.5"><span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{r.name.charAt(0).toUpperCase()}</span>{r.name}</td><td>{r.reviewed}</td><td className="text-success">{pctTxt(r.approvalRate)}</td><td className="text-right">{dur(r.avgReviewMin)}</td></tr>)}</tbody></table>}
            </Card>
            <Card title="Leistung nach Art">
              {!d.byType.length ? <EmptyState text="Keine Daten." /> : <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-muted"><th className="py-1">Art</th><th className="px-2">Eingereicht</th><th className="px-2">Annahmequote</th><th className="px-2 text-right">Ø Prüfung</th></tr></thead>
                <tbody>{d.byType.map((t) => <tr key={t.type} className="border-t border-line"><td className="py-1.5">{t.type}</td><td>{t.submitted}</td><td><span className="flex items-center gap-2"><span className="h-1.5 w-12 rounded bg-panel-2"><span className="block h-1.5 rounded bg-success" style={{ width: `${t.approvalRate}%` }} /></span><span className="text-success">{pctTxt(t.approvalRate)}</span></span></td><td className="text-right">{dur(t.avgReviewMin)}</td></tr>)}</tbody></table>}
            </Card>
            <Card title="Einreichungen nach Uhrzeit"><Heatmap heat={d.heat} /></Card>
          </div>
        </>
      )}
    </>
  );
}

/** Verlauf (Fläche) + gestrichelter 7-Tage-Schnitt, Fadenkreuz mit Tooltip beim Überfahren. */
function LineChart({ data }: { data: Stats['overTime'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, L = 28, B = 24, T = 8;
  const max = Math.max(4, ...data.map((x) => x.count));
  const x = (i: number) => L + (i * (W - L - 8)) / Math.max(1, data.length - 1), y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = (k: 'count' | 'avg7') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((max / 4) * i));
  const labelEvery = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bewerbungen pro Tag"
        onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - L) / (W - L - 8)) * (data.length - 1))))); }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} /><text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-muted)">{t}</text></g>)}
        {data.map((d, i) => i % labelEvery === 0 && <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-muted)">{new Date(d.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</text>)}
        <path d={`${line('count')} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--color-primary)" opacity={0.15} />
        <path d={line('count')} fill="none" stroke="var(--color-primary)" strokeWidth={2} />
        <path d={line('avg7')} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeDasharray="5 4" opacity={0.7} />
        {h && <><line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H - B} stroke="var(--color-muted)" strokeWidth={1} /><circle cx={x(hover!)} cy={y(h.count)} r={4} fill="var(--color-primary)" stroke="var(--color-panel)" strokeWidth={2} /></>}
      </svg>
      {h && <div className="pointer-events-none absolute top-0 rounded border border-line bg-panel px-2 py-1 text-xs shadow" style={{ left: `${Math.min(80, (x(hover!) / W) * 100)}%` }}>{new Date(h.date).toLocaleDateString('de-DE')}<br />Bewerbungen: <b>{h.count}</b><br />7-Tage-Schnitt: {h.avg7.toFixed(1)}</div>}
    </div>
  );
}

function Donut({ b }: { b: Stats['breakdown'] }) {
  const total = b.APPROVED + b.PENDING + b.REJECTED;
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 180 180" className="h-40 w-40" role="img" aria-label="Status-Verteilung">
        <circle cx={90} cy={90} r={R} fill="none" stroke="var(--color-panel-2)" strokeWidth={22} />
        {total > 0 && STATUS.map((s) => { const v = b[s.key]; if (!v) return null; const len = (v / total) * C; const el = <circle key={s.key} cx={90} cy={90} r={R} fill="none" stroke={s.color} strokeWidth={22} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 90 90)"><title>{`${s.label}: ${v}`}</title></circle>; acc += len; return el; })}
        <text x={90} y={88} textAnchor="middle" fontSize={26} fontWeight={700} fill="var(--color-fg)">{total}</text><text x={90} y={108} textAnchor="middle" fontSize={11} fill="var(--color-muted)">Gesamt</text>
      </svg>
      <ul className="space-y-2 text-sm">{STATUS.map((s) => <li key={s.key} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /><span className="w-24">{s.label}</span><b>{b[s.key]}</b><span className="text-xs text-muted">({pctTxt(total ? (b[s.key] / total) * 100 : 0)})</span></li>)}</ul>
    </div>
  );
}

function Heatmap({ heat }: { heat: number[][] }) {
  const max = Math.max(1, ...heat.flat());
  const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-1 text-xs text-muted">wenig{[0.15, 0.35, 0.55, 0.8, 1].map((o) => <span key={o} className="h-3 w-3 rounded" style={{ background: 'var(--color-primary)', opacity: o }} />)}viel</div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'auto repeat(24, minmax(0, 1fr))' }}>
        {heat.map((row, d) => [
          <span key={`l${d}`} className="pr-1 text-right text-xs text-muted">{DAYS[d]}</span>,
          ...row.map((v, h) => <span key={`${d}-${h}`} title={`${DAYS[d]} ${String(h).padStart(2, '0')}:00 – ${v} Bewerbung${v === 1 ? '' : 'en'}`} className="mx-auto h-2.5 w-2.5 rounded-full" style={{ background: v ? 'var(--color-primary)' : 'var(--color-panel-2)', opacity: v ? 0.25 + 0.75 * (v / max) : 1 }} />),
        ])}
        <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[9px] text-muted">{h % 4 === 0 ? h : ''}</span>)}
      </div>
    </div>
  );
}
