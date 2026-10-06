/** Erzeugt ein eigenständiges, professionelles HTML-Transcript (keine externen Abhängigkeiten, Bilder eingebettet). */
export interface TranscriptData {
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
    entries: ({
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
