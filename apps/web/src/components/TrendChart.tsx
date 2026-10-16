import { useState } from 'react';

/**
 * Kleiner Säulenverlauf für eine Kennzahl (eine Reihe → keine Legende, der Titel benennt sie).
 * Säulen mit 2px Abstand, oben 4px gerundet, an der Grundlinie verankert; Hover/Touch zeigt Datum und Wert.
 * Lange Zeiträume (> 90 Tage) werden zu Wochen zusammengefasst, damit Säulen lesbar bleiben.
 */
export function TrendChart({ days, values, unit, label }: { days: string[]; values: number[]; unit: string; label: string }) {
  const week = days.length > 90;
  const buckets: { from: string; to: string; v: number }[] = [];
  const size = week ? 7 : 1;
  // von hinten bündeln: die letzte Säule ist immer die aktuelle Woche
  for (let end = days.length; end > 0; end -= size) {
    const start = Math.max(0, end - size);
    buckets.unshift({ from: days[start]!, to: days[end - 1]!, v: Math.round(values.slice(start, end).reduce((a, b) => a + b, 0) * 10) / 10 });
  }
  const max = Math.max(1, ...buckets.map((b) => b.v));
  const total = Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;
  const [hover, setHover] = useState<number>();
  const h = hover === undefined ? undefined : buckets[hover];
  const de = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return (
    <figure className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold tabular-nums">{total.toLocaleString('de-DE')}<span className="ml-1 text-xs font-normal text-muted">{unit} gesamt</span></p>
        <p className="text-right text-xs text-muted tabular-nums" aria-live="polite">{h ? <>{week ? `${de(h.from)}–${de(h.to)}` : de(h.from)}: <b className="text-fg">{h.v.toLocaleString('de-DE')}</b></> : `Ø ${(total / buckets.length).toLocaleString('de-DE', { maximumFractionDigits: total / buckets.length < 1 ? 2 : 1 })} je ${week ? 'Woche' : 'Tag'}`}</p>
      </div>
      <div className="relative h-28" onMouseLeave={() => setHover(undefined)}>
        {/* zurückhaltende Hilfslinien: Maximum und Hälfte */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line/70" aria-hidden><span className="absolute -top-2 left-0 bg-panel pr-1 text-[10px] text-muted">{max.toLocaleString('de-DE')}</span></div>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line/40" aria-hidden />
        <div role="img" aria-label={`${label}: ${total} ${unit} in ${days.length} Tagen`} className="absolute inset-0 flex items-end gap-[2px] border-b border-line">
          {buckets.map((b, i) => (
            <div key={b.from} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <div className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-primary' : 'bg-primary/60'}`} style={{ height: b.v ? `${Math.max(2, (b.v / max) * 100)}%` : 0 }} />
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-1 flex justify-between text-[10px] text-muted"><span>{de(days[0]!)}</span><span>{week ? 'je Woche' : 'je Tag'}</span><span>heute</span></figcaption>
    </figure>
  );
}
