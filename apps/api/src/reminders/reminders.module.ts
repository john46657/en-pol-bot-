import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { BotRemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({ controllers: [BotRemindersController], providers: [RemindersService], exports: [RemindersService] })
export class RemindersModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly s: RemindersService) {}
  /** Fällige Erinnerungen alle 15 s übergeben (beim Start sofort: verpasste nachholen) – nicht in Tests. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    const log = new Logger('Reminders');
    const run = () => void this.s.tick().then((r) => { if (r.sent) log.log(`${r.sent} Erinnerung(en) übergeben`); }).catch((e: Error) => log.error(e.message));
    setTimeout(run, 5_000).unref();
    this.timer = setInterval(run, 15_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
