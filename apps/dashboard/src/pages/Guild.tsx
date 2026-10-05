import { Link, useOutletContext, useParams } from 'react-router';
import { useAccess } from '../design/useAccess';
import { useDesignConfig } from '../design/useDesign';
import { WidgetGrid } from '../design/widgets/WidgetGrid';
import { navPath, type LayoutContext } from './GuildLayout';

/** Seiten, die als Schnellzugriff erscheinen (nur, was der Benutzer sehen darf – das Menü ist bereits gefiltert). */
const QUICK = [
  'submissions',
  'tickets',
  'team',
  'personnel',
  'wanted',
  'restrictions',
  'training',
  'shifts',
];

const greeting = (d = new Date()) =>
  d.getHours() < 11 ? 'Guten Morgen' : d.getHours() < 18 ? 'Guten Tag' : 'Guten Abend';

/** Übersicht: Begrüßung, Schnellzugriff und die Widgets laut Design-Konfiguration (Standard: Kennzahlen, Tickets, Bewerbungen, Konfigurations-Check). */
export function Guild() {
  const { guildId = '' } = useParams();
  const config = useDesignConfig();
  const access = useAccess(guildId);
  const ctx = useOutletContext<LayoutContext | undefined>();
  const quick = QUICK.flatMap((k) => ctx?.nav.filter((i) => i.key === k && !i.href) ?? []);
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return (
    <>
      <h1 className="sr-only">Übersicht</h1>
      <section className="hero" aria-label="Begrüßung">
        <span className="hero-mark" aria-hidden>
          {ctx?.icon ? (
            <img src={ctx.icon} alt="" />
          ) : (
            (ctx?.serverName ?? 'N').slice(0, 1).toUpperCase()
          )}
        </span>
        <div className="hero-text">
          <h2 style={{ margin: 0, fontSize: 'min(var(--h1-size, 28px), 28px)' }}>
            {greeting()} – {ctx?.serverName ?? 'Server'}
          </h2>
          <p>Hier siehst du auf einen Blick, was gerade ansteht.</p>
          <div className="hero-meta">
            <span className="badge">{today}</span>
          </div>
        </div>
      </section>
      {quick.length > 0 && (
        <>
          <div className="quick-title">Schnellzugriff</div>
          <nav className="quick" aria-label="Schnellzugriff">
            {quick.map((i) => (
              <Link key={i.key} to={`/guilds/${guildId}/${navPath(i.key)}`}>
                <span className="q-ic" aria-hidden>
                  {i.icon}
                </span>
                {i.title}
              </Link>
            ))}
          </nav>
        </>
      )}
      <WidgetGrid
        guildId={guildId}
        widgets={config.layout.pages['overview']?.widgets ?? []}
        cfg={config}
        access={access}
      />
    </>
  );
}
