import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { RemindersService } from './reminders.service';
export declare class RemindersModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private timer?;
    constructor(s: RemindersService);
    /** Fällige Erinnerungen alle 15 s übergeben (beim Start sofort: verpasste nachholen) – nicht in Tests. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
