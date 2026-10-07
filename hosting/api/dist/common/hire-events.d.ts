import type { Actor } from '../audit/audit.service';
/** Angenommene Bewerbung (Polizei = kind 'police', Qualifikation = Name der Einheit). */
export interface AcceptedApplication {
    applicationId: string;
    number: string;
    kind: string;
    discordId: string | null;
    name: string;
    robloxUsername?: string | null;
    robloxUserId?: string | null;
}
type Handler = (actor: Actor, a: AcceptedApplication) => Promise<void>;
/**
 * Entkoppelt Bewerbungen vom Personal-/Dienstnummern-System (keine Modul-Abhängigkeit im Kreis):
 * das Personalmodul meldet sich beim Start an, Bewerbungen melden Annahmen. Fehler stoppen die Entscheidung nie.
 */
export declare const hireEvents: {
    handler: Handler | null;
    accepted(actor: Actor, a: AcceptedApplication): Promise<void>;
};
export {};
