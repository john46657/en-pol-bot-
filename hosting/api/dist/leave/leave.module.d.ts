import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { LeaveService } from './leave.service';
export declare class LeaveModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private timer?;
    constructor(s: LeaveService);
    /** Beginn/Ende der Abmeldungen jede Minute prüfen (Rolle vergeben/entfernen) – nicht in Tests. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
