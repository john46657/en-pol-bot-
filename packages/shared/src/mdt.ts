import { z } from 'zod';

/**
 * Polizei-MDT (Bürger-, Fahrzeug- und Waffenakten). Lizenzen, Merkmale/Warnhinweise und Waffenarten sind im Dashboard
 * einstellbar (Einstellungen → MDT); hier stehen nur die Standardwerte.
 */
const option = z.object({ key: z.string().trim().min(1).max(32).regex(/^[A-Z0-9_]+$/, 'Schlüssel: nur A–Z, 0–9 und _'), label: z.string().trim().min(1).max(40) });
const unique = <T extends { key: string }>(xs: T[]) => new Set(xs.map((x) => x.key)).size === xs.length;
export const mdtConfigSchema = z.object({
  licenses: z.array(option).max(30).refine(unique, 'Schlüssel doppelt'),
  flags: z.array(option.extend({ tone: z.enum(['danger', 'warning', 'info', 'neutral']) })).max(30).refine(unique, 'Schlüssel doppelt'),
  weaponTypes: z.array(option).max(40).refine(unique, 'Schlüssel doppelt'),
  genders: z.array(z.string().trim().min(1).max(30)).max(10),
});
export type MdtConfig = z.infer<typeof mdtConfigSchema>;

export const DEFAULT_MDT_CONFIG: MdtConfig = {
  licenses: [
    { key: 'DRIVER', label: 'Führerschein' }, { key: 'WEAPON', label: 'Waffenschein' }, { key: 'BUSINESS', label: 'Gewerbeschein' },
    { key: 'PILOT', label: 'Flugschein' }, { key: 'BOAT', label: 'Bootsführerschein' },
  ],
  flags: [
    { key: 'DANGEROUS', label: 'Gefährlich', tone: 'danger' }, { key: 'ARMED', label: 'Bewaffnet', tone: 'danger' },
    { key: 'FLIGHT_RISK', label: 'Fluchtgefahr', tone: 'warning' }, { key: 'VIOLENT', label: 'Gewaltbereit', tone: 'warning' },
    { key: 'GANG', label: 'Bandenzugehörigkeit', tone: 'warning' },
  ],
  weaponTypes: [
    { key: 'PISTOL', label: 'Pistole' }, { key: 'RIFLE', label: 'Gewehr' }, { key: 'SHOTGUN', label: 'Schrotflinte' },
    { key: 'SMG', label: 'Maschinenpistole' }, { key: 'TASER', label: 'Taser' }, { key: 'KNIFE', label: 'Messer' }, { key: 'OTHER', label: 'Sonstige' },
  ],
  genders: ['Männlich', 'Weiblich', 'Divers'],
};

/** Status eines registrierten Gegenstands im Waffenregister. */
export const WEAPON_STATUSES = [
  { key: 'REGISTERED', label: 'Registriert', tone: 'success' }, { key: 'STOLEN', label: 'Gestohlen', tone: 'danger' },
  { key: 'SEIZED', label: 'Beschlagnahmt', tone: 'warning' }, { key: 'DESTROYED', label: 'Vernichtet', tone: 'neutral' },
] as const;
export type WeaponStatus = (typeof WEAPON_STATUSES)[number]['key'];
export const WEAPON_STATUS_KEYS = WEAPON_STATUSES.map((s) => s.key) as [WeaponStatus, ...WeaponStatus[]];

/** Personalien einer Person im MDT (alle optional; Datum als YYYY-MM-DD). */
export const personDetailsSchema = z.object({
  fullName: z.string().trim().max(80).nullish(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum als JJJJ-MM-TT').nullish(),
  gender: z.string().trim().max(30).nullish(),
  phone: z.string().trim().max(30).nullish(),
  job: z.string().trim().max(60).nullish(),
  nationality: z.string().trim().max(60).nullish(),
  address: z.string().trim().max(200).nullish(),
  appearance: z.object({ skinTone: z.string().max(40).optional(), hairColor: z.string().max(40).optional(), eyeColor: z.string().max(40).optional(), height: z.string().max(20).optional(), features: z.string().max(300).optional() }).nullish(),
  licenses: z.array(z.string().max(32)).max(30).optional(),
  flags: z.array(z.string().max(32)).max(30).optional(),
});
export type PersonDetails = z.infer<typeof personDetailsSchema>;

/** Alter in Jahren aus YYYY-MM-DD (oder null). */
export function ageOf(dob: string | null | undefined, now = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age >= 0 && age < 150 ? age : null;
}
