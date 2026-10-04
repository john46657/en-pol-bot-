import { z } from 'zod';
import { RadioService } from './radio.service';
import type { Actor } from '../audit/audit.service';
declare const target: z.ZodEffects<z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    discordId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId?: string | undefined;
    discordId?: string | undefined;
}, {
    userId?: string | undefined;
    discordId?: string | undefined;
}>, {
    userId?: string | undefined;
    discordId?: string | undefined;
}, {
    userId?: string | undefined;
    discordId?: string | undefined;
}>;
export declare class RadioController {
    private readonly r;
    constructor(r: RadioService);
    list(): Promise<{
        userId: string;
        displayName: string;
        callsign: string | null;
        rank: string | null;
        since: Date;
    }[]>;
    check(q: z.infer<typeof target>): Promise<{
        whitelisted: boolean;
        displayName: string;
    }>;
    add(a: Actor, b: z.infer<typeof target>): Promise<{
        userId: string;
        displayName: string;
        whitelisted: boolean;
    }>;
    remove(a: Actor, b: z.infer<typeof target>): Promise<{
        userId: string;
        displayName: string;
        whitelisted: boolean;
    }>;
}
export {};
