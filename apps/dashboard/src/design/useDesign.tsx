import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_CONFIG,
  backgroundFor,
  backgroundStyle,
  designVars,
  normalizeConfig,
  type DesignConfig,
} from '@nexus/design/client';
import { createContext, useContext, useEffect } from 'react';
import { api } from '../api';
import { setServerThemeDefault, useTheme } from '../theme';
import { assetUrl } from './assetUrl';
import { loadFont } from './fonts';

interface EffectiveDesign {
  config: DesignConfig;
  themeName: string;
  source: 'theme' | 'last-good' | 'default';
}
const ANIM_FLAGS = [
  ['anim-page', 'pageTransitions'],
  ['anim-card', 'cardHover'],
  ['anim-button', 'buttonHover'],
  ['anim-sidebar', 'sidebar'],
  ['anim-modal', 'modal'],
  ['anim-notification', 'notification'],
] as const;

/** Setzt CSS-Variablen und Schalter am <html>-Element; Aufräumen beim Verlassen. */
export function applyDesign(
  config: DesignConfig,
  mode: 'dark' | 'light',
  root: HTMLElement = document.documentElement,
): () => void {
  const vars = designVars(config, mode);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  for (const [attr, key] of ANIM_FLAGS)
    root.dataset[camel(attr)] = !config.animation.disabled && config.animation[key] ? 'on' : 'off';
  return () => {
    for (const k of Object.keys(vars)) root.style.removeProperty(k);
    for (const [attr] of ANIM_FLAGS) delete root.dataset[camel(attr)];
  };
}
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Das wirksame Design des Servers; bei Fehlern und solange es lädt gilt der Standard – nie ein leerer Bildschirm. */
export function useDesign(guildId: string) {
  const q = useQuery({
    queryKey: ['design-effective', guildId],
    queryFn: async () => {
      const r = await api<EffectiveDesign>(`/guilds/${guildId}/design/effective`);
      return { ...r, config: normalizeConfig(r.config) };
    },
    staleTime: 60_000, // Konfiguration cachen (nur beim Speichern wird sie ungültig gemacht)
  });
  const config = q.data?.config ?? DEFAULT_CONFIG;
  const { theme: mode } = useTheme(); // eigene Wahl > Server-Vorgabe > System (siehe theme.ts)
  useEffect(() => {
    setServerThemeDefault(config.mode === 'system' ? null : config.mode);
    return () => setServerThemeDefault(null);
  }, [config.mode]);
  useEffect(() => {
    void loadFont(config.typography.fontMain);
    void loadFont(config.typography.fontHeading);
    return applyDesign(config, mode);
  }, [config, mode]);
  return {
    config,
    mode,
    loading: q.isLoading,
    source: q.data?.source ?? 'default',
    themeName: q.data?.themeName ?? '',
  };
}

/** Hintergrundebene (und Overlay) der aktuellen Seite: eigener Hintergrund, sonst der globale. */
export function DesignBackground({ config, page }: { config: DesignConfig; page: string }) {
  const bg = backgroundFor(config, page);
  const { layer, overlay } = backgroundStyle(bg, config.colors.dark.background, assetUrl);
  return (
    <>
      <div className="design-bg" style={layer} aria-hidden data-page={page} />
      {overlay && <div className="design-overlay" style={overlay} aria-hidden />}
    </>
  );
}

/** Die wirksame Konfiguration für Seiten unterhalb des Layouts (das Layout wendet sie an; Seiten lesen sie nur). */
export const DesignCtx = createContext<DesignConfig>(DEFAULT_CONFIG);
export const useDesignConfig = (): DesignConfig => useContext(DesignCtx);
