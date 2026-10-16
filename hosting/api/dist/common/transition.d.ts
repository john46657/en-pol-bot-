import { TransitionMap } from '@enrp/shared';
export declare function nextStatus<S extends string>(map: TransitionMap<S>, from: string, to: S): S;
/** Nur Felder, deren Wert sich wirklich ändert (Datumswerte nach Zeitpunkt verglichen) – für Verlauf und Audit. */
export declare function changedFields<T extends Record<string, unknown>>(before: Record<string, unknown>, data: T): Partial<T>;
