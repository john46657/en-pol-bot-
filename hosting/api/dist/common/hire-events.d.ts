import type { Actor } from '../audit/audit.service';
/** Angenommene Bewerbung (Polizei = kind 'police', Qualifikation = Name der Einheit). */
export interface AcceptedApplication {
    applicationId: string;
    number: string;
    kind: string;
    discordId: string | null;
    name: string;
    robloxUsername?: string | null;
    robloxUserId?: string | null; /** Discord-Server, auf dem die Bewerbung gestartet wurde */
    guildId?: string | null;
}
type Handler = (actor: Actor, a: AcceptedApplication) => Promise<void>;
/**
 * Entkoppelt Bewerbungen vom Personal-/Dienstnummern-System (keine Modul-Abhängigkeit im Kreis):
 * das Personalmodul meldet sich beim Start an, Bewerbungen melden Annahmen. Fehler stoppen die Entscheidung nie.
 * Personalakte und Dienstnummer entstehen auf dem Server der Bewerbung (sonst auf dem gewählten Server).
 */
export declare const hireEvents: {
    handler: Handler | null;
    accepted(actor: Actor, a: AcceptedApplication): Promise<void>;
};
export {};
