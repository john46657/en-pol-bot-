import { z } from 'zod';
import { DangerService } from './danger.service';
import type { Actor } from '../audit/audit.service';
declare const body: z.ZodObject<{
    level: z.ZodEnum<["GREEN", "YELLOW", "RED"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    level: "GREEN" | "YELLOW" | "RED";
    reason?: string | undefined;
}, {
    level: "GREEN" | "YELLOW" | "RED";
    reason?: string | undefined;
}>;
export declare class DangerController {
    private readonly d;
    constructor(d: DangerService);
    get(): Promise<import("./danger.service").DangerState>;
    set(a: Actor, b: z.infer<typeof body>): Promise<import("./danger.service").DangerState>;
}
export {};
