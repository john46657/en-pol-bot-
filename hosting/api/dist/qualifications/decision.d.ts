import type { AppSettings } from './qualifications.config';
/** Rollen bei der Entscheidung: angenommen → Annahme-Rollen (+ Rolle der Einheit, Rollen-Auswahl), abgelehnt → Ablehnungs-Rollen; „ausstehend“-Rollen fallen weg. */
export declare function decisionRoles(s: AppSettings, accepted: boolean, extra?: (string | null | undefined)[]): {
    add: string[];
    remove: string[];
};
/** Rollen beim Einreichen: „ausstehend“ geben, „beim Einreichen entfernen“ nehmen. */
export declare const submitRoles: (s: AppSettings) => {
    add: string[];
    remove: string[];
};
/** Entscheidungs-DM aus dem eingestellten Text (Variablen wie bei Appy). */
export declare function decisionMessage(s: AppSettings, accepted: boolean, v: {
    applicationName: string;
    number: string;
    decider: string;
    applicantId: string | null;
    reason?: string | null;
}): string;
/** Wartezeit (Minuten) bis zur nächsten Bewerbung – `null`, wenn keine Wartezeit mehr. */
export declare function cooldownLeft(s: AppSettings, last: Date | null | undefined, now?: number): number | null;
