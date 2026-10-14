import { z } from 'zod';
import { type FormPanel, type StaffList, type InfoPanel } from '@enrp/shared';
import { PanelsService } from './panels.service';
import type { Actor } from '../audit/audit.service';
declare const mode: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["update", "new"]>>;
}, "strip", z.ZodTypeAny, {
    mode: "update" | "new";
}, {
    mode?: "update" | "new" | undefined;
}>;
/** Discord-Nachrichten: Staff-Listen (Team) und Formular-Panels (Einstellungen). */
export declare class PanelsController {
    private readonly s;
    constructor(s: PanelsService);
    staff(): Promise<{
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        title: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        intro: string;
        color: string;
        sections: {
            label: string;
            roleId: string;
            divider: boolean;
        }[];
        emptyText: string;
        dividerText: string;
        mention: boolean;
        onlyHighest: boolean;
        bullet: string;
        footer: string;
        timestamp: boolean;
        autoUpdate: boolean;
        image: string;
    }[]>;
    saveStaff(a: Actor, id: string, b: StaffList): Promise<{
        title: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        intro: string;
        color: string;
        sections: {
            label: string;
            roleId: string;
            divider: boolean;
        }[];
        emptyText: string;
        dividerText: string;
        mention: boolean;
        onlyHighest: boolean;
        bullet: string;
        footer: string;
        timestamp: boolean;
        autoUpdate: boolean;
        image: string;
    }>;
    removeStaff(a: Actor, id: string): Promise<void>;
    dupStaff(a: Actor, id: string): Promise<{
        title: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        intro: string;
        color: string;
        sections: {
            label: string;
            roleId: string;
            divider: boolean;
        }[];
        emptyText: string;
        dividerText: string;
        mention: boolean;
        onlyHighest: boolean;
        bullet: string;
        footer: string;
        timestamp: boolean;
        autoUpdate: boolean;
        image: string;
    }>;
    preview(): Promise<{
        members: {
            id: string;
            name: string;
            roleIds: string[];
        }[];
    }>;
    sendStaff(a: Actor, id: string, b: z.infer<typeof mode>): Promise<{
        queued: boolean;
    }>;
    forms(): Promise<{
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        submissions: number;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        active: boolean;
        panelTitle: string;
        panelText: string;
        panelColor: string;
        panelImage: string;
        buttonLabel: string;
        buttonEmoji: string;
        buttonStyle: "danger" | "secondary" | "success" | "primary";
        modalTitle: string;
        fields: {
            label: string;
            required: boolean;
            maxLength: number;
            long: boolean;
            id: string;
            placeholder: string;
        }[];
        targetChannelId: string | null;
        template: string;
        asEmbed: boolean;
        embedTitle: string;
        embedColor: string;
        asUser: boolean;
        reactions: string[];
        pingRoleIds: string[];
        onePerUser: boolean;
        confirmText: string;
        grantRoleIds: string[];
    }[]>;
    saveForm(a: Actor, id: string, b: FormPanel): Promise<{
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        active: boolean;
        panelTitle: string;
        panelText: string;
        panelColor: string;
        panelImage: string;
        buttonLabel: string;
        buttonEmoji: string;
        buttonStyle: "danger" | "secondary" | "success" | "primary";
        modalTitle: string;
        fields: {
            label: string;
            required: boolean;
            maxLength: number;
            long: boolean;
            id: string;
            placeholder: string;
        }[];
        targetChannelId: string | null;
        template: string;
        asEmbed: boolean;
        embedTitle: string;
        embedColor: string;
        asUser: boolean;
        reactions: string[];
        pingRoleIds: string[];
        onePerUser: boolean;
        confirmText: string;
        grantRoleIds: string[];
    }>;
    removeForm(a: Actor, id: string): Promise<void>;
    sendForm(a: Actor, id: string, b: z.infer<typeof mode>): Promise<{
        queued: boolean;
    }>;
    infos(): Promise<{
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        options: {
            label: string;
            text: string;
            title: string;
            description: string;
            id: string;
            color: string;
            image: string;
            emoji: string;
        }[];
        text: string;
        title: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        footer: string;
        image: string;
        placeholder: string;
    }[]>;
    saveInfo(a: Actor, id: string, b: InfoPanel): Promise<{
        options: {
            label: string;
            text: string;
            title: string;
            description: string;
            id: string;
            color: string;
            image: string;
            emoji: string;
        }[];
        text: string;
        title: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        footer: string;
        image: string;
        placeholder: string;
    }>;
    removeInfo(a: Actor, id: string): Promise<void>;
    sendInfo(a: Actor, id: string, b: z.infer<typeof mode>): Promise<{
        queued: boolean;
    }>;
    subs(id: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        discordId: string;
        updatedAt: Date;
        guildId: string | null;
        values: import("@prisma/client/runtime/library").JsonValue;
        channelId: string | null;
        messageId: string | null;
        userName: string;
        panelId: string;
    }[]>;
    removeSub(a: Actor, id: string): Promise<void>;
}
declare const submit: z.ZodObject<{
    guildId: z.ZodNullable<z.ZodString>;
    discordId: z.ZodString;
    userName: z.ZodString;
    avatar: z.ZodOptional<z.ZodString>;
    values: z.ZodRecord<z.ZodString, z.ZodString>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    guildId: string | null;
    values: Record<string, string>;
    userName: string;
    avatar?: string | undefined;
}, {
    discordId: string;
    guildId: string | null;
    values: Record<string, string>;
    userName: string;
    avatar?: string | undefined;
}>;
export declare class BotPanelsController {
    private readonly s;
    constructor(s: PanelsService);
    staff(): Promise<{
        title: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        intro: string;
        color: string;
        sections: {
            label: string;
            roleId: string;
            divider: boolean;
        }[];
        emptyText: string;
        dividerText: string;
        mention: boolean;
        onlyHighest: boolean;
        bullet: string;
        footer: string;
        timestamp: boolean;
        autoUpdate: boolean;
        image: string;
    }[]>;
    info(id: string): Promise<{
        options: {
            label: string;
            text: string;
            title: string;
            description: string;
            id: string;
            color: string;
            image: string;
            emoji: string;
        }[];
        text: string;
        title: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        footer: string;
        image: string;
        placeholder: string;
    }>;
    form(id: string): Promise<{
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        active: boolean;
        panelTitle: string;
        panelText: string;
        panelColor: string;
        panelImage: string;
        buttonLabel: string;
        buttonEmoji: string;
        buttonStyle: "danger" | "secondary" | "success" | "primary";
        modalTitle: string;
        fields: {
            label: string;
            required: boolean;
            maxLength: number;
            long: boolean;
            id: string;
            placeholder: string;
        }[];
        targetChannelId: string | null;
        template: string;
        asEmbed: boolean;
        embedTitle: string;
        embedColor: string;
        asUser: boolean;
        reactions: string[];
        pingRoleIds: string[];
        onePerUser: boolean;
        confirmText: string;
        grantRoleIds: string[];
    }>;
    submit(id: string, b: z.infer<typeof submit>): Promise<{
        submissionId: string;
        channelId: string | null;
        previous: {
            channelId: string;
            messageId: string;
        } | null;
        message: import("@enrp/shared").MessageSpec;
        asUser: boolean;
        confirmText: string;
        grantRoleIds: string[];
        modal: {
            title: string;
            fields: {
                label: string;
                required: boolean;
                maxLength: number;
                long: boolean;
                id: string;
                placeholder: string;
            }[];
        };
    }>;
    posted(id: string, b: {
        channelId: string;
        messageId: string;
    }): Promise<void>;
}
export {};
