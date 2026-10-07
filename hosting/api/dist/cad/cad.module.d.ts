import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ErlcService } from './erlc.service';
/** CAD-Leitstelle + ER:LC-Integration. Der ER:LC-Abruf läuft ausschließlich hier im Backend. */
export declare class CadModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly erlc;
    private timer?;
    private running;
    constructor(erlc: ErlcService);
    /** Planer: jede Sekunde prüfen, welche Server fällig sind (Intervall je Server, Backoff bei Fehlern). Nicht in Tests. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
