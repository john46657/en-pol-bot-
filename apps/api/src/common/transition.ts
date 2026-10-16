import { assertTransition, TransitionMap } from '@enrp/shared';
import { AppError } from './errors';

export function nextStatus<S extends string>(map: TransitionMap<S>, from: string, to: S): S {
  if (!(from in map)) throw new AppError('INVALID_TRANSITION', `Unbekannter Status „${from}“.`);
  assertTransition(map, from as S, to);
  return to;
}

/** Nur Felder, deren Wert sich wirklich ändert (Datumswerte nach Zeitpunkt verglichen) – für Verlauf und Audit. */
export function changedFields<T extends Record<string, unknown>>(before: Record<string, unknown>, data: T): Partial<T> {
  const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v ?? null);
  return Object.fromEntries(Object.entries(data).filter(([k, v]) => norm(v) !== norm(before[k]))) as Partial<T>;
}
