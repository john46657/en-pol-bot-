import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
/** Studio-Workflows. Der Abgleich mit dem Audit-Protokoll läuft alle 5 Sekunden (nicht in Tests; `WORKFLOWS=false` schaltet ab). */
export declare class WorkflowsModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly s;
    private timer?;
    private running;
    constructor(s: WorkflowsService);
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
