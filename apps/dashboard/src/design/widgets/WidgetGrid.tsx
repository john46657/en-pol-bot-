import { useQuery } from '@tanstack/react-query';
import {
  CHART_SOURCES,
  METRICS,
  WIDGET_LABEL,
  ctaTarget,
  isExpired,
  normalizeCta,
  type Cta,
  type DesignConfig,
  type MetricKey,
  type Widget,
  type ChartSource,
} from '@nexus/design/client';
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { api, type GuildOverview } from '../../api';
import { assetUrl } from '../assetUrl';
import { Dialog } from '../../components/Dialog';
import { RichText } from './RichText';

export interface WidgetData {
  metrics: Record<MetricKey, number | null>;
  charts: Record<ChartSource, { label: string; count: number }[] | null>;
  tickets:
    | { number: number; subject: string; status: string; priority: string; createdAt: string }[]
    | null;
  applications:
    { number: string | null; name: string; status: string; submittedAt: string | null }[] | null;
  team: { userId: string; name: string; since: string }[] | null;
  activity: { action: string; actorId: string | null; createdAt: string }[] | null;
}
const DATA_TYPES = new Set(['stat', 'tickets', 'applications', 'team', 'chart', 'activity']);
const SHADOW = {
  none: 'none',
  small: '0 1px 3px #00000040',
  medium: '0 4px 12px #00000050',
  large: '0 12px 32px #00000066',
} as const;

/** Titel eines Widgets: eigener Titel, sonst die Kennzahl bzw. Datenquelle, sonst der Typname. */
export function defaultTitle(w: Widget): string {
  if (w.title) return w.title;
  if (w.type === 'stat') return METRICS[w.props['metric'] as MetricKey].label;
  if (w.type === 'chart') return CHART_SOURCES[w.props['source'] as ChartSource].label;
  return WIDGET_LABEL[w.type].label;
}

/** Wer sieht das Widget? (Nur Sichtbarkeit – die Daten selbst liefert der Server nach Recht.) */
export function widgetVisibleFor(
  w: Widget,
  access: { guildAdmin: boolean; roleIds: readonly string[] },
): boolean {
  if (!w.visible) return false;
  return (
    w.roles.length === 0 || access.guildAdmin || w.roles.some((r) => access.roleIds.includes(r))
  );
}

export function widgetStyle(w: Widget): CSSProperties {
  const s = w.style;
  const css: Record<string, string> = {};
  if (s.background) css['--card-bg'] = s.background;
  if (s.color) css['color'] = s.color;
  if (s.border !== null) css['--card-border'] = `${s.border}px`;
  if (s.radius !== null) css['--radius-card'] = `${s.radius}px`;
  if (s.shadow !== null) css['--shadow-card'] = SHADOW[s.shadow];
  if (s.glass === false) css['--card-blur'] = 'none';
  return css as CSSProperties;
}

/** Button laut Button-Builder (Text, Icon, Aktion, Farben, Rundung, Rahmen, Schatten). */
export function CtaButton({ cta: raw, guildId }: { cta: Cta; guildId: string }) {
  const cta = normalizeCta(raw); // nie ungeprüfte Ziele rendern
  const target = ctaTarget(cta, guildId);
  const [hover, setHover] = useState(false);
  const [modal, setModal] = useState(false);
  const isModal = cta.kind === 'modal' && (cta.modalTitle || cta.modalBody);
  if ((!target && !isModal) || !(cta.text || cta.icon)) return null;
  const style: CSSProperties = {
    ...(cta.color
      ? { background: hover && cta.hoverColor ? cta.hoverColor : cta.color, borderColor: cta.color }
      : hover && cta.hoverColor
        ? { background: cta.hoverColor }
        : {}),
    ...(cta.textColor ? { color: cta.textColor } : {}),
    ...(cta.radius !== null ? { borderRadius: cta.radius } : {}),
    ...(cta.border ? { borderWidth: cta.border, borderStyle: 'solid' } : {}),
    ...(cta.shadow ? { boxShadow: SHADOW[cta.shadow] } : {}),
  };
  const body = (
    <>
      {cta.icon && <span aria-hidden>{cta.icon} </span>}
      {cta.text}
    </>
  );
  const common = {
    className: `btn ${cta.color ? '' : 'primary'}`,
    style,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  };
  if (isModal)
    return (
      <>
        <button type="button" {...common} aria-haspopup="dialog" onClick={() => setModal(true)}>
          {body}
        </button>
        <Dialog open={modal} title={cta.modalTitle || cta.text} onClose={() => setModal(false)}>
          <RichText source={cta.modalBody} />
          <div className="dz-seg">
            <button type="button" className="btn" onClick={() => setModal(false)}>
              Schließen
            </button>
          </div>
        </Dialog>
      </>
    );
  if (!target) return null;
  return target.external ? (
    <a href={target.href} target="_blank" rel="noopener noreferrer" {...common}>
      {body}
    </a>
  ) : (
    <Link to={target.href} {...common}>
      {body}
    </Link>
  );
}

const NO_ACCESS = <p className="muted">🔒 Kein Zugriff</p>;
const when = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

function Body({
  w,
  data,
  loading,
  guildId,
  overview,
}: {
  w: Widget;
  data: WidgetData | undefined;
  loading: boolean;
  guildId: string;
  overview: GuildOverview | undefined;
}) {
  const p = w.props;
  switch (w.type) {
    case 'stat': {
      const key = p['metric'] as MetricKey;
      const m = METRICS[key];
      const v = data?.metrics[key];
      return (
        <div className="wg-stat">
          <span className="muted">
            {w.icon || m.icon} {w.title || m.label}
          </span>
          <b>{loading ? '…' : v === null ? '🔒' : (v ?? '–')}</b>
          {v === null && <small className="muted">Kein Zugriff</small>}
          {(p['description'] as string) && <small>{p['description'] as string}</small>}
          {(p['trend'] as string) && <small className="muted">{p['trend'] as string}</small>}
        </div>
      );
    }
    case 'tickets': {
      const rows = data?.tickets;
      return rows === null ? (
        NO_ACCESS
      ) : (
        <ul className="plain wg-list">
          {(rows ?? []).slice(0, Number(p['limit'])).map((t) => (
            <li key={t.number}>
              <b>#{t.number}</b> {t.subject}{' '}
              <small className="muted">
                · {t.status === 'IN_PROGRESS' ? 'in Bearbeitung' : t.status === 'WAITING' ? 'wartet' : 'offen'} · {when(t.createdAt)}
              </small>
            </li>
          ))}
          {!loading && rows?.length === 0 && <li className="muted">Keine offenen Tickets 🎉</li>}
        </ul>
      );
    }
    case 'applications': {
      const rows = data?.applications;
      return rows === null ? (
        NO_ACCESS
      ) : (
        <ul className="plain wg-list">
          {(rows ?? []).slice(0, Number(p['limit'])).map((a, i) => (
            <li key={a.number ?? i}>
              <b>{a.number ?? '–'}</b> {a.name}{' '}
              {a.submittedAt && <small className="muted">· {when(a.submittedAt)}</small>}
            </li>
          ))}
          {!loading && rows?.length === 0 && <li className="muted">Keine offenen Bewerbungen</li>}
        </ul>
      );
    }
    case 'team': {
      const rows = data?.team;
      return rows === null ? (
        NO_ACCESS
      ) : (
        <ul className="plain wg-list">
          {(rows ?? []).slice(0, Number(p['limit'])).map((t) => (
            <li key={t.userId}>
              👮 {t.name} <small className="muted">· seit {when(t.since)}</small>
            </li>
          ))}
          {!loading && rows?.length === 0 && <li className="muted">Niemand im Dienst</li>}
        </ul>
      );
    }
    case 'activity': {
      const rows = data?.activity;
      return rows === null ? (
        NO_ACCESS
      ) : (
        <ul className="plain wg-list">
          {(rows ?? []).slice(0, Number(p['limit'])).map((a, i) => (
            <li key={i}>
              <code>{a.action}</code> <small className="muted">· {when(a.createdAt)}</small>
            </li>
          ))}
          {!loading && rows?.length === 0 && <li className="muted">Noch keine Ereignisse</li>}
        </ul>
      );
    }
    case 'chart': {
      const src = p['source'] as ChartSource;
      const rows = data?.charts[src];
      if (rows === null) return NO_ACCESS;
      const max = Math.max(1, ...(rows ?? []).map((r) => r.count));
      return (
        <div
          className="wg-chart"
          role="img"
          aria-label={`${CHART_SOURCES[src].label}: ${(rows ?? []).map((r) => `${r.label} ${r.count}`).join(', ')}`}
        >
          {(rows ?? []).map((r) => (
            <div key={r.label} className="wg-bar">
              <span>{r.label}</span>
              <span className="wg-bar-track">
                <span style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <b>{r.count}</b>
            </div>
          ))}
          {!loading && rows?.length === 0 && <p className="muted">Noch keine Daten</p>}
        </div>
      );
    }
    case 'date':
      return <Clock format={p['format'] as string} />;
    case 'text':
      return <RichText source={p['body'] as string} />;
    case 'link':
      return (
        <div className="wg-link">
          {(p['description'] as string) && <p>{p['description'] as string}</p>}
          <CtaButton cta={p['cta'] as Cta} guildId={guildId} />
        </div>
      );
    case 'image': {
      const src = p['src'] as string;
      const cta = normalizeCta(p['cta']);
      const t = ctaTarget(cta, guildId);
      const overlay = Number(p['overlayOpacity']);
      const img = src ? (
        <span className="wg-imgwrap">
          <img
            className="wg-img"
            src={assetUrl(src)}
            alt={p['alt'] as string}
            loading="lazy"
            style={{ objectFit: p['fit'] as 'cover' | 'contain' }}
          />
          {overlay > 0 && (
            <span
              className="wg-overlay"
              aria-hidden
              style={{ background: p['overlayColor'] as string, opacity: overlay / 100 }}
            />
          )}
        </span>
      ) : (
        <p className="muted">Kein Bild gewählt</p>
      );
      return t ? (
        t.external ? (
          <a href={t.href} target="_blank" rel="noopener noreferrer">
            {img}
          </a>
        ) : (
          <Link to={t.href}>{img}</Link>
        )
      ) : (
        img
      );
    }
    case 'banner': {
      if (isExpired(p['expires'] as string)) return null;
      return (
        <div className="wg-banner">
          {(p['image'] as string) && (
            <img src={assetUrl(p['image'] as string)} alt="" loading="lazy" />
          )}
          <div>
            {(p['body'] as string) && <RichText source={p['body'] as string} />}
            <CtaButton cta={p['cta'] as Cta} guildId={guildId} />
          </div>
        </div>
      );
    }
    case 'health':
      return (
        <ul className="plain wg-list">
          {(overview?.health ?? []).map((h, i) => (
            <li key={i}>
              <span aria-hidden>{h.ok ? '✅' : '⚠️'}</span> {h.message}
            </li>
          ))}
          {!overview && <li className="muted">Lade …</li>}
        </ul>
      );
  }
}

function Clock({ format }: { format: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), format === 'date' ? 60_000 : 1000);
    return () => clearInterval(t);
  }, [format]);
  const opts: Intl.DateTimeFormatOptions =
    format === 'time'
      ? { timeStyle: 'medium' }
      : format === 'date'
        ? { dateStyle: 'full' }
        : { dateStyle: 'medium', timeStyle: 'medium' };
  return (
    <b className="wg-clock">
      {now.toLocaleString('de-DE', { ...opts, timeZone: 'Europe/Berlin' })}
    </b>
  );
}

/** Zeigt die Widgets einer Seite im 12-Spalten-Raster. Daten werden nur geladen, wenn die Seite Daten-Widgets enthält. */
export function WidgetGrid({
  guildId,
  widgets,
  cfg,
  access,
}: {
  guildId: string;
  widgets: Widget[];
  cfg: DesignConfig;
  access: { guildAdmin: boolean; roleIds: readonly string[] };
}) {
  const shown = widgets
    .filter((w) => widgetVisibleFor(w, access))
    .filter((w) => !(w.type === 'banner' && isExpired(w.props['expires'] as string)));
  const needsData = shown.some((w) => DATA_TYPES.has(w.type));
  const needsOverview = shown.some((w) => w.type === 'health');
  const data = useQuery({
    queryKey: ['widget-data', guildId],
    queryFn: () => api<WidgetData>(`/guilds/${guildId}/design/widget-data`),
    enabled: needsData,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const overview = useQuery({
    queryKey: ['guild', guildId],
    queryFn: () => api<GuildOverview>(`/guilds/${guildId}`),
    enabled: needsOverview,
  });
  if (shown.length === 0)
    return (
      <p className="muted">
        Auf dieser Seite sind keine Widgets. Sie lassen sich unter „Design &amp; Erscheinungsbild →
        Widgets“ hinzufügen.
      </p>
    );
  return (
    <div className={`wg-grid ${cfg.responsive.stackCards ? 'wg-stack' : ''}`}>
      {shown.map((w) => (
        <section
          key={w.id}
          className="card wg"
          style={{
            gridColumn: `${w.x} / span ${w.w}`,
            gridRow: `${w.y} / span ${w.h}`,
            ...widgetStyle(w),
          }}
          aria-label={defaultTitle(w)}
        >
          {w.type !== 'stat' && (
            <h3 className="wg-title">
              {w.icon || WIDGET_LABEL[w.type].icon} {defaultTitle(w)}
            </h3>
          )}
          <Body
            w={w}
            data={data.data}
            loading={data.isLoading}
            guildId={guildId}
            overview={overview.data}
          />
          {data.error && DATA_TYPES.has(w.type) && (
            <p className="error">Daten konnten nicht geladen werden.</p>
          )}
        </section>
      ))}
    </div>
  );
}
