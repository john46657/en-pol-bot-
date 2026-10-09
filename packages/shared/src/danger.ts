/**
 * Gefahrenstatus (Kriminalitätslage) – Stufen, Texte, Farben, Buttons und Pings sind im Dashboard einstellbar.
 * Standard wie im alten Bot: „Status 1“ bis „Status 4“.
 */
export interface DangerLevelDef { key: string; name: string; title: string; text: string; emoji: string; color: string; buttonStyle: 'primary' | 'secondary' | 'success' | 'danger';
  /** Discord-Rollen, die nur beim Wechsel auf diese Stufe zusätzlich gepingt werden */
  pingRoleIds?: string[];
  /** Nur diese Discord-Rollen dürfen auf diese Stufe schalten (leer = alle mit dispatch.manage) */
  allowRoleIds?: string[] }
export interface DangerConfig { panelTitle: string; panelText: string; buttonEmoji: string; levels: DangerLevelDef[]; pingRoleIds: string[] }

export const DEFAULT_DANGER_CONFIG: DangerConfig = {
  panelTitle: 'Gefahrenstatus',
  panelText: '• Drücke den entsprechenden Button, um Einheiten zu informieren, wie hoch aktuell die Kriminalität in der Stadt ist!\n\n• Desto früher mitgeteilt wird, desto besser können sich alle Einheiten vorbereiten und schnell ausrücken!',
  buttonEmoji: '❗',
  pingRoleIds: [],
  levels: [
    { key: 'STATUS_1', name: 'Status 1', title: 'Geringe Kriminalität.', emoji: '🟢', color: '#2ecc71', buttonStyle: 'danger',
      text: '## Die Stadt ist heute besonders ruhig. 🍃\n• Bis auf kleinere Verstöße wie im Straßenverkehr oder Ruhestörung gibt es nicht wirklich viel für unsere Einsatzkräfte zu tun. 🚚🚗🚓\n\n• 🗃️ Vielleicht ist es mal ein Tag, sich mehr um Büroarbeit zu kümmern und unser Präsidium auf den neuesten Stand zu bringen.\n\n• Entspannt euch, seid aber immer bereit! ❗' },
    { key: 'STATUS_2', name: 'Status 2', title: 'Mittlere Kriminalität.', emoji: '🟡', color: '#f1c40f', buttonStyle: 'danger',
      text: '## In der Stadt ist einiges los. 🚨\n• Es kommt vermehrt zu Einsätzen – Diebstähle, Verfolgungen und Streitigkeiten nehmen zu.\n\n• Bleibt aufmerksam und haltet Funkkontakt mit der Leitstelle.' },
    { key: 'STATUS_3', name: 'Status 3', title: 'Hohe Kriminalität.', emoji: '🟠', color: '#e67e22', buttonStyle: 'danger',
      text: '## Die Lage ist angespannt! ⚠️\n• Schwere Straftaten und bewaffnete Täter sind unterwegs.\n\n• Nur mit Partner und Schutzausrüstung ausrücken, Verstärkung frühzeitig anfordern.' },
    { key: 'STATUS_4', name: 'Status 4', title: 'Extreme Kriminalität.', emoji: '🔴', color: '#e74c3c', buttonStyle: 'danger',
      text: '## Ausnahmezustand! 🚔🚔🚔\n• Akute Gefahrenlage in der Stadt – alle verfügbaren Einheiten werden benötigt.\n\n• Eigensicherung geht vor! Anweisungen der Leitstelle sofort befolgen.' },
  ],
};
/** Alte Stufen (Grün/Gelb/Rot) → Standard-Stufen, falls die Konfiguration sie nicht mehr kennt. */
export const LEGACY_DANGER: Record<string, string> = { GREEN: 'STATUS_1', YELLOW: 'STATUS_2', RED: 'STATUS_4' };
export function dangerLevelOf(cfg: DangerConfig, key: string | null | undefined): DangerLevelDef {
  return cfg.levels.find((l) => l.key === key) ?? cfg.levels.find((l) => l.key === LEGACY_DANGER[key ?? '']) ?? cfg.levels[0]!;
}
