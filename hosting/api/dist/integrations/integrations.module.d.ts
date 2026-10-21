import { type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { MonitorService } from './monitor.service';
/** Technische Überwachung (global, damit ER:LC-Abruf und Backups Störungen melden können, ohne Modul-Zyklen). */
export declare class IntegrationsModule implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly monitor;
    private timer?;
    constructor(monitor: MonitorService);
    onApplicationBootstrap(): void;
    onModuleDestroy(): void;
}
