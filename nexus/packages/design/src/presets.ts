import { DEFAULT_CONFIG, mergeDeep, normalizeConfig, type DesignConfig } from './config.js';

const accent = (
  primary: string,
  hover: string,
  bg: string,
  surface: string,
  hoverSurface: string,
  bar: string,
  border: string,
  lightPrimary: string,
  lightHover: string,
) => ({
  colors: {
    dark: {
      primary,
      primaryHover: hover,
      background: bg,
      surface,
      surfaceHover: hoverSurface,
      sidebar: bar,
      header: bar,
      border,
    },
    light: { primary: lightPrimary, primaryHover: lightHover },
  },
  background: { global: { color: bg, color2: primary } },
});

/** Mitgelieferte Vorlagen. Werden beim ersten Aufruf je Server als Themes angelegt (duplizier- und aktivierbar). */
export const PRESETS: { name: string; description: string; config: DesignConfig }[] = [
  {
    name: 'Standard',
    description: 'Ruhiges Dunkelblau mit Discord-Blau als Akzent.',
    config: DEFAULT_CONFIG,
  },
  {
    name: 'Midnight',
    description: 'Sehr dunkel mit Farbverlauf im Hintergrund.',
    config: normalizeConfig(
      mergeDeep(
        accent(
          '#6C8CFF',
          '#5875E0',
          '#05070D',
          '#0C101A',
          '#131826',
          '#080B13',
          '#1A2133',
          '#3C55C0',
          '#2F45A0',
        ),
        {
          background: {
            global: { type: 'gradient', color: '#05070D', color2: '#1A2255', angle: 160 },
          },
        },
      ),
    ),
  },
  {
    name: 'Purple',
    description: 'Violett mit warmem Dunkelhintergrund.',
    config: normalizeConfig(
      accent(
        '#9B59FF',
        '#8441E6',
        '#0E0A16',
        '#181226',
        '#21193A',
        '#120D1D',
        '#2A2040',
        '#7A3FD1',
        '#6530B5',
      ),
    ),
  },
  {
    name: 'Blue',
    description: 'Klares Polizeiblau.',
    config: normalizeConfig(
      accent(
        '#2F80ED',
        '#2468C4',
        '#08111C',
        '#0F1B2B',
        '#162740',
        '#0B1624',
        '#1F3250',
        '#1F66C9',
        '#1852A3',
      ),
    ),
  },
  {
    name: 'Red',
    description: 'Kräftiges Rot für Warn- und Einsatzserver.',
    config: normalizeConfig(
      accent(
        '#E5484D',
        '#C93B40',
        '#130A0B',
        '#1E1214',
        '#2A181B',
        '#180D0F',
        '#3A2024',
        '#C93B40',
        '#A92F34',
      ),
    ),
  },
];
export const DEFAULT_THEME_NAME = 'Standard';
