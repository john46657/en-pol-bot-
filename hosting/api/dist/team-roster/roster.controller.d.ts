import { z } from 'zod';
import { RosterService } from './roster.service';
import type { Actor } from '../audit/audit.service';
declare const limitQ: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
export declare class RosterController {
    private readonly r;
    constructor(r: RosterService);
    /** Teamliste (ohne Voice-Daten). Die Oberfläche lädt sie mindestens alle 60 Sekunden neu. */
    roster(): Promise<{
        members: import("./roster.service").RosterMember[];
        structure: import("./roster.service").TeamStructure;
        discordUpdatedAt: Date | null;
        generatedAt: Date;
    }>;
    /** „Jetzt aktualisieren“: Bot meldet sofort neu; Antwort ist der aktuelle Stand. */
    refresh(): Promise<{
        members: import("./roster.service").RosterMember[];
        structure: import("./roster.service").TeamStructure;
        discordUpdatedAt: Date | null;
        generatedAt: Date;
    }>;
    profile(a: Actor, k: string): Promise<{
        discordId: string | null;
        discordRoles: string[];
        joinedAt: string | null;
        personnelId: string | null;
        detailed: boolean;
        key: string;
        userId: string | null;
        name: string;
        username: string | null;
        avatar: string | null;
        team: string | null;
        rank: string | null;
        office: string | null;
        serviceNumber: string | null;
        callsign: string | null;
        status: import("../discord/discord-live.service").LiveMember["status"];
    }>;
    structure(): Promise<import("./roster.service").TeamStructure>;
    activity(q: z.infer<typeof limitQ>): import("../discord/discord-live.service").TeamChange[];
    /** Aktive Voice-Channels – eigener Bereich mit eigenem Sichtbarkeitsrecht. */
    voice(): {
        channels: import("../discord/discord-live.service").LiveVoiceChannel[];
        updatedAt: Date | null;
    };
}
export {};
