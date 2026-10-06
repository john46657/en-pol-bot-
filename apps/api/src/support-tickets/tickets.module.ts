import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { BotSupportTicketsController, SupportTicketsController } from './tickets.controller';
import { SupportTicketsService } from './tickets.service';
import { TicketConfigService } from './config.service';

@Module({ controllers: [SupportTicketsController, BotSupportTicketsController], providers: [SupportTicketsService, TicketConfigService], exports: [SupportTicketsService] })
export class SupportTicketsModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly s: SupportTicketsService) {}
  /** Automatik (Auto-Schließen, Löschen, befristeter Zugriff) jede Minute – nicht in Tests. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('TicketAutomation');
    this.timer = setInterval(() => void this.s.runAutomation().then((r) => { if (r.closed || r.deleted || r.warned || r.expired) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message)), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
