import { TransitionMap } from '@enrp/shared';
export declare function nextStatus<S extends string>(map: TransitionMap<S>, from: string, to: S): S;
