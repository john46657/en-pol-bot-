import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { CalendarService } from './calendar.service';
export declare class CalendarModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private timer?;
    constructor(s: CalendarService);
    /** Jede Minute Erinnerungen und Abschluss vergangener Termine – nicht in Tests. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
