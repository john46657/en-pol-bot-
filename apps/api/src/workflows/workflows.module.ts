import { Logger, Module, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

/** Studio-Workflows. Der Abgleich mit dem Audit-Protokoll läuft alle 5 Sekunden (nicht in Tests; `WORKFLOWS=false` schaltet ab). */
@Module({ controllers: [WorkflowsController], providers: [WorkflowsService], exports: [WorkflowsService] })
export class WorkflowsModule implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly s: WorkflowsService) {}
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.WORKFLOWS === 'false') return;
    const log = new Logger('Workflows');
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.s.tick().catch((e: Error) => log.error(e.message)).finally(() => { this.running = false; });
    }, 5000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
