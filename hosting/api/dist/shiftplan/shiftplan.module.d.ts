import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ShiftPlanService } from './shiftplan.service';
export declare class ShiftPlanModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private timer?;
    constructor(s: ShiftPlanService);
    /** Jede Minute: vergangene Schichten abschließen, Erinnerungen vor Schichtbeginn – nicht in Tests. Zeiten liegen in der DB → übersteht Neustarts. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
