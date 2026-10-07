import { type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { DutyService } from './duty.service';
/**
 * Jede Aktion (alles außer reinem Lesen) zählt als Aktivität für die Inaktivitäts-Erinnerung – im Dashboard/MDT wie per Discord-Befehl.
 * Reines Lesen nicht, weil das Dashboard sich alle paar Sekunden selbst aktualisiert; dafür meldet es echte Klicks/Eingaben separat.
 */
export declare class ActivityInterceptor implements NestInterceptor {
    private readonly duty;
    constructor(duty: DutyService);
    intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown>;
}
