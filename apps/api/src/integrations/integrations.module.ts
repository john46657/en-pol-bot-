import { Global, Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { MonitorService } from './monitor.service';

/** Technische Überwachung (global, damit ER:LC-Abruf und Backups Störungen melden können, ohne Modul-Zyklen). */
@Global()
@Module({ controllers: [IntegrationsController], providers: [MonitorService], exports: [MonitorService] })
export class IntegrationsModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly monitor: MonitorService) {}
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('Monitor');
    this.timer = setInterval(() => void this.monitor.sweep().catch((e: Error) => log.warn(e.message)), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
