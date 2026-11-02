import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { CalendarController, MeetingsController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { MeetingsService } from './meetings.service';

@Module({ controllers: [CalendarController, MeetingsController], providers: [CalendarService, MeetingsService], exports: [CalendarService, MeetingsService] })
export class CalendarModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly s: CalendarService) {}
  /** Jede Minute Erinnerungen und Abschluss vergangener Termine – nicht in Tests. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('Calendar');
    this.timer = setInterval(() => void this.s.tick().then((r) => { if (r.completed || r.reminded) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message)), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
