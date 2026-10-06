import { z } from 'zod';
import { TeamChanceService, teamChanceSchema } from './teamchance.service';
import type { Actor } from '../audit/audit.service';
declare const guildQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
}, {
    guildId?: string | undefined;
}>;
export declare class TeamChanceController {
    private readonly s;
    constructor(s: TeamChanceService);
    get(): Promise<{
        isOpen: boolean;
        reason: string | null;
        used: number;
        remaining: number | null;
        description: string;
        channelId: string | null;
        title: string;
        open: boolean;
        opensAt: string | null;
        closesAt: string | null;
        slots: number;
        pingRoleIds: string[];
        restrictApplications: boolean;
        openedAt?: string | null;
    }>;
    save(a: Actor, b: z.infer<typeof teamChanceSchema>): Promise<{
        isOpen: boolean;
        reason: string | null;
        used: number;
        remaining: number | null;
        description: string;
        channelId: string | null;
        title: string;
        open: boolean;
        opensAt: string | null;
        closesAt: string | null;
        slots: number;
        pingRoleIds: string[];
        restrictApplications: boolean;
        openedAt?: string | null;
    }>;
    pub(q: z.infer<typeof guildQ>): Promise<{
        isOpen: boolean;
        reason: string | null;
        title: string;
        description: string;
        opensAt: string | null;
        closesAt: string | null;
        remaining: number | null;
        restrictApplications: boolean;
    }>;
    bot(q: z.infer<typeof guildQ>): Promise<{
        isOpen: boolean;
        reason: string | null;
        title: string;
        description: string;
        opensAt: string | null;
        closesAt: string | null;
        remaining: number | null;
        restrictApplications: boolean;
    }>;
}
export {};
