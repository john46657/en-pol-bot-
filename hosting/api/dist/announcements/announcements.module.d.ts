import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
export declare class AnnouncementsModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private timer?;
    constructor(s: AnnouncementsService);
    /** Jede Minute geplante/wiederkehrende Ankündigungen veröffentlichen – nicht in Tests. Zeitpunkte liegen in der DB → übersteht Neustarts. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
