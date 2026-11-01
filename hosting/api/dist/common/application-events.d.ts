/** Neu eingereichte Bewerbung (Polizei = POLICE, Einheit/Qualifikation = QUALIFICATION) – Dashboard/Web und Discord. */
export interface SubmittedApplication {
    kind: 'POLICE' | 'QUALIFICATION';
    id: string;
    number: string;
    guildId: string | null;
    /** Discord-Kanal, in dem die Bewerbung gepostet wurde (für die Meldung „KI-Analyse fertig“) */
    channelKey: 'applications' | 'qualifications';
    channelId?: string | null;
}
type Handler = (a: SubmittedApplication) => void;
/**
 * Entkoppelt das Einreichen einer Bewerbung von Folgeaufgaben (z. B. automatische KI-Prüfung), ohne Modul-Abhängigkeit im Kreis.
 * Die Folgeaufgabe läuft im Hintergrund: Fehler dort stoppen oder verzögern das Speichern der Bewerbung nie.
 */
export declare const applicationEvents: {
    handlers: Handler[];
    on(h: Handler): () => void;
    submitted(a: SubmittedApplication): void;
};
export {};
