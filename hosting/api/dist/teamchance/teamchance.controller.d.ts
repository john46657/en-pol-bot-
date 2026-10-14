import { z } from 'zod';
import { TeamChanceService, teamChanceSchema } from './teamchance.service';
import type { Actor } from '../audit/audit.service';
export declare class TeamChanceController {
    private readonly s;
    constructor(s: TeamChanceService);
    get(): Promise<{
        isOpen: boolean;
        reason: string | null;
        used: number;
        remaining: number | null;
        title: string;
        description: string;
        channelId: string | null;
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
        title: string;
        description: string;
        channelId: string | null;
        open: boolean;
        opensAt: string | null;
        closesAt: string | null;
        slots: number;
        pingRoleIds: string[];
        restrictApplications: boolean;
        openedAt?: string | null;
    }>;
    pub(): Promise<{
        isOpen: boolean;
        reason: string | null;
        title: string;
        description: string;
        opensAt: string | null;
        closesAt: string | null;
        remaining: number | null;
        restrictApplications: boolean;
    }>;
    bot(): Promise<{
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
