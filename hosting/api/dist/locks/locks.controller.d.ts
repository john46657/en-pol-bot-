import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { LocksService, type LockType } from './locks.service';
declare const acquireBody: z.ZodObject<{
    force: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    force?: boolean | undefined;
}, {
    force?: boolean | undefined;
}>;
/** Rechte je Datensatzart werden im Service geprüft (Ansehen bzw. Bearbeiten des jeweiligen Moduls). */
export declare class LocksController {
    private readonly locks;
    constructor(locks: LocksService);
    status(a: Actor, type: LockType, id: string): Promise<{
        locked: boolean;
        mine: boolean;
        holder: {
            id: string;
            displayName: string;
        };
        since: Date;
        expiresAt: Date;
    } | {
        locked: boolean;
        mine: boolean;
        holder?: undefined;
        since?: undefined;
        expiresAt?: undefined;
    }>;
    acquire(a: Actor, type: LockType, id: string, b: z.infer<typeof acquireBody>): Promise<{
        locked: boolean;
        mine: boolean;
        holder: {
            id: string;
            displayName: string;
        };
        since: Date;
        expiresAt: Date;
        ok: boolean;
    } | {
        locked: boolean;
        mine: boolean;
        holder?: undefined;
        since?: undefined;
        expiresAt?: undefined;
        ok: boolean;
    }>;
    release(a: Actor, type: LockType, id: string): Promise<void>;
}
export {};
