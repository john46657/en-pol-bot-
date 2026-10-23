import { z } from 'zod';
import { RemindersService } from './reminders.service';
declare const create: z.ZodObject<{
    discordId: z.ZodString;
    guildId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    text: z.ZodString;
    dm: z.ZodBoolean;
    delayMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    text: string;
    dm: boolean;
    delayMs: number;
    guildId?: string | null | undefined;
    channelId?: string | null | undefined;
}, {
    discordId: string;
    text: string;
    dm: boolean;
    delayMs: number;
    guildId?: string | null | undefined;
    channelId?: string | null | undefined;
}>;
declare const who: z.ZodObject<{
    discordId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    discordId: string;
}, {
    discordId: string;
}>;
declare const snooze: z.ZodObject<{
    discordId: z.ZodString;
    fire: z.ZodNumber;
    minutes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    minutes: number;
    fire: number;
}, {
    discordId: string;
    minutes: number;
    fire: number;
}>;
declare const done: z.ZodObject<{
    discordId: z.ZodString;
    fire: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    fire: number;
}, {
    discordId: string;
    fire: number;
}>;
/** Erinnerungen für den Bot (`/remind-me`, `/erinnerungen`, Buttons) – ohne verknüpftes Konto nutzbar, immer nur die eigenen. */
export declare class BotRemindersController {
    private readonly r;
    constructor(r: RemindersService);
    create(b: z.infer<typeof create>): Promise<{
        duplicate: boolean;
        id: string;
        text: string;
        dm: boolean;
        dueAt: string;
        status: string;
        fireCount: number;
        channelId: string | null;
        createdAt: string;
    }>;
    list(q: z.infer<typeof who>): Promise<{
        id: string;
        text: string;
        dm: boolean;
        dueAt: string;
        status: string;
        fireCount: number;
        channelId: string | null;
        createdAt: string;
    }[]>;
    cancel(id: string, q: z.infer<typeof who>): Promise<{
        ok: boolean;
    }>;
    snooze(id: string, b: z.infer<typeof snooze>): Promise<{
        id: string;
        text: string;
        dm: boolean;
        dueAt: string;
        status: string;
        fireCount: number;
        channelId: string | null;
        createdAt: string;
    }>;
    done(id: string, b: z.infer<typeof done>): Promise<{
        ok: boolean;
    }>;
}
export {};
