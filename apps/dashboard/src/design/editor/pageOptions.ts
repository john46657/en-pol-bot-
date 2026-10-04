import type { CustomPage } from '@nexus/design/client';
import { NAV } from '../../pages/GuildLayout';

/** Seiten, die ein Button oder ein Seiten-Hintergrund als Ziel haben kann (Schlüssel, Beschriftung) – eingebaute und eigene. */
export const pageOptions = (
  custom: readonly CustomPage[] = [],
): readonly (readonly [string, string])[] => [
  ['overview', 'Übersicht'],
  ...NAV.filter((n) => n.to !== '').map((n) => [n.to, n.label] as const),
  ...custom.map((c) => [c.key, `${c.icon || '📄'} ${c.name} (eigene Seite)`] as const),
];
