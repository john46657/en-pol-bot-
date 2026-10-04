/**
 * Funk-Zugriff als reine Funktion.
 *
 * Stufen: LISTEN (nur mithören), SPEAK (sprechen), FULL (Vollzugriff inkl. Spezialfunk).
 * Allgemeine Kanäle: LISTEN → mithören, SPEAK/FULL → sprechen.
 * Spezialfunk: FULL → sprechen; sonst nur mit Spezial-Freigabe (LISTEN → mithören, SPEAK → sprechen).
 * Kanäle mit „nur im Dienst“ sind ohne laufende (nicht pausierte) Schicht gesperrt.
 */
export type Level = 'LISTEN' | 'SPEAK' | 'FULL';
export type Area = 'GENERAL' | 'SPECIAL';
export type Access = 'none' | 'listen' | 'speak';
export type Reason = 'ok' | 'not-whitelisted' | 'level' | 'special-required' | 'off-duty' | 'inactive' | 'restricted';

export const LEVEL_LABEL: Record<Level, string> = { LISTEN: 'Mithören', SPEAK: 'Sprechen', FULL: 'Vollzugriff' };
export const AREA_LABEL: Record<Area, string> = { GENERAL: 'Allgemeinfunk', SPECIAL: 'Spezialfunk' };

export interface Entry {
  level: Level;
  special: boolean;
}
export interface ChannelRule {
  area: Area;
  requiresDuty: boolean;
  active?: boolean;
}

export function decideAccess(entry: Entry | null | undefined, channel: ChannelRule, onDuty: boolean): { access: Access; reason: Reason } {
  if (channel.active === false) return { access: 'none', reason: 'inactive' };
  if (!entry) return { access: 'none', reason: 'not-whitelisted' };
  if (channel.area === 'SPECIAL' && entry.level !== 'FULL' && !entry.special) return { access: 'none', reason: 'special-required' };
  if (channel.requiresDuty && !onDuty) return { access: 'none', reason: 'off-duty' };
  return { access: entry.level === 'LISTEN' ? 'listen' : 'speak', reason: 'ok' };
}

export const REASON_TEXT: Record<Reason, string> = {
  ok: 'Zugriff erlaubt.',
  'not-whitelisted': 'Du stehst nicht auf der Funk-Whitelist.',
  level: 'Deine Funkstufe reicht dafür nicht.',
  'special-required': 'Für Spezialfunk brauchst du eine Spezial-Freigabe oder Vollzugriff.',
  'off-duty': 'Dieser Funkkanal ist nur im Dienst nutzbar – starte zuerst eine Schicht.',
  inactive: 'Dieser Funkkanal ist deaktiviert.',
  restricted: 'Du bist für den Funk gesperrt.',
};
