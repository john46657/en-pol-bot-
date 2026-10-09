import { z } from 'zod';

/**
 * Polizeifahrzeuge: Live-Liste aus der ER:LC-API (nur gespawnte Fahrzeuge) und ein getrennter, gepflegter Modellkatalog.
 *
 * Was die ER:LC-API je Fahrzeug liefert: Modellname, Besitzer (wer es gespawnt hat), Kennzeichen, Lackierung (Texture),
 * Farbe. Sie liefert **keine** Fahrzeug-ID, **keine** Fahrzeugposition und **keinen** Fahrer. Deshalb:
 * - Fahrer → immer „Fahrerdaten nicht verfügbar“ (der Besitzer wird getrennt gezeigt),
 * - Position → höchstens die Position des Besitzers, ausdrücklich so beschriftet,
 * - Wiedererkennung über Besitzer + Modell + Kennzeichen; mehrere gleiche Fahrzeuge desselben Besitzers → „unsicher“.
 */
const key = z.string().trim().min(1).max(32).regex(/^[A-Z0-9_]+$/, 'Schlüssel: nur A–Z, 0–9 und _');
const unique = <T extends { key: string }>(xs: T[]) => new Set(xs.map((x) => x.key)).size === xs.length;
export const fleetConfigSchema = z.object({
  categories: z.array(z.object({ key, label: z.string().trim().min(1).max(40), icon: z.string().trim().min(1).max(8) })).min(1).max(30).refine(unique, 'Schlüssel doppelt'),
  internalStatuses: z.array(z.object({ key, label: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).min(1).max(20).refine(unique, 'Schlüssel doppelt'),
  /** Mindestabstand zwischen zwei Abgleichen der Live-Fahrzeuge (Sekunden); der ER:LC-Abruf selbst läuft im eingestellten Server-Intervall. */
  syncSeconds: z.number().int().min(5).max(600),
  /** Nicht mehr gemeldete Fahrzeuge ohne interne Daten nach so vielen Tagen löschen. */
  keepInactiveDays: z.number().int().min(1).max(90),
});
export type FleetConfig = z.infer<typeof fleetConfigSchema>;

export const DEFAULT_FLEET_CONFIG: FleetConfig = {
  categories: [
    { key: 'PATROL', label: 'Streifenwagen', icon: '🚓' }, { key: 'SUV', label: 'SUV', icon: '🚙' }, { key: 'UNMARKED', label: 'Zivilfahrzeug', icon: '🕵️' },
    { key: 'MOTORCYCLE', label: 'Motorrad', icon: '🏍️' }, { key: 'SPECIAL', label: 'Sonderfahrzeug', icon: '🚐' }, { key: 'OTHER', label: 'Sonstiges', icon: '🚗' },
  ],
  internalStatuses: [
    { key: 'UNASSIGNED', label: 'Nicht zugewiesen', color: '#64748b' }, { key: 'ASSIGNED', label: 'Zugewiesen', color: '#3b82f6' },
    { key: 'ON_MISSION', label: 'Im Einsatz', color: '#f97316' }, { key: 'OUT_OF_SERVICE', label: 'Außer Dienst', color: '#475569' },
  ],
  syncSeconds: 10,
  keepInactiveDays: 7,
};

/** Fahrer: die ER:LC-API meldet keinen Fahrer – Zustände für die Anzeige (nichts wird geraten). */
export const DRIVER_STATES = {
  recognized: 'Fahrer erkannt',
  ambiguous: 'Fahrer nicht eindeutig erkennbar',
  none: 'Kein Fahrer erkannt',
  unavailable: 'Fahrerdaten nicht verfügbar',
} as const;
export type DriverState = keyof typeof DRIVER_STATES;
export const DRIVER_HINT = 'ER:LC meldet nur, wer das Fahrzeug gespawnt hat (Besitzer) – nicht, wer gerade fährt.';
export const POSITION_HINT = 'Position des Besitzers laut ER:LC – keine Fahrzeugposition (die API liefert keine).';

export const fleetModelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Modellname genau so, wie ER:LC ihn meldet (z. B. „Falcon Interceptor Utility 2019“) – darüber werden Live-Fahrzeuge zugeordnet. */
  erlcName: z.string().trim().min(1).max(120),
  category: key,
  description: z.string().trim().max(1000).nullish(),
  internalCode: z.string().trim().max(40).nullish(),
  active: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  department: z.string().trim().max(60).nullish(),
});
export type FleetModelInput = z.infer<typeof fleetModelSchema>;

export const fleetInternalSchema = z.object({
  unitId: z.string().uuid().nullish(),
  internalStatus: key.optional(),
  internalCode: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(3000).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});
export type FleetInternalInput = z.infer<typeof fleetInternalSchema>;
