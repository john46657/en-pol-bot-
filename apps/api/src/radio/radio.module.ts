import { Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RadioWhitelistBotController, RadioWhitelistController } from './radio.controller';
import { RadioWhitelistService } from './radio-whitelist.service';

/** Funk-Whitelist (externer Funkdienst). Jede Minute: abgelaufene Freigaben und Sperrfristen speichern. */
@Module({ controllers: [RadioWhitelistController, RadioWhitelistBotController], providers: [RadioWhitelistService], exports: [RadioWhitelistService] })
export class RadioModule implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly s: RadioWhitelistService) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return; // Tests rufen tick() gezielt auf
    const log = new Logger('RadioWhitelist');
    const run = () => void this.s.tick().then((r) => { if (r.expired || r.unsuspended) log.log(JSON.stringify(r)); }).catch((e: Error) => log.error(e.message));
    this.timer = setInterval(run, 60_000);
    this.timer.unref();
    setTimeout(run, 5_000).unref(); // nach einem Neustart verpasste Abläufe sofort nachholen
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
