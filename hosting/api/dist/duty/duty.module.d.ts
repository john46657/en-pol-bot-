import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { DutyService } from './duty.service';
import { WeeklyResetService } from './weekly-reset';
export declare class DutyModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private readonly week;
    private timer?;
    private weekTimer?;
    constructor(s: DutyService, week: WeeklyResetService);
    /** Inaktivitäts-Erinnerung jede Minute prüfen; Wochen-Reset beim Start (verpasste nachholen) und alle 30 s – nicht in Tests. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
