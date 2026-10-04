import { useParams } from 'react-router';
import { useAccess } from '../design/useAccess';
import { useDesignConfig } from '../design/useDesign';
import { WidgetGrid } from '../design/widgets/WidgetGrid';

/** Übersicht: die Widgets laut Design-Konfiguration (Standard: Kennzahlen, Tickets, Bewerbungen, Konfigurations-Check). */
export function Guild() {
  const { guildId = '' } = useParams();
  const config = useDesignConfig();
  const access = useAccess(guildId);
  return (
    <>
      <h1>Übersicht</h1>
      <WidgetGrid
        guildId={guildId}
        widgets={config.layout.pages['overview']?.widgets ?? []}
        cfg={config}
        access={access}
      />
    </>
  );
}
