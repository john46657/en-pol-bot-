import { z } from 'zod';
import type { VoiceSupportRoom } from '@enrp/shared';
import { VoiceSupportService } from './voice-support.service';
import type { Actor } from '../audit/audit.service';
declare const guildQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
}, {
    guildId?: string | undefined;
}>;
declare const casesQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["OPEN", "WAITING", "CLAIMED", "DECLINED", "ABANDONED", "CLOSED"]>>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
    status?: "CLAIMED" | "CLOSED" | "OPEN" | "WAITING" | "DECLINED" | "ABANDONED" | undefined;
}, {
    guildId?: string | undefined;
    status?: "CLAIMED" | "CLOSED" | "OPEN" | "WAITING" | "DECLINED" | "ABANDONED" | undefined;
}>;
declare const voice: z.ZodObject<{
    guildId: z.ZodString;
    channelId: z.ZodString;
    discordId: z.ZodString;
    userName: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    guildId: string;
    userName: string;
    channelId: string;
}, {
    discordId: string;
    guildId: string;
    channelId: string;
    userName?: string | undefined;
}>;
declare const staff: z.ZodObject<{
    discordId: z.ZodString;
    name: z.ZodString;
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    admin: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    discordId: string;
    roleIds: string[];
    admin: boolean;
}, {
    name: string;
    discordId: string;
    roleIds?: string[] | undefined;
    admin?: boolean | undefined;
}>;
/** Dashboard: Räume (Tickets → Sprach-Support) und Fälle. */
export declare class VoiceSupportController {
    private readonly s;
    constructor(s: VoiceSupportService);
    rooms(q: z.infer<typeof guildQ>): Promise<VoiceSupportRoom[]>;
    save(a: Actor, q: z.infer<typeof guildQ>, b: VoiceSupportRoom[]): Promise<VoiceSupportRoom[]>;
    cases(q: z.infer<typeof casesQ>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        userId: string;
        guildId: string;
        userName: string;
        status: string;
        channelId: string | null;
        claimedById: string | null;
        closedAt: Date | null;
        messages: number;
        rating: number | null;
        closeReason: string | null;
        closedById: string | null;
        closedByName: string | null;
        notifyChannelId: string | null;
        roomId: string;
        roomName: string;
        claimedByName: string | null;
        claimedAt: Date | null;
        createdChannel: boolean;
        notifyMessageId: string | null;
        threadId: string | null;
    }[]>;
}
/** Dienstweg des Bots. Team-Aktionen tragen Discord-ID, Name und Rollen der klickenden Person (Team-Rolle des Raums). */
export declare class BotVoiceSupportController {
    private readonly s;
    constructor(s: VoiceSupportService);
    rooms(q: z.infer<typeof guildQ>): Promise<VoiceSupportRoom[]>;
    join(b: z.infer<typeof voice>): Promise<{
        action: "none";
        dm?: undefined;
        caseId?: undefined;
        channelId?: undefined;
        message?: undefined;
    } | {
        action: "closed";
        dm: {
            embeds: {
                title: string;
                description: string;
                color: number;
            }[];
        };
        caseId?: undefined;
        channelId?: undefined;
        message?: undefined;
    } | {
        action: "notify";
        caseId: string;
        channelId: string;
        message: import("@enrp/shared").MessageSpec;
        dm?: undefined;
    }>;
    left(b: z.infer<typeof voice>): Promise<{
        edits: {
            channelId: string;
            messageId: string;
            message: import("@enrp/shared").MessageSpec;
        }[];
    }>;
    empty(b: {
        channelId: string;
    }): Promise<{
        closed: boolean;
    } | {
        edit: {
            channelId: string;
            messageId: string;
            message: import("@enrp/shared").MessageSpec;
        } | null;
        deleteChannelId: string | null;
        userId: string;
        ratingDm: {
            embeds: {
                title: string;
                description: string;
                color: number;
            }[];
            buttons: {
                id: string;
                label: string;
                style: "danger" | "success" | "secondary";
            }[];
        } | null;
        closed: boolean;
    }>;
    posted(id: string, b: {
        messageId: string;
    }): Promise<void>;
    claim(id: string, b: z.infer<typeof staff>): Promise<{
        case: {
            id: string;
            number: string;
            userId: string;
            userName: string;
            guildId: string;
        };
        room: {
            name: string;
            waitingChannelId: string;
            teamRoleId: string;
            channelPrefix: string;
            notes: boolean;
            ownChannels: boolean;
            ownChannelIds: string[];
        } | null;
        edit: {
            channelId: string;
            messageId: string;
            message: import("@enrp/shared").MessageSpec;
        } | null;
    }>;
    channel(id: string, b: {
        channelId: string | null;
        created: boolean;
        threadId: string | null;
    }): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: import("@enrp/shared").MessageSpec;
        } | null;
    }>;
    decline(id: string, b: z.infer<typeof staff> & {
        reason?: string;
    }): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: import("@enrp/shared").MessageSpec;
        } | null;
        userId: string;
        dm: {
            embeds: {
                title: string;
                description: string;
                color: number;
            }[];
        };
    }>;
    message(id: string, b: z.infer<typeof staff> & {
        text: string;
    }): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: import("@enrp/shared").MessageSpec;
        } | null;
        userId: string;
        threadId: string | null;
        dm: {
            embeds: {
                title: string;
                description: string;
                color: number;
                footer: string;
            }[];
        };
        log: string;
    }>;
    close(id: string, b: z.infer<typeof staff>): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: import("@enrp/shared").MessageSpec;
        } | null;
        deleteChannelId: string | null;
        userId: string;
        ratingDm: {
            embeds: {
                title: string;
                description: string;
                color: number;
            }[];
            buttons: {
                id: string;
                label: string;
                style: "danger" | "success" | "secondary";
            }[];
        } | null;
    }>;
    rate(id: string, b: {
        discordId: string;
        stars: number;
    }): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: import("@enrp/shared").MessageSpec;
        } | null;
    }>;
}
export {};
