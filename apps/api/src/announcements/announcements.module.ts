import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({ controllers: [AnnouncementsController], providers: [AnnouncementsService], exports: [AnnouncementsService] })
export class AnnouncementsModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly s: AnnouncementsService) {}
  /** Jede Minute geplante/wiederkehrende Ankündigungen veröffentlichen – nicht in Tests. Zeitpunkte liegen in der DB → übersteht Neustarts. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('Announcements');
    this.timer = setInterval(() => void this.s.tick().then((r) => { if (r.published) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message)), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
