import type { PanelConfig } from '../api';

const STYLE: Record<string, string> = {
  primary: '#5865f2',
  secondary: '#4f545c',
  success: '#248046',
  danger: '#da373c',
  link: '#4f545c',
};
const label = (emoji?: string) =>
  emoji ? (emoji.startsWith('<') ? `:${emoji.split(':')[1]}: ` : `${emoji} `) : '';

/** Annäherung an die Darstellung in Discord (kein pixelgenauer Nachbau). */
export function PanelPreview({ config }: { config: PanelConfig }) {
  const e = config.embed;
  const hasEmbed = !!(
    e.title ||
    e.description ||
    e.imageUrl ||
    e.thumbnailUrl ||
    e.fields?.length ||
    e.footer
  );
  const rows: PanelConfig['buttons'][] = [];
  for (let i = 0; i < config.buttons.length; i += 5) rows.push(config.buttons.slice(i, i + 5));
  return (
    <div className="dc-msg" aria-label="Vorschau">
      {config.content && <p className="dc-content">{config.content}</p>}
      {hasEmbed && (
        <div className="dc-embed" style={{ borderLeftColor: e.color ?? '#202225' }}>
          <div className="dc-embed-main">
            {e.title && <strong>{e.title}</strong>}
            {e.description && <p>{e.description}</p>}
            {e.fields && e.fields.length > 0 && (
              <div className="dc-fields">
                {e.fields.map((f, i) => (
                  <div key={i} style={{ gridColumn: f.inline ? 'span 1' : '1 / -1' }}>
                    <b>{f.name}</b>
                    <div>{f.value}</div>
                  </div>
                ))}
              </div>
            )}
            {e.imageUrl && <img className="dc-img" src={e.imageUrl} alt="" />}
            {e.footer && <small className="dc-footer">{e.footer}</small>}
          </div>
          {e.thumbnailUrl && <img className="dc-thumb" src={e.thumbnailUrl} alt="" />}
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="dc-row">
          {row.map((b) => (
            <span key={b.id} className="dc-btn" style={{ background: STYLE[b.style] }}>
              {label(b.emoji)}
              {b.label}
              {b.style === 'link' ? ' ↗' : ''}
            </span>
          ))}
        </div>
      ))}
      {config.select && (
        <div className="dc-select">
          {config.select.placeholder || 'Auswahl …'} <span>▾</span>
        </div>
      )}
    </div>
  );
}
