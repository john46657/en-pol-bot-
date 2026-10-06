import { PrismaService } from '../prisma/prisma.service';
export interface RobloxProfile {
    id: string;
    name: string;
    displayName: string;
    description: string;
    created: string | null;
    isBanned: boolean;
    avatarUrl: string | null;
    profileUrl: string;
    /** Vorhandene Akte zu diesem Roblox-Konto (per ID, sonst per Name). */
    person: {
        id: string;
        robloxUsername: string;
    } | null;
}
/**
 * Roblox-Konto nachschlagen – per Benutzername oder Roblox-ID – über die öffentliche Roblox-API (kein Token).
 * Antworten werden 10 Minuten zwischengespeichert; Fehler/Timeouts → null (die normale Suche läuft weiter).
 */
export declare class RobloxService {
    private readonly prisma;
    private cache;
    constructor(prisma: PrismaService);
    /** Gültige Eingabe? (Roblox-Name 3–20 Zeichen aus Buchstaben/Ziffern/_ oder eine Roblox-ID; auch Profil-Links) */
    static parse(input: string): {
        id?: string;
        name?: string;
    } | null;
    lookup(input: string): Promise<RobloxProfile | null>;
    private fetchProfile;
    private get;
}
