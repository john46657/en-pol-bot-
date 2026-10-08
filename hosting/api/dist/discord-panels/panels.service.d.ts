import { type FormPanel, type InfoPanel, type StaffList } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import { JsonListStore } from '../common/json-store';
/** Staff-Listen (Discord-Teamliste nach Rollen) und Formular-Panels – alles im Dashboard eingestellt, der Bot führt aus. */
export declare class PanelsService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly live;
    readonly staff: JsonListStore<StaffList>;
    readonly forms: JsonListStore<FormPanel>;
    readonly infos: JsonListStore<InfoPanel>;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, live: DiscordLiveService);
    private visible;
    staffLists(g: string | null): Promise<{
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
    saveStaff(actor: Actor, doc: StaffList): Promise<{
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
    removeStaff(actor: Actor, id: string): Promise<void>;
    duplicateStaff(actor: Actor, id: string): Promise<{
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
    /** Vorschau mit den Teammitgliedern, die der Bot meldet (Teamrollen). Im Discord rechnet der Bot mit allen Mitgliedern der Rollen. */
    previewStaff(guildId: string | null): Promise<{
        members: {
            id: string;
            name: string;
            roleIds: string[];
        }[];
    }>;
    /** Sofort senden/aktualisieren lassen (der Bot rechnet die Mitglieder selbst). */
    sendStaff(actor: Actor, id: string, mode: 'update' | 'new'): Promise<{
        queued: boolean;
    }>;
    formPanels(g: string | null): Promise<{
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
    saveForm(actor: Actor, doc: FormPanel): Promise<{
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
    removeForm(actor: Actor, id: string): Promise<void>;
    sendForm(actor: Actor, id: string, mode: 'update' | 'new'): Promise<{
        queued: boolean;
    }>;
    infoPanels(g: string | null): Promise<{
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
    saveInfo(actor: Actor, doc: InfoPanel): Promise<{
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
    removeInfo(actor: Actor, id: string): Promise<void>;
    sendInfo(actor: Actor, id: string, mode: 'update' | 'new'): Promise<{
        queued: boolean;
    }>;
    botInfo(id: string): Promise<{
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
    submissions(panelId: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        channelId: string | null;
        guildId: string | null;
        discordId: string;
        messageId: string | null;
        panelId: string;
        userName: string;
        values: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    removeSubmission(actor: Actor, id: string): Promise<void>;
    botStaffLists(): Promise<{
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
    botForm(id: string): Promise<{
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
    /** Einsendung speichern und die fertige Nachricht liefern; bei „einmal je Person“ den alten Ort zum Löschen mitgeben. */
    botSubmit(id: string, d: {
        guildId: string | null;
        discordId: string;
        userName: string;
        avatar?: string;
        values: Record<string, string>;
    }): Promise<{
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
    botSubmissionPosted(id: string, channelId: string, messageId: string): Promise<void>;
}
