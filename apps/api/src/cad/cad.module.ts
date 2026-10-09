import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { CadController, ErlcController } from './cad.controller';
import { CadService } from './cad.service';
import { CadTabletService } from './cad-tablet.service';
import { CadConfigService } from './cad-config.service';
import { CadNotifyService } from './cad-notify.service';
import { CadHandoverService } from './cad-handover.service';
import { CadStatsService } from './cad-stats.service';
import { ErlcService } from './erlc.service';
import { ErlcSyncService } from './erlc-sync.service';

/** CAD-Leitstelle + ER:LC-Integration. Der ER:LC-Abruf läuft ausschließlich hier im Backend. */
@Module({
  imports: [MediaModule],
  controllers: [CadController, ErlcController],
  providers: [CadService, CadTabletService, CadConfigService, CadNotifyService, CadHandoverService, CadStatsService, ErlcService, ErlcSyncService],
  exports: [CadService, CadConfigService, ErlcService],
})
export class CadModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private purgeTimer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly erlc: ErlcService, private readonly cad: CadService) {}
  /** Planer: jede Sekunde prüfen, welche Server fällig sind (Intervall je Server, Backoff bei Fehlern). Nicht in Tests. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    // Beendete Einsätze nach einem Tag löschen (stündlich prüfen)
    const purgeLog = new Logger('CAD');
    const purge = () => void this.cad.purgeClosedIncidents().then((n) => { if (n) purgeLog.log(`${n} beendete Einsätze gelöscht`); }).catch((e: Error) => purgeLog.error(e.message));
    purge();
    this.purgeTimer = setInterval(purge, 60 * 60_000);
    this.purgeTimer.unref();
    if (process.env.ERLC_POLLING === 'false') return;
    const log = new Logger('ERLC');
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.erlc.tick().catch((e: Error) => log.error(e.message)).finally(() => { this.running = false; });
    }, 1000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); if (this.purgeTimer) clearInterval(this.purgeTimer); }
}
