/**
 * Discord-Panels der Bewerbungen – vom Dashboard (Senden/Aktualisieren) und vom Bot (/bewerbungspanel, /qualipanel) gleich gebaut.
 * Einheiten mit `panel: 'apply'` stehen im Bewerbungs-Panel neben der Polizei-Bewerbung, alle anderen im Qualifikations-Panel.
 */

/** Schlüssel der Polizei-Bewerbung im Auswahlmenü bzw. am Button (`quali:pick:@polizei`). */
export const POLICE_APPLICATION_KEY = '@polizei';
export type ApplicationPanelKind = 'quali' | 'apply';
export interface PanelUnit { key: string; name: string; description: string; enabled?: boolean; panel?: ApplicationPanelKind }
export interface ApplicationPanelConfig {
  title: string; intro: string; units: PanelUnit[];
  police?: { title: string; description: string; name?: string; enabled?: boolean };
}
export interface ApplicationPanelParts {
  title: string; description?: string;
  button?: { id: string; label: string; emoji: string; style: 'primary' };
  select?: { id: string; placeholder: string; options: { label: string; value: string; description?: string }[] };
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
/** Markdown aus Namen entschärfen (wie im Bot). */
const plain = (s: string) => s.replace(/[*_`~|>\\]/g, '\\$&').replace(/@(everyone|here)/g, '@\u200b$1');
const optionOf = (u: { key: string; name: string; description?: string; enabled?: boolean }) => ({
  label: clip(`${u.name}${u.enabled === false ? ' (geschlossen)' : ''}`, 100), value: u.key,
  ...(u.description ? { description: clip(plain(u.description).replace(/\*|_/g, ''), 100) } : {}),
});
const section = (u: PanelUnit) => `**__${plain(u.name)}:__**\n${u.description}`;

export const panelUnits = (units: PanelUnit[], kind: ApplicationPanelKind) => units.filter((u) => (u.panel ?? 'quali') === kind);

/** Qualifikations-Panel: Einleitung, Beschreibung je Einheit und Auswahlmenü. */
export function qualiPanelParts(cfg: ApplicationPanelConfig): ApplicationPanelParts {
  const units = panelUnits(cfg.units, 'quali');
  return {
    title: clip(cfg.title, 256), description: clip([cfg.intro, ...units.map(section)].filter(Boolean).join('\n\n'), 4000),
    select: { id: 'quali:pick', placeholder: 'Triff eine Auswahl', options: units.slice(0, 25).map(optionOf) },
  };
}

/** Bewerbungs-Panel: nur Polizei → Button „Jetzt bewerben“; mit weiteren Bewerbungsarten → Auswahlmenü (Polizei zuerst). */
export function applyPanelParts(cfg: ApplicationPanelConfig): ApplicationPanelParts {
  const p = cfg.police ?? { title: '📋 Bewerbung bei EN Polizei', description: '' };
  const extra = panelUnits(cfg.units, 'apply');
  const title = clip(p.title, 256);
  if (!extra.length) return { title, ...(p.description ? { description: clip(p.description, 4000) } : {}), button: { id: `quali:pick:${POLICE_APPLICATION_KEY}`, label: 'Jetzt bewerben', emoji: '📋', style: 'primary' } };
  const police = { key: POLICE_APPLICATION_KEY, name: p.name || 'Polizei', enabled: p.enabled };
  return {
    title, description: clip([p.description, ...extra.map(section)].filter(Boolean).join('\n\n'), 4000),
    select: { id: 'quali:pick', placeholder: 'Wofür möchtest du dich bewerben?', options: [police, ...extra].slice(0, 25).map(optionOf) },
  };
}
