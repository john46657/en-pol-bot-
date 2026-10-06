import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { NotifyService } from '../notifications/notify.service';
/** Ein Teammitglied, wie der Bot es auf Discord sieht (nur Team-Informationen, keine Voice-Daten). */
export interface LiveMember {
    id: string;
    guildId: string;
    username: string;
    displayName: string;
    avatar: string | null;
    status: 'online' | 'idle' | 'dnd' | 'offline' | 'unknown';
    roleIds: string[];
    joinedAt: string | null;
}
/** Voice-Channel mit den Personen darin (getrennt von der Teamliste gehalten). */
export interface LiveVoiceChannel {
    id: string;
    guildId: string;
    name: string;
    parentId: string | null;
    parentName: string | null;
    position: number;
    members: {
        id: string;
        displayName: string;
        avatar: string | null;
        selfMute: boolean;
        selfDeaf: boolean;
        serverMute: boolean;
        serverDeaf: boolean;
        video: boolean;
        streaming: boolean;
        since: string | null;
    }[];
}
export interface TeamChange {
    at: string;
    guildId: string;
    discordId: string;
    name: string;
    kind: 'joined' | 'left' | 'roles' | 'name' | 'avatar' | 'status';
    detail?: string;
}
/**
 * Aktueller Discord-Stand, den der Bot meldet (Teammitglieder ≥ alle 60 s, Voice bei jeder Änderung).
 * Bewusst nur im Speicher: es sind flüchtige Live-Daten. Änderungen an Teammitgliedern werden erkannt
 * und als Team-Aktivität bereitgestellt; Teamliste und Voice werden getrennt veröffentlicht.
 */
export declare class DiscordLiveService {
    private readonly prisma;
    private readonly rt;
    private readonly notify;
    private members;
    private membersAt;
    private voice;
    private voiceAt;
    private changes;
    constructor(prisma: PrismaService, rt: RealtimeService, notify: NotifyService);
    /** Welche Discord-Rollen machen jemanden zum Teammitglied? Zugangsrollen + mit Dashboard-Rollen verknüpfte Rollen. */
    teamRoleIds(): Promise<string[]>;
    setMembers(list: LiveMember[]): void;
    setVoice(channels: LiveVoiceChannel[]): void;
    getMembers(): {
        members: LiveMember[];
        updatedAt: Date | null;
    };
    getVoice(): {
        channels: LiveVoiceChannel[];
        updatedAt: Date | null;
    };
    getChanges(limit?: number, guildId?: string | null): TeamChange[];
}
