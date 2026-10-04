import { bannersFor, isExpired, type BannerCfg, type DesignConfig } from '@nexus/design/client';
import type { CSSProperties } from 'react';
import { CtaButton } from './WidgetGrid';
import { RichText } from './RichText';

const PAD = { small: 8, medium: 14, large: 22 } as const;

/** Ein Banner (Titel, Text, Bild, Icon, Button, Farben, Größe). */
export function BannerView({ banner: b, guildId }: { banner: BannerCfg; guildId: string }) {
  const style: CSSProperties = {
    ...(b.background ? { background: b.background } : {}),
    ...(b.textColor ? { color: b.textColor } : {}),
    ...(b.color ? { borderColor: b.color, borderLeftWidth: 4 } : {}),
    padding: PAD[b.size],
  };
  return (
    <aside className={`banner banner-${b.size}`} style={style} aria-label={b.title || 'Hinweis'}>
      {b.icon && (
        <span className="banner-icon" aria-hidden style={b.color ? { color: b.color } : undefined}>
          {b.icon}
        </span>
      )}
      <div className="banner-body">
        {b.title && <strong>{b.title}</strong>}
        {b.body && <RichText source={b.body} />}
        <CtaButton cta={b.cta} guildId={guildId} />
      </div>
      {b.image && <img src={b.image} alt="" loading="lazy" />}
    </aside>
  );
}

/** Banner oberhalb des Seiteninhalts: nur die für diese Seite bestimmten, sichtbaren und nicht abgelaufenen (höchstens drei). */
export function BannerBar({
  config,
  page,
  guildId,
}: {
  config: DesignConfig;
  page: string;
  guildId: string;
}) {
  const list = bannersFor(config.layout.banners, page, (d) => isExpired(d));
  if (list.length === 0) return null;
  return (
    <div className="banners">
      {list.map((b) => (
        <BannerView key={b.id} banner={b} guildId={guildId} />
      ))}
    </div>
  );
}
