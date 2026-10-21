import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { SupportTicketsService } from './tickets.service';
import { TicketTranscriptService } from './transcript.service';
export declare class SupportTicketsModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private readonly transcripts;
    private timers;
    constructor(s: SupportTicketsService, transcripts: TicketTranscriptService);
    /**
     * Automatik (Auto-Schließen, Löschen, befristeter Zugriff, SLA, Eskalation) jede Minute; Transkript-Aufträge alle 15 Sekunden
     * (nach einem Neustart werden offene und abgebrochene Aufträge dabei automatisch fortgesetzt) – nicht in Tests.
     */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
