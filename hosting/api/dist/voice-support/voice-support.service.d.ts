import { type VoiceSupportCase } from '@prisma/client';
import { z } from 'zod';
import { type MessageSpec, type VoiceSupportRoom } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DiscordService } from '../discord/discord.service';
export declare const roomSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    guildId: z.ZodString;
    name: z.ZodString;
    enabled: z.ZodBoolean;
    waitingChannelId: z.ZodString;
    notifyChannelId: z.ZodString;
    teamRoleId: z.ZodString;
    channelPrefix: z.ZodDefault<z.ZodString>;
    notes: z.ZodDefault<z.ZodBoolean>;
    ownChannels: z.ZodDefault<z.ZodBoolean>;
    ownChannelIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    times: z.ZodDefault<z.ZodArray<z.ZodObject<{
        days: z.ZodArray<z.ZodNumber, "many">;
        from: z.ZodString;
        to: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        from: string;
        days: number[];
        to: string;
    }, {
        from: string;
        days: number[];
        to: string;
    }>, "many">>;
    rating: z.ZodDefault<z.ZodBoolean>;
    music: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        openTrack: z.ZodDefault<z.ZodEnum<[string, ...string[]]>>;
        closedTrack: z.ZodDefault<z.ZodEnum<[string, ...string[]]>>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        openTrack: string;
        closedTrack: string;
    }, {
        enabled?: boolean | undefined;
        openTrack?: string | undefined;
        closedTrack?: string | undefined;
    }>>;
    primary: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    guildId: string;
    notes: boolean;
    enabled: boolean;
    notifyChannelId: string;
    rating: boolean;
    primary: boolean;
    waitingChannelId: string;
    teamRoleId: string;
    channelPrefix: string;
    ownChannels: boolean;
    ownChannelIds: string[];
    times: {
        from: string;
        days: number[];
        to: string;
    }[];
    music: {
        enabled: boolean;
        openTrack: string;
        closedTrack: string;
    };
}, {
    id: string;
    name: string;
    guildId: string;
    enabled: boolean;
    notifyChannelId: string;
    waitingChannelId: string;
    teamRoleId: string;
    notes?: boolean | undefined;
    rating?: boolean | undefined;
    primary?: boolean | undefined;
    channelPrefix?: string | undefined;
    ownChannels?: boolean | undefined;
    ownChannelIds?: string[] | undefined;
    times?: {
        from: string;
        days: number[];
        to: string;
    }[] | undefined;
    music?: {
        enabled?: boolean | undefined;
        openTrack?: string | undefined;
        closedTrack?: string | undefined;
    } | undefined;
}>, {
    id: string;
    name: string;
    guildId: string;
    notes: boolean;
    enabled: boolean;
    notifyChannelId: string;
    rating: boolean;
    primary: boolean;
    waitingChannelId: string;
    teamRoleId: string;
    channelPrefix: string;
    ownChannels: boolean;
    ownChannelIds: string[];
    times: {
        from: string;
        days: number[];
        to: string;
    }[];
    music: {
        enabled: boolean;
        openTrack: string;
        closedTrack: string;
    };
}, {
    id: string;
    name: string;
    guildId: string;
    enabled: boolean;
    notifyChannelId: string;
    waitingChannelId: string;
    teamRoleId: string;
    notes?: boolean | undefined;
    rating?: boolean | undefined;
    primary?: boolean | undefined;
    channelPrefix?: string | undefined;
    ownChannels?: boolean | undefined;
    ownChannelIds?: string[] | undefined;
    times?: {
        from: string;
        days: number[];
        to: string;
    }[] | undefined;
    music?: {
        enabled?: boolean | undefined;
        openTrack?: string | undefined;
        closedTrack?: string | undefined;
    } | undefined;
}>;
export declare const roomsSchema: z.ZodEffects<z.ZodArray<z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    guildId: z.ZodString;
    name: z.ZodString;
    enabled: z.ZodBoolean;
    waitingChannelId: z.ZodString;
    notifyChannelId: z.ZodString;
    teamRoleId: z.ZodString;
    channelPrefix: z.ZodDefault<z.ZodString>;
    notes: z.ZodDefault<z.ZodBoolean>;
    ownChannels: z.ZodDefault<z.ZodBoolean>;
    ownChannelIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    times: z.ZodDefault<z.ZodArray<z.ZodObject<{
        days: z.ZodArray<z.ZodNumber, "many">;
        from: z.ZodString;
        to: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        from: string;
        days: number[];
        to: string;
    }, {
        from: string;
        days: number[];
        to: string;
    }>, "many">>;
    rating: z.ZodDefault<z.ZodBoolean>;
    music: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        openTrack: z.ZodDefault<z.ZodEnum<[string, ...string[]]>>;
        closedTrack: z.ZodDefault<z.ZodEnum<[string, ...string[]]>>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        openTrack: string;
        closedTrack: string;
    }, {
        enabled?: boolean | undefined;
        openTrack?: string | undefined;
        closedTrack?: string | undefined;
    }>>;
    primary: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    guildId: string;
    notes: boolean;
    enabled: boolean;
    notifyChannelId: string;
    rating: boolean;
    primary: boolean;
    waitingChannelId: string;
    teamRoleId: string;
    channelPrefix: string;
    ownChannels: boolean;
    ownChannelIds: string[];
    times: {
        from: string;
        days: number[];
        to: string;
    }[];
    music: {
        enabled: boolean;
        openTrack: string;
        closedTrack: string;
    };
}, {
    id: string;
    name: string;
    guildId: string;
    enabled: boolean;
    notifyChannelId: string;
    waitingChannelId: string;
    teamRoleId: string;
    notes?: boolean | undefined;
    rating?: boolean | undefined;
    primary?: boolean | undefined;
    channelPrefix?: string | undefined;
    ownChannels?: boolean | undefined;
    ownChannelIds?: string[] | undefined;
    times?: {
        from: string;
        days: number[];
        to: string;
    }[] | undefined;
    music?: {
        enabled?: boolean | undefined;
        openTrack?: string | undefined;
        closedTrack?: string | undefined;
    } | undefined;
}>, {
    id: string;
    name: string;
    guildId: string;
    notes: boolean;
    enabled: boolean;
    notifyChannelId: string;
    rating: boolean;
    primary: boolean;
    waitingChannelId: string;
    teamRoleId: string;
    channelPrefix: string;
    ownChannels: boolean;
    ownChannelIds: string[];
    times: {
        from: string;
        days: number[];
        to: string;
    }[];
    music: {
        enabled: boolean;
        openTrack: string;
        closedTrack: string;
    };
}, {
    id: string;
    name: string;
    guildId: string;
    enabled: boolean;
    notifyChannelId: string;
    waitingChannelId: string;
    teamRoleId: string;
    notes?: boolean | undefined;
    rating?: boolean | undefined;
    primary?: boolean | undefined;
    channelPrefix?: string | undefined;
    ownChannels?: boolean | undefined;
    ownChannelIds?: string[] | undefined;
    times?: {
        from: string;
        days: number[];
        to: string;
    }[] | undefined;
    music?: {
        enabled?: boolean | undefined;
        openTrack?: string | undefined;
        closedTrack?: string | undefined;
    } | undefined;
}>, "many">, {
    id: string;
    name: string;
    guildId: string;
    notes: boolean;
    enabled: boolean;
    notifyChannelId: string;
    rating: boolean;
    primary: boolean;
    waitingChannelId: string;
    teamRoleId: string;
    channelPrefix: string;
    ownChannels: boolean;
    ownChannelIds: string[];
    times: {
        from: string;
        days: number[];
        to: string;
    }[];
    music: {
        enabled: boolean;
        openTrack: string;
        closedTrack: string;
    };
}[], {
    id: string;
    name: string;
    guildId: string;
    enabled: boolean;
    notifyChannelId: string;
    waitingChannelId: string;
    teamRoleId: string;
    notes?: boolean | undefined;
    rating?: boolean | undefined;
    primary?: boolean | undefined;
    channelPrefix?: string | undefined;
    ownChannels?: boolean | undefined;
    ownChannelIds?: string[] | undefined;
    times?: {
        from: string;
        days: number[];
        to: string;
    }[] | undefined;
    music?: {
        enabled?: boolean | undefined;
        openTrack?: string | undefined;
        closedTrack?: string | undefined;
    } | undefined;
}[]>;
/** Wer im Discord handelt (Team): Discord-ID, Name, Rollen auf dem Server, Server-Admin? */
export interface Staff {
    discordId: string | null;
    name: string;
    roleIds: string[];
    admin?: boolean;
}
type Case = VoiceSupportCase;
/**
 * Sprach-Support: Das System entscheidet (Räume, Zeiten, Rechte, Status, Texte), der Bot führt die Discord-Seite aus
 * (Meldung posten/ändern, Sprachkanal anlegen, Personen verschieben, DMs).
 */
export declare class VoiceSupportService {
    private readonly prisma;
    private readonly audit;
    private readonly rt;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, rt: RealtimeService, discord: DiscordService);
    /** Dashboard sofort aktualisieren (Liste der Fälle). */
    private changed;
    rooms(guildId?: string | null): Promise<VoiceSupportRoom[]>;
    /** `guildId`: nur die Räume dieses Servers ersetzen (Server-Ansicht), sonst alle. */
    saveRooms(actor: Actor, input: VoiceSupportRoom[], guildId?: string | null): Promise<VoiceSupportRoom[]>;
    private room;
    cases(f: {
        guildId?: string | null;
        status?: string;
    }): Promise<{
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        userId: string;
        guildId: string;
        closedAt: Date | null;
        channelId: string | null;
        closeReason: string | null;
        closedById: string | null;
        closedByName: string | null;
        claimedById: string | null;
        roomId: string;
        roomName: string;
        userName: string;
        claimedByName: string | null;
        claimedAt: Date | null;
        createdChannel: boolean;
        notifyChannelId: string | null;
        notifyMessageId: string | null;
        threadId: string | null;
        messages: number;
        rating: number | null;
    }[]>;
    message(c: Case, room?: VoiceSupportRoom): MessageSpec;
    private edit;
    /** Jemand hat einen Sprachkanal betreten: Warteraum eines Raums → neuer Fall (oder Hinweis „geschlossen“). */
    join(d: {
        guildId: string;
        channelId: string;
        discordId: string;
        userName: string;
    }, now?: Date): Promise<{
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
        message: MessageSpec;
        dm?: undefined;
    }>;
    posted(id: string, messageId: string): Promise<void>;
    /** Jemand hat einen Sprachkanal verlassen: wartender Fall in diesem Warteraum → „Warteraum verlassen“. */
    left(d: {
        guildId: string;
        channelId: string;
        discordId: string;
    }): Promise<{
        edits: {
            channelId: string;
            messageId: string;
            message: MessageSpec;
        }[];
    }>;
    /** Ein Support-Kanal ist leer geworden → Fall schließen (vom Bot angelegte Kanäle werden gelöscht). */
    channelEmpty(channelId: string): Promise<{
        closed: boolean;
    } | {
        edit: {
            channelId: string;
            messageId: string;
            message: MessageSpec;
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
                style: "success" | "danger" | "secondary";
            }[];
        } | null;
        closed: boolean;
    }>;
    private load;
    private assertTeam;
    /** Übernehmen: Status + Infos, damit der Bot den Sprachkanal bereitstellt und die Person verschiebt. */
    claim(id: string, s: Staff): Promise<{
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
            message: MessageSpec;
        } | null;
    }>;
    /** Bot meldet den bereitgestellten Sprachkanal (und Notizen-Thread). */
    channel(id: string, d: {
        channelId: string | null;
        created: boolean;
        threadId: string | null;
    }): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: MessageSpec;
        } | null;
    }>;
    decline(id: string, s: Staff, reason?: string): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: MessageSpec;
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
    /** „Nachricht“: Text vom Team per DM an die Person (auch im Notizen-Thread vermerkt). */
    sendMessage(id: string, s: Staff, text: string): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: MessageSpec;
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
    close(id: string, s: Staff): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: MessageSpec;
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
                style: "success" | "danger" | "secondary";
            }[];
        } | null;
    }>;
    private finish;
    rate(id: string, discordId: string, stars: number): Promise<{
        edit: {
            channelId: string;
            messageId: string;
            message: MessageSpec;
        } | null;
    }>;
    private webStaff;
    private effects;
    webAction(actor: Actor, id: string, a: {
        action: 'claim';
    } | {
        action: 'decline';
        reason?: string;
    } | {
        action: 'message';
        text: string;
    } | {
        action: 'close';
    }): Promise<{
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        userId: string;
        guildId: string;
        closedAt: Date | null;
        channelId: string | null;
        closeReason: string | null;
        closedById: string | null;
        closedByName: string | null;
        claimedById: string | null;
        roomId: string;
        roomName: string;
        userName: string;
        claimedByName: string | null;
        claimedAt: Date | null;
        createdChannel: boolean;
        notifyChannelId: string | null;
        notifyMessageId: string | null;
        threadId: string | null;
        messages: number;
        rating: number | null;
    }>;
}
export {};
