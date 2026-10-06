import { z } from 'zod';
import { CommunicationService } from './communication.service';
import type { Actor } from '../audit/audit.service';
declare const channel: z.ZodEnum<["TEAM", "DISPATCH", "INCIDENT", "SUPERVISOR", "ANNOUNCEMENT"]>;
declare const post: z.ZodObject<{
    body: z.ZodString;
    entityId: z.ZodOptional<z.ZodString>;
    replyToId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    body: string;
    entityId?: string | undefined;
    replyToId?: string | undefined;
}, {
    body: string;
    entityId?: string | undefined;
    replyToId?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    entityId: z.ZodOptional<z.ZodString>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    entityId?: string | undefined;
    q?: string | undefined;
}, {
    entityId?: string | undefined;
    q?: string | undefined;
}>;
export declare class CommunicationController {
    private readonly c;
    constructor(c: CommunicationService);
    list(a: Actor, ch: z.infer<typeof channel>, q: z.infer<typeof listQ>): Promise<{
        id: string;
        createdAt: Date;
        body: string;
        authorId: string;
        deletedAt: Date | null;
        conversationId: string;
        replyToId: string | null;
        pinned: boolean;
    }[]>;
    post(a: Actor, ch: z.infer<typeof channel>, b: z.infer<typeof post>): Promise<{
        id: string;
        createdAt: Date;
        body: string;
        authorId: string;
        deletedAt: Date | null;
        conversationId: string;
        replyToId: string | null;
        pinned: boolean;
    }>;
    pin(a: Actor, id: string): Promise<{
        id: string;
        createdAt: Date;
        body: string;
        authorId: string;
        deletedAt: Date | null;
        conversationId: string;
        replyToId: string | null;
        pinned: boolean;
    }>;
    del(a: Actor, id: string): Promise<{
        id: string;
        createdAt: Date;
        body: string;
        authorId: string;
        deletedAt: Date | null;
        conversationId: string;
        replyToId: string | null;
        pinned: boolean;
    }>;
}
export {};
