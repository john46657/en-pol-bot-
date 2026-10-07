import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { DutyService } from './duty.service';
export declare class DutyModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private timer?;
    constructor(s: DutyService);
    /** Inaktivitäts-Erinnerung jede Minute prüfen – nicht in Tests. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
