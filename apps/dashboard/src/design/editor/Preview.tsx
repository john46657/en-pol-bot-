import {
  backgroundFor,
  backgroundStyle,
  designVars,
  type DesignConfig,
} from '@nexus/design/client';
import { useEffect, type CSSProperties } from 'react';
import { loadFont } from '../fonts';

export type Device = 'desktop' | 'laptop' | 'tablet' | 'mobile';
export const DEVICES: readonly { id: Device; label: string; icon: string; width: number | null }[] =
  [
    { id: 'desktop', label: 'Desktop', icon: '🖥️', width: null },
    { id: 'laptop', label: 'Laptop', icon: '💻', width: 1024 },
    { id: 'tablet', label: 'Tablet', icon: '📱', width: 768 },
    { id: 'mobile', label: 'Mobil', icon: '📱', width: 375 },
  ];

/**
 * Live-Vorschau: ein verkleinertes Dashboard, das dieselben CSS-Variablen wie das echte nutzt – aber nur innerhalb
 * dieses Rahmens (nichts davon verändert die Seite selbst). Die Geräte-Umschaltung simuliert die Breite.
 */
export function Preview({
  config,
  mode,
  device,
  serverName,
}: {
  config: DesignConfig;
  mode: 'dark' | 'light';
  device: Device;
  serverName: string;
}) {
  useEffect(() => {
    void loadFont(config.typography.fontMain);
    void loadFont(config.typography.fontHeading);
  }, [config.typography.fontMain, config.typography.fontHeading]);
  const width = DEVICES.find((d) => d.id === device)?.width ?? null;
  const mobile = device === 'mobile';
  const nav = mobile ? config.responsive.mobileNav : 'side';
  const vars = designVars(config, mode) as CSSProperties;
  const bg = backgroundStyle(backgroundFor(config, 'overview'), config.colors.dark.background);
  const g = config.general;
  const name = g.nameMode === 'custom' && g.customName ? g.customName : serverName;
  const side = config.sidebar.enabled && !mobile;
  const items = ['🏠 Übersicht', '🎫 Tickets', '📋 Bewerbungen', '👮 Team'];
  const stack = mobile && config.responsive.stackCards;
  return (
    <div className="pv-wrap">
      <div className="pv-frame" style={{ width: width ?? '100%' }} data-device={device}>
        <div
          className="pv"
          style={{
            ...vars,
            color: 'var(--fg)',
            fontFamily: 'var(--font-main)',
            fontSize: 'var(--body-size)',
            lineHeight: 'var(--body-line)',
          }}
          data-mode={mode}
        >
          <div className="pv-bg" style={bg.layer} aria-hidden />
          {bg.overlay && <div className="pv-bg" style={bg.overlay} aria-hidden />}
          <div
            className={`pv-shell ${side ? (config.sidebar.position === 'right' ? 'right' : 'left') : 'none'}`}
          >
            {side && (
              <aside
                className="pv-side"
                style={{ width: Math.min(config.sidebar.width, 260) * 0.8 }}
              >
                <b>NEXUS</b>
                {items.map((i, n) => (
                  <span key={i} className={n === 0 ? 'on' : ''}>
                    {i}
                  </span>
                ))}
              </aside>
            )}
            <div className="pv-main">
              <header className="pv-bar" style={{ minHeight: Math.min(config.header.height, 80) }}>
                {mobile && nav === 'drawer' && <span>☰</span>}
                {config.header.showLogo && g.logo.mode !== 'none' && (
                  <span
                    className="pv-logo"
                    style={{
                      width: Math.min(g.logo.width, 40),
                      height: Math.min(g.logo.height, 40),
                      borderRadius: g.logo.radius,
                      marginLeft:
                        g.logo.position === 'right'
                          ? 'auto'
                          : g.logo.position === 'center'
                            ? 'auto'
                            : 0,
                      marginRight: g.logo.position === 'center' ? 'auto' : 0,
                    }}
                  >
                    {g.logo.mode === 'upload' && g.logo.url ? (
                      <img src={g.logo.url} alt="" />
                    ) : (
                      name.slice(0, 1)
                    )}
                  </span>
                )}
                {config.header.showName && <strong>{name}</strong>}
                {config.header.showProfile && <span className="pv-me">👤</span>}
              </header>
              <div className="pv-content">
                <h1>Übersicht</h1>
                <h2>Heute</h2>
                <div
                  className="pv-stats"
                  style={{ gridTemplateColumns: stack ? '1fr' : 'repeat(3, 1fr)' }}
                >
                  {[
                    ['🎫', 'Offene Tickets', '24'],
                    ['📋', 'Bewerbungen', '7'],
                    ['👮', 'Im Dienst', '12'],
                  ].map(([i, t, v]) => (
                    <div key={t} className="card stat">
                      <span>
                        {i} {t}
                      </span>
                      <b>{v}</b>
                      <small>+12 % diese Woche</small>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <h3>Beispielkarte</h3>
                  <p>
                    Text mit{' '}
                    <a href="#pv" onClick={(e) => e.preventDefault()}>
                      Link
                    </a>{' '}
                    und <span className="muted">gedämpftem Text</span>.
                  </p>
                  <button type="button" className="btn primary">
                    Primär
                  </button>{' '}
                  <button type="button" className="btn">
                    Sekundär
                  </button>
                  <p style={{ marginTop: 8 }}>
                    <span style={{ color: 'var(--ok)' }}>● Erfolg</span> ·{' '}
                    <span style={{ color: 'var(--bad)' }}>● Warnung</span> ·{' '}
                    <span style={{ color: 'var(--err)' }}>● Fehler</span> ·{' '}
                    <span style={{ color: 'var(--info)' }}>● Info</span>
                  </p>
                </div>
              </div>
              {mobile && nav === 'bottom' && (
                <footer className="pv-bottom">
                  {items.map((i) => (
                    <span key={i}>{i.split(' ')[0]}</span>
                  ))}
                </footer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
