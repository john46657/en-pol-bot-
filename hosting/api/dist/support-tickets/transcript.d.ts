/** Erzeugt ein eigenständiges, professionelles HTML-Transcript (keine externen Abhängigkeiten, Bilder eingebettet). */
export interface TranscriptData {
    /** dauerhafte Ticket-ID (EMD-000123), Betreff, Abteilung, Version und SHA-256 der strukturierten Daten */
    ref?: string;
    subject?: string | null;
    department?: string | null;
    version?: number;
    sha256?: string;
    number: string;
    name: string;
    category: string;
    status: string;
    priority: string;
    creator: {
        id: string;
        name: string;
    };
    claimers: {
        id: string;
        name: string;
    }[];
    participants: string[];
    createdAt: Date;
    closedAt: Date | null;
    closedBy: string | null;
    closeReason: string | null;
    generatedAt: Date;
    timezone: string;
    answers: {
        label: string;
        value: string;
    }[];
    /** Team-Fassung: interne Notizen sind enthalten (nie in der Fassung für den Ersteller) */
    staffView?: boolean;
    closeAnswers?: {
        label: string;
        value: string;
    }[];
    rating?: {
        stars: number;
        scale: number;
        comment: string | null;
        answers: {
            label: string;
            value: string;
        }[];
    } | null;
    /** Übernahmen, Weiterleitungen, Zuweisungen in zeitlicher Reihenfolge */
    history?: {
        at: Date;
        text: string;
    }[];
    entries: ({
        kind: 'note';
        at: Date;
        author: string;
        text: string;
    } | {
        kind: 'message';
        at: Date;
        author: string;
        authorId: string;
        avatar?: string | null;
        staff: boolean;
        bot: boolean;
        content: string;
        attachments: {
            name: string;
            size: number;
            contentType?: string;
            dataUri?: string | null;
            href?: string | null;
        }[];
        embeds: {
            title?: string;
            description?: string;
        }[];
    } | {
        kind: 'event';
        at: Date;
        text: string;
    })[];
}
export declare function renderTranscript(d: TranscriptData): string;
/** Reiner Text-Export (gleicher Inhalt wie die HTML-Ansicht, ohne eingebettete Bilder). */
export declare function renderTranscriptText(d: TranscriptData): string;
