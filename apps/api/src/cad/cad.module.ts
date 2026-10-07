import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { CadController, ErlcController } from './cad.controller';
import { CadService } from './cad.service';
import { CadConfigService } from './cad-config.service';
import { CadNotifyService } from './cad-notify.service';
import { ErlcService } from './erlc.service';
import { ErlcSyncService } from './erlc-sync.service';

/** CAD-Leitstelle + ER:LC-Integration. Der ER:LC-Abruf läuft ausschließlich hier im Backend. */
@Module({
  imports: [MediaModule],
  controllers: [CadController, ErlcController],
  providers: [CadService, CadConfigService, CadNotifyService, ErlcService, ErlcSyncService],
  exports: [CadService, CadConfigService, ErlcService],
})
export class CadModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly erlc: ErlcService) {}
  /** Planer: jede Sekunde prüfen, welche Server fällig sind (Intervall je Server, Backoff bei Fehlern). Nicht in Tests. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.ERLC_POLLING === 'false') return;
    const log = new Logger('ERLC');
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.erlc.tick().catch((e: Error) => log.error(e.message)).finally(() => { this.running = false; });
    }, 1000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
