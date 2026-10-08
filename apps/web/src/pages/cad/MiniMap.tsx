import { useState } from 'react';
import { Link } from 'react-router';
import { ERLC_BUILTIN_MAP, gameToPixel, type CadConfig } from '@enrp/shared';

/**
 * Kleiner Kartenausschnitt um eine Position (z. B. neuer Notruf/Einsatz) mit Markierung in der Mitte –
 * ohne Zoomen/Ziehen, damit man sofort sieht, wo es ist. Klick öffnet die große Einsatzkarte.
 */
export function MiniMap({ cfg, x, z, to, height = 140, zoom = 0.6, emoji = '📍', label }: { cfg: CadConfig; x: number; z: number; to?: string; height?: number; zoom?: number; emoji?: string; label?: string }) {
  const m = cfg.map;
  const [failed, setFailed] = useState(false);
  const src = m.imageUrl && !failed ? m.imageUrl : ERLC_BUILTIN_MAP;
  const { px, py } = gameToPixel(m, x, z);
  const box = (
    <div className="relative w-full overflow-hidden rounded-md border border-line bg-[#0b0e14]" style={{ height }} aria-label={label ?? 'Position auf der Karte'} role="img">
      {/* Kartenbild so verschoben, dass die Position in der Mitte liegt */}
      <img src={src} alt="" aria-hidden draggable={false} onError={() => setFailed(true)} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
        style={{ width: m.width * zoom, height: m.height * zoom, transform: `translate(${-px * zoom}px, ${-py * zoom}px)` }} />
      <span aria-hidden className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-pulse place-items-center rounded-full border-2 border-white bg-danger/90 text-sm shadow-lg">{emoji}</span>
      {label && <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{label}</span>}
    </div>
  );
  return to ? <Link to={to} title="Auf der Einsatzkarte öffnen" className="block hover:opacity-90">{box}</Link> : box;
}
