import { assertTransition, TransitionMap } from '@enrp/shared';
import { AppError } from './errors';

export function nextStatus<S extends string>(map: TransitionMap<S>, from: string, to: S): S {
  if (!(from in map)) throw new AppError('INVALID_TRANSITION', `Unbekannter Status „${from}“.`);
  assertTransition(map, from as S, to);
  return to;
}
