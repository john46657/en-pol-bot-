import { useParams } from 'react-router';
import { useAccess } from '../design/useAccess';
import { useDesignConfig } from '../design/useDesign';
import { WidgetGrid } from '../design/widgets/WidgetGrid';

/** Eigene Seite (Page Builder): Name, Beschreibung und die Widgets der Seite. Unbekannte oder nicht freigegebene Seiten gibt der Server gar nicht erst aus. */
export function CustomPage() {
  const { guildId = '', slug = '' } = useParams();
  const config = useDesignConfig();
  const access = useAccess(guildId);
  const key = `page-${slug}`;
  const page = config.layout.custom.find((p) => p.key === key);
  if (!page)
    return (
      <>
        <h1>Seite nicht gefunden</h1>
        <p className="muted">
          Diese Seite gibt es nicht (mehr) oder sie ist für dich nicht freigegeben.
        </p>
      </>
    );
  return (
    <>
      <h1>
        {page.icon && <span aria-hidden>{page.icon} </span>}
        {page.name}
      </h1>
      {page.description && <p className="muted">{page.description}</p>}
      <WidgetGrid
        guildId={guildId}
        widgets={config.layout.pages[key]?.widgets ?? []}
        cfg={config}
        access={access}
      />
    </>
  );
}
