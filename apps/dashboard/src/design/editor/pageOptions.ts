import { NAV } from '../../pages/GuildLayout';

/** Seiten, die ein Button oder ein Seiten-Hintergrund als Ziel haben kann (Schlüssel, Beschriftung). */
export const PAGE_OPTIONS: readonly (readonly [string, string])[] = [
  ['overview', 'Übersicht'],
  ...NAV.filter((n) => n.to !== '').map((n) => [n.to, n.label] as const),
];
