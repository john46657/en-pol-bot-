import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { CadService } from './cad.service';
import { ErlcService } from './erlc.service';
/** CAD-Leitstelle + ER:LC-Integration. Der ER:LC-Abruf läuft ausschließlich hier im Backend. */
export declare class CadModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly erlc;
    private readonly cad;
    private timer?;
    private purgeTimer?;
    private running;
    constructor(erlc: ErlcService, cad: CadService);
    /** Planer: jede Sekunde prüfen, welche Server fällig sind (Intervall je Server, Backoff bei Fehlern). Nicht in Tests. */
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
