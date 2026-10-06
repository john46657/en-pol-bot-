import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { SupportTicketsService } from './tickets.service';
export declare class SupportTicketsModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private timer?;
    constructor(s: SupportTicketsService);
    /** Automatik (Auto-Schließen, Löschen, befristeter Zugriff) jede Minute – nicht in Tests. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
