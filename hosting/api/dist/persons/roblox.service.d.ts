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
    /**
     * Roblox-Benutzername prüfen (Bewerbungsfrage „Roblox User“): gefunden → richtige Schreibweise + ID,
     * gibt es nicht → null, Roblox nicht erreichbar (oder Abfrage abgeschaltet) → undefined.
     */
    verifyName(name: string): Promise<{
        id: string;
        name: string;
    } | null | undefined>;
    /** Für die öffentliche Bewerbung: nur Name, Anzeigename und Bild (keine internen Daten wie Akten). */
    publicLookup(input: string): Promise<{
        id: string;
        name: string;
        displayName: string;
        avatarUrl: string | null;
    } | null>;
    /** Aktuelle Profilbeschreibung („Über mich“) – ohne Zwischenspeicher (Verifizierung). null = nicht erreichbar. */
    description(id: string): Promise<string | null>;
    /** Gruppen-Ränge eines Kontos (Gruppen-ID → Rang 0–255) für Rollen-Bindungen; 1 Minute zwischengespeichert. */
    private ranks;
    groupRanks(id: string): Promise<Record<string, number>>;
    private fetchProfile;
    private get;
}
