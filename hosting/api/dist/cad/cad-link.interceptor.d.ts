import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CadConfigService } from './cad-config.service';
/**
 * CAD-Querverbindung als ausdrücklich eingerichtete Ausnahme der Server-Trennung: Ein Discord-Befehl von einem anderen
 * Server (z. B. SEK/K9) arbeitet NUR DANN im Bereich der Leitstelle, wenn
 *  - dieser Server die Leitstelle als Heimat-Server eingestellt hat (CAD → Einstellungen) UND
 *  - die Leitstelle eine aktive Verbindung zu diesem Server eingerichtet hat (CadServerLink).
 * Welche Aktionen erlaubt sind, prüft danach weiterhin `CadService.assertCrossServer` (Aktion + Rolle).
 * Ohne Verbindung bleibt jeder Server in seiner eigenen Leitstelle. Dashboard-Anfragen werden nie umgeleitet.
 */
export declare class CadLinkInterceptor implements NestInterceptor {
    private readonly prisma;
    private readonly cfg;
    constructor(prisma: PrismaService, cfg: CadConfigService);
    intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown>;
    /** Leitstelle, in deren Bereich dieser Befehl laufen darf (oder null = eigener Server). */
    private target;
}
