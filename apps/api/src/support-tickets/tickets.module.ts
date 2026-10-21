import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { BotSupportTicketsController, SupportTicketsController } from './tickets.controller';
import { SupportTicketsService } from './tickets.service';
import { TicketConfigService } from './config.service';
import { TicketTranscriptService } from './transcript.service';

@Module({ controllers: [SupportTicketsController, BotSupportTicketsController], providers: [SupportTicketsService, TicketConfigService, TicketTranscriptService], exports: [SupportTicketsService] })
export class SupportTicketsModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timers: NodeJS.Timeout[] = [];
  constructor(private readonly s: SupportTicketsService, private readonly transcripts: TicketTranscriptService) {}
  /**
   * Automatik (Auto-Schließen, Löschen, befristeter Zugriff, SLA, Eskalation) jede Minute; Transkript-Aufträge alle 15 Sekunden
   * (nach einem Neustart werden offene und abgebrochene Aufträge dabei automatisch fortgesetzt) – nicht in Tests.
   */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('TicketAutomation');
    this.timers.push(setInterval(() => void this.s.runAutomation().then((r) => { if (r.closed || r.deleted || r.warned || r.expired || r.reminded || r.escalated) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message)), 60_000));
    this.timers.push(setInterval(() => void this.transcripts.processDue().then((r) => { if (r.done || r.failed) log.log(`transcripts ${JSON.stringify(r)}`); }).catch((e: Error) => log.error(`transcripts: ${e.message}`)), 15_000));
    for (const t of this.timers) t.unref();
  }
  onModuleDestroy() { for (const t of this.timers) clearInterval(t); }
}
