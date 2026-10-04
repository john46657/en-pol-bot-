/**
 * Universelles Panel (Discord-Nachricht mit Embed, Buttons und Select-Menü).
 * Die Konfiguration wird als JSON in der Datenbank gespeichert; Validierung: `@nexus/validation`,
 * Darstellung: `renderPanelMessage` in `@nexus/discord`.
 */
export type PanelButtonStyle = 'primary' | 'secondary' | 'success' | 'danger' | 'link';

/** Was beim Klick passiert. Weitere Aktionen (Bewerbung, Ticket, Shift …) kommen mit ihren Modulen. */
export type PanelAction =
  { type: 'message'; content: string } | { type: 'role-toggle'; roleId: string };

export interface PanelButton {
  /** Stabile ID innerhalb des Panels (Teil der Custom-ID). */
  id: string;
  label: string;
  emoji?: string | undefined;
  style: PanelButtonStyle;
  /** Nur für `link`-Buttons. */
  url?: string | undefined;
  /** Pflicht für alle Buttons außer `link`. */
  action?: PanelAction | undefined;
}

export interface PanelSelectOption {
  id: string;
  label: string;
  description?: string | undefined;
  emoji?: string | undefined;
  action: PanelAction;
}

export interface PanelSelect {
  placeholder?: string | undefined;
  options: PanelSelectOption[];
}

export interface PanelEmbed {
  title?: string | undefined;
  description?: string | undefined;
  /** `#rrggbb` */
  color?: string | undefined;
  thumbnailUrl?: string | undefined;
  imageUrl?: string | undefined;
  footer?: string | undefined;
  fields?: { name: string; value: string; inline?: boolean | undefined }[] | undefined;
}

export interface PanelConfig {
  /** Text oberhalb des Embeds. */
  content?: string | undefined;
  embed: PanelEmbed;
  buttons: PanelButton[];
  select?: PanelSelect | undefined;
}
