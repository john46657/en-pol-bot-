import type { BrandingArea } from '@enrp/shared';
import { useBranding } from '../lib/branding';

/** Eigenes Kopfbild eines Dashboard-Bereichs (Server-Konfiguration → Branding & Bilder); ohne Bild nichts. */
export function AreaBanner({ area }: { area: BrandingArea }) {
  const b = useBranding().data;
  const src = b?.configured ? b.images.areas[area] ?? (area === 'dashboard' ? b.images.banner : null) : null;
  if (!src) return null;
  return <img src={src} alt="" className="mb-4 h-24 w-full rounded-lg border border-line object-cover sm:h-32" />;
}
